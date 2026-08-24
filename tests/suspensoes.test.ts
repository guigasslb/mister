import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
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
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    jogo: { findFirst: vi.fn() },
    escalao: { findFirst: vi.fn() },
    estatisticaAtleta: { findMany: vi.fn() },
  },
}));

import { obterSuspensoesPendentes } from "@/lib/actions/jogos";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { podeLerEscalao } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const ESC_ID = "ckv9v0z1w0000abcd1234efga";
const A1 = "ckv9v0z1w0000abcd1234efg1";
const A2 = "ckv9v0z1w0000abcd1234efg2";
const A3 = "ckv9v0z1w0000abcd1234efg3";

const mocked = <T,>(fn: T) => fn as unknown as {
  mockResolvedValue: (v: unknown) => void;
};

// Próximo jogo com 3 convocados.
const PROXIMO_JOGO = {
  id: "jogoProx",
  convocatorias: [
    { atletaId: A1, atleta: { nome: "Ana" } },
    { atletaId: A2, atleta: { nome: "Bruno" } },
    { atletaId: A3, atleta: { nome: "Carla" } },
  ],
};

// Datas de jogos já jogados (mais recente = jogoRecente).
const D_ANTIGO = new Date("2026-01-10T20:00:00Z");
const D_RECENTE = new Date("2026-02-10T20:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocked(obterClubeIdAtual).mockResolvedValue("clube1");
  mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
  mocked(prisma.escalao.findFirst).mockResolvedValue({ id: ESC_ID });
  mocked(podeLerEscalao).mockResolvedValue(true);
  mocked(prisma.jogo.findFirst).mockResolvedValue(PROXIMO_JOGO);
  mocked(prisma.estatisticaAtleta.findMany).mockResolvedValue([]);
});

describe("obterSuspensoesPendentes", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await obterSuspensoesPendentes(ESC_ID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não autenticado/i);
  });

  it("falha sem época ativa", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue(null);
    const r = await obterSuspensoesPendentes(ESC_ID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/época/i);
  });

  it("falha se o escalão não pertence ao clube (isolamento multi-tenant)", async () => {
    mocked(prisma.escalao.findFirst).mockResolvedValue(null);
    const r = await obterSuspensoesPendentes(ESC_ID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/escalão/i);
    expect(prisma.jogo.findFirst).not.toHaveBeenCalled();
  });

  it("falha sem permissão de leitura no escalão", async () => {
    mocked(podeLerEscalao).mockResolvedValue(false);
    const r = await obterSuspensoesPendentes(ESC_ID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/permiss/i);
    expect(prisma.jogo.findFirst).not.toHaveBeenCalled();
  });

  it("devolve lista vazia se não houver próximo jogo", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(null);
    const r = await obterSuspensoesPendentes(ESC_ID);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados).toEqual([]);
    expect(prisma.estatisticaAtleta.findMany).not.toHaveBeenCalled();
  });

  it("devolve lista vazia se o próximo jogo não tem convocados", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue({ id: "jogoProx", convocatorias: [] });
    const r = await obterSuspensoesPendentes(ESC_ID);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados).toEqual([]);
  });

  it("deteta cartão vermelho no último jogo jogado", async () => {
    mocked(prisma.estatisticaAtleta.findMany).mockResolvedValue([
      // Ana: vermelho no jogo mais recente.
      { atletaId: A1, cartaoAmarelo: 0, cartaoVermelho: 1, jogoId: "jRecente", jogo: { data: D_RECENTE } },
    ]);
    const r = await obterSuspensoesPendentes(ESC_ID);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados).toHaveLength(1);
      expect(r.dados[0]).toMatchObject({
        atletaId: A1,
        nome: "Ana",
        motivo: "CARTAO_VERMELHO",
        cartaoVermelhoNoJogoId: "jRecente",
      });
    }
  });

  it("NÃO suspende por vermelho recebido em jogo anterior ao último jogado", async () => {
    mocked(prisma.estatisticaAtleta.findMany).mockResolvedValue([
      // Ana: vermelho no jogo antigo, mas jogou depois sem cartão → cumpriu.
      { atletaId: A1, cartaoAmarelo: 0, cartaoVermelho: 1, jogoId: "jAntigo", jogo: { data: D_ANTIGO } },
      { atletaId: A1, cartaoAmarelo: 0, cartaoVermelho: 0, jogoId: "jRecente", jogo: { data: D_RECENTE } },
    ]);
    const r = await obterSuspensoesPendentes(ESC_ID);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados).toHaveLength(0);
  });

  it("deteta acumulação de 3 amarelos na época", async () => {
    mocked(prisma.estatisticaAtleta.findMany).mockResolvedValue([
      { atletaId: A2, cartaoAmarelo: 1, cartaoVermelho: 0, jogoId: "j1", jogo: { data: D_ANTIGO } },
      { atletaId: A2, cartaoAmarelo: 2, cartaoVermelho: 0, jogoId: "j2", jogo: { data: D_RECENTE } },
    ]);
    const r = await obterSuspensoesPendentes(ESC_ID);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados).toHaveLength(1);
      expect(r.dados[0]).toMatchObject({
        atletaId: A2,
        nome: "Bruno",
        motivo: "ACUMULACAO_AMARELOS",
        amarelosAcumulados: 3,
      });
    }
  });

  it("NÃO suspende com menos de 3 amarelos e sem vermelho", async () => {
    mocked(prisma.estatisticaAtleta.findMany).mockResolvedValue([
      { atletaId: A3, cartaoAmarelo: 2, cartaoVermelho: 0, jogoId: "j1", jogo: { data: D_RECENTE } },
    ]);
    const r = await obterSuspensoesPendentes(ESC_ID);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados).toHaveLength(0);
  });

  it("o vermelho no último jogo tem prioridade sobre a acumulação de amarelos", async () => {
    mocked(prisma.estatisticaAtleta.findMany).mockResolvedValue([
      { atletaId: A1, cartaoAmarelo: 3, cartaoVermelho: 0, jogoId: "jAntigo", jogo: { data: D_ANTIGO } },
      { atletaId: A1, cartaoAmarelo: 0, cartaoVermelho: 1, jogoId: "jRecente", jogo: { data: D_RECENTE } },
    ]);
    const r = await obterSuspensoesPendentes(ESC_ID);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados).toHaveLength(1);
      expect(r.dados[0].motivo).toBe("CARTAO_VERMELHO");
    }
  });

  it("devolve suspensões de vários atletas em simultâneo", async () => {
    mocked(prisma.estatisticaAtleta.findMany).mockResolvedValue([
      { atletaId: A1, cartaoAmarelo: 0, cartaoVermelho: 1, jogoId: "jRecente", jogo: { data: D_RECENTE } },
      { atletaId: A2, cartaoAmarelo: 4, cartaoVermelho: 0, jogoId: "jRecente", jogo: { data: D_RECENTE } },
      { atletaId: A3, cartaoAmarelo: 1, cartaoVermelho: 0, jogoId: "jRecente", jogo: { data: D_RECENTE } },
    ]);
    const r = await obterSuspensoesPendentes(ESC_ID);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados).toHaveLength(2);
      const motivos = Object.fromEntries(r.dados.map((s) => [s.atletaId, s.motivo]));
      expect(motivos[A1]).toBe("CARTAO_VERMELHO");
      expect(motivos[A2]).toBe("ACUMULACAO_AMARELOS");
      expect(motivos[A3]).toBeUndefined();
    }
  });
});
