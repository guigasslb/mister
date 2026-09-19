import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/epoca-context", () => ({
  obterClubeIdAtual: vi.fn(),
  obterEpocaAtiva: vi.fn(),
  COOKIE_EPOCA: "epoca_ativa",
}));
vi.mock("@/lib/permissoes", () => ({
  exigirCapacidade: vi.fn(),
  podeLerEscalao: vi.fn(),
  escaloesLegiveis: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    jogo: { findFirst: vi.fn(), update: vi.fn() },
    convocatoria: { findMany: vi.fn() },
    sessaoJogoAoVivo: { update: vi.fn() },
    eventoJogo: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { sincronizarJogoAoVivo } from "@/lib/actions/jogo-ao-vivo";
import { recalcularResultadoJogo } from "@/lib/placar-jogo";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const ESC_ID = "ckv9v0z1w0000abcd1234efga";
const JOGO_ID = "ckv9v0z1w0000abcd1234efgb";
const A = "ckv9v0z1w0000abcd1234efgd"; // autor do golo
const B = "ckv9v0z1w0000abcd1234efge"; // assistente

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockImplementation: (f: (...a: unknown[]) => unknown) => void;
  };

const calls = (fn: unknown) => (fn as { mock: { calls: unknown[][] } }).mock.calls;

const SESSAO = {
  jogoId: JOGO_ID,
  numeroPartes: 2,
  duracaoParteMins: 20,
  estado: "EM_CURSO",
  parteAtual: 1,
  segundosDecorridos: 0,
  aCorrerDesde: null,
};

const JOGO = {
  id: JOGO_ID,
  epocaId: "ep1",
  escalaoId: ESC_ID,
  formato: "FUTSAL_5",
  modalidadeAtividade: null,
  numeroPartes: 2,
  escalao: { seccao: { modalidade: "FUTSAL" } },
  sessaoAoVivo: SESSAO,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(obterClubeIdAtual).mockResolvedValue("clube1");
  mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
  mocked(exigirCapacidade).mockResolvedValue({ ok: true });
  mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO);
  mocked(prisma.jogo.update).mockResolvedValue({ id: JOGO_ID });
  mocked(prisma.sessaoJogoAoVivo.update).mockResolvedValue(SESSAO);
  mocked(prisma.eventoJogo.findMany).mockResolvedValue([]); // reconciliação: sem eventos de cronómetro
  mocked(prisma.eventoJogo.createMany).mockResolvedValue({ count: 0 });
  // Placar derivado da contagem de eventos GOLO / GOLO_SOFRIDO.
  mocked(prisma.eventoJogo.count).mockImplementation((args: unknown) => {
    const where = (args as { where: { tipo: string } }).where;
    return Promise.resolve(where.tipo === "GOLO" ? 2 : 1);
  });
  mocked(prisma.$transaction).mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

// Extrai as linhas passadas ao createMany (idempotente por clientEventoId).
function linhasCriadas() {
  const chamada = calls(prisma.eventoJogo.createMany)[0];
  return (chamada[0] as { data: Array<Record<string, unknown>>; skipDuplicates: boolean });
}

describe("sincronizarJogoAoVivo — captura ao vivo (Fase B)", () => {
  it("persiste golo com atletaSecundarioId e materializa a ASSISTÊNCIA autónoma", async () => {
    const res = await sincronizarJogoAoVivo(JOGO_ID, [
      {
        tipo: "GOLO",
        atletaId: A,
        atletaSecundarioId: B,
        segundoJogo: 300,
        parte: 1,
        clientEventoId: "evt-golo-1",
      },
    ]);

    expect(res.sucesso).toBe(true);
    const { data, skipDuplicates } = linhasCriadas();
    expect(skipDuplicates).toBe(true); // idempotência RN-JV-8

    const golo = data.find((l) => l.tipo === "GOLO");
    const assist = data.find((l) => l.tipo === "ASSISTENCIA");
    expect(golo).toMatchObject({
      atletaId: A,
      atletaSecundarioId: B,
      clientEventoId: "evt-golo-1",
    });
    expect(assist).toMatchObject({
      atletaId: B,
      atletaSecundarioId: null,
      clientEventoId: "evt-golo-1::assist",
    });
  });

  it("golo sem assistente NÃO materializa ASSISTÊNCIA", async () => {
    await sincronizarJogoAoVivo(JOGO_ID, [
      { tipo: "GOLO", atletaId: A, segundoJogo: 120, parte: 1, clientEventoId: "g2" },
    ]);
    const { data } = linhasCriadas();
    expect(data.filter((l) => l.tipo === "ASSISTENCIA")).toHaveLength(0);
    expect(data).toHaveLength(1);
  });

  it("recalcula o placar quando o lote inclui GOLO/GOLO_SOFRIDO", async () => {
    await sincronizarJogoAoVivo(JOGO_ID, [
      { tipo: "GOLO", atletaId: A, segundoJogo: 60, parte: 1, clientEventoId: "g3" },
      { tipo: "GOLO_SOFRIDO", atletaId: null, segundoJogo: 90, parte: 1, clientEventoId: "gs1" },
    ]);
    // Placar = contagem de eventos (mock: 2 golos, 1 sofrido).
    expect(calls(prisma.jogo.update)).toHaveLength(1);
    expect(calls(prisma.jogo.update)[0][0]).toMatchObject({
      where: { id: JOGO_ID },
      data: { golosMarcados: 2, golosSofridos: 1 },
    });
  });

  it("NÃO toca no placar quando o lote só tem eventos de cronómetro", async () => {
    await sincronizarJogoAoVivo(JOGO_ID, [
      { tipo: "ENTRADA", atletaId: A, segundoJogo: 0, parte: 1, clientEventoId: "e1" },
      { tipo: "SAIDA", atletaId: A, segundoJogo: 600, parte: 1, clientEventoId: "s1" },
    ]);
    expect(calls(prisma.jogo.update)).toHaveLength(0);
  });

  it("cartões exigem atletaId (validação Zod)", async () => {
    const res = await sincronizarJogoAoVivo(JOGO_ID, [
      { tipo: "CARTAO_AMARELO", atletaId: null, segundoJogo: 300, parte: 1, clientEventoId: "c1" },
    ]);
    expect(res.sucesso).toBe(false);
  });

  it("idempotência: re-sincronizar o mesmo lote produz clientEventoId estáveis", async () => {
    const lote = [
      {
        tipo: "GOLO" as const,
        atletaId: A,
        atletaSecundarioId: B,
        segundoJogo: 300,
        parte: 1,
        clientEventoId: "evt-golo-1",
      },
    ];
    await sincronizarJogoAoVivo(JOGO_ID, lote);
    const primeira = linhasCriadas().data.map((l) => l.clientEventoId).sort();
    mocked(prisma.eventoJogo.createMany).mockResolvedValue({ count: 0 });
    await sincronizarJogoAoVivo(JOGO_ID, lote);
    const segunda = (
      calls(prisma.eventoJogo.createMany)[1][0] as { data: Array<{ clientEventoId: string }> }
    ).data
      .map((l) => l.clientEventoId)
      .sort();
    // Mesmos ids nas duas sincronizações → skipDuplicates dedupica na BD.
    expect(segunda).toEqual(primeira);
    expect(primeira).toEqual(["evt-golo-1", "evt-golo-1::assist"]);
  });
});

describe("recalcularResultadoJogo — placar coerente e idempotente", () => {
  it("escreve golosMarcados/golosSofridos a partir da contagem de eventos", async () => {
    const update = vi.fn().mockResolvedValue({});
    const count = vi
      .fn()
      .mockImplementation((args: { where: { tipo: string } }) =>
        Promise.resolve(args.where.tipo === "GOLO" ? 3 : 2),
      );
    const tx = { eventoJogo: { count }, jogo: { update } };

    await recalcularResultadoJogo(tx as never, JOGO_ID);

    expect(update).toHaveBeenCalledWith({
      where: { id: JOGO_ID },
      data: { golosMarcados: 3, golosSofridos: 2 },
    });
  });
});
