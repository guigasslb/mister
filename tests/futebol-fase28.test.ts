import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Fase 28 — Jogos e estatísticas de FUTEBOL (§3.7, §10.8)
// Cobre: derivação de Jogo.formato, MINUTOS_POR_PARTE + blocoParaMinutos por
// formato, núcleo estatístico de futebol no upsert, filtro de modalidade em
// listarJogos e segmentação por modalidade em obterAnaliticoAtleta.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Funções puras (sem mocks) ────────────────────────────────────────────────
import {
  MINUTOS_POR_BLOCO,
  MINUTOS_POR_PARTE,
  minutosPorBlocoDoFormato,
  blocoParaMinutos,
  agregarEstatisticas,
  type LinhaEstatistica,
} from "@/lib/estatisticas";
import { modalidadeEfetiva, filtroModalidadeJogo } from "@/lib/modalidade-escalao";

describe("MINUTOS_POR_PARTE / blocoParaMinutos por formato (§10.8)", () => {
  it("cobre exatamente os 6 formatos de jogo", () => {
    expect(Object.keys(MINUTOS_POR_PARTE)).toHaveLength(6);
  });

  it("futsal (sem formato) mantém a tabela base — retrocompat total", () => {
    expect(blocoParaMinutos("JOGO_COMPLETO")).toBe(40);
    expect(blocoParaMinutos("MEIA_PARTE")).toBe(20);
    // A tabela base (futsal) continua com 5 blocos.
    expect(Object.keys(MINUTOS_POR_BLOCO)).toHaveLength(5);
  });

  it("FUTSAL_5 explícito é idêntico ao futsal base (40/20)", () => {
    expect(blocoParaMinutos("JOGO_COMPLETO", "FUTSAL_5")).toBe(40);
    expect(blocoParaMinutos("MEIA_PARTE", "FUTSAL_5")).toBe(20);
  });

  it("FUTEBOL_11: jogo completo = 90, meia parte = 45", () => {
    expect(blocoParaMinutos("JOGO_COMPLETO", "FUTEBOL_11")).toBe(90);
    expect(blocoParaMinutos("MEIA_PARTE", "FUTEBOL_11")).toBe(45);
  });

  it("varia por formato (7/9) e mantém blocos curtos constantes", () => {
    expect(blocoParaMinutos("JOGO_COMPLETO", "FUTEBOL_7")).toBe(50);
    expect(blocoParaMinutos("JOGO_COMPLETO", "FUTEBOL_9")).toBe(70);
    expect(blocoParaMinutos("JOGO_COMPLETO", "FUTEBOL_3_3")).toBe(30);
    // BLOCO_10MIN / BLOCO_5MIN / NAO_JOGOU não dependem do formato.
    expect(blocoParaMinutos("BLOCO_10MIN", "FUTEBOL_11")).toBe(10);
    expect(blocoParaMinutos("BLOCO_5MIN", "FUTEBOL_11")).toBe(5);
    expect(blocoParaMinutos("NAO_JOGOU", "FUTEBOL_11")).toBe(0);
  });

  it("bloco null/undefined = 0 mesmo com formato", () => {
    expect(blocoParaMinutos(null, "FUTEBOL_11")).toBe(0);
    expect(blocoParaMinutos(undefined, "FUTEBOL_11")).toBe(0);
  });

  it("minutosPorBlocoDoFormato deriva a tabela completa do formato", () => {
    expect(minutosPorBlocoDoFormato("FUTEBOL_11")).toEqual({
      JOGO_COMPLETO: 90,
      MEIA_PARTE: 45,
      BLOCO_10MIN: 10,
      BLOCO_5MIN: 5,
      NAO_JOGOU: 0,
    });
  });
});

describe("agregarEstatisticas — tempoJogoAcumulado por formato (§10.8)", () => {
  function linha(over: Partial<LinhaEstatistica> = {}): LinhaEstatistica {
    return {
      utilizacao: "TITULAR",
      minutos: null,
      golos: 0,
      assistencias: 0,
      defesas: null,
      golosSofridosGR: null,
      ...over,
    };
  }

  it("usa os minutos por bloco do formato de cada linha", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 2,
      sessoesTotais: 0,
      presencas: 0,
      estatisticas: [
        linha({ blocoTempo: "JOGO_COMPLETO", formato: "FUTEBOL_11" }), // 90
        linha({ blocoTempo: "MEIA_PARTE", formato: "FUTEBOL_11" }), // 45
      ],
    });
    expect(r.tempoJogoAcumulado).toBe(135);
  });

  it("linha sem formato cai no futsal base (40)", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 1,
      sessoesTotais: 0,
      presencas: 0,
      estatisticas: [linha({ blocoTempo: "JOGO_COMPLETO" })],
    });
    expect(r.tempoJogoAcumulado).toBe(40);
  });
});

