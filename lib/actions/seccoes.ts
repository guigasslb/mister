"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirCapacidade, obterMembroAtual } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { calcularPrecoLicenca } from "@/lib/billing";
import { atualizarSeccaoSchema } from "@/lib/schemas/seccao";
import { z } from "zod";
import { Modalidade, PapelSeccao, type Seccao } from "@prisma/client";

const PATH = "/definicoes";

// Rótulo pt-PT por modalidade (fallback quando `nome` não é personalizado — §3.1.1).
const ROTULO_MODALIDADE: Record<Modalidade, string> = {
  FUTSAL: "Futsal",
  FUTEBOL: "Futebol",
};

/**
 * Garante que existe uma `Seccao` para a modalidade do clube atual (§8.1.1).
 *
 * Idempotente por `@@unique([clubeId, modalidade])`: cria a secção se ainda não
 * existir, caso contrário devolve a existente. Usada no onboarding e em
 * `criarEscalao` — a criação de secções é transparente para clubes de uma só
 * modalidade. Não requer capacidade especial: qualquer membro autenticado pode
 * garantir a secção da sua modalidade (a autorização de escrita real vive na
 * action que a invoca, ex.: `criarEscalao`).
 */
export async function garantirSeccaoParaModalidade(
  modalidade: Modalidade,
): Promise<Resultado<{ seccaoId: string }>> {
  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Sem acesso a este clube");

  // Bloqueio Individual = uma modalidade (§17.1, DEVE): um clube técnico
  // Individual só pode ter UMA secção. Se já existir uma secção de modalidade
  // diferente, recusar a criação de uma segunda (sugere a licença de Clube).
  // Só bloqueia quando a secção-alvo ainda não existe (o upsert abaixo é
  // idempotente para a modalidade já presente).
  const seccoesExistentes = await prisma.seccao.findMany({
    where: { clubeId: ctx.clube.id },
    select: { modalidade: true },
  });
  const jaTemEstaModalidade = seccoesExistentes.some((s) => s.modalidade === modalidade);
  if (!jaTemEstaModalidade && seccoesExistentes.length > 0) {
    const licenca = await prisma.licenca.findFirst({
      where: { clubeId: ctx.clube.id, estado: "ATIVA" },
      select: { tipo: true },
    });
    const eIndividual = licenca?.tipo === "INDIVIDUAL" || ctx.clube.clubeTecnico;
    if (eIndividual) {
      return erro(
        "A licença Individual dá acesso a uma só modalidade. Para gerir futsal e futebol, muda para uma licença de Clube.",
      );
    }
  }

  const seccao = await prisma.seccao.upsert({
    where: { clubeId_modalidade: { clubeId: ctx.clube.id, modalidade } },
    update: {},
    create: {
      clubeId: ctx.clube.id,
      modalidade,
      nome: ROTULO_MODALIDADE[modalidade],
    },
    select: { id: true },
  });

  return ok({ seccaoId: seccao.id });
}

/**
 * Lista as secções do clube atual, com os membros coordenadores (§8.2).
 * Requer apenas autenticação (a UI de gestão faz gating por capacidade).
 */
export async function obterSeccoes(): Promise<Resultado<Seccao[]>> {
  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Sem acesso a este clube");

  const seccoes = await prisma.seccao.findMany({
    where: { clubeId: ctx.clube.id },
    orderBy: { criadoEm: "asc" },
    include: {
      membros: {
        select: {
          id: true,
          papel: true,
          membroClube: {
            select: { id: true, utilizador: { select: { nome: true } } },
          },
        },
      },
    },
  });

  return ok(seccoes);
}

const atribuirCoordenadorSchema = z.object({
  seccaoId: z.string().min(1),
  membroClubeId: z.string().min(1),
  papel: z.nativeEnum(PapelSeccao),
});

/**
 * Atribui um membro como Coordenador de uma secção (§6.9).
 *
 * A gestão de membros é uma capacidade de nível clube (`CLUBE_UTILIZADORES` —
 * ver §8.2, "atribuir secções (Coordenador)"). Idempotente por
 * `@@unique([seccaoId, membroClubeId])`.
 */
