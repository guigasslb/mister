// lib/social/card-data.ts
// P4.7 — Camada de dados dos cards sociais (bíblia §3.16).
//
// Agregação server-side: lê o mínimo necessário da BD para cada tipo de card,
// sempre com scoping ao clube autenticado, verificação de permissão de leitura
// do escalão e bloqueio RGPD de escalões de formação jovem. Devolve uma
// resposta com `status` HTTP pronto a mapear pela rota de imagem.

import "server-only";
import { prisma } from "@/lib/db";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { podeLerEscalao } from "@/lib/permissoes";
import { eEscalaoFormacaoJovem } from "@/lib/schemas/social";

export interface IdentidadeClubeCard {
  nome: string;
  corPrimaria: string;
  logoUrl: string | null;
}

export interface CardResultadoData {
  clube: IdentidadeClubeCard;
  escalaoNome: string;
  adversario: string;
  casaFora: "CASA" | "FORA";
  golosMarcados: number;
  golosSofridos: number;
  data: string; // ISO
  competicao: string | null;
}

export interface CardMvpData {
  clube: IdentidadeClubeCard;
  escalaoNome: string;
  adversario: string;
  data: string; // ISO
  atleta: string;
  golos: number;
  assistencias: number;
  defesas: number | null;
  eGuardaRedes: boolean;
}

export interface CardRankingData {
  clube: IdentidadeClubeCard;
  escalaoNome: string;
  epocaNome: string;
  top: Array<{ nome: string; golos: number }>;
}

export type RespostaCard<T> =
  | { ok: true; dados: T }
  | { ok: false; status: number; mensagem: string };

const RGPD_MENSAGEM =
  "Cards sociais não disponíveis para escalões de formação jovem (RGPD)";

function mapClube(c: {
  nome: string;
  corPrimaria: string;
  logoUrl: string | null;
}): IdentidadeClubeCard {
  return {
    nome: c.nome,
    corPrimaria: c.corPrimaria,
    logoUrl: c.logoUrl,
  };
}

interface ErroCard {
  status: number;
  mensagem: string;
}

type JogoCard = NonNullable<
  Awaited<ReturnType<typeof carregarJogo>>
>;

function carregarJogo(clubeId: string, jogoId: string) {
  return prisma.jogo.findFirst({
    where: { id: jogoId, escalao: { clubeId } },
    select: {
      id: true,
      adversario: true,
      casaFora: true,
      golosMarcados: true,
      golosSofridos: true,
      data: true,
      competicao: true,
      escalaoId: true,
      escalao: { select: { nome: true } },
      // §23.11.3 regra 11: com subequipa, o card mostra o nome desta.
      equipaCompeticao: { select: { nome: true } },
      epoca: {
        select: {
          clube: {
            select: { nome: true, corPrimaria: true, logoUrl: true },
          },
        },
      },
    },
  });
}

/**
 * Resolve o contexto comum de um jogo (clube, permissões, RGPD) e devolve o
 * jogo com identidade do clube. Reutilizado pelos cards de resultado e MVP.
 */
async function contextoJogo(
  jogoId: string,
): Promise<{ erro: ErroCard; jogo?: undefined } | { erro?: undefined; jogo: JogoCard }> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return { erro: { status: 401, mensagem: "Não autenticado" } };

  const jogo = await carregarJogo(clubeId, jogoId);
  if (!jogo) return { erro: { status: 404, mensagem: "Jogo não encontrado" } };

  if (eEscalaoFormacaoJovem(jogo.escalao.nome)) {
    return { erro: { status: 403, mensagem: RGPD_MENSAGEM } };
  }
  if (!(await podeLerEscalao(jogo.escalaoId))) {
    return { erro: { status: 403, mensagem: "Sem permissão neste escalão" } };
  }
  return { jogo };
}

export async function obterCardResultado(
  jogoId: string,
): Promise<RespostaCard<CardResultadoData>> {
  const ctx = await contextoJogo(jogoId);
  if (ctx.erro)
    return { ok: false, status: ctx.erro.status, mensagem: ctx.erro.mensagem };
  const { jogo } = ctx;

  if (jogo.golosMarcados == null || jogo.golosSofridos == null) {
    return { ok: false, status: 404, mensagem: "Este jogo ainda não tem resultado" };
  }

  return {
    ok: true,
    dados: {
      clube: mapClube(jogo.epoca.clube),
      escalaoNome: jogo.equipaCompeticao?.nome ?? jogo.escalao.nome,
      adversario: jogo.adversario,
      casaFora: jogo.casaFora,
      golosMarcados: jogo.golosMarcados,
      golosSofridos: jogo.golosSofridos,
      data: jogo.data.toISOString(),
      competicao: jogo.competicao,
    },
  };
}

