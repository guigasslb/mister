import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
// Nota: criarAtleta e apagarAtleta (soft-delete) estão cobertos em tests/actions.test.ts
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
    atleta: { findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn(), update: vi.fn() },
    atletaEscalao: { findMany: vi.fn() },
    convocatoria: { count: vi.fn() },
    estatisticaAtleta: { findMany: vi.fn() },
    sessao: { count: vi.fn() },
    presenca: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import {
  apagarAtletaDefinitivamente,
  obterEstatisticasAtleta,
  listarAtletas,
  toggleAtivoAtleta,
} from "@/lib/actions/atletas";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import {
  exigirCapacidadeEmAlgumEscalao,
  podeLerAlgumEscalao,
  podeLerEscalao,
  escaloesLegiveis,
} from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const CUID = "ckv9v0z1w0000abcd1234efgh";
const ESC_ID = "ckv9v0z1w0000abcd1234efgi";

const mocked = <T,>(fn: T) => fn as unknown as {
  mockResolvedValue: (v: unknown) => void;
  mockImplementation: (f: (...a: unknown[]) => unknown) => void;
};

const calls = (fn: unknown) => (fn as { mock: { calls: unknown[][] } }).mock.calls;

const PERM_OK = { ok: true, ctx: { clube: { id: "clube1" } } };

const ATLETA_BD = {
  id: CUID,
  nome: "João Silva",
  posicoes: [],
  participacoes: [{ escalaoId: ESC_ID }],
  _count: { estatisticas: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(obterClubeIdAtual).mockResolvedValue("clube1");
  mocked(obterEpocaAtiva).mockResolvedValue({
    id: "ep1",
    nome: "2026/27",
    dataInicio: new Date("2026-09-01"),
    dataFim: new Date("2027-06-30"),
  });
  mocked(exigirCapacidadeEmAlgumEscalao).mockResolvedValue(PERM_OK);
  mocked(podeLerAlgumEscalao).mockResolvedValue(true);
  mocked(escaloesLegiveis).mockResolvedValue("TODOS");
  mocked(prisma.atleta.findFirst).mockResolvedValue(ATLETA_BD);
  mocked(prisma.atleta.delete).mockResolvedValue({ id: CUID });
  mocked(prisma.convocatoria.count).mockResolvedValue(0);
  mocked(prisma.estatisticaAtleta.findMany).mockResolvedValue([]);
  mocked(prisma.sessao.count).mockResolvedValue(0);
  mocked(prisma.presenca.count).mockResolvedValue(0);
});

// ─── apagarAtletaDefinitivamente (P1.3 — RGPD) ───────────────────────────────

describe("apagarAtletaDefinitivamente (P1.3 — RGPD, hard-delete)", () => {
  it("falha com atletaId inválido (não é cuid)", async () => {
    const r = await apagarAtletaDefinitivamente("nao-e-um-cuid");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.atletaId).toBeTruthy();
    expect(prisma.atleta.delete).not.toHaveBeenCalled();
  });

  it("falha sem clube ativo (não autenticado)", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await apagarAtletaDefinitivamente(CUID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não autenticado/i);
    expect(prisma.atleta.delete).not.toHaveBeenCalled();
  });

  it("falha se o atleta não pertence ao clube (isolamento multi-tenant)", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue(null);
    const r = await apagarAtletaDefinitivamente(CUID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrado/i);
    expect(prisma.atleta.delete).not.toHaveBeenCalled();
  });

  it("bloqueia hard-delete quando o atleta tem estatísticas (proteção de dados desportivos)", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue({
      ...ATLETA_BD,
      _count: { estatisticas: 5 }, // tem estatísticas
    });
    const r = await apagarAtletaDefinitivamente(CUID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/estatísticas/i);
    expect(prisma.atleta.delete).not.toHaveBeenCalled();
  });

  it("falha sem permissão de gestão de plantel", async () => {
    mocked(exigirCapacidadeEmAlgumEscalao).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await apagarAtletaDefinitivamente(CUID);
    expect(r.sucesso).toBe(false);
    expect(prisma.atleta.delete).not.toHaveBeenCalled();
  });

  it("executa hard-delete quando atleta sem estatísticas e com permissão", async () => {
    const r = await apagarAtletaDefinitivamente(CUID);
    expect(r.sucesso).toBe(true);
    expect(prisma.atleta.delete).toHaveBeenCalledOnce();
    const arg = calls(prisma.atleta.delete)[0][0] as { where: { id: string } };
    expect(arg.where.id).toBe(CUID);
  });
});

