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
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    exercicio: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    partilhaExercicioClube: { upsert: vi.fn(), deleteMany: vi.fn() },
    modeloSessao: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    modeloSessaoExercicio: { createMany: vi.fn(), deleteMany: vi.fn() },
    escalao: { findFirst: vi.fn() },
    epoca: { findFirst: vi.fn() },
    sessao: { create: vi.fn() },
    sessaoExercicio: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import {
  exercicioSchema,
  partilharExercicioSchema,
  criarModeloSessaoSchema,
  criarSessaoDeTemplateSchema,
} from "@/lib/schemas/exercicio";
import {
  filtroExerciciosVisiveis,
  filtroModelosSessaoVisiveis,
  origemDoItem,
} from "@/lib/biblioteca";
import { TEMPLATES_ARRANQUE } from "@/lib/templates-arranque";
import { BIBLIOTECA_ARRANQUE } from "@/lib/biblioteca-arranque";
import { partilharExercicioNoClube } from "@/lib/actions/exercicios";
import {
  criarModeloSessao,
  criarSessaoDeTemplate,
  instalarTemplatesArranque,
  partilharModeloSessaoNoClube,
} from "@/lib/actions/templatesSessao";
import { obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const EX1 = "cexercicio000000000000001";
const EX2 = "cexercicio000000000000002";
const MODELO = "cmodelo00000000000000001";
const ESCALAO = "cescalao0000000000000001";

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockResolvedValueOnce: (v: unknown) => void;
    mockImplementation: (f: (...a: unknown[]) => unknown) => void;
    mock: { calls: unknown[][] };
  };

