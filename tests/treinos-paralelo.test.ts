import { describe, it, expect, vi, beforeEach } from "vitest";
import { calcularDuracaoExercicios } from "@/lib/utils/duracaoSessao";
import {
  agruparExerciciosParaleloSchema,
  desagruparExercicioParaleloSchema,
} from "@/lib/schemas/treino";

// ─── BD simulada em memória (hoisted) ────────────────────────────────────────
// As operações Prisma devolvem descritores; o `$transaction` (ou o `await` direto)
// aplica-os por ordem e falha se o unique [sessaoId, ordem] for violado em
// qualquer passo — prova a técnica de offset.
type Linha = {
  id: string;
  sessaoId: string;
  ordem: number;
  grupoParalelo: string | null;
  parteTreino: string | null;
};

const bd = vi.hoisted(() => {
  const estado = { linhas: [] as Linha[] };

  function verificarUnique() {
    const chaves = new Set<string>();
    for (const l of estado.linhas) {
      const k = `${l.sessaoId}:${l.ordem}`;
      if (chaves.has(k)) throw new Error(`unique [sessaoId, ordem] violado: ${k}`);
      chaves.add(k);
    }
  }

  type Op = { aplicar: () => void; then: (r: (v: undefined) => void) => void };
  function op(aplicar: () => void): Op {
    return {
      aplicar,
      then(resolve) {
        aplicar();
        resolve(undefined);
      },
    };
  }

  type Where = {
    id?: string | { in?: string[]; not?: string };
    sessaoId?: string;
    grupoParalelo?: string | null;
  };
  function filtrar(where: Where): Linha[] {
    let r = estado.linhas;
    if (typeof where.id === "string") r = r.filter((l) => l.id === where.id);
    else if (where.id?.in) r = r.filter((l) => (where.id as { in: string[] }).in.includes(l.id));
    if (typeof where.id === "object" && where.id.not)
      r = r.filter((l) => l.id !== (where.id as { not: string }).not);
    if (where.sessaoId) r = r.filter((l) => l.sessaoId === where.sessaoId);
    if ("grupoParalelo" in where) r = r.filter((l) => l.grupoParalelo === where.grupoParalelo);
    return [...r].sort((a, b) => a.ordem - b.ordem).map((l) => ({ ...l, sessao: { escalaoId: "esc1" } }));
  }

  return { estado, verificarUnique, op, filtrar };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));
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

vi.mock("@/lib/db", () => {
  type Args = { where: Record<string, unknown>; data?: Record<string, unknown> };
  const prisma = {
    sessao: { findFirst: vi.fn(async () => ({ id: "csessao01", escalaoId: "esc1" })) },
    sessaoExercicio: {
      findFirst: vi.fn(async ({ where }: Args) => bd.filtrar(where)[0] ?? null),
      findMany: vi.fn(async ({ where }: Args) => bd.filtrar(where)),
      update: vi.fn(({ where, data }: Args) =>
        bd.op(() => {
          const l = bd.estado.linhas.find((x) => x.id === where.id)!;
          Object.assign(l, data);
          bd.verificarUnique();
        }),
      ),
      updateMany: vi.fn(({ where, data }: Args) =>
        bd.op(() => {
          const ids = (where.id as { in: string[] }).in;
          for (const l of bd.estado.linhas) if (ids.includes(l.id)) Object.assign(l, data);
        }),
      ),
      delete: vi.fn(({ where }: Args) =>
        bd.op(() => {
          bd.estado.linhas = bd.estado.linhas.filter((l) => l.id !== where.id);
        }),
      ),
    },
    $transaction: vi.fn(async (ops: { aplicar: () => void }[]) => {
      for (const o of ops) o.aplicar();
    }),
  };
  return { prisma };
});

import {
  agruparExerciciosParalelo,
  desagruparExercicioParalelo,
  removerExercicioSessao,
  reordenarExercicios,
  atualizarExercicioSessao,
} from "@/lib/actions/treinos";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockResolvedValueOnce: (v: unknown) => void;
    mock: { calls: unknown[][] };
  };

// Ids no formato cuid (validados pelos schemas Zod).
const A = "cexercicioa";
const B = "cexerciciob";
const C = "cexercicioc";
const D = "cexerciciod";

