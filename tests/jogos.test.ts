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
    jogo: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    escalao: { findFirst: vi.fn() },
    competicao: { findFirst: vi.fn() },
    convocatoria: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    atletaEscalao: { count: vi.fn() },
    eventoJogo: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
    estatisticaAtleta: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import {
  criarJogo,
  atualizarJogo,
  apagarJogo,
  guardarRelatorio,
  definirVideo,
  registarEventoJogo,
  removerEventoJogo,
} from "@/lib/actions/jogos";
import { auth } from "@/lib/auth";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const ESC_ID = "ckv9v0z1w0000abcd1234efga";
const JOGO_ID = "ckv9v0z1w0000abcd1234efgb";
const COMP_ID = "ckv9v0z1w0000abcd1234efgc";
const ATLETA_ID = "ckv9v0z1w0000abcd1234efgd";

const mocked = <T,>(fn: T) => fn as unknown as {
  mockResolvedValue: (v: unknown) => void;
  mockImplementation: (f: (...a: unknown[]) => unknown) => void;
};

const calls = (fn: unknown) => (fn as { mock: { calls: unknown[][] } }).mock.calls;

const PERM_OK = { ok: true, ctx: { clube: { id: "clube1" } } };

const JOGO_BD = { id: JOGO_ID, escalaoId: ESC_ID, epocaId: "ep1" };

const ENTRADA_JOGO_VALIDA = {
  data: "2026-09-15",
  adversario: "Sporting CP",
  casaFora: "CASA" as const,
  tipo: "OFICIAL" as const,
  escalaoId: ESC_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(auth).mockResolvedValue({ user: { id: "user1" } });
  mocked(obterClubeIdAtual).mockResolvedValue("clube1");
  mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
  mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
  mocked(prisma.escalao.findFirst).mockResolvedValue({ id: ESC_ID, clubeId: "clube1" });
  mocked(prisma.jogo.findFirst).mockResolvedValue(JOGO_BD);
  mocked(prisma.jogo.create).mockResolvedValue({ id: JOGO_ID });
  mocked(prisma.jogo.update).mockResolvedValue({ id: JOGO_ID });
  mocked(prisma.jogo.delete).mockResolvedValue({ id: JOGO_ID });
  mocked(prisma.eventoJogo.count).mockResolvedValue(0);
  mocked(prisma.$transaction).mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

// ─── criarJogo ────────────────────────────────────────────────────────────────

describe("criarJogo", () => {
  it("falha sem sessão autenticada", async () => {
    mocked(auth).mockResolvedValue(null);
    const r = await criarJogo(ENTRADA_JOGO_VALIDA);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não autenticado/i);
    expect(prisma.jogo.create).not.toHaveBeenCalled();
  });

  it("falha sem época ativa", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue(null);
    const r = await criarJogo(ENTRADA_JOGO_VALIDA);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/época/i);
  });

  it("rejeita adversário vazio com campoInvalido", async () => {
    const r = await criarJogo({ ...ENTRADA_JOGO_VALIDA, adversario: "" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.adversario).toBeTruthy();
    expect(prisma.jogo.create).not.toHaveBeenCalled();
  });

  it("rejeita casaFora com valor inválido", async () => {
    const r = await criarJogo({ ...ENTRADA_JOGO_VALIDA, casaFora: "NEUTRO" });
    expect(r.sucesso).toBe(false);
    expect(prisma.jogo.create).not.toHaveBeenCalled();
  });

  it("falha sem permissão no escalão", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await criarJogo(ENTRADA_JOGO_VALIDA);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/permiss/i);
    expect(prisma.jogo.create).not.toHaveBeenCalled();
  });

  it("falha se o escalão não pertence ao clube (isolamento multi-tenant)", async () => {
    mocked(prisma.escalao.findFirst).mockResolvedValue(null);
    const r = await criarJogo(ENTRADA_JOGO_VALIDA);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/escalão/i);
    expect(prisma.jogo.create).not.toHaveBeenCalled();
  });

  it("falha se a competição não pertence ao clube/escalão", async () => {
    mocked(prisma.competicao.findFirst).mockResolvedValue(null);
    const r = await criarJogo({ ...ENTRADA_JOGO_VALIDA, competicaoId: COMP_ID });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/competição/i);
  });

  it("cria jogo com épocaId e criadorId corretos", async () => {
    const r = await criarJogo(ENTRADA_JOGO_VALIDA);
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.jogo.create)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.epocaId).toBe("ep1");
    expect(arg.data.criadorId).toBe("user1");
    expect(arg.data.escalaoId).toBe(ESC_ID);
    expect(arg.data.adversario).toBe("Sporting CP");
  });

  it("aceita URL YouTube válida", async () => {
    const r = await criarJogo({ ...ENTRADA_JOGO_VALIDA, videoUrl: "https://www.youtube.com/watch?v=abc123" });
    expect(r.sucesso).toBe(true);
  });

  it("rejeita URL de vídeo não YouTube", async () => {
    const r = await criarJogo({ ...ENTRADA_JOGO_VALIDA, videoUrl: "https://vimeo.com/12345" });
    expect(r.sucesso).toBe(false);
  });

  it("rejeita URL de vídeo http (sem https)", async () => {
    const r = await criarJogo({ ...ENTRADA_JOGO_VALIDA, videoUrl: "http://youtube.com/watch?v=abc" });
    expect(r.sucesso).toBe(false);
  });
});

