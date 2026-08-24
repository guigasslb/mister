"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  Prisma,
  type Modalidade,
  type Posicao,
  type TipoEventoJogo,
  type TipoJogo,
  type TipoMetrica,
  type TipoRelatorio,
  type TipoSessao,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import {
  obterMembroAtual,
  podeLerEscalao,
  podeLerAlgumEscalao,
  escaloesLegiveis,
  type ContextoMembro,
} from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  agregarEstatisticas,
  blocoParaMinutos,
  type EstatisticasAgregadas,
  type LinhaEstatistica,
} from "@/lib/estatisticas";
import { filtroModalidadeJogo } from "@/lib/modalidade-escalao";
import {
  analiticoAtletaSchema,
  analiticoEscalaoSchema,
  analiticoClubeSchema,
  competicoesEscalaoSchema,
  gerarRelatorioSchema,
  exportarEscalaoCsvSchema,
  exportarAtletaCsvSchema,
} from "@/lib/schemas/analise";
import { paraCsv, juntarBlocosCsv, type ColunaCsv } from "@/lib/utils/csv";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos partilhados com a UI
// ─────────────────────────────────────────────────────────────────────────────

export interface JogoDadosAtleta {
  data: string; // "YYYY-MM-DD"
  adversario: string;
  golos: number;
  assistencias: number;
  defesas: number | null;
  golosSofridosGR: number | null;
  utilizado: boolean;
}

export interface PresencaMensal {
  mes: string; // "Jan", "Fev", …
  total: number;
  presentes: number;
  taxa: number; // 0–1
}

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

/** Época em contexto: a indicada (validada contra o clube) ou a ativa. */
async function resolverEpoca(
  clubeId: string,
  epocaId?: string,
): Promise<{ id: string; nome: string } | null> {
  if (epocaId) {
    return prisma.epoca.findFirst({
      where: { id: epocaId, clubeId },
      select: { id: true, nome: true },
    });
  }
  const ativa = await obterEpocaAtiva();
  return ativa ? { id: ativa.id, nome: ativa.nome } : null;
}

/** Autenticação + capacidade RELATORIOS_VER (secção 8.15 — pilar do produto). */
async function exigirRelatorios(): Promise<
  { ok: true; ctx: ContextoMembro } | { ok: false; erro: string }
> {
  const ctx = await obterMembroAtual();
  if (!ctx) return { ok: false, erro: "Não autenticado" };
  if (!ctx.capacidades.includes("RELATORIOS_VER"))
    return { ok: false, erro: "Sem permissão" };
  return { ok: true, ctx };
}

/**
 * Agrupa presenças por mês (vista individual). Função interna pura:
 * `total` = sessões do mês; `presentes` = sessões do mês onde o atleta esteve.
 */
function montarPresencasMensais(
  sessoes: { id: string; data: Date }[],
  presencaSessaoIds: Set<string>,
): PresencaMensal[] {
  const mesMap = new Map<string, { total: number; presentes: number; mesIdx: number }>();
  for (const s of sessoes) {
    const d = new Date(s.data);
    const mesIdx = d.getMonth();
    const key = `${d.getFullYear()}-${String(mesIdx + 1).padStart(2, "0")}`;
    const atual = mesMap.get(key) ?? { total: 0, presentes: 0, mesIdx };
    atual.total++;
    if (presencaSessaoIds.has(s.id)) atual.presentes++;
    mesMap.set(key, atual);
  }
  return [...mesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      mes: MESES[v.mesIdx],
      total: v.total,
      presentes: v.presentes,
      taxa: v.total > 0 ? v.presentes / v.total : 0,
    }));
}

const ESTADOS_PRESENTE = ["PRESENTE", "ATRASADO"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Séries simples do perfil do atleta (mantidas do MVP — sem exigir RELATORIOS_VER)
// ─────────────────────────────────────────────────────────────────────────────

export async function obterEvolucaoAtleta(
  atletaId: string,
): Promise<Resultado<JogoDadosAtleta[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");
  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  const atleta = await prisma.atleta.findFirst({
    where: { id: atletaId, clubeId },
    select: {
      participacoes: {
        where: { epocaId: epoca.id, estado: "ATIVO" },
        select: { escalaoId: true },
      },
    },
  });
  if (!atleta) return erro("Atleta não encontrado");
  if (!(await podeLerAlgumEscalao(atleta.participacoes.map((p) => p.escalaoId))))
    return erro("Sem permissão neste escalão");

  const estatisticas = await prisma.estatisticaAtleta.findMany({
    where: { atletaId, jogo: { epocaId: epoca.id } },
    include: { jogo: { select: { data: true, adversario: true } } },
    orderBy: { jogo: { data: "asc" } },
  });

  return ok(
    estatisticas.map((e) => ({
      data: e.jogo.data.toISOString().slice(0, 10),
      adversario: e.jogo.adversario,
      golos: e.golos,
      assistencias: e.assistencias,
      defesas: e.defesas,
      golosSofridosGR: e.golosSofridosGR,
      utilizado: e.utilizacao !== "NAO_UTILIZADO",
    })),
  );
}

export async function obterPresencasMensal(
  atletaId: string,
): Promise<Resultado<PresencaMensal[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");
  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  const atleta = await prisma.atleta.findFirst({
    where: { id: atletaId, clubeId },
    select: {
      criadoEm: true,
      dataIngresso: true,
      participacoes: {
        where: { epocaId: epoca.id, estado: "ATIVO" },
        select: { escalaoId: true },
      },
    },
  });
  if (!atleta) return erro("Atleta não encontrado");

  const escaloesAtivos = atleta.participacoes.map((p) => p.escalaoId);
  if (!(await podeLerAlgumEscalao(escaloesAtivos)))
    return erro("Sem permissão neste escalão");

  const ingresso = atleta.dataIngresso ?? atleta.criadoEm;

  const [sessoes, presencas] = await Promise.all([
    prisma.sessao.findMany({
      where: {
        epocaId: epoca.id,
        escalaoId: { in: escaloesAtivos },
        data: { gte: ingresso },
        // Só sessões NORMAL contam para assiduidade — CAPTACAO/EVENTO/ABERTO
        // não são treino regular e não devem inflar o denominador (BUG-P1-07).
        tipoSessao: "NORMAL",
      },
      select: { id: true, data: true },
      orderBy: { data: "asc" },
    }),
    prisma.presenca.findMany({
      where: {
        atletaId,
        estado: { in: [...ESTADOS_PRESENTE] },
        // Simetria com o denominador (sessoes): só presenças em sessões NORMAL.
        sessao: { epocaId: epoca.id, tipoSessao: "NORMAL" },
      },
      select: { sessaoId: true },
    }),
  ]);

  const presencasSet = new Set(presencas.map((p) => p.sessaoId));
  return ok(montarPresencasMensais(sessoes, presencasSet));
}

// ─────────────────────────────────────────────────────────────────────────────
// NÍVEL 1 — Analítico do atleta (secção 8.15 / 10.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnaliticoCaderneta {
  total: number;
  desbloqueadas: number;
  emProgresso: number;
}

export interface ComparacaoEquipa {
  /** Média de golos por atleta do escalão. */
  golosMediaEquipa: number;
  /** Taxa de presença média do escalão (presenças / (nAtletas × sessões)). */
  taxaPresencaMediaEquipa: number;
  /** Tempo de jogo médio por atleta (minutos, a partir dos blocos). */
  tempoJogoMedioEquipa: number;
}

/**
 * Métrica configurável agregada para um atleta (bíblia §8.14 — métricas do clube).
 * `total` = soma (NUMERO/ESCALA) ou nº de registos «verdadeiros» (BOOLEANO);
 * `media` = total / jogos com registo; `jogos` = nº de jogos com valor registado.
 */
export interface MetricaAgregadaAtleta {
  nome: string;
  tipo: TipoMetrica;
  total: number;
  media: number;
  jogos: number;
}

