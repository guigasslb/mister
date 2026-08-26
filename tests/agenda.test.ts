import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/epoca-context", () => ({
  obterClubeIdAtual: vi.fn(),
  obterEpocaAtiva: vi.fn(),
  COOKIE_EPOCA: "epoca_ativa",
}));

vi.mock("@/lib/permissoes", () => ({
  podeLerEscalao: vi.fn(),
  escaloesLegiveis: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    sessao: { findMany: vi.fn() },
    jogo: { findMany: vi.fn() },
    reuniao: { findMany: vi.fn() },
    escalao: { findMany: vi.fn() },
  },
}));

import { obterAgendaClube } from "@/lib/actions/agenda";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { podeLerEscalao, escaloesLegiveis } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const CLUBE = "clube-1";
const EPOCA = { id: "epoca-1", clubeId: CLUBE, ativa: true } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(obterClubeIdAtual).mockResolvedValue(CLUBE);
  vi.mocked(obterEpocaAtiva).mockResolvedValue(EPOCA);
  vi.mocked(escaloesLegiveis).mockResolvedValue("TODOS");
  vi.mocked(podeLerEscalao).mockResolvedValue(true);
  vi.mocked(prisma.sessao.findMany).mockResolvedValue([]);
  vi.mocked(prisma.jogo.findMany).mockResolvedValue([]);
  vi.mocked(prisma.reuniao.findMany).mockResolvedValue([]);
  vi.mocked(prisma.escalao.findMany).mockResolvedValue([]);
});

