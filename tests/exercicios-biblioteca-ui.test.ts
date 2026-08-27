import { describe, it, expect, vi, beforeEach } from "vitest";

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
  exigirCapacidadeEmAlgumEscalao: vi.fn(),
  podeLerEscalao: vi.fn(),
  podeLerAlgumEscalao: vi.fn(),
  escaloesLegiveis: vi.fn(),
  obterMembroAtual: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    exercicio: { findMany: vi.fn(), findFirst: vi.fn() },
    // filtroExerciciosVisiveis (pré-computação por escalão partilhado) consulta estes modelos.
    membroClube: { findFirst: vi.fn(), findMany: vi.fn() },
    escalao: { findMany: vi.fn() },
  },
}));

import { listarExercicios, obterExercicio } from "@/lib/actions/exercicios";
import { auth } from "@/lib/auth";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { prisma } from "@/lib/db";

const CLUBE = "clube1";
const EU = "u1";
const OUTRO = "u2";

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mock: { calls: unknown[][] };
  };

/** Linha mínima do Prisma tal como a action a lê (com as partilhas do clube). */
function linha(over: Record<string, unknown> = {}) {
  return {
    id: "e1",
    nome: "Exercício",
    descricao: null,
    objetivo: null,
    duracaoMin: null,
    categoriaPrincipal: null,
    subcategoriaId: null,
    diagrama: null,
    clubeId: CLUBE,
    criadorId: EU,
    proprietario: "TREINADOR",
    origemSeed: false,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    autorId: EU,
    clubeProprietarioId: null,
    parteTreino: null,
    escalaoAlvo: null,
    partilhasClube: [] as { id: string }[],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(auth).mockResolvedValue({ user: { id: EU } });
  mocked(obterClubeIdAtual).mockResolvedValue(CLUBE);
});

// ─── Anotação da biblioteca (UI das abas 🎒 Pessoal / 🏛️ Clube) ─────────────