export interface AnaliticoAtleta {
  atleta: { id: string; nome: string; posicoes: Posicao[]; eGR: boolean };
  epoca: { id: string; nome: string };
  /** Escalão de contexto; null quando é a vista conjunta (todas as participações). */
  escalaoContexto: { id: string; nome: string } | null;
  agregado: EstatisticasAgregadas;
  presencasMensais: PresencaMensal[];
  evolucaoJogos: JogoDadosAtleta[];
  caderneta: AnaliticoCaderneta;
  /** Comparação com a média da equipa; só disponível na vista de um escalão. */
  comparacaoEquipa: ComparacaoEquipa | null;
  /** Métricas configuráveis do clube agregadas para o atleta (default `[]`). */
  metricas: MetricaAgregadaAtleta[];
  /** Cartões acumulados na época (disciplina — §3.7; default `{0,0}`). */
  cartoes: CartoesAcumulados;
}

/** Cartões acumulados (disciplina — §3.7). */
export interface CartoesAcumulados {
  amarelos: number;
  vermelhos: number;
}

/** Uma linha crua de `ValorMetrica` já com o tipo/ordem da métrica associada. */
interface ValorMetricaLinha {
  valor: number;
  metrica: { id: string; nome: string; tipo: TipoMetrica; ordem: number };
}

/**
 * Agrega valores de métricas configuráveis por métrica (vista de um atleta).
 * BOOLEANO conta registos com valor ≠ 0; NUMERO/ESCALA somam o valor.
 */
function agregarMetricasAtleta(valores: ValorMetricaLinha[]): MetricaAgregadaAtleta[] {
  const map = new Map<
    string,
    { nome: string; tipo: TipoMetrica; ordem: number; soma: number; trues: number; jogos: number }
  >();
  for (const v of valores) {
    const m = v.metrica;
    const acc =
      map.get(m.id) ?? { nome: m.nome, tipo: m.tipo, ordem: m.ordem, soma: 0, trues: 0, jogos: 0 };
    acc.soma += v.valor;
    if (v.valor !== 0) acc.trues++;
    acc.jogos++;
    map.set(m.id, acc);
  }
  return [...map.values()]
    .sort((a, b) => a.ordem - b.ordem)
    .map((a) => {
      const total = a.tipo === "BOOLEANO" ? a.trues : a.soma;
      return {
        nome: a.nome,
        tipo: a.tipo,
        total,
        media: a.jogos > 0 ? total / a.jogos : 0,
        jogos: a.jogos,
      };
    });
}

export async function obterAnaliticoAtleta(
  atletaId: string,
  escalaoId?: string,
  epocaId?: string,
  modalidade?: Modalidade,
): Promise<Resultado<AnaliticoAtleta>> {
  const parsed = analiticoAtletaSchema.safeParse({ atletaId, escalaoId, epocaId, modalidade });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const epoca = await resolverEpoca(clubeId, epocaId);
  if (!epoca) return erro("Nenhuma época ativa");

  const atleta = await prisma.atleta.findFirst({
    where: { id: atletaId, clubeId },
    select: {
      id: true,
      nome: true,
      posicoes: true,
      criadoEm: true,
      dataIngresso: true,
      participacoes: {
        where: { epocaId: epoca.id, estado: "ATIVO" },
        select: {
          escalaoId: true,
          escalao: {
            select: { nome: true, seccao: { select: { modalidade: true } } },
          },
        },
      },
    },
  });
  if (!atleta) return erro("Atleta não encontrado");

  const escaloesAtivos = atleta.participacoes.map((p) => p.escalaoId);
  if (!(await podeLerAlgumEscalao(escaloesAtivos)))
    return erro("Sem permissão neste escalão");

  // 🔁 v7 (§10.1/§10.8): a vista conjunta segmenta por modalidade — só entram as
  // participações da modalidade pedida (o escalão é monomodalidade via secção).
  const participacoesRelevantes = parsed.data.modalidade
    ? atleta.participacoes.filter(
        (p) => p.escalao.seccao?.modalidade === parsed.data.modalidade,
      )
    : atleta.participacoes;

  // Escalão de contexto: o pedido (tem de ser uma participação) ou vista conjunta.
  let escaloesCtx: string[];
  let escalaoContexto: { id: string; nome: string } | null;
  if (escalaoId) {
    const participacao = atleta.participacoes.find((p) => p.escalaoId === escalaoId);
    if (!participacao)
      return erro("O atleta não participa neste escalão nesta época");
    if (!(await podeLerEscalao(escalaoId))) return erro("Sem permissão neste escalão");
    escaloesCtx = [escalaoId];
    escalaoContexto = { id: escalaoId, nome: participacao.escalao.nome };
  } else {
    escaloesCtx = participacoesRelevantes.map((p) => p.escalaoId);
    escalaoContexto = null;
  }

  const eGR = atleta.posicoes.includes("GUARDA_REDES");
  const ingresso = atleta.dataIngresso ?? atleta.criadoEm;
  // Núcleo de jogos filtrado por modalidade efetiva (§10.8): atividade pontual
  // ou secção do escalão. Não afeta sessões/presenças (já limitadas a `escaloesCtx`).
  const filtroJogo = {
    epocaId: epoca.id,
    escalaoId: { in: escaloesCtx },
    ...filtroModalidadeJogo(parsed.data.modalidade),
  };

  const [
    jogosConvocado,
    estatisticas,
    sessoes,
    presencas,
    totalHabilidades,
    progressos,
    valoresMetricas,
  ] = await Promise.all([
      prisma.convocatoria.count({
        where: { convocado: true, atletaId, jogo: filtroJogo },
      }),
      prisma.estatisticaAtleta.findMany({
        where: { atletaId, jogo: filtroJogo },
        select: {
          utilizacao: true,
          blocoTempo: true,
          minutos: true,
          golos: true,
          assistencias: true,
          defesas: true,
          golosSofridosGR: true,
          // Disciplina (§3.7): cartões acumulados na época.
          cartaoAmarelo: true,
          cartaoVermelho: true,
          // §10.8: o formato determina os minutos por bloco (tempo de jogo).
          jogo: { select: { data: true, adversario: true, formato: true } },
        },
        orderBy: { jogo: { data: "asc" } },
      }),
      prisma.sessao.findMany({
        where: {
          epocaId: epoca.id,
          escalaoId: { in: escaloesCtx },
          data: { gte: ingresso },
          // Só sessões NORMAL contam para assiduidade — CAPTACAO/EVENTO/ABERTO
          // não são treino regular e não devem inflar o denominador (BUG-P1-07).
          tipoSessao: "NORMAL",
        },
        select: { id: true, data: true },
        orderBy: { data: "asc" },
      }),
      prisma.presenca.findMany({
        where: {
          atletaId,
          estado: { in: [...ESTADOS_PRESENTE] },
          // Simetria com o denominador (sessoes): só presenças desde o ingresso
          // e só em sessões NORMAL (secção 22.3 / BUG-P1-07).
          sessao: { epocaId: epoca.id, data: { gte: ingresso }, tipoSessao: "NORMAL" },
          escalaoId: { in: escaloesCtx },
        },
        select: { sessaoId: true },
      }),
      prisma.habilidade.count({ where: { clubeId } }),
      prisma.progressoHabilidade.findMany({
        where: { atletaId, epocaId: epoca.id },
        select: { estado: true },
      }),
      // Métricas configuráveis registadas por jogo (bíblia §8.14) — surgem agregadas.
      prisma.valorMetrica.findMany({
        where: { estatistica: { atletaId, jogo: filtroJogo } },
        select: {
          valor: true,
          metrica: { select: { id: true, nome: true, tipo: true, ordem: true } },
        },
      }),
    ]);

  const linhas: LinhaEstatistica[] = estatisticas.map((e) => ({
    utilizacao: e.utilizacao,
    blocoTempo: e.blocoTempo,
    minutos: e.minutos,
    golos: e.golos,
    assistencias: e.assistencias,
    defesas: e.defesas,
    golosSofridosGR: e.golosSofridosGR,
    // §10.8: tempo de jogo por bloco depende do formato (futsal null → 40/20).
    formato: e.jogo.formato,
  }));

  const presencasSet = new Set(presencas.map((p) => p.sessaoId));
  const agregado = agregarEstatisticas({
    eGR,
    jogosConvocado,
    sessoesTotais: sessoes.length,
    presencas: presencas.length,
    estatisticas: linhas,
  });

  const evolucaoJogos: JogoDadosAtleta[] = estatisticas.map((e) => ({
    data: e.jogo.data.toISOString().slice(0, 10),
    adversario: e.jogo.adversario,
    golos: e.golos,
    assistencias: e.assistencias,
    defesas: e.defesas,
    golosSofridosGR: e.golosSofridosGR,
    utilizado: e.utilizacao !== "NAO_UTILIZADO",
  }));

  const caderneta: AnaliticoCaderneta = {
    total: totalHabilidades,
    desbloqueadas: progressos.filter((p) => p.estado === "DESBLOQUEADO").length,
    emProgresso: progressos.filter((p) => p.estado === "EM_PROGRESSO").length,
  };

  const comparacaoEquipa =
    escalaoContexto !== null
      ? await calcularComparacaoEquipa(escalaoContexto.id, epoca.id, parsed.data.modalidade)
      : null;

  // Disciplina (§3.7): cartões acumulados na época.
  const cartoes: CartoesAcumulados = {
    amarelos: estatisticas.reduce((acc, e) => acc + e.cartaoAmarelo, 0),
    vermelhos: estatisticas.reduce((acc, e) => acc + e.cartaoVermelho, 0),
  };

  return ok({
    atleta: { id: atleta.id, nome: atleta.nome, posicoes: atleta.posicoes, eGR },
    epoca,
    escalaoContexto,
    agregado,
    presencasMensais: montarPresencasMensais(sessoes, presencasSet),
    evolucaoJogos,
    caderneta,
    comparacaoEquipa,
    metricas: agregarMetricasAtleta(valoresMetricas),
    cartoes,
  });
}

