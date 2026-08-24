"use server";

// Gerador de comunicações (bíblia §3.9, §8.12, §16 fase 17).
//
// FILOSOFIA: a app NÃO é canal de comunicação. Gera texto formatado a partir de
// templates com placeholders `{{chave}}`; o utilizador copia/partilha no WhatsApp.
// O deep link (`https://api.whatsapp.com/send?text=…`, link universal) é construído no cliente — aqui só se gera texto.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade, escaloesLegiveis, podeLerEscalao } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  calendarioTextoSchema,
  editarModeloComunicacaoSchema,
  gerarTextoComunicacaoSchema,
} from "@/lib/schemas/comunicacao";
import { MODELOS_COMUNICACAO_SEED } from "@/lib/comunicacao-modelos";
import { relatorioParaTexto } from "@/lib/relatorio-jogo";
import {
  formatarContagemPorAtleta,
  formatarData,
  formatarDataCurta,
  formatarDiaSemana,
  formatarHora,
  formatarListaConvocados,
  formatarListaEventos,
  formatarMesAno,
  HORA_LIMITE_CONFIRMACAO,
  LOCAL_POR_DEFINIR,
  substituirPlaceholders,
  type EventoCalendario,
} from "@/lib/comunicacao-utils";
import { Prisma, type ModeloComunicacao, type TipoComunicacao } from "@prisma/client";

const PATH = "/comunicacoes";

// ─────────────────────────────────────────────
// Resolução do template
// ─────────────────────────────────────────────

/**
 * Template a usar: variante do clube (se existir) com fallback para o modelo
 * global do seed (clubeId = null). Se `modeloId` for indicado, tem de pertencer
 * ao clube (ou ser global) e ser do tipo pedido.
 */
async function resolverModelo(
  clubeId: string,
  tipo: TipoComunicacao,
  modeloId?: string,
): Promise<ModeloComunicacao | null> {
  if (modeloId) {
    return prisma.modeloComunicacao.findFirst({
      where: { id: modeloId, tipo, OR: [{ clubeId }, { clubeId: null }] },
    });
  }

  const doClube = await prisma.modeloComunicacao.findFirst({ where: { clubeId, tipo } });
  if (doClube) return doClube;

  return prisma.modeloComunicacao.findFirst({ where: { clubeId: null, tipo } });
}

// ─────────────────────────────────────────────
// Geração de texto
// ─────────────────────────────────────────────

/**
 * Gera o texto formatado de uma comunicação, substituindo os placeholders do
 * template pelos valores do contexto. Não envia nada — devolve o texto.
 */
export async function gerarTextoComunicacao(dados: unknown): Promise<Resultado<string>> {
  const parsed = gerarTextoComunicacaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("COMUNICACOES_GERIR");
  if (!perm.ok) return erro(perm.erro);

  const modelo = await resolverModelo(
    perm.ctx.clube.id,
    parsed.data.tipo,
    parsed.data.modeloId,
  );
  if (!modelo) return erro("Não existe modelo de comunicação para este tipo");

  return ok(substituirPlaceholders(modelo.template, parsed.data.contexto));
}

/**
 * Gera o texto do calendário mensal (treinos + jogos dos escalões legíveis),
 * a partir do template CALENDARIO_MENSAL.
 */