const PERM_OK = { ok: true, ctx: { clube: { id: "clube1" }, utilizadorId: "u1" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
  mocked(prisma.$transaction).mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

// ─── Schemas (F3) ────────────────────────────────────────────────────────────

describe("exercicioSchema (F3 — parteTreino, escalaoAlvo, propriedade)", () => {
  it("aceita parteTreino e escalaoAlvo e assume biblioteca pessoal por defeito", () => {
    const r = exercicioSchema.safeParse({
      nome: "1x1 com apoio",
      parteTreino: "JOGO_REDUZIDO",
      escalaoAlvo: "sub-10",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.parteTreino).toBe("JOGO_REDUZIDO");
      expect(r.data.escalaoAlvo).toBe("sub-10");
      // Secção 4.2: a propriedade é do treinador por defeito.
      expect(r.data.proprietario).toBe("TREINADOR");
    }
  });

  it("aceita o toggle explícito para a biblioteca do clube", () => {
    const r = exercicioSchema.safeParse({ nome: "Roda de passe", proprietario: "CLUBE" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.proprietario).toBe("CLUBE");
  });

  it("rejeita parte do treino inválida", () => {
    const r = exercicioSchema.safeParse({ nome: "Teste", parteTreino: "FINALIZACAO" });
    expect(r.success).toBe(false);
  });
});

describe("partilharExercicioSchema", () => {
  it("exige um cuid válido", () => {
    expect(partilharExercicioSchema.safeParse({ exercicioId: EX1 }).success).toBe(true);
    expect(partilharExercicioSchema.safeParse({ exercicioId: "123" }).success).toBe(false);
  });
});

describe("criarModeloSessaoSchema", () => {
  const base = {
    nome: "Pressing defensivo, 60 min, sub-10",
    duracaoMin: 60,
    exercicios: [
      { exercicioId: EX1, ordem: 0, duracaoMin: 10 },
      { exercicioId: EX2, ordem: 1, parteTreino: "PRINCIPAL" as const },
    ],
  };

  it("aceita um template válido e assume propriedade pessoal", () => {
    const r = criarModeloSessaoSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.proprietario).toBe("TREINADOR");
  });

  it("rejeita template sem exercícios", () => {
    const r = criarModeloSessaoSchema.safeParse({ ...base, exercicios: [] });
    expect(r.success).toBe(false);
  });

  it("rejeita ordens repetidas", () => {
    const r = criarModeloSessaoSchema.safeParse({
      ...base,
      exercicios: [
        { exercicioId: EX1, ordem: 0 },
        { exercicioId: EX2, ordem: 0 },
      ],
    });
    expect(r.success).toBe(false);
  });

  // ── Título obrigatório ──
  describe("título", () => {
    it("rejeita título em falta", () => {
      const { nome: _nome, ...semNome } = base;
      expect(criarModeloSessaoSchema.safeParse(semNome).success).toBe(false);
    });

    it("rejeita título vazio com mensagem própria", () => {
      const r = criarModeloSessaoSchema.safeParse({ ...base, nome: "" });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe("O nome é obrigatório");
    });

    it("rejeita título não-texto", () => {
      expect(criarModeloSessaoSchema.safeParse({ ...base, nome: 42 }).success).toBe(false);
      expect(criarModeloSessaoSchema.safeParse({ ...base, nome: null }).success).toBe(false);
    });

    it("aceita 120 caracteres e rejeita 121", () => {
      expect(
        criarModeloSessaoSchema.safeParse({ ...base, nome: "a".repeat(120) }).success,
      ).toBe(true);
      expect(
        criarModeloSessaoSchema.safeParse({ ...base, nome: "a".repeat(121) }).success,
      ).toBe(false);
    });
  });

  // ── Ordem obrigatória em cada exercício ──
  describe("ordem dos exercícios", () => {
    const comOrdem = (ordem: unknown) => ({
      ...base,
      exercicios: [{ exercicioId: EX1, ordem }],
    });

    it("rejeita exercício sem ordem", () => {
      const r = criarModeloSessaoSchema.safeParse({
        ...base,
        exercicios: [{ exercicioId: EX1, duracaoMin: 10 }],
      });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].path).toEqual(["exercicios", 0, "ordem"]);
    });

    it("rejeita ordem não inteira ou negativa", () => {
      expect(criarModeloSessaoSchema.safeParse(comOrdem(0.5)).success).toBe(false);
      expect(criarModeloSessaoSchema.safeParse(comOrdem(-1)).success).toBe(false);
    });

    it("rejeita ordem não numérica", () => {
      expect(criarModeloSessaoSchema.safeParse(comOrdem("0")).success).toBe(false);
      expect(criarModeloSessaoSchema.safeParse(comOrdem(null)).success).toBe(false);
    });

    it("aceita 0..99 e rejeita 100", () => {
      expect(criarModeloSessaoSchema.safeParse(comOrdem(0)).success).toBe(true);
      expect(criarModeloSessaoSchema.safeParse(comOrdem(99)).success).toBe(true);
      expect(criarModeloSessaoSchema.safeParse(comOrdem(100)).success).toBe(false);
    });

    it("exige um cuid válido no exercício", () => {
      const r = criarModeloSessaoSchema.safeParse({
        ...base,
        exercicios: [{ exercicioId: "nao-e-cuid", ordem: 0 }],
      });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe("Exercício inválido");
    });

    it("aceita até 30 exercícios e rejeita 31", () => {
      const lista = (n: number) =>
        Array.from({ length: n }, (_, i) => ({
          exercicioId: `cexercicio${String(i).padStart(15, "0")}`,
          ordem: i,
        }));
      expect(criarModeloSessaoSchema.safeParse({ ...base, exercicios: lista(30) }).success).toBe(
        true,
      );
      expect(criarModeloSessaoSchema.safeParse({ ...base, exercicios: lista(31) }).success).toBe(
        false,
      );
    });
  });

  // ── Duração em minutos positiva ──
  describe("duração em minutos", () => {
    const comDuracao = (duracaoMin: unknown) => ({ ...base, duracaoMin });

    it("rejeita duração zero ou negativa", () => {
      const r = criarModeloSessaoSchema.safeParse(comDuracao(0));
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe("A duração deve ser pelo menos 1 minuto");
      expect(criarModeloSessaoSchema.safeParse(comDuracao(-30)).success).toBe(false);
    });

    it("rejeita duração fracionada (minutos são inteiros)", () => {
      expect(criarModeloSessaoSchema.safeParse(comDuracao(60.5)).success).toBe(false);
    });

    it("rejeita duração não numérica", () => {
      expect(criarModeloSessaoSchema.safeParse(comDuracao("60")).success).toBe(false);
    });

    it("aceita 1..300 e rejeita 301", () => {
      expect(criarModeloSessaoSchema.safeParse(comDuracao(1)).success).toBe(true);
      expect(criarModeloSessaoSchema.safeParse(comDuracao(300)).success).toBe(true);
      const r = criarModeloSessaoSchema.safeParse(comDuracao(301));
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe("A duração máxima é 300 minutos");
    });

    it("aceita template sem duração (opcional)", () => {
      const { duracaoMin: _d, ...semDuracao } = base;
      expect(criarModeloSessaoSchema.safeParse(semDuracao).success).toBe(true);
    });

    it("a duração de cada exercício também tem de ser positiva (1..180)", () => {
      const comDuracaoExercicio = (duracaoMin: unknown) => ({
        ...base,
        exercicios: [{ exercicioId: EX1, ordem: 0, duracaoMin }],
      });
      expect(criarModeloSessaoSchema.safeParse(comDuracaoExercicio(0)).success).toBe(false);
      expect(criarModeloSessaoSchema.safeParse(comDuracaoExercicio(-5)).success).toBe(false);
      expect(criarModeloSessaoSchema.safeParse(comDuracaoExercicio(10.5)).success).toBe(false);
      expect(criarModeloSessaoSchema.safeParse(comDuracaoExercicio(181)).success).toBe(false);
      expect(criarModeloSessaoSchema.safeParse(comDuracaoExercicio(1)).success).toBe(true);
      expect(criarModeloSessaoSchema.safeParse(comDuracaoExercicio(180)).success).toBe(true);
    });
  });

  it("rejeita fase da época fora do enum", () => {
    expect(criarModeloSessaoSchema.safeParse({ ...base, faseEpoca: "PRE_EPOCA" }).success).toBe(
      false,
    );
    expect(
      criarModeloSessaoSchema.safeParse({ ...base, faseEpoca: "PREPARATORIO" }).success,
    ).toBe(true);
  });
});