function linha(id: string, ordem: number, grupoParalelo: string | null = null, parteTreino: string | null = "PRINCIPAL"): Linha {
  return { id, sessaoId: "csessao01", ordem, grupoParalelo, parteTreino };
}

/** Ids por ordem final e o grupo de cada um. */
function estadoFinal() {
  const ordenadas = [...bd.estado.linhas].sort((a, b) => a.ordem - b.ordem);
  return {
    ordem: ordenadas.map((l) => l.id),
    grupo: Object.fromEntries(ordenadas.map((l) => [l.id, l.grupoParalelo])),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(obterClubeIdAtual).mockResolvedValue("clube1");
  mocked(exigirCapacidade).mockResolvedValue({ ok: true });
});

// ─── Duração ─────────────────────────────────────────────────────────────────

describe("calcularDuracaoExercicios (§3.5)", () => {
  it("lista vazia → 0", () => {
    expect(calcularDuracaoExercicios([])).toBe(0);
  });

  it("só sequenciais → soma", () => {
    expect(
      calcularDuracaoExercicios([
        { duracaoMin: 10, grupoParalelo: null },
        { duracaoMin: 15, grupoParalelo: null },
      ]),
    ).toBe(25);
  });

  it("10 min ∥ 10 min = 10 min", () => {
    expect(
      calcularDuracaoExercicios([
        { duracaoMin: 10, grupoParalelo: "g1" },
        { duracaoMin: 10, grupoParalelo: "g1" },
      ]),
    ).toBe(10);
  });

  it("grupo conta o máximo; vários grupos e sequenciais somam", () => {
    expect(
      calcularDuracaoExercicios([
        { duracaoMin: 5, grupoParalelo: null },
        { duracaoMin: 10, grupoParalelo: "g1" },
        { duracaoMin: 15, grupoParalelo: "g1" },
        { duracaoMin: 20, grupoParalelo: "g2" },
        { duracaoMin: 8, grupoParalelo: "g2" },
      ]),
    ).toBe(5 + 15 + 20);
  });

  it("durações null contam 0", () => {
    expect(
      calcularDuracaoExercicios([
        { duracaoMin: null, grupoParalelo: null },
        { duracaoMin: null, grupoParalelo: "g1" },
        { duracaoMin: 12, grupoParalelo: "g1" },
      ]),
    ).toBe(12);
  });
});

// ─── Schemas ─────────────────────────────────────────────────────────────────

describe("schemas de exercícios em paralelo", () => {
  it("agrupar exige ≥2 ids cuid distintos", () => {
    expect(agruparExerciciosParaleloSchema.safeParse({ sessaoExercicioIds: [A, B] }).success).toBe(true);
    expect(agruparExerciciosParaleloSchema.safeParse({ sessaoExercicioIds: [A] }).success).toBe(false);
    expect(agruparExerciciosParaleloSchema.safeParse({ sessaoExercicioIds: [A, A] }).success).toBe(false);
    expect(agruparExerciciosParaleloSchema.safeParse({ sessaoExercicioIds: [A, "x y"] }).success).toBe(false);
  });

  it("desagrupar exige um id cuid", () => {
    expect(desagruparExercicioParaleloSchema.safeParse({ sessaoExercicioId: A }).success).toBe(true);
    expect(desagruparExercicioParaleloSchema.safeParse({ sessaoExercicioId: "" }).success).toBe(false);
  });
});

// ─── agruparExerciciosParalelo ───────────────────────────────────────────────