describe("modalidadeEfetiva (§3.5/§3.7)", () => {
  it("atividade pontual prevalece sobre a secção", () => {
    expect(modalidadeEfetiva("FUTEBOL", "FUTSAL")).toBe("FUTEBOL");
  });
  it("herda a secção quando não há atividade pontual", () => {
    expect(modalidadeEfetiva(null, "FUTEBOL")).toBe("FUTEBOL");
    expect(modalidadeEfetiva(undefined, "FUTSAL")).toBe("FUTSAL");
  });
  it("fallback FUTSAL para dados legados sem secção", () => {
    expect(modalidadeEfetiva(null, null)).toBe("FUTSAL");
    expect(modalidadeEfetiva(undefined, undefined)).toBe("FUTSAL");
  });
});

describe("filtroModalidadeJogo (§10.8)", () => {
  it("sem modalidade não filtra", () => {
    expect(filtroModalidadeJogo()).toEqual({});
    expect(filtroModalidadeJogo(null)).toEqual({});
  });
  it("com modalidade usa atividade pontual OU secção do escalão", () => {
    expect(filtroModalidadeJogo("FUTEBOL")).toEqual({
      OR: [
        { modalidadeAtividade: "FUTEBOL" },
        { modalidadeAtividade: null, escalao: { seccao: { modalidade: "FUTEBOL" } } },
      ],
    });
  });
});

// ─── Actions (com mocks) ───────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));
vi.mock("@/lib/epoca-context", () => ({
  obterClubeIdAtual: vi.fn(),
  obterEpocaAtiva: vi.fn(),
  COOKIE_EPOCA: "epoca_ativa",
}));
vi.mock("@/lib/permissoes", () => ({
  exigirCapacidade: vi.fn(),
  obterMembroAtual: vi.fn(),
  podeLerEscalao: vi.fn(),
  podeLerAlgumEscalao: vi.fn(),
  escaloesLegiveis: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    jogo: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    escalao: { findFirst: vi.fn() },
    competicao: { findFirst: vi.fn() },
    convocatoria: { findMany: vi.fn(), count: vi.fn() },
    atletaEscalao: { count: vi.fn() },
    estatisticaAtleta: { upsert: vi.fn(), findMany: vi.fn() },
    valorMetrica: { upsert: vi.fn(), findMany: vi.fn() },
    valorMetricaSessao: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    metricaConfig: { findMany: vi.fn() },
    atleta: { findFirst: vi.fn() },
    sessao: { findMany: vi.fn() },
    presenca: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { criarJogo, guardarEstatisticas, listarJogos } from "@/lib/actions/jogos";
import { obterAnaliticoAtleta } from "@/lib/actions/analise";
import { auth } from "@/lib/auth";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import {
  exigirCapacidade,
  obterMembroAtual,
  podeLerEscalao,
  podeLerAlgumEscalao,
  escaloesLegiveis,
} from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const ESC = "ckv9v0z1w0000abcd1234efga";
const ESC_FUT = "ckv9v0z1w0000abcd1234efgb";
const JOGO = "ckv9v0z1w0000abcd1234efgc";
const ATLETA = "ckv9v0z1w0000abcd1234efgd";
const CLUBE = "ckv9v0z1w0000abcd1234efge";
const EPOCA = "ckv9v0z1w0000abcd1234efgf";

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const mocked = <T,>(fn: T) => fn as unknown as { mockResolvedValue: (v: unknown) => void };
const PERM_OK = { ok: true, ctx: { clube: { id: CLUBE } } };

const ENTRADA_JOGO = {
  data: "2026-09-15",
  adversario: "Sporting CP",
  casaFora: "CASA" as const,
  tipo: "OFICIAL" as const,
  escalaoId: ESC,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(auth).mockResolvedValue({ user: { id: "user1" } });
  mocked(obterClubeIdAtual).mockResolvedValue(CLUBE);
  mocked(obterEpocaAtiva).mockResolvedValue({ id: EPOCA, nome: "2025/26" });
  mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
  mocked(podeLerEscalao).mockResolvedValue(true);
  mocked(podeLerAlgumEscalao).mockResolvedValue(true);
  mocked(escaloesLegiveis).mockResolvedValue("TODOS");
  p.jogo.create.mockResolvedValue({ id: JOGO });
  p.jogo.update.mockResolvedValue({ id: JOGO });
  p.estatisticaAtleta.upsert.mockResolvedValue({ id: "estat1" });
  p.metricaConfig.findMany.mockResolvedValue([]);
  p.valorMetrica.findMany.mockResolvedValue([]);
  p.valorMetricaSessao.findMany.mockResolvedValue([]);
  p.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

// ─── criarJogo: derivação de formato (§3.7) ────────────────────────────────────

describe("criarJogo — derivação de Jogo.formato (§3.7)", () => {
  const dataCriada = () =>
    (p.jogo.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;

  it("FUTSAL sem formato → FUTSAL_5 por defeito", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESC, seccao: { modalidade: "FUTSAL" } });
    const r = await criarJogo(ENTRADA_JOGO);
    expect(r.sucesso).toBe(true);
    expect(dataCriada().formato).toBe("FUTSAL_5");
  });

  it("FUTEBOL sem formato → erro (5 formatos, sem default)", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESC, seccao: { modalidade: "FUTEBOL" } });
    const r = await criarJogo(ENTRADA_JOGO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/formato/i);
    expect(p.jogo.create).not.toHaveBeenCalled();
  });

  it("FUTEBOL com formato indicado → usa-o", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESC, seccao: { modalidade: "FUTEBOL" } });
    const r = await criarJogo({ ...ENTRADA_JOGO, formato: "FUTEBOL_11" });
    expect(r.sucesso).toBe(true);
    expect(dataCriada().formato).toBe("FUTEBOL_11");
  });

  it("formato indicado prevalece mesmo num escalão de futsal (amigável)", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESC, seccao: { modalidade: "FUTSAL" } });
    const r = await criarJogo({ ...ENTRADA_JOGO, formato: "FUTEBOL_7" });
    expect(r.sucesso).toBe(true);
    expect(dataCriada().formato).toBe("FUTEBOL_7");
  });
});

