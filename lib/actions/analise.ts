"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  Prisma,
  type CasaFora,
  type CategoriaExercicioPrincipal,
  type Modalidade,
  type ParteTreino,
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
  obterUsoExercicioSchema,
  obterRankingUsoExerciciosSchema,
  obterAnaliticoTreinoEscalaoSchema,
  obterAnaliticoTreinoAtletaSchema,
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
  // Só entram meses com sessões JÁ REALIZADAS (`data < agora`): a grelha mensal
  // nunca deve mostrar meses futuros (sessões programadas), que apareceriam com
  // 0% de assiduidade por ainda não terem presenças (BUG-P1-08).
  const agora = Date.now();
  const mesMap = new Map<string, { total: number; presentes: number; mesIdx: number }>();
  for (const s of sessoes) {
    const d = new Date(s.data);
    if (d.getTime() >= agora) continue;
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
        // Histórico persistente (§10.1): todas as participações da época (qualquer
        // estado). A evolução do atleta por jogo não deve desaparecer quando ele
        // deixa de ser participante ativo do escalão (INATIVO/TRANSICAO). O gate
        // de leitura vale para qualquer escalão onde participou, não só os ativos.
        where: { epocaId: epoca.id },
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
        // Histórico persistente (§10.1): todas as participações da época (qualquer
        // estado). A grelha de presenças mensais tem de contar as sessões do(s)
        // escalão(ões) onde o atleta esteve, mesmo depois de sair (INATIVO/
        // TRANSICAO) — as presenças ficam ligadas ao atleta/sessão, não ao estado.
        where: { epocaId: epoca.id },
        select: { escalaoId: true },
      },
    },
  });
  if (!atleta) return erro("Atleta não encontrado");

  const escaloesParticipados = atleta.participacoes.map((p) => p.escalaoId);
  if (!(await podeLerAlgumEscalao(escaloesParticipados)))
    return erro("Sem permissão neste escalão");

  const ingresso = atleta.dataIngresso ?? atleta.criadoEm;

  const [sessoes, presencas] = await Promise.all([
    prisma.sessao.findMany({
      where: {
        epocaId: epoca.id,
        escalaoId: { in: escaloesParticipados },
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
  /** Taxa de presença média do escalão (presenças / (nAtletas × sessões executadas)). */
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
        // Histórico persistente (§10.1): TODAS as participações da época,
        // independentemente do estado. Quando um atleta é removido/promovido/
        // desativado, `terminarParticipacao` marca a participação como INATIVO e
        // `transferirEscalao` marca a de origem como TRANSICAO_PERMANENTE — a
        // linha nunca é apagada. As estatísticas/presenças ficam ligadas ao
        // atleta/jogo/escalão (não ao estado da participação), pelo que filtrar
        // por `estado: "ATIVO"` escondia o histórico de quem já saiu do escalão.
        where: { epocaId: epoca.id },
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

  const escaloesParticipados = atleta.participacoes.map((p) => p.escalaoId);
  if (!(await podeLerAlgumEscalao(escaloesParticipados)))
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
  // Denominador da assiduidade = sessões EXECUTADAS desde o ingresso (data <
  // agora), nunca as programadas futuras (BUG-P1-08). As presenças (numerador)
  // só existem em sessões já realizadas, pelo que fica simétrico. A `sessoes`
  // completa mantém-se para a grelha mensal (montarPresencasMensais).
  const agora = Date.now();
  const sessoesExecutadas = sessoes.filter((s) => s.data.getTime() < agora).length;
  const agregado = agregarEstatisticas({
    eGR,
    jogosConvocado,
    sessoesTotais: sessoesExecutadas,
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
    // Só sessões NORMAL contam para assiduidade (BUG-P1-07) e apenas as já
    // EXECUTADAS (data < agora) — nunca as programadas (BUG-P1-08): simetria
    // com a vista do atleta e com o numerador de presenças abaixo.
    prisma.sessao.count({
      where: { epocaId, escalaoId, tipoSessao: "NORMAL", data: { lt: new Date() } },
    }),
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
    taxaPresencaMediaEquipa: slots > 0 ? Math.min(presencas / slots, 1) : 0,
    tempoJogoMedioEquipa: nAtletas > 0 ? totalTempo / nAtletas : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// M4 — Resumo leve do atleta para comparação (§10.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Versão leve de `obterAnaliticoAtleta` para COMPARAR atletas do mesmo escalão/época
 * (só nome, posições, se é GR e o agregado de estatísticas). Reutiliza EXACTAMENTE
 * o mesmo padrão de queries do agregado individual (convocatórias, estatísticas,
 * sessões NORMAL desde o ingresso e presenças), pelo que os números batem por
 * construção com os do painel do atleta (Regra Nº 6). Sem exigir `RELATORIOS_VER`:
 * é uma leitura de atleta do clube (auth + multi-tenant pelo clube).
 */
export async function obterResumoAtletaParaComparacao(
  atletaId: string,
  escalaoId: string,
  epocaId: string,
): Promise<
  Resultado<{
    nome: string;
    posicoes: Posicao[];
    eGR: boolean;
    agregado: EstatisticasAgregadas;
  }>
> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const atleta = await prisma.atleta.findFirst({
    where: { id: atletaId, clubeId },
    select: { nome: true, posicoes: true, criadoEm: true, dataIngresso: true },
  });
  if (!atleta) return erro("Atleta não encontrado");

  const eGR = atleta.posicoes.includes("GUARDA_REDES");
  const ingresso = atleta.dataIngresso ?? atleta.criadoEm;
  const filtroJogo = { epocaId, escalaoId };

  const [jogosConvocado, estatisticas, sessoes, presencas] = await Promise.all([
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
        // §10.8: o formato determina os minutos por bloco (tempo de jogo).
        jogo: { select: { formato: true } },
      },
      orderBy: { jogo: { data: "asc" } },
    }),
    prisma.sessao.findMany({
      where: {
        epocaId,
        escalaoId,
        data: { gte: ingresso },
        // Só sessões NORMAL contam para assiduidade (BUG-P1-07).
        tipoSessao: "NORMAL",
      },
      select: { data: true },
    }),
    prisma.presenca.findMany({
      where: {
        atletaId,
        estado: { in: [...ESTADOS_PRESENTE] },
        // Simetria com o denominador: presenças desde o ingresso, sessões NORMAL.
        sessao: { epocaId, data: { gte: ingresso }, tipoSessao: "NORMAL" },
        escalaoId,
      },
      select: { sessaoId: true },
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
    formato: e.jogo.formato,
  }));

  // Denominador da assiduidade = sessões EXECUTADAS (data < agora), nunca as
  // programadas (BUG-P1-08): simetria com obterAnaliticoAtleta.
  const agora = Date.now();
  const sessoesExecutadas = sessoes.filter((s) => s.data.getTime() < agora).length;
  const agregado = agregarEstatisticas({
    eGR,
    jogosConvocado,
    sessoesTotais: sessoesExecutadas,
    presencas: presencas.length,
    estatisticas: linhas,
  });

  return ok({ nome: atleta.nome, posicoes: atleta.posicoes, eGR, agregado });
}

// ─────────────────────────────────────────────────────────────────────────────
// M5 — Evolução do atleta ao longo das épocas (§10.1)
// ─────────────────────────────────────────────────────────────────────────────

/** Resumo do atleta numa época (linha da evolução multi-época). */
export interface EpocaResumoAtleta {
  epocaId: string;
  epocaNome: string;
  escalaoNome: string | null;
  totalGolos: number;
  totalAssistencias: number;
  jogosUtilizados: number;
  jogosConvocado: number;
  taxaPresenca: number; // 0-1
  habilidades: { desbloqueadas: number; total: number };
}

/**
 * Evolução do atleta ao longo de TODAS as épocas em que participou (§10.1).
 * Estratégia batch (evita N+1): 1 query pelas participações (fonte das épocas) e,
 * em paralelo, queries planas de estatísticas, convocatórias, presenças e
 * progressos — todas agregadas em memória por época. Auth + multi-tenant pelo
 * clube; leitura permitida se o membro puder ler ≥1 escalão do atleta.
 */
export async function obterEvolucaoMultiEpoca(
  atletaId: string,
): Promise<Resultado<EpocaResumoAtleta[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const atleta = await prisma.atleta.findFirst({
    where: { id: atletaId, clubeId },
    select: { id: true },
  });
  if (!atleta) return erro("Atleta não encontrado");

  // Participações do atleta (fonte das épocas): época (nome + data de início para
  // ordenação) e escalão (nome). Uma linha por (escalão, época) — deduplicamos por
  // época em memória, ficando com o primeiro escalão encontrado por época.
  const participacoes = await prisma.atletaEscalao.findMany({
    where: { atletaId, escalao: { clubeId } },
    select: {
      epocaId: true,
      escalaoId: true,
      escalao: { select: { nome: true } },
      epoca: { select: { nome: true, dataInicio: true } },
    },
    orderBy: [{ epoca: { dataInicio: "asc" } }, { tipo: "asc" }],
  });

  if (participacoes.length === 0) return ok([]);

  if (!(await podeLerAlgumEscalao(participacoes.map((p) => p.escalaoId))))
    return erro("Sem permissão neste escalão");

  const [estatisticas, convocatorias, presencas, progressos] = await Promise.all([
    prisma.estatisticaAtleta.findMany({
      where: { atletaId, jogo: { escalao: { clubeId } } },
      select: {
        golos: true,
        assistencias: true,
        utilizacao: true,
        jogo: { select: { epocaId: true } },
      },
    }),
    prisma.convocatoria.findMany({
      where: { convocado: true, atletaId, jogo: { escalao: { clubeId } } },
      select: { jogo: { select: { epocaId: true } } },
    }),
    // Todas as presenças em sessões NORMAL: numerador (PRESENTE/ATRASADO) e
    // denominador (todas as presenças marcadas) da assiduidade, por época.
    prisma.presenca.findMany({
      where: { atletaId, sessao: { tipoSessao: "NORMAL", escalao: { clubeId } } },
      select: { estado: true, sessao: { select: { epocaId: true } } },
    }),
    prisma.progressoHabilidade.findMany({
      where: { atletaId },
      select: { epocaId: true, estado: true },
    }),
  ]);

  interface AccEpoca {
    epocaNome: string;
    escalaoNome: string | null;
    dataInicio: Date;
    totalGolos: number;
    totalAssistencias: number;
    jogosUtilizados: number;
    jogosConvocado: number;
    presentes: number;
    presencasMarcadas: number;
    habDesbloqueadas: number;
    habTotal: number;
  }
  const porEpoca = new Map<string, AccEpoca>();
  for (const p of participacoes) {
    if (porEpoca.has(p.epocaId)) continue;
    porEpoca.set(p.epocaId, {
      epocaNome: p.epoca.nome,
      escalaoNome: p.escalao.nome,
      dataInicio: p.epoca.dataInicio,
      totalGolos: 0,
      totalAssistencias: 0,
      jogosUtilizados: 0,
      jogosConvocado: 0,
      presentes: 0,
      presencasMarcadas: 0,
      habDesbloqueadas: 0,
      habTotal: 0,
    });
  }

  for (const e of estatisticas) {
    const acc = porEpoca.get(e.jogo.epocaId);
    if (!acc) continue;
    acc.totalGolos += e.golos;
    acc.totalAssistencias += e.assistencias;
    if (e.utilizacao !== "NAO_UTILIZADO") acc.jogosUtilizados++;
  }
  for (const c of convocatorias) {
    const acc = porEpoca.get(c.jogo.epocaId);
    if (acc) acc.jogosConvocado++;
  }
  for (const pr of presencas) {
    const acc = porEpoca.get(pr.sessao.epocaId);
    if (!acc) continue;
    acc.presencasMarcadas++;
    if ((ESTADOS_PRESENTE as readonly string[]).includes(pr.estado)) acc.presentes++;
  }
  for (const h of progressos) {
    const acc = porEpoca.get(h.epocaId);
    if (!acc) continue;
    acc.habTotal++;
    if (h.estado === "DESBLOQUEADO") acc.habDesbloqueadas++;
  }

  const resultado: EpocaResumoAtleta[] = [...porEpoca.entries()]
    .map(([epocaId, a]) => ({
      epocaId,
      epocaNome: a.epocaNome,
      escalaoNome: a.escalaoNome,
      totalGolos: a.totalGolos,
      totalAssistencias: a.totalAssistencias,
      jogosUtilizados: a.jogosUtilizados,
      jogosConvocado: a.jogosConvocado,
      taxaPresenca: a.presencasMarcadas > 0 ? a.presentes / a.presencasMarcadas : 0,
      habilidades: { desbloqueadas: a.habDesbloqueadas, total: a.habTotal },
      dataInicio: a.dataInicio,
    }))
    .sort((x, y) => x.dataInicio.getTime() - y.dataInicio.getTime())
    .map(({ dataInicio: _dataInicio, ...linha }) => linha);

  return ok(resultado);
}

// ─────────────────────────────────────────────────────────────────────────────
// NÍVEL 2 — Analítico do escalão/equipa (secção 10.2)
// ─────────────────────────────────────────────────────────────────────────────

export interface RankingAtleta {
  atletaId: string;
  nome: string;
  valor: number;
}

/** Assiduidade por atleta (lista completa). `taxa` = presenças / sessões executadas do escalão. */
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
  /**
   * Local do jogo (§10.2 — casa/fora). O campo `Jogo.casaFora` é obrigatório em
   * BD (`@default(CASA)`), pelo que vem sempre preenchido nas leituras; `null`
   * apenas em snapshots de relatórios antigos (pré-adição do campo).
   */
  casaFora: CasaFora | null;
}

/** Balanço V/E/D por local do jogo (casa/fora — §10.2). */
export interface RecordCasaFora {
  vitorias: number;
  empates: number;
  derrotas: number;
  /** Jogos com resultado registado (denominador de V+E+D). */
  jogos: number;
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

/**
 * Eventos de jogo agregados por período (M6 — §10.2). Contagem por tipo separada
 * pela parte do jogo (1ª/2ª parte). Mapas parciais: só os tipos com ≥1 ocorrência
 * aparecem. Default `{ parte1: {}, parte2: {} }` para snapshots antigos (o campo
 * `EventoJogo.parte` não existia na origem de relatórios pré-M6).
 */
export interface EventosPorParte {
  parte1: Partial<Record<TipoEventoJogo, number>>;
  parte2: Partial<Record<TipoEventoJogo, number>>;
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
  /** Balanço V/E/D dos jogos em casa (§10.2; default `{0,0,0,0}` em snapshots antigos). */
  recordCasa: RecordCasaFora;
  /** Balanço V/E/D dos jogos fora (§10.2; default `{0,0,0,0}` em snapshots antigos). */
  recordFora: RecordCasaFora;
  /** Sessões programadas (todas as criadas no escalão/época — o total). */
  sessoes: number;
  /**
   * Sessões executadas (já realizadas: `data < agora`). As sessões futuras
   * ficam programadas mas ainda não executadas (§10.2). Subconjunto de `sessoes`.
   */
  sessoesExecutadas: number;
  nAtletas: number;
  taxaPresencaMedia: number;
  marcadores: RankingAtleta[];
  assistentes: RankingAtleta[];
  maisUtilizados: UtilizacaoAtleta[];
  /** Lista completa de atletas por taxa de presença (default `[]` em snapshots antigos). */
  rankingAssiduidade: RankingAssiduidade[];
  eventosPorTipo: Record<TipoEventoJogo, number>;
  /** Eventos por tipo separados por parte do jogo (M6 — §10.2; default `{parte1:{},parte2:{}}`). */
  eventosPorParte: EventosPorParte;
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
  // §10.2: só jogos JÁ REALIZADOS (data <= agora) entram no balanço da época e em
  // tudo o que dele deriva (jogos, V/E/D, golos, rankings, eventos, métricas).
  // Jogos futuros estão agendados mas por disputar, pelo que não devem contar
  // (BUG: KPI "JOGOS" incluía jogos futuros). Simetria com sessões executadas.
  const filtroJogo = {
    epocaId: epoca.id,
    escalaoId,
    ...filtroCompeticao,
    data: { lte: new Date() },
  };

  const [jogos, sessoes, nAtletas, estatisticas, eventos, presencas, valoresMetricas] =
    await Promise.all([
    prisma.jogo.findMany({
      where: filtroJogo,
      select: {
        id: true,
        data: true,
        adversario: true,
        golosMarcados: true,
        golosSofridos: true,
        // §10.2: local do jogo (casa/fora) para o balanço por local.
        casaFora: true,
      },
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
      // M6 (§10.2): `parte` (1|2) alimenta a análise por período (1ª/2ª parte).
      select: { tipo: true, parte: true },
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

  // Sessões executadas (§10.2): já realizadas = `data < agora`. Reutiliza a lista
  // já lida (que traz `data`) — sem query adicional. As futuras ficam programadas
  // mas por executar. Simetria com a imutabilidade do passado (§8.9.1).
  const agora = Date.now();
  const sessoesExecutadas = sessoes.filter((s) => s.data.getTime() < agora).length;

  // Resultados V/E/D + golos.
  let vitorias = 0;
  let empates = 0;
  let derrotas = 0;
  let golosMarcados = 0;
  let golosSofridos = 0;
  // Balanço por local do jogo (§10.2): só jogos COM resultado entram no V/E/D.
  // `casaFora` é obrigatório em BD (`@default(CASA)`), pelo que "FORA" separa
  // os de fora e tudo o resto (CASA) fica no balanço de casa.
  const recordCasa: RecordCasaFora = { vitorias: 0, empates: 0, derrotas: 0, jogos: 0 };
  const recordFora: RecordCasaFora = { vitorias: 0, empates: 0, derrotas: 0, jogos: 0 };
  const resultados: ResultadoJogoResumo[] = [];
  for (const j of jogos) {
    const r = resultadoJogo(j.golosMarcados, j.golosSofridos);
    if (r === "V") vitorias++;
    else if (r === "E") empates++;
    else if (r === "D") derrotas++;
    if (r) {
      const rec = j.casaFora === "FORA" ? recordFora : recordCasa;
      rec.jogos++;
      if (r === "V") rec.vitorias++;
      else if (r === "E") rec.empates++;
      else rec.derrotas++;
    }
    if (j.golosMarcados != null) golosMarcados += j.golosMarcados;
    if (j.golosSofridos != null) golosSofridos += j.golosSofridos;
    resultados.push({
      jogoId: j.id,
      data: j.data.toISOString().slice(0, 10),
      adversario: j.adversario,
      golosMarcados: j.golosMarcados,
      golosSofridos: j.golosSofridos,
      resultado: r,
      casaFora: j.casaFora ?? null,
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
    .sort((a, b) => b.tempoJogoAcumulado - a.tempoJogoAcumulado);

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
  // M6 (§10.2): mesma agregação, mas separada por parte (1|2). Mapas parciais
  // (só tipos com ocorrências); default `{}` para snapshots antigos.
  const eventosPorParte: EventosPorParte = { parte1: {}, parte2: {} };
  for (const ev of eventos) {
    eventosPorTipo[ev.tipo]++;
    const alvo = ev.parte === 2 ? eventosPorParte.parte2 : eventosPorParte.parte1;
    alvo[ev.tipo] = (alvo[ev.tipo] ?? 0) + 1;
  }

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
    // Só meses com sessões JÁ REALIZADAS (`data < agora`): a grelha mensal de
    // treinos/assiduidade nunca mostra meses futuros (programados), que dariam
    // 0% por ainda não terem presenças (BUG-P1-08). `agora` já definido acima.
    if (d.getTime() >= agora) continue;
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

  // Denominador da assiduidade = sessões EXECUTADAS (já realizadas), nunca as
  // programadas (BUG-P1-08): com 1 sessão realizada e todos presentes a taxa
  // tem de dar ~100%, não 1/(nº programadas). A assiduidade do escalão é a
  // média das assiduidades individuais — Σ presençasAtleta / (nAtletas ×
  // sessoesExecutadas) — que colapsa nesta forma agregada.
  const slots = nAtletas * sessoesExecutadas;

  // Ranking de assiduidade por atleta (lista completa). Reutiliza a MESMA lista
  // de presenças já lida acima — sem query adicional. Denominador = sessões
  // EXECUTADAS do escalão, em simetria com taxaPresencaMedia da equipa
  // (nAtletas × sessoesExecutadas); a taxa por atleta fica assim comparável.
  const totalSessoes = sessoesExecutadas;
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
    );

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
    recordCasa,
    recordFora,
    sessoes: sessoes.length,
    sessoesExecutadas,
    nAtletas,
    // Denominador = nAtletas × sessoesExecutadas (BUG-P1-08). Cap a 1 (100%):
    // atletas que saíram a meio da época podem gerar presenças sem contribuir
    // para o denominador de slots atual, o que inflaria a taxa acima de 100%
    // (BUG-P1-06). Simetria com o ranking (Math.min acima).
    taxaPresencaMedia: slots > 0 ? Math.min(presencas.length / slots, 1) : 0,
    marcadores,
    assistentes,
    maisUtilizados,
    rankingAssiduidade,
    eventosPorTipo,
    eventosPorParte,
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
  /** Sessões programadas do escalão (todas as criadas na época). */
  sessoes: number;
  /** Sessões executadas do escalão (já realizadas: `data < agora`). */
  sessoesExecutadas: number;
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
    /** Total de sessões executadas do clube na época (já realizadas). */
    sessoesExecutadas: number;
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

  const [jogos, sessoes, sessoesExecutadas, participacoes, presencas] = await Promise.all([
    // §10.2: só jogos JÁ REALIZADOS (data <= agora) entram no balanço por escalão
    // do painel do clube. Jogos futuros estão agendados mas por disputar, pelo que
    // não contam para "jogos"/V/E/D/golos. Simetria com `sessoesExecutadas` (abaixo,
    // `data < agora`), que já filtrava — aqui corrige-se a mesma assimetria nos jogos.
    prisma.jogo.findMany({
      where: { ...filtroEpocaEscaloes, data: { lte: new Date() } },
      select: { escalaoId: true, golosMarcados: true, golosSofridos: true },
    }),
    prisma.sessao.groupBy({
      by: ["escalaoId"],
      where: filtroEpocaEscaloes,
      _count: { _all: true },
    }),
    // Sessões executadas por escalão (§10.2): já realizadas = `data < agora`.
    prisma.sessao.groupBy({
      by: ["escalaoId"],
      where: { ...filtroEpocaEscaloes, data: { lt: new Date() } },
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
  const sessoesExecutadasPorEscalao = new Map<string, number>(
    sessoesExecutadas.map((s) => [s.escalaoId, s._count._all]),
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
    const nSessoesExecutadas = sessoesExecutadasPorEscalao.get(e.id) ?? 0;
    const nPresencas = presencasPorEscalao.get(e.id) ?? 0;
    // Assiduidade = presenças / (atletas × sessões EXECUTADAS), nunca as
    // programadas (BUG-P1-08): simetria com obterAnaliticoEscalao.
    const slots = nAtletas * nSessoesExecutadas;
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
      sessoesExecutadas: nSessoesExecutadas,
      // Cap a 1 (100%): simetria com obterAnaliticoEscalao (BUG-P1-06/08).
      taxaPresencaMedia: slots > 0 ? Math.min(nPresencas / slots, 1) : 0,
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
      acc.sessoesExecutadas += r.sessoesExecutadas;
      return acc;
    },
    {
      nAtletas: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0,
      golosMarcados: 0, golosSofridos: 0, sessoes: 0, sessoesExecutadas: 0,
    },
  );
  const slotsGlobais = resumos.reduce(
    (acc, r) => acc + r.nAtletas * r.sessoesExecutadas,
    0,
  );
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
      taxaPresencaMediaGlobal:
        slotsGlobais > 0 ? Math.min(presencasGlobais / slotsGlobais, 1) : 0,
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

// ─────────────────────────────────────────────────────────────────────────────
// DT1 — Analítico da equipa técnica (§10 — gestão do Diretor Técnico)
//
// Vista transversal de produtividade dos treinadores do clube (sessões e jogos
// criados, presenças marcadas e assiduidade média dos escalões que gerem). Só
// disponível a quem tem `RELATORIOS_VER` E âmbito TODO_CLUBE (DT/Admin) — o
// Presidente (âmbito próprio/limitado) não acede a esta vista de gestão de pessoas.
// ─────────────────────────────────────────────────────────────────────────────

export interface AnaliticoTreinador {
  membroId: string;
  utilizadorId: string;
  nome: string;
  perfilNome: string;
  escaloes: { id: string; nome: string }[];
  sessoesCount: number;
  jogosCount: number;
  presencasMarcadasCount: number;
  taxaPresencaMediaEscaloes: number; // média das taxas dos escalões atribuídos
}

export async function obterAnaliticoEquipaTecnica(
  epocaId?: string,
): Promise<Resultado<AnaliticoTreinador[]>> {
  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);
  // Vista de gestão de pessoas: exclusiva de quem gere todo o clube (DT/Admin).
  if (perm.ctx.ambito !== "TODO_CLUBE") return erro("Sem permissão");
  const clubeId = perm.ctx.clube.id;

  const epoca = await resolverEpoca(clubeId, epocaId);
  if (!epoca) return erro("Nenhuma época ativa");

  const [membros, sessoesPorCriador, jogosPorCriador, presencasPorMarcador, clubeAnalitico] =
    await Promise.all([
      prisma.membroClube.findMany({
        where: { clubeId, estado: "ATIVO" },
        select: {
          id: true,
          utilizadorId: true,
          utilizador: { select: { nome: true } },
          perfil: { select: { nome: true } },
          atribuicoes: { select: { escalao: { select: { id: true, nome: true } } } },
        },
      }),
      prisma.sessao.groupBy({
        by: ["criadorId"],
        where: { epocaId: epoca.id, escalao: { clubeId } },
        _count: { _all: true },
      }),
      prisma.jogo.groupBy({
        by: ["criadorId"],
        where: { epocaId: epoca.id, escalao: { clubeId } },
        _count: { _all: true },
      }),
      prisma.presenca.groupBy({
        by: ["marcadoPorId"],
        where: { sessao: { epocaId: epoca.id, escalao: { clubeId } } },
        _count: { _all: true },
      }),
      // Reutiliza a taxa de presença média por escalão já calculada (sem duplicar
      // lógica). Com âmbito TODO_CLUBE, cobre todos os escalões do clube.
      obterAnaliticoClubeEpoca(epoca.id),
    ]);

  // Sessões/jogos são criados por um Utilizador (criadorId = utilizadorId);
  // presenças são marcadas por um MembroClube (marcadoPorId = membroId).
  const sessoesMap = new Map<string, number>(
    sessoesPorCriador.map((s) => [s.criadorId, s._count._all]),
  );
  const jogosMap = new Map<string, number>(
    jogosPorCriador.map((j) => [j.criadorId, j._count._all]),
  );
  const presencasMap = new Map<string, number>(
    presencasPorMarcador
      .filter((p): p is typeof p & { marcadoPorId: string } => p.marcadoPorId !== null)
      .map((p) => [p.marcadoPorId, p._count._all]),
  );
  const taxaPorEscalao = new Map<string, number>(
    clubeAnalitico.sucesso
      ? clubeAnalitico.dados.escaloes.map((e) => [e.escalaoId, e.taxaPresencaMedia])
      : [],
  );

  const resultado: AnaliticoTreinador[] = membros
    // Só treinadores com escalões atribuídos entram na vista de produtividade.
    .filter((m) => m.atribuicoes.length > 0)
    .map((m) => {
      const escaloes = m.atribuicoes.map((a) => a.escalao);
      const somaTaxas = escaloes.reduce((acc, e) => acc + (taxaPorEscalao.get(e.id) ?? 0), 0);
      return {
        membroId: m.id,
        utilizadorId: m.utilizadorId,
        nome: m.utilizador.nome,
        perfilNome: m.perfil.nome,
        escaloes,
        sessoesCount: sessoesMap.get(m.utilizadorId) ?? 0,
        jogosCount: jogosMap.get(m.utilizadorId) ?? 0,
        presencasMarcadasCount: presencasMap.get(m.id) ?? 0,
        taxaPresencaMediaEscaloes: escaloes.length > 0 ? somaTaxas / escaloes.length : 0,
      };
    })
    .sort(
      (a, b) =>
        b.sessoesCount + b.jogosCount - (a.sessoesCount + a.jogosCount) ||
        a.nome.localeCompare(b.nome, "pt"),
    );

  return ok(resultado);
}

// ─────────────────────────────────────────────────────────────────────────────
// DT2 — Feed de atividade da equipa (§10 — gestão do Diretor Técnico)
//
// Cronologia unificada das ações recentes do clube (sessões e jogos criados,
// presenças marcadas, reuniões criadas) numa janela de horas. Só para quem gere
// todo o clube (RELATORIOS_VER + âmbito TODO_CLUBE).
// ─────────────────────────────────────────────────────────────────────────────

export type TipoAtividade =
  | "SESSAO_CRIADA"
  | "JOGO_CRIADO"
  | "PRESENCAS_MARCADAS"
  | "REUNIAO_CRIADA";

export interface EventoAtividade {
  tipo: TipoAtividade;
  id: string;
  quando: Date;
  autorNome: string;
  escalaoNome: string | null;
  detalhe: string;
  href: string;
}

export async function obterFeedAtividadeEquipa(
  horas?: number,
): Promise<Resultado<EventoAtividade[]>> {
  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);
  if (perm.ctx.ambito !== "TODO_CLUBE") return erro("Sem permissão");
  const clubeId = perm.ctx.clube.id;

  const epoca = await resolverEpoca(clubeId, undefined);
  if (!epoca) return erro("Nenhuma época ativa");

  const horasJanela = horas ?? 72;
  const janela = new Date(Date.now() - horasJanela * 60 * 60 * 1000);
  const dia = (d: Date) => d.toISOString().slice(0, 10);

  const [sessoes, jogos, presencas, reunioes] = await Promise.all([
    prisma.sessao.findMany({
      where: { epocaId: epoca.id, escalao: { clubeId }, criadoEm: { gte: janela } },
      select: {
        id: true,
        criadoEm: true,
        data: true,
        tipoSessao: true,
        escalao: { select: { nome: true } },
        criador: { select: { nome: true } },
      },
      orderBy: { criadoEm: "desc" },
      take: 30,
    }),
    prisma.jogo.findMany({
      where: { epocaId: epoca.id, escalao: { clubeId }, criadoEm: { gte: janela } },
      select: {
        id: true,
        criadoEm: true,
        adversario: true,
        casaFora: true,
        escalao: { select: { nome: true } },
        criador: { select: { nome: true } },
      },
      orderBy: { criadoEm: "desc" },
      take: 30,
    }),
    // `Presenca` não tem `criadoEm`: usamos a data da sessão como referência
    // temporal. `distinct` por (marcadoPorId, sessaoId) → uma entrada por marcação
    // de sessão; ignoramos presenças sem autor (marcadoPorId null).
    prisma.presenca.findMany({
      where: {
        marcadoPorId: { not: null },
        sessao: { epocaId: epoca.id, escalao: { clubeId }, data: { gte: janela } },
      },
      distinct: ["marcadoPorId", "sessaoId"],
      select: {
        sessaoId: true,
        marcadoPorId: true,
        sessao: { select: { id: true, data: true, escalao: { select: { nome: true } } } },
        marcadoPor: { select: { utilizador: { select: { nome: true } } } },
      },
      take: 60,
    }),
    prisma.reuniao.findMany({
      where: { clubeId, criadoEm: { gte: janela } },
      select: {
        id: true,
        criadoEm: true,
        titulo: true,
        criador: { select: { nome: true } },
      },
      orderBy: { criadoEm: "desc" },
      take: 30,
    }),
  ]);

  const eventos: EventoAtividade[] = [];

  for (const s of sessoes) {
    eventos.push({
      tipo: "SESSAO_CRIADA",
      id: s.id,
      quando: s.criadoEm,
      autorNome: s.criador.nome,
      escalaoNome: s.escalao.nome,
      detalhe:
        s.tipoSessao === "NORMAL"
          ? `Treino de ${dia(s.data)}`
          : `Sessão (${s.tipoSessao}) de ${dia(s.data)}`,
      href: `/treinos/${s.id}`,
    });
  }
  for (const j of jogos) {
    eventos.push({
      tipo: "JOGO_CRIADO",
      id: j.id,
      quando: j.criadoEm,
      autorNome: j.criador.nome,
      escalaoNome: j.escalao.nome,
      detalhe: `${j.casaFora === "FORA" ? "Fora" : "Casa"} vs ${j.adversario}`,
      href: `/jogos/${j.id}`,
    });
  }
  // Salvaguarda: dedup em memória por (sessaoId, marcadoPorId) — um evento por par.
  const paresPresenca = new Set<string>();
  for (const p of presencas) {
    if (!p.marcadoPorId) continue;
    const chave = `${p.sessaoId}:${p.marcadoPorId}`;
    if (paresPresenca.has(chave)) continue;
    paresPresenca.add(chave);
    eventos.push({
      tipo: "PRESENCAS_MARCADAS",
      id: chave,
      quando: p.sessao.data,
      autorNome: p.marcadoPor?.utilizador.nome ?? "—",
      escalaoNome: p.sessao.escalao.nome,
      detalhe: `Presenças do treino de ${dia(p.sessao.data)}`,
      href: `/treinos/${p.sessaoId}`,
    });
  }
  for (const r of reunioes) {
    eventos.push({
      tipo: "REUNIAO_CRIADA",
      id: r.id,
      quando: r.criadoEm,
      autorNome: r.criador?.nome ?? "—",
      // `Reuniao` não tem relação a `Escalao` (só `escalaoId` opcional): sem nome.
      escalaoNome: null,
      detalhe: r.titulo,
      href: `/reunioes`,
    });
  }

  eventos.sort((a, b) => b.quando.getTime() - a.quando.getTime());
  return ok(eventos);
}

// ─────────────────────────────────────────────────────────────────────────────
// DT3 — Evolução multi-época do clube (§10.3)
//
// Uma linha por época com os grandes números do clube (atletas, escalões, jogos,
// sessões, assiduidade média), para ver a evolução ao longo dos anos. Visível a
// quem tem `RELATORIOS_VER` (incl. Presidente — é uma vista de gestão do clube,
// não de pessoas).
// ─────────────────────────────────────────────────────────────────────────────

export interface LinhaEvolucaoEpoca {
  epocaId: string;
  nome: string;
  dataInicio: Date;
  ativa: boolean;
  nAtletas: number;
  nEscaloes: number;
  nJogos: number;
  nSessoes: number;
  taxaPresencaMedia: number;
}

export async function obterEvolucaoMultiepocaClube(): Promise<
  Resultado<LinhaEvolucaoEpoca[]>
> {
  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const [epocas, atletasPorEpoca, jogosPorEpoca, sessoesPorEpoca, escaloesPorEpoca] =
    await Promise.all([
      prisma.epoca.findMany({
        where: { clubeId },
        orderBy: { dataInicio: "asc" },
        select: { id: true, nome: true, dataInicio: true, ativa: true },
      }),
      prisma.atletaEscalao.groupBy({
        by: ["epocaId"],
        where: { escalao: { clubeId }, estado: "ATIVO", atleta: { ativo: true } },
        _count: { _all: true },
      }),
      prisma.jogo.groupBy({
        by: ["epocaId"],
        where: { escalao: { clubeId } },
        _count: { _all: true },
      }),
      // "Sessão realizada" = fechada pelo treinador (§10.3 — decisão do plano DT3).
      prisma.sessao.groupBy({
        by: ["epocaId"],
        where: { escalao: { clubeId }, fechado: true },
        _count: { _all: true },
      }),
      // Escalões por época = nº de escalaoId distintos em participações.
      prisma.atletaEscalao.groupBy({
        by: ["epocaId", "escalaoId"],
        where: { escalao: { clubeId } },
        _count: { _all: true },
      }),
    ]);

  if (epocas.length === 0) return ok([]);

  const atletasMap = new Map<string, number>(
    atletasPorEpoca.map((a) => [a.epocaId, a._count._all]),
  );
  const jogosMap = new Map<string, number>(
    jogosPorEpoca.map((j) => [j.epocaId, j._count._all]),
  );
  const sessoesMap = new Map<string, number>(
    sessoesPorEpoca.map((s) => [s.epocaId, s._count._all]),
  );
  const escaloesMap = new Map<string, number>();
  for (const e of escaloesPorEpoca)
    escaloesMap.set(e.epocaId, (escaloesMap.get(e.epocaId) ?? 0) + 1);

  // Taxa de presença por época (N ≈ nº de épocas, tipicamente < 10): presenças
  // NORMAL executadas / (nAtletas × nSessoesFechadas). Cap a 1 (BUG-P1-06).
  const presencasPorEpoca = await Promise.all(
    epocas.map((ep) =>
      prisma.presenca.count({
        where: {
          estado: { in: [...ESTADOS_PRESENTE] },
          sessao: {
            epocaId: ep.id,
            tipoSessao: "NORMAL",
            fechado: true,
            escalao: { clubeId },
          },
        },
      }),
    ),
  );

  const resultado: LinhaEvolucaoEpoca[] = epocas.map((ep, i) => {
    const nAtletas = atletasMap.get(ep.id) ?? 0;
    const nSessoes = sessoesMap.get(ep.id) ?? 0;
    const slots = nAtletas * nSessoes;
    return {
      epocaId: ep.id,
      nome: ep.nome,
      dataInicio: ep.dataInicio,
      ativa: ep.ativa,
      nAtletas,
      nEscaloes: escaloesMap.get(ep.id) ?? 0,
      nJogos: jogosMap.get(ep.id) ?? 0,
      nSessoes,
      taxaPresencaMedia: slots > 0 ? Math.min(presencasPorEpoca[i] / slots, 1) : 0,
    };
  });

  return ok(resultado);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALÍTICOS DE TREINO — uso de exercícios e carga de treino (secção 10.2)
//
// Estas quatro leituras respondem a "que exercícios uso, quanto treino faço e como
// evoluo". Seguem EXATAMENTE os padrões dos analíticos existentes: `exigirRelatorios`
// (auth + RELATORIOS_VER), `resolverEpoca` (época em contexto), `podeLerEscalao`/
// `escaloesLegiveis` (multi-tenant + permissão de leitura) e `erroDeValidacao` (Zod).
//
// NOTA de schema: o campo temporal da sessão em BD é `Sessao.data` (DateTime); as
// interfaces expõem-no como `dataHora` (contrato consumido pelos Server Components).
// `Exercicio.categoriaPrincipal` é nullable em BD — colapsa para `OUTRO` na leitura.
//
// Volumes/médias/composição usam SÓ sessões EXECUTADAS (`data < agora`) — nunca as
// programadas futuras — em simetria com o resto do ficheiro (BUG-P1-08).
// ─────────────────────────────────────────────────────────────────────────────

/** Fallback de categoria para exercícios sem `categoriaPrincipal` definida (nullable em BD). */
const CATEGORIA_FALLBACK: CategoriaExercicioPrincipal = "OUTRO";

/**
 * Assiduidade mensal AGREGADA de uma equipa (não individual): `presentes` = total de
 * presenças do mês; `total` = nAtletas × sessões do mês. Só meses com sessões JÁ
 * REALIZADAS (`data < agora`) — nunca futuras (BUG-P1-08). Espelha exatamente a lógica
 * de `obterAnaliticoEscalao` (mesma forma agregada), para os números baterem.
 */
function montarPresencasMensaisEquipa(
  sessoes: { id: string; data: Date }[],
  presencasPorSessao: Map<string, number>,
  nAtletas: number,
): PresencaMensal[] {
  const agora = Date.now();
  const mesMap = new Map<string, { sessoes: number; presentes: number; mesIdx: number }>();
  for (const s of sessoes) {
    const d = new Date(s.data);
    if (d.getTime() >= agora) continue;
    const mesIdx = d.getMonth();
    const key = `${d.getFullYear()}-${String(mesIdx + 1).padStart(2, "0")}`;
    const atual = mesMap.get(key) ?? { sessoes: 0, presentes: 0, mesIdx };
    atual.sessoes++;
    atual.presentes += presencasPorSessao.get(s.id) ?? 0;
    mesMap.set(key, atual);
  }
  return [...mesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => {
      const total = v.sessoes * nAtletas;
      return {
        mes: MESES[v.mesIdx],
        total,
        presentes: v.presentes,
        taxa: total > 0 ? Math.min(v.presentes / total, 1) : 0,
      };
    });
}

// ── Tipos partilhados com a UI ────────────────────────────────────────────────

/** Uso de um exercício específico ao longo da época. */
export interface UsoExercicio {
  totalUsos: number;
  ultimaVez: Date | null;
  ultimaSessaoId: string | null;
  duracaoMedia: number | null;
  sessoes: Array<{
    id: string; // id da sessão onde o exercício foi usado
    dataHora: Date; // Sessao.data
    escalaoNome: string;
    tipoSessao: TipoSessao;
    duracaoMin: number | null; // duração deste exercício NA sessão (SessaoExercicio.duracaoMin)
  }>;
  escaloes: Array<{ id: string; nome: string; totalUsos: number }>;
}

/** Linha do ranking de uso da biblioteca de exercícios. */
export interface RankingUsoExercicio {
  exercicioId: string;
  nome: string;
  categoriaPrincipal: CategoriaExercicioPrincipal;
  totalUsos: number; // 0 = nunca usado na época
  ultimaVez: Date | null;
}

/** Analítico de treino de um escalão (volume, composição, evolução, presença). */
export interface AnaliticoTreinoEscalao {
  totalSessoes: number;
  sessoesExecutadas: number;
  totalHoras: number;
  duracaoMedia: number | null;
  distribuicaoTipoSessao: Record<TipoSessao, number>;
  topExercicios: Array<{
    exercicioId: string;
    nome: string;
    totalUsos: number;
    categoriaPrincipal: CategoriaExercicioPrincipal;
  }>;
  distribuicaoCategoria: Array<{ categoria: CategoriaExercicioPrincipal; totalUsos: number }>;
  distribuicaoParteTreino: Array<{ parte: ParteTreino; totalUsos: number }>;
  evolucaoMensal: Array<{ mes: string; totalSessoes: number; totalHoras: number }>;
  taxaPresencaMedia: number;
  presencasMensais: PresencaMensal[];
}

/** Analítico de treino de um atleta (assiduidade, RPE, exposição por categoria). */
export interface AnaliticoTreinoAtleta {
  taxaPresenca: number;
  totalSessoesNormal: number;
  totalPresencas: number;
  rpeMedia: number | null;
  totalSessoesComRpe: number;
  rpeEvolucao: Array<{ sessaoId: string; dataHora: Date; rpe: number }>;
  exerciciosPorCategoria: Array<{
    categoria: CategoriaExercicioPrincipal;
    totalExercicios: number;
  }>;
  presencasMensais: PresencaMensal[];
}

// ── 1. Uso de um exercício específico ─────────────────────────────────────────

/**
 * Onde e quando um exercício foi usado na época (todas as sessões que o membro pode
 * ler). Valida que o exercício pertence ao clube; filtra as sessões pelos escalões
 * legíveis (§6.4/§6.5). `totalUsos` = nº de linhas `SessaoExercicio`; a lista de
 * sessões (máx. 50, desc por data) e a duração média derivam das mesmas linhas, pelo
 * que batem por construção (Regra Nº 6).
 */
export async function obterUsoExercicio(
  exercicioId: string,
  epocaId?: string,
): Promise<Resultado<UsoExercicio>> {
  const parsed = obterUsoExercicioSchema.safeParse({ exercicioId, epocaId });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const exercicio = await prisma.exercicio.findFirst({
    where: { id: parsed.data.exercicioId, clubeId },
    select: { id: true },
  });
  if (!exercicio) return erro("Exercício não encontrado");

  const epoca = await resolverEpoca(clubeId, parsed.data.epocaId);
  if (!epoca) return erro("Nenhuma época ativa");

  // Só sessões de escalões legíveis (§6.5). "TODOS" → sem filtro de escalão (a época
  // já é do clube, logo as sessões também). Lista concreta → `in`.
  const legiveis = await escaloesLegiveis();
  const filtroEscalao = legiveis === "TODOS" ? {} : { escalaoId: { in: legiveis } };

  const usos = await prisma.sessaoExercicio.findMany({
    where: {
      exercicioId: parsed.data.exercicioId,
      sessao: { epocaId: epoca.id, ...filtroEscalao },
    },
    select: {
      duracaoMin: true,
      sessao: {
        select: {
          id: true,
          data: true,
          tipoSessao: true,
          escalaoId: true,
          escalao: { select: { nome: true } },
        },
      },
    },
    orderBy: { sessao: { data: "desc" } },
  });

  // Duração média: só entradas com duração definida (SessaoExercicio.duracaoMin).
  const duracoes = usos.map((u) => u.duracaoMin).filter((d): d is number => d != null);
  const duracaoMedia =
    duracoes.length > 0
      ? arredondar2(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
      : null;

  // Escalões distintos que usaram o exercício (já limitados aos legíveis).
  const escaloesMap = new Map<string, { nome: string; totalUsos: number }>();
  for (const u of usos) {
    const acc =
      escaloesMap.get(u.sessao.escalaoId) ?? { nome: u.sessao.escalao.nome, totalUsos: 0 };
    acc.totalUsos++;
    escaloesMap.set(u.sessao.escalaoId, acc);
  }
  const escaloes = [...escaloesMap.entries()]
    .map(([id, v]) => ({ id, nome: v.nome, totalUsos: v.totalUsos }))
    .sort((a, b) => b.totalUsos - a.totalUsos || a.nome.localeCompare(b.nome, "pt"));

  return ok({
    totalUsos: usos.length,
    // Ordenado desc por data: a primeira entrada é a mais recente.
    ultimaVez: usos[0]?.sessao.data ?? null,
    ultimaSessaoId: usos[0]?.sessao.id ?? null,
    duracaoMedia,
    sessoes: usos.slice(0, 50).map((u) => ({
      id: u.sessao.id,
      dataHora: u.sessao.data,
      escalaoNome: u.sessao.escalao.nome,
      tipoSessao: u.sessao.tipoSessao,
      duracaoMin: u.duracaoMin,
    })),
    escaloes,
  });
}

// ── 2. Ranking de uso da biblioteca de exercícios ─────────────────────────────

/**
 * Ranking de uso de TODOS os exercícios do clube na época — INCLUINDO os que nunca
 * foram usados (`totalUsos = 0`), para identificar a biblioteca subaproveitada.
 * Com `escalaoId` filtra por esse escalão (valida leitura); sem ele, agrega todos os
 * escalões legíveis (§6.5). Ordenado desc por `totalUsos`.
 */
export async function obterRankingUsoExercicios(
  input: { escalaoId?: string; epocaId?: string },
): Promise<Resultado<RankingUsoExercicio[]>> {
  const parsed = obterRankingUsoExerciciosSchema.safeParse(input);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const epoca = await resolverEpoca(clubeId, parsed.data.epocaId);
  if (!epoca) return erro("Nenhuma época ativa");

  // Escalão de contexto: o pedido (com leitura validada) ou todos os legíveis (§6.5).
  let filtroEscalao: { escalaoId?: string | { in: string[] } };
  if (parsed.data.escalaoId) {
    const escalao = await prisma.escalao.findFirst({
      where: { id: parsed.data.escalaoId, clubeId },
      select: { id: true },
    });
    if (!escalao) return erro("Escalão não encontrado");
    if (!(await podeLerEscalao(parsed.data.escalaoId)))
      return erro("Sem permissão neste escalão");
    filtroEscalao = { escalaoId: parsed.data.escalaoId };
  } else {
    const legiveis = await escaloesLegiveis();
    filtroEscalao = legiveis === "TODOS" ? {} : { escalaoId: { in: legiveis } };
  }

  const [exercicios, usos] = await Promise.all([
    // Biblioteca do clube (fonte da lista — inclui os nunca usados).
    prisma.exercicio.findMany({
      where: { clubeId },
      select: { id: true, nome: true, categoriaPrincipal: true },
    }),
    // Linhas de uso na época/escalões, com a data da sessão para a "última vez".
    prisma.sessaoExercicio.findMany({
      where: { sessao: { epocaId: epoca.id, ...filtroEscalao } },
      select: { exercicioId: true, sessao: { select: { data: true } } },
    }),
  ]);

  const usoMap = new Map<string, { totalUsos: number; ultimaVez: Date }>();
  for (const u of usos) {
    const acc = usoMap.get(u.exercicioId);
    if (!acc) {
      usoMap.set(u.exercicioId, { totalUsos: 1, ultimaVez: u.sessao.data });
    } else {
      acc.totalUsos++;
      if (u.sessao.data.getTime() > acc.ultimaVez.getTime()) acc.ultimaVez = u.sessao.data;
    }
  }

  const ranking: RankingUsoExercicio[] = exercicios
    .map((e) => {
      const uso = usoMap.get(e.id);
      return {
        exercicioId: e.id,
        nome: e.nome,
        categoriaPrincipal: e.categoriaPrincipal ?? CATEGORIA_FALLBACK,
        totalUsos: uso?.totalUsos ?? 0,
        ultimaVez: uso?.ultimaVez ?? null,
      };
    })
    .sort((a, b) => b.totalUsos - a.totalUsos || a.nome.localeCompare(b.nome, "pt"));

  return ok(ranking);
}

// ── 3. Analítico de treino de um escalão ──────────────────────────────────────

/**
 * Volume, composição e evolução do treino de um escalão na época. Volumes/médias e
 * composição de exercícios contam SÓ sessões executadas (`data < agora`); a
 * distribuição por tipo de sessão cobre todas as programadas (vista de plano, em
 * simetria com `obterAnaliticoEscalao.distribuicaoTipoTreino`). Assiduidade só de
 * sessões NORMAL executadas (BUG-P1-07/08).
 */
export async function obterAnaliticoTreinoEscalao(
  escalaoId: string,
  epocaId?: string,
): Promise<Resultado<AnaliticoTreinoEscalao>> {
  const parsed = obterAnaliticoTreinoEscalaoSchema.safeParse({ escalaoId, epocaId });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const escalao = await prisma.escalao.findFirst({
    where: { id: parsed.data.escalaoId, clubeId },
    select: { id: true },
  });
  if (!escalao) return erro("Escalão não encontrado");
  if (!(await podeLerEscalao(parsed.data.escalaoId)))
    return erro("Sem permissão neste escalão");

  const epoca = await resolverEpoca(clubeId, parsed.data.epocaId);
  if (!epoca) return erro("Nenhuma época ativa");

  const [sessoes, nAtletas, presencas] = await Promise.all([
    prisma.sessao.findMany({
      where: { epocaId: epoca.id, escalaoId: parsed.data.escalaoId },
      select: {
        id: true,
        data: true,
        duracaoMin: true,
        tipoSessao: true,
        exercicios: {
          select: {
            exercicioId: true,
            parteTreino: true, // override por sessão (fallback = parte do exercício)
            exercicio: {
              select: { nome: true, categoriaPrincipal: true, parteTreino: true },
            },
          },
        },
      },
      orderBy: { data: "asc" },
    }),
    prisma.atletaEscalao.count({
      where: {
        epocaId: epoca.id,
        escalaoId: parsed.data.escalaoId,
        estado: "ATIVO",
        atleta: { ativo: true },
      },
    }),
    prisma.presenca.findMany({
      where: {
        escalaoId: parsed.data.escalaoId,
        estado: { in: [...ESTADOS_PRESENTE] },
        sessao: { epocaId: epoca.id, tipoSessao: "NORMAL" },
      },
      select: { sessaoId: true },
    }),
  ]);

  const agora = Date.now();
  const executadas = sessoes.filter((s) => s.data.getTime() < agora);

  // Volume (só sessões executadas com duração definida).
  const duracoesExec = executadas
    .map((s) => s.duracaoMin)
    .filter((d): d is number => d != null);
  const totalHoras = arredondar2(duracoesExec.reduce((a, b) => a + b, 0) / 60);
  const duracaoMedia =
    duracoesExec.length > 0
      ? arredondar2(duracoesExec.reduce((a, b) => a + b, 0) / duracoesExec.length)
      : null;

  // Distribuição por tipo de sessão (todas as programadas — vista de plano).
  const distribuicaoTipoSessao = Object.fromEntries(
    (Object.values(SESSAO_TIPOS) as TipoSessao[]).map((t) => [t, 0]),
  ) as Record<TipoSessao, number>;
  for (const s of sessoes) distribuicaoTipoSessao[s.tipoSessao]++;

  // Composição de exercícios (só sessões executadas = treino efetivamente dado).
  const exercicioUsos = new Map<
    string,
    { nome: string; categoria: CategoriaExercicioPrincipal; total: number }
  >();
  const categoriaUsos = new Map<CategoriaExercicioPrincipal, number>();
  const parteUsos = new Map<ParteTreino, number>();
  for (const s of executadas) {
    for (const se of s.exercicios) {
      const categoria = se.exercicio.categoriaPrincipal ?? CATEGORIA_FALLBACK;
      const ex =
        exercicioUsos.get(se.exercicioId) ??
        { nome: se.exercicio.nome, categoria, total: 0 };
      ex.total++;
      exercicioUsos.set(se.exercicioId, ex);
      categoriaUsos.set(categoria, (categoriaUsos.get(categoria) ?? 0) + 1);
      const parte = se.parteTreino ?? se.exercicio.parteTreino;
      if (parte) parteUsos.set(parte, (parteUsos.get(parte) ?? 0) + 1);
    }
  }
  const topExercicios = [...exercicioUsos.entries()]
    .map(([exercicioId, v]) => ({
      exercicioId,
      nome: v.nome,
      totalUsos: v.total,
      categoriaPrincipal: v.categoria,
    }))
    .sort((a, b) => b.totalUsos - a.totalUsos || a.nome.localeCompare(b.nome, "pt"))
    .slice(0, 10);
  const distribuicaoCategoria = [...categoriaUsos.entries()]
    .map(([categoria, totalUsos]) => ({ categoria, totalUsos }))
    .sort((a, b) => b.totalUsos - a.totalUsos);
  const distribuicaoParteTreino = [...parteUsos.entries()]
    .map(([parte, totalUsos]) => ({ parte, totalUsos }))
    .sort((a, b) => b.totalUsos - a.totalUsos);

  // Evolução mensal (janela dos últimos 12 meses, só sessões executadas).
  const evolMap = new Map<string, { totalSessoes: number; totalMin: number }>();
  for (const s of executadas) {
    const key = `${s.data.getFullYear()}-${String(s.data.getMonth() + 1).padStart(2, "0")}`;
    const acc = evolMap.get(key) ?? { totalSessoes: 0, totalMin: 0 };
    acc.totalSessoes++;
    if (s.duracaoMin != null) acc.totalMin += s.duracaoMin;
    evolMap.set(key, acc);
  }
  const hoje = new Date();
  const evolucaoMensal: AnaliticoTreinoEscalao["evolucaoMensal"] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const acc = evolMap.get(key) ?? { totalSessoes: 0, totalMin: 0 };
    evolucaoMensal.push({
      mes: key,
      totalSessoes: acc.totalSessoes,
      totalHoras: arredondar2(acc.totalMin / 60),
    });
  }

  // Assiduidade da equipa (sessões NORMAL): presenças / (nAtletas × NORMAL executadas).
  const sessoesNormal = sessoes.filter((s) => s.tipoSessao === "NORMAL");
  const sessoesNormalExecutadas = sessoesNormal.filter((s) => s.data.getTime() < agora);
  const presencasPorSessao = new Map<string, number>();
  for (const p of presencas)
    presencasPorSessao.set(p.sessaoId, (presencasPorSessao.get(p.sessaoId) ?? 0) + 1);
  const slots = nAtletas * sessoesNormalExecutadas.length;
  const taxaPresencaMedia = slots > 0 ? Math.min(presencas.length / slots, 1) : 0;
  const presencasMensais = montarPresencasMensaisEquipa(
    sessoesNormal,
    presencasPorSessao,
    nAtletas,
  );

  return ok({
    totalSessoes: sessoes.length,
    sessoesExecutadas: executadas.length,
    totalHoras,
    duracaoMedia,
    distribuicaoTipoSessao,
    topExercicios,
    distribuicaoCategoria,
    distribuicaoParteTreino,
    evolucaoMensal,
    taxaPresencaMedia,
    presencasMensais,
  });
}

// ── 4. Analítico de treino de um atleta ───────────────────────────────────────

/**
 * Assiduidade, carga percebida (RPE) e exposição por categoria de um atleta. A
 * assiduidade conta sessões NORMAL executadas desde o ingresso (BUG-P1-07/08); a
 * exposição por categoria só considera exercícios de sessões onde o atleta esteve
 * PRESENTE/ATRASADO. Vista conjunta (todas as participações) ou de um escalão de
 * contexto (`escalaoId`, com leitura validada).
 */
export async function obterAnaliticoTreinoAtleta(
  atletaId: string,
  escalaoId?: string,
  epocaId?: string,
): Promise<Resultado<AnaliticoTreinoAtleta>> {
  const parsed = obterAnaliticoTreinoAtletaSchema.safeParse({ atletaId, escalaoId, epocaId });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirRelatorios();
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const epoca = await resolverEpoca(clubeId, parsed.data.epocaId);
  if (!epoca) return erro("Nenhuma época ativa");

  const atleta = await prisma.atleta.findFirst({
    where: { id: parsed.data.atletaId, clubeId },
    select: {
      criadoEm: true,
      dataIngresso: true,
      // Histórico persistente (§10.1): todas as participações da época (qualquer estado).
      participacoes: { where: { epocaId: epoca.id }, select: { escalaoId: true } },
    },
  });
  if (!atleta) return erro("Atleta não encontrado");

  const escaloesParticipados = atleta.participacoes.map((p) => p.escalaoId);
  if (!(await podeLerAlgumEscalao(escaloesParticipados)))
    return erro("Sem permissão neste escalão");

  // Escalão de contexto: o pedido (tem de ser participação, com leitura validada) ou
  // a vista conjunta (todas as participações da época).
  let escaloesCtx: string[];
  if (parsed.data.escalaoId) {
    if (!escaloesParticipados.includes(parsed.data.escalaoId))
      return erro("O atleta não participa neste escalão nesta época");
    if (!(await podeLerEscalao(parsed.data.escalaoId)))
      return erro("Sem permissão neste escalão");
    escaloesCtx = [parsed.data.escalaoId];
  } else {
    escaloesCtx = escaloesParticipados;
  }

  const ingresso = atleta.dataIngresso ?? atleta.criadoEm;

  const [sessoes, presencas, rpes, exerciciosPresente] = await Promise.all([
    // Denominador da assiduidade: sessões NORMAL desde o ingresso (grelha mensal usa a
    // lista completa; o total conta só as executadas).
    prisma.sessao.findMany({
      where: {
        epocaId: epoca.id,
        escalaoId: { in: escaloesCtx },
        data: { gte: ingresso },
        tipoSessao: "NORMAL",
      },
      select: { id: true, data: true },
      orderBy: { data: "asc" },
    }),
    prisma.presenca.findMany({
      where: {
        atletaId: parsed.data.atletaId,
        estado: { in: [...ESTADOS_PRESENTE] },
        escalaoId: { in: escaloesCtx },
        sessao: { epocaId: epoca.id, data: { gte: ingresso }, tipoSessao: "NORMAL" },
      },
      select: { sessaoId: true },
    }),
    prisma.rpeAtleta.findMany({
      where: {
        atletaId: parsed.data.atletaId,
        sessao: { epocaId: epoca.id, escalaoId: { in: escaloesCtx } },
      },
      select: { rpe: true, sessaoId: true, sessao: { select: { data: true } } },
      orderBy: { sessao: { data: "asc" } },
    }),
    // Exposição por categoria: exercícios de sessões onde o atleta esteve presente.
    prisma.sessaoExercicio.findMany({
      where: {
        sessao: {
          epocaId: epoca.id,
          escalaoId: { in: escaloesCtx },
          presencas: {
            some: {
              atletaId: parsed.data.atletaId,
              estado: { in: [...ESTADOS_PRESENTE] },
            },
          },
        },
      },
      select: { exercicio: { select: { categoriaPrincipal: true } } },
    }),
  ]);

  const agora = Date.now();
  // Denominador = sessões EXECUTADAS desde o ingresso (as presenças só existem em
  // sessões realizadas, pelo que fica simétrico — BUG-P1-08).
  const totalSessoesNormal = sessoes.filter((s) => s.data.getTime() < agora).length;
  const totalPresencas = presencas.length;
  const taxaPresenca =
    totalSessoesNormal > 0 ? Math.min(totalPresencas / totalSessoesNormal, 1) : 0;

  const rpeMedia =
    rpes.length > 0 ? arredondar2(rpes.reduce((a, r) => a + r.rpe, 0) / rpes.length) : null;
  const rpeEvolucao = rpes.map((r) => ({
    sessaoId: r.sessaoId,
    dataHora: r.sessao.data,
    rpe: r.rpe,
  }));

  const categoriaMap = new Map<CategoriaExercicioPrincipal, number>();
  for (const se of exerciciosPresente) {
    const categoria = se.exercicio.categoriaPrincipal ?? CATEGORIA_FALLBACK;
    categoriaMap.set(categoria, (categoriaMap.get(categoria) ?? 0) + 1);
  }
  const exerciciosPorCategoria = [...categoriaMap.entries()]
    .map(([categoria, totalExercicios]) => ({ categoria, totalExercicios }))
    .sort((a, b) => b.totalExercicios - a.totalExercicios);

  const presencasSet = new Set(presencas.map((p) => p.sessaoId));

  return ok({
    taxaPresenca,
    totalSessoesNormal,
    totalPresencas,
    rpeMedia,
    totalSessoesComRpe: rpes.length,
    rpeEvolucao,
    exerciciosPorCategoria,
    presencasMensais: montarPresencasMensais(sessoes, presencasSet),
  });
}
