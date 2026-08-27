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
    escalao: { findFirst: vi.fn(), findMany: vi.fn() },
    // filtroExerciciosVisiveis (pré-computação por escalão partilhado) consulta membroClube.
    membroClube: { findFirst: vi.fn(), findMany: vi.fn() },
    atleta: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    atletaEscalao: { create: vi.fn(), findFirst: vi.fn() },
    exercicio: { findFirst: vi.fn(), delete: vi.fn() },
    sessaoExercicio: { count: vi.fn() },
    // F3: apagar exercício também é bloqueado se estiver em templates de sessão.
    modeloSessaoExercicio: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { criarAtleta, apagarAtleta } from "@/lib/actions/atletas";
import { apagarExercicio } from "@/lib/actions/exercicios";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade, exigirCapacidadeEmAlgumEscalao } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const CUID = "ckv9v0z1w0000abcd1234efgh";
const mocked = <T,>(fn: T) => fn as unknown as {
  mockResolvedValue: (v: unknown) => void;
  mockImplementation: (f: (...a: unknown[]) => unknown) => void;
};
const PERM_OK = { ok: true, ctx: { clube: { id: "clube1" } } };

beforeEach(() => {
  vi.clearAllMocks();
  // Por defeito, a permissão é concedida (o clube ativo é "clube1").
  mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
  mocked(exigirCapacidadeEmAlgumEscalao).mockResolvedValue(PERM_OK);
  // $transaction interativo: executa o callback com o próprio prisma mockado.
  mocked(prisma.$transaction).mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

const PARTICIPACAO_INICIAL = { escalaoId: CUID };

describe("criarAtleta (F1 — atleta do clube + participação inicial)", () => {
  it("falha sem permissão/capacidade", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await criarAtleta({
      nome: "João Silva",
      participacaoInicial: PARTICIPACAO_INICIAL,
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/permiss/i);
  });

  it("falha na validação Zod (nome curto) sem tocar na BD", async () => {
    const r = await criarAtleta({ nome: "J", participacaoInicial: PARTICIPACAO_INICIAL });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.nome).toBeTruthy();
    expect(prisma.atleta.create).not.toHaveBeenCalled();
  });

  it("falha sem participação inicial (escalão obrigatório)", async () => {
    const r = await criarAtleta({ nome: "João Silva" });
    expect(r.sucesso).toBe(false);
    expect(prisma.atleta.create).not.toHaveBeenCalled();
  });

  it("falha se não há época ativa", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue(null);
    const r = await criarAtleta({
      nome: "João Silva",
      participacaoInicial: PARTICIPACAO_INICIAL,
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/época ativa/i);
  });

  it("falha se o escalão não existe no clube", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
    mocked(prisma.escalao.findFirst).mockResolvedValue(null);
    const r = await criarAtleta({
      nome: "João Silva",
      participacaoInicial: PARTICIPACAO_INICIAL,
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/escalão/i);
  });

  it("permite número já atribuído no escalão/época — aviso não-bloqueante (secção 9)", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: CUID, clubeId: "clube1" });
    // Já existe uma participação ativa com o número 7 neste escalão/época.
    mocked(prisma.atletaEscalao.findFirst).mockResolvedValue({ id: "ae0" });
    mocked(prisma.atleta.create).mockResolvedValue({ id: "atleta1", nome: "João Silva" });
    mocked(prisma.atletaEscalao.create).mockResolvedValue({ id: "ae1" });

    const r = await criarAtleta({
      nome: "João Silva",
      participacaoInicial: { escalaoId: CUID, numero: 7 },
    });
    expect(r.sucesso).toBe(true);
    expect(prisma.atleta.create).toHaveBeenCalled();
  });

  it("recusa posição de outra modalidade (§9 — posição↔modalidade)", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
    // Escalão de FUTSAL: uma posição de futebol (AVANCADO) é inválida.
    mocked(prisma.escalao.findFirst).mockResolvedValue({
      id: CUID,
      seccao: { modalidade: "FUTSAL" },
    });

    const r = await criarAtleta({
      nome: "João Silva",
      posicoes: ["AVANCADO"],
      participacaoInicial: PARTICIPACAO_INICIAL,
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) {
      expect(r.erro).toMatch(/modalidade/i);
      expect(r.camposInvalidos?.posicoes).toBeTruthy();
    }
    expect(prisma.atleta.create).not.toHaveBeenCalled();
  });

  it("aceita posição partilhada (GUARDA_REDES) em qualquer modalidade", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
    mocked(prisma.escalao.findFirst).mockResolvedValue({
      id: CUID,
      seccao: { modalidade: "FUTEBOL" },
    });
    mocked(prisma.atletaEscalao.findFirst).mockResolvedValue(null);
    mocked(prisma.atleta.create).mockResolvedValue({ id: "atleta1", nome: "João Silva" });
    mocked(prisma.atletaEscalao.create).mockResolvedValue({ id: "ae1" });

    const r = await criarAtleta({
      nome: "João Silva",
      posicoes: ["GUARDA_REDES", "AVANCADO"],
      participacaoInicial: PARTICIPACAO_INICIAL,
    });
    expect(r.sucesso).toBe(true);
    expect(prisma.atleta.create).toHaveBeenCalled();
  });

  it("cria atleta + participação quando tudo é válido", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: CUID, clubeId: "clube1" });
    mocked(prisma.atletaEscalao.findFirst).mockResolvedValue(null);
    mocked(prisma.atleta.create).mockResolvedValue({ id: "atleta1", nome: "João Silva" });
    mocked(prisma.atletaEscalao.create).mockResolvedValue({ id: "ae1" });

    const r = await criarAtleta({
      nome: "João Silva",
      participacaoInicial: { escalaoId: CUID, numero: 7 },
    });
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados.id).toBe("atleta1");

    // Atleta: só dados do clube/pessoais. O vínculo ao escalão/época vive
    // exclusivamente em AtletaEscalao (fase 25 — colunas legadas removidas).
    const createAtleta = (prisma.atleta.create as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as {
      data: { clubeId: string; numero: number | null } & Record<string, unknown>;
    };
    expect(createAtleta.data.clubeId).toBe("clube1");
    expect(createAtleta.data.numero).toBe(7);
    expect(createAtleta.data).not.toHaveProperty("escalaoId");
    expect(createAtleta.data).not.toHaveProperty("epocaId");

    // Participação AtletaEscalao criada na mesma transação.
    const createParticipacao = (
      prisma.atletaEscalao.create as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0][0] as {
      data: { atletaId: string; escalaoId: string; epocaId: string; estado: string; numero: number | null };
    };
    expect(createParticipacao.data).toMatchObject({
      atletaId: "atleta1",
      escalaoId: CUID,
      epocaId: "ep1",
      estado: "ATIVO",
      numero: 7,
    });
  });
});