// ─── guardarEstatisticas: núcleo de futebol (§10.8) ────────────────────────────

describe("guardarEstatisticas — núcleo por modalidade (§10.8)", () => {
  const upsertData = () =>
    (p.estatisticaAtleta.upsert.mock.calls[0][0] as { create: Record<string, unknown> }).create;

  beforeEach(() => {
    p.convocatoria.findMany.mockResolvedValue([{ atletaId: ATLETA }]);
  });

  it("FUTEBOL grava remates/cantos/foras-de-jogo/desarmes", async () => {
    p.jogo.findFirst.mockResolvedValue({
      id: JOGO,
      escalaoId: ESC,
      modalidadeAtividade: null,
      escalao: { seccao: { modalidade: "FUTEBOL" } },
    });
    const r = await guardarEstatisticas(JOGO, [
      {
        atletaId: ATLETA,
        utilizacao: "TITULAR",
        golos: 1,
        assistencias: 0,
        remates: 4,
        cantos: 2,
        forasDeJogo: 1,
        desarmes: 3,
      },
    ]);
    expect(r.sucesso).toBe(true);
    const d = upsertData();
    expect(d.remates).toBe(4);
    expect(d.cantos).toBe(2);
    expect(d.forasDeJogo).toBe(1);
    expect(d.desarmes).toBe(3);
  });

  it("FUTSAL ignora o núcleo de futebol (força null)", async () => {
    p.jogo.findFirst.mockResolvedValue({
      id: JOGO,
      escalaoId: ESC,
      modalidadeAtividade: null,
      escalao: { seccao: { modalidade: "FUTSAL" } },
    });
    const r = await guardarEstatisticas(JOGO, [
      {
        atletaId: ATLETA,
        utilizacao: "TITULAR",
        golos: 1,
        assistencias: 0,
        remates: 9, // enviado mas deve ser ignorado
        cantos: 9,
        forasDeJogo: 9,
        desarmes: 9,
      },
    ]);
    expect(r.sucesso).toBe(true);
    const d = upsertData();
    expect(d.remates).toBeNull();
    expect(d.cantos).toBeNull();
    expect(d.forasDeJogo).toBeNull();
    expect(d.desarmes).toBeNull();
  });
});

// ─── listarJogos: filtro por modalidade (§10.8) ────────────────────────────────