describe("criarSessaoDeTemplateSchema", () => {
  it("converte a data e aceita época opcional", () => {
    const r = criarSessaoDeTemplateSchema.safeParse({
      modeloSessaoId: MODELO,
      escalaoId: ESCALAO,
      data: "2026-09-10T18:30:00.000Z",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.data).toBeInstanceOf(Date);
  });

  it("rejeita template inválido", () => {
    const r = criarSessaoDeTemplateSchema.safeParse({
      modeloSessaoId: "x",
      escalaoId: ESCALAO,
      data: "2026-09-10",
    });
    expect(r.success).toBe(false);
  });

  // ── Data válida ──
  describe("data", () => {
    const comData = (data: unknown) => ({
      modeloSessaoId: MODELO,
      escalaoId: ESCALAO,
      data,
    });

    it("rejeita data em falta", () => {
      const r = criarSessaoDeTemplateSchema.safeParse({
        modeloSessaoId: MODELO,
        escalaoId: ESCALAO,
      });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "data")).toBe(true);
    });

    it("rejeita texto que não é data", () => {
      expect(criarSessaoDeTemplateSchema.safeParse(comData("amanhã")).success).toBe(false);
      expect(criarSessaoDeTemplateSchema.safeParse(comData("2026-13-45")).success).toBe(false);
      expect(criarSessaoDeTemplateSchema.safeParse(comData("")).success).toBe(false);
    });

    it("aceita data só com dia (ISO curto) e normaliza para Date", () => {
      const r = criarSessaoDeTemplateSchema.safeParse(comData("2026-09-10"));
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.data.toISOString()).toBe("2026-09-10T00:00:00.000Z");
    });

    it("aceita um objeto Date", () => {
      const d = new Date("2026-09-10T18:30:00.000Z");
      const r = criarSessaoDeTemplateSchema.safeParse(comData(d));
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.data.getTime()).toBe(d.getTime());
    });
  });

  // ── escalaoId obrigatório ──
  describe("escalaoId", () => {
    it("rejeita escalão em falta", () => {
      const r = criarSessaoDeTemplateSchema.safeParse({
        modeloSessaoId: MODELO,
        data: "2026-09-10T18:30:00.000Z",
      });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "escalaoId")).toBe(true);
    });

    it("rejeita escalão vazio ou sem formato de cuid", () => {
      for (const escalaoId of ["", "123", "abc", null]) {
        const r = criarSessaoDeTemplateSchema.safeParse({
          modeloSessaoId: MODELO,
          escalaoId,
          data: "2026-09-10T18:30:00.000Z",
        });
        expect(r.success).toBe(false);
      }
    });

    it("assinala o escalão com a mensagem própria", () => {
      const r = criarSessaoDeTemplateSchema.safeParse({
        modeloSessaoId: MODELO,
        escalaoId: "escalao-invalido",
        data: "2026-09-10T18:30:00.000Z",
      });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe("Escalão inválido");
    });
  });

  it("rejeita época com formato inválido e aceita a omissão", () => {
    const base = {
      modeloSessaoId: MODELO,
      escalaoId: ESCALAO,
      data: "2026-09-10T18:30:00.000Z",
    };
    expect(criarSessaoDeTemplateSchema.safeParse({ ...base, epocaId: "xpto" }).success).toBe(
      false,
    );
    expect(
      criarSessaoDeTemplateSchema.safeParse({ ...base, epocaId: "cepoca000000000000000001" })
        .success,
    ).toBe(true);
    expect(criarSessaoDeTemplateSchema.safeParse(base).success).toBe(true);
  });
});

// ─── Visibilidade das bibliotecas ────────────────────────────────────────────