export async function gerarCalendarioTexto(
  mes: number,
  ano: number,
): Promise<Resultado<string>> {
  const parsed = calendarioTextoSchema.safeParse({ mes, ano });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("COMUNICACOES_GERIR");
  if (!perm.ok) return erro(perm.erro);

  const clubeId = perm.ctx.clube.id;
  const inicio = new Date(Date.UTC(parsed.data.ano, parsed.data.mes - 1, 1));
  const fim = new Date(Date.UTC(parsed.data.ano, parsed.data.mes, 1));

  const legiveis = await escaloesLegiveis();
  const filtroEscalao: Prisma.SessaoWhereInput =
    legiveis === "TODOS" ? {} : { escalaoId: { in: legiveis } };

  const [sessoes, jogos, utilizador] = await Promise.all([
    prisma.sessao.findMany({
      where: {
        escalao: { clubeId },
        data: { gte: inicio, lt: fim },
        ...filtroEscalao,
      },
      select: { data: true, local: true },
      orderBy: { data: "asc" },
    }),
    prisma.jogo.findMany({
      where: {
        escalao: { clubeId },
        data: { gte: inicio, lt: fim },
        ...(legiveis === "TODOS" ? {} : { escalaoId: { in: legiveis } }),
      },
      select: { data: true, adversario: true },
      orderBy: { data: "asc" },
    }),
    prisma.utilizador.findUnique({
      where: { id: perm.ctx.utilizadorId },
      select: { nome: true },
    }),
  ]);

  const eventos: EventoCalendario[] = [
    ...sessoes.map((s): EventoCalendario => ({ tipo: "TREINO", data: s.data, local: s.local })),
    ...jogos.map((j): EventoCalendario => ({
      tipo: "JOGO",
      data: j.data,
      adversario: j.adversario,
    })),
  ];

  const modelo = await resolverModelo(clubeId, "CALENDARIO_MENSAL");
  if (!modelo) return erro("Não existe modelo de comunicação para este tipo");

  const contexto: Record<string, string> = {
    nomeEquipa: perm.ctx.clube.nome,
    mesAno: formatarMesAno(parsed.data.mes, parsed.data.ano),
    listaEventos: formatarListaEventos(eventos),
    dataActualizacao: formatarData(new Date()),
    nomeTreinador: utilizador?.nome ?? "",
  };

  return ok(substituirPlaceholders(modelo.template, contexto));
}

// ─────────────────────────────────────────────
// Modelos do clube
// ─────────────────────────────────────────────

/** Modelos disponíveis: os do clube + os globais do seed, ordenados por tipo. */
export async function listarModelosComunicacao(): Promise<Resultado<ModeloComunicacao[]>> {
  const perm = await exigirCapacidade("COMUNICACOES_GERIR");
  if (!perm.ok) return erro(perm.erro);

  const modelos = await prisma.modeloComunicacao.findMany({
    where: { OR: [{ clubeId: perm.ctx.clube.id }, { clubeId: null }] },
    // Em Postgres, ASC coloca os NULL no fim: a variante do clube vem antes da global.
    orderBy: [{ tipo: "asc" }, { clubeId: "asc" }],
  });
  return ok(modelos);
}

/**
 * Edita um modelo do próprio clube. Os modelos globais do seed não são editáveis —
 * o clube instala a sua cópia com `instalarSeedComunicacao` e edita essa.
 */
export async function editarModeloComunicacao(
  dados: unknown,
): Promise<Resultado<ModeloComunicacao>> {
  const parsed = editarModeloComunicacaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("COMUNICACOES_GERIR");
  if (!perm.ok) return erro(perm.erro);

  const existe = await prisma.modeloComunicacao.findUnique({ where: { id: parsed.data.id } });
  if (!existe) return erro("Modelo não encontrado");
  if (existe.clubeId !== perm.ctx.clube.id) {
    return erro("Só podes editar os modelos do teu clube");
  }

  const modelo = await prisma.modeloComunicacao.update({
    where: { id: parsed.data.id },
    data: { nome: parsed.data.nome, template: parsed.data.template },
  });
  revalidatePath(PATH);
  return ok(modelo);
}

/**
 * Instala no clube uma cópia editável dos modelos de arranque (um por tipo).
 * Idempotente: não sobrepõe modelos já existentes do clube.
 */
export async function instalarSeedComunicacao(): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("COMUNICACOES_GERIR");
  if (!perm.ok) return erro(perm.erro);

  const clubeId = perm.ctx.clube.id;

  await prisma.$transaction(
    MODELOS_COMUNICACAO_SEED.map((m) =>
      prisma.modeloComunicacao.upsert({
        where: { clubeId_tipo: { clubeId, tipo: m.tipo } },
        create: {
          clubeId,
          tipo: m.tipo,
          nome: m.nome,
          template: m.template,
          origemSeed: true,
        },
        update: {},
      }),
    ),
  );
  revalidatePath(PATH);
  return ok(undefined);
}

// ─────────────────────────────────────────────
// Contextos gerados a partir dos dados do clube
// ─────────────────────────────────────────────

/** Nome do utilizador autenticado (para o placeholder {{nomeTreinador}}). */
async function nomeDoTreinador(utilizadorId: string): Promise<string> {
  const u = await prisma.utilizador.findUnique({
    where: { id: utilizadorId },
    select: { nome: true },
  });
  return u?.nome ?? "";
}

