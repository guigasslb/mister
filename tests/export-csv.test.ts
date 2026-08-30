import { describe, it, expect, vi, beforeEach } from "vitest";
import { BOM_UTF8 } from "@/lib/utils/csv";

// F1.2 — Server Actions de export CSV dos analíticos.
// Delegam em obterAnaliticoEscalao / obterAnaliticoAtleta, por isso mockamos a
// mesma superfície (Prisma + permissões + época) do padrão de analise-f9.

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
    sessao: { findMany: vi.fn(), count: vi.fn() },
    presenca: { findMany: vi.fn(), count: vi.fn() },
    eventoJogo: { findMany: vi.fn() },
    jogo: { findMany: vi.fn() },
    competicao: { findMany: vi.fn() },
    habilidade: { count: vi.fn() },
    progressoHabilidade: { findMany: vi.fn() },
    valorMetrica: { findMany: vi.fn() },
  },
}));

import {
  exportarAnaliticoEscalaoCsv,
  exportarAnaliticoAtletaCsv,
} from "@/lib/actions/analise";
import { obterEpocaAtiva } from "@/lib/epoca-context";
import {
  obterMembroAtual,
  podeLerEscalao,
  podeLerAlgumEscalao,
} from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const CLUBE = "ckv9v0z1w0000abcd1234efgh";
const EPOCA = "ckv9v0z1w0001abcd1234efgh";
const ESCALAO = "ckv9v0z1w0002abcd1234efgh";
const ATLETA = "ckv9v0z1w0003abcd1234efgh";
const ATLETA2 = "ckv9v0z1w0004abcd1234efgh";

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
  (obterMembroAtual as ReturnType<typeof vi.fn>).mockResolvedValue(membroComRelatorios());
  p.epoca.findFirst.mockResolvedValue({ id: EPOCA, nome: "2025/26" });
  p.valorMetrica.findMany.mockResolvedValue([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Escalão
// ─────────────────────────────────────────────────────────────────────────────

function prepararEscalao() {
  p.escalao.findFirst.mockResolvedValue({ id: ESCALAO, nome: "Sub-13" });
  p.jogo.findMany.mockResolvedValue([
    { id: "j1", data: new Date("2025-09-10"), adversario: "A", golosMarcados: 3, golosSofridos: 1 },
  ]);
  p.sessao.findMany.mockResolvedValue([
    { id: "s1", data: new Date("2025-09-01"), tipoSessao: "NORMAL", fechado: true },
    { id: "s2", data: new Date("2025-09-08"), tipoSessao: "ABERTO", fechado: true },
  ]);
  p.atletaEscalao.count.mockResolvedValue(10);
  p.estatisticaAtleta.findMany.mockResolvedValue([
    { atletaId: ATLETA, golos: 3, assistencias: 1, blocoTempo: "JOGO_COMPLETO", utilizacao: "TITULAR", atleta: { nome: "João" } },
    { atletaId: ATLETA2, golos: 1, assistencias: 2, blocoTempo: "MEIA_PARTE", utilizacao: "UTILIZADO", atleta: { nome: "Rui" } },
  ]);
  p.eventoJogo.findMany.mockResolvedValue([]);
  p.presenca.findMany.mockResolvedValue([{ sessaoId: "s1" }, { sessaoId: "s1" }, { sessaoId: "s2" }]);
}

describe("exportarAnaliticoEscalaoCsv", () => {
  it("nega sem capacidade RELATORIOS_VER", async () => {
    (obterMembroAtual as ReturnType<typeof vi.fn>).mockResolvedValue(
      membroComRelatorios({ capacidades: [] }),
    );
    const r = await exportarAnaliticoEscalaoCsv({ escalaoId: ESCALAO });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Sem permissão");
  });

  it("nega escalão inexistente", async () => {
    p.escalao.findFirst.mockResolvedValue(null);
    const r = await exportarAnaliticoEscalaoCsv({ escalaoId: ESCALAO });
    expect(r.sucesso).toBe(false);
  });

  it("rejeita input inválido (escalaoId não-cuid)", async () => {
    const r = await exportarAnaliticoEscalaoCsv({ escalaoId: "nao-cuid" });
    expect(r.sucesso).toBe(false);
  });

  it("gera CSV com BOM, cabeçalho por atleta, linha do atleta e resumo do escalão", async () => {
    prepararEscalao();
    const r = await exportarAnaliticoEscalaoCsv({ escalaoId: ESCALAO });
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;

    const { csv, nomeFicheiro } = r.dados;
    // BOM UTF-8 no início.
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    // Cabeçalho da tabela por atleta (a seguir ao BOM).
    expect(csv.slice(BOM_UTF8.length)).toMatch(
      /^Nome;Golos;Assistências;Jogos utilizados;Minutos acumulados\r\n/,
    );
    // Linha do melhor marcador (João: 3 golos, 1 assistência, 1 jogo, 40 min).
    expect(csv).toContain("João;3;1;1;40");
    // Resumo do escalão com a taxa de presença média (3/(10×2)=0.15 → 15.0%).
    expect(csv).toContain("Indicador;Valor");
    expect(csv).toContain("Taxa de presença média (%);15.0");
    expect(csv).toContain("Vitórias;1");
    // Nome de ficheiro slugificado com o nome do escalão.
    expect(nomeFicheiro).toMatch(/^analitico-sub-13-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("inclui uma coluna por métrica configurável", async () => {
    prepararEscalao();
    p.valorMetrica.findMany.mockResolvedValue([
      { valor: 3, metrica: { id: "m1", nome: "Remates", tipo: "NUMERO", ordem: 0 }, estatistica: { atletaId: ATLETA, atleta: { nome: "João" } } },
      { valor: 2, metrica: { id: "m1", nome: "Remates", tipo: "NUMERO", ordem: 0 }, estatistica: { atletaId: ATLETA, atleta: { nome: "João" } } },
    ]);
    const r = await exportarAnaliticoEscalaoCsv({ escalaoId: ESCALAO });
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    // Coluna dinâmica "Remates" no cabeçalho + valor agregado (5) na linha do João.
    expect(r.dados.csv).toContain("Minutos acumulados;Remates");
    expect(r.dados.csv).toContain("João;3;1;1;40;5");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Atleta
// ─────────────────────────────────────────────────────────────────────────────

function prepararAtleta() {
  p.atleta.findFirst.mockResolvedValue({
    id: ATLETA,
    nome: "João Silva",
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
    { id: "s1", data: new Date("2025-09-01"), fechado: true },
    { id: "s2", data: new Date("2025-09-08"), fechado: true },
  ]);
  p.presenca.findMany.mockResolvedValue([{ sessaoId: "s1" }]);
  p.habilidade.count.mockResolvedValue(0);
  p.progressoHabilidade.findMany.mockResolvedValue([]);
  // Comparação com a equipa (escalão de contexto definido).
  p.sessao.count.mockResolvedValue(2);
  p.presenca.count.mockResolvedValue(5);
}

describe("exportarAnaliticoAtletaCsv", () => {
  it("nega sem capacidade RELATORIOS_VER", async () => {
    (obterMembroAtual as ReturnType<typeof vi.fn>).mockResolvedValue(
      membroComRelatorios({ capacidades: [] }),
    );
    const r = await exportarAnaliticoAtletaCsv({ atletaId: ATLETA, escalaoId: ESCALAO });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Sem permissão");
  });

  it("nega quando o atleta não participa no escalão", async () => {
    p.atleta.findFirst.mockResolvedValue({
      id: ATLETA,
      nome: "João",
      posicoes: ["ALA"],
      criadoEm: new Date("2025-08-01"),
      dataIngresso: null,
      participacoes: [{ escalaoId: "outro-escalao", escalao: { nome: "Sub-15" } }],
    });
    const r = await exportarAnaliticoAtletaCsv({ atletaId: ATLETA, escalaoId: ESCALAO });
    expect(r.sucesso).toBe(false);
  });

  it("rejeita input inválido (falta escalaoId)", async () => {
    const r = await exportarAnaliticoAtletaCsv({
      atletaId: ATLETA,
    } as unknown as { atletaId: string; escalaoId: string });
    expect(r.sucesso).toBe(false);
  });

  it("gera CSV com evolução jogo a jogo, linha de totais e resumo da época", async () => {
    prepararAtleta();
    const r = await exportarAnaliticoAtletaCsv({ atletaId: ATLETA, escalaoId: ESCALAO });
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;

    const { csv, nomeFicheiro } = r.dados;
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    // Cabeçalho da evolução (atleta de campo → sem colunas de GR).
    expect(csv.slice(BOM_UTF8.length)).toMatch(
      /^Data;Adversário;Utilizado;Golos;Assistências\r\n/,
    );
    // Linha do jogo (data pt-PT).
    expect(csv).toContain("10/09/2025;Rival A;Sim;2;1");
    // Linha de totais.
    expect(csv).toContain("Totais;;1;2;1");
    // Resumo da época.
    expect(csv).toContain("Minutos acumulados;40");
    expect(csv).toContain("Taxa de presença (%);50.0");
    // Nome de ficheiro slugificado com o nome do atleta.
    expect(nomeFicheiro).toMatch(/^analitico-joao-silva-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("inclui colunas de GR quando o atleta é guarda-redes", async () => {
    p.atleta.findFirst.mockResolvedValue({
      id: ATLETA,
      nome: "Nuno GR",
      posicoes: ["GUARDA_REDES"],
      criadoEm: new Date("2025-08-01"),
      dataIngresso: null,
      participacoes: [{ escalaoId: ESCALAO, escalao: { nome: "Sub-13" } }],
    });
    p.convocatoria.count.mockResolvedValue(1);
    p.estatisticaAtleta.findMany.mockResolvedValue([
      {
        utilizacao: "TITULAR",
        blocoTempo: "JOGO_COMPLETO",
        minutos: null,
        golos: 0,
        assistencias: 0,
        defesas: 5,
        golosSofridosGR: 2,
        jogo: { data: new Date("2025-09-10"), adversario: "Rival A" },
      },
    ]);
    p.sessao.findMany.mockResolvedValue([]);
    p.presenca.findMany.mockResolvedValue([]);
    p.habilidade.count.mockResolvedValue(0);
    p.progressoHabilidade.findMany.mockResolvedValue([]);
    p.sessao.count.mockResolvedValue(0);
    p.presenca.count.mockResolvedValue(0);

    const r = await exportarAnaliticoAtletaCsv({ atletaId: ATLETA, escalaoId: ESCALAO });
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.csv.slice(BOM_UTF8.length)).toMatch(
      /^Data;Adversário;Utilizado;Golos;Assistências;Defesas;Golos sofridos\r\n/,
    );
    expect(r.dados.csv).toContain("10/09/2025;Rival A;Sim;0;0;5;2");
  });
});

describe("exportarAnaliticoAtletaCsv — isolamento multi-tenant", () => {
  it("nega quando o atleta pertence a outro clube (atleta não encontrado no clube autenticado)", async () => {
    // `obterAnaliticoAtleta` filtra por `{ id: atletaId, clubeId }`. Se o atleta
    // pertence a outro clube, `findFirst` devolve null → erro "Atleta não encontrado".
    p.atleta.findFirst.mockResolvedValue(null);
    const r = await exportarAnaliticoAtletaCsv({ atletaId: ATLETA, escalaoId: ESCALAO });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/atleta/i);
  });
});