describe("agruparExerciciosParalelo", () => {
  it("agrupa e torna os membros contíguos na posição do primeiro", async () => {
    bd.estado.linhas = [linha(A, 0), linha(B, 1), linha(C, 2), linha(D, 3)];

    const r = await agruparExerciciosParalelo([C, A]);
    expect(r.sucesso).toBe(true);

    const f = estadoFinal();
    expect(f.ordem).toEqual([A, C, B, D]);
    expect(f.grupo[A]).not.toBeNull();
    expect(f.grupo[C]).toBe(f.grupo[A]);
    expect(f.grupo[B]).toBeNull();
    expect(f.grupo[D]).toBeNull();
    // Reutiliza os valores de ordem existentes.
    expect(bd.estado.linhas.map((l) => l.ordem).sort()).toEqual([0, 1, 2, 3]);
  });

  it("dentro do grupo mantém a ordem relativa (esquerda → direita)", async () => {
    bd.estado.linhas = [linha(A, 0), linha(B, 1), linha(C, 2), linha(D, 3)];
    await agruparExerciciosParalelo([D, B]);
    expect(estadoFinal().ordem).toEqual([A, B, D, C]);
  });

  it("junta ao grupo existente, reutilizando o identificador", async () => {
    bd.estado.linhas = [linha(A, 0, "g1"), linha(B, 1, "g1"), linha(C, 2), linha(D, 3)];

    const r = await agruparExerciciosParalelo([B, D]);
    expect(r.sucesso).toBe(true);

    const f = estadoFinal();
    expect(f.ordem).toEqual([A, B, D, C]);
    expect([f.grupo[A], f.grupo[B], f.grupo[D]]).toEqual(["g1", "g1", "g1"]);
    expect(f.grupo[C]).toBeNull();
  });

  it("funde dois grupos existentes num só", async () => {
    bd.estado.linhas = [linha(A, 0, "g1"), linha(B, 1, "g1"), linha(C, 2, "g2"), linha(D, 3, "g2")];
    await agruparExerciciosParalelo([B, C]);
    expect(Object.values(estadoFinal().grupo)).toEqual(["g1", "g1", "g1", "g1"]);
  });

  it("rejeita partes do treino diferentes sem escrever", async () => {
    bd.estado.linhas = [linha(A, 0, null, "AQUECIMENTO"), linha(B, 1, null, "PRINCIPAL")];
    const r = await agruparExerciciosParalelo([A, B]);
    expect(r.sucesso).toBe(false);
    expect(mocked(prisma.$transaction).mock.calls).toHaveLength(0);
  });

  it("rejeita exercícios de sessões diferentes", async () => {
    bd.estado.linhas = [linha(A, 0), { ...linha(B, 0), sessaoId: "csessao02" }];
    const r = await agruparExerciciosParalelo([A, B]);
    expect(r.sucesso).toBe(false);
    expect(mocked(prisma.$transaction).mock.calls).toHaveLength(0);
  });

  it("rejeita ids que não pertencem ao clube", async () => {
    bd.estado.linhas = [linha(A, 0)];
    const r = await agruparExerciciosParalelo([A, B]);
    expect(r.sucesso).toBe(false);
    expect(mocked(prisma.$transaction).mock.calls).toHaveLength(0);
  });

  it("rejeita sem capacidade TREINOS_GERIR", async () => {
    bd.estado.linhas = [linha(A, 0), linha(B, 1)];
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await agruparExerciciosParalelo([A, B]);
    expect(r.sucesso).toBe(false);
    expect(mocked(prisma.$transaction).mock.calls).toHaveLength(0);
  });

  it("rejeita menos de 2 exercícios sem consultar a BD", async () => {
    const r = await agruparExerciciosParalelo([A]);
    expect(r.sucesso).toBe(false);
    expect(mocked(prisma.sessaoExercicio.findMany).mock.calls).toHaveLength(0);
  });
});

// ─── desagruparExercicioParalelo ─────────────────────────────────────────────

describe("desagruparExercicioParalelo", () => {
  it("retira o membro e coloca-o logo a seguir ao bloco", async () => {
    bd.estado.linhas = [linha(A, 0, "g1"), linha(B, 1, "g1"), linha(C, 2, "g1"), linha(D, 3)];

    const r = await desagruparExercicioParalelo(A);
    expect(r.sucesso).toBe(true);

    const f = estadoFinal();
    expect(f.ordem).toEqual([B, C, A, D]);
    expect([f.grupo[B], f.grupo[C]]).toEqual(["g1", "g1"]);
    expect(f.grupo[A]).toBeNull();
  });

  it("grupo que fica com 1 membro desfaz-se", async () => {
    bd.estado.linhas = [linha(A, 0, "g1"), linha(B, 1, "g1"), linha(C, 2)];
    await desagruparExercicioParalelo(A);
    const f = estadoFinal();
    expect(f.ordem).toEqual([B, A, C]);
    expect(Object.values(f.grupo)).toEqual([null, null, null]);
  });

  it("rejeita um exercício que não está em paralelo", async () => {
    bd.estado.linhas = [linha(A, 0), linha(B, 1)];
    const r = await desagruparExercicioParalelo(A);
    expect(r.sucesso).toBe(false);
    expect(mocked(prisma.$transaction).mock.calls).toHaveLength(0);
  });
});

