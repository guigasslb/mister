"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirCapacidade, type ContextoMembro } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { NOME_QUADRO_PLANO_JOGO } from "@/lib/schemas/modeloJogo";
import {
  situacaoJogoSchema,
  atualizarSituacaoJogoSchema,
  filtroSituacoesSchema,
  categoriaSituacaoSchema,
  atualizarCategoriaSituacaoSchema,
  importarSituacaoSchema,
  quadroSituacaoSchema,
  guardarComoNovaSituacaoSchema,
  duplicarQuadroSituacaoSchema,
} from "@/lib/schemas/situacaoJogo";
import {
  Prisma,
  type CategoriaSituacaoJogo,
  type Escalao,
  type QuadroTatico,
  type FormatoJogo,
} from "@prisma/client";
import { z } from "zod";

// Situações de jogo — biblioteca do Modelo de jogo (bíblia §24).
// Acesso (RN-SJ-1/RN-SJ-12): exigirCapacidade("MODELO_JOGO_GERIR", escalaoId),
// também para leitura. Sem época.

const CAP = "MODELO_JOGO_GERIR" as const;
const PATH = "/modelo-jogo";
const PATH_JOGOS = "/jogos";

const MSG_NOME_SITUACAO_DUPLICADO = "Já existe uma situação com este nome neste escalão.";
const MSG_NOME_CATEGORIA_DUPLICADO = "Já existe uma categoria com este nome neste escalão.";
const MSG_NAO_E_SITUACAO = "Este quadro não é uma situação de jogo.";
const MSG_NOME_QUADRO_DUPLICADO = "Já existe um quadro com este nome neste jogo.";
const MSG_CATEGORIA_FORA_ESCALAO = "Categoria não encontrada neste escalão.";
const MSG_JA_IMPORTADA = "Esta situação já foi importada para este jogo.";

function msgCategoriaEmUso(n: number): string {
  return `Esta categoria está associada a ${n} situação(ões) e não pode ser apagada.`;
}

const SELECT_RESUMO = {
  id: true,
  nome: true,
  descricao: true,
  diagrama: true,
  escalaoId: true,
  categoriaId: true,
  atualizadoEm: true,
  escalao: { select: { id: true, nome: true } },
  categoria: { select: { id: true, nome: true } },
} satisfies Prisma.SituacaoJogoSelect;

export type SituacaoJogoResumo = Prisma.SituacaoJogoGetPayload<{
  select: typeof SELECT_RESUMO;
}>;

const idSchema = z.string().cuid("Escalão inválido");

