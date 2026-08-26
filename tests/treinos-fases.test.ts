import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parteTreinoSessaoSchema,
  sessaoExercicioOverrideSchema,
} from "@/lib/schemas/treino";

// ─── Mocks (hoisted pelo Vitest) ─────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

vi.mock("@/lib/epoca-context", () => ({
  obterClubeIdAtual: vi.fn(),
  obterEpocaAtiva: vi.fn(),
  COOKIE_EPOCA: "epoca_ativa",
}));

vi.mock("@/lib/permissoes", () => ({
  exigirCapacidade: vi.fn(),
  podeLerEscalao: vi.fn(),
  escaloesLegiveis: vi.fn(),
  obterMembroAtual: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    sessao: { findFirst: vi.fn() },
    exercicio: { findFirst: vi.fn() },
    sessaoExercicio: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

import { adicionarExercicioSessao } from "@/lib/actions/treinos";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockReturnValue: (v: unknown) => void;
    mock: { calls: unknown[][] };
  };

// Exercício do CLUBE → não gera snapshot (evita dependência do runtime Prisma no teste).
function exercicioBase(parteTreino: string | null) {
  return {
    id: "ex1",
    clubeId: "clube1",
    proprietario: "CLUBE",
    nome: "Exercício",
    descricao: null,
    objetivo: null,
    diagrama: null,
    duracaoMin: 15,
    parteTreino,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(obterClubeIdAtual).mockResolvedValue("clube1");
  mocked(exigirCapacidade).mockResolvedValue({ ok: true });
  mocked(prisma.sessao.findFirst).mockResolvedValue({ id: "s1", escalaoId: "esc1" });
  mocked(prisma.sessaoExercicio.findFirst).mockResolvedValue(null); // ordem = 0
  mocked(prisma.sessaoExercicio.create).mockResolvedValue({ id: "se1" });
});

describe("parteTreinoSessaoSchema", () => {
  it("aceita uma fase válida", () => {
    expect(parteTreinoSessaoSchema.safeParse("AQUECIMENTO").success).toBe(true);
    expect(parteTreinoSessaoSchema.safeParse("JOGO_REDUZIDO").success).toBe(true);
  });

  it("aceita null e undefined (fase opcional)", () => {
    expect(parteTreinoSessaoSchema.safeParse(null).success).toBe(true);
    expect(parteTreinoSessaoSchema.safeParse(undefined).success).toBe(true);
  });

  it("rejeita uma fase inválida", () => {
    expect(parteTreinoSessaoSchema.safeParse("PARTE_PRINCIPAL").success).toBe(false);
    expect(parteTreinoSessaoSchema.safeParse("JOGO").success).toBe(false);
  });
});

describe("sessaoExercicioOverrideSchema — parteTreino", () => {
  it("aceita override com fase e permite limpar para null", () => {
    const r1 = sessaoExercicioOverrideSchema.safeParse({ parteTreino: "RETORNO_CALMA" });
    expect(r1.success).toBe(true);
    const r2 = sessaoExercicioOverrideSchema.safeParse({ parteTreino: null });
    expect(r2.success).toBe(true);
  });

  it("rejeita fase inválida no override", () => {
    const r = sessaoExercicioOverrideSchema.safeParse({ parteTreino: "FIM" });
    expect(r.success).toBe(false);
  });
});

describe("adicionarExercicioSessao — fase do treino (§3.5)", () => {
  it("grava a fase explícita escolhida no formulário", async () => {
    mocked(prisma.exercicio.findFirst).mockResolvedValue(exercicioBase(null));

    const r = await adicionarExercicioSessao("s1", "ex1", "JOGO_REDUZIDO");
    expect(r.sucesso).toBe(true);

    const arg = mocked(prisma.sessaoExercicio.create).mock.calls[0][0] as {
      data: { parteTreino: string | null };
    };
    expect(arg.data.parteTreino).toBe("JOGO_REDUZIDO");
  });

  it("herda a fase do exercício quando nenhuma é indicada", async () => {
    mocked(prisma.exercicio.findFirst).mockResolvedValue(exercicioBase("AQUECIMENTO"));

    const r = await adicionarExercicioSessao("s1", "ex1");
    expect(r.sucesso).toBe(true);

    const arg = mocked(prisma.sessaoExercicio.create).mock.calls[0][0] as {
      data: { parteTreino: string | null };
    };
    expect(arg.data.parteTreino).toBe("AQUECIMENTO");
  });

  it("fica sem fase (null) quando nem o parâmetro nem o exercício a têm", async () => {
    mocked(prisma.exercicio.findFirst).mockResolvedValue(exercicioBase(null));

    const r = await adicionarExercicioSessao("s1", "ex1");
    expect(r.sucesso).toBe(true);

    const arg = mocked(prisma.sessaoExercicio.create).mock.calls[0][0] as {
      data: { parteTreino: string | null };
    };
    expect(arg.data.parteTreino).toBeNull();
  });

  it("rejeita uma fase inválida sem escrever", async () => {
    mocked(prisma.exercicio.findFirst).mockResolvedValue(exercicioBase(null));

    const r = await adicionarExercicioSessao("s1", "ex1", "FASE_INVALIDA");
    expect(r.sucesso).toBe(false);
    expect((prisma.sessaoExercicio.create as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(0);
  });
});
