"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import {
  exigirCapacidade,
  podeLerEscalao,
  escaloesLegiveis,
  obterMembroAtual,
  type ResultadoPermissao,
} from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  criarCompeticaoSchema,
  atualizarCompeticaoSchema,
  adicionarParticipanteSchema,
  agendarDueloSchema,
  registarResultadoSchema,
  criarDueloAdHocSchema,
  gerarFixturesSchema,
  criarClubeExternoSchema,
} from "@/lib/schemas/mano-a-mano";
import { gerarLiga, type Equipa } from "@/lib/quadro";
import {
  Prisma,
  type CompeticaoManoMano,
  type ParticipanteManoMano,
  type MatchManoMano,
  type ClubeExterno,
  type TipoManoMano,
  type EstadoManoMano,
} from "@prisma/client";

const PATH = "/mano-a-mano";

// ─────────────────────────────────────────────
// Includes / tipos de leitura
// ─────────────────────────────────────────────

const INCLUDE_PARTICIPANTE = {
  atleta: { select: { id: true, nome: true } },
  clubeExterno: { select: { id: true, nome: true } },
} as const;

const INCLUDE_MATCH = {
  participanteA: { include: INCLUDE_PARTICIPANTE },
  participanteB: { include: INCLUDE_PARTICIPANTE },
} as const;

const ORDER_MATCHES: Prisma.MatchManoManoOrderByWithRelationInput[] = [
  { ronda: { sort: "asc", nulls: "last" } },
  { ordemNaRonda: { sort: "asc", nulls: "last" } },
  { criadoEm: "asc" },
];

const ORDER_PARTICIPANTES: Prisma.ParticipanteManoManoOrderByWithRelationInput[] = [
  { seed: { sort: "asc", nulls: "last" } },
  { id: "asc" },
];

const INCLUDE_RESUMO = {
  escalao: { select: { id: true, nome: true } },
  _count: { select: { participantes: true, matches: true } },
} as const;

const INCLUDE_DETALHE = {
  escalao: { select: { id: true, nome: true } },
  participantes: { include: INCLUDE_PARTICIPANTE, orderBy: ORDER_PARTICIPANTES },
  matches: { include: INCLUDE_MATCH, orderBy: ORDER_MATCHES },
  _count: { select: { participantes: true, matches: true } },
} as const;

export type CompeticaoManoManoResumo = Prisma.CompeticaoManoManoGetPayload<{
  include: typeof INCLUDE_RESUMO;
}>;
export type CompeticaoManoManoDetalhe = Prisma.CompeticaoManoManoGetPayload<{
  include: typeof INCLUDE_DETALHE;
}>;
export type MatchManoManoComParticipantes = Prisma.MatchManoManoGetPayload<{
  include: typeof INCLUDE_MATCH;
}>;

