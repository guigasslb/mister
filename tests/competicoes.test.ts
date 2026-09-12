import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  criarCompeticaoSchema,
  criarCompeticaoCompletaSchema,
  registarResultadoExternoSchema,
  registarConfrontoSchema,
  definirEstadoConfrontoSchema,
} from "@/lib/schemas/competicao";

const CUID = "ckv9v0z1w0000abcd1234efgh";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas (validação pura — sem mocks)
// ─────────────────────────────────────────────────────────────────────────────

describe("criarCompeticaoSchema", () => {
  it("aceita input mínimo válido e aplica defaults (tipo OFICIAL, formato LIGA)", () => {
    const r = criarCompeticaoSchema.safeParse({ nome: "Liga Distrital", escalaoId: CUID });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tipo).toBe("OFICIAL");
      expect(r.data.formato).toBe("LIGA");
    }
  });

  it("rejeita nome vazio", () => {
    expect(criarCompeticaoSchema.safeParse({ nome: "", escalaoId: CUID }).success).toBe(false);
  });

  it("aceita nome com 100 caracteres e rejeita com 101", () => {
    const nome100 = "A".repeat(100);
    const nome101 = "A".repeat(101);
    expect(criarCompeticaoSchema.safeParse({ nome: nome100, escalaoId: CUID }).success).toBe(true);
    expect(criarCompeticaoSchema.safeParse({ nome: nome101, escalaoId: CUID }).success).toBe(false);
  });

  it("rejeita formato inválido", () => {
    const r = criarCompeticaoSchema.safeParse({
      nome: "X",
      escalaoId: CUID,
      formato: "PLAYOFF",
    });
    expect(r.success).toBe(false);
  });

  it("rejeita escalaoId que não é cuid", () => {
    expect(criarCompeticaoSchema.safeParse({ nome: "X", escalaoId: "nao-cuid" }).success).toBe(
      false,
    );
  });
});