function eUnicidade(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Autenticação, adesão, licença e capacidade (sem escalão) → clube ativo. */
async function contextoClube(): Promise<
  { ok: true; ctx: ContextoMembro } | { ok: false; erro: string }
> {
  const perm = await exigirCapacidade(CAP);
  if (!perm.ok) return { ok: false, erro: perm.erro };
  return { ok: true, ctx: perm.ctx };
}

/**
 * Escalões acessíveis às situações (RN-SJ-2): TODO_CLUBE → todos os do clube;
 * SECCAO → os das secções coordenadas; PROPRIOS_ESCALOES → os atribuídos.
 * `visivelOutrosTreinadores` não concede acesso (RN-SJ-1).
 */
async function escaloesAcessiveisSituacoes(): Promise<
  { ok: true; clubeId: string; escaloes: Escalao[] } | { ok: false; erro: string }
> {
  const c = await contextoClube();
  if (!c.ok) return c;
  const ctx = c.ctx;
  const clubeId = ctx.clube.id;

  const ambito: Prisma.EscalaoWhereInput =
    ctx.ambito === "PROPRIOS_ESCALOES"
      ? { id: { in: ctx.escaloesAtribuidos } }
      : ctx.ambito === "SECCAO"
        ? { seccaoId: { in: ctx.seccoesCoordenadas } }
        : {};
  const escaloes = await prisma.escalao.findMany({
    where: { clubeId, ...ambito },
    orderBy: { ordem: "asc" },
  });
  return { ok: true, clubeId, escaloes };
}

/**
 * Escalões acessíveis às situações para os seletores da UI (RN-SJ-2), pela
 * mesma regra que filtra `listarSituacoesJogo`. Sem capacidade → erro.
 */
export async function listarEscaloesSituacoes(): Promise<Resultado<Escalao[]>> {
  const acesso = await escaloesAcessiveisSituacoes();
  if (!acesso.ok) return erro(acesso.erro);
  return ok(acesso.escaloes);
}

/**
 * Executa `fn` numa transação com um advisory lock (transacional) por jogo:
 * serializa as escritas de quadros de situação do mesmo jogo, tornando atómicas
 * as verificações RN-SJ-5 (não reimportar) e RN-SJ-13 (nomes únicos no jogo).
 */
async function comBloqueioDoJogo<T>(
  jogoId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"situacoes-jogo:" + jogoId}))`;
    return fn(tx);
  });
}

/** A categoria (se indicada) tem de pertencer ao escalão dado (RN-SJ-11). */
async function categoriaDoEscalao(
  categoriaId: string | null | undefined,
  escalaoId: string,
  clubeId: string,
): Promise<boolean> {
  if (!categoriaId) return true;
  const categoria = await prisma.categoriaSituacaoJogo.findFirst({
    where: { id: categoriaId, escalaoId, escalao: { clubeId } },
    select: { id: true },
  });
  return categoria !== null;
}

/**
 * RN-SJ-13: o nome não pode repetir o de outro quadro de situação do jogo
 * (comparação após `trim`, sem distinção de maiúsculas). O quadro do plano não
 * conta; `excluirQuadroId` exclui o próprio quadro em edição.
 */
async function nomeLivreNoJogo(
  tx: Prisma.TransactionClient,
  jogoId: string,
  nome: string,
  excluirQuadroId?: string,
): Promise<boolean> {
  const quadros = await tx.quadroTatico.findMany({
    where: { jogoId },
    select: { id: true, nome: true },
  });
  const alvo = nome.trim().toLowerCase();
  return !quadros.some(
    (q) =>
      q.id !== excluirQuadroId &&
      q.nome !== NOME_QUADRO_PLANO_JOGO &&
      q.nome.trim().toLowerCase() === alvo,
  );
}

type QuadroDeSituacao = {
  id: string;
  jogoId: string;
  nome: string;
  notas: string | null;
  diagrama: Prisma.JsonValue;
  situacaoOrigemId: string | null;
  jogo: { escalaoId: string; formato: FormatoJogo | null };
};

/**
 * Resolve um quadro de situação do clube ativo com permissão no escalão do jogo
 * (RN-SJ-12) e recusa o quadro «Plano de jogo» (RN-SJ-10).
 */
async function quadroDeSituacaoGerivel(
  quadroId: string,
): Promise<{ ok: true; quadro: QuadroDeSituacao; clubeId: string } | { ok: false; erro: string }> {
  const c = await contextoClube();
  if (!c.ok) return c;
  const clubeId = c.ctx.clube.id;

  const quadro = await prisma.quadroTatico.findFirst({
    where: { id: quadroId, jogo: { escalao: { clubeId } } },
    select: {
      id: true,
      jogoId: true,
      nome: true,
      notas: true,
      diagrama: true,
      situacaoOrigemId: true,
      jogo: { select: { escalaoId: true, formato: true } },
    },
  });
  if (!quadro) return { ok: false, erro: "Quadro tático não encontrado" };

  const perm = await exigirCapacidade(CAP, quadro.jogo.escalaoId);
  if (!perm.ok) return { ok: false, erro: perm.erro };

  if (quadro.nome === NOME_QUADRO_PLANO_JOGO) return { ok: false, erro: MSG_NAO_E_SITUACAO };
  return { ok: true, quadro, clubeId };
}

// ─────────────────────────────────────────────
// Categorias (do escalão — RN-SJ-11)
// ─────────────────────────────────────────────

export async function listarCategoriasSituacao(
  escalaoId: string,
): Promise<Resultado<CategoriaSituacaoJogo[]>> {
  const parsed = idSchema.safeParse(escalaoId);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade(CAP, parsed.data);
  if (!perm.ok) return erro(perm.erro);

  const categorias = await prisma.categoriaSituacaoJogo.findMany({
    where: { escalaoId: parsed.data, escalao: { clubeId: perm.ctx.clube.id } },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  return ok(categorias);
}

export async function criarCategoriaSituacao(
  dados: unknown,
): Promise<Resultado<CategoriaSituacaoJogo>> {
  const parsed = categoriaSituacaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade(CAP, parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  try {
    const categoria = await prisma.categoriaSituacaoJogo.create({
      data: {
        escalaoId: parsed.data.escalaoId,
        nome: parsed.data.nome,
        ordem: parsed.data.ordem,
      },
    });
    revalidatePath(PATH);
    return ok(categoria);
  } catch (e) {
    if (eUnicidade(e)) return erro(MSG_NOME_CATEGORIA_DUPLICADO);
    throw e;
  }
}

/** Resolve uma categoria do clube ativo com permissão no seu escalão. */
async function categoriaGerivel(
  id: string,
): Promise<{ ok: true; escalaoId: string } | { ok: false; erro: string }> {
  const c = await contextoClube();
  if (!c.ok) return c;

  const categoria = await prisma.categoriaSituacaoJogo.findFirst({
    where: { id, escalao: { clubeId: c.ctx.clube.id } },
    select: { id: true, escalaoId: true },
  });
  if (!categoria) return { ok: false, erro: "Categoria não encontrada" };

  const perm = await exigirCapacidade(CAP, categoria.escalaoId);
  if (!perm.ok) return { ok: false, erro: perm.erro };
  return { ok: true, escalaoId: categoria.escalaoId };
}

export async function atualizarCategoriaSituacao(
  id: string,
  dados: unknown,
): Promise<Resultado<CategoriaSituacaoJogo>> {
  const parsed = atualizarCategoriaSituacaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const alvo = await categoriaGerivel(id);
  if (!alvo.ok) return erro(alvo.erro);

  try {
    const categoria = await prisma.categoriaSituacaoJogo.update({
      where: { id },
      data: { nome: parsed.data.nome, ordem: parsed.data.ordem },
    });
    revalidatePath(PATH);
    return ok(categoria);
  } catch (e) {
    if (eUnicidade(e)) return erro(MSG_NOME_CATEGORIA_DUPLICADO);
    throw e;
  }
}

export async function apagarCategoriaSituacao(id: string): Promise<Resultado<void>> {
  const alvo = await categoriaGerivel(id);
  if (!alvo.ok) return erro(alvo.erro);

  const emUso = await prisma.situacaoJogo.count({ where: { categoriaId: id } });
  if (emUso > 0) {
    return erro(msgCategoriaEmUso(emUso));
  }

  try {
    await prisma.categoriaSituacaoJogo.delete({ where: { id } });
  } catch (e) {
    // Corrida: uma situação passou a usar a categoria depois da contagem (FK NoAction).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      const n = await prisma.situacaoJogo.count({ where: { categoriaId: id } });
      return erro(msgCategoriaEmUso(n));
    }
    throw e;
  }
  revalidatePath(PATH);
  return ok(undefined);
}

// ─────────────────────────────────────────────
// Biblioteca de situações
// ─────────────────────────────────────────────

export async function listarSituacoesJogo(
  filtro?: unknown,
): Promise<Resultado<SituacaoJogoResumo[]>> {
  const parsed = filtroSituacoesSchema.safeParse(filtro);
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const f = parsed.data;

  const acesso = await escaloesAcessiveisSituacoes();
  if (!acesso.ok) return erro(acesso.erro);

  let escalaoIds = acesso.escaloes.map((e) => e.id);
  if (f?.escalaoId) {
    if (!escalaoIds.includes(f.escalaoId)) return erro("Sem permissão neste escalão");
    escalaoIds = [f.escalaoId];
  }

  const situacoes = await prisma.situacaoJogo.findMany({
    where: {
      clubeId: acesso.clubeId,
      escalaoId: { in: escalaoIds },
      ...(f?.categoriaId ? { categoriaId: f.categoriaId } : {}),
      ...(f?.q ? { nome: { contains: f.q, mode: "insensitive" as const } } : {}),
    },
    select: SELECT_RESUMO,
    orderBy: { nome: "asc" },
  });
  return ok(situacoes);
}

/** Situação do clube ativo com permissão no seu escalão (RN-SJ-1). */
async function situacaoAcessivel(
  id: string,
): Promise<{ ok: true; situacao: SituacaoJogoResumo; clubeId: string } | { ok: false; erro: string }> {
  const c = await contextoClube();
  if (!c.ok) return c;
  const clubeId = c.ctx.clube.id;

  const situacao = await prisma.situacaoJogo.findFirst({
    where: { id, clubeId },
    select: SELECT_RESUMO,
  });
  if (!situacao) return { ok: false, erro: "Situação não encontrada" };

  const perm = await exigirCapacidade(CAP, situacao.escalaoId);
  if (!perm.ok) return { ok: false, erro: perm.erro };
  return { ok: true, situacao, clubeId };
}

export async function obterSituacaoJogo(id: string): Promise<Resultado<SituacaoJogoResumo>> {
  const alvo = await situacaoAcessivel(id);
  if (!alvo.ok) return erro(alvo.erro);
  return ok(alvo.situacao);
}

export async function criarSituacaoJogo(dados: unknown): Promise<Resultado<SituacaoJogoResumo>> {
  const parsed = situacaoJogoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const d = parsed.data;

  const perm = await exigirCapacidade(CAP, d.escalaoId);
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  if (!(await categoriaDoEscalao(d.categoriaId, d.escalaoId, clubeId))) {
    return erro(MSG_CATEGORIA_FORA_ESCALAO);
  }

  try {
    const situacao = await prisma.situacaoJogo.create({
      data: {
        clubeId,
        escalaoId: d.escalaoId,
        categoriaId: d.categoriaId ?? null,
        nome: d.nome,
        descricao: d.descricao ?? null,
        diagrama: d.diagrama,
      },
      select: SELECT_RESUMO,
    });
    revalidatePath(PATH);
    return ok(situacao);
  } catch (e) {
    if (eUnicidade(e)) return erro(MSG_NOME_SITUACAO_DUPLICADO);
    throw e;
  }
}

/** RN-SJ-8: nunca escreve em `QuadroTatico`. */
export async function atualizarSituacaoJogo(
  id: string,
  dados: unknown,
): Promise<Resultado<SituacaoJogoResumo>> {
  const parsed = atualizarSituacaoJogoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const d = parsed.data;

  const alvo = await situacaoAcessivel(id);
  if (!alvo.ok) return erro(alvo.erro);

  if (!(await categoriaDoEscalao(d.categoriaId, alvo.situacao.escalaoId, alvo.clubeId))) {
    return erro(MSG_CATEGORIA_FORA_ESCALAO);
  }

  try {
    const situacao = await prisma.situacaoJogo.update({
      where: { id },
      data: {
        nome: d.nome,
        categoriaId: d.categoriaId ?? null,
        descricao: d.descricao ?? null,
        diagrama: d.diagrama,
      },
      select: SELECT_RESUMO,
    });
    revalidatePath(PATH);
    revalidatePath(`${PATH}/situacoes/${id}`);
    return ok(situacao);
  } catch (e) {
    if (eUnicidade(e)) return erro(MSG_NOME_SITUACAO_DUPLICADO);
    throw e;
  }
}

/** RN-SJ-9: as cópias nos jogos ficam (FK SetNull limpa `situacaoOrigemId`). */
export async function apagarSituacaoJogo(id: string): Promise<Resultado<void>> {
  const alvo = await situacaoAcessivel(id);
  if (!alvo.ok) return erro(alvo.erro);

  await prisma.situacaoJogo.delete({ where: { id } });
  revalidatePath(PATH);
  return ok(undefined);
}

// ─────────────────────────────────────────────
// Situações no jogo (cópias em QuadroTatico)
// ─────────────────────────────────────────────

/** RN-SJ-5: copia a situação (snapshot) para um novo quadro do jogo. */
export async function importarSituacaoParaJogo(
  dados: unknown,
): Promise<Resultado<QuadroTatico>> {
  const parsed = importarSituacaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const c = await contextoClube();
  if (!c.ok) return erro(c.erro);
  const clubeId = c.ctx.clube.id;

  const jogo = await prisma.jogo.findFirst({
    where: { id: parsed.data.jogoId, escalao: { clubeId } },
    select: { id: true, escalaoId: true },
  });
  if (!jogo) return erro("Jogo não encontrado");

  const permJogo = await exigirCapacidade(CAP, jogo.escalaoId);
  if (!permJogo.ok) return erro(permJogo.erro);

  const situacao = await prisma.situacaoJogo.findFirst({
    where: { id: parsed.data.situacaoId, clubeId },
    select: { id: true, escalaoId: true, nome: true, descricao: true, diagrama: true },
  });
  if (!situacao) return erro("Situação não encontrada");

  const permSituacao = await exigirCapacidade(CAP, situacao.escalaoId);
  if (!permSituacao.ok) return erro(permSituacao.erro);

  const resultado = await comBloqueioDoJogo(jogo.id, async (tx) => {
    const jaImportada = await tx.quadroTatico.findFirst({
      where: { jogoId: jogo.id, situacaoOrigemId: situacao.id },
      select: { id: true },
    });
    if (jaImportada) return erro<QuadroTatico>(MSG_JA_IMPORTADA);
    if (!(await nomeLivreNoJogo(tx, jogo.id, situacao.nome))) {
      return erro<QuadroTatico>(MSG_NOME_QUADRO_DUPLICADO);
    }
    const quadro = await tx.quadroTatico.create({
      data: {
        jogoId: jogo.id,
        nome: situacao.nome,
        tipo: "GERAL",
        notas: situacao.descricao,
        diagrama: situacao.diagrama as Prisma.InputJsonValue,
        situacaoOrigemId: situacao.id,
      },
    });
    return ok(quadro);
  });
  if (!resultado.sucesso) return resultado;
  revalidatePath(`${PATH_JOGOS}/${jogo.id}`);
  return resultado;
}

/** «Só neste jogo» (RN-SJ-6): grava no quadro e nunca em `SituacaoJogo`. */
export async function atualizarQuadroSituacao(
  quadroId: string,
  dados: unknown,
): Promise<Resultado<QuadroTatico>> {
  const parsed = quadroSituacaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const alvo = await quadroDeSituacaoGerivel(quadroId);
  if (!alvo.ok) return erro(alvo.erro);
  const { quadro } = alvo;

  const resultado = await comBloqueioDoJogo(quadro.jogoId, async (tx) => {
    if (!(await nomeLivreNoJogo(tx, quadro.jogoId, parsed.data.nome, quadro.id))) {
      return erro<QuadroTatico>(MSG_NOME_QUADRO_DUPLICADO);
    }
    const atualizado = await tx.quadroTatico.update({
      where: { id: quadro.id },
      data: {
        nome: parsed.data.nome,
        notas: parsed.data.notas ?? null,
        diagrama: parsed.data.diagrama,
      },
    });
    return ok(atualizado);
  });
  if (!resultado.sucesso) return resultado;
  revalidatePath(`${PATH_JOGOS}/${quadro.jogoId}`);
  return resultado;
}

/**
 * «Guardar como nova situação» (RN-SJ-7): numa transação, cria a situação no
 * escalão do jogo e reaponta o quadro para ela. A original não é tocada.
 */
export async function guardarQuadroComoNovaSituacao(
  quadroId: string,
  dados: unknown,
): Promise<Resultado<{ quadro: QuadroTatico; situacao: SituacaoJogoResumo }>> {
  const parsed = guardarComoNovaSituacaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const d = parsed.data;

  const alvo = await quadroDeSituacaoGerivel(quadroId);
  if (!alvo.ok) return erro(alvo.erro);
  const { quadro, clubeId } = alvo;
  const escalaoId = quadro.jogo.escalaoId;

  if (!(await categoriaDoEscalao(d.categoriaId, escalaoId, clubeId))) {
    return erro(MSG_CATEGORIA_FORA_ESCALAO);
  }
  // Quadro legado sem `campo` → campo do jogo (ou FUTSAL_5).
  const diagrama = {
    ...d.diagrama,
    campo: d.diagrama.campo ?? quadro.jogo.formato ?? "FUTSAL_5",
  };
  const notas = d.notas ?? null;

  try {
    const resultado = await comBloqueioDoJogo(quadro.jogoId, async (tx) => {
      if (!(await nomeLivreNoJogo(tx, quadro.jogoId, d.nome, quadro.id))) {
        return erro<{ quadro: QuadroTatico; situacao: SituacaoJogoResumo }>(
          MSG_NOME_QUADRO_DUPLICADO,
        );
      }
      const situacao = await tx.situacaoJogo.create({
        data: {
          clubeId,
          escalaoId,
          categoriaId: d.categoriaId ?? null,
          nome: d.nome,
          descricao: notas,
          diagrama,
        },
        select: SELECT_RESUMO,
      });
      const quadroAtualizado = await tx.quadroTatico.update({
        where: { id: quadro.id },
        data: { nome: d.nome, notas, diagrama, situacaoOrigemId: situacao.id },
      });
      return ok({ quadro: quadroAtualizado, situacao });
    });
    if (!resultado.sucesso) return resultado;
    revalidatePath(`${PATH_JOGOS}/${quadro.jogoId}`);
    revalidatePath(PATH);
    return resultado;
  } catch (e) {
    if (eUnicidade(e)) return erro(MSG_NOME_SITUACAO_DUPLICADO);
    throw e;
  }
}

/**
 * Variante no mesmo jogo (RN-SJ-14): copia notas/diagrama e mantém
 * `situacaoOrigemId`. Não escreve em `SituacaoJogo`.
 */
export async function duplicarQuadroSituacao(
  quadroId: string,
  dados: unknown,
): Promise<Resultado<QuadroTatico>> {
  const parsed = duplicarQuadroSituacaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const alvo = await quadroDeSituacaoGerivel(quadroId);
  if (!alvo.ok) return erro(alvo.erro);
  const { quadro } = alvo;

  const resultado = await comBloqueioDoJogo(quadro.jogoId, async (tx) => {
    if (!(await nomeLivreNoJogo(tx, quadro.jogoId, parsed.data.nome))) {
      return erro<QuadroTatico>(MSG_NOME_QUADRO_DUPLICADO);
    }
    const variante = await tx.quadroTatico.create({
      data: {
        jogoId: quadro.jogoId,
        nome: parsed.data.nome,
        tipo: "GERAL",
        notas: quadro.notas,
        diagrama:
          quadro.diagrama === null ? Prisma.DbNull : (quadro.diagrama as Prisma.InputJsonValue),
        situacaoOrigemId: quadro.situacaoOrigemId,
      },
    });
    return ok(variante);
  });
  if (!resultado.sucesso) return resultado;
  revalidatePath(`${PATH_JOGOS}/${quadro.jogoId}`);
  return resultado;
}