/** Médias da equipa de um escalão, para comparação individual (secção 8.15). */
async function calcularComparacaoEquipa(
  escalaoId: string,
  epocaId: string,
  modalidade?: Modalidade,
): Promise<ComparacaoEquipa> {
  // §10.8: em coerência com a vista do atleta, filtra os jogos pela modalidade.
  const filtroJogo = { epocaId, escalaoId, ...filtroModalidadeJogo(modalidade) };
  const [nAtletas, sessoes, estatisticas, presencas] = await Promise.all([
    prisma.atletaEscalao.count({
      where: { escalaoId, epocaId, estado: "ATIVO", atleta: { ativo: true } },
    }),
    // Só sessões NORMAL contam para assiduidade (BUG-P1-07): simetria com a
    // vista do atleta e com o numerador de presenças abaixo.
    prisma.sessao.count({ where: { epocaId, escalaoId, tipoSessao: "NORMAL" } }),
    prisma.estatisticaAtleta.findMany({
      where: { jogo: filtroJogo },
      // §10.8: formato para o tempo por bloco correto (futebol ≠ futsal).
      select: { golos: true, blocoTempo: true, jogo: { select: { formato: true } } },
    }),
    prisma.presenca.count({
      where: {
        escalaoId,
        estado: { in: [...ESTADOS_PRESENTE] },
        // Simetria numerador/denominador: só presenças em sessões NORMAL.
        sessao: { epocaId, tipoSessao: "NORMAL" },
      },
    }),
  ]);

  const totalGolos = estatisticas.reduce((acc, e) => acc + e.golos, 0);
  const totalTempo = estatisticas.reduce(
    (acc, e) => acc + blocoParaMinutos(e.blocoTempo, e.jogo?.formato),
    0,
  );
  const slots = nAtletas * sessoes;

  return {
    golosMediaEquipa: nAtletas > 0 ? totalGolos / nAtletas : 0,
    taxaPresencaMediaEquipa: slots > 0 ? presencas / slots : 0,
    tempoJogoMedioEquipa: nAtletas > 0 ? totalTempo / nAtletas : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NÍVEL 2 — Analítico do escalão/equipa (secção 10.2)
// ─────────────────────────────────────────────────────────────────────────────

export interface RankingAtleta {
  atletaId: string;
  nome: string;
  valor: number;
}

/** Assiduidade por atleta (top presenças). `taxa` = presenças / sessões do escalão. */
export interface RankingAssiduidade {
  atletaId: string;
  nome: string;
  presencas: number;
  taxa: number; // 0–1
}

export interface UtilizacaoAtleta {
  atletaId: string;
  nome: string;
  tempoJogoAcumulado: number;
  jogosUtilizados: number;
}

export interface ResultadoJogoResumo {
  jogoId: string;
  data: string; // "YYYY-MM-DD"
  adversario: string;
  golosMarcados: number | null;
  golosSofridos: number | null;
  resultado: "V" | "E" | "D" | null;
}

/** Ranking de atletas por uma métrica configurável (vista de equipa). */
export interface RankingMetrica {
  metrica: string;
  tipo: TipoMetrica;
  top: Array<{ atletaId: string; atletaNome: string; valor: number }>;
}

/** Disciplina por atleta (cartões acumulados no escalão/época — §3.7). */
export interface RankingDisciplina {
  atletaId: string;
  nome: string;
  amarelos: number;
  vermelhos: number;
}

export interface AnaliticoEscalao {
  escalao: { id: string; nome: string };
  epoca: { id: string; nome: string };
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  golosMarcados: number;
  golosSofridos: number;
  golosMarcadosMedia: number;
  golosSofridosMedia: number;
  sessoes: number;
  nAtletas: number;
  taxaPresencaMedia: number;
  marcadores: RankingAtleta[];
  assistentes: RankingAtleta[];
  maisUtilizados: UtilizacaoAtleta[];
  /** Top 5 atletas por taxa de presença (default `[]` em snapshots antigos). */
  rankingAssiduidade: RankingAssiduidade[];
  eventosPorTipo: Record<TipoEventoJogo, number>;
  presencaMensal: PresencaMensal[];
  distribuicaoTipoTreino: Record<TipoSessao, number>;
  resultados: ResultadoJogoResumo[];
  /** Rankings dos melhores atletas por cada métrica configurável (default `[]`). */
  rankingsMetricas: RankingMetrica[];
  /** Totais de cartões do escalão na época (disciplina — §3.7; default `{0,0}`). */
  cartoes: CartoesAcumulados;
  /** Ranking de disciplina por atleta (mais cartões primeiro; default `[]`). */
  rankingDisciplina: RankingDisciplina[];
}

/** Uma linha crua de `ValorMetrica` com métrica + atleta (vista de equipa). */
interface ValorMetricaEquipaLinha {
  valor: number;
  metrica: { id: string; nome: string; tipo: TipoMetrica; ordem: number };
  estatistica: { atletaId: string; atleta: { nome: string } };
}

/**
 * Constrói rankings por métrica configurável para toda a equipa.
 * Agrega por atleta (BOOLEANO conta registos ≠ 0; NUMERO soma; ESCALA média),
 * ordena decrescente e devolve o top 10 por métrica.
 */
function montarRankingsMetricas(valores: ValorMetricaEquipaLinha[]): RankingMetrica[] {
  interface AccMetrica {
    nome: string;
    tipo: TipoMetrica;
    ordem: number;
    atletas: Map<string, { nome: string; soma: number; trues: number; jogos: number }>;
  }
  const metricas = new Map<string, AccMetrica>();
  for (const v of valores) {
    const m = v.metrica;
    const accM =
      metricas.get(m.id) ?? { nome: m.nome, tipo: m.tipo, ordem: m.ordem, atletas: new Map() };
    const atletaId = v.estatistica.atletaId;
    const accA =
      accM.atletas.get(atletaId) ??
      { nome: v.estatistica.atleta.nome, soma: 0, trues: 0, jogos: 0 };
    accA.soma += v.valor;
    if (v.valor !== 0) accA.trues++;
    accA.jogos++;
    accM.atletas.set(atletaId, accA);
    metricas.set(m.id, accM);
  }

  return [...metricas.values()]
    .sort((a, b) => a.ordem - b.ordem)
    .map((m) => {
      const top = [...m.atletas.entries()]
        .map(([atletaId, a]) => {
          const valor =
            m.tipo === "BOOLEANO"
              ? a.trues
              : m.tipo === "ESCALA"
                ? a.jogos > 0
                  ? a.soma / a.jogos
                  : 0
                : a.soma;
          return { atletaId, atletaNome: a.nome, valor };
        })
        .filter((a) => a.valor > 0)
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10);
      return { metrica: m.nome, tipo: m.tipo, top };
    })
    .filter((r) => r.top.length > 0);
}

function resultadoJogo(m: number | null, s: number | null): "V" | "E" | "D" | null {
  if (m == null || s == null) return null;
  if (m > s) return "V";
  if (m < s) return "D";
  return "E";
}

export async function obterAnaliticoEscalao(
  escalaoId: string,
  epocaId?: string,
  competicaoId?: string,
): Promise<Resultado<AnaliticoEscalao>> {
  const parsed = analiticoEscalaoSchema.safeParse({ escalaoId, epocaId, competicaoId });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const escalao = await prisma.escalao.findFirst({
    where: { id: escalaoId, clubeId },
    select: { id: true, nome: true },
  });
  if (!escalao) return erro("Escalão não encontrado");
  if (!(await podeLerEscalao(escalaoId))) return erro("Sem permissão neste escalão");

  const epoca = await resolverEpoca(clubeId, epocaId);
  if (!epoca) return erro("Nenhuma época ativa");

  // P2.5: filtro opcional por competição (campeonato / taça / particulares).
  // Só afeta jogos e o que deles deriva (estatísticas, eventos, métricas);
  // treinos e presenças são transversais à competição, logo mantêm-se globais.
  const filtroCompeticao = competicaoId ? { competicaoId } : {};
  const filtroJogo = { epocaId: epoca.id, escalaoId, ...filtroCompeticao };

  const [jogos, sessoes, nAtletas, estatisticas, eventos, presencas, valoresMetricas] =
    await Promise.all([
    prisma.jogo.findMany({
      where: filtroJogo,
      select: { id: true, data: true, adversario: true, golosMarcados: true, golosSofridos: true },
      orderBy: { data: "asc" },
    }),
    prisma.sessao.findMany({
      where: { epocaId: epoca.id, escalaoId },
      select: { id: true, data: true, tipoSessao: true },
    }),
    prisma.atletaEscalao.count({
      where: { epocaId: epoca.id, escalaoId, estado: "ATIVO", atleta: { ativo: true } },
    }),
    prisma.estatisticaAtleta.findMany({
      where: { jogo: filtroJogo },
      select: {
        atletaId: true,
        golos: true,
        assistencias: true,
        blocoTempo: true,
        utilizacao: true,
        // Disciplina (§3.7): cartões para totais + ranking de disciplina.
        cartaoAmarelo: true,
        cartaoVermelho: true,
        // §10.8: formato do jogo para o tempo por bloco (futebol ≠ futsal).
        jogo: { select: { formato: true } },
        atleta: { select: { nome: true } },
      },
    }),
    prisma.eventoJogo.findMany({
      where: { jogo: filtroJogo },
      select: { tipo: true },
    }),
    prisma.presenca.findMany({
      where: {
        escalaoId,
        estado: { in: [...ESTADOS_PRESENTE] },
        sessao: { epocaId: epoca.id },
      },
      // atletaId + nome alimentam o ranking de assiduidade (mesma query, sem
      // round-trip adicional); sessaoId mantém a assiduidade mensal da equipa.
      select: { sessaoId: true, atletaId: true, atleta: { select: { nome: true } } },
    }),
    // Métricas configuráveis registadas por jogo (bíblia §8.14) — rankings de equipa.
    prisma.valorMetrica.findMany({
      where: { estatistica: { jogo: filtroJogo } },
      select: {
        valor: true,
        metrica: { select: { id: true, nome: true, tipo: true, ordem: true } },
        estatistica: { select: { atletaId: true, atleta: { select: { nome: true } } } },
      },
    }),
  ]);

  // Resultados V/E/D + golos.
  let vitorias = 0;
  let empates = 0;
  let derrotas = 0;
  let golosMarcados = 0;
  let golosSofridos = 0;
  const resultados: ResultadoJogoResumo[] = [];
  for (const j of jogos) {
    const r = resultadoJogo(j.golosMarcados, j.golosSofridos);
    if (r === "V") vitorias++;
    else if (r === "E") empates++;
    else if (r === "D") derrotas++;
    if (j.golosMarcados != null) golosMarcados += j.golosMarcados;
    if (j.golosSofridos != null) golosSofridos += j.golosSofridos;
    resultados.push({
      jogoId: j.id,
      data: j.data.toISOString().slice(0, 10),
      adversario: j.adversario,
      golosMarcados: j.golosMarcados,
      golosSofridos: j.golosSofridos,
      resultado: r,
    });
  }
  const jogosComResultado = jogos.filter(
    (j) => j.golosMarcados != null && j.golosSofridos != null,
  ).length;

  // Rankings + utilização (agregação por atletaId — evita fundir homónimos).
  const golosMap = new Map<string, { nome: string; valor: number }>();
  const assistMap = new Map<string, { nome: string; valor: number }>();
  const utilMap = new Map<string, { nome: string; tempo: number; jogos: number }>();
  // Disciplina (§3.7): cartões acumulados por atleta (para totais + ranking).
  const disciplinaMap = new Map<string, { nome: string; amarelos: number; vermelhos: number }>();
  for (const e of estatisticas) {
    if (e.golos > 0) {
      const a = golosMap.get(e.atletaId) ?? { nome: e.atleta.nome, valor: 0 };
      a.valor += e.golos;
      golosMap.set(e.atletaId, a);
    }
    if (e.assistencias > 0) {
      const a = assistMap.get(e.atletaId) ?? { nome: e.atleta.nome, valor: 0 };
      a.valor += e.assistencias;
      assistMap.set(e.atletaId, a);
    }
    const u = utilMap.get(e.atletaId) ?? { nome: e.atleta.nome, tempo: 0, jogos: 0 };
    u.tempo += blocoParaMinutos(e.blocoTempo, e.jogo?.formato);
    if (e.utilizacao !== "NAO_UTILIZADO") u.jogos++;
    utilMap.set(e.atletaId, u);
    if (e.cartaoAmarelo > 0 || e.cartaoVermelho > 0) {
      const d =
        disciplinaMap.get(e.atletaId) ?? { nome: e.atleta.nome, amarelos: 0, vermelhos: 0 };
      d.amarelos += e.cartaoAmarelo;
      d.vermelhos += e.cartaoVermelho;
      disciplinaMap.set(e.atletaId, d);
    }
  }
  const marcadores: RankingAtleta[] = [...golosMap.entries()]
    .map(([atletaId, v]) => ({ atletaId, nome: v.nome, valor: v.valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);
  const assistentes: RankingAtleta[] = [...assistMap.entries()]
    .map(([atletaId, v]) => ({ atletaId, nome: v.nome, valor: v.valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);
  const maisUtilizados: UtilizacaoAtleta[] = [...utilMap.entries()]
    .map(([atletaId, v]) => ({
      atletaId,
      nome: v.nome,
      tempoJogoAcumulado: v.tempo,
      jogosUtilizados: v.jogos,
    }))
    .sort((a, b) => b.tempoJogoAcumulado - a.tempoJogoAcumulado)
    .slice(0, 10);

  // Disciplina (§3.7): ranking por atleta (vermelhos pesam primeiro, depois
  // amarelos) e totais do escalão na época. Os totais somam TODOS os atletas
  // (não só o top 10 do ranking) para não subcontar.
  const disciplinaTodos = [...disciplinaMap.entries()].map(([atletaId, v]) => ({
    atletaId,
    nome: v.nome,
    amarelos: v.amarelos,
    vermelhos: v.vermelhos,
  }));
  const cartoes: CartoesAcumulados = {
    amarelos: disciplinaTodos.reduce((acc, d) => acc + d.amarelos, 0),
    vermelhos: disciplinaTodos.reduce((acc, d) => acc + d.vermelhos, 0),
  };
  const rankingDisciplina: RankingDisciplina[] = [...disciplinaTodos]
    .sort(
      (a, b) =>
        b.vermelhos - a.vermelhos ||
        b.amarelos - a.amarelos ||
        a.nome.localeCompare(b.nome, "pt"),
    )
    .slice(0, 10);

  // Eventos por tipo (todas as chaves inicializadas a 0).
  const eventosPorTipo = Object.fromEntries(
    (Object.values(EVENTO_TIPOS) as TipoEventoJogo[]).map((t) => [t, 0]),
  ) as Record<TipoEventoJogo, number>;
  for (const ev of eventos) eventosPorTipo[ev.tipo]++;

  // Distribuição de tipos de treino.
  const distribuicaoTipoTreino = Object.fromEntries(
    (Object.values(SESSAO_TIPOS) as TipoSessao[]).map((t) => [t, 0]),
  ) as Record<TipoSessao, number>;
  for (const s of sessoes) distribuicaoTipoTreino[s.tipoSessao]++;

  // Assiduidade mensal da equipa: presentes / (nAtletas × sessões do mês).
  const presencasSet = presencas.map((p) => p.sessaoId);
  const presencasPorSessao = new Map<string, number>();
  for (const id of presencasSet)
    presencasPorSessao.set(id, (presencasPorSessao.get(id) ?? 0) + 1);
  const mesEquipa = new Map<string, { sessoes: number; presentes: number; mesIdx: number }>();
  for (const s of sessoes) {
    const d = new Date(s.data);
    const mesIdx = d.getMonth();
    const key = `${d.getFullYear()}-${String(mesIdx + 1).padStart(2, "0")}`;
    const atual = mesEquipa.get(key) ?? { sessoes: 0, presentes: 0, mesIdx };
    atual.sessoes++;
    atual.presentes += presencasPorSessao.get(s.id) ?? 0;
    mesEquipa.set(key, atual);
  }
  const presencaMensal: PresencaMensal[] = [...mesEquipa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => {
      const total = v.sessoes * nAtletas;
      return {
        mes: MESES[v.mesIdx],
        total,
        presentes: v.presentes,
        taxa: total > 0 ? v.presentes / total : 0,
      };
    });

  const slots = nAtletas * sessoes.length;

  // Ranking de assiduidade por atleta (top 5). Reutiliza a MESMA lista de
  // presenças já lida acima — sem query adicional. Denominador = total de
  // sessões do escalão, em simetria com taxaPresencaMedia da equipa
  // (nAtletas × sessoes.length); a taxa por atleta fica assim comparável.
  const totalSessoes = sessoes.length;
  const assiduidadeMap = new Map<string, { nome: string; presencas: number }>();
  for (const p of presencas) {
    if (!p.atletaId) continue;
    const acc = assiduidadeMap.get(p.atletaId) ?? { nome: p.atleta?.nome ?? "—", presencas: 0 };
    acc.presencas++;
    assiduidadeMap.set(p.atletaId, acc);
  }
  const rankingAssiduidade: RankingAssiduidade[] = [...assiduidadeMap.entries()]
    .map(([atletaId, v]) => ({
      atletaId,
      nome: v.nome,
      presencas: v.presencas,
      taxa: totalSessoes > 0 ? Math.min(v.presencas / totalSessoes, 1) : 0,
    }))
    .filter((a) => a.presencas > 0)
    .sort(
      (a, b) =>
        b.taxa - a.taxa ||
        b.presencas - a.presencas ||
        a.nome.localeCompare(b.nome, "pt"),
    )
    .slice(0, 5);

  return ok({
    escalao,
    epoca,
    jogos: jogos.length,
    vitorias,
    empates,
    derrotas,
    golosMarcados,
    golosSofridos,
    golosMarcadosMedia: jogosComResultado > 0 ? golosMarcados / jogosComResultado : 0,
    golosSofridosMedia: jogosComResultado > 0 ? golosSofridos / jogosComResultado : 0,
    sessoes: sessoes.length,
    nAtletas,
    // Cap a 1 (100%): atletas que saíram a meio da época podem gerar presenças
    // sem contribuir para o denominador de slots atual, o que inflaria a taxa
    // acima de 100% (BUG-P1-06). Simetria com o ranking (Math.min acima).
    taxaPresencaMedia: slots > 0 ? Math.min(presencas.length / slots, 1) : 0,
    marcadores,
    assistentes,
    maisUtilizados,
    rankingAssiduidade,
    eventosPorTipo,
    presencaMensal,
    distribuicaoTipoTreino,
    resultados,
    rankingsMetricas: montarRankingsMetricas(valoresMetricas),
    cartoes,
    rankingDisciplina,
  });
}

/** Opção do filtro por competição (bíblia §10.2 — separar contextos). */
export interface CompeticaoOpcao {
  id: string;
  nome: string;
  tipo: TipoJogo;
}

/**
 * Competições de um escalão/época que têm pelo menos um jogo registado.
 * Alimenta o filtro do painel de analíticos (P2.5). Só as competições com
 * jogos aparecem — evita opções vazias no seletor.
 */
export async function obterCompeticoesEscalao(
  escalaoId: string,
  epocaId?: string,
): Promise<Resultado<CompeticaoOpcao[]>> {
  const parsed = competicoesEscalaoSchema.safeParse({ escalaoId, epocaId });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const escalao = await prisma.escalao.findFirst({
    where: { id: escalaoId, clubeId },
    select: { id: true },
  });
  if (!escalao) return erro("Escalão não encontrado");
  if (!(await podeLerEscalao(escalaoId))) return erro("Sem permissão neste escalão");

  const epoca = await resolverEpoca(clubeId, epocaId);
  if (!epoca) return erro("Nenhuma época ativa");

  const competicoes = await prisma.competicao.findMany({
    where: {
      clubeId,
      escalaoId,
      epocaId: epoca.id,
      jogos: { some: { epocaId: epoca.id, escalaoId } },
    },
    select: { id: true, nome: true, tipo: true },
    orderBy: [{ tipo: "asc" }, { nome: "asc" }],
  });

  return ok(competicoes);
}

// Valores dos enums (Prisma gera os enums como objetos runtime).
const EVENTO_TIPOS: Record<TipoEventoJogo, TipoEventoJogo> = {
  GOLO: "GOLO",
  ASSISTENCIA: "ASSISTENCIA",
  FALTA: "FALTA",
  CARTAO_AMARELO: "CARTAO_AMARELO",
  CARTAO_VERMELHO: "CARTAO_VERMELHO",
  SUBSTITUICAO: "SUBSTITUICAO",
  DEFESA: "DEFESA",
  GOLO_SOFRIDO: "GOLO_SOFRIDO",
  TIMEOUT: "TIMEOUT",
  // Futebol (§3.7)
  REMATE: "REMATE",
  CANTO: "CANTO",
  FORA_DE_JOGO: "FORA_DE_JOGO",
  DESARME: "DESARME",
};

const SESSAO_TIPOS: Record<TipoSessao, TipoSessao> = {
  NORMAL: "NORMAL",
  ABERTO: "ABERTO",
  CAPTACAO: "CAPTACAO",
  EVENTO: "EVENTO",
};

// ─────────────────────────────────────────────────────────────────────────────
// NÍVEL 3 — Analítico do clube (transversal — secção 10.3)
// ─────────────────────────────────────────────────────────────────────────────

export interface EscalaoResumoClube {
  escalaoId: string;
  nome: string;
  /** Modalidade da secção do escalão (null = escalão sem secção). Filtro P2.4. */
  modalidade: Modalidade | null;
  nAtletas: number;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  golosMarcados: number;
  golosSofridos: number;
  sessoes: number;
  taxaPresencaMedia: number;
}

/** Balanço de resultados agregado do clube na época (todos os escalões). */
export interface BalancoEpocaClube {
  vitorias: number;
  empates: number;
  derrotas: number;
  jogos: number;
  golosMarcados: number;
  golosSofridos: number;
}

export interface AnaliticoClubeEpoca {
  clube: { id: string; nome: string };
  epoca: { id: string; nome: string };
  escaloes: EscalaoResumoClube[];
  totais: {
    nAtletas: number;
    jogos: number;
    vitorias: number;
    empates: number;
    derrotas: number;
    golosMarcados: number;
    golosSofridos: number;
    sessoes: number;
    taxaPresencaMediaGlobal: number;
  };
  /**
   * Balanço de resultados do clube inteiro na época — soma os jogos de TODOS
   * os escalões visíveis (campeonato, taça e amigáveis; sem distinção de tipo).
   * Espelha os campos V/E/D + golos de `totais`, expostos como bloco autónomo
   * para a secção "Resultados da época" do painel (P2-06).
   */
  balanco: BalancoEpocaClube;
}

export async function obterAnaliticoClubeEpoca(
  epocaId?: string,
): Promise<Resultado<AnaliticoClubeEpoca>> {
  const parsed = analiticoClubeSchema.safeParse({ epocaId });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);
  const clube = perm.ctx.clube;

  const epoca = await resolverEpoca(clube.id, epocaId);
  if (!epoca) return erro("Nenhuma época ativa");

  // Escalões visíveis ao membro (Admin/DT = todos; treinador = os seus + visíveis).
  const legiveis = await escaloesLegiveis();
  const escaloes = await prisma.escalao.findMany({
    where: {
      clubeId: clube.id,
      ...(legiveis === "TODOS" ? {} : { id: { in: legiveis } }),
    },
    select: {
      id: true,
      nome: true,
      ordem: true,
      // P2.4: modalidade da secção alimenta o filtro client-side no painel do clube.
      seccao: { select: { modalidade: true } },
    },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  if (escaloes.length === 0) return erro("Sem escalões visíveis");

  const escalaoIds = escaloes.map((e) => e.id);
  const filtroEpocaEscaloes = { epocaId: epoca.id, escalaoId: { in: escalaoIds } };

  const [jogos, sessoes, participacoes, presencas] = await Promise.all([
    prisma.jogo.findMany({
      where: filtroEpocaEscaloes,
      select: { escalaoId: true, golosMarcados: true, golosSofridos: true },
    }),
    prisma.sessao.groupBy({
      by: ["escalaoId"],
      where: filtroEpocaEscaloes,
      _count: { _all: true },
    }),
    prisma.atletaEscalao.groupBy({
      by: ["escalaoId"],
      where: {
        epocaId: epoca.id,
        escalaoId: { in: escalaoIds },
        estado: "ATIVO",
        atleta: { ativo: true },
      },
      _count: { _all: true },
    }),
    prisma.presenca.groupBy({
      by: ["escalaoId"],
      where: {
        escalaoId: { in: escalaoIds },
        estado: { in: [...ESTADOS_PRESENTE] },
        sessao: { epocaId: epoca.id },
      },
      _count: { _all: true },
    }),
  ]);

  const nAtletasPorEscalao = new Map<string, number>(
    participacoes.map((p) => [p.escalaoId, p._count._all]),
  );
  const sessoesPorEscalao = new Map<string, number>(
    sessoes.map((s) => [s.escalaoId, s._count._all]),
  );
  const presencasPorEscalao = new Map<string, number>(
    presencas.map((p) => [p.escalaoId, p._count._all]),
  );

  interface Acc {
    jogos: number;
    vitorias: number;
    empates: number;
    derrotas: number;
    golosMarcados: number;
    golosSofridos: number;
  }
  const jogosPorEscalao = new Map<string, Acc>();
  for (const j of jogos) {
    const a =
      jogosPorEscalao.get(j.escalaoId) ??
      { jogos: 0, vitorias: 0, empates: 0, derrotas: 0, golosMarcados: 0, golosSofridos: 0 };
    a.jogos++;
    const r = resultadoJogo(j.golosMarcados, j.golosSofridos);
    if (r === "V") a.vitorias++;
    else if (r === "E") a.empates++;
    else if (r === "D") a.derrotas++;
    if (j.golosMarcados != null) a.golosMarcados += j.golosMarcados;
    if (j.golosSofridos != null) a.golosSofridos += j.golosSofridos;
    jogosPorEscalao.set(j.escalaoId, a);
  }

  const resumos: EscalaoResumoClube[] = escaloes.map((e) => {
    const j = jogosPorEscalao.get(e.id);
    const nAtletas = nAtletasPorEscalao.get(e.id) ?? 0;
    const nSessoes = sessoesPorEscalao.get(e.id) ?? 0;
    const nPresencas = presencasPorEscalao.get(e.id) ?? 0;
    const slots = nAtletas * nSessoes;
    return {
      escalaoId: e.id,
      nome: e.nome,
      modalidade: e.seccao?.modalidade ?? null,
      nAtletas,
      jogos: j?.jogos ?? 0,
      vitorias: j?.vitorias ?? 0,
      empates: j?.empates ?? 0,
      derrotas: j?.derrotas ?? 0,
      golosMarcados: j?.golosMarcados ?? 0,
      golosSofridos: j?.golosSofridos ?? 0,
      sessoes: nSessoes,
      taxaPresencaMedia: slots > 0 ? nPresencas / slots : 0,
    };
  });

  const totais = resumos.reduce(
    (acc, r) => {
      acc.nAtletas += r.nAtletas;
      acc.jogos += r.jogos;
      acc.vitorias += r.vitorias;
      acc.empates += r.empates;
      acc.derrotas += r.derrotas;
      acc.golosMarcados += r.golosMarcados;
      acc.golosSofridos += r.golosSofridos;
      acc.sessoes += r.sessoes;
      return acc;
    },
    {
      nAtletas: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0,
      golosMarcados: 0, golosSofridos: 0, sessoes: 0,
    },
  );
  const slotsGlobais = resumos.reduce((acc, r) => acc + r.nAtletas * r.sessoes, 0);
  const presencasGlobais = [...presencasPorEscalao.values()].reduce((a, b) => a + b, 0);

  // Balanço de resultados (P2-06): mesma fonte que `totais` (soma de todos os
  // jogos de todos os escalões visíveis), reexposta como bloco V/E/D + golos.
  const balanco: BalancoEpocaClube = {
    vitorias: totais.vitorias,
    empates: totais.empates,
    derrotas: totais.derrotas,
    jogos: totais.jogos,
    golosMarcados: totais.golosMarcados,
    golosSofridos: totais.golosSofridos,
  };

  return ok({
    clube: { id: clube.id, nome: clube.nome },
    epoca,
    escaloes: resumos,
    totais: {
      ...totais,
      taxaPresencaMediaGlobal: slotsGlobais > 0 ? presencasGlobais / slotsGlobais : 0,
    },
    balanco,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatório de época partilhável (secção 3.10 / 10.6)
// ─────────────────────────────────────────────────────────────────────────────

export interface RelatorioGerado {
  id: string;
  token: string;
}

export interface IdentidadeClube {
  nome: string;
  corPrimaria: string;
  corSecundaria: string;
  logoUrl: string | null;
}

/** Snapshot imutável guardado em `dadosSnapshot` (bíblia §10.6). */
interface RelatorioSnapshot {
  tipo: TipoRelatorio;
  clube: IdentidadeClube;
  epoca: { nome: string };
  geradoEm: string; // ISO
  dados: AnaliticoAtleta | AnaliticoEscalao | AnaliticoClubeEpoca;
}

export interface RelatorioPublico {
  tipo: TipoRelatorio;
  clube: IdentidadeClube;
  epoca: { nome: string };
  geradoEm: string;
  dados: AnaliticoAtleta | AnaliticoEscalao | AnaliticoClubeEpoca;
}

export interface RelatorioResumo {
  id: string;
  token: string;
  tipo: TipoRelatorio;
  epocaId: string;
  escalaoId: string | null;
  atletaId: string | null;
  expiraEm: Date | null;
  criadoEm: Date;
}

const PATH_RELATORIOS = "/relatorios";

function gerarToken(): string {
  // 24 bytes → 32 chars base64url, não-adivinhável (bíblia §9 — token não-adivinhável).
  return randomBytes(24).toString("base64url");
}

export async function gerarRelatorioPartilhado(
  dados: unknown,
): Promise<Resultado<RelatorioGerado>> {
  const parsed = gerarRelatorioSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const epoca = await resolverEpoca(clubeId, parsed.data.epocaId);
  if (!epoca) return erro("Nenhuma época ativa");

  // Constrói o snapshot chamando o analítico correspondente (reutiliza permissões).
  let conteudo: AnaliticoAtleta | AnaliticoEscalao | AnaliticoClubeEpoca;
  if (parsed.data.tipo === "EPOCA_ATLETA") {
    const r = await obterAnaliticoAtleta(parsed.data.atletaId!, parsed.data.escalaoId, epoca.id);
    if (!r.sucesso) return erro(r.erro, r.camposInvalidos);
    conteudo = r.dados;
  } else if (parsed.data.tipo === "EPOCA_EQUIPA") {
    const r = await obterAnaliticoEscalao(parsed.data.escalaoId!, epoca.id);
    if (!r.sucesso) return erro(r.erro, r.camposInvalidos);
    conteudo = r.dados;
  } else {
    const r = await obterAnaliticoClubeEpoca(epoca.id);
    if (!r.sucesso) return erro(r.erro, r.camposInvalidos);
    conteudo = r.dados;
  }

  const clube = perm.ctx.clube;
  const snapshot: RelatorioSnapshot = {
    tipo: parsed.data.tipo,
    clube: {
      nome: clube.nome,
      corPrimaria: clube.corPrimaria,
      corSecundaria: clube.corSecundaria,
      logoUrl: clube.logoUrl,
    },
    epoca: { nome: epoca.nome },
    geradoEm: new Date().toISOString(),
    dados: conteudo,
  };

  const registo = await prisma.relatorioPartilhado.create({
    data: {
      clubeId,
      token: gerarToken(),
      tipo: parsed.data.tipo,
      epocaId: epoca.id,
      escalaoId: parsed.data.escalaoId ?? null,
      atletaId: parsed.data.atletaId ?? null,
      dadosSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      expiraEm: parsed.data.expiraEm ?? null,
      criadorId: perm.ctx.utilizadorId,
    },
    select: { id: true, token: true },
  });

  revalidatePath(PATH_RELATORIOS);
  return ok(registo);
}

/**
 * Leitura PÚBLICA de um relatório partilhado pelo token (sem autenticação).
 * Devolve o snapshot imutável + identidade do clube. Respeita a expiração.
 */
export async function obterRelatorioPorToken(
  token: string,
): Promise<Resultado<RelatorioPublico>> {
  if (!token || typeof token !== "string") return erro("Relatório não encontrado");

  // A rota pública `/r/[token]` é acedida sem autenticação com tokens arbitrários.
  // Qualquer erro da query (token malformado, falha de ligação) tem de resultar
  // num "não encontrado" tratado — nunca num 500 não capturado na rota pública.
  const registo = await prisma.relatorioPartilhado
    .findUnique({
      where: { token },
      select: { tipo: true, dadosSnapshot: true, expiraEm: true },
    })
    .catch(() => null);
  if (!registo || registo.dadosSnapshot == null) return erro("Relatório não encontrado");
  if (registo.expiraEm && registo.expiraEm.getTime() < Date.now())
    return erro("Este relatório expirou");

  const snap = registo.dadosSnapshot as unknown as RelatorioSnapshot;
  return ok({
    tipo: registo.tipo,
    clube: snap.clube,
    epoca: snap.epoca,
    geradoEm: snap.geradoEm,
    dados: snap.dados,
  });
}

export async function listarRelatoriosPartilhados(): Promise<Resultado<RelatorioResumo[]>> {
  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);

  const registos = await prisma.relatorioPartilhado.findMany({
    where: { clubeId: perm.ctx.clube.id },
    select: {
      id: true,
      token: true,
      tipo: true,
      epocaId: true,
      escalaoId: true,
      atletaId: true,
      expiraEm: true,
      criadoEm: true,
    },
    orderBy: { criadoEm: "desc" },
  });
  return ok(registos);
}

export async function revogarRelatorioPartilhado(id: string): Promise<Resultado<void>> {
  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);

  const registo = await prisma.relatorioPartilhado.findFirst({
    where: { id, clubeId: perm.ctx.clube.id },
    select: { id: true },
  });
  if (!registo) return erro("Relatório não encontrado");

  await prisma.relatorioPartilhado.delete({ where: { id } });
  revalidatePath(PATH_RELATORIOS);
  return ok(undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// F1.2 — Export CSV dos analíticos (bíblia §8.15)
//
// Serialização das estruturas analíticas JÁ calculadas (`AnaliticoEscalao` /
// `AnaliticoAtleta`) — zero recálculo. Cada action delega em
// `obterAnaliticoEscalao` / `obterAnaliticoAtleta`, que já garantem
// autenticação, capacidade `RELATORIOS_VER` e leitura do escalão (`podeLerEscalao`);
// os números do CSV batem por construção com os dos painéis (Regra Nº 6 — a
// fonte é a estrutura analítica, não um cálculo paralelo).
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportacaoCsv {
  csv: string;
  nomeFicheiro: string;
}

/** Arredonda a no máximo 2 casas decimais (ponto decimal via `String()` no CSV). */
function arredondar2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Percentagem com uma casa decimal e ponto decimal (ex.: 0.153 → "15.3"). */
function percentagemStr(taxa: number): string {
  return (taxa * 100).toFixed(1);
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" (leitura pt-PT no Excel). */
function dataPt(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Carimbo de data "YYYY-MM-DD" para o nome do ficheiro. */
function carimboData(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Normaliza um texto para um segmento seguro de nome de ficheiro (sem espaços/acentos). */
function slugificar(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "export";
}

/**
 * Export CSV do analítico de um escalão (bíblia §8.15 / §10.2).
 * Bloco 1 — tabela por atleta (nome, golos, assistências, jogos utilizados,
 * minutos acumulados + 1 coluna por métrica configurável).
 * Bloco 2 — resumo do escalão (jogos, V/E/D, golos, sessões, taxa de presença
 * média). A taxa de presença é uma métrica de equipa em `AnaliticoEscalao`
 * (não existe por atleta), pelo que aparece no resumo, não na tabela.
 */
export async function exportarAnaliticoEscalaoCsv(
  input: { escalaoId: string; competicaoId?: string },
): Promise<Resultado<ExportacaoCsv>> {
  const parsed = exportarEscalaoCsvSchema.safeParse(input);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Delega no analítico já calculado (auth + RELATORIOS_VER + podeLerEscalao).
  const analitico = await obterAnaliticoEscalao(
    parsed.data.escalaoId,
    undefined,
    parsed.data.competicaoId,
  );
  if (!analitico.sucesso) return erro(analitico.erro, analitico.camposInvalidos);
  const a = analitico.dados;

  // Une os rankings de `AnaliticoEscalao` por atleta (reshape, sem recálculo).
  interface LinhaAtleta {
    atletaId: string;
    nome: string;
    golos: number;
    assistencias: number;
    jogosUtilizados: number;
    minutos: number;
    metricas: Record<string, number>;
  }
  const porAtleta = new Map<string, LinhaAtleta>();
  const obterLinha = (atletaId: string, nome: string): LinhaAtleta => {
    let linha = porAtleta.get(atletaId);
    if (!linha) {
      linha = {
        atletaId,
        nome,
        golos: 0,
        assistencias: 0,
        jogosUtilizados: 0,
        minutos: 0,
        metricas: {},
      };
      porAtleta.set(atletaId, linha);
    }
    return linha;
  };

  for (const u of a.maisUtilizados) {
    const linha = obterLinha(u.atletaId, u.nome);
    linha.minutos = u.tempoJogoAcumulado;
    linha.jogosUtilizados = u.jogosUtilizados;
  }
  for (const m of a.marcadores) obterLinha(m.atletaId, m.nome).golos = m.valor;
  for (const s of a.assistentes) obterLinha(s.atletaId, s.nome).assistencias = s.valor;

  const rankings = a.rankingsMetricas ?? [];
  rankings.forEach((ranking, i) => {
    for (const top of ranking.top) {
      obterLinha(top.atletaId, top.atletaNome).metricas[`metrica_${i}`] = arredondar2(top.valor);
    }
  });

  const colunasAtletas: ColunaCsv[] = [
    { chave: "nome", titulo: "Nome" },
    { chave: "golos", titulo: "Golos" },
    { chave: "assistencias", titulo: "Assistências" },
    { chave: "jogosUtilizados", titulo: "Jogos utilizados" },
    { chave: "minutos", titulo: "Minutos acumulados" },
    ...rankings.map((ranking, i) => ({ chave: `metrica_${i}`, titulo: ranking.metrica })),
  ];

  const linhasAtletas = [...porAtleta.values()]
    .sort(
      (x, y) =>
        y.minutos - x.minutos ||
        y.golos - x.golos ||
        x.nome.localeCompare(y.nome, "pt"),
    )
    .map((linha) => ({
      nome: linha.nome,
      golos: linha.golos,
      assistencias: linha.assistencias,
      jogosUtilizados: linha.jogosUtilizados,
      minutos: linha.minutos,
      ...linha.metricas,
    }));

  const colunasResumo: ColunaCsv[] = [
    { chave: "indicador", titulo: "Indicador" },
    { chave: "valor", titulo: "Valor" },
  ];
  const linhasResumo: Record<string, unknown>[] = [
    { indicador: "Escalão", valor: a.escalao.nome },
    { indicador: "Época", valor: a.epoca.nome },
    { indicador: "Jogos", valor: a.jogos },
    { indicador: "Vitórias", valor: a.vitorias },
    { indicador: "Empates", valor: a.empates },
    { indicador: "Derrotas", valor: a.derrotas },
    { indicador: "Golos marcados", valor: a.golosMarcados },
    { indicador: "Golos sofridos", valor: a.golosSofridos },
    { indicador: "Golos marcados/jogo", valor: arredondar2(a.golosMarcadosMedia) },
    { indicador: "Golos sofridos/jogo", valor: arredondar2(a.golosSofridosMedia) },
    { indicador: "Sessões", valor: a.sessoes },
    { indicador: "Atletas", valor: a.nAtletas },
    { indicador: "Taxa de presença média (%)", valor: percentagemStr(a.taxaPresencaMedia) },
  ];

  const csv = juntarBlocosCsv(
    paraCsv(linhasAtletas, colunasAtletas),
    paraCsv(linhasResumo, colunasResumo),
  );
  const nomeFicheiro = `analitico-${slugificar(a.escalao.nome)}-${carimboData()}.csv`;

  return ok({ csv, nomeFicheiro });
}

/**
 * Export CSV do analítico de um atleta (bíblia §8.15 / §10.1).
 * Bloco 1 — evolução jogo a jogo (data, adversário, utilizado, golos,
 * assistências + defesas/golos sofridos se for GR) terminada por uma linha de
 * totais. Bloco 2 — resumo da época (jogos convocado/utilizados,
 * titularidades, minutos acumulados, taxa de presença + métricas configuráveis
 * agregadas). O detalhe por jogo dos minutos/métricas não existe em
 * `AnaliticoAtleta` (é agregado), por isso surge no resumo, não por jogo.
 */
export async function exportarAnaliticoAtletaCsv(
  input: { atletaId: string; escalaoId: string },
): Promise<Resultado<ExportacaoCsv>> {
  const parsed = exportarAtletaCsvSchema.safeParse(input);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Delega no analítico já calculado: valida auth + RELATORIOS_VER, que o atleta
  // pertence ao clube e participa no escalão, e a leitura do escalão.
  const analitico = await obterAnaliticoAtleta(parsed.data.atletaId, parsed.data.escalaoId);
  if (!analitico.sucesso) return erro(analitico.erro, analitico.camposInvalidos);
  const a = analitico.dados;
  const eGR = a.atleta.eGR;

  const colunasJogos: ColunaCsv[] = [
    { chave: "data", titulo: "Data" },
    { chave: "adversario", titulo: "Adversário" },
    { chave: "utilizado", titulo: "Utilizado" },
    { chave: "golos", titulo: "Golos" },
    { chave: "assistencias", titulo: "Assistências" },
    ...(eGR
      ? ([
          { chave: "defesas", titulo: "Defesas" },
          { chave: "golosSofridos", titulo: "Golos sofridos" },
        ] as ColunaCsv[])
      : []),
  ];

  const linhasJogos: Record<string, unknown>[] = a.evolucaoJogos.map((j) => ({
    data: dataPt(j.data),
    adversario: j.adversario,
    utilizado: j.utilizado ? "Sim" : "Não",
    golos: j.golos,
    assistencias: j.assistencias,
    ...(eGR ? { defesas: j.defesas ?? 0, golosSofridos: j.golosSofridosGR ?? 0 } : {}),
  }));

  // Última linha da evolução: totais (Regra Nº 6 — soma vinda de `agregado`).
  linhasJogos.push({
    data: "Totais",
    adversario: "",
    utilizado: String(a.agregado.jogosUtilizados),
    golos: a.agregado.totalGolos,
    assistencias: a.agregado.totalAssistencias,
    ...(eGR
      ? {
          defesas: a.agregado.totalDefesas ?? 0,
          golosSofridos: a.agregado.totalGolosSofridos ?? 0,
        }
      : {}),
  });

  const colunasResumo: ColunaCsv[] = [
    { chave: "indicador", titulo: "Indicador" },
    { chave: "valor", titulo: "Valor" },
  ];
  const linhasResumo: Record<string, unknown>[] = [
    { indicador: "Atleta", valor: a.atleta.nome },
    { indicador: "Escalão", valor: a.escalaoContexto?.nome ?? "" },
    { indicador: "Época", valor: a.epoca.nome },
    { indicador: "Jogos convocado", valor: a.agregado.jogosConvocado },
    { indicador: "Jogos utilizados", valor: a.agregado.jogosUtilizados },
    { indicador: "Titularidades", valor: a.agregado.titularidades },
    { indicador: "Golos", valor: a.agregado.totalGolos },
    { indicador: "Assistências", valor: a.agregado.totalAssistencias },
    ...(eGR
      ? [
          { indicador: "Defesas", valor: a.agregado.totalDefesas ?? 0 },
          { indicador: "Golos sofridos", valor: a.agregado.totalGolosSofridos ?? 0 },
        ]
      : []),
    { indicador: "Minutos acumulados", valor: a.agregado.tempoJogoAcumulado },
    { indicador: "Taxa de presença (%)", valor: percentagemStr(a.agregado.taxaPresenca) },
    ...a.metricas.flatMap((m) => [
      { indicador: `${m.nome} (total)`, valor: arredondar2(m.total) },
      { indicador: `${m.nome} (média)`, valor: arredondar2(m.media) },
    ]),
  ];

  const csv = juntarBlocosCsv(
    paraCsv(linhasJogos, colunasJogos),
    paraCsv(linhasResumo, colunasResumo),
  );
  const nomeFicheiro = `analitico-${slugificar(a.atleta.nome)}-${carimboData()}.csv`;

  return ok({ csv, nomeFicheiro });
}
