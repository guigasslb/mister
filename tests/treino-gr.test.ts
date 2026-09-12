import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/epoca-context", () => ({
  obterClubeIdAtual: vi.fn(),
  obterEpocaAtiva: vi.fn(),
}));

vi.mock("@/lib/permissoes", () => ({
  exigirCapacidade: vi.fn(),
  podeLerEscalao: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    escalao: { findFirst: vi.fn() },
    atleta: { findMany: vi.fn() },
    metricaConfig: { findMany: vi.fn() },
    sessao: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    presenca: { createMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    valorMetricaSessao: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  criarSessaoExternaGR,
  listarSessoesExternasGR,
  apagarSessaoExternaGR,
} from "@/lib/actions/treino-gr";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerEscalao } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

// cuids válidos (^c[^\s-]{8,}$) — o schema usa .cuid().
const CLUBE = "clube1";
const ESCALAO = "cescalao0001";
const EPOCA = "cepoca000001";
const GR1 = "cgratleta0001";
const NAOGR = "cnaogr000001";
const METRICA_GR = "cmetricagr001";
const SESSAO = "csessao00001";

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

function inputBase() {
  return {
    data: new Date("2026-09-01T10:00:00.000Z"),
    escalaoId: ESCALAO,
    atletasIds: [GR1],
    metricas: [] as { metricaId: string; atletaId: string; valor: number }[],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (obterClubeIdAtual as ReturnType<typeof vi.fn>).mockResolvedValue(CLUBE);
  (obterEpocaAtiva as ReturnType<typeof vi.fn>).mockResolvedValue({ id: EPOCA, nome: "2026/27" });
  (podeLerEscalao as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  (exigirCapacidade as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    ctx: { utilizadorId: "u1", membroId: "m1", clube: { id: CLUBE } },
  });
  p.escalao.findFirst.mockResolvedValue({ id: ESCALAO });
  // Por omissão, GR1 é guarda-redes e participa na época.
  p.atleta.findMany.mockResolvedValue([
    { id: GR1, posicoes: ["GUARDA_REDES"], participacoes: [{ id: "part1" }] },
  ]);
  p.metricaConfig.findMany.mockResolvedValue([
    { id: METRICA_GR, aplicaSoGuardaRedes: true, contexto: "TREINO" },
  ]);
  // $transaction interativo: executa o callback com o próprio mock como tx.
  p.sessao.create.mockResolvedValue({ id: SESSAO });
  (p.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: unknown) => unknown) => fn(prisma),
  );
});