describe("obterAgendaClube", () => {
  it("devolve erro se não autenticado", async () => {
    vi.mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await obterAgendaClube();
    expect(r.sucesso).toBe(false);
  });

  it("devolve erro se não há época ativa", async () => {
    vi.mocked(obterEpocaAtiva).mockResolvedValue(null);
    const r = await obterAgendaClube();
    expect(r.sucesso).toBe(false);
  });

  it("combina treinos e jogos ordenados cronologicamente", async () => {
    vi.mocked(prisma.sessao.findMany).mockResolvedValue([
      {
        id: "s1",
        data: new Date("2026-08-15T18:00:00"),
        local: "Pavilhão A",
        objetivo: "Transições rápidas",
        tipoSessao: "NORMAL",
        escalao: { nome: "Sub-15" },
      },
    ] as never);
    vi.mocked(prisma.jogo.findMany).mockResolvedValue([
      {
        id: "j1",
        data: new Date("2026-08-13T20:00:00"),
        local: "Casa",
        adversario: "Águias FC",
        escalao: { nome: "Seniores" },
      },
    ] as never);

    const r = await obterAgendaClube();
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;

    expect(r.dados).toHaveLength(2);
    // Jogo (13 ago) antes do treino (15 ago).
    expect(r.dados[0]).toMatchObject({
      id: "j1",
      tipo: "JOGO",
      escalaoNome: "Seniores",
      titulo: "vs Águias FC",
    });
    expect(r.dados[1]).toMatchObject({
      id: "s1",
      tipo: "TREINO",
      escalaoNome: "Sub-15",
      titulo: "Transições rápidas",
    });
  });

  it("usa o rótulo do tipo de sessão quando não há objetivo", async () => {
    vi.mocked(prisma.sessao.findMany).mockResolvedValue([
      {
        id: "s2",
        data: new Date("2026-08-10T10:00:00"),
        local: null,
        objetivo: null,
        tipoSessao: "CAPTACAO",
        escalao: { nome: "Sub-13" },
      },
    ] as never);

    const r = await obterAgendaClube();
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados[0].titulo).toBe("Captação");
  });

  it("filtra por escalão quando pedido e há permissão", async () => {
    await obterAgendaClube({ escalaoId: "esc-9" });
    expect(podeLerEscalao).toHaveBeenCalledWith("esc-9");
    const whereSessao = vi.mocked(prisma.sessao.findMany).mock.calls[0][0]?.where;
    const whereJogo = vi.mocked(prisma.jogo.findMany).mock.calls[0][0]?.where;
    expect(whereSessao).toMatchObject({ escalaoId: "esc-9" });
    expect(whereJogo).toMatchObject({ escalaoId: "esc-9" });
  });

  it("devolve lista vazia se não tem permissão no escalão pedido", async () => {
    vi.mocked(podeLerEscalao).mockResolvedValue(false);
    const r = await obterAgendaClube({ escalaoId: "esc-x" });
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados).toEqual([]);
    expect(prisma.sessao.findMany).not.toHaveBeenCalled();
    expect(prisma.jogo.findMany).not.toHaveBeenCalled();
  });

  it("restringe aos escalões legíveis quando o âmbito não é TODO_CLUBE", async () => {
    vi.mocked(escaloesLegiveis).mockResolvedValue(["esc-1", "esc-2"]);
    await obterAgendaClube();
    const whereSessao = vi.mocked(prisma.sessao.findMany).mock.calls[0][0]?.where;
    expect(whereSessao).toMatchObject({ escalaoId: { in: ["esc-1", "esc-2"] } });
  });

  it("devolve lista vazia se não há escalões legíveis", async () => {
    vi.mocked(escaloesLegiveis).mockResolvedValue([]);
    const r = await obterAgendaClube();
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados).toEqual([]);
    expect(prisma.sessao.findMany).not.toHaveBeenCalled();
  });

  it("aplica a janela do mês quando mes/ano são fornecidos", async () => {
    await obterAgendaClube({ mes: 8, ano: 2026 });
    const whereSessao = vi.mocked(prisma.sessao.findMany).mock.calls[0][0]?.where as {
      data: { gte: Date; lte: Date };
    };
    expect(whereSessao.data.gte).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(whereSessao.data.lte).toEqual(new Date(2026, 8, 0, 23, 59, 59, 999));
  });

  it("expõe tipoSessao no treino e tipo/casaFora no jogo", async () => {
    vi.mocked(prisma.sessao.findMany).mockResolvedValue([
      {
        id: "s1",
        data: new Date("2026-08-10T18:00:00"),
        local: "Pavilhão A",
        objetivo: "Bola parada",
        tipoSessao: "ABERTO",
        escalao: { nome: "Sub-15" },
      },
    ] as never);
    vi.mocked(prisma.jogo.findMany).mockResolvedValue([
      {
        id: "j1",
        data: new Date("2026-08-11T20:00:00"),
        local: "Fora",
        adversario: "Águias FC",
        tipo: "AMIGAVEL",
        casaFora: "FORA",
        escalao: { nome: "Seniores" },
      },
    ] as never);

    const r = await obterAgendaClube();
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados[0]).toMatchObject({ tipo: "TREINO", tipoSessao: "ABERTO" });
    expect(r.dados[1]).toMatchObject({ tipo: "JOGO", tipoJogo: "AMIGAVEL", casaFora: "FORA" });
  });

  it("inclui reuniões, resolvendo o nome do escalão e a descrição", async () => {
    vi.mocked(prisma.reuniao.findMany).mockResolvedValue([
      {
        id: "r1",
        data: new Date("2026-08-05T19:00:00"),
        titulo: "Reunião de planeamento",
        escalaoId: "esc-1",
        ordemTrabalhos: "1. Balanço\n2. Calendário",
      },
      {
        id: "r2",
        data: new Date("2026-08-06T19:00:00"),
        titulo: "Assembleia de clube",
        escalaoId: null,
        ordemTrabalhos: null,
      },
    ] as never);
    vi.mocked(prisma.escalao.findMany).mockResolvedValue([
      { id: "esc-1", nome: "Sub-17" },
    ] as never);

    const r = await obterAgendaClube();
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;

    const reuniaoEscalao = r.dados.find((e) => e.id === "r1");
    const reuniaoClube = r.dados.find((e) => e.id === "r2");
    expect(reuniaoEscalao).toMatchObject({
      tipo: "REUNIAO",
      titulo: "Reunião de planeamento",
      escalaoNome: "Sub-17",
      descricao: "1. Balanço\n2. Calendário",
    });
    expect(reuniaoClube).toMatchObject({
      tipo: "REUNIAO",
      escalaoNome: "Geral",
    });
    expect(reuniaoClube?.descricao).toBeUndefined();
  });

  it("filtro tipo=TREINO só consulta sessões", async () => {
    await obterAgendaClube({ tipo: "TREINO" });
    expect(prisma.sessao.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.jogo.findMany).not.toHaveBeenCalled();
    expect(prisma.reuniao.findMany).not.toHaveBeenCalled();
  });

  it("filtro tipo=JOGO só consulta jogos", async () => {
    await obterAgendaClube({ tipo: "JOGO" });
    expect(prisma.jogo.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.sessao.findMany).not.toHaveBeenCalled();
    expect(prisma.reuniao.findMany).not.toHaveBeenCalled();
  });

  it("filtro tipo=REUNIAO só consulta reuniões", async () => {
    await obterAgendaClube({ tipo: "REUNIAO" });
    expect(prisma.reuniao.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.sessao.findMany).not.toHaveBeenCalled();
    expect(prisma.jogo.findMany).not.toHaveBeenCalled();
  });

  it("mostra reuniões de CLUBE mesmo sem escalões legíveis", async () => {
    vi.mocked(escaloesLegiveis).mockResolvedValue([]);
    vi.mocked(prisma.reuniao.findMany).mockResolvedValue([
      {
        id: "r3",
        data: new Date("2026-08-07T19:00:00"),
        titulo: "Assembleia",
        escalaoId: null,
        ordemTrabalhos: null,
      },
    ] as never);

    const r = await obterAgendaClube();
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    // Sessões/jogos não são consultados; a reunião de clube aparece.
    expect(prisma.sessao.findMany).not.toHaveBeenCalled();
    expect(prisma.jogo.findMany).not.toHaveBeenCalled();
    expect(r.dados).toHaveLength(1);
    expect(r.dados[0]).toMatchObject({ id: "r3", tipo: "REUNIAO", escalaoNome: "Geral" });
  });
});