describe("filtros de visibilidade (secção 3.3)", () => {
  it("inclui pessoais do próprio, pessoais de colegas com escalão partilhado, do clube (novo e legado) e partilhados", () => {
    const filtro = filtroExerciciosVisiveis("clube1", "u1");
    expect(filtro.OR).toEqual([
      { proprietario: "TREINADOR", autorId: "u1" },
      {
        proprietario: "TREINADOR",
        autor: {
          membros: {
            some: {
              clubeId: "clube1",
              atribuicoes: {
                some: {
                  escalao: {
                    atribuicoes: {
                      some: { membroClube: { clubeId: "clube1", utilizadorId: "u1" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      { proprietario: "CLUBE", clubeProprietarioId: "clube1" },
      { proprietario: "CLUBE", clubeProprietarioId: null, clubeId: "clube1" },
      { partilhasClube: { some: { clubeId: "clube1" } } },
    ]);
  });

  it("templates: pessoais do próprio + do clube ativo", () => {
    const filtro = filtroModelosSessaoVisiveis("clube1", "u1");
    expect(filtro.OR).toEqual([
      { proprietario: "TREINADOR", autorId: "u1" },
      { proprietario: "CLUBE", clubeProprietarioId: "clube1" },
    ]);
  });

  it("classifica a origem do item", () => {
    expect(origemDoItem({ proprietario: "TREINADOR", autorId: "u1" }, "u1")).toBe("PESSOAL");
    expect(origemDoItem({ proprietario: "TREINADOR", autorId: "u2" }, "u1")).toBe("CLUBE");
    expect(origemDoItem({ proprietario: "CLUBE", autorId: "u1" }, "u1")).toBe("CLUBE");
  });
});

// ─── Partilha de exercícios ──────────────────────────────────────────────────

describe("partilharExercicioNoClube", () => {
  it("só o autor pode partilhar", async () => {
    // Buscado com o filtro de visibilidade (findFirst), não por chave única (M1).
    mocked(prisma.exercicio.findFirst).mockResolvedValue({
      id: EX1,
      autorId: "outro",
      proprietario: "TREINADOR",
    });

    const r = await partilharExercicioNoClube({ exercicioId: EX1 });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/autor/i);
    expect(prisma.partilhaExercicioClube.upsert).not.toHaveBeenCalled();
  });

  it("só exercícios da biblioteca pessoal (TREINADOR) podem ser partilhados (M1)", async () => {
    mocked(prisma.exercicio.findFirst).mockResolvedValue({
      id: EX1,
      autorId: "u1",
      proprietario: "CLUBE",
    });

    const r = await partilharExercicioNoClube({ exercicioId: EX1 });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/biblioteca pessoal/i);
    expect(prisma.partilhaExercicioClube.upsert).not.toHaveBeenCalled();
  });

  it("é idempotente (upsert na chave exercicio+clube)", async () => {
    mocked(prisma.exercicio.findFirst).mockResolvedValue({
      id: EX1,
      autorId: "u1",
      proprietario: "TREINADOR",
    });
    mocked(prisma.partilhaExercicioClube.upsert).mockResolvedValue({ id: "p1" });

    const r = await partilharExercicioNoClube({ exercicioId: EX1 });
    expect(r.sucesso).toBe(true);

    const arg = mocked(prisma.partilhaExercicioClube.upsert).mock.calls[0][0] as {
      where: { exercicioId_clubeId: { exercicioId: string; clubeId: string } };
      create: { exercicioId: string; clubeId: string };
    };
    expect(arg.where.exercicioId_clubeId).toEqual({ exercicioId: EX1, clubeId: "clube1" });
    expect(arg.create).toEqual({ exercicioId: EX1, clubeId: "clube1" });
  });
});

// ─── Templates de sessão ─────────────────────────────────────────────────────

describe("criarModeloSessao", () => {
  const dados = {
    nome: "Posse e circulação",
    duracaoMin: 60,
    exercicios: [{ exercicioId: EX1, ordem: 0, duracaoMin: 10 }],
  };

  it("falha sem permissão", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await criarModeloSessao(dados);
    expect(r.sucesso).toBe(false);
    expect(prisma.modeloSessao.create).not.toHaveBeenCalled();
  });

  it("rejeita exercícios fora da biblioteca visível", async () => {
    mocked(prisma.exercicio.count).mockResolvedValue(0);
    const r = await criarModeloSessao(dados);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/biblioteca/i);
    expect(prisma.modeloSessao.create).not.toHaveBeenCalled();
  });

  it("cria template pessoal com os exercícios na mesma transação", async () => {
    mocked(prisma.exercicio.count).mockResolvedValue(1);
    mocked(prisma.modeloSessao.create).mockResolvedValue({ id: MODELO });
    mocked(prisma.modeloSessaoExercicio.createMany).mockResolvedValue({ count: 1 });

    const r = await criarModeloSessao(dados);
    expect(r.sucesso).toBe(true);

    const createArg = mocked(prisma.modeloSessao.create).mock.calls[0][0] as {
      data: { autorId: string; proprietario: string; clubeProprietarioId: string | null };
    };
    expect(createArg.data.autorId).toBe("u1");
    expect(createArg.data.proprietario).toBe("TREINADOR");
    expect(createArg.data.clubeProprietarioId).toBeNull();

    const linhasArg = mocked(prisma.modeloSessaoExercicio.createMany).mock.calls[0][0] as {
      data: { modeloSessaoId: string; exercicioId: string; ordem: number }[];
    };
    expect(linhasArg.data).toEqual([
      {
        modeloSessaoId: MODELO,
        exercicioId: EX1,
        ordem: 0,
        duracaoMin: 10,
        parteTreino: null,
        notas: null,
      },
    ]);
  });

  it("exige EXERCICIOS_GERIR para contribuir para a biblioteca do clube", async () => {
    mocked(exigirCapacidade).mockImplementation((cap: unknown) =>
      Promise.resolve(
        cap === "EXERCICIOS_GERIR" ? { ok: false, erro: "Sem permissão" } : PERM_OK,
      ),
    );

    const r = await criarModeloSessao({ ...dados, proprietario: "CLUBE" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/biblioteca do clube/i);
    expect(prisma.modeloSessao.create).not.toHaveBeenCalled();
  });
});

describe("criarSessaoDeTemplate (cópia, sem ligação ao template)", () => {
  const dadosSessao = {
    modeloSessaoId: MODELO,
    escalaoId: ESCALAO,
    data: "2026-09-10T18:30:00.000Z",
  };

  it("falha se não há época ativa", async () => {
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: ESCALAO, clubeId: "clube1" });
    mocked(obterEpocaAtiva).mockResolvedValue(null);

    const r = await criarSessaoDeTemplate(dadosSessao);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/época ativa/i);
    expect(prisma.sessao.create).not.toHaveBeenCalled();
  });

  it("copia exercícios com ordem reindexada e sem guardar o template", async () => {
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: ESCALAO, clubeId: "clube1" });
    mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
    mocked(prisma.modeloSessao.findFirst).mockResolvedValue({
      id: MODELO,
      duracaoMin: 60,
      objetivoTatico: "Posse sob pressão",
      descricao: "Sessão de base",
      exercicios: [
        {
          ordem: 5,
          exercicioId: EX2,
          duracaoMin: null,
          notas: null,
          exercicio: { id: EX2, duracaoMin: 12 },
        },
        {
          ordem: 2,
          exercicioId: EX1,
          duracaoMin: 10,
          notas: "Um toque",
          exercicio: { id: EX1, duracaoMin: 8 },
        },
      ],
    });
    mocked(prisma.sessao.create).mockResolvedValue({ id: "s1" });
    mocked(prisma.sessaoExercicio.createMany).mockResolvedValue({ count: 2 });

    const r = await criarSessaoDeTemplate(dadosSessao);
    expect(r.sucesso).toBe(true);

    const sessaoArg = mocked(prisma.sessao.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(sessaoArg.data.escalaoId).toBe(ESCALAO);
    expect(sessaoArg.data.epocaId).toBe("ep1");
    expect(sessaoArg.data.duracaoMin).toBe(60);
    expect(sessaoArg.data.objetivo).toBe("Posse sob pressão");
    expect(sessaoArg.data.criadorId).toBe("u1");
    // A sessão é uma cópia: não há qualquer referência ao template.
    expect(Object.keys(sessaoArg.data)).not.toContain("modeloSessaoId");

    const linhasArg = mocked(prisma.sessaoExercicio.createMany).mock.calls[0][0] as {
      data: {
        sessaoId: string;
        exercicioId: string;
        ordem: number;
        duracaoMin: number | null;
        notas: string | null;
      }[];
    };
    expect(linhasArg.data).toEqual([
      { sessaoId: "s1", exercicioId: EX1, ordem: 0, duracaoMin: 10, notas: "Um toque" },
      // Sem duração no template → herda a duração do exercício.
      { sessaoId: "s1", exercicioId: EX2, ordem: 1, duracaoMin: 12, notas: null },
    ]);
  });

  /** Arranja o cenário feliz: escalão + época ativa + template visível. */
  function prepararTemplate(exercicios: unknown[] = []) {
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: ESCALAO, clubeId: "clube1" });
    mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
    mocked(prisma.modeloSessao.findFirst).mockResolvedValue({
      id: MODELO,
      duracaoMin: 60,
      objetivoTatico: "Posse sob pressão",
      descricao: "Sessão de base",
      exercicios,
    });
    mocked(prisma.sessao.create).mockResolvedValue({ id: "s1" });
    mocked(prisma.sessaoExercicio.createMany).mockResolvedValue({ count: exercicios.length });
  }

  const linhaTemplate = (over: Record<string, unknown> = {}) => ({
    ordem: 0,
    exercicioId: EX1,
    duracaoMin: 10,
    notas: null,
    exercicio: { id: EX1, duracaoMin: 8 },
    ...over,
  });

  it("é cópia e não corte: o template de origem fica intacto", async () => {
    prepararTemplate([linhaTemplate()]);

    const r = await criarSessaoDeTemplate(dadosSessao);
    expect(r.sucesso).toBe(true);

    // Nada é movido nem re-escrito no lado do template.
    expect(prisma.modeloSessao.update).not.toHaveBeenCalled();
    expect(prisma.modeloSessao.create).not.toHaveBeenCalled();
    expect(prisma.modeloSessaoExercicio.deleteMany).not.toHaveBeenCalled();
    expect(prisma.modeloSessaoExercicio.createMany).not.toHaveBeenCalled();
  });

  it("não guarda qualquer ligação ao template nas linhas copiadas", async () => {
    prepararTemplate([linhaTemplate()]);
    await criarSessaoDeTemplate(dadosSessao);

    const linhasArg = mocked(prisma.sessaoExercicio.createMany).mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    for (const linha of linhasArg.data) {
      expect(Object.keys(linha)).not.toContain("modeloSessaoId");
      expect(Object.keys(linha)).not.toContain("modeloSessaoExercicioId");
      // O que persiste é o exercício da biblioteca (histórico legível, secção 3.3).
      expect(linha.exercicioId).toBe(EX1);
    }
  });

  it("cria a sessão como NORMAL e copia duração, objetivo e notas do template", async () => {
    prepararTemplate([linhaTemplate()]);
    await criarSessaoDeTemplate(dadosSessao);

    const sessaoArg = mocked(prisma.sessao.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(sessaoArg.data.tipoSessao).toBe("NORMAL");
    expect(sessaoArg.data.duracaoMin).toBe(60);
    expect(sessaoArg.data.objetivo).toBe("Posse sob pressão");
    expect(sessaoArg.data.notas).toBe("Sessão de base");
  });

  it("um template sem exercícios cria na mesma a sessão, sem linhas", async () => {
    prepararTemplate([]);

    const r = await criarSessaoDeTemplate(dadosSessao);
    expect(r.sucesso).toBe(true);
    expect(prisma.sessao.create).toHaveBeenCalled();
    expect(prisma.sessaoExercicio.createMany).not.toHaveBeenCalled();
  });

  it("usa a época indicada explicitamente em vez da ativa", async () => {
    prepararTemplate([linhaTemplate()]);
    mocked(prisma.epoca.findFirst).mockResolvedValue({ id: "ep2", clubeId: "clube1" });

    const r = await criarSessaoDeTemplate({
      ...dadosSessao,
      epocaId: "cepoca000000000000000002",
    });
    expect(r.sucesso).toBe(true);

    const sessaoArg = mocked(prisma.sessao.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(sessaoArg.data.epocaId).toBe("ep2");
  });

  it("falha quando o template não é visível ao membro", async () => {
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: ESCALAO, clubeId: "clube1" });
    mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
    mocked(prisma.modeloSessao.findFirst).mockResolvedValue(null);

    const r = await criarSessaoDeTemplate(dadosSessao);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/template/i);
    expect(prisma.sessao.create).not.toHaveBeenCalled();
  });

  it("falha quando o escalão não pertence ao clube ativo", async () => {
    mocked(prisma.escalao.findFirst).mockResolvedValue(null);

    const r = await criarSessaoDeTemplate(dadosSessao);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/escalão/i);
    expect(prisma.sessao.create).not.toHaveBeenCalled();
  });

  it("rejeita dados inválidos antes de verificar permissões", async () => {
    const r = await criarSessaoDeTemplate({ ...dadosSessao, escalaoId: "x" });
    expect(r.sucesso).toBe(false);
    expect(exigirCapacidade).not.toHaveBeenCalled();
    expect(prisma.sessao.create).not.toHaveBeenCalled();
  });
});

