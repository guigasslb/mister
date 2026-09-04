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
    jogo: { findFirst: vi.fn(), update: vi.fn() },
    eventoJogo: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    atletaEscalao: { count: vi.fn() },
    convocatoria: { upsert: vi.fn(), findFirst: vi.fn() },
    observacaoAdversario: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { revalidatePath } from "next/cache";
import {
  definirPlanoTatico,
  registarEventoJogo,
  removerEventoJogo,
  listarEventosJogo,
} from "@/lib/actions/jogos";
import { listarObservacoes, criarObservacao } from "@/lib/actions/scouting";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerEscalao } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const CLUBE = "clube1";
const ESCALAO = "ckv9v0z1w0000abcd1234efgh";
const EPOCA = "ckv9v0z1w0001abcd1234efgh";
const JOGO = "ckv9v0z1w0002abcd1234efgh";
const A1 = "ckv9v0z1w0003abcd1234efgh";
const A2 = "ckv9v0z1w0004abcd1234efgh";
const EVENTO = "ckv9v0z1w0005abcd1234efgh";

type MockFn = {
  mockResolvedValue: (v: unknown) => void;
  mockImplementation: (f: (arg: unknown) => unknown) => void;
  mock: { calls: unknown[][] };
};
const mocked = <T,>(fn: T) => fn as unknown as MockFn;
const chamadas = <T,>(fn: T) => (fn as unknown as MockFn).mock.calls;

const PERM_OK = { ok: true, ctx: { clube: { id: CLUBE } } };
const JOGO_BASE = { id: JOGO, escalaoId: ESCALAO, epocaId: EPOCA };

beforeEach(() => {
  vi.clearAllMocks();
  mocked(obterClubeIdAtual).mockResolvedValue(CLUBE);
  mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
  mocked(podeLerEscalao).mockResolvedValue(true);
  mocked(prisma.eventoJogo.count).mockResolvedValue(0);
  mocked(prisma.jogo.update).mockResolvedValue({ id: JOGO });
  // $transaction: forma array [...] (usada no plano tático) e forma interativa (cb).
  mocked(prisma.$transaction).mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

// ─── definirPlanoTatico ──────────────────────────────────────────────────────

describe("definirPlanoTatico (F5 — plano de dia de jogo)", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await definirPlanoTatico(JOGO, [{ convocadoId: A1 }]);
    expect(r.sucesso).toBe(false);
  });

  it("isola por clube via jogo (where) e erra quando não pertence", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(null);
    const r = await definirPlanoTatico(JOGO, [{ convocadoId: A1 }]);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/jogo/i);
    const where = (chamadas(prisma.jogo.findFirst)[0][0] as {
      where: Record<string, unknown>;
    }).where;
    expect(where).toMatchObject({ id: JOGO, escalao: { clubeId: CLUBE } });
  });

  it("falha sem capacidade CONVOCATORIA_GERIR", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BASE);
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await definirPlanoTatico(JOGO, [{ convocadoId: A1 }]);
    expect(r.sucesso).toBe(false);
    expect(chamadas(exigirCapacidade)[0]).toEqual(["CONVOCATORIA_GERIR", ESCALAO]);
  });

  it("array vazio é aceite sem tocar na BD", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BASE);
    const r = await definirPlanoTatico(JOGO, []);
    expect(r.sucesso).toBe(true);
    expect(chamadas(prisma.atletaEscalao.count)).toHaveLength(0);
    expect(chamadas(prisma.$transaction)).toHaveLength(0);
  });

  it("rejeita atletas fora do escalão/época do jogo", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BASE);
    // Pedidos 2, válidos só 1.
    mocked(prisma.atletaEscalao.count).mockResolvedValue(1);
    const r = await definirPlanoTatico(JOGO, [
      { convocadoId: A1 },
      { convocadoId: A2 },
    ]);
    expect(r.sucesso).toBe(false);
    expect(chamadas(prisma.convocatoria.upsert)).toHaveLength(0);
  });

  it("faz upsert de posicaoPrevista e titularPrevisto por convocado", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BASE);
    mocked(prisma.atletaEscalao.count).mockResolvedValue(2);
    mocked(prisma.convocatoria.upsert).mockResolvedValue({});
    const r = await definirPlanoTatico(JOGO, [
      { convocadoId: A1, posicaoPrevista: "PIVO", titularPrevisto: true },
      { convocadoId: A2, posicaoPrevista: "GUARDA_REDES", titularPrevisto: false },
    ]);
    expect(r.sucesso).toBe(true);
    expect(chamadas(prisma.convocatoria.upsert)).toHaveLength(2);

    const primeiro = chamadas(prisma.convocatoria.upsert)[0][0] as {
      where: { jogoId_atletaId: { jogoId: string; atletaId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(primeiro.where.jogoId_atletaId).toEqual({ jogoId: JOGO, atletaId: A1 });
    expect(primeiro.update).toEqual({ posicaoPrevista: "PIVO", titularPrevisto: true });
    expect(primeiro.create).toMatchObject({
      jogoId: JOGO,
      atletaId: A1,
      convocado: true,
      posicaoPrevista: "PIVO",
      titularPrevisto: true,
    });
  });

  it("aplica valores por omissão (posição null, titular false) e revalida o path", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BASE);
    mocked(prisma.atletaEscalao.count).mockResolvedValue(1);
    mocked(prisma.convocatoria.upsert).mockResolvedValue({});
    const r = await definirPlanoTatico(JOGO, [{ convocadoId: A1 }]);
    expect(r.sucesso).toBe(true);

    const call = chamadas(prisma.convocatoria.upsert)[0][0] as {
      update: Record<string, unknown>;
    };
    expect(call.update).toEqual({ posicaoPrevista: null, titularPrevisto: false });
    expect(chamadas(revalidatePath)[0][0]).toBe(`/jogos/${JOGO}`);
  });
});