export async function obterCardMvp(
  jogoId: string,
): Promise<RespostaCard<CardMvpData>> {
  const ctx = await contextoJogo(jogoId);
  if (ctx.erro)
    return { ok: false, status: ctx.erro.status, mensagem: ctx.erro.mensagem };
  const { jogo } = ctx;

  const estatisticas = await prisma.estatisticaAtleta.findMany({
    where: { jogoId: jogo.id },
    select: {
      golos: true,
      assistencias: true,
      defesas: true,
      atleta: { select: { nome: true, posicoes: true } },
    },
  });

  // MVP = maior contribuição ofensiva/defensiva. Pontuação: golo=3, assist=2,
  // defesa=0.5 (relevante p/ GR). Desempate: golos, depois assistências.
  let melhor: (typeof estatisticas)[number] | null = null;
  let melhorScore = -1;
  for (const e of estatisticas) {
    const score = e.golos * 3 + e.assistencias * 2 + (e.defesas ?? 0) * 0.5;
    if (score <= 0) continue;
    if (
      score > melhorScore ||
      (score === melhorScore &&
        melhor != null &&
        (e.golos > melhor.golos ||
          (e.golos === melhor.golos && e.assistencias > melhor.assistencias)))
    ) {
      melhor = e;
      melhorScore = score;
    }
  }

  if (!melhor) {
    return { ok: false, status: 404, mensagem: "Sem dados suficientes para eleger MVP" };
  }

  const eGuardaRedes = melhor.atleta.posicoes.includes("GUARDA_REDES");
  return {
    ok: true,
    dados: {
      clube: mapClube(jogo.epoca.clube),
      escalaoNome: jogo.equipaCompeticao?.nome ?? jogo.escalao.nome,
      adversario: jogo.adversario,
      data: jogo.data.toISOString(),
      atleta: melhor.atleta.nome,
      golos: melhor.golos,
      assistencias: melhor.assistencias,
      defesas: eGuardaRedes ? melhor.defesas ?? 0 : null,
      eGuardaRedes,
    },
  };
}

export async function obterCardRanking(
  escalaoId: string,
  epocaId: string,
): Promise<RespostaCard<CardRankingData>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return { ok: false, status: 401, mensagem: "Não autenticado" };

  const escalao = await prisma.escalao.findFirst({
    where: { id: escalaoId, clubeId },
    select: {
      nome: true,
      clube: { select: { nome: true, corPrimaria: true, logoUrl: true } },
    },
  });
  if (!escalao) return { ok: false, status: 404, mensagem: "Escalão não encontrado" };

  if (eEscalaoFormacaoJovem(escalao.nome)) {
    return { ok: false, status: 403, mensagem: RGPD_MENSAGEM };
  }
  if (!(await podeLerEscalao(escalaoId))) {
    return { ok: false, status: 403, mensagem: "Sem permissão neste escalão" };
  }

  const epoca = await prisma.epoca.findFirst({
    where: { id: epocaId, clubeId },
    select: { nome: true },
  });
  if (!epoca) return { ok: false, status: 404, mensagem: "Época não encontrada" };

  const estatisticas = await prisma.estatisticaAtleta.findMany({
    where: { jogo: { epocaId, escalaoId } },
    select: { atletaId: true, golos: true, atleta: { select: { nome: true } } },
  });

  // Agregação por atletaId (evita fundir homónimos — bíblia §10.2).
  const porGolos = new Map<string, { nome: string; golos: number }>();
  for (const e of estatisticas) {
    if (e.golos <= 0) continue;
    const atual = porGolos.get(e.atletaId) ?? { nome: e.atleta.nome, golos: 0 };
    atual.golos += e.golos;
    porGolos.set(e.atletaId, atual);
  }

  const top = [...porGolos.values()]
    .sort((a, b) => b.golos - a.golos || a.nome.localeCompare(b.nome, "pt"))
    .slice(0, 5);

  return {
    ok: true,
    dados: {
      clube: mapClube(escalao.clube),
      escalaoNome: escalao.nome,
      epocaNome: epoca.nome,
      top,
    },
  };
}