// ─── obterEstatisticasAtleta ──────────────────────────────────────────────────

describe("obterEstatisticasAtleta", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await obterEstatisticasAtleta(CUID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não autenticado/i);
  });

  it("falha sem época ativa", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue(null);
    const r = await obterEstatisticasAtleta(CUID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/época/i);
  });

  it("falha se o atleta não pertence ao clube", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue(null);
    const r = await obterEstatisticasAtleta(CUID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrado/i);
  });

  it("devolve estatísticas agregadas corretas para atleta sem jogos (caso edge: zeros)", async () => {
    // Atleta com participação ativa mas sem convocatórias nem presenças.
    mocked(prisma.atleta.findFirst).mockResolvedValue({
      ...ATLETA_BD,
      posicoes: ["FIXO"],
      criadoEm: new Date("2026-09-01"),
      dataIngresso: null,
      participacoes: [{ escalaoId: ESC_ID, tipo: "PRINCIPAL" }],
    });
    mocked(prisma.convocatoria.count).mockResolvedValue(0);
    mocked(prisma.estatisticaAtleta.findMany).mockResolvedValue([]);
    mocked(prisma.sessao.count).mockResolvedValue(10);
    mocked(prisma.presenca.count).mockResolvedValue(0);

    const r = await obterEstatisticasAtleta(CUID);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados.totalGolos).toBe(0);
      expect(r.dados.jogosConvocado).toBe(0);
      expect(r.dados.taxaPresenca).toBe(0);
    }
  });

  it("devolve 100% de presença quando esteve em todas as sessões", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue({
      ...ATLETA_BD,
      posicoes: ["FIXO"],
      criadoEm: new Date("2026-09-01"),
      dataIngresso: new Date("2026-09-01"),
      participacoes: [{ escalaoId: ESC_ID, tipo: "PRINCIPAL" }],
    });
    mocked(prisma.convocatoria.count).mockResolvedValue(5);
    mocked(prisma.estatisticaAtleta.findMany).mockResolvedValue([]);
    mocked(prisma.sessao.count).mockResolvedValue(20);
    mocked(prisma.presenca.count).mockResolvedValue(20);

    const r = await obterEstatisticasAtleta(CUID);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados.taxaPresenca).toBe(1); // ratio 0-1, não percentagem
    }
  });

  it("consulta Prisma filtrando pelo clube (isolamento multi-tenant)", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue({
      ...ATLETA_BD,
      posicoes: [],
      criadoEm: new Date("2026-09-01"),
      dataIngresso: null,
      participacoes: [{ escalaoId: ESC_ID, tipo: "PRINCIPAL" }],
    });
    await obterEstatisticasAtleta(CUID);
    const arg = calls(prisma.atleta.findFirst)[0][0] as { where: Record<string, unknown> };
    expect(arg.where.clubeId).toBe("clube1");
    expect(arg.where.id).toBe(CUID);
  });
});

// ─── listarAtletas (Fix 2 — filtro por secção + modalidade) ──────────────────

