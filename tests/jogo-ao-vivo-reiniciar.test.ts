import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * §8.25.9 — `reiniciarJogoAoVivo`: repõe o jogo ao estado anterior ao início do
 * Modo Jogo ao Vivo (numa só transação) sem tocar nos dados do jogo, convocatória,
 * eventos clássicos nem votação do capitão.
 */

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
vi.mock("@/lib/sincronizacao-jogo-confronto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sincronizacao-jogo-confronto")>()),
  reverterConfrontoDoJogo: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    jogo: { findFirst: vi.fn(), update: vi.fn() },
    eventoJogo: { deleteMany: vi.fn() },
    estatisticaAtleta: { deleteMany: vi.fn() },
    sessaoJogoAoVivo: { deleteMany: vi.fn() },
    convocatoria: { deleteMany: vi.fn(), updateMany: vi.fn() },
    votacaoCapitao: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { reiniciarJogoAoVivo } from "@/lib/actions/jogo-ao-vivo";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { revalidatePath } from "next/cache";
import { reverterConfrontoDoJogo } from "@/lib/sincronizacao-jogo-confronto";
import { prisma } from "@/lib/db";

const ESC_ID = "ckv9v0z1w0000abcd1234efga";
const JOGO_ID = "ckv9v0z1w0000abcd1234efgb";

type MockFn = {
  mockResolvedValue: (v: unknown) => MockFn;
  mockImplementation: (f: (...a: unknown[]) => unknown) => MockFn;
  mock: { calls: unknown[][] };
};
const mock = (fn: unknown) => fn as unknown as MockFn;
const calls = (fn: unknown) => (fn as unknown as MockFn).mock.calls;

const JOGO = {
  id: JOGO_ID,
  epocaId: "ep1",
  escalaoId: ESC_ID,
  formato: "FUTSAL_5",
  modalidadeAtividade: null,
  numeroPartes: 2,
  relatorio: null as string | null,
  golosMarcados: 3,
  golosSofridos: 1,
  escalao: { seccao: { modalidade: "FUTSAL" } },
  sessaoAoVivo: {
    jogoId: JOGO_ID,
    numeroPartes: 2,
    duracaoParteMins: 20,
    estado: "EM_CURSO",
    parteAtual: 1,
    segundosDecorridos: 300,
    aCorrerDesde: new Date(),
  },
};