export async function atribuirCoordenadorSeccao(dados: unknown): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("CLUBE_UTILIZADORES");
  if (!perm.ok) return erro(perm.erro);

  const parsed = atribuirCoordenadorSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Isolamento multi-tenant: secção e membro têm de pertencer ao clube ativo.
  const [seccao, membro] = await Promise.all([
    prisma.seccao.findFirst({
      where: { id: parsed.data.seccaoId, clubeId: perm.ctx.clube.id },
      select: { id: true },
    }),
    prisma.membroClube.findFirst({
      where: { id: parsed.data.membroClubeId, clubeId: perm.ctx.clube.id },
      select: { id: true },
    }),
  ]);
  if (!seccao) return erro("Secção não encontrada");
  if (!membro) return erro("Membro não encontrado");

  await prisma.membroSeccao.upsert({
    where: {
      seccaoId_membroClubeId: {
        seccaoId: parsed.data.seccaoId,
        membroClubeId: parsed.data.membroClubeId,
      },
    },
    update: { papel: parsed.data.papel },
    create: {
      seccaoId: parsed.data.seccaoId,
      membroClubeId: parsed.data.membroClubeId,
      papel: parsed.data.papel,
    },
  });

  revalidatePath(PATH);
  return ok(undefined);
}

const removerMembroSchema = z.object({
  seccaoId: z.string().min(1),
  membroClubeId: z.string().min(1),
});

/**
 * Remove um membro de uma secção (§6.9). Requer `CLUBE_UTILIZADORES` (§8.2).
 */
export async function removerMembroSeccao(dados: unknown): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("CLUBE_UTILIZADORES");
  if (!perm.ok) return erro(perm.erro);

  const parsed = removerMembroSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Isolamento multi-tenant: a secção alvo tem de pertencer ao clube ativo.
  const seccao = await prisma.seccao.findFirst({
    where: { id: parsed.data.seccaoId, clubeId: perm.ctx.clube.id },
    select: { id: true },
  });
  if (!seccao) return erro("Secção não encontrada");

  await prisma.membroSeccao.deleteMany({
    where: {
      seccaoId: parsed.data.seccaoId,
      membroClubeId: parsed.data.membroClubeId,
    },
  });

  revalidatePath(PATH);
  return ok(undefined);
}

const modalidadeSchema = z.nativeEnum(Modalidade);

/**
 * Adiciona uma segunda modalidade (secção) ao clube (§17.1).
 *
 * Estrutural, de nível clube: exige `CLUBE_ESCALOES` (um Coordenador de Secção
 * — âmbito SECCAO — não pode adicionar modalidades ao clube). Cria/garante a
 * secção (idempotente; `garantirSeccaoParaModalidade` bloqueia a 2.ª modalidade
 * numa licença Individual), recalcula `Licenca.numSeccoes` a partir das secções
 * reais e atualiza o preço praticado (aviso suave — o enforcement de billing é
 * deferido). Devolve o novo preço em cêntimos para o frontend mostrar o aviso.
 */
export async function adicionarSeccaoAoClube(
  modalidade: Modalidade,
): Promise<Resultado<{ seccaoId: string; novoPreco: number | null; numSeccoes: number }>> {
  const perm = await exigirCapacidade("CLUBE_ESCALOES");
  if (!perm.ok) return erro(perm.erro);

  const parsed = modalidadeSchema.safeParse(modalidade);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const clubeId = perm.ctx.clube.id;

  // Cria/garante a secção (idempotente; aplica o bloqueio Individual — §17.1).
  const res = await garantirSeccaoParaModalidade(parsed.data);
  if (!res.sucesso) return erro(res.erro);
  const seccaoId = res.dados.seccaoId;

  // Nº de secções faturadas = secções reais do clube (bounded a 2 — só existem
  // duas modalidades). Recontar (em vez de incrementar) é idempotente perante
  // repetições da mesma modalidade.
  const totalSeccoes = await prisma.seccao.count({ where: { clubeId } });
  const numSeccoes = Math.min(totalSeccoes, 2);

  // Atualiza a licença de Clube, se existir (o billing é deferido — pode não haver).
  let novoPreco: number | null = null;
  const licenca = await prisma.licenca.findFirst({
    where: { clubeId, estado: "ATIVA" },
    select: { id: true, tipo: true, tier: true, ciclo: true },
  });
  if (licenca && licenca.tipo === "CLUBE" && licenca.tier) {
    // PARCEIRO é negociado — não recalcula o preço, só o nº de secções.
    novoPreco =
      licenca.tier === "PARCEIRO"
        ? null
        : calcularPrecoLicenca(licenca.tier, numSeccoes, licenca.ciclo);
    await prisma.licenca.update({
      where: { id: licenca.id },
      data: { numSeccoes, ...(novoPreco !== null ? { precoCentimos: novoPreco } : {}) },
    });
  }

  revalidatePath(PATH);
  revalidatePath("/definicoes/licenca");
  return ok({ seccaoId, novoPreco, numSeccoes });
}