/** Uma linha da classificação Mano-a-Mano (calculada, não persistida). */
export type LinhaClassificacaoManoMano = {
  participanteId: string;
  nome: string;
  tipo: ParticipanteManoMano["tipo"];
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  golosMarcados: number;
  golosSofridos: number;
  diferencaGolos: number;
  pontos: number;
  posicao: number;
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Capacidade de gerir Mano-a-Mano OU de gerir treinos (registo em sessão). */
async function exigirGerirOuTreinos(escalaoId?: string | null): Promise<ResultadoPermissao> {
  const gerir = await exigirCapacidade("MANOAMANO_GERIR", escalaoId ?? undefined);
  if (gerir.ok) return gerir;
  return exigirCapacidade("TREINOS_GERIR", escalaoId ?? undefined);
}

function inicioDoDia(data: Date): Date {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function nomeParticipante(p: {
  tipo: ParticipanteManoMano["tipo"];
  atleta: { nome: string } | null;
  atletaExternoNome: string | null;
  clubeExterno: { nome: string } | null;
}): string {
  if (p.tipo === "ATLETA") return p.atleta?.nome ?? "—";
  const base = p.atletaExternoNome ?? "Externo";
  return p.clubeExterno ? `${base} (${p.clubeExterno.nome})` : base;
}

/**
 * Ordem clássica de seeds de um bracket de dimensão `size` (potência de 2):
 * devolve as posições de seed (1-based) por slot, garantindo que o 1.º seed
 * defronta o último, o 2.º o penúltimo, etc.
 */
function ordemSeeds(size: number): number[] {
  let pods = [1, 2];
  while (pods.length < size) {
    const soma = pods.length * 2 + 1;
    const proximo: number[] = [];
    for (const p of pods) {
      proximo.push(p);
      proximo.push(soma - p);
    }
    pods = proximo;
  }
  return pods;
}

type PlanoBracket = {
  chave: string;
  ronda: number;
  ordemNaRonda: number;
  participanteAId: string | null;
  participanteBId: string | null;
  proximoChave: string | null;
};

/**
 * Planeia um quadro eliminatório completo a partir dos participantes ordenados
 * por seed. Gera todas as rondas com progressão (proximoChave); os `byes` (até à
 * próxima potência de 2) beneficiam os primeiros seeds, que avançam diretamente
 * para a 2.ª ronda sem duelo na 1.ª.
 */
function planearBracket(participantesOrdenados: string[]): PlanoBracket[] {
  const n = participantesOrdenados.length;
  if (n < 2) return [];

  const potencia = 2 ** Math.ceil(Math.log2(n));
  const rondas = Math.log2(potencia);
  const slots: (string | null)[] = ordemSeeds(potencia).map((pos) =>
    pos <= n ? participantesOrdenados[pos - 1] : null,
  );

  const chave = (r: number, k: number) => `R${r}-M${k}`;
  const plano = new Map<string, PlanoBracket>();
  for (let r = 1; r <= rondas; r++) {
    const numMatches = potencia / 2 ** r;
    for (let k = 0; k < numMatches; k++) {
      plano.set(chave(r, k), {
        chave: chave(r, k),
        ronda: r,
        ordemNaRonda: k,
        participanteAId: null,
        participanteBId: null,
        proximoChave: r < rondas ? chave(r + 1, Math.floor(k / 2)) : null,
      });
    }
  }

  const numR1 = potencia / 2;
  for (let k = 0; k < numR1; k++) {
    const a = slots[2 * k];
    const b = slots[2 * k + 1];
    const chaveR1 = chave(1, k);
    if (a !== null && b !== null) {
      const m = plano.get(chaveR1);
      if (m) {
        m.participanteAId = a;
        m.participanteBId = b;
      }
    } else if (a !== null || b !== null) {
      // Bye: o participante presente avança diretamente para a ronda 2.
      const presente = (a ?? b) as string;
      plano.delete(chaveR1);
      if (rondas >= 2) {
        const prox = plano.get(chave(2, Math.floor(k / 2)));
        if (prox) {
          if (k % 2 === 0) prox.participanteAId = presente;
          else prox.participanteBId = presente;
        }
      }
    } else {
      plano.delete(chaveR1);
    }
  }

  return [...plano.values()];
}

/** Round-robin (método do círculo) sobre ids de participantes. */
function calcularFixtures(
  participantes: { id: string; seed: number | null }[],
  duasMaos: boolean,
): { jogos: { aId: string; bId: string; ronda: number }[]; jornadas: number } {
  const equipas: Equipa[] = participantes.map((p) => ({ nome: p.id, posicao: p.seed }));
  const jogos = gerarLiga(equipas, duasMaos).map((j) => ({
    aId: j.equipaCasa,
    bId: j.equipaFora,
    ronda: j.ronda,
  }));
  const jornadas = new Set(jogos.map((j) => j.ronda)).size;
  return { jogos, jornadas };
}

/** Sessões futuras do escalão da competição (para integração nos treinos). */
async function sessoesFuturasDoEscalao(
  competicao: Pick<CompeticaoManoMano, "escalaoId" | "epocaId" | "integraTreinos">,
  clubeId: string,
  dataInicio?: Date,
): Promise<{ id: string; data: Date }[]> {
  if (!competicao.integraTreinos || !competicao.escalaoId) return [];
  const inicio = dataInicio ? inicioDoDia(dataInicio) : inicioDoDia(new Date());
  return prisma.sessao.findMany({
    where: {
      escalaoId: competicao.escalaoId,
      epocaId: competicao.epocaId,
      escalao: { clubeId },
      data: { gte: inicio },
    },
    orderBy: { data: "asc" },
    select: { id: true, data: true },
  });
}

/**
 * Remove o vencedor de um match do slot correspondente do match seguinte
 * (usado ao reabrir/anular). Devolve erro se o match seguinte já foi disputado.
 */
async function limparAvancoBracket(match: MatchManoMano): Promise<string | null> {
  if (!match.proximoMatchId || !match.vencedorParticipanteId) return null;

  const proximo = await prisma.matchManoMano.findUnique({
    where: { id: match.proximoMatchId },
  });
  if (!proximo) return null;
  if (proximo.estado === "REALIZADO")
    return "Não é possível: o duelo seguinte no quadro já foi disputado.";

  const ordem = match.ordemNaRonda ?? 0;
  const limpaA = ordem % 2 === 0 && proximo.participanteAId === match.vencedorParticipanteId;
  const limpaB = ordem % 2 !== 0 && proximo.participanteBId === match.vencedorParticipanteId;
  if (limpaA || limpaB) {
    await prisma.matchManoMano.update({
      where: { id: proximo.id },
      data: limpaA ? { participanteAId: null } : { participanteBId: null },
    });
  }
  return null;
}

// ─────────────────────────────────────────────
// Competições — leitura
// ─────────────────────────────────────────────

export async function listarCompeticoesManoMano(filtro?: {
  tipo?: TipoManoMano;
  estado?: EstadoManoMano;
  escalaoId?: string;
}): Promise<Resultado<CompeticaoManoManoResumo[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");
  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  const legiveis = await escaloesLegiveis();
  let filtroEscalao: Prisma.CompeticaoManoManoWhereInput = {};
  if (filtro?.escalaoId) {
    if (!(await podeLerEscalao(filtro.escalaoId))) return ok([]);
    filtroEscalao = { escalaoId: filtro.escalaoId };
  } else if (legiveis !== "TODOS") {
    filtroEscalao = { OR: [{ escalaoId: null }, { escalaoId: { in: legiveis } }] };
  }

  const competicoes = await prisma.competicaoManoMano.findMany({
    where: {
      clubeId,
      epocaId: epoca.id,
      ...(filtro?.tipo ? { tipo: filtro.tipo } : {}),
      ...(filtro?.estado ? { estado: filtro.estado } : {}),
      ...filtroEscalao,
    },
    include: INCLUDE_RESUMO,
    orderBy: { criadoEm: "desc" },
  });
  return ok(competicoes);
}

export async function obterCompeticaoManoMano(
  id: string,
): Promise<Resultado<CompeticaoManoManoDetalhe>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const competicao = await prisma.competicaoManoMano.findFirst({
    where: { id, clubeId },
    include: INCLUDE_DETALHE,
  });
  if (!competicao) return erro("Competição não encontrada");
  if (competicao.escalaoId && !(await podeLerEscalao(competicao.escalaoId)))
    return erro("Sem permissão neste escalão");

  return ok(competicao);
}

// ─────────────────────────────────────────────
// Competições — escrita
// ─────────────────────────────────────────────

export async function criarCompeticaoManoMano(
  dados: unknown,
): Promise<Resultado<CompeticaoManoMano>> {
  const parsed = criarCompeticaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("MANOAMANO_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const clubeId = perm.ctx.clube.id;
  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  if (parsed.data.escalaoId) {
    const escalao = await prisma.escalao.findFirst({
      where: { id: parsed.data.escalaoId, clubeId },
      select: { id: true },
    });
    if (!escalao) return erro("O escalão selecionado não existe");
  }

  const d = parsed.data;
  const competicao = await prisma.$transaction(async (tx) => {
    const comp = await tx.competicaoManoMano.create({
      data: {
        clubeId,
        epocaId: epoca.id,
        escalaoId: d.escalaoId ?? null,
        nome: d.nome,
        tipo: d.tipo,
        ambito: d.ambito,
        formatoTorneio: d.formatoTorneio ?? null,
        formatoDuelo: d.formatoDuelo,
        golosParaVencer: d.golosParaVencer,
        duracaoLimiteMin: d.duracaoLimiteMin ?? null,
        pontosVitoria: d.pontosVitoria,
        pontosEmpate: d.pontosEmpate,
        pontosDerrota: d.pontosDerrota,
        integraTreinos: d.integraTreinos,
        criadorId: perm.ctx.utilizadorId,
      },
    });

    // Liga anual intra-clube com escalão: inscreve automaticamente os atletas
    // ativos desse escalão como participantes.
    if (
      d.tipo === "LIGA_ANUAL" &&
      d.ambito === "INTRA_CLUBE" &&
      d.escalaoId
    ) {
      const participacoes = await tx.atletaEscalao.findMany({
        where: {
          escalaoId: d.escalaoId,
          epocaId: epoca.id,
          estado: "ATIVO",
          escalao: { clubeId },
        },
        select: { atletaId: true },
      });
      if (participacoes.length > 0) {
        await tx.participanteManoMano.createMany({
          data: participacoes.map((p) => ({
            competicaoId: comp.id,
            tipo: "ATLETA" as const,
            atletaId: p.atletaId,
          })),
        });
      }
    }

    return comp;
  });

  revalidatePath(PATH);
  return ok(competicao);
}

export async function atualizarCompeticaoManoMano(
  id: string,
  dados: unknown,
): Promise<Resultado<CompeticaoManoMano>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = atualizarCompeticaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const existe = await prisma.competicaoManoMano.findFirst({ where: { id, clubeId } });
  if (!existe) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("MANOAMANO_GERIR", existe.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  const p = parsed.data;
  const data: Prisma.CompeticaoManoManoUpdateInput = {};

  if ("escalaoId" in p) {
    if (p.escalaoId) {
      const permDestino = await exigirCapacidade("MANOAMANO_GERIR", p.escalaoId);
      if (!permDestino.ok) return erro(permDestino.erro);
      const escalao = await prisma.escalao.findFirst({
        where: { id: p.escalaoId, clubeId },
        select: { id: true },
      });
      if (!escalao) return erro("O escalão selecionado não existe");
      data.escalao = { connect: { id: p.escalaoId } };
    } else {
      data.escalao = { disconnect: true };
    }
  }

  if (p.nome !== undefined) data.nome = p.nome;
  if (p.tipo !== undefined) data.tipo = p.tipo;
  if (p.ambito !== undefined) data.ambito = p.ambito;
  if (p.formatoTorneio !== undefined) data.formatoTorneio = p.formatoTorneio;
  if (p.formatoDuelo !== undefined) data.formatoDuelo = p.formatoDuelo;
  if (p.golosParaVencer !== undefined) data.golosParaVencer = p.golosParaVencer;
  if (p.duracaoLimiteMin !== undefined) data.duracaoLimiteMin = p.duracaoLimiteMin;
  if (p.pontosVitoria !== undefined) data.pontosVitoria = p.pontosVitoria;
  if (p.pontosEmpate !== undefined) data.pontosEmpate = p.pontosEmpate;
  if (p.pontosDerrota !== undefined) data.pontosDerrota = p.pontosDerrota;
  if (p.integraTreinos !== undefined) data.integraTreinos = p.integraTreinos;

  const competicao = await prisma.competicaoManoMano.update({ where: { id }, data });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return ok(competicao);
}

async function mudarEstadoCompeticao(
  id: string,
  estado: EstadoManoMano,
): Promise<Resultado<CompeticaoManoMano>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const existe = await prisma.competicaoManoMano.findFirst({ where: { id, clubeId } });
  if (!existe) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("MANOAMANO_GERIR", existe.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  const competicao = await prisma.competicaoManoMano.update({ where: { id }, data: { estado } });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return ok(competicao);
}

export async function concluirCompeticaoManoMano(
  id: string,
): Promise<Resultado<CompeticaoManoMano>> {
  return mudarEstadoCompeticao(id, "CONCLUIDA");
}

export async function arquivarCompeticaoManoMano(
  id: string,
): Promise<Resultado<CompeticaoManoMano>> {
  return mudarEstadoCompeticao(id, "ARQUIVADA");
}

export async function apagarCompeticaoManoMano(id: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const existe = await prisma.competicaoManoMano.findFirst({ where: { id, clubeId } });
  if (!existe) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("MANOAMANO_GERIR", existe.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  const comResultado = await prisma.matchManoMano.count({
    where: { competicaoId: id, estado: "REALIZADO" },
  });
  if (comResultado > 0)
    return erro("Não é possível apagar: já existem duelos realizados nesta competição.");

  await prisma.competicaoManoMano.delete({ where: { id } });
  revalidatePath(PATH);
  return ok(undefined);
}

// ─────────────────────────────────────────────
// Participantes
// ─────────────────────────────────────────────

export async function adicionarParticipante(
  competicaoId: string,
  dados: unknown,
): Promise<Resultado<ParticipanteManoMano>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = adicionarParticipanteSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const competicao = await prisma.competicaoManoMano.findFirst({
    where: { id: competicaoId, clubeId },
    select: { id: true, escalaoId: true, epocaId: true },
  });
  if (!competicao) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("MANOAMANO_GERIR", competicao.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  const d = parsed.data;

  if (d.tipo === "ATLETA") {
    const atletaId = d.atletaId as string;
    // Elegibilidade: com escalão, o atleta tem de estar ATIVO nesse escalão/época.
    if (competicao.escalaoId) {
      const participacao = await prisma.atletaEscalao.findFirst({
        where: {
          atletaId,
          escalaoId: competicao.escalaoId,
          epocaId: competicao.epocaId,
          estado: "ATIVO",
          escalao: { clubeId },
        },
        select: { id: true },
      });
      if (!participacao) return erro("O atleta não está ativo neste escalão.");
    } else {
      const atleta = await prisma.atleta.findFirst({
        where: { id: atletaId, clubeId },
        select: { id: true },
      });
      if (!atleta) return erro("Atleta não encontrado.");
    }

    // Reativa se já existiu (soft-removido); caso contrário cria.
    const existente = await prisma.participanteManoMano.findFirst({
      where: { competicaoId, atletaId },
    });
    if (existente) {
      if (existente.ativo) return erro("O atleta já participa nesta competição.");
      const reativado = await prisma.participanteManoMano.update({
        where: { id: existente.id },
        data: { ativo: true, seed: d.seed ?? null },
      });
      revalidatePath(`${PATH}/${competicaoId}`);
      return ok(reativado);
    }

    const participante = await prisma.participanteManoMano.create({
      data: { competicaoId, tipo: "ATLETA", atletaId, seed: d.seed ?? null },
    });
    revalidatePath(`${PATH}/${competicaoId}`);
    return ok(participante);
  }

  // EXTERNO
  if (d.clubeExternoId) {
    const clubeExterno = await prisma.clubeExterno.findFirst({
      where: { id: d.clubeExternoId, criadoPorClubeId: clubeId },
      select: { id: true },
    });
    if (!clubeExterno) return erro("Clube externo não encontrado.");
  }

  const participante = await prisma.participanteManoMano.create({
    data: {
      competicaoId,
      tipo: "EXTERNO",
      atletaExternoNome: d.atletaExternoNome as string,
      clubeExternoId: d.clubeExternoId ?? null,
      seed: d.seed ?? null,
    },
  });
  revalidatePath(`${PATH}/${competicaoId}`);
  return ok(participante);
}

export async function removerParticipante(participanteId: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const participante = await prisma.participanteManoMano.findFirst({
    where: { id: participanteId, competicao: { clubeId } },
    select: {
      id: true,
      competicaoId: true,
      competicao: { select: { escalaoId: true } },
    },
  });
  if (!participante) return erro("Participante não encontrado");

  const perm = await exigirCapacidade(
    "MANOAMANO_GERIR",
    participante.competicao.escalaoId ?? undefined,
  );
  if (!perm.ok) return erro(perm.erro);

  const comResultado = await prisma.matchManoMano.count({
    where: {
      estado: "REALIZADO",
      OR: [{ participanteAId: participanteId }, { participanteBId: participanteId }],
    },
  });
  if (comResultado > 0)
    return erro("Não é possível remover: o participante já tem duelos realizados.");

  await prisma.participanteManoMano.update({
    where: { id: participanteId },
    data: { ativo: false },
  });
  revalidatePath(`${PATH}/${participante.competicaoId}`);
  return ok(undefined);
}

// ─────────────────────────────────────────────
// Fixtures / bracket
// ─────────────────────────────────────────────

export async function preverFixturesManoMano(
  competicaoId: string,
  opcoes: unknown,
): Promise<Resultado<{ totalDuelos: number; jornadas: number; treinos: number }>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = gerarFixturesSchema.safeParse(opcoes ?? {});
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const competicao = await prisma.competicaoManoMano.findFirst({
    where: { id: competicaoId, clubeId },
  });
  if (!competicao) return erro("Competição não encontrada");
  if (competicao.escalaoId && !(await podeLerEscalao(competicao.escalaoId)))
    return erro("Sem permissão neste escalão");

  const participantes = await prisma.participanteManoMano.findMany({
    where: { competicaoId, ativo: true },
    orderBy: ORDER_PARTICIPANTES,
    select: { id: true, seed: true },
  });
  if (participantes.length < 2)
    return erro("Adiciona pelo menos 2 participantes antes de gerar os duelos.");

  const { jogos, jornadas } = calcularFixtures(participantes, parsed.data.duasMaos);
  const sessoes = await sessoesFuturasDoEscalao(competicao, clubeId, parsed.data.dataInicio);

  return ok({ totalDuelos: jogos.length, jornadas, treinos: sessoes.length });
}

export async function gerarFixturesManoMano(
  competicaoId: string,
  opcoes: unknown,
): Promise<Resultado<MatchManoMano[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = gerarFixturesSchema.safeParse(opcoes ?? {});
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const competicao = await prisma.competicaoManoMano.findFirst({
    where: { id: competicaoId, clubeId },
  });
  if (!competicao) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("MANOAMANO_GERIR", competicao.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  const jaAgendado = await prisma.matchManoMano.count({
    where: { competicaoId, ronda: { not: null } },
  });
  if (jaAgendado > 0)
    return erro("Duelos já gerados. Apaga os duelos existentes antes de regenerar.");

  const participantes = await prisma.participanteManoMano.findMany({
    where: { competicaoId, ativo: true },
    orderBy: ORDER_PARTICIPANTES,
    select: { id: true, seed: true },
  });
  if (participantes.length < 2)
    return erro("Adiciona pelo menos 2 participantes antes de gerar os duelos.");

  const { jogos } = calcularFixtures(participantes, parsed.data.duasMaos);
  if (jogos.length === 0) return erro("Não foi possível gerar duelos.");

  const sessoes = await sessoesFuturasDoEscalao(competicao, clubeId, parsed.data.dataInicio);

  // Distribui uma jornada por sessão de treino futura (por ordem cronológica).
  const rondas = [...new Set(jogos.map((j) => j.ronda))].sort((a, b) => a - b);
  const sessaoPorRonda = new Map<number, { sessaoId: string | null; data: Date | null }>();
  rondas.forEach((ronda, idx) => {
    const s = sessoes[idx];
    sessaoPorRonda.set(ronda, s ? { sessaoId: s.id, data: s.data } : { sessaoId: null, data: null });
  });

  const ordemPorRonda = new Map<number, number>();
  const dados = jogos.map((j) => {
    const ordem = ordemPorRonda.get(j.ronda) ?? 0;
    ordemPorRonda.set(j.ronda, ordem + 1);
    const s = sessaoPorRonda.get(j.ronda) ?? { sessaoId: null, data: null };
    return {
      competicaoId,
      participanteAId: j.aId,
      participanteBId: j.bId,
      ronda: j.ronda,
      ordemNaRonda: ordem,
      sessaoId: s.sessaoId,
      data: s.data,
      estado: "AGENDADO" as const,
    };
  });

  await prisma.matchManoMano.createMany({ data: dados });
  const criados = await prisma.matchManoMano.findMany({
    where: { competicaoId },
    orderBy: ORDER_MATCHES,
  });
  revalidatePath(`${PATH}/${competicaoId}`);
  return ok(criados);
}

export async function gerarBracketManoMano(
  competicaoId: string,
): Promise<Resultado<MatchManoMano[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const competicao = await prisma.competicaoManoMano.findFirst({
    where: { id: competicaoId, clubeId },
  });
  if (!competicao) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("MANOAMANO_GERIR", competicao.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  const comResultado = await prisma.matchManoMano.count({
    where: { competicaoId, estado: "REALIZADO" },
  });
  if (comResultado > 0)
    return erro("Não é possível gerar o quadro: já existem duelos realizados.");

  const jaBracket = await prisma.matchManoMano.count({
    where: { competicaoId, chaveBracket: { not: null } },
  });
  if (jaBracket > 0)
    return erro("Quadro já gerado. Apaga os duelos existentes antes de regenerar.");

  const participantes = await prisma.participanteManoMano.findMany({
    where: { competicaoId, ativo: true },
    orderBy: ORDER_PARTICIPANTES,
    select: { id: true },
  });
  if (participantes.length < 2)
    return erro("Adiciona pelo menos 2 participantes antes de gerar o quadro.");

  const plano = planearBracket(participantes.map((p) => p.id));
  if (plano.length === 0) return erro("Não foi possível gerar o quadro.");

  await prisma.matchManoMano.createMany({
    data: plano.map((m) => ({
      competicaoId,
      ronda: m.ronda,
      ordemNaRonda: m.ordemNaRonda,
      chaveBracket: m.chave,
      participanteAId: m.participanteAId,
      participanteBId: m.participanteBId,
      estado: "AGENDADO" as const,
    })),
  });

  const criados = await prisma.matchManoMano.findMany({
    where: { competicaoId, chaveBracket: { not: null } },
  });
  const idPorChave = new Map(criados.map((m) => [m.chaveBracket as string, m.id]));

  await prisma.$transaction(
    plano
      .filter((m) => m.proximoChave)
      .map((m) =>
        prisma.matchManoMano.update({
          where: { id: idPorChave.get(m.chave) as string },
          data: { proximoMatchId: idPorChave.get(m.proximoChave as string) as string },
        }),
      ),
  );

  const resultado = await prisma.matchManoMano.findMany({
    where: { competicaoId },
    orderBy: ORDER_MATCHES,
  });
  revalidatePath(`${PATH}/${competicaoId}`);
  return ok(resultado);
}

// ─────────────────────────────────────────────
// Duelos (matches)
// ─────────────────────────────────────────────

export async function agendarDuelo(matchId: string, dados: unknown): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = agendarDueloSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const match = await prisma.matchManoMano.findFirst({
    where: { id: matchId, competicao: { clubeId } },
    select: { id: true, competicaoId: true, competicao: { select: { escalaoId: true } } },
  });
  if (!match) return erro("Duelo não encontrado");

  const perm = await exigirCapacidade("MANOAMANO_GERIR", match.competicao.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  if (parsed.data.sessaoId) {
    const sessao = await prisma.sessao.findFirst({
      where: { id: parsed.data.sessaoId, escalao: { clubeId } },
      select: { id: true },
    });
    if (!sessao) return erro("Sessão não encontrada");
  }

  const data: Prisma.MatchManoManoUpdateInput = {};
  if (parsed.data.data !== undefined) data.data = parsed.data.data;
  if (parsed.data.local !== undefined) data.local = parsed.data.local;
  if (parsed.data.sessaoId !== undefined)
    data.sessao = parsed.data.sessaoId
      ? { connect: { id: parsed.data.sessaoId } }
      : { disconnect: true };

  await prisma.matchManoMano.update({ where: { id: matchId }, data });
  revalidatePath(`${PATH}/${match.competicaoId}`);
  return ok(undefined);
}

export async function registarResultadoManoMano(
  matchId: string,
  dados: unknown,
): Promise<Resultado<MatchManoMano>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const match = await prisma.matchManoMano.findFirst({
    where: { id: matchId, competicao: { clubeId } },
    include: {
      competicao: {
        select: { escalaoId: true, formatoDuelo: true, golosParaVencer: true },
      },
    },
  });
  if (!match) return erro("Duelo não encontrado");

  const perm = await exigirGerirOuTreinos(match.competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  if (match.estado === "REALIZADO")
    return erro("O duelo já tem resultado. Reabre-o antes de o alterar.");
  if (!match.participanteAId || !match.participanteBId)
    return erro("O duelo ainda não tem os dois participantes definidos.");

  const parsed = registarResultadoSchema.safeParse({
    ...(typeof dados === "object" && dados !== null ? dados : {}),
    formatoDuelo: match.competicao.formatoDuelo,
    golosParaVencer: match.competicao.golosParaVencer,
  });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const { golosA, golosB } = parsed.data;
  const empate = golosA === golosB;
  const vencedorParticipanteId = empate
    ? null
    : golosA > golosB
      ? match.participanteAId
      : match.participanteBId;

  const membro = await obterMembroAtual();

  const atualizado = await prisma.matchManoMano.update({
    where: { id: matchId },
    data: {
      golosA,
      golosB,
      estado: "REALIZADO",
      empate,
      vencedorParticipanteId,
      registadoPorId: membro?.membroId ?? null,
    },
  });

  // Progressão do quadro eliminatório: o vencedor avança para o duelo seguinte.
  if (match.proximoMatchId && vencedorParticipanteId) {
    const ordem = match.ordemNaRonda ?? 0;
    await prisma.matchManoMano.update({
      where: { id: match.proximoMatchId },
      data:
        ordem % 2 === 0
          ? { participanteAId: vencedorParticipanteId }
          : { participanteBId: vencedorParticipanteId },
    });
  }

  revalidatePath(`${PATH}/${match.competicaoId}`);
  return ok(atualizado);
}

export async function reabrirDuelo(matchId: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const match = await prisma.matchManoMano.findFirst({
    where: { id: matchId, competicao: { clubeId } },
    include: { competicao: { select: { escalaoId: true } } },
  });
  if (!match) return erro("Duelo não encontrado");

  const perm = await exigirCapacidade("MANOAMANO_GERIR", match.competicao.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  if (match.estado !== "REALIZADO")
    return erro("Só é possível reabrir um duelo realizado.");

  const bloqueio = await limparAvancoBracket(match);
  if (bloqueio) return erro(bloqueio);

  await prisma.matchManoMano.update({
    where: { id: matchId },
    data: {
      estado: "AGENDADO",
      golosA: null,
      golosB: null,
      empate: false,
      vencedorParticipanteId: null,
    },
  });
  revalidatePath(`${PATH}/${match.competicaoId}`);
  return ok(undefined);
}

export async function anularDuelo(matchId: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const match = await prisma.matchManoMano.findFirst({
    where: { id: matchId, competicao: { clubeId } },
    include: { competicao: { select: { escalaoId: true } } },
  });
  if (!match) return erro("Duelo não encontrado");

  const perm = await exigirCapacidade("MANOAMANO_GERIR", match.competicao.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  const bloqueio = await limparAvancoBracket(match);
  if (bloqueio) return erro(bloqueio);

  await prisma.matchManoMano.update({
    where: { id: matchId },
    data: {
      estado: "ANULADO",
      golosA: null,
      golosB: null,
      empate: false,
      vencedorParticipanteId: null,
    },
  });
  revalidatePath(`${PATH}/${match.competicaoId}`);
  return ok(undefined);
}

export async function criarDueloAdHoc(dados: unknown): Promise<Resultado<MatchManoMano>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = criarDueloAdHocSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const d = parsed.data;
  const competicao = await prisma.competicaoManoMano.findFirst({
    where: { id: d.competicaoId, clubeId },
    select: { id: true, escalaoId: true },
  });
  if (!competicao) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("MANOAMANO_GERIR", competicao.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  const participantes = await prisma.participanteManoMano.findMany({
    where: { id: { in: [d.participanteAId, d.participanteBId] }, competicaoId: d.competicaoId, ativo: true },
    select: { id: true },
  });
  if (participantes.length !== 2)
    return erro("Os participantes têm de pertencer a esta competição e estar ativos.");

  if (d.sessaoId) {
    const sessao = await prisma.sessao.findFirst({
      where: { id: d.sessaoId, escalao: { clubeId } },
      select: { id: true },
    });
    if (!sessao) return erro("Sessão não encontrada");
  }

  const match = await prisma.matchManoMano.create({
    data: {
      competicaoId: d.competicaoId,
      participanteAId: d.participanteAId,
      participanteBId: d.participanteBId,
      sessaoId: d.sessaoId ?? null,
      data: d.data ?? null,
      estado: "AGENDADO",
    },
  });
  revalidatePath(`${PATH}/${d.competicaoId}`);
  return ok(match);
}

// ─────────────────────────────────────────────
// Classificação (calculada)
// ─────────────────────────────────────────────

export async function obterClassificacaoManoMano(
  competicaoId: string,
): Promise<Resultado<LinhaClassificacaoManoMano[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const competicao = await prisma.competicaoManoMano.findFirst({
    where: { id: competicaoId, clubeId },
    select: {
      id: true,
      escalaoId: true,
      pontosVitoria: true,
      pontosEmpate: true,
      pontosDerrota: true,
    },
  });
  if (!competicao) return erro("Competição não encontrada");
  if (competicao.escalaoId && !(await podeLerEscalao(competicao.escalaoId)))
    return erro("Sem permissão neste escalão");

  const participantes = await prisma.participanteManoMano.findMany({
    where: { competicaoId, ativo: true },
    include: INCLUDE_PARTICIPANTE,
  });

  const matchesBrutos = await prisma.matchManoMano.findMany({
    where: {
      competicaoId,
      estado: "REALIZADO",
      golosA: { not: null },
      golosB: { not: null },
      participanteAId: { not: null },
      participanteBId: { not: null },
    },
    select: { participanteAId: true, participanteBId: true, golosA: true, golosB: true },
  });

  // Narrowing sem asserção: descarta linhas com campos nulos.
  const matches = matchesBrutos.flatMap((m) =>
    m.participanteAId === null ||
    m.participanteBId === null ||
    m.golosA === null ||
    m.golosB === null
      ? []
      : [{ aId: m.participanteAId, bId: m.participanteBId, ga: m.golosA, gb: m.golosB }],
  );

  const { pontosVitoria, pontosEmpate, pontosDerrota } = competicao;

  const linhas = new Map<string, LinhaClassificacaoManoMano>();
  for (const p of participantes) {
    linhas.set(p.id, {
      participanteId: p.id,
      nome: nomeParticipante(p),
      tipo: p.tipo,
      jogos: 0,
      vitorias: 0,
      empates: 0,
      derrotas: 0,
      golosMarcados: 0,
      golosSofridos: 0,
      diferencaGolos: 0,
      pontos: 0,
      posicao: 0,
    });
  }

  for (const m of matches) {
    const a = linhas.get(m.aId);
    const b = linhas.get(m.bId);
    if (!a || !b) continue;
    a.jogos += 1;
    b.jogos += 1;
    a.golosMarcados += m.ga;
    a.golosSofridos += m.gb;
    b.golosMarcados += m.gb;
    b.golosSofridos += m.ga;
    if (m.ga > m.gb) {
      a.vitorias += 1;
      a.pontos += pontosVitoria;
      b.derrotas += 1;
      b.pontos += pontosDerrota;
    } else if (m.gb > m.ga) {
      b.vitorias += 1;
      b.pontos += pontosVitoria;
      a.derrotas += 1;
      a.pontos += pontosDerrota;
    } else {
      a.empates += 1;
      b.empates += 1;
      a.pontos += pontosEmpate;
      b.pontos += pontosEmpate;
    }
  }

  for (const l of linhas.values()) l.diferencaGolos = l.golosMarcados - l.golosSofridos;

  // Confronto direto: pontos que x obteve contra y nos duelos entre ambos.
  const pontosDiretos = (x: string, y: string): number => {
    let px = 0;
    for (const m of matches) {
      const dir1 = m.aId === x && m.bId === y;
      const dir2 = m.aId === y && m.bId === x;
      if (!dir1 && !dir2) continue;
      const gx = dir1 ? m.ga : m.gb;
      const gy = dir1 ? m.gb : m.ga;
      if (gx > gy) px += pontosVitoria;
      else if (gx === gy) px += pontosEmpate;
      else px += pontosDerrota;
    }
    return px;
  };

  const ordenadas = [...linhas.values()].sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
    if (b.diferencaGolos !== a.diferencaGolos) return b.diferencaGolos - a.diferencaGolos;
    if (b.golosMarcados !== a.golosMarcados) return b.golosMarcados - a.golosMarcados;
    const dc = pontosDiretos(b.participanteId, a.participanteId) -
      pontosDiretos(a.participanteId, b.participanteId);
    if (dc !== 0) return dc;
    return a.nome.localeCompare(b.nome, "pt");
  });

  ordenadas.forEach((l, i) => {
    l.posicao = i + 1;
  });

  return ok(ordenadas);
}

// ─────────────────────────────────────────────
// Sessão de treino
// ─────────────────────────────────────────────

export async function obterDuelosDaSessao(
  sessaoId: string,
): Promise<Resultado<MatchManoManoComParticipantes[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({
    where: { id: sessaoId, escalao: { clubeId } },
    select: { id: true, escalaoId: true },
  });
  if (!sessao) return erro("Sessão não encontrada");
  if (!(await podeLerEscalao(sessao.escalaoId))) return erro("Sem permissão neste escalão");

  const matches = await prisma.matchManoMano.findMany({
    where: {
      sessaoId,
      competicao: { clubeId },
      estado: { in: ["AGENDADO", "REALIZADO"] },
    },
    include: INCLUDE_MATCH,
    orderBy: ORDER_MATCHES,
  });
  return ok(matches);
}

// ─────────────────────────────────────────────
// Clubes externos
// ─────────────────────────────────────────────

export async function criarClubeExterno(dados: unknown): Promise<Resultado<ClubeExterno>> {
  const parsed = criarClubeExternoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("MANOAMANO_GERIR");
  if (!perm.ok) return erro(perm.erro);

  const clube = await prisma.clubeExterno.create({
    data: {
      nome: parsed.data.nome,
      localidade: parsed.data.localidade ?? null,
      criadoPorClubeId: perm.ctx.clube.id,
    },
  });
  revalidatePath(PATH);
  return ok(clube);
}

export async function listarClubesExternos(): Promise<Resultado<ClubeExterno[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const clubes = await prisma.clubeExterno.findMany({
    where: { criadoPorClubeId: clubeId },
    orderBy: { nome: "asc" },
  });
  return ok(clubes);
}
