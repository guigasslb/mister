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
}));

vi.mock("@/lib/actions/jogos", () => ({ definirCapitao: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    jogo: { findFirst: vi.fn() },
    convocatoria: { count: vi.fn(), findMany: vi.fn() },
    votacaoCapitao: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    participacaoVotacaoCapitao: { findUnique: vi.fn(), create: vi.fn() },
    votoCapitao: { create: vi.fn(), groupBy: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { apurarVotacaoCapitao } from "@/lib/votacao-capitao";
import {
  iniciarVotacaoCapitao,
  obterVotacaoCapitao,
  registarVotoCapitao,
  fecharVotacaoCapitao,
  escolherVencedorVotacaoCapitao,
  aplicarCapitaoVotacao,
} from "@/lib/actions/votacao-capitao";
import { definirCapitao } from "@/lib/actions/jogos";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const CLUBE = "clube1";
const ESCALAO = "ckv9v0z1w0000abcd1234efgh";
const JOGO = "ckv9v0z1w0002abcd1234efgh";
const VOTACAO = "ckv9v0z1w0009abcd1234efgh";
const A1 = "ckv9v0z1w0003abcd1234efgh";
const A2 = "ckv9v0z1w0004abcd1234efgh";
const A3 = "ckv9v0z1w0005abcd1234efgh";

type MockFn = {
  mockResolvedValue: (v: unknown) => void;
  mockResolvedValueOnce: (v: unknown) => MockFn;
  mockImplementation: (f: (arg: unknown) => unknown) => void;
  mock: { calls: unknown[][] };
};
const mocked = <T,>(fn: T) => fn as unknown as MockFn;
const chamadas = <T,>(fn: T) => (fn as unknown as MockFn).mock.calls;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(obterClubeIdAtual).mockResolvedValue(CLUBE);
  mocked(exigirCapacidade).mockResolvedValue({ ok: true, ctx: { clube: { id: CLUBE } } });
  mocked(prisma.jogo.findFirst).mockResolvedValue({ escalaoId: ESCALAO });
  mocked(prisma.convocatoria.count).mockResolvedValue(2);
  mocked(prisma.$queryRaw).mockResolvedValue([{ id: VOTACAO, estado: "ABERTA" }]);
  mocked(prisma.participacaoVotacaoCapitao.findUnique).mockResolvedValue(null);
  mocked(prisma.votoCapitao.groupBy).mockResolvedValue([]);
  mocked(prisma.$transaction).mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

const grupos = (pares: [string, number][]) =>
  pares.map(([votadoAtletaId, n]) => ({ votadoAtletaId, _count: { _all: n } }));

// ─── Apuramento (lógica pura) ───────────────────────────────────────────────

describe("apurarVotacaoCapitao", () => {
  it("vencedor único", () => {
    const r = apurarVotacaoCapitao([
      { atletaId: A1, votos: 1 },
      { atletaId: A2, votos: 3 },
    ]);
    expect(r).toEqual({
      tipo: "VENCEDOR",
      vencedorAtletaId: A2,
      contagem: [
        { atletaId: A2, votos: 3 },
        { atletaId: A1, votos: 1 },
      ],
    });
  });

  it("empate entre os mais votados (ordem determinística)", () => {
    const r = apurarVotacaoCapitao([
      { atletaId: A3, votos: 2 },
      { atletaId: A1, votos: 2 },
      { atletaId: A2, votos: 1 },
    ]);
    expect(r.tipo).toBe("EMPATE");
    if (r.tipo === "EMPATE") expect(r.empatados).toEqual([A1, A3]);
  });

  it("zero votos", () => {
    expect(apurarVotacaoCapitao([])).toEqual({ tipo: "SEM_VOTOS", contagem: [] });
    expect(apurarVotacaoCapitao([{ atletaId: A1, votos: 0 }]).tipo).toBe("SEM_VOTOS");
  });
});

// ─── iniciarVotacaoCapitao ──────────────────────────────────────────────────

describe("iniciarVotacaoCapitao", () => {
  it("isola por clube e exige CONVOCATORIA_GERIR no escalão do jogo", async () => {
    await iniciarVotacaoCapitao(JOGO);
    const where = (chamadas(prisma.jogo.findFirst)[0][0] as { where: unknown }).where;
    expect(where).toMatchObject({ id: JOGO, escalao: { clubeId: CLUBE } });
    expect(exigirCapacidade).toHaveBeenCalledWith("CONVOCATORIA_GERIR", ESCALAO);
  });

  it("repetir = apagar a existente e criar nova", async () => {
    const r = await iniciarVotacaoCapitao(JOGO);
    expect(r.sucesso).toBe(true);
    expect(prisma.votacaoCapitao.deleteMany).toHaveBeenCalledWith({ where: { jogoId: JOGO } });
    expect(prisma.votacaoCapitao.create).toHaveBeenCalledWith({ data: { jogoId: JOGO } });
  });

  it("conta só os titulares convocados", async () => {
    await iniciarVotacaoCapitao(JOGO);
    const where = (chamadas(prisma.convocatoria.count)[0][0] as { where: unknown }).where;
    expect(where).toEqual({ jogoId: JOGO, convocado: true, titularPrevisto: true });
  });

  it("recusa com menos de 2 titulares", async () => {
    mocked(prisma.convocatoria.count).mockResolvedValue(1);
    const r = await iniciarVotacaoCapitao(JOGO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/2 titulares/);
    expect(prisma.votacaoCapitao.deleteMany).not.toHaveBeenCalled();
    expect(prisma.votacaoCapitao.create).not.toHaveBeenCalled();
  });

  it("recusa sem titulares definidos", async () => {
    mocked(prisma.convocatoria.count).mockResolvedValue(0);
    const r = await iniciarVotacaoCapitao(JOGO);
    expect(r.sucesso).toBe(false);
    expect(prisma.votacaoCapitao.create).not.toHaveBeenCalled();
  });
});

// ─── registarVotoCapitao ────────────────────────────────────────────────────

describe("registarVotoCapitao", () => {
  it("grava participação e voto na mesma transação, sem devolver o voto", async () => {
    const r = await registarVotoCapitao(JOGO, { votanteId: A1, votadoId: A2 });
    expect(r).toEqual({ sucesso: true, dados: undefined });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.participacaoVotacaoCapitao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { votacaoId: VOTACAO, atletaId: A1 } }),
    );
    expect(prisma.votoCapitao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { votacaoId: VOTACAO, votadoAtletaId: A2 } }),
    );
  });

  it("recusa auto-voto", async () => {
    const r = await registarVotoCapitao(JOGO, { votanteId: A1, votadoId: A1 });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.votadoId).toMatch(/si próprio/);
    expect(prisma.votoCapitao.create).not.toHaveBeenCalled();
  });

  it("recusa votante ou votado não convocado", async () => {
    mocked(prisma.convocatoria.count).mockResolvedValue(1);
    const r = await registarVotoCapitao(JOGO, { votanteId: A1, votadoId: A3 });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/convocados/);
    const where = (chamadas(prisma.convocatoria.count)[0][0] as { where: unknown }).where;
    expect(where).toMatchObject({ jogoId: JOGO, convocado: true, atletaId: { in: [A1, A3] } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("recusa votado que não é titular", async () => {
    mocked(prisma.convocatoria.count).mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const r = await registarVotoCapitao(JOGO, { votanteId: A1, votadoId: A3 });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/titular/);
    const where = (chamadas(prisma.convocatoria.count)[1][0] as { where: unknown }).where;
    expect(where).toEqual({
      jogoId: JOGO,
      atletaId: A3,
      convocado: true,
      titularPrevisto: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.votoCapitao.create).not.toHaveBeenCalled();
  });

  it("votante não titular pode votar num titular", async () => {
    // 1.ª contagem: ambos convocados; 2.ª: votado (A2) é titular. O votante A1
    // não é verificado quanto à titularidade.
    mocked(prisma.convocatoria.count).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const r = await registarVotoCapitao(JOGO, { votanteId: A1, votadoId: A2 });
    expect(r.sucesso).toBe(true);
    const where = (chamadas(prisma.convocatoria.count)[1][0] as { where: { atletaId: string } })
      .where;
    expect(where.atletaId).toBe(A2);
  });

  it("recusa voto duplicado", async () => {
    mocked(prisma.participacaoVotacaoCapitao.findUnique).mockResolvedValue({ atletaId: A1 });
    const r = await registarVotoCapitao(JOGO, { votanteId: A1, votadoId: A2 });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/já votou/);
    expect(prisma.participacaoVotacaoCapitao.create).not.toHaveBeenCalled();
    expect(prisma.votoCapitao.create).not.toHaveBeenCalled();
  });

  it("recusa com a votação fechada", async () => {
    mocked(prisma.$queryRaw).mockResolvedValue([{ id: VOTACAO, estado: "FECHADA" }]);
    const r = await registarVotoCapitao(JOGO, { votanteId: A1, votadoId: A2 });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/fechada/);
    expect(prisma.votoCapitao.create).not.toHaveBeenCalled();
  });

  it("recusa sem votação iniciada", async () => {
    mocked(prisma.$queryRaw).mockResolvedValue([]);
    const r = await registarVotoCapitao(JOGO, { votanteId: A1, votadoId: A2 });
    expect(r.sucesso).toBe(false);
    expect(prisma.votoCapitao.create).not.toHaveBeenCalled();
  });
});