// ─── Contribuição de um template para a biblioteca do clube ──────────────────

describe("partilharModeloSessaoNoClube (transfere propriedade, não duplica)", () => {
  const pessoal = {
    id: MODELO,
    autorId: "u1",
    proprietario: "TREINADOR",
    clubeProprietarioId: null,
  };

  it("falha sem permissão de gerir exercícios", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });

    const r = await partilharModeloSessaoNoClube(MODELO);
    expect(r.sucesso).toBe(false);
    expect(prisma.modeloSessao.update).not.toHaveBeenCalled();
  });

  it("falha quando o template não existe", async () => {
    mocked(prisma.modeloSessao.findUnique).mockResolvedValue(null);

    const r = await partilharModeloSessaoNoClube(MODELO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrado/i);
    expect(prisma.modeloSessao.update).not.toHaveBeenCalled();
  });

  it("só o autor pode contribuir com o template", async () => {
    mocked(prisma.modeloSessao.findUnique).mockResolvedValue({ ...pessoal, autorId: "outro" });

    const r = await partilharModeloSessaoNoClube(MODELO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/autor/i);
    expect(prisma.modeloSessao.update).not.toHaveBeenCalled();
  });

  it("só templates da biblioteca pessoal (TREINADOR) podem ser partilhados (M2)", async () => {
    mocked(prisma.modeloSessao.findUnique).mockResolvedValue({
      ...pessoal,
      proprietario: "CLUBE",
      clubeProprietarioId: "clube1",
    });

    const r = await partilharModeloSessaoNoClube(MODELO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/biblioteca pessoal/i);
    expect(prisma.modeloSessao.update).not.toHaveBeenCalled();
  });

  it("transfere a propriedade para o clube sem duplicar o template", async () => {
    mocked(prisma.modeloSessao.findUnique).mockResolvedValue(pessoal);
    mocked(prisma.modeloSessao.update).mockResolvedValue({ ...pessoal, proprietario: "CLUBE" });

    const r = await partilharModeloSessaoNoClube(MODELO);
    expect(r.sucesso).toBe(true);

    // Ao contrário dos exercícios (PartilhaExercicioClube), aqui a linha é a mesma:
    // muda de dono, não se cria uma cópia nem uma linha de partilha.
    const updateArg = mocked(prisma.modeloSessao.update).mock.calls[0][0] as {
      where: { id: string };
      data: { proprietario: string; clubeProprietarioId: string };
    };
    expect(updateArg.where).toEqual({ id: MODELO });
    expect(updateArg.data).toEqual({ proprietario: "CLUBE", clubeProprietarioId: "clube1" });

    expect(prisma.modeloSessao.create).not.toHaveBeenCalled();
    expect(prisma.modeloSessaoExercicio.createMany).not.toHaveBeenCalled();
    expect(prisma.partilhaExercicioClube.upsert).not.toHaveBeenCalled();
  });

  it("recusa contribuir com um template que já é do clube (mesmo de outro clube) — M2", async () => {
    // Antes do M2 um template CLUBE de outro clube podia ser recontribuído.
    // Agora só conteúdo 🎒 pessoal (TREINADOR) é partilhável para o clube.
    mocked(prisma.modeloSessao.findUnique).mockResolvedValue({
      ...pessoal,
      proprietario: "CLUBE",
      clubeProprietarioId: "outroClube",
    });

    const r = await partilharModeloSessaoNoClube(MODELO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/biblioteca pessoal/i);
    expect(prisma.modeloSessao.update).not.toHaveBeenCalled();
  });
});