describe("listarJogos — filtro de modalidade (§10.8)", () => {
  it("aplica o filtro de modalidade efetiva e devolve a modalidade por jogo", async () => {
    p.jogo.findMany.mockResolvedValue([
      {
        id: JOGO,
        modalidadeAtividade: null,
        escalao: { id: ESC_FUT, nome: "Sub-13 Futebol", seccao: { modalidade: "FUTEBOL" } },
      },
    ]);
    const r = await listarJogos(undefined, "FUTEBOL");
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados[0].modalidade).toBe("FUTEBOL");

    const where = (p.jogo.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.OR).toEqual([
      { modalidadeAtividade: "FUTEBOL" },
      { modalidadeAtividade: null, escalao: { seccao: { modalidade: "FUTEBOL" } } },
    ]);
  });

  it("sem modalidade não aplica filtro OR", async () => {
    p.jogo.findMany.mockResolvedValue([]);
    const r = await listarJogos();
    expect(r.sucesso).toBe(true);
    const where = (p.jogo.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).not.toHaveProperty("OR");
  });
});

// ─── obterAnaliticoAtleta: segmentação por modalidade (§10.1/§10.8) ─────────────

describe("obterAnaliticoAtleta — segmentação por modalidade (§10.8)", () => {
  beforeEach(() => {
    mocked(obterMembroAtual).mockResolvedValue({
      utilizadorId: "user1",
      clube: { id: CLUBE, nome: "Clube", corPrimaria: "#000", corSecundaria: "#fff", logoUrl: null },
      capacidades: ["RELATORIOS_VER"],
    });
    p.atleta.findFirst.mockResolvedValue({
      id: ATLETA,
      nome: "João",
      posicoes: ["ALA"],
      criadoEm: new Date("2025-08-01"),
      dataIngresso: null,
      participacoes: [
        { escalaoId: ESC, escalao: { nome: "Futsal", seccao: { modalidade: "FUTSAL" } } },
        { escalaoId: ESC_FUT, escalao: { nome: "Futebol", seccao: { modalidade: "FUTEBOL" } } },
      ],
    });
    p.convocatoria.count.mockResolvedValue(1);
    p.sessao.findMany.mockResolvedValue([]);
    p.presenca.findMany.mockResolvedValue([]);
  });

  it("vista conjunta restringe escalões e jogos à modalidade pedida", async () => {
    p.estatisticaAtleta.findMany.mockResolvedValue([
      {
        utilizacao: "TITULAR",
        blocoTempo: "JOGO_COMPLETO",
        minutos: null,
        golos: 1,
        assistencias: 0,
        defesas: null,
        golosSofridosGR: null,
        jogo: { data: new Date("2025-09-10"), adversario: "Rival", formato: "FUTEBOL_11" },
      },
    ]);

    const r = await obterAnaliticoAtleta(ATLETA, undefined, undefined, "FUTEBOL");
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;

    // Só o escalão de futebol entra no contexto (jogos + sessões + presenças).
    const estatWhere = (p.estatisticaAtleta.findMany.mock.calls[0][0] as {
      where: { jogo: { escalaoId: { in: string[] }; OR?: unknown } };
    }).where;
    expect(estatWhere.jogo.escalaoId.in).toEqual([ESC_FUT]);
    expect(estatWhere.jogo.OR).toBeTruthy();

    const sessaoWhere = (p.sessao.findMany.mock.calls[0][0] as {
      where: { escalaoId: { in: string[] } };
    }).where;
    expect(sessaoWhere.escalaoId.in).toEqual([ESC_FUT]);

    // Tempo de jogo respeita o formato do jogo (FUTEBOL_11 → 90).
    expect(r.dados.agregado.tempoJogoAcumulado).toBe(90);
  });

  it("sem modalidade agrega todas as participações (comportamento pré-v7)", async () => {
    p.estatisticaAtleta.findMany.mockResolvedValue([]);
    const r = await obterAnaliticoAtleta(ATLETA);
    expect(r.sucesso).toBe(true);
    const estatWhere = (p.estatisticaAtleta.findMany.mock.calls[0][0] as {
      where: { jogo: { escalaoId: { in: string[] }; OR?: unknown } };
    }).where;
    expect(estatWhere.jogo.escalaoId.in.sort()).toEqual([ESC, ESC_FUT].sort());
    expect(estatWhere.jogo.OR).toBeUndefined();
  });
});