// ─── Invariantes nas actions existentes ──────────────────────────────────────

describe("removerExercicioSessao — grupos paralelos", () => {
  it("desfaz o grupo quando fica com 1 membro", async () => {
    bd.estado.linhas = [linha(A, 0, "g1"), linha(B, 1, "g1"), linha(C, 2)];
    const r = await removerExercicioSessao(A);
    expect(r.sucesso).toBe(true);
    expect(estadoFinal().grupo).toEqual({ [B]: null, [C]: null });
  });

  it("mantém o grupo com ≥2 membros restantes", async () => {
    bd.estado.linhas = [linha(A, 0, "g1"), linha(B, 1, "g1"), linha(C, 2, "g1")];
    await removerExercicioSessao(B);
    expect(estadoFinal().grupo).toEqual({ [A]: "g1", [C]: "g1" });
  });

  it("exercício sequencial: só apaga", async () => {
    bd.estado.linhas = [linha(A, 0), linha(B, 1, "g1"), linha(C, 2, "g1")];
    await removerExercicioSessao(A);
    expect(estadoFinal().grupo).toEqual({ [B]: "g1", [C]: "g1" });
    expect(mocked(prisma.sessaoExercicio.updateMany).mock.calls).toHaveLength(0);
  });
});

describe("reordenarExercicios — grupos paralelos", () => {
  it("rejeita uma ordem que parte um grupo, sem escrever", async () => {
    bd.estado.linhas = [linha(A, 0), linha(B, 1, "g1"), linha(C, 2, "g1")];
    const r = await reordenarExercicios("csessao01", [
      { id: B, ordem: 0 },
      { id: A, ordem: 1 },
      { id: C, ordem: 2 },
    ]);
    expect(r.sucesso).toBe(false);
    expect(mocked(prisma.$transaction).mock.calls).toHaveLength(0);
  });

  it("aceita mover o grupo como bloco", async () => {
    bd.estado.linhas = [linha(A, 0), linha(B, 1, "g1"), linha(C, 2, "g1")];
    const r = await reordenarExercicios("csessao01", [
      { id: B, ordem: 0 },
      { id: C, ordem: 1 },
      { id: A, ordem: 2 },
    ]);
    expect(r.sucesso).toBe(true);
    expect(estadoFinal().ordem).toEqual([B, C, A]);
  });

  it("continua a rejeitar ids de outra sessão", async () => {
    bd.estado.linhas = [linha(A, 0), linha(B, 1)];
    const r = await reordenarExercicios("csessao01", [
      { id: A, ordem: 1 },
      { id: "cdeoutrasessao", ordem: 0 },
    ]);
    expect(r.sucesso).toBe(false);
  });
});

describe("atualizarExercicioSessao — mudança de parte de um membro", () => {
  it("sai do grupo e fica logo a seguir ao bloco", async () => {
    bd.estado.linhas = [linha(A, 0, "g1"), linha(B, 1, "g1"), linha(C, 2, "g1"), linha(D, 3)];

    const r = await atualizarExercicioSessao(A, { parteTreino: "RETORNO_CALMA" });
    expect(r.sucesso).toBe(true);

    const f = estadoFinal();
    expect(f.ordem).toEqual([B, C, A, D]);
    expect(f.grupo).toEqual({ [B]: "g1", [C]: "g1", [A]: null, [D]: null });
    expect(bd.estado.linhas.find((l) => l.id === A)!.parteTreino).toBe("RETORNO_CALMA");
  });

  it("mesma parte (ou outros campos) não mexe no grupo", async () => {
    bd.estado.linhas = [linha(A, 0, "g1"), linha(B, 1, "g1")];
    await atualizarExercicioSessao(A, { parteTreino: "PRINCIPAL", duracaoMin: 12 });
    expect(estadoFinal().grupo).toEqual({ [A]: "g1", [B]: "g1" });
    expect(mocked(prisma.$transaction).mock.calls).toHaveLength(0);
  });
});
