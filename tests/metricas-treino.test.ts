import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/epoca-context", () => ({
  obterClubeIdAtual: vi.fn(),
}));

vi.mock("@/lib/permissoes", () => ({
  exigirCapacidade: vi.fn(),
  podeLerEscalao: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    sessao: { findFirst: vi.fn() },
    metricaConfig: { findMany: vi.fn() },
    atleta: { findMany: vi.fn() },
    valorMetricaSessao: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

import {
  guardarMetricasSessao,
  listarMetricasSessao,
} from "@/lib/actions/metricas";
import {
  metricaSchema,
  guardarMetricasSessaoSchema,
} from "@/lib/schemas/metrica";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerEscalao } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const CLUBE = "clube1";
const ESCALAO = "escalao1";
const SESSAO = "sessao1";
const METRICA_A = "metA";
const METRICA_B = "metB";
const ATLETA_1 = "atleta1";
const ATLETA_2 = "atleta2";

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

beforeEach(() => {
  vi.clearAllMocks();
  (obterClubeIdAtual as ReturnType<typeof vi.fn>).mockResolvedValue(CLUBE);
  (podeLerEscalao as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  (exigirCapacidade as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    ctx: { clube: { id: CLUBE } },
  });
  p.sessao.findFirst.mockResolvedValue({
    id: SESSAO,
    escalaoId: ESCALAO,
    fechado: false,
  });
  p.metricaConfig.findMany.mockResolvedValue([
    { id: METRICA_A, nome: "Empenho", tipo: "ESCALA", ordem: 0 },
    { id: METRICA_B, nome: "Desempenho", tipo: "ESCALA", ordem: 1 },
  ]);
  p.atleta.findMany.mockResolvedValue([{ id: ATLETA_1 }, { id: ATLETA_2 }]);
  p.valorMetricaSessao.findMany.mockResolvedValue([]);
});

// ─── Schema ──────────────────────────────────────────────────────────────────
describe("metricaSchema — contexto", () => {
  it("contexto assume JOGO por omissão (retrocompatibilidade)", () => {
    const r = metricaSchema.parse({ nome: "Dribles", tipo: "NUMERO" });
    expect(r.contexto).toBe("JOGO");
  });

  it("aceita contexto TREINO explícito", () => {
    const r = metricaSchema.parse({ nome: "Empenho", tipo: "ESCALA", contexto: "TREINO" });
    expect(r.contexto).toBe("TREINO");
  });

  it("rejeita contexto inválido", () => {
    expect(
      metricaSchema.safeParse({ nome: "X", tipo: "NUMERO", contexto: "OUTRO" }).success,
    ).toBe(false);
  });
});

describe("guardarMetricasSessaoSchema", () => {
  it("aceita lista válida", () => {
    const r = guardarMetricasSessaoSchema.safeParse([
      { atletaId: ATLETA_1, valores: [{ metricaId: METRICA_A, valor: 4 }] },
    ]);
    expect(r.success).toBe(true);
  });

  it("rejeita valor não-inteiro", () => {
    const r = guardarMetricasSessaoSchema.safeParse([
      { atletaId: ATLETA_1, valores: [{ metricaId: METRICA_A, valor: 3.5 }] },
    ]);
    expect(r.success).toBe(false);
  });
});

// ─── guardarMetricasSessao ─────────────────────────────────────────────────────
describe("guardarMetricasSessao", () => {
  it("falha sem autenticação", async () => {
    (obterClubeIdAtual as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await guardarMetricasSessao(SESSAO, []);
    expect(r.sucesso).toBe(false);
  });

  it("falha quando a sessão não existe", async () => {
    p.sessao.findFirst.mockResolvedValue(null);
    const r = await guardarMetricasSessao(SESSAO, []);
    expect(r.sucesso).toBe(false);
  });

  it("falha quando a sessão está fechada", async () => {
    p.sessao.findFirst.mockResolvedValue({ id: SESSAO, escalaoId: ESCALAO, fechado: true });
    const r = await guardarMetricasSessao(SESSAO, []);
    expect(r.sucesso).toBe(false);
    expect(p.valorMetricaSessao.createMany).not.toHaveBeenCalled();
  });

  it("falha sem capacidade TREINOS_GERIR", async () => {
    (exigirCapacidade as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      erro: "Sem permissão",
    });
    const r = await guardarMetricasSessao(SESSAO, [
      { atletaId: ATLETA_1, valores: [{ metricaId: METRICA_A, valor: 4 }] },
    ]);
    expect(r.sucesso).toBe(false);
  });

  it("grava valores válidos e ignora métricas/atletas fora do clube", async () => {
    const r = await guardarMetricasSessao(SESSAO, [
      {
        atletaId: ATLETA_1,
        valores: [
          { metricaId: METRICA_A, valor: 4 },
          { metricaId: "metrica-de-jogo", valor: 9 }, // não é métrica de treino ativa
        ],
      },
      { atletaId: "atleta-de-outro-clube", valores: [{ metricaId: METRICA_B, valor: 5 }] },
    ]);
    expect(r.sucesso).toBe(true);
    // Só o atleta do clube é removido/reinserido.
    expect(p.valorMetricaSessao.deleteMany).toHaveBeenCalledWith({
      where: { sessaoId: SESSAO, atletaId: { in: [ATLETA_1] } },
    });
    // Só a métrica de treino válida é criada.
    expect(p.valorMetricaSessao.createMany).toHaveBeenCalledWith({
      data: [{ metricaId: METRICA_A, sessaoId: SESSAO, atletaId: ATLETA_1, valor: 4 }],
    });
  });

  it("limpar todos os valores de um atleta remove sem recriar", async () => {
    const r = await guardarMetricasSessao(SESSAO, [{ atletaId: ATLETA_1, valores: [] }]);
    expect(r.sucesso).toBe(true);
    expect(p.valorMetricaSessao.deleteMany).toHaveBeenCalledWith({
      where: { sessaoId: SESSAO, atletaId: { in: [ATLETA_1] } },
    });
    expect(p.valorMetricaSessao.createMany).not.toHaveBeenCalled();
  });
});

// ─── listarMetricasSessao ──────────────────────────────────────────────────────
describe("listarMetricasSessao", () => {
  it("devolve métricas de treino e o mapa de valores por atleta", async () => {
    p.valorMetricaSessao.findMany.mockResolvedValue([
      { atletaId: ATLETA_1, metricaId: METRICA_A, valor: 4 },
      { atletaId: ATLETA_1, metricaId: METRICA_B, valor: 3 },
      { atletaId: ATLETA_2, metricaId: METRICA_A, valor: 5 },
    ]);
    const r = await listarMetricasSessao(SESSAO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.metricas).toHaveLength(2);
    expect(r.dados.valores[ATLETA_1]).toEqual({ [METRICA_A]: 4, [METRICA_B]: 3 });
    expect(r.dados.valores[ATLETA_2]).toEqual({ [METRICA_A]: 5 });
  });

  it("só pede métricas de treino/ambos ativas", async () => {
    await listarMetricasSessao(SESSAO);
    expect(p.metricaConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clubeId: CLUBE,
          ativa: true,
          contexto: { in: ["TREINO", "AMBOS"] },
        }),
      }),
    );
  });

  it("falha sem permissão de leitura no escalão", async () => {
    (podeLerEscalao as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const r = await listarMetricasSessao(SESSAO);
    expect(r.sucesso).toBe(false);
  });
});