describe("listarExercicios — anotação origem + naBibliotecaDoClube", () => {
  it("marca o exercício pessoal do próprio como PESSOAL e fora da biblioteca do clube", async () => {
    mocked(prisma.exercicio.findMany).mockResolvedValue([
      linha({ proprietario: "TREINADOR", autorId: EU, partilhasClube: [] }),
    ]);

    const res = await listarExercicios();
    expect(res.sucesso).toBe(true);
    if (!res.sucesso) return;
    expect(res.dados[0].origem).toBe("PESSOAL");
    expect(res.dados[0].naBibliotecaDoClube).toBe(false);
  });

  it("marca o pessoal partilhado como PESSOAL mas presente na biblioteca do clube", async () => {
    mocked(prisma.exercicio.findMany).mockResolvedValue([
      linha({ proprietario: "TREINADOR", autorId: EU, partilhasClube: [{ id: "p1" }] }),
    ]);

    const res = await listarExercicios();
    if (!res.sucesso) throw new Error(res.erro);
    // Continua a ser dele (🎒) — a partilha dá leitura ao clube, não propriedade.
    expect(res.dados[0].origem).toBe("PESSOAL");
    expect(res.dados[0].naBibliotecaDoClube).toBe(true);
  });

  it("marca o exercício próprio do clube como CLUBE e na biblioteca do clube", async () => {
    mocked(prisma.exercicio.findMany).mockResolvedValue([
      linha({ proprietario: "CLUBE", clubeProprietarioId: CLUBE, autorId: EU }),
    ]);

    const res = await listarExercicios();
    if (!res.sucesso) throw new Error(res.erro);
    expect(res.dados[0].origem).toBe("CLUBE");
    expect(res.dados[0].naBibliotecaDoClube).toBe(true);
  });

  it("reconhece as linhas legadas da fase expand (clubeProprietarioId ainda a null)", async () => {
    mocked(prisma.exercicio.findMany).mockResolvedValue([
      linha({ proprietario: "CLUBE", clubeProprietarioId: null, clubeId: CLUBE }),
    ]);

    const res = await listarExercicios();
    if (!res.sucesso) throw new Error(res.erro);
    expect(res.dados[0].naBibliotecaDoClube).toBe(true);
  });

  it("não considera do clube ativo um exercício de outro clube", async () => {
    mocked(prisma.exercicio.findMany).mockResolvedValue([
      linha({ proprietario: "CLUBE", clubeProprietarioId: "outroClube", clubeId: "outroClube" }),
    ]);

    const res = await listarExercicios();
    if (!res.sucesso) throw new Error(res.erro);
    expect(res.dados[0].naBibliotecaDoClube).toBe(false);
  });

  it("o pessoal de outro treinador partilhado no clube conta como 🏛️ clube", async () => {
    mocked(prisma.exercicio.findMany).mockResolvedValue([
      linha({ proprietario: "TREINADOR", autorId: OUTRO, partilhasClube: [{ id: "p2" }] }),
    ]);

    const res = await listarExercicios();
    if (!res.sucesso) throw new Error(res.erro);
    expect(res.dados[0].origem).toBe("CLUBE");
    expect(res.dados[0].naBibliotecaDoClube).toBe(true);
  });

  it("não devolve a relação partilhasClube (detalhe de leitura)", async () => {
    mocked(prisma.exercicio.findMany).mockResolvedValue([linha()]);

    const res = await listarExercicios();
    if (!res.sucesso) throw new Error(res.erro);
    expect("partilhasClube" in res.dados[0]).toBe(false);
  });

  it("carrega apenas as partilhas do clube ativo", async () => {
    mocked(prisma.exercicio.findMany).mockResolvedValue([]);
    await listarExercicios();

    const args = mocked(prisma.exercicio.findMany).mock.calls[0][0] as {
      include: { partilhasClube: { where: { clubeId: string } } };
    };
    expect(args.include.partilhasClube.where.clubeId).toBe(CLUBE);
  });

  it("propaga os filtros de parte do treino, categoria e pesquisa", async () => {
    mocked(prisma.exercicio.findMany).mockResolvedValue([]);
    await listarExercicios("AQUECIMENTO", "DEFESA", "roda");

    const args = mocked(prisma.exercicio.findMany).mock.calls[0][0] as {
      where: { AND: Record<string, unknown>[] };
    };
    expect(args.where.AND).toContainEqual({ parteTreino: "AQUECIMENTO" });
    expect(args.where.AND).toContainEqual({ categoriaPrincipal: "DEFESA" });
    expect(args.where.AND).toContainEqual({
      nome: { contains: "roda", mode: "insensitive" },
    });
  });

  it("por omissão (TODAS) não filtra por modalidade", async () => {
    mocked(prisma.exercicio.findMany).mockResolvedValue([]);
    await listarExercicios();

    const args = mocked(prisma.exercicio.findMany).mock.calls[0][0] as {
      where: { AND: Record<string, unknown>[] };
    };
    // A cláusula de visibilidade usa OR; o que não pode existir é um OR de modalidade.
    const temFiltroModalidade = args.where.AND.some(
      (c) =>
        Array.isArray((c as { OR?: unknown }).OR) &&
        ((c as { OR: Record<string, unknown>[] }).OR).some((o) => "modalidade" in o),
    );
    expect(temFiltroModalidade).toBe(false);
  });

  it("filtra por modalidade incluindo os universais (modalidade null)", async () => {
    mocked(prisma.exercicio.findMany).mockResolvedValue([]);
    await listarExercicios(undefined, undefined, undefined, "FUTEBOL");

    const args = mocked(prisma.exercicio.findMany).mock.calls[0][0] as {
      where: { AND: Record<string, unknown>[] };
    };
    expect(args.where.AND).toContainEqual({
      OR: [{ modalidade: "FUTEBOL" }, { modalidade: null }],
    });
  });

  it("exige autenticação", async () => {
    mocked(auth).mockResolvedValue(null);
    const res = await listarExercicios();
    expect(res.sucesso).toBe(false);
  });
});

describe("obterExercicio — anotação", () => {
  it("anota o detalhe com origem e presença na biblioteca do clube", async () => {
    mocked(prisma.exercicio.findFirst).mockResolvedValue(
      linha({ proprietario: "TREINADOR", autorId: EU, partilhasClube: [{ id: "p1" }] }),
    );

    const res = await obterExercicio("e1");
    if (!res.sucesso) throw new Error(res.erro);
    expect(res.dados.origem).toBe("PESSOAL");
    expect(res.dados.naBibliotecaDoClube).toBe(true);
    expect("partilhasClube" in res.dados).toBe(false);
  });

  it("devolve erro quando o exercício não é visível", async () => {
    mocked(prisma.exercicio.findFirst).mockResolvedValue(null);
    const res = await obterExercicio("inexistente");
    expect(res.sucesso).toBe(false);
  });
});