describe("listarAtletas (agrupamento por secção/modalidade — §8.5)", () => {
  const ATLETA_ROW = {
    id: CUID,
    nome: "João Silva",
    dataNascimento: null,
    posicoes: [],
    observacoes: null,
    fotoUrl: null,
    ativo: true,
    inscrito: false,
    dataIngresso: null,
    encarregadoNome: null,
    encarregadoContacto: null,
    encarregadoEmail: null,
    clubeId: "clube1",
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    participacoes: [
      {
        id: "ae1",
        escalaoId: ESC_ID,
        tipo: "PRINCIPAL",
        estado: "ATIVO",
        numero: 7,
        dataInicio: new Date(),
        dataFim: null,
        escalao: { nome: "Sub-15", seccao: { modalidade: "FUTSAL" } },
      },
    ],
  };

  it("aplica o filtro de secção quando seccaoId é indicado", async () => {
    mocked(prisma.atleta.findMany).mockResolvedValue([ATLETA_ROW]);
    const r = await listarAtletas(undefined, undefined, "sec1");
    expect(r.sucesso).toBe(true);

    const arg = calls(prisma.atleta.findMany)[0][0] as {
      where: { participacoes: { some: Record<string, unknown> } };
    };
    expect(arg.where.participacoes.some).toMatchObject({
      escalao: { seccaoId: "sec1" },
    });
  });

  it("não aplica filtro de secção quando seccaoId é omitido", async () => {
    mocked(prisma.atleta.findMany).mockResolvedValue([ATLETA_ROW]);
    await listarAtletas();

    const arg = calls(prisma.atleta.findMany)[0][0] as {
      where: { participacoes: { some: Record<string, unknown> } };
    };
    expect(arg.where.participacoes.some).not.toHaveProperty("escalao");
  });

  it("inclui a modalidade da secção em cada participação (para agrupar na UI)", async () => {
    mocked(prisma.atleta.findMany).mockResolvedValue([ATLETA_ROW]);
    const r = await listarAtletas();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados[0].participacoes[0].modalidade).toBe("FUTSAL");
      expect(r.dados[0].participacaoContexto?.modalidade).toBe("FUTSAL");
    }
  });

  it("filtra só atletas ativos por defeito (incluirInativos ausente)", async () => {
    mocked(prisma.atleta.findMany).mockResolvedValue([ATLETA_ROW]);
    await listarAtletas();
    const arg = calls(prisma.atleta.findMany)[0][0] as { where: { ativo?: boolean } };
    expect(arg.where.ativo).toBe(true);
  });

  it("inclui inativos quando incluirInativos = true (sem filtro ativo)", async () => {
    mocked(prisma.atleta.findMany).mockResolvedValue([ATLETA_ROW]);
    await listarAtletas(undefined, undefined, undefined, true);
    const arg = calls(prisma.atleta.findMany)[0][0] as { where: Record<string, unknown> };
    expect(arg.where).not.toHaveProperty("ativo");
  });

  it("aplica o filtro ativo ao atleta na ramificação por escalão", async () => {
    mocked(podeLerEscalao).mockResolvedValue(true);
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([]);
    await listarAtletas(ESC_ID);
    const arg = calls(prisma.atletaEscalao.findMany)[0][0] as {
      where: { atleta: { ativo?: boolean; clubeId: string } };
    };
    expect(arg.where.atleta.ativo).toBe(true);
  });

  it("na ramificação por escalão, incluirInativos remove o filtro ativo do atleta", async () => {
    mocked(podeLerEscalao).mockResolvedValue(true);
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([]);
    await listarAtletas(ESC_ID, undefined, undefined, true);
    const arg = calls(prisma.atletaEscalao.findMany)[0][0] as {
      where: { atleta: Record<string, unknown> };
    };
    expect(arg.where.atleta).not.toHaveProperty("ativo");
    expect(arg.where.atleta.clubeId).toBe("clube1");
  });
});

// ─── toggleAtivoAtleta (secção 8 — período experimental/saída) ────────────────

describe("toggleAtivoAtleta", () => {
  it("falha com atletaId inválido (não é cuid) sem tocar na BD", async () => {
    const r = await toggleAtivoAtleta("nao-e-cuid");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.atletaId).toBeTruthy();
    expect(prisma.atleta.update).not.toHaveBeenCalled();
  });

  it("falha sem clube ativo (não autenticado)", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await toggleAtivoAtleta(CUID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não autenticado/i);
    expect(prisma.atleta.update).not.toHaveBeenCalled();
  });

  it("falha se o atleta não pertence ao clube (isolamento multi-tenant)", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue(null);
    const r = await toggleAtivoAtleta(CUID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrado/i);
    expect(prisma.atleta.update).not.toHaveBeenCalled();
  });

  it("falha sem permissão de gestão de plantel", async () => {
    mocked(exigirCapacidadeEmAlgumEscalao).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await toggleAtivoAtleta(CUID);
    expect(r.sucesso).toBe(false);
    expect(prisma.atleta.update).not.toHaveBeenCalled();
  });

  it("desativa um atleta que está ativo", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue({ ...ATLETA_BD, ativo: true });
    const r = await toggleAtivoAtleta(CUID);
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.atleta.update)[0][0] as {
      where: { id: string };
      data: { ativo: boolean };
    };
    expect(arg.where.id).toBe(CUID);
    expect(arg.data.ativo).toBe(false);
  });

  it("reativa um atleta que está inativo", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue({ ...ATLETA_BD, ativo: false });
    const r = await toggleAtivoAtleta(CUID);
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.atleta.update)[0][0] as { data: { ativo: boolean } };
    expect(arg.data.ativo).toBe(true);
  });
});