// ─── obterVotacaoCapitao ────────────────────────────────────────────────────

describe("obterVotacaoCapitao", () => {
  const convocatorias = [
    { titularPrevisto: true, atleta: { id: A1, nome: "Ana" } },
    { titularPrevisto: false, atleta: { id: A2, nome: "Bruno" } },
  ];

  it("ABERTA: só participação (quem votou/falta), sem contagens", async () => {
    mocked(prisma.convocatoria.findMany).mockResolvedValue(convocatorias);
    mocked(prisma.votacaoCapitao.findUnique).mockResolvedValue({
      id: VOTACAO,
      estado: "ABERTA",
      criadaEm: new Date(0),
      fechadaEm: null,
      vencedorAtletaId: null,
      participacoes: [{ atletaId: A2 }],
    });
    const r = await obterVotacaoCapitao(JOGO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados).toEqual({
      estado: "ABERTA",
      criadaEm: new Date(0),
      convocados: [
        { atletaId: A1, nome: "Ana", jaVotou: false, votavel: true },
        { atletaId: A2, nome: "Bruno", jaVotou: true, votavel: false },
      ],
    });
    expect(prisma.votoCapitao.groupBy).not.toHaveBeenCalled();
  });

  it("FECHADA: inclui apuramento e vencedor", async () => {
    mocked(prisma.convocatoria.findMany).mockResolvedValue(convocatorias);
    mocked(prisma.votacaoCapitao.findUnique).mockResolvedValue({
      id: VOTACAO,
      estado: "FECHADA",
      criadaEm: new Date(0),
      fechadaEm: new Date(1),
      vencedorAtletaId: A1,
      participacoes: [{ atletaId: A1 }, { atletaId: A2 }],
    });
    mocked(prisma.votoCapitao.groupBy).mockResolvedValue(grupos([[A1, 2]]));
    const r = await obterVotacaoCapitao(JOGO);
    expect(r.sucesso && r.dados.estado === "FECHADA" && r.dados.apuramento).toEqual({
      tipo: "VENCEDOR",
      vencedorAtletaId: A1,
      contagem: [{ atletaId: A1, votos: 2 }],
    });
  });

  it("SEM_VOTACAO: devolve os convocados", async () => {
    mocked(prisma.convocatoria.findMany).mockResolvedValue(convocatorias);
    mocked(prisma.votacaoCapitao.findUnique).mockResolvedValue(null);
    const r = await obterVotacaoCapitao(JOGO);
    expect(r.sucesso && r.dados.estado).toBe("SEM_VOTACAO");
  });
});