const INCLUDE_JOGO_COMUNICACAO = {
  escalao: { select: { nome: true } },
  competicaoRef: { select: { nome: true } },
  convocatorias: {
    where: { convocado: true },
    include: { atleta: { select: { nome: true } } },
  },
  estatisticas: { include: { atleta: { select: { nome: true } } } },
} as const;

/**
 * Carrega o jogo garantindo clube + capacidade + âmbito do escalão.
 * Lança em caso de acesso inválido (estes helpers alimentam `gerarTextoComunicacao`,
 * que é quem devolve `Resultado<T>` à UI).
 */
async function carregarJogoParaComunicacao(jogoId: string) {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) throw new Error("Não autenticado");

  const jogo = await prisma.jogo.findFirst({
    where: { id: jogoId, escalao: { clubeId } },
    include: INCLUDE_JOGO_COMUNICACAO,
  });
  if (!jogo) throw new Error("Jogo não encontrado");

  const perm = await exigirCapacidade("COMUNICACOES_GERIR", jogo.escalaoId);
  if (!perm.ok) throw new Error(perm.erro);
  if (!(await podeLerEscalao(jogo.escalaoId))) throw new Error("Sem permissão neste escalão");

  return { jogo, ctx: perm.ctx };
}

/**
 * Contexto do template CONVOCATORIA a partir de um jogo.
 * `prazoConfirmacao` é uma sugestão editável (véspera do jogo às 20:00).
 */
export async function obterContextoConvocatoria(
  jogoId: string,
): Promise<Record<string, string>> {
  const { jogo, ctx } = await carregarJogoParaComunicacao(jogoId);

  const nomes = jogo.convocatorias
    .map((c) => c.atleta.nome)
    .sort((a, b) => a.localeCompare(b, "pt-PT"));

  const vespera = new Date(jogo.data.getTime() - 24 * 60 * 60 * 1000);

  return {
    nomeEquipa: `${ctx.clube.nome} ${jogo.escalao.nome}`.trim(),
    diaSemana: formatarDiaSemana(jogo.data),
    data: formatarData(jogo.data),
    hora: formatarHora(jogo.data),
    local: jogo.local?.trim() || LOCAL_POR_DEFINIR,
    listaConvocados: formatarListaConvocados(nomes),
    prazoConfirmacao: `${formatarDataCurta(vespera)} às ${HORA_LIMITE_CONFIRMACAO}`,
    nomeTreinador: await nomeDoTreinador(ctx.utilizadorId),
  };
}

/** Contexto do template RESULTADO a partir de um jogo. */
export async function obterContextoResultado(
  jogoId: string,
): Promise<Record<string, string>> {
  const { jogo, ctx } = await carregarJogoParaComunicacao(jogoId);

  const nomeEquipa = `${ctx.clube.nome} ${jogo.escalao.nome}`.trim();
  const emCasa = jogo.casaFora === "CASA";

  const golosEquipa = jogo.golosMarcados === null ? "?" : String(jogo.golosMarcados);
  const golosAdversario = jogo.golosSofridos === null ? "?" : String(jogo.golosSofridos);

  const marcadores = formatarContagemPorAtleta(
    jogo.estatisticas.map((e) => ({ nome: e.atleta.nome, total: e.golos })),
  );
  const assistencias = formatarContagemPorAtleta(
    jogo.estatisticas.map((e) => ({ nome: e.atleta.nome, total: e.assistencias })),
  );

  const competicao =
    jogo.competicaoRef?.nome ??
    jogo.competicao ??
    (jogo.tipo === "AMIGAVEL" ? "Amigável" : "Oficial");

  return {
    nomeEquipa,
    adversario: jogo.adversario,
    competicao,
    diaSemana: formatarDiaSemana(jogo.data),
    data: formatarData(jogo.data),
    hora: formatarHora(jogo.data),
    local: jogo.local?.trim() || LOCAL_POR_DEFINIR,
    equipaCasa: emCasa ? nomeEquipa : jogo.adversario,
    golosCasa: emCasa ? golosEquipa : golosAdversario,
    golosFora: emCasa ? golosAdversario : golosEquipa,
    equipaFora: emCasa ? jogo.adversario : nomeEquipa,
    resultado: `${golosEquipa}-${golosAdversario}`,
    marcadores,
    assistencias,
    comentarioTreinador: relatorioParaTexto(jogo.relatorio),
    nomeTreinador: await nomeDoTreinador(ctx.utilizadorId),
  };
}