// ─── registarEventoJogo ──────────────────────────────────────────────────────

describe("registarEventoJogo (F5 — modo ao vivo)", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await registarEventoJogo({ jogoId: JOGO, parte: 1, tipo: "GOLO" });
    expect(r.sucesso).toBe(false);
  });

  it("falha na validação Zod sem tocar na BD", async () => {
    const r = await registarEventoJogo({ jogoId: JOGO, parte: 3, tipo: "GOLO" });
    expect(r.sucesso).toBe(false);
    expect(chamadas(prisma.eventoJogo.create)).toHaveLength(0);
  });

  it("isola por clube via jogo (where) e erra quando não pertence", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(null);
    const r = await registarEventoJogo({ jogoId: JOGO, parte: 1, tipo: "GOLO" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/jogo/i);
    const where = (chamadas(prisma.jogo.findFirst)[0][0] as {
      where: Record<string, unknown>;
    }).where;
    expect(where).toMatchObject({ id: JOGO, escalao: { clubeId: CLUBE } });
  });

  it("falha sem capacidade ESTATISTICAS_GERIR", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BASE);
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await registarEventoJogo({ jogoId: JOGO, parte: 1, tipo: "GOLO" });
    expect(r.sucesso).toBe(false);
    expect(chamadas(exigirCapacidade)[0]).toEqual(["ESTATISTICAS_GERIR", ESCALAO]);
    expect(chamadas(prisma.eventoJogo.create)).toHaveLength(0);
  });

  it("rejeita atleta que não pertence ao jogo (nem convocatória nem participação)", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BASE);
    mocked(prisma.convocatoria.findFirst).mockResolvedValue(null);
    mocked(prisma.atletaEscalao.count).mockResolvedValue(0);
    const r = await registarEventoJogo({
      jogoId: JOGO,
      parte: 1,
      tipo: "GOLO",
      atletaId: A1,
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não pertence/i);
    expect(chamadas(prisma.eventoJogo.create)).toHaveLength(0);
    // Isolamento por clube reforçado na verificação de participação.
    const countWhere = (chamadas(prisma.atletaEscalao.count)[0][0] as {
      where: Record<string, unknown>;
    }).where;
    expect(countWhere).toMatchObject({
      atletaId: A1,
      escalaoId: ESCALAO,
      epocaId: EPOCA,
      atleta: { clubeId: CLUBE, ativo: true },
    });
  });

  it("aceita atleta convocado (via convocatória) sem consultar participação", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BASE);
    mocked(prisma.convocatoria.findFirst).mockResolvedValue({ id: "c1" });
    mocked(prisma.eventoJogo.create).mockResolvedValue({ id: EVENTO });
    const r = await registarEventoJogo({
      jogoId: JOGO,
      parte: 1,
      tipo: "GOLO",
      atletaId: A1,
    });
    expect(r.sucesso).toBe(true);
    expect(chamadas(prisma.atletaEscalao.count)).toHaveLength(0);
  });

  it("persiste o bloco de tempo e liga ao jogo correcto", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BASE);
    mocked(prisma.convocatoria.findFirst).mockResolvedValue({ id: "c1" });
    mocked(prisma.eventoJogo.create).mockResolvedValue({ id: EVENTO });
    const r = await registarEventoJogo({
      jogoId: JOGO,
      parte: 2,
      tipo: "SUBSTITUICAO",
      bloco: "BLOCO_10MIN",
      minuto: 25,
      atletaId: A1,
      atletaSecundarioId: A2,
    });
    expect(r.sucesso).toBe(true);
    const data = (chamadas(prisma.eventoJogo.create)[0][0] as {
      data: Record<string, unknown>;
    }).data;
    expect(data.jogoId).toBe(JOGO);
    expect(data.bloco).toBe("BLOCO_10MIN");
    expect(data.minuto).toBe(25);
    expect(data.atletaId).toBe(A1);
    expect(data.atletaSecundarioId).toBe(A2);
    expect(chamadas(revalidatePath)[0][0]).toBe(`/jogos/${JOGO}`);
  });

  it("normaliza campos opcionais ausentes para null", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BASE);
    mocked(prisma.eventoJogo.create).mockResolvedValue({ id: EVENTO });
    await registarEventoJogo({ jogoId: JOGO, parte: 1, tipo: "TIMEOUT" });
    const data = (chamadas(prisma.eventoJogo.create)[0][0] as {
      data: Record<string, unknown>;
    }).data;
    expect(data.bloco).toBeNull();
    expect(data.minuto).toBeNull();
    expect(data.atletaId).toBeNull();
    expect(data.atletaSecundarioId).toBeNull();
  });
});