describe("instalarTemplatesArranque", () => {
  it("é idempotente quando o clube já tem templates de seed", async () => {
    mocked(prisma.modeloSessao.count).mockResolvedValue(3);

    const r = await instalarTemplatesArranque();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados.criados).toBe(0);
    expect(prisma.modeloSessao.create).not.toHaveBeenCalled();
  });

  it("exige a biblioteca de exercícios de arranque instalada", async () => {
    mocked(prisma.modeloSessao.count).mockResolvedValue(0);
    mocked(prisma.exercicio.findMany).mockResolvedValue([]);

    const r = await instalarTemplatesArranque();
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/biblioteca/i);
    expect(prisma.modeloSessao.create).not.toHaveBeenCalled();
  });

  it("cria os templates curados quando os exercícios existem", async () => {
    const nomes = [
      ...new Set(TEMPLATES_ARRANQUE.flatMap((t) => t.exercicios.map((e) => e.nomeExercicio))),
    ];
    mocked(prisma.modeloSessao.count).mockResolvedValue(0);
    mocked(prisma.exercicio.findMany).mockResolvedValue(
      nomes.map((nome, i) => ({ id: `ex${i}`, nome })),
    );
    mocked(prisma.modeloSessao.create).mockResolvedValue({ id: MODELO });
    mocked(prisma.modeloSessaoExercicio.createMany).mockResolvedValue({ count: 5 });

    const r = await instalarTemplatesArranque();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados.criados).toBe(TEMPLATES_ARRANQUE.length);
    expect(mocked(prisma.modeloSessao.create).mock.calls).toHaveLength(
      TEMPLATES_ARRANQUE.length,
    );
  });

  it("é idempotente ponta a ponta: a segunda chamada devolve 0 criados", async () => {
    const nomes = [
      ...new Set(TEMPLATES_ARRANQUE.flatMap((t) => t.exercicios.map((e) => e.nomeExercicio))),
    ];
    mocked(prisma.exercicio.findMany).mockResolvedValue(
      nomes.map((nome, i) => ({ id: `ex${i}`, nome })),
    );
    mocked(prisma.modeloSessao.create).mockResolvedValue({ id: MODELO });
    mocked(prisma.modeloSessaoExercicio.createMany).mockResolvedValue({ count: 5 });

    // 1ª chamada: o clube ainda não tem templates de seed.
    mocked(prisma.modeloSessao.count).mockResolvedValueOnce(0);
    const primeira = await instalarTemplatesArranque();
    expect(primeira.sucesso).toBe(true);
    if (primeira.sucesso) expect(primeira.dados.criados).toBe(TEMPLATES_ARRANQUE.length);
    const criadosNaPrimeira = mocked(prisma.modeloSessao.create).mock.calls.length;
    expect(criadosNaPrimeira).toBe(TEMPLATES_ARRANQUE.length);

    // 2ª chamada: a contagem passa a refletir os templates já instalados.
    mocked(prisma.modeloSessao.count).mockResolvedValueOnce(TEMPLATES_ARRANQUE.length);
    const segunda = await instalarTemplatesArranque();
    expect(segunda.sucesso).toBe(true);
    if (segunda.sucesso) expect(segunda.dados.criados).toBe(0);

    // Nenhuma escrita adicional: nem templates, nem linhas de exercício.
    expect(mocked(prisma.modeloSessao.create).mock.calls).toHaveLength(criadosNaPrimeira);
    expect(mocked(prisma.modeloSessaoExercicio.createMany).mock.calls).toHaveLength(
      criadosNaPrimeira,
    );
  });

  it("delimita a contagem de idempotência ao clube ativo e às linhas de seed", async () => {
    mocked(prisma.modeloSessao.count).mockResolvedValue(0);
    mocked(prisma.exercicio.findMany).mockResolvedValue([]);

    await instalarTemplatesArranque();

    const countArg = mocked(prisma.modeloSessao.count).mock.calls[0][0] as {
      where: { clubeProprietarioId: string; origemSeed: boolean };
    };
    expect(countArg.where).toEqual({ clubeProprietarioId: "clube1", origemSeed: true });
  });

  it("marca os templates instalados como 🏛️ do clube e de origem seed", async () => {
    const nomes = [
      ...new Set(TEMPLATES_ARRANQUE.flatMap((t) => t.exercicios.map((e) => e.nomeExercicio))),
    ];
    mocked(prisma.modeloSessao.count).mockResolvedValue(0);
    mocked(prisma.exercicio.findMany).mockResolvedValue(
      nomes.map((nome, i) => ({ id: `ex${i}`, nome })),
    );
    mocked(prisma.modeloSessao.create).mockResolvedValue({ id: MODELO });
    mocked(prisma.modeloSessaoExercicio.createMany).mockResolvedValue({ count: 5 });

    await instalarTemplatesArranque();

    for (const chamada of mocked(prisma.modeloSessao.create).mock.calls) {
      const { data } = chamada[0] as { data: Record<string, unknown> };
      expect(data.proprietario).toBe("CLUBE");
      expect(data.clubeProprietarioId).toBe("clube1");
      expect(data.origemSeed).toBe(true);
      expect(data.autorId).toBe("u1");
    }
  });
});

describe("conteúdo curado de arranque", () => {
  it("todos os exercícios dos templates existem na biblioteca de arranque", () => {
    const nomesBiblioteca = new Set(BIBLIOTECA_ARRANQUE.map((e) => e.nome));
    for (const template of TEMPLATES_ARRANQUE) {
      for (const e of template.exercicios) {
        expect(nomesBiblioteca.has(e.nomeExercicio)).toBe(true);
      }
    }
  });

  it("cada template cobre aquecimento, parte principal, jogo reduzido e retorno à calma", () => {
    for (const template of TEMPLATES_ARRANQUE) {
      const partes = new Set(template.exercicios.map((e) => e.parteTreino));
      expect(partes.has("AQUECIMENTO")).toBe(true);
      expect(partes.has("PRINCIPAL")).toBe(true);
      expect(partes.has("JOGO_REDUZIDO")).toBe(true);
      expect(partes.has("RETORNO_CALMA")).toBe(true);
    }
  });
});