describe("registarResultadoExternoSchema", () => {
  const base = {
    competicaoId: CUID,
    equipaCasa: "Benfica",
    equipaFora: "Sporting",
    golosCasa: 2,
    golosFora: 1,
  };

  it("aceita um resultado externo válido", () => {
    expect(registarResultadoExternoSchema.safeParse(base).success).toBe(true);
  });

  it("aceita equipaCasa === equipaFora (a rejeição é responsabilidade da action)", () => {
    const r = registarResultadoExternoSchema.safeParse({
      ...base,
      equipaCasa: "Benfica",
      equipaFora: "Benfica",
    });
    expect(r.success).toBe(true);
  });

  it("aceita golos no limite 99 e rejeita 100", () => {
    expect(registarResultadoExternoSchema.safeParse({ ...base, golosCasa: 99 }).success).toBe(true);
    expect(registarResultadoExternoSchema.safeParse({ ...base, golosFora: 99 }).success).toBe(true);
    expect(registarResultadoExternoSchema.safeParse({ ...base, golosCasa: 100 }).success).toBe(
      false,
    );
    expect(registarResultadoExternoSchema.safeParse({ ...base, golosFora: 100 }).success).toBe(
      false,
    );
  });

  it("rejeita golos negativos", () => {
    expect(registarResultadoExternoSchema.safeParse({ ...base, golosCasa: -1 }).success).toBe(
      false,
    );
  });

  it("faz coerce de data a partir de string ISO", () => {
    const r = registarResultadoExternoSchema.safeParse({ ...base, data: "2026-08-06T18:00:00Z" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.data).toBeInstanceOf(Date);
      expect(r.data.data?.getUTCFullYear()).toBe(2026);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1.2 (§23) — Configuração de pontos + schemas de confronto
// ─────────────────────────────────────────────────────────────────────────────

describe("criarCompeticaoSchema — configuração de pontos (§23.3)", () => {
  it("aplica defaults 3/1/0, golosWalkover 3 e ambito PROPRIA", () => {
    const r = criarCompeticaoSchema.safeParse({ nome: "Liga", escalaoId: CUID });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ambito).toBe("PROPRIA");
      expect(r.data.pontosVitoria).toBe(3);
      expect(r.data.pontosEmpate).toBe(1);
      expect(r.data.pontosDerrota).toBe(0);
      expect(r.data.golosWalkover).toBe(3);
    }
  });

  it("aceita pontuação alternativa 2/1/0 e ambito EXTERNA", () => {
    const r = criarCompeticaoSchema.safeParse({
      nome: "Torneio de Páscoa",
      escalaoId: CUID,
      ambito: "EXTERNA",
      pontosVitoria: 2,
      pontosEmpate: 1,
      pontosDerrota: 0,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ambito).toBe("EXTERNA");
      expect(r.data.pontosVitoria).toBe(2);
    }
  });

  it("rejeita pontosVitoria fora do intervalo (0 ou 6)", () => {
    expect(criarCompeticaoSchema.safeParse({ nome: "X", escalaoId: CUID, pontosVitoria: 0 }).success).toBe(
      false,
    );
    expect(criarCompeticaoSchema.safeParse({ nome: "X", escalaoId: CUID, pontosVitoria: 6 }).success).toBe(
      false,
    );
  });

  it("propaga a configuração ao schema completo (wizard)", () => {
    const r = criarCompeticaoCompletaSchema.safeParse({
      nome: "Torneio",
      escalaoId: CUID,
      ambito: "PROPRIA",
      pontosVitoria: 2,
      equipas: [{ nome: "A" }, { nome: "B" }],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pontosVitoria).toBe(2);
      expect(r.data.golosWalkover).toBe(3);
      // Participante ganha tipo EXTERNO por defeito (§23.3).
      expect(r.data.equipas[0].tipo).toBe("EXTERNO");
    }
  });
});

describe("registarConfrontoSchema (§23.7)", () => {
  it("aceita um confronto por nome com estado REALIZADO por defeito", () => {
    const r = registarConfrontoSchema.safeParse({
      equipaCasaNome: "Benfica",
      equipaForaNome: "Sporting",
      golosCasa: 2,
      golosFora: 1,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.estado).toBe("REALIZADO");
  });

  it("WALKOVER exige walkoverVencedor", () => {
    const semVencedor = registarConfrontoSchema.safeParse({
      equipaCasaNome: "Benfica",
      equipaForaNome: "Sporting",
      estado: "WALKOVER",
    });
    expect(semVencedor.success).toBe(false);

    const comVencedor = registarConfrontoSchema.safeParse({
      equipaCasaNome: "Benfica",
      equipaForaNome: "Sporting",
      estado: "WALKOVER",
      walkoverVencedor: "CASA",
    });
    expect(comVencedor.success).toBe(true);
  });

  it("aceita identificação por FK (cuid) e faz trim aos nomes", () => {
    const r = registarConfrontoSchema.safeParse({
      equipaCasaId: CUID,
      equipaForaNome: "  Sporting  ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.equipaForaNome).toBe("Sporting");
  });

  it("rejeita golos negativos", () => {
    const r = registarConfrontoSchema.safeParse({
      equipaCasaNome: "A",
      equipaForaNome: "B",
      golosCasa: -1,
    });
    expect(r.success).toBe(false);
  });
});

describe("definirEstadoConfrontoSchema (§23.7)", () => {
  it("aceita CANCELADO sem vencedor de walkover", () => {
    const r = definirEstadoConfrontoSchema.safeParse({ resultadoId: CUID, estado: "CANCELADO" });
    expect(r.success).toBe(true);
  });

  it("WALKOVER exige walkoverVencedor", () => {
    expect(
      definirEstadoConfrontoSchema.safeParse({ resultadoId: CUID, estado: "WALKOVER" }).success,
    ).toBe(false);
    expect(
      definirEstadoConfrontoSchema.safeParse({
        resultadoId: CUID,
        estado: "WALKOVER",
        walkoverVencedor: "FORA",
      }).success,
    ).toBe(true);
  });

  it("rejeita resultadoId que não é cuid", () => {
    expect(
      definirEstadoConfrontoSchema.safeParse({ resultadoId: "nao-cuid", estado: "REALIZADO" })
        .success,
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Actions (mock de auth + prisma) — mesmo padrão de actions-producao.test.ts
// ─────────────────────────────────────────────────────────────────────────────

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
    competicao: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    epoca: { findFirst: vi.fn() },
    escalao: { findFirst: vi.fn() },
    resultadoCompeticao: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    // P1.2 (§23): obterClassificacao lê o participante PROPRIO; as actions de
    // confronto resolvem/criam participantes on-the-fly.
    equipaCompeticao: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    jogo: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import {
  criarCompeticao,
  obterClassificacao,
  registarResultadoExterno,
  apagarResultadoExterno,
} from "@/lib/actions/competicoes";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerEscalao } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockImplementation: (f: (...a: unknown[]) => unknown) => void;
  };

const PERM_OK = { ok: true, ctx: { clube: { id: "clube1" } } };
const callsOf = (fn: unknown) => (fn as { mock: { calls: unknown[][] } }).mock.calls;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
  mocked(obterClubeIdAtual).mockResolvedValue("clube1");
  mocked(podeLerEscalao).mockResolvedValue(true);
});

describe("criarCompeticao", () => {
  it("exige a capacidade COMPETICOES_GERIR (rejeita sem permissão)", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });

    const r = await criarCompeticao({ nome: "Liga", escalaoId: CUID, formato: "LIGA" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/permiss/i);
    expect(prisma.competicao.create).not.toHaveBeenCalled();

    // A capacidade é verificada contra o escalão indicado.
    expect(callsOf(exigirCapacidade)[0]).toEqual(["COMPETICOES_GERIR", CUID]);
  });

  it("persiste formato, tipo e escalão isolados pelo clube da sessão", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: CUID, clubeId: "clube1" });
    mocked(prisma.competicao.create).mockResolvedValue({ id: "comp1" });

    const r = await criarCompeticao({
      nome: "Taça Distrital",
      escalaoId: CUID,
      tipo: "AMIGAVEL",
      formato: "TACA",
    });
    expect(r.sucesso).toBe(true);

    // Isolamento por clube: o escalão é procurado dentro do clube da sessão.
    const escArg = callsOf(prisma.escalao.findFirst)[0][0] as { where: { clubeId: string } };
    expect(escArg.where.clubeId).toBe("clube1");

    // Persistência: formato + tipo + escalão + clube + época.
    const createArg = callsOf(prisma.competicao.create)[0][0] as {
      data: {
        nome: string;
        tipo: string;
        formato: string;
        escalaoId: string;
        clubeId: string;
        epocaId: string;
      };
    };
    expect(createArg.data).toMatchObject({
      nome: "Taça Distrital",
      tipo: "AMIGAVEL",
      formato: "TACA",
      escalaoId: CUID,
      clubeId: "clube1",
      epocaId: "ep1",
    });
  });

  it("rejeita escalão que não pertence ao clube", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
    mocked(prisma.escalao.findFirst).mockResolvedValue(null);

    const r = await criarCompeticao({ nome: "Liga", escalaoId: CUID, formato: "LIGA" });
    expect(r.sucesso).toBe(false);
    expect(prisma.competicao.create).not.toHaveBeenCalled();
  });
});

describe("obterClassificacao", () => {
  it("combina jogos próprios com resultados externos e ordena corretamente", async () => {
    mocked(prisma.competicao.findFirst).mockResolvedValue({
      id: "comp1",
      escalaoId: "esc1",
      formato: "LIGA",
      escalao: { nome: "Sub-15" },
    });
    // Sub-15 vence o Benfica 3-1.
    mocked(prisma.jogo.findMany).mockResolvedValue([
      { adversario: "Benfica", golosMarcados: 3, golosSofridos: 1 },
    ]);
    // Resultado externo: Porto vence o Sporting 2-0 (Porto também com 3 pts, +2 diff).
    mocked(prisma.resultadoCompeticao.findMany).mockResolvedValue([
      { equipaCasa: "Porto", equipaFora: "Sporting", golosCasa: 2, golosFora: 0 },
    ]);

    const r = await obterClassificacao("comp1");
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;

    const tabela = r.dados;
    // Sub-15 (+2 diff) e Porto (+2 diff) têm 3 pts; Sub-15 marcou 3, Porto 2 → Sub-15 primeiro.
    expect(tabela[0].equipa).toBe("Sub-15");
    expect(tabela.find((l) => l.equipa === "Porto")!.pontos).toBe(3);
    expect(tabela.find((l) => l.equipa === "Benfica")!.derrotas).toBe(1);
    expect(tabela.find((l) => l.equipa === "Sporting")!.derrotas).toBe(1);
  });

  it("rejeita competição de outro clube", async () => {
    mocked(prisma.competicao.findFirst).mockResolvedValue(null);
    const r = await obterClassificacao("comp1");
    expect(r.sucesso).toBe(false);
    expect(prisma.jogo.findMany).not.toHaveBeenCalled();
  });
});

describe("registarResultadoExterno", () => {
  it("rejeita quando equipaCasa === equipaFora (após trim)", async () => {
    mocked(prisma.competicao.findFirst).mockResolvedValue({ id: "comp1", escalaoId: "esc1" });

    const r = await registarResultadoExterno({
      competicaoId: CUID,
      equipaCasa: "Benfica",
      equipaFora: " Benfica ",
      golosCasa: 1,
      golosFora: 0,
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/diferentes/i);
    expect(prisma.resultadoCompeticao.create).not.toHaveBeenCalled();
  });

  it("verifica que a competição pertence ao clube da sessão", async () => {
    mocked(prisma.competicao.findFirst).mockResolvedValue(null);

    const r = await registarResultadoExterno({
      competicaoId: CUID,
      equipaCasa: "Benfica",
      equipaFora: "Sporting",
      golosCasa: 2,
      golosFora: 1,
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrada/i);
    expect(prisma.resultadoCompeticao.create).not.toHaveBeenCalled();

    const findArg = callsOf(prisma.competicao.findFirst)[0][0] as {
      where: { id: string; clubeId: string };
    };
    expect(findArg.where).toMatchObject({ id: CUID, clubeId: "clube1" });
  });

  it("persiste o resultado externo (com trim) quando válido", async () => {
    mocked(prisma.competicao.findFirst).mockResolvedValue({ id: "comp1", escalaoId: "esc1" });
    mocked(prisma.resultadoCompeticao.create).mockResolvedValue({ id: "res1" });

    const r = await registarResultadoExterno({
      competicaoId: CUID,
      equipaCasa: "  Benfica ",
      equipaFora: "Sporting ",
      golosCasa: 2,
      golosFora: 1,
    });
    expect(r.sucesso).toBe(true);
    const arg = callsOf(prisma.resultadoCompeticao.create)[0][0] as {
      data: { equipaCasa: string; equipaFora: string };
    };
    expect(arg.data.equipaCasa).toBe("Benfica");
    expect(arg.data.equipaFora).toBe("Sporting");
  });
});

describe("apagarResultadoExterno", () => {
  it("verifica a propriedade via competição do clube (rejeita se não pertence)", async () => {
    mocked(prisma.resultadoCompeticao.findFirst).mockResolvedValue(null);

    const r = await apagarResultadoExterno("res1");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrado/i);
    expect(prisma.resultadoCompeticao.delete).not.toHaveBeenCalled();

    // A propriedade é verificada através da competição do clube.
    const findArg = callsOf(prisma.resultadoCompeticao.findFirst)[0][0] as {
      where: { id: string; competicao: { clubeId: string } };
    };
    expect(findArg.where).toMatchObject({ id: "res1", competicao: { clubeId: "clube1" } });
  });

  it("apaga o resultado quando pertence ao clube e há permissão", async () => {
    mocked(prisma.resultadoCompeticao.findFirst).mockResolvedValue({
      id: "res1",
      competicaoId: "comp1",
      competicao: { escalaoId: "esc1" },
    });
    mocked(prisma.resultadoCompeticao.delete).mockResolvedValue({ id: "res1" });

    const r = await apagarResultadoExterno("res1");
    expect(r.sucesso).toBe(true);
    expect(prisma.resultadoCompeticao.delete).toHaveBeenCalledOnce();
    expect(callsOf(exigirCapacidade)[0]).toEqual(["COMPETICOES_GERIR", "esc1"]);
  });
});
