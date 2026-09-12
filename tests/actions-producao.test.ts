import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));
vi.mock("@/lib/epoca-context", () => ({
  obterClubeIdAtual: vi.fn(),
  obterEpocaAtiva: vi.fn(),
  COOKIE_EPOCA: "epoca_ativa",
}));
vi.mock("@/lib/permissoes", () => ({
  exigirCapacidade: vi.fn(),
  exigirCapacidadeEmAlgumEscalao: vi.fn(),
  podeLerEscalao: vi.fn(),
  podeLerAlgumEscalao: vi.fn(),
  escaloesLegiveis: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    jogo: { findFirst: vi.fn(), count: vi.fn() },
    atleta: { count: vi.fn() },
    atletaEscalao: { count: vi.fn(), findMany: vi.fn() },
    convocatoria: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    estatisticaAtleta: { deleteMany: vi.fn(), upsert: vi.fn() },
    valorMetrica: { upsert: vi.fn() },
    metricaConfig: { findMany: vi.fn() },
    sessao: { findFirst: vi.fn(), count: vi.fn() },
    sessaoExercicio: { count: vi.fn(), update: vi.fn() },
    escalao: { findFirst: vi.fn(), delete: vi.fn() },
    planeamento: { count: vi.fn() },
    competicao: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { definirConvocatoria, guardarEstatisticas } from "@/lib/actions/jogos";
import { reordenarExercicios } from "@/lib/actions/treinos";
import { apagarEscalao } from "@/lib/actions/escaloes";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const A1 = "ckv9v0z1w0000abcd1234efgh";
const A2 = "ckv9v0z1w0000abcd1234efgi";
const mocked = <T,>(fn: T) => fn as unknown as {
  mockResolvedValue: (v: unknown) => void;
  mockImplementation: (f: (...a: unknown[]) => unknown) => void;
};
const PERM_OK = { ok: true, ctx: { clube: { id: "clube1" } } };

beforeEach(() => {
  vi.clearAllMocks();
  mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
  mocked(obterClubeIdAtual).mockResolvedValue("clube1");
  // $transaction: suporta forma array [...] e forma interativa (cb).
  mocked(prisma.$transaction).mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

describe("definirConvocatoria — validação de pertença por participação (F1)", () => {
  it("rejeita atletas sem participação ativa no escalão/época do jogo", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue({ id: "j1", escalaoId: "esc1", epocaId: "ep1" });
    // Só 1 dos 2 atletas pedidos tem participação ativa.
    mocked(prisma.atletaEscalao.count).mockResolvedValue(1);

    const r = await definirConvocatoria("j1", [A1, A2]);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não pertencem/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("aceita quando todos os atletas têm participação ativa", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue({ id: "j1", escalaoId: "esc1", epocaId: "ep1" });
    mocked(prisma.atletaEscalao.count).mockResolvedValue(2);
    mocked(prisma.convocatoria.findMany).mockResolvedValue([]);

    const r = await definirConvocatoria("j1", [A1, A2]);
    expect(r.sucesso).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledOnce();

    const arg = (prisma.atletaEscalao.count as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as { where: { escalaoId: string; epocaId: string; estado: string } };
    expect(arg.where).toMatchObject({ escalaoId: "esc1", epocaId: "ep1", estado: "ATIVO" });
  });
});

describe("guardarEstatisticas — só atletas convocados (secção 12.5)", () => {
  it("ignora estatísticas de atletas não convocados", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue({ id: "j1", escalaoId: "esc1" });
    mocked(prisma.convocatoria.findMany).mockResolvedValue([{ atletaId: A1 }]); // só A1 convocado
    mocked(prisma.metricaConfig.findMany).mockResolvedValue([]);
    mocked(prisma.estatisticaAtleta.upsert).mockResolvedValue({ id: "estat1" });

    const r = await guardarEstatisticas("j1", [
      { atletaId: A1, utilizacao: "TITULAR", golos: 2, assistencias: 0 },
      { atletaId: A2, utilizacao: "TITULAR", golos: 9, assistencias: 9 }, // não convocado
    ]);
    expect(r.sucesso).toBe(true);
    // Só o convocado (A1) é gravado.
    expect(prisma.estatisticaAtleta.upsert).toHaveBeenCalledOnce();
    const arg = (prisma.estatisticaAtleta.upsert as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as { where: { jogoId_atletaId: { atletaId: string } } };
    expect(arg.where.jogoId_atletaId.atletaId).toBe(A1);
  });

  it("rejeita input inválido com erros por campo", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue({ id: "j1", escalaoId: "esc1" });
    const r = await guardarEstatisticas("j1", [{ atletaId: "x", utilizacao: "INVALIDO" }]);
    expect(r.sucesso).toBe(false);
  });
});

describe("reordenarExercicios — ids têm de pertencer à sessão (auditoria M4)", () => {
  it("rejeita quando algum id não pertence à sessão", async () => {
    mocked(prisma.sessao.findFirst).mockResolvedValue({ id: "s1", escalaoId: "esc1" });
    mocked(prisma.sessaoExercicio.count).mockResolvedValue(1); // só 1 dos 2 pertence

    const r = await reordenarExercicios("s1", [
      { id: "se1", ordem: 0 },
      { id: "se2", ordem: 1 },
    ]);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não pertencem/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("apagarEscalao — guards de integridade (auditoria B3)", () => {
  it("bloqueia se houver sessões associadas", async () => {
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: "esc1", clubeId: "clube1" });
    // counts: participações=0, sessoes=2, jogos=0, planeamentos=0, competicoes=0
    mocked(prisma.atletaEscalao.count).mockResolvedValue(0);
    mocked(prisma.sessao.count).mockResolvedValue(2);
    mocked(prisma.jogo.count).mockResolvedValue(0);
    mocked(prisma.planeamento.count).mockResolvedValue(0);
    mocked(prisma.competicao.count).mockResolvedValue(0);

    const r = await apagarEscalao("esc1");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/sess/i);
    expect(prisma.escalao.delete).not.toHaveBeenCalled();
  });
});