const seccaoIdSchema = z.string().min(1);

/**
 * Contexto de uma secção para um Coordenador de Secção (§6.9).
 *
 * Devolve a secção se o membro a coordenar (âmbito SECCAO) ou tiver âmbito de
 * todo o clube (Administrador). Caso contrário devolve erro. Guarda de acesso
 * reutilizável por páginas/actions com âmbito de secção.
 */
export async function obterContextoSeccao(seccaoId: unknown): Promise<Resultado<Seccao>> {
  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Sem acesso a este clube");

  const parsed = seccaoIdSchema.safeParse(seccaoId);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const seccao = await prisma.seccao.findFirst({
    where: { id: parsed.data, clubeId: ctx.clube.id },
  });
  if (!seccao) return erro("Secção não encontrada");

  const temAmbitoClube = ctx.ambito === "TODO_CLUBE";
  const eCoordenador = ctx.seccoesCoordenadas.includes(seccao.id);
  if (!temAmbitoClube && !eCoordenador) return erro("Sem permissão nesta secção");

  return ok(seccao);
}

/**
 * Atualiza o nome de uma secção (§8.1.1 — GAP-P2-10).
 *
 * Estrutural, de nível clube: exige `CLUBE_ESCALOES` (em coerência com
 * `adicionarSeccaoAoClube`/`apagarSeccao`). A modalidade é fixa — só o `nome`
 * personalizado é editável. Isolamento multi-tenant garantido pelo `clubeId`.
 */
export async function atualizarSeccao(
  id: string,
  dados: { nome: string },
): Promise<Resultado<Seccao>> {
  const perm = await exigirCapacidade("CLUBE_ESCALOES");
  if (!perm.ok) return erro(perm.erro);

  const parsed = atualizarSeccaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const existe = await prisma.seccao.findFirst({
    where: { id, clubeId: perm.ctx.clube.id },
    select: { id: true },
  });
  if (!existe) return erro("Secção não encontrada");

  const seccao = await prisma.seccao.update({
    where: { id },
    data: { nome: parsed.data.nome },
  });

  revalidatePath(PATH);
  return ok(seccao);
}

/**
 * Apaga uma secção do clube (§8.1.1 — GAP-P2-10).
 *
 * Estrutural, de nível clube: exige `CLUBE_ESCALOES`. Regra de negócio: bloqueia
 * a remoção enquanto existirem escalões associados (evita orfanar escalões — a
 * relação `Escalao.seccao` é opcional/SetNull, logo o guard é intencional, não
 * mera prevenção de P2003). Isolamento multi-tenant pelo `clubeId`.
 * `MembroSeccao` é Cascade, pelo que não bloqueia.
 */
export async function apagarSeccao(id: string): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("CLUBE_ESCALOES");
  if (!perm.ok) return erro(perm.erro);

  const existe = await prisma.seccao.findFirst({
    where: { id, clubeId: perm.ctx.clube.id },
    select: { id: true },
  });
  if (!existe) return erro("Secção não encontrada");

  const totalEscaloes = await prisma.escalao.count({ where: { seccaoId: id } });
  if (totalEscaloes > 0)
    return erro("Não é possível apagar uma secção com escalões activos.");

  await prisma.seccao.delete({ where: { id } });

  revalidatePath(PATH);
  return ok(undefined);
}