// ─── fecharVotacaoCapitao ───────────────────────────────────────────────────

describe("fecharVotacaoCapitao", () => {
  it("vencedor único → grava vencedorAtletaId", async () => {
    mocked(prisma.votoCapitao.groupBy).mockResolvedValue(grupos([[A1, 2], [A2, 1]]));
    const r = await fecharVotacaoCapitao(JOGO);
    expect(r.sucesso && r.dados.tipo).toBe("VENCEDOR");
    const data = (chamadas(prisma.votacaoCapitao.update)[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data).toMatchObject({ estado: "FECHADA", vencedorAtletaId: A1 });
  });

  it("empate → não grava vencedor e devolve os empatados", async () => {
    mocked(prisma.votoCapitao.groupBy).mockResolvedValue(grupos([[A1, 1], [A2, 1]]));
    const r = await fecharVotacaoCapitao(JOGO);
    expect(r.sucesso && r.dados.tipo === "EMPATE" && r.dados.empatados).toEqual([A1, A2]);
    const data = (chamadas(prisma.votacaoCapitao.update)[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data).toMatchObject({ estado: "FECHADA", vencedorAtletaId: null });
  });

  it("recusa fechar uma votação já fechada", async () => {
    mocked(prisma.$queryRaw).mockResolvedValue([{ id: VOTACAO, estado: "FECHADA" }]);
    const r = await fecharVotacaoCapitao(JOGO);
    expect(r.sucesso).toBe(false);
    expect(prisma.votacaoCapitao.update).not.toHaveBeenCalled();
  });
});

// ─── escolherVencedorVotacaoCapitao ─────────────────────────────────────────

describe("escolherVencedorVotacaoCapitao", () => {
  beforeEach(() => {
    mocked(prisma.votacaoCapitao.findUnique).mockResolvedValue({
      id: VOTACAO,
      estado: "FECHADA",
      vencedorAtletaId: null,
    });
    mocked(prisma.votoCapitao.groupBy).mockResolvedValue(grupos([[A1, 2], [A2, 2], [A3, 1]]));
  });

  it("aceita um dos empatados", async () => {
    const r = await escolherVencedorVotacaoCapitao(JOGO, { atletaId: A2 });
    expect(r.sucesso).toBe(true);
    expect(prisma.votacaoCapitao.update).toHaveBeenCalledWith({
      where: { id: VOTACAO },
      data: { vencedorAtletaId: A2 },
    });
  });

  it("recusa empatado que já não é titular", async () => {
    mocked(prisma.convocatoria.count).mockResolvedValue(0);
    const r = await escolherVencedorVotacaoCapitao(JOGO, { atletaId: A2 });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/já não é titular/);
    const where = (chamadas(prisma.convocatoria.count)[0][0] as { where: unknown }).where;
    expect(where).toEqual({
      jogoId: JOGO,
      atletaId: A2,
      convocado: true,
      titularPrevisto: true,
    });
    expect(prisma.votacaoCapitao.update).not.toHaveBeenCalled();
  });

  it("recusa atleta fora dos empatados", async () => {
    const r = await escolherVencedorVotacaoCapitao(JOGO, { atletaId: A3 });
    expect(r.sucesso).toBe(false);
    expect(prisma.votacaoCapitao.update).not.toHaveBeenCalled();
  });

  it("recusa com a votação aberta", async () => {
    mocked(prisma.votacaoCapitao.findUnique).mockResolvedValue({
      id: VOTACAO,
      estado: "ABERTA",
      vencedorAtletaId: null,
    });
    const r = await escolherVencedorVotacaoCapitao(JOGO, { atletaId: A1 });
    expect(r.sucesso).toBe(false);
    expect(prisma.votoCapitao.groupBy).not.toHaveBeenCalled();
  });
});

// ─── aplicarCapitaoVotacao ──────────────────────────────────────────────────

describe("aplicarCapitaoVotacao", () => {
  it("reutiliza definirCapitao com o eleito", async () => {
    mocked(prisma.votacaoCapitao.findUnique).mockResolvedValue({
      estado: "FECHADA",
      vencedorAtletaId: A1,
    });
    mocked(definirCapitao).mockResolvedValue({ sucesso: true, dados: undefined });
    const r = await aplicarCapitaoVotacao(JOGO);
    expect(r.sucesso).toBe(true);
    expect(definirCapitao).toHaveBeenCalledWith(JOGO, A1);
  });

  it("recusa se o eleito já não é titular", async () => {
    mocked(prisma.votacaoCapitao.findUnique).mockResolvedValue({
      estado: "FECHADA",
      vencedorAtletaId: A1,
    });
    mocked(prisma.convocatoria.count).mockResolvedValue(0);
    const r = await aplicarCapitaoVotacao(JOGO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/já não é titular/);
    expect(definirCapitao).not.toHaveBeenCalled();
  });

  it("recusa sem eleito (empate por decidir)", async () => {
    mocked(prisma.votacaoCapitao.findUnique).mockResolvedValue({
      estado: "FECHADA",
      vencedorAtletaId: null,
    });
    const r = await aplicarCapitaoVotacao(JOGO);
    expect(r.sucesso).toBe(false);
    expect(definirCapitao).not.toHaveBeenCalled();
  });
});