describe("criarSessaoExternaGR", () => {
  it("falha sem autenticação", async () => {
    (obterClubeIdAtual as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await criarSessaoExternaGR(inputBase());
    expect(r.sucesso).toBe(false);
  });

  it("cria a sessão EXTERNA_GR com presenças e sem periodização (RN-GR-5)", async () => {
    const r = await criarSessaoExternaGR({ ...inputBase(), entidadeExterna: "Estágio FPF" });
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.id).toBe(SESSAO);

    const argsCreate = p.sessao.create.mock.calls[0][0];
    expect(argsCreate.data.tipoSessao).toBe("EXTERNA_GR");
    expect(argsCreate.data.planeamentoId).toBeNull();
    expect(argsCreate.data.planoSemanalId).toBeNull();
    expect(argsCreate.data.planoSemanalDiaId).toBeNull();
    expect(argsCreate.data.rpeSessao).toBeNull();
    expect(argsCreate.data.entidadeExterna).toBe("Estágio FPF");

    expect(p.presenca.createMany).toHaveBeenCalledWith({
      data: [
        { sessaoId: SESSAO, atletaId: GR1, escalaoId: ESCALAO, estado: "PRESENTE", marcadoPorId: "m1" },
      ],
    });
  });

  it("rejeita quando não há participantes GR (min 1)", async () => {
    const r = await criarSessaoExternaGR({ ...inputBase(), atletasIds: [] });
    expect(r.sucesso).toBe(false);
    expect(p.sessao.create).not.toHaveBeenCalled();
  });

  it("rejeita atleta que não é guarda-redes (RN-GR-2)", async () => {
    p.atleta.findMany.mockResolvedValue([
      { id: NAOGR, posicoes: ["FIXO"], participacoes: [{ id: "part1" }] },
    ]);
    const r = await criarSessaoExternaGR({ ...inputBase(), atletasIds: [NAOGR] });
    expect(r.sucesso).toBe(false);
    expect(p.sessao.create).not.toHaveBeenCalled();
  });

  it("rejeita atleta sem participação na época ativa", async () => {
    p.atleta.findMany.mockResolvedValue([
      { id: GR1, posicoes: ["GUARDA_REDES"], participacoes: [] },
    ]);
    const r = await criarSessaoExternaGR(inputBase());
    expect(r.sucesso).toBe(false);
    expect(p.sessao.create).not.toHaveBeenCalled();
  });

  it("rejeita métrica que não é de GR/treino (RN-GR-2)", async () => {
    p.metricaConfig.findMany.mockResolvedValue([
      { id: METRICA_GR, aplicaSoGuardaRedes: false, contexto: "TREINO" },
    ]);
    const r = await criarSessaoExternaGR({
      ...inputBase(),
      metricas: [{ metricaId: METRICA_GR, atletaId: GR1, valor: 4 }],
    });
    expect(r.sucesso).toBe(false);
    expect(p.sessao.create).not.toHaveBeenCalled();
  });

  it("grava métricas de GR válidas", async () => {
    const r = await criarSessaoExternaGR({
      ...inputBase(),
      metricas: [{ metricaId: METRICA_GR, atletaId: GR1, valor: 4 }],
    });
    expect(r.sucesso).toBe(true);
    expect(p.valorMetricaSessao.createMany).toHaveBeenCalledWith({
      data: [{ sessaoId: SESSAO, metricaId: METRICA_GR, atletaId: GR1, valor: 4 }],
    });
  });
});

describe("listarSessoesExternasGR", () => {
  it("devolve as sessões EXTERNA_GR do escalão na época ativa", async () => {
    p.sessao.findMany.mockResolvedValue([
      {
        id: SESSAO,
        data: new Date("2026-09-01"),
        duracaoMin: 45,
        local: "Pavilhão",
        entidadeExterna: "Estágio FPF",
        objetivo: "Reflexos",
        presencas: [{ atletaId: GR1, atleta: { nome: "João GR", numero: 1 } }],
        _count: { valoresMetricas: 3 },
      },
    ]);
    const r = await listarSessoesExternasGR(ESCALAO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados).toHaveLength(1);
    expect(r.dados[0].participantes).toEqual([{ atletaId: GR1, nome: "João GR", numero: 1 }]);
    expect(r.dados[0].totalMetricas).toBe(3);
    expect(p.sessao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tipoSessao: "EXTERNA_GR", escalaoId: ESCALAO }),
      }),
    );
  });

  it("falha sem permissão de leitura no escalão", async () => {
    (podeLerEscalao as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const r = await listarSessoesExternasGR(ESCALAO);
    expect(r.sucesso).toBe(false);
  });
});

describe("apagarSessaoExternaGR", () => {
  it("apaga a sessão externa (cascata) quando existe e há permissão", async () => {
    p.sessao.findFirst.mockResolvedValue({ id: SESSAO, escalaoId: ESCALAO });
    const r = await apagarSessaoExternaGR(SESSAO);
    expect(r.sucesso).toBe(true);
    expect(p.sessao.delete).toHaveBeenCalledWith({ where: { id: SESSAO } });
  });

  it("falha quando a sessão não é EXTERNA_GR / não existe no clube", async () => {
    p.sessao.findFirst.mockResolvedValue(null);
    const r = await apagarSessaoExternaGR(SESSAO);
    expect(r.sucesso).toBe(false);
    expect(p.sessao.delete).not.toHaveBeenCalled();
  });
});
