"use server";

import { prisma } from "@/lib/db";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import { podeLerEscalao } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { relatorioEquipaSchema } from "@/lib/schemas/analise";
import { filtroJogosDaSubequipa } from "@/lib/subequipas-filtro";
import { SELECT_JOGO_INTERNO, ehJogoInterno } from "@/lib/subequipas";

export interface RelatorioEquipa {
  escalaoNome: string;
  epocaNome: string;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  golosMarcados: number;
  golosSofridos: number;
  sessoes: number;
  nAtletas: number;
  marcadores: { nome: string; golos: number }[];
  assistentes: { nome: string; assistencias: number }[];
}

export async function obterRelatorioEquipa(
  escalaoId: string,
  equipaCompeticaoId?: string,
): Promise<Resultado<RelatorioEquipa>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");
  const parsed = relatorioEquipaSchema.safeParse({ equipaCompeticaoId });
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  const escalao = await prisma.escalao.findFirst({ where: { id: escalaoId, clubeId } });
  if (!escalao) return erro("Escalão não encontrado");
  if (!(await podeLerEscalao(escalaoId))) return erro("Sem permissão neste escalão");

  // §23.11.3 regra 10: filtro opcional «Equipa» (jogos e estatísticas dos atletas).
  const filtroEquipa = parsed.data.equipaCompeticaoId
    ? await filtroJogosDaSubequipa(prisma, clubeId, parsed.data.equipaCompeticaoId)
    : {};

  const [jogos, sessoes, nAtletas, estatisticas] = await Promise.all([
    prisma.jogo.findMany({
      where: { epocaId: epoca.id, escalaoId, ...filtroEquipa },
      // §23.11.3 regra 10: identifica os jogos internos (A vs B), fora dos totais.
      select: { golosMarcados: true, golosSofridos: true, ...SELECT_JOGO_INTERNO },
    }),
    // Só sessões JÁ EXECUTADAS (data < agora) — simetria com obterAnaliticoEscalao
    // (sessoesExecutadas) e com a contagem de jogos com resultado abaixo: o
    // relatório reflete o que já aconteceu, não o que está agendado.
    prisma.sessao.count({
      where: { epocaId: epoca.id, escalaoId, data: { lt: new Date() } },
    }),
    // F1: nº de atletas = participações ativas neste escalão/época.
    prisma.atletaEscalao.count({
      where: {
        epocaId: epoca.id,
        escalaoId,
        estado: "ATIVO",
        atleta: { ativo: true },
      },
    }),
    prisma.estatisticaAtleta.findMany({
      where: { jogo: { epocaId: epoca.id, escalaoId, ...filtroEquipa } },
      include: { atleta: { select: { id: true, nome: true } } },
    }),
  ]);

  let vitorias = 0;
  let empates = 0;
  let derrotas = 0;
  let golosMarcados = 0;
  let golosSofridos = 0;
  // Só jogos COM RESULTADO contam (golos ambos != null) — em simetria com
  // obterAnaliticoEscalao (jogosComResultado). Contar jogos.length incluía os
  // agendados/futuros e quebrava a identidade jogos === V + E + D.
  let jogosComResultado = 0;
  for (const j of jogos) {
    if (j.golosMarcados == null || j.golosSofridos == null || ehJogoInterno(j)) continue;
    jogosComResultado++;
    golosMarcados += j.golosMarcados;
    golosSofridos += j.golosSofridos;
    if (j.golosMarcados > j.golosSofridos) vitorias++;
    else if (j.golosMarcados < j.golosSofridos) derrotas++;
    else empates++;
  }

  // Agregação por atletaId (não por nome — evita fundir homónimos, secção 10.2).
  const porGolos = new Map<string, { nome: string; golos: number }>();
  const porAssist = new Map<string, { nome: string; assistencias: number }>();
  for (const e of estatisticas) {
    if (e.golos > 0) {
      const atual = porGolos.get(e.atletaId) ?? { nome: e.atleta.nome, golos: 0 };
      atual.golos += e.golos;
      porGolos.set(e.atletaId, atual);
    }
    if (e.assistencias > 0) {
      const atual = porAssist.get(e.atletaId) ?? { nome: e.atleta.nome, assistencias: 0 };
      atual.assistencias += e.assistencias;
      porAssist.set(e.atletaId, atual);
    }
  }
  const marcadores = [...porGolos.values()]
    .sort((a, b) => b.golos - a.golos)
    .slice(0, 10);
  const assistentes = [...porAssist.values()]
    .sort((a, b) => b.assistencias - a.assistencias)
    .slice(0, 10);

  return ok({
    escalaoNome: escalao.nome,
    epocaNome: epoca.nome,
    jogos: jogosComResultado,
    vitorias,
    empates,
    derrotas,
    golosMarcados,
    golosSofridos,
    sessoes,
    nAtletas,
    marcadores,
    assistentes,
  });
}