describe("apagarAtleta (soft delete)", () => {
  it("marca ativo=false em vez de apagar", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue("clube1");
    mocked(prisma.atleta.findFirst).mockResolvedValue({
      id: "atleta1",
      participacoes: [{ escalaoId: CUID }],
    });
    mocked(prisma.atleta.update).mockResolvedValue({ id: "atleta1", ativo: false });

    const r = await apagarAtleta("atleta1");
    expect(r.sucesso).toBe(true);

    const updateArg = (prisma.atleta.update as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as { data: { ativo: boolean } };
    expect(updateArg.data.ativo).toBe(false);
  });

  it("falha sem permissão em nenhum escalão do atleta", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue("clube1");
    mocked(prisma.atleta.findFirst).mockResolvedValue({
      id: "atleta1",
      participacoes: [{ escalaoId: CUID }],
    });
    mocked(exigirCapacidadeEmAlgumEscalao).mockResolvedValue({
      ok: false,
      erro: "Sem permissão neste escalão",
    });

    const r = await apagarAtleta("atleta1");
    expect(r.sucesso).toBe(false);
    expect(prisma.atleta.update).not.toHaveBeenCalled();
  });
});

describe("apagarExercicio (secção 22.7 — bloqueado se em uso)", () => {
  it("bloqueia quando o exercício está em sessões", async () => {
    mocked(prisma.exercicio.findFirst).mockResolvedValue({ id: "ex1" });
    mocked(prisma.sessaoExercicio.count).mockResolvedValue(3);

    const r = await apagarExercicio("ex1");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/sess/i);
    expect(prisma.exercicio.delete).not.toHaveBeenCalled();
  });

  it("bloqueia quando o exercício está em templates de sessão (F3)", async () => {
    mocked(prisma.exercicio.findFirst).mockResolvedValue({ id: "ex1" });
    mocked(prisma.sessaoExercicio.count).mockResolvedValue(0);
    mocked(prisma.modeloSessaoExercicio.count).mockResolvedValue(2);

    const r = await apagarExercicio("ex1");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/template/i);
    expect(prisma.exercicio.delete).not.toHaveBeenCalled();
  });

  it("apaga quando não está em uso", async () => {
    mocked(prisma.exercicio.findFirst).mockResolvedValue({ id: "ex1" });
    mocked(prisma.sessaoExercicio.count).mockResolvedValue(0);
    mocked(prisma.modeloSessaoExercicio.count).mockResolvedValue(0);
    mocked(prisma.exercicio.delete).mockResolvedValue({ id: "ex1" });

    const r = await apagarExercicio("ex1");
    expect(r.sucesso).toBe(true);
    expect(prisma.exercicio.delete).toHaveBeenCalledOnce();
  });

  it("impede o não-autor de apagar um exercício da biblioteca pessoal (F3)", async () => {
    mocked(exigirCapacidade).mockResolvedValue({
      ok: true,
      ctx: { clube: { id: "clube1" }, utilizadorId: "u2" },
    });
    mocked(prisma.exercicio.findFirst).mockResolvedValue({
      id: "ex1",
      proprietario: "TREINADOR",
      autorId: "u1",
    });

    const r = await apagarExercicio("ex1");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/autor/i);
    expect(prisma.exercicio.delete).not.toHaveBeenCalled();
  });
});