// ─── atualizarJogo ───────────────────────────────────────────────────────────

describe("atualizarJogo", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await atualizarJogo(JOGO_ID, ENTRADA_JOGO_VALIDA);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não autenticado/i);
    expect(prisma.jogo.update).not.toHaveBeenCalled();
  });

  it("falha se o jogo não pertence ao clube (isolamento multi-tenant)", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(null);
    const r = await atualizarJogo(JOGO_ID, ENTRADA_JOGO_VALIDA);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrado/i);
    expect(prisma.jogo.update).not.toHaveBeenCalled();
  });

  it("rejeita input inválido (schema Zod)", async () => {
    const r = await atualizarJogo(JOGO_ID, { ...ENTRADA_JOGO_VALIDA, adversario: "" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.adversario).toBeTruthy();
    expect(prisma.jogo.update).not.toHaveBeenCalled();
  });

  it("atualiza o jogo com dados corretos", async () => {
    const r = await atualizarJogo(JOGO_ID, { ...ENTRADA_JOGO_VALIDA, adversario: "Benfica" });
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.jogo.update)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.adversario).toBe("Benfica");
  });
});

// ─── apagarJogo ──────────────────────────────────────────────────────────────

describe("apagarJogo", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await apagarJogo(JOGO_ID);
    expect(r.sucesso).toBe(false);
    expect(prisma.jogo.delete).not.toHaveBeenCalled();
  });

  it("falha se o jogo não pertence ao clube", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(null);
    const r = await apagarJogo(JOGO_ID);
    expect(r.sucesso).toBe(false);
    expect(prisma.jogo.delete).not.toHaveBeenCalled();
  });

  it("falha sem permissão no escalão", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await apagarJogo(JOGO_ID);
    expect(r.sucesso).toBe(false);
    expect(prisma.jogo.delete).not.toHaveBeenCalled();
  });

  it("apaga o jogo quando autorizado", async () => {
    const r = await apagarJogo(JOGO_ID);
    expect(r.sucesso).toBe(true);
    expect(prisma.jogo.delete).toHaveBeenCalledOnce();
    const arg = calls(prisma.jogo.delete)[0][0] as { where: { id: string } };
    expect(arg.where.id).toBe(JOGO_ID);
  });
});

// ─── guardarRelatorio ─────────────────────────────────────────────────────────

describe("guardarRelatorio", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await guardarRelatorio(JOGO_ID, "texto");
    expect(r.sucesso).toBe(false);
    expect(prisma.jogo.update).not.toHaveBeenCalled();
  });

  it("falha se o jogo não pertence ao clube", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(null);
    const r = await guardarRelatorio(JOGO_ID, "texto");
    expect(r.sucesso).toBe(false);
    expect(prisma.jogo.update).not.toHaveBeenCalled();
  });

  it("guarda o relatório com trim", async () => {
    const r = await guardarRelatorio(JOGO_ID, "  bom jogo  ");
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.jogo.update)[0][0] as { data: { relatorio: string | null } };
    expect(arg.data.relatorio).toBe("bom jogo");
  });

  it("guarda null quando o relatório está vazio (apenas espaços)", async () => {
    const r = await guardarRelatorio(JOGO_ID, "   ");
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.jogo.update)[0][0] as { data: { relatorio: string | null } };
    expect(arg.data.relatorio).toBeNull();
  });
});

