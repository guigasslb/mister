import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/epoca-context", () => ({
  obterClubeIdAtual: vi.fn(),
  obterEpocaAtiva: vi.fn(),
  COOKIE_EPOCA: "epoca_ativa",
}));

vi.mock("@/lib/permissoes", () => ({
  obterMembroAtual: vi.fn(),
  podeLerEscalao: vi.fn(),
  podeLerAlgumEscalao: vi.fn(),
  escaloesLegiveis: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    epoca: { findFirst: vi.fn() },
    atleta: { findFirst: vi.fn() },
    escalao: { findFirst: vi.fn(), findMany: vi.fn() },
    atletaEscalao: { count: vi.fn(), groupBy: vi.fn() },
    convocatoria: { count: vi.fn() },
    estatisticaAtleta: { findMany: vi.fn() },
    sessao: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    presenca: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    eventoJogo: { findMany: vi.fn() },
    jogo: { findMany: vi.fn() },
    competicao: { findMany: vi.fn() },
    habilidade: { count: vi.fn() },
    progressoHabilidade: { findMany: vi.fn() },
    valorMetrica: { findMany: vi.fn() },
    relatorioPartilhado: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import {
  obterAnaliticoAtleta,
  obterAnaliticoEscalao,
  obterCompeticoesEscalao,
  obterAnaliticoClubeEpoca,
  gerarRelatorioPartilhado,
  obterRelatorioPorToken,
  listarRelatoriosPartilhados,
  revogarRelatorioPartilhado,
} from "@/lib/actions/analise";
import { blocoParaMinutos, MINUTOS_POR_BLOCO, agregarEstatisticas } from "@/lib/estatisticas";
import { obterEpocaAtiva } from "@/lib/epoca-context";
import {
  obterMembroAtual,
  podeLerEscalao,
  podeLerAlgumEscalao,
  escaloesLegiveis,
} from "@/lib/permissoes";
import { prisma } from "@/lib/db";

// cuids válidos (z.string().cuid()).
const CLUBE = "ckv9v0z1w0000abcd1234efgh";
const EPOCA = "ckv9v0z1w0001abcd1234efgh";
const ESCALAO = "ckv9v0z1w0002abcd1234efgh";
const ATLETA = "ckv9v0z1w0003abcd1234efgh";
const ATLETA2 = "ckv9v0z1w0004abcd1234efgh";
const COMPETICAO = "ckv9v0z1w0005abcd1234efgh";

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

function membroComRelatorios(overrides: Record<string, unknown> = {}) {
  return {
    utilizadorId: "user1",
    membroId: "membro1",
    clube: {
      id: CLUBE,
      nome: "Clube Teste",
      corPrimaria: "#F0531E",
      corSecundaria: "#111111",
      logoUrl: null,
    },
    perfil: {},
    capacidades: ["RELATORIOS_VER"],
    ambito: "TODO_CLUBE",
    escaloesAtribuidos: [],
    seccoesCoordenadas: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (obterEpocaAtiva as ReturnType<typeof vi.fn>).mockResolvedValue({ id: EPOCA, nome: "2025/26" });
  (podeLerEscalao as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  (podeLerAlgumEscalao as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  (escaloesLegiveis as ReturnType<typeof vi.fn>).mockResolvedValue("TODOS");
  (obterMembroAtual as ReturnType<typeof vi.fn>).mockResolvedValue(membroComRelatorios());
  p.epoca.findFirst.mockResolvedValue({ id: EPOCA, nome: "2025/26" });
  // Métricas configuráveis: sem valores por omissão (cada teste pode sobrepor).
  p.valorMetrica.findMany.mockResolvedValue([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Funções puras
// ─────────────────────────────────────────────────────────────────────────────

describe("blocoParaMinutos (secção 10.1)", () => {
  it("converte cada bloco no nº de minutos correto", () => {
    expect(blocoParaMinutos("JOGO_COMPLETO")).toBe(40);
    expect(blocoParaMinutos("MEIA_PARTE")).toBe(20);
    expect(blocoParaMinutos("BLOCO_10MIN")).toBe(10);
    expect(blocoParaMinutos("BLOCO_5MIN")).toBe(5);
    expect(blocoParaMinutos("NAO_JOGOU")).toBe(0);
  });

  it("trata null/undefined como 0 (não registado)", () => {
    expect(blocoParaMinutos(null)).toBe(0);
    expect(blocoParaMinutos(undefined)).toBe(0);
  });

  it("a tabela cobre exatamente os 5 blocos", () => {
    expect(Object.keys(MINUTOS_POR_BLOCO)).toHaveLength(5);
  });
});

describe("agregarEstatisticas — tempoJogoAcumulado", () => {
  it("soma os minutos dos blocos e ignora os não registados", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 3,
      sessoesTotais: 0,
      presencas: 0,
      estatisticas: [
        { utilizacao: "TITULAR", blocoTempo: "JOGO_COMPLETO", minutos: null, golos: 0, assistencias: 0, defesas: null, golosSofridosGR: null },
        { utilizacao: "UTILIZADO", blocoTempo: "MEIA_PARTE", minutos: null, golos: 0, assistencias: 0, defesas: null, golosSofridosGR: null },
        { utilizacao: "NAO_UTILIZADO", blocoTempo: null, minutos: null, golos: 0, assistencias: 0, defesas: null, golosSofridosGR: null },
      ],
    });
    expect(r.tempoJogoAcumulado).toBe(60); // 40 + 20 + 0
  });

  it("é 0 quando não há blocos registados", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 0,
      sessoesTotais: 0,
      presencas: 0,
      estatisticas: [],
    });
    expect(r.tempoJogoAcumulado).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Nível 1 — atleta
// ─────────────────────────────────────────────────────────────────────────────

describe("obterAnaliticoAtleta", () => {
  it("nega sem capacidade RELATORIOS_VER", async () => {
    (obterMembroAtual as ReturnType<typeof vi.fn>).mockResolvedValue(
      membroComRelatorios({ capacidades: [] }),
    );
    const r = await obterAnaliticoAtleta(ATLETA);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Sem permissão");
  });

  it("nega quando não autenticado", async () => {
    (obterMembroAtual as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await obterAnaliticoAtleta(ATLETA);
    expect(r.sucesso).toBe(false);
  });

  it("vista conjunta: agrega golos, tempo de jogo, presenças e caderneta", async () => {
    p.atleta.findFirst.mockResolvedValue({
      id: ATLETA,
      nome: "João",
      posicoes: ["ALA"],
      criadoEm: new Date("2025-08-01"),
      dataIngresso: null,
      participacoes: [{ escalaoId: ESCALAO, escalao: { nome: "Sub-13" } }],
    });
    p.convocatoria.count.mockResolvedValue(2);
    p.estatisticaAtleta.findMany.mockResolvedValue([
      {
        utilizacao: "TITULAR",
        blocoTempo: "JOGO_COMPLETO",
        minutos: null,
        golos: 2,
        assistencias: 1,
        defesas: null,
        golosSofridosGR: null,
        jogo: { data: new Date("2025-09-10"), adversario: "Rival A" },
      },
    ]);
    p.sessao.findMany.mockResolvedValue([
      { id: "s1", data: new Date("2025-09-01") },
      { id: "s2", data: new Date("2025-09-08") },
    ]);
    p.presenca.findMany.mockResolvedValue([{ sessaoId: "s1" }]);
    p.habilidade.count.mockResolvedValue(20);
    p.progressoHabilidade.findMany.mockResolvedValue([
      { estado: "DESBLOQUEADO" },
      { estado: "EM_PROGRESSO" },
      { estado: "NAO_INICIADO" },
    ]);

    const r = await obterAnaliticoAtleta(ATLETA);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.escalaoContexto).toBeNull(); // conjunto
    expect(r.dados.agregado.totalGolos).toBe(2);
    expect(r.dados.agregado.tempoJogoAcumulado).toBe(40);
    expect(r.dados.agregado.jogosConvocado).toBe(2);
    expect(r.dados.presencasMensais).toHaveLength(1);
    expect(r.dados.presencasMensais[0].taxa).toBeCloseTo(0.5);
    expect(r.dados.caderneta).toEqual({ total: 20, desbloqueadas: 1, emProgresso: 1 });
    expect(r.dados.evolucaoJogos).toHaveLength(1);
    expect(r.dados.comparacaoEquipa).toBeNull();
  });

  it("agrega métricas configuráveis (NUMERO soma, BOOLEANO conta, ESCALA média)", async () => {
    p.atleta.findFirst.mockResolvedValue({
      id: ATLETA,
      nome: "João",
      posicoes: ["ALA"],
      criadoEm: new Date("2025-08-01"),
      dataIngresso: null,
      participacoes: [{ escalaoId: ESCALAO, escalao: { nome: "Sub-13" } }],
    });
    p.convocatoria.count.mockResolvedValue(2);
    p.estatisticaAtleta.findMany.mockResolvedValue([]);
    p.sessao.findMany.mockResolvedValue([]);
    p.presenca.findMany.mockResolvedValue([]);
    p.habilidade.count.mockResolvedValue(0);
    p.progressoHabilidade.findMany.mockResolvedValue([]);
    p.valorMetrica.findMany.mockResolvedValue([
      { valor: 3, metrica: { id: "m1", nome: "Remates", tipo: "NUMERO", ordem: 0 } },
      { valor: 2, metrica: { id: "m1", nome: "Remates", tipo: "NUMERO", ordem: 0 } },
      { valor: 1, metrica: { id: "m2", nome: "Foco", tipo: "BOOLEANO", ordem: 1 } },
      { valor: 0, metrica: { id: "m2", nome: "Foco", tipo: "BOOLEANO", ordem: 1 } },
      { valor: 4, metrica: { id: "m3", nome: "Atitude", tipo: "ESCALA", ordem: 2 } },
      { valor: 5, metrica: { id: "m3", nome: "Atitude", tipo: "ESCALA", ordem: 2 } },
    ]);

    const r = await obterAnaliticoAtleta(ATLETA);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    // Ordenadas por `ordem` da métrica.
    expect(r.dados.metricas).toEqual([
      { nome: "Remates", tipo: "NUMERO", total: 5, media: 2.5, jogos: 2 },
      { nome: "Foco", tipo: "BOOLEANO", total: 1, media: 0.5, jogos: 2 },
      { nome: "Atitude", tipo: "ESCALA", total: 9, media: 4.5, jogos: 2 },
    ]);
  });

  it("devolve métricas vazias quando não há valores registados", async () => {
    p.atleta.findFirst.mockResolvedValue({
      id: ATLETA,
      nome: "João",
      posicoes: ["ALA"],
      criadoEm: new Date("2025-08-01"),
      dataIngresso: null,
      participacoes: [{ escalaoId: ESCALAO, escalao: { nome: "Sub-13" } }],
    });
    p.convocatoria.count.mockResolvedValue(0);
    p.estatisticaAtleta.findMany.mockResolvedValue([]);
    p.sessao.findMany.mockResolvedValue([]);
    p.presenca.findMany.mockResolvedValue([]);
    p.habilidade.count.mockResolvedValue(0);
    p.progressoHabilidade.findMany.mockResolvedValue([]);

    const r = await obterAnaliticoAtleta(ATLETA);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.metricas).toEqual([]);
  });

  it("recusa escalão onde o atleta não participa", async () => {
    p.atleta.findFirst.mockResolvedValue({
      id: ATLETA,
      nome: "João",
      posicoes: ["ALA"],
      criadoEm: new Date("2025-08-01"),
      dataIngresso: null,
      participacoes: [{ escalaoId: "outro-escalao", escalao: { nome: "Sub-15" } }],
    });
    const r = await obterAnaliticoAtleta(ATLETA, ESCALAO);
    expect(r.sucesso).toBe(false);
  });

  it("mantém o histórico de quem já saiu do escalão (não filtra participações por estado — §10.1)", async () => {
    // Cenário do bug: o atleta foi removido do escalão. `terminarParticipacao`
    // marca a participação como INATIVO (e `transferirEscalao` como TRANSICAO),
    // mas a linha persiste e as estatísticas continuam ligadas ao jogo/atleta.
    p.atleta.findFirst.mockResolvedValue({
      id: ATLETA,
      nome: "Tiago Coelho",
      posicoes: ["ALA"],
      criadoEm: new Date("2025-08-01"),
      dataIngresso: null,
      participacoes: [
        {
          escalaoId: ESCALAO,
          escalao: { nome: "Benjamins", seccao: { modalidade: "FUTSAL" } },
        },
      ],
    });
    p.convocatoria.count.mockResolvedValue(3);
    p.estatisticaAtleta.findMany.mockResolvedValue([
      {
        utilizacao: "TITULAR",
        blocoTempo: "JOGO_COMPLETO",
        minutos: null,
        golos: 5,
        assistencias: 2,
        defesas: null,
        golosSofridosGR: null,
        cartaoAmarelo: 0,
        cartaoVermelho: 0,
        jogo: { data: new Date("2025-10-01"), adversario: "Rival", formato: null },
      },
    ]);
    p.sessao.findMany.mockResolvedValue([]);
    p.presenca.findMany.mockResolvedValue([]);
    p.habilidade.count.mockResolvedValue(0);
    p.progressoHabilidade.findMany.mockResolvedValue([]);

    const r = await obterAnaliticoAtleta(ATLETA);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.agregado.totalGolos).toBe(5);

    // Causa raiz: a query de participações tem de estar limitada à época e NUNCA
    // ao estado — senão o histórico de quem saiu (INATIVO/TRANSICAO) desaparece.
    const arg = p.atleta.findFirst.mock.calls.at(-1)![0];
    expect(arg.select.participacoes.where).toEqual({ epocaId: EPOCA });
    expect(arg.select.participacoes.where).not.toHaveProperty("estado");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Nível 2 — escalão
// ─────────────────────────────────────────────────────────────────────────────

describe("obterAnaliticoEscalao", () => {
  it("calcula V/E/D, rankings, blocos e distribuição de treino", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO, nome: "Sub-13" });
    p.jogo.findMany.mockResolvedValue([
      { id: "j1", data: new Date("2025-09-10"), adversario: "A", golosMarcados: 3, golosSofridos: 1 },
      { id: "j2", data: new Date("2025-09-17"), adversario: "B", golosMarcados: 1, golosSofridos: 1 },
      { id: "j3", data: new Date("2025-09-24"), adversario: "C", golosMarcados: 0, golosSofridos: 2 },
    ]);
    p.sessao.findMany.mockResolvedValue([
      { id: "s1", data: new Date("2025-09-01"), tipoSessao: "NORMAL" },
      { id: "s2", data: new Date("2025-09-08"), tipoSessao: "ABERTO" },
    ]);
    p.atletaEscalao.count.mockResolvedValue(10);
    p.estatisticaAtleta.findMany.mockResolvedValue([
      { atletaId: ATLETA, golos: 3, assistencias: 1, blocoTempo: "JOGO_COMPLETO", utilizacao: "TITULAR", atleta: { nome: "João" } },
      { atletaId: ATLETA2, golos: 1, assistencias: 2, blocoTempo: "MEIA_PARTE", utilizacao: "UTILIZADO", atleta: { nome: "Rui" } },
    ]);
    p.eventoJogo.findMany.mockResolvedValue([
      { tipo: "GOLO" }, { tipo: "GOLO" }, { tipo: "CARTAO_AMARELO" },
    ]);
    p.presenca.findMany.mockResolvedValue([{ sessaoId: "s1" }, { sessaoId: "s1" }, { sessaoId: "s2" }]);

    const r = await obterAnaliticoEscalao(ESCALAO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.jogos).toBe(3);
    expect(r.dados.vitorias).toBe(1);
    expect(r.dados.empates).toBe(1);
    expect(r.dados.derrotas).toBe(1);
    expect(r.dados.golosMarcados).toBe(4);
    expect(r.dados.golosSofridos).toBe(4);
    expect(r.dados.marcadores[0]).toEqual({ atletaId: ATLETA, nome: "João", valor: 3 });
    expect(r.dados.assistentes[0]).toEqual({ atletaId: ATLETA2, nome: "Rui", valor: 2 });
    expect(r.dados.maisUtilizados[0].tempoJogoAcumulado).toBe(40);
    expect(r.dados.eventosPorTipo.GOLO).toBe(2);
    expect(r.dados.eventosPorTipo.CARTAO_AMARELO).toBe(1);
    expect(r.dados.eventosPorTipo.TIMEOUT).toBe(0);
    expect(r.dados.distribuicaoTipoTreino.NORMAL).toBe(1);
    expect(r.dados.distribuicaoTipoTreino.ABERTO).toBe(1);
    expect(r.dados.distribuicaoTipoTreino.CAPTACAO).toBe(0);
    // taxa média = 3 presenças / (10 atletas × 2 sessões) = 0.15
    expect(r.dados.taxaPresencaMedia).toBeCloseTo(0.15);
    // Ambas as sessões (2025-09) já passaram → todas executadas.
    expect(r.dados.sessoes).toBe(2);
    expect(r.dados.sessoesExecutadas).toBe(2);
  });

  it("separa o balanço V/E/D por local do jogo (casa/fora — §10.2)", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO, nome: "Sub-13" });
    p.jogo.findMany.mockResolvedValue([
      // Casa: 1 vitória, 1 empate.
      { id: "j1", data: new Date("2025-09-10"), adversario: "A", golosMarcados: 3, golosSofridos: 1, casaFora: "CASA" },
      { id: "j2", data: new Date("2025-09-17"), adversario: "B", golosMarcados: 1, golosSofridos: 1, casaFora: "CASA" },
      // Fora: 1 derrota + 1 jogo sem resultado (não conta para o balanço).
      { id: "j3", data: new Date("2025-09-24"), adversario: "C", golosMarcados: 0, golosSofridos: 2, casaFora: "FORA" },
      { id: "j4", data: new Date("2025-10-01"), adversario: "D", golosMarcados: null, golosSofridos: null, casaFora: "FORA" },
    ]);
    p.sessao.findMany.mockResolvedValue([]);
    p.atletaEscalao.count.mockResolvedValue(10);
    p.estatisticaAtleta.findMany.mockResolvedValue([]);
    p.eventoJogo.findMany.mockResolvedValue([]);
    p.presenca.findMany.mockResolvedValue([]);

    const r = await obterAnaliticoEscalao(ESCALAO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    // O select pede o local do jogo.
    expect(p.jogo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ casaFora: true }),
      }),
    );
    expect(r.dados.recordCasa).toEqual({ vitorias: 1, empates: 1, derrotas: 0, jogos: 2 });
    // Fora: só o jogo com resultado (j3) entra; o agendado (j4) é ignorado.
    expect(r.dados.recordFora).toEqual({ vitorias: 0, empates: 0, derrotas: 1, jogos: 1 });
    // O local propaga-se para cada resultado jogo-a-jogo.
    expect(r.dados.resultados.map((x) => x.casaFora)).toEqual([
      "CASA", "CASA", "FORA", "FORA",
    ]);
    // Os totais globais mantêm-se (zero regressão).
    expect(r.dados.vitorias).toBe(1);
    expect(r.dados.empates).toBe(1);
    expect(r.dados.derrotas).toBe(1);
  });

  it("distingue sessões programadas de executadas (data < agora)", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO, nome: "Sub-13" });
    p.jogo.findMany.mockResolvedValue([]);
    // 2 sessões passadas + 1 futura (data > agora) → 3 programadas, 2 executadas.
    const futura = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    p.sessao.findMany.mockResolvedValue([
      { id: "s1", data: new Date("2025-09-01"), tipoSessao: "NORMAL" },
      { id: "s2", data: new Date("2025-09-08"), tipoSessao: "NORMAL" },
      { id: "s3", data: futura, tipoSessao: "NORMAL" },
    ]);
    p.atletaEscalao.count.mockResolvedValue(5);
    p.estatisticaAtleta.findMany.mockResolvedValue([]);
    p.eventoJogo.findMany.mockResolvedValue([]);
    p.presenca.findMany.mockResolvedValue([]);

    const r = await obterAnaliticoEscalao(ESCALAO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.sessoes).toBe(3);
    expect(r.dados.sessoesExecutadas).toBe(2);
  });

  it("assiduidade usa sessões executadas, não as programadas (BUG-P1-08)", async () => {
    // Cenário reportado: 1 sessão realizada, TODOS presentes → deve dar ~100%,
    // não 1/(nº de sessões programadas). Aqui: 5 atletas, 1 sessão passada +
    // 4 sessões futuras programadas, e as 5 presenças na sessão realizada.
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO, nome: "Sub-13" });
    p.jogo.findMany.mockResolvedValue([]);
    const futura = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const futura2 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const futura3 = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    const futura4 = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);
    p.sessao.findMany.mockResolvedValue([
      { id: "s1", data: new Date("2025-09-01"), tipoSessao: "NORMAL" },
      { id: "s2", data: futura, tipoSessao: "NORMAL" },
      { id: "s3", data: futura2, tipoSessao: "NORMAL" },
      { id: "s4", data: futura3, tipoSessao: "NORMAL" },
      { id: "s5", data: futura4, tipoSessao: "NORMAL" },
    ]);
    p.atletaEscalao.count.mockResolvedValue(5);
    p.estatisticaAtleta.findMany.mockResolvedValue([]);
    p.eventoJogo.findMany.mockResolvedValue([]);
    // 5 presenças, todas na única sessão executada.
    p.presenca.findMany.mockResolvedValue([
      { sessaoId: "s1", atletaId: ATLETA, atleta: { nome: "A" } },
      { sessaoId: "s1", atletaId: ATLETA2, atleta: { nome: "B" } },
      { sessaoId: "s1", atletaId: "a3", atleta: { nome: "C" } },
      { sessaoId: "s1", atletaId: "a4", atleta: { nome: "D" } },
      { sessaoId: "s1", atletaId: "a5", atleta: { nome: "E" } },
    ]);

    const r = await obterAnaliticoEscalao(ESCALAO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.sessoes).toBe(5);
    expect(r.dados.sessoesExecutadas).toBe(1);
    // 5 presenças / (5 atletas × 1 sessão executada) = 1.0 (100%), não 0.04.
    expect(r.dados.taxaPresencaMedia).toBeCloseTo(1);
    // Ranking por atleta também usa sessões executadas como denominador.
    expect(r.dados.rankingAssiduidade[0].taxa).toBeCloseTo(1);
  });

  it("ranking de assiduidade inclui TODOS os atletas, não só os primeiros N", async () => {
    // Regressão: o ranking deixou de estar limitado a um top (ex.: top 5) —
    // com 8 atletas com presenças, os 8 têm de aparecer na lista completa.
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO, nome: "Sub-13" });
    p.jogo.findMany.mockResolvedValue([]);
    p.sessao.findMany.mockResolvedValue([
      { id: "s1", data: new Date("2025-09-01"), tipoSessao: "NORMAL" },
    ]);
    p.atletaEscalao.count.mockResolvedValue(8);
    p.estatisticaAtleta.findMany.mockResolvedValue([]);
    p.eventoJogo.findMany.mockResolvedValue([]);
    // 8 atletas distintos, todos presentes na única sessão executada.
    p.presenca.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({
        sessaoId: "s1",
        atletaId: `atleta-${i + 1}`,
        atleta: { nome: `Atleta ${i + 1}` },
      })),
    );

    const r = await obterAnaliticoEscalao(ESCALAO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    // Todos os 8 atletas aparecem (sem corte por top N).
    expect(r.dados.rankingAssiduidade).toHaveLength(8);
    const ids = new Set(r.dados.rankingAssiduidade.map((a) => a.atletaId));
    expect(ids.size).toBe(8);
  });

  it("constrói rankings de métricas configuráveis por equipa", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO, nome: "Sub-13" });
    p.jogo.findMany.mockResolvedValue([]);
    p.sessao.findMany.mockResolvedValue([]);
    p.atletaEscalao.count.mockResolvedValue(2);
    p.estatisticaAtleta.findMany.mockResolvedValue([]);
    p.eventoJogo.findMany.mockResolvedValue([]);
    p.presenca.findMany.mockResolvedValue([]);
    p.valorMetrica.findMany.mockResolvedValue([
      { valor: 3, metrica: { id: "m1", nome: "Remates", tipo: "NUMERO", ordem: 0 }, estatistica: { atletaId: ATLETA, atleta: { nome: "João" } } },
      { valor: 2, metrica: { id: "m1", nome: "Remates", tipo: "NUMERO", ordem: 0 }, estatistica: { atletaId: ATLETA, atleta: { nome: "João" } } },
      { valor: 1, metrica: { id: "m1", nome: "Remates", tipo: "NUMERO", ordem: 0 }, estatistica: { atletaId: ATLETA2, atleta: { nome: "Rui" } } },
    ]);

    const r = await obterAnaliticoEscalao(ESCALAO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.rankingsMetricas).toEqual([
      {
        metrica: "Remates",
        tipo: "NUMERO",
        top: [
          { atletaId: ATLETA, atletaNome: "João", valor: 5 },
          { atletaId: ATLETA2, atletaNome: "Rui", valor: 1 },
        ],
      },
    ]);
  });

  it("filtra os jogos pela competição quando é indicada (P2.5)", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO, nome: "Sub-13" });
    p.jogo.findMany.mockResolvedValue([]);
    p.sessao.findMany.mockResolvedValue([]);
    p.atletaEscalao.count.mockResolvedValue(0);
    p.estatisticaAtleta.findMany.mockResolvedValue([]);
    p.eventoJogo.findMany.mockResolvedValue([]);
    p.presenca.findMany.mockResolvedValue([]);

    const r = await obterAnaliticoEscalao(ESCALAO, undefined, COMPETICAO);
    expect(r.sucesso).toBe(true);

    // Jogos e derivados filtram por competicaoId e só contam jogos já realizados
    // (data <= agora); treinos/presenças ficam globais.
    expect(p.jogo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          epocaId: EPOCA,
          escalaoId: ESCALAO,
          competicaoId: COMPETICAO,
          data: { lte: expect.any(Date) },
        },
      }),
    );
    expect(p.estatisticaAtleta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          jogo: {
            epocaId: EPOCA,
            escalaoId: ESCALAO,
            competicaoId: COMPETICAO,
            data: { lte: expect.any(Date) },
          },
        },
      }),
    );
    expect(p.eventoJogo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          jogo: {
            epocaId: EPOCA,
            escalaoId: ESCALAO,
            competicaoId: COMPETICAO,
            data: { lte: expect.any(Date) },
          },
        },
      }),
    );
    // Presenças não são filtradas por competição (treinos são transversais).
    expect(p.presenca.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ escalaoId: ESCALAO }),
      }),
    );
    const presencaArg = p.presenca.findMany.mock.calls[0][0];
    expect(presencaArg.where).not.toHaveProperty("competicaoId");
  });

  it("sem competição, não aplica filtro de competição (comportamento por defeito)", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO, nome: "Sub-13" });
    p.jogo.findMany.mockResolvedValue([]);
    p.sessao.findMany.mockResolvedValue([]);
    p.atletaEscalao.count.mockResolvedValue(0);
    p.estatisticaAtleta.findMany.mockResolvedValue([]);
    p.eventoJogo.findMany.mockResolvedValue([]);
    p.presenca.findMany.mockResolvedValue([]);

    const r = await obterAnaliticoEscalao(ESCALAO);
    expect(r.sucesso).toBe(true);
    expect(p.jogo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { epocaId: EPOCA, escalaoId: ESCALAO, data: { lte: expect.any(Date) } },
      }),
    );
  });

  it("nega escalão inexistente", async () => {
    p.escalao.findFirst.mockResolvedValue(null);
    const r = await obterAnaliticoEscalao(ESCALAO);
    expect(r.sucesso).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2.5 — competições de um escalão (filtro do painel)
// ─────────────────────────────────────────────────────────────────────────────

describe("obterCompeticoesEscalao", () => {
  it("devolve as competições com jogos do escalão/época", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO });
    p.competicao.findMany.mockResolvedValue([
      { id: COMPETICAO, nome: "Campeonato Distrital", tipo: "OFICIAL" },
      { id: "ckv9v0z1w0006abcd1234efgh", nome: "Torneio de Verão", tipo: "AMIGAVEL" },
    ]);

    const r = await obterCompeticoesEscalao(ESCALAO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados).toEqual([
      { id: COMPETICAO, nome: "Campeonato Distrital", tipo: "OFICIAL" },
      { id: "ckv9v0z1w0006abcd1234efgh", nome: "Torneio de Verão", tipo: "AMIGAVEL" },
    ]);
    expect(p.competicao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clubeId: CLUBE,
          escalaoId: ESCALAO,
          epocaId: EPOCA,
          jogos: { some: { epocaId: EPOCA, escalaoId: ESCALAO } },
        }),
      }),
    );
  });

  it("nega escalão inexistente", async () => {
    p.escalao.findFirst.mockResolvedValue(null);
    const r = await obterCompeticoesEscalao(ESCALAO);
    expect(r.sucesso).toBe(false);
  });

  it("nega sem permissão no escalão", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO });
    (podeLerEscalao as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const r = await obterCompeticoesEscalao(ESCALAO);
    expect(r.sucesso).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Nível 3 — clube
// ─────────────────────────────────────────────────────────────────────────────

describe("obterAnaliticoClubeEpoca", () => {
  it("compara escalões e agrega totais do clube", async () => {
    p.escalao.findMany.mockResolvedValue([
      { id: ESCALAO, nome: "Sub-13", ordem: 0 },
      { id: "esc2", nome: "Sub-15", ordem: 1 },
    ]);
    p.jogo.findMany.mockResolvedValue([
      { escalaoId: ESCALAO, golosMarcados: 3, golosSofridos: 1 },
      { escalaoId: "esc2", golosMarcados: 0, golosSofridos: 2 },
    ]);
    p.sessao.groupBy.mockResolvedValue([
      { escalaoId: ESCALAO, _count: { _all: 2 } },
      { escalaoId: "esc2", _count: { _all: 1 } },
    ]);
    p.atletaEscalao.groupBy.mockResolvedValue([
      { escalaoId: ESCALAO, _count: { _all: 10 } },
      { escalaoId: "esc2", _count: { _all: 8 } },
    ]);
    p.presenca.groupBy.mockResolvedValue([
      { escalaoId: ESCALAO, _count: { _all: 2 } },
      { escalaoId: "esc2", _count: { _all: 1 } },
    ]);

    const r = await obterAnaliticoClubeEpoca();
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.escaloes).toHaveLength(2);
    const sub13 = r.dados.escaloes.find((e) => e.escalaoId === ESCALAO)!;
    expect(sub13.vitorias).toBe(1);
    expect(sub13.nAtletas).toBe(10);
    expect(sub13.sessoes).toBe(2);
    // Mock devolve o mesmo groupBy para total e executadas → iguais aqui.
    expect(sub13.sessoesExecutadas).toBe(2);
    expect(r.dados.totais.jogos).toBe(2);
    expect(r.dados.totais.vitorias).toBe(1);
    expect(r.dados.totais.derrotas).toBe(1);
    expect(r.dados.totais.nAtletas).toBe(18);
    // Balanço agregado do clube (P2-06): soma de todos os escalões.
    expect(r.dados.balanco).toEqual({
      vitorias: 1,
      empates: 0,
      derrotas: 1,
      jogos: 2,
      golosMarcados: 3,
      golosSofridos: 3,
    });
  });

  it("distingue sessões programadas de executadas por escalão e no total", async () => {
    p.escalao.findMany.mockResolvedValue([
      { id: ESCALAO, nome: "Sub-13", ordem: 0 },
      { id: "esc2", nome: "Sub-15", ordem: 1 },
    ]);
    p.jogo.findMany.mockResolvedValue([]);
    // 1.ª groupBy = programadas (total); 2.ª groupBy = executadas (data < agora).
    p.sessao.groupBy
      .mockResolvedValueOnce([
        { escalaoId: ESCALAO, _count: { _all: 5 } },
        { escalaoId: "esc2", _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([
        { escalaoId: ESCALAO, _count: { _all: 4 } },
        { escalaoId: "esc2", _count: { _all: 1 } },
      ]);
    p.atletaEscalao.groupBy.mockResolvedValue([
      { escalaoId: ESCALAO, _count: { _all: 10 } },
      { escalaoId: "esc2", _count: { _all: 8 } },
    ]);
    p.presenca.groupBy.mockResolvedValue([]);

    const r = await obterAnaliticoClubeEpoca();
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    const sub13 = r.dados.escaloes.find((e) => e.escalaoId === ESCALAO)!;
    const sub15 = r.dados.escaloes.find((e) => e.escalaoId === "esc2")!;
    expect(sub13.sessoes).toBe(5);
    expect(sub13.sessoesExecutadas).toBe(4);
    expect(sub15.sessoes).toBe(3);
    expect(sub15.sessoesExecutadas).toBe(1);
    // Totais: 8 programadas, 5 executadas.
    expect(r.dados.totais.sessoes).toBe(8);
    expect(r.dados.totais.sessoesExecutadas).toBe(5);
  });

  it("assiduidade do clube usa sessões executadas, não as programadas (BUG-P1-08)", async () => {
    // 1 escalão, 5 atletas, 10 sessões programadas mas só 1 executada, e 5
    // presenças → taxa = 5/(5×1) = 100%, não 5/(5×10) = 10%.
    p.escalao.findMany.mockResolvedValue([{ id: ESCALAO, nome: "Sub-13", ordem: 0 }]);
    p.jogo.findMany.mockResolvedValue([]);
    p.sessao.groupBy
      .mockResolvedValueOnce([{ escalaoId: ESCALAO, _count: { _all: 10 } }]) // programadas
      .mockResolvedValueOnce([{ escalaoId: ESCALAO, _count: { _all: 1 } }]); // executadas
    p.atletaEscalao.groupBy.mockResolvedValue([{ escalaoId: ESCALAO, _count: { _all: 5 } }]);
    p.presenca.groupBy.mockResolvedValue([{ escalaoId: ESCALAO, _count: { _all: 5 } }]);

    const r = await obterAnaliticoClubeEpoca();
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    const sub13 = r.dados.escaloes.find((e) => e.escalaoId === ESCALAO)!;
    expect(sub13.sessoes).toBe(10);
    expect(sub13.sessoesExecutadas).toBe(1);
    expect(sub13.taxaPresencaMedia).toBeCloseTo(1);
    expect(r.dados.totais.taxaPresencaMediaGlobal).toBeCloseTo(1);
  });

  it("nega sem escalões visíveis", async () => {
    (escaloesLegiveis as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    p.escalao.findMany.mockResolvedValue([]);
    const r = await obterAnaliticoClubeEpoca();
    expect(r.sucesso).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Relatório partilhável
// ─────────────────────────────────────────────────────────────────────────────

describe("relatório partilhável (token + snapshot)", () => {
  it("gera relatório de clube e permite leitura pública pelo token", async () => {
    // Dados para o analítico de clube (chamado internamente).
    p.escalao.findMany.mockResolvedValue([{ id: ESCALAO, nome: "Sub-13", ordem: 0 }]);
    p.jogo.findMany.mockResolvedValue([{ escalaoId: ESCALAO, golosMarcados: 2, golosSofridos: 0 }]);
    p.sessao.groupBy.mockResolvedValue([{ escalaoId: ESCALAO, _count: { _all: 1 } }]);
    p.atletaEscalao.groupBy.mockResolvedValue([{ escalaoId: ESCALAO, _count: { _all: 5 } }]);
    p.presenca.groupBy.mockResolvedValue([{ escalaoId: ESCALAO, _count: { _all: 1 } }]);

    let snapshotGuardado: unknown = null;
    p.relatorioPartilhado.create.mockImplementation(
      async ({ data }: { data: { dadosSnapshot: unknown } }) => {
        snapshotGuardado = data.dadosSnapshot;
        return { id: "rel1", token: "tok-abc" };
      },
    );

    const gerar = await gerarRelatorioPartilhado({ tipo: "EPOCA_CLUBE" });
    expect(gerar.sucesso).toBe(true);
    if (!gerar.sucesso) return;
    expect(gerar.dados.token).toBe("tok-abc");
    expect(snapshotGuardado).not.toBeNull();

    // Leitura pública: findUnique devolve o snapshot capturado.
    p.relatorioPartilhado.findUnique.mockResolvedValue({
      tipo: "EPOCA_CLUBE",
      dadosSnapshot: snapshotGuardado,
      expiraEm: null,
    });
    const publico = await obterRelatorioPorToken("tok-abc");
    expect(publico.sucesso).toBe(true);
    if (!publico.sucesso) return;
    expect(publico.dados.tipo).toBe("EPOCA_CLUBE");
    expect(publico.dados.clube.nome).toBe("Clube Teste");
    expect(publico.dados.clube.corPrimaria).toBe("#F0531E");
  });

  it("exige o atletaId para o tipo EPOCA_ATLETA", async () => {
    const r = await gerarRelatorioPartilhado({ tipo: "EPOCA_ATLETA" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.atletaId).toBeDefined();
  });

  it("recusa geração sem RELATORIOS_VER", async () => {
    (obterMembroAtual as ReturnType<typeof vi.fn>).mockResolvedValue(
      membroComRelatorios({ capacidades: [] }),
    );
    const r = await gerarRelatorioPartilhado({ tipo: "EPOCA_CLUBE" });
    expect(r.sucesso).toBe(false);
  });

  it("token inexistente devolve erro", async () => {
    p.relatorioPartilhado.findUnique.mockResolvedValue(null);
    const r = await obterRelatorioPorToken("nao-existe");
    expect(r.sucesso).toBe(false);
  });

  it("relatório expirado não é servido", async () => {
    p.relatorioPartilhado.findUnique.mockResolvedValue({
      tipo: "EPOCA_CLUBE",
      dadosSnapshot: { tipo: "EPOCA_CLUBE", clube: {}, epoca: {}, geradoEm: "", dados: {} },
      expiraEm: new Date(Date.now() - 1000),
    });
    const r = await obterRelatorioPorToken("tok-expirado");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toContain("expirou");
  });

  it("lista e revoga relatórios do clube", async () => {
    p.relatorioPartilhado.findMany.mockResolvedValue([
      { id: "rel1", token: "t1", tipo: "EPOCA_CLUBE", epocaId: EPOCA, escalaoId: null, atletaId: null, expiraEm: null, criadoEm: new Date() },
    ]);
    const lista = await listarRelatoriosPartilhados();
    expect(lista.sucesso).toBe(true);
    if (lista.sucesso) expect(lista.dados).toHaveLength(1);

    p.relatorioPartilhado.findFirst.mockResolvedValue({ id: "rel1" });
    p.relatorioPartilhado.delete.mockResolvedValue({});
    const rev = await revogarRelatorioPartilhado("rel1");
    expect(rev.sucesso).toBe(true);
    expect(p.relatorioPartilhado.delete).toHaveBeenCalled();
  });
});