// ─── removerEventoJogo ───────────────────────────────────────────────────────

describe("removerEventoJogo (F5 — isolamento por clube)", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await removerEventoJogo(EVENTO);
    expect(r.sucesso).toBe(false);
  });

  it("erra quando o evento não pertence ao clube (where via jogo)", async () => {
    mocked(prisma.eventoJogo.findFirst).mockResolvedValue(null);
    const r = await removerEventoJogo(EVENTO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/evento/i);
    const where = (chamadas(prisma.eventoJogo.findFirst)[0][0] as {
      where: Record<string, unknown>;
    }).where;
    expect(where).toMatchObject({ id: EVENTO, jogo: { escalao: { clubeId: CLUBE } } });
    expect(chamadas(prisma.eventoJogo.delete)).toHaveLength(0);
  });

  it("falha sem capacidade ESTATISTICAS_GERIR", async () => {
    mocked(prisma.eventoJogo.findFirst).mockResolvedValue({
      id: EVENTO,
      jogoId: JOGO,
      jogo: { escalaoId: ESCALAO },
    });
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await removerEventoJogo(EVENTO);
    expect(r.sucesso).toBe(false);
    expect(chamadas(prisma.eventoJogo.delete)).toHaveLength(0);
  });

  it("remove o evento e revalida o path do jogo", async () => {
    mocked(prisma.eventoJogo.findFirst).mockResolvedValue({
      id: EVENTO,
      jogoId: JOGO,
      jogo: { escalaoId: ESCALAO },
    });
    mocked(prisma.eventoJogo.delete).mockResolvedValue({ id: EVENTO });
    const r = await removerEventoJogo(EVENTO);
    expect(r.sucesso).toBe(true);
    expect(chamadas(prisma.eventoJogo.delete)[0][0]).toEqual({ where: { id: EVENTO } });
    expect(chamadas(revalidatePath)[0][0]).toBe(`/jogos/${JOGO}`);
  });
});

// ─── listarEventosJogo ───────────────────────────────────────────────────────