// ─── definirVideo ─────────────────────────────────────────────────────────────

describe("definirVideo", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await definirVideo(JOGO_ID, "https://www.youtube.com/watch?v=abc");
    expect(r.sucesso).toBe(false);
    expect(prisma.jogo.update).not.toHaveBeenCalled();
  });

  it("rejeita URL que não é YouTube", async () => {
    const r = await definirVideo(JOGO_ID, "https://vimeo.com/12345");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/youtube/i);
    expect(prisma.jogo.update).not.toHaveBeenCalled();
  });

  it("rejeita URL com protocolo http", async () => {
    const r = await definirVideo(JOGO_ID, "http://www.youtube.com/watch?v=abc");
    expect(r.sucesso).toBe(false);
    expect(prisma.jogo.update).not.toHaveBeenCalled();
  });

  it("aceita youtu.be (URL curta válida)", async () => {
    const r = await definirVideo(JOGO_ID, "https://youtu.be/dQw4w9WgXcQ");
    expect(r.sucesso).toBe(true);
    expect(prisma.jogo.update).toHaveBeenCalledOnce();
  });
});

// ─── registarEventoJogo ───────────────────────────────────────────────────────

describe("registarEventoJogo", () => {
  const EVENTO_VALIDO = { jogoId: JOGO_ID, parte: 1, tipo: "GOLO" };

  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await registarEventoJogo(EVENTO_VALIDO);
    expect(r.sucesso).toBe(false);
    expect(prisma.eventoJogo.create).not.toHaveBeenCalled();
  });

  it("rejeita input inválido (parte fora do intervalo 1-2)", async () => {
    const r = await registarEventoJogo({ ...EVENTO_VALIDO, parte: 3 });
    expect(r.sucesso).toBe(false);
    expect(prisma.eventoJogo.create).not.toHaveBeenCalled();
  });

  it("falha se o jogo não pertence ao clube", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(null);
    const r = await registarEventoJogo(EVENTO_VALIDO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrado/i);
  });

  it("cria o evento quando autorizado e sem atleta específico", async () => {
    mocked(prisma.eventoJogo.create).mockResolvedValue({ id: "ev1" });
    const r = await registarEventoJogo(EVENTO_VALIDO);
    expect(r.sucesso).toBe(true);
    expect(prisma.eventoJogo.create).toHaveBeenCalledOnce();
  });

  it("rejeita atleta que não pertence ao jogo", async () => {
    mocked(prisma.convocatoria.findFirst).mockResolvedValue(null);
    mocked(prisma.atletaEscalao.count).mockResolvedValue(0);
    const r = await registarEventoJogo({ ...EVENTO_VALIDO, atletaId: ATLETA_ID });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/convocatória/i);
  });
});

// ─── removerEventoJogo ────────────────────────────────────────────────────────

describe("removerEventoJogo", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await removerEventoJogo("ev1");
    expect(r.sucesso).toBe(false);
    expect(prisma.eventoJogo.delete).not.toHaveBeenCalled();
  });

  it("falha se o evento não pertence ao clube", async () => {
    mocked(prisma.eventoJogo.findFirst).mockResolvedValue(null);
    const r = await removerEventoJogo("ev1");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrado/i);
  });

  it("remove o evento quando autorizado", async () => {
    mocked(prisma.eventoJogo.findFirst).mockResolvedValue({
      id: "ev1", jogoId: JOGO_ID, jogo: { escalaoId: ESC_ID },
    });
    mocked(prisma.eventoJogo.delete).mockResolvedValue({ id: "ev1" });
    const r = await removerEventoJogo("ev1");
    expect(r.sucesso).toBe(true);
    expect(prisma.eventoJogo.delete).toHaveBeenCalledOnce();
  });
});