// Ordem das escritas dentro da transação (para provar atomicidade).
let dentroDaTransacao = false;
const escritasForaDaTransacao: string[] = [];
function registar(nome: string) {
  return () => {
    if (!dentroDaTransacao) escritasForaDaTransacao.push(nome);
    return Promise.resolve({ count: 1 });
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dentroDaTransacao = false;
  escritasForaDaTransacao.length = 0;
  mock(obterClubeIdAtual).mockResolvedValue("clube1");
  mock(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
  mock(exigirCapacidade).mockResolvedValue({ ok: true });
  mock(prisma.jogo.findFirst).mockResolvedValue(JOGO);
  mock(prisma.jogo.update).mockImplementation(registar("jogo.update"));
  mock(prisma.eventoJogo.deleteMany).mockImplementation(registar("eventoJogo.deleteMany"));
  mock(prisma.estatisticaAtleta.deleteMany).mockImplementation(
    registar("estatisticaAtleta.deleteMany"),
  );
  mock(prisma.sessaoJogoAoVivo.deleteMany).mockImplementation(
    registar("sessaoJogoAoVivo.deleteMany"),
  );
  mock(reverterConfrontoDoJogo).mockImplementation(() => {
    if (!dentroDaTransacao) escritasForaDaTransacao.push("reverterConfrontoDoJogo");
    return Promise.resolve(null);
  });
  mock(prisma.$transaction).mockImplementation(async (arg: unknown) => {
    dentroDaTransacao = true;
    try {
      return await (arg as (tx: unknown) => unknown)(prisma);
    } finally {
      dentroDaTransacao = false;
    }
  });
});

describe("reiniciarJogoAoVivo", () => {
  it("apaga só os eventos do modo ao vivo (cronómetro/quintetos + clientEventoId)", async () => {
    const r = await reiniciarJogoAoVivo(JOGO_ID);
    expect(r.sucesso).toBe(true);
    expect(prisma.eventoJogo.deleteMany).toHaveBeenCalledTimes(1);
    expect(calls(prisma.eventoJogo.deleteMany)[0][0]).toEqual({
      where: {
        jogoId: JOGO_ID,
        OR: [
          {
            tipo: {
              in: ["INICIO_PARTE", "FIM_PARTE", "ENTRADA", "SAIDA", "PAUSA", "RETOMA"],
            },
          },
          { clientEventoId: { not: null } },
        ],
      },
    });
  });

  it("apaga todas as estatísticas e a sessão ao vivo do jogo", async () => {
    await reiniciarJogoAoVivo(JOGO_ID);
    expect(calls(prisma.estatisticaAtleta.deleteMany)[0][0]).toEqual({
      where: { jogoId: JOGO_ID },
    });
    expect(calls(prisma.sessaoJogoAoVivo.deleteMany)[0][0]).toEqual({
      where: { jogoId: JOGO_ID },
    });
  });

  it("repõe o resultado a null sem tocar no relatório quando não há nota ao vivo", async () => {
    await reiniciarJogoAoVivo(JOGO_ID);
    expect(calls(prisma.jogo.update)[0][0]).toEqual({
      where: { id: JOGO_ID },
      data: { golosMarcados: null, golosSofridos: null },
    });
  });

  it("relatório legado em texto simples não é reescrito", async () => {
    mock(prisma.jogo.findFirst).mockResolvedValue({ ...JOGO, relatorio: "Texto antigo" });
    await reiniciarJogoAoVivo(JOGO_ID);
    const { data } = calls(prisma.jogo.update)[0][0] as { data: Record<string, unknown> };
    expect(data).not.toHaveProperty("relatorio");
  });

  it("remove a nota ao vivo e preserva as restantes secções do relatório", async () => {
    mock(prisma.jogo.findFirst).mockResolvedValue({
      ...JOGO,
      relatorio: JSON.stringify({
        analiseTatica: "Pressão alta",
        destaques: "",
        proximoJogo: "",
        notasAoVivo: "nota de teste",
      }),
    });
    await reiniciarJogoAoVivo(JOGO_ID);
    const { data } = calls(prisma.jogo.update)[0][0] as { data: { relatorio: string } };
    const rel = JSON.parse(data.relatorio) as Record<string, unknown>;
    expect(rel.analiseTatica).toBe("Pressão alta");
    expect(rel).not.toHaveProperty("notasAoVivo");
  });

  it("relatório só com a nota ao vivo fica null", async () => {
    mock(prisma.jogo.findFirst).mockResolvedValue({
      ...JOGO,
      relatorio: JSON.stringify({ notasAoVivo: "só a nota" }),
    });
    await reiniciarJogoAoVivo(JOGO_ID);
    const { data } = calls(prisma.jogo.update)[0][0] as { data: { relatorio: unknown } };
    expect(data.relatorio).toBeNull();
  });

  it("todas as escritas correm numa só transação", async () => {
    await reiniciarJogoAoVivo(JOGO_ID);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(escritasForaDaTransacao).toEqual([]);
  });

  it("mantém convocatória e votação do capitão", async () => {
    await reiniciarJogoAoVivo(JOGO_ID);
    expect(prisma.convocatoria.deleteMany).not.toHaveBeenCalled();
    expect(prisma.convocatoria.updateMany).not.toHaveBeenCalled();
    expect(prisma.votacaoCapitao.deleteMany).not.toHaveBeenCalled();
    const { data } = calls(prisma.jogo.update)[0][0] as { data: Record<string, unknown> };
    expect(Object.keys(data).sort()).toEqual(["golosMarcados", "golosSofridos"]);
  });

  it("revalida a lista de jogos, o detalhe e o ecrã ao vivo", async () => {
    await reiniciarJogoAoVivo(JOGO_ID);
    const paths = calls(revalidatePath).map((c) => c[0]);
    expect(paths).toEqual(
      expect.arrayContaining(["/jogos", `/jogos/${JOGO_ID}`, `/jogos/${JOGO_ID}/ao-vivo`]),
    );
  });

  it("reverte o confronto ligado dentro da transação e revalida a competição", async () => {
    mock(reverterConfrontoDoJogo).mockImplementation((db: unknown) => {
      expect(dentroDaTransacao).toBe(true);
      expect(db).toBe(prisma);
      return Promise.resolve("comp1");
    });
    const r = await reiniciarJogoAoVivo(JOGO_ID);
    expect(r.sucesso).toBe(true);
    expect(reverterConfrontoDoJogo).toHaveBeenCalledWith(prisma, JOGO_ID);
    expect(calls(revalidatePath).map((c) => c[0])).toContain("/jogos/competicoes/comp1");
  });

  it("sem confronto revertido não revalida nenhuma competição", async () => {
    await reiniciarJogoAoVivo(JOGO_ID);
    expect(reverterConfrontoDoJogo).toHaveBeenCalledTimes(1);
    const paths = calls(revalidatePath).map((c) => String(c[0]));
    expect(paths.some((p) => p.startsWith("/jogos/competicoes"))).toBe(false);
  });

  it("funciona mesmo sem sessão ao vivo (idempotente)", async () => {
    mock(prisma.jogo.findFirst).mockResolvedValue({ ...JOGO, sessaoAoVivo: null });
    const r = await reiniciarJogoAoVivo(JOGO_ID);
    expect(r.sucesso).toBe(true);
  });

  it("rejeita jogoId inválido sem escrever", async () => {
    const r = await reiniciarJogoAoVivo("nao-e-cuid");
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("sem autenticação não escreve", async () => {
    mock(obterClubeIdAtual).mockResolvedValue(null);
    const r = await reiniciarJogoAoVivo(JOGO_ID);
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("jogo de outro clube (não encontrado) não escreve", async () => {
    mock(prisma.jogo.findFirst).mockResolvedValue(null);
    const r = await reiniciarJogoAoVivo(JOGO_ID);
    expect(r.sucesso).toBe(false);
    expect(calls(prisma.jogo.findFirst)[0][0]).toMatchObject({
      where: { id: JOGO_ID, escalao: { clubeId: "clube1" } },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("jogo fora da época ativa não escreve", async () => {
    mock(prisma.jogo.findFirst).mockResolvedValue({ ...JOGO, epocaId: "outra" });
    const r = await reiniciarJogoAoVivo(JOGO_ID);
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("exige ESTATISTICAS_GERIR no escalão do jogo", async () => {
    mock(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await reiniciarJogoAoVivo(JOGO_ID);
    expect(r.sucesso).toBe(false);
    expect(exigirCapacidade).toHaveBeenCalledWith("ESTATISTICAS_GERIR", ESC_ID);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