describe("listarEventosJogo (F5 — ordenação e filtro)", () => {
  it("erra quando o jogo não pertence ao clube", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(null);
    const r = await listarEventosJogo(JOGO);
    expect(r.sucesso).toBe(false);
  });

  it("erra quando o escalão do jogo não é legível", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BASE);
    mocked(podeLerEscalao).mockResolvedValue(false);
    const r = await listarEventosJogo(JOGO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/permiss/i);
  });

  it("filtra pelo jogo e ordena por minuto e depois por ordem de registo", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BASE);
    mocked(prisma.eventoJogo.findMany).mockResolvedValue([]);
    const r = await listarEventosJogo(JOGO);
    expect(r.sucesso).toBe(true);
    const args = chamadas(prisma.eventoJogo.findMany)[0][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
    };
    expect(args.where).toEqual({ jogoId: JOGO });
    expect(args.orderBy).toEqual([{ minuto: "asc" }, { criadoEm: "asc" }]);
  });
});

// ─── scouting ligado ao jogo ─────────────────────────────────────────────────

describe("listarObservacoes (F5 — scouting por jogo)", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await listarObservacoes(JOGO);
    expect(r.sucesso).toBe(false);
  });

  it("com jogoId filtra apenas as observações desse jogo", async () => {
    mocked(prisma.observacaoAdversario.findMany).mockResolvedValue([]);
    const r = await listarObservacoes(JOGO);
    expect(r.sucesso).toBe(true);
    const where = (chamadas(prisma.observacaoAdversario.findMany)[0][0] as {
      where: Record<string, unknown>;
    }).where;
    expect(where).toEqual({ clubeId: CLUBE, jogoId: JOGO });
  });

  it("sem jogoId devolve todas as observações do clube (sem filtro de jogo)", async () => {
    mocked(prisma.observacaoAdversario.findMany).mockResolvedValue([]);
    await listarObservacoes();
    const where = (chamadas(prisma.observacaoAdversario.findMany)[0][0] as {
      where: Record<string, unknown>;
    }).where;
    expect(where).toEqual({ clubeId: CLUBE });
    expect("jogoId" in where).toBe(false);
  });
});

describe("criarObservacao (F5 — ligação ao jogo)", () => {
  it("falha sem capacidade SCOUTING_GERIR", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await criarObservacao({ equipa: "SL Benfica", jogoId: JOGO });
    expect(r.sucesso).toBe(false);
    expect(chamadas(prisma.observacaoAdversario.create)).toHaveLength(0);
  });

  it("erra quando o jogo ligado não pertence ao clube", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(null);
    const r = await criarObservacao({ equipa: "SL Benfica", jogoId: JOGO });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/jogo/i);
    const where = (chamadas(prisma.jogo.findFirst)[0][0] as {
      where: Record<string, unknown>;
    }).where;
    expect(where).toMatchObject({ id: JOGO, escalao: { clubeId: CLUBE } });
    expect(chamadas(prisma.observacaoAdversario.create)).toHaveLength(0);
  });

  it("persiste a ligação ao jogo quando este pertence ao clube", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue({ id: JOGO });
    mocked(prisma.observacaoAdversario.create).mockResolvedValue({ id: "obs1" });
    const r = await criarObservacao({ equipa: "SL Benfica", jogoId: JOGO });
    expect(r.sucesso).toBe(true);
    const data = (chamadas(prisma.observacaoAdversario.create)[0][0] as {
      data: Record<string, unknown>;
    }).data;
    expect(data.jogoId).toBe(JOGO);
    expect(data.clubeId).toBe(CLUBE);
    expect(data.equipa).toBe("SL Benfica");
  });

  it("observação avulsa (sem jogoId) não valida jogo e grava jogoId null", async () => {
    mocked(prisma.observacaoAdversario.create).mockResolvedValue({ id: "obs1" });
    const r = await criarObservacao({ equipa: "Sporting CP" });
    expect(r.sucesso).toBe(true);
    expect(chamadas(prisma.jogo.findFirst)).toHaveLength(0);
    const data = (chamadas(prisma.observacaoAdversario.create)[0][0] as {
      data: Record<string, unknown>;
    }).data;
    expect(data.jogoId).toBeNull();
  });
});
