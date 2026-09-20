import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * RN-JV-15 (§8.25.6) — inserção/edição retroativa de tempos de jogo **sem sessão
 * ao vivo prévia**. Cobre a Fase D da unificação do registo de jogo: preencher os
 * minutos inteiramente à mão (o treinador nunca ligou o Modo Jogo ao Vivo) tem de
 * persistir em `EstatisticaAtleta`, convergir com o caminho ao vivo para os mesmos
 * intervalos, não apagar os eventos clássicos (golos/cartões) e continuar a
 * funcionar quando já existe uma sessão terminada.
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
vi.mock("@/lib/db", () => ({
  prisma: {
    jogo: { findFirst: vi.fn(), update: vi.fn() },
    convocatoria: { findMany: vi.fn() },
    sessaoJogoAoVivo: { create: vi.fn(), update: vi.fn() },
    eventoJogo: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    estatisticaAtleta: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import {
  editarEventosJogoAoVivo,
  terminarJogoAoVivo,
} from "@/lib/actions/jogo-ao-vivo";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const ESC_ID = "ckv9v0z1w0000abcd1234efga";
const JOGO_ID = "ckv9v0z1w0000abcd1234efgb";
const A = "ckv9v0z1w0000abcd1234efaa"; // titular, joga tudo
const B = "ckv9v0z1w0000abcd1234efbb"; // entra a meio, sai antes do fim
const BANCO = "ckv9v0z1w0000abcd1234efcc"; // convocado que nunca joga

const M = 60; // segundos por minuto

// Helper de mock com a superfície que estes testes usam.
type MockFn = {
  mockResolvedValue: (v: unknown) => MockFn;
  mockResolvedValueOnce: (v: unknown) => MockFn;
  mockImplementation: (f: (...a: unknown[]) => unknown) => MockFn;
  mock: { calls: unknown[][] };
};
const mock = (fn: unknown) => fn as unknown as MockFn;
const calls = (fn: unknown) => (fn as unknown as MockFn).mock.calls;

// Jogo base (sem sessão ao vivo — o cenário RN-JV-15 «à mão do zero»).
const JOGO_SEM_SESSAO = {
  id: JOGO_ID,
  epocaId: "ep1",
  escalaoId: ESC_ID,
  formato: "FUTSAL_5",
  modalidadeAtividade: null,
  numeroPartes: 2,
  relatorio: null,
  escalao: { seccao: { modalidade: "FUTSAL" } },
  sessaoAoVivo: null,
};

const SESSAO_TERMINADA = {
  jogoId: JOGO_ID,
  numeroPartes: 2,
  duracaoParteMins: 20,
  estado: "TERMINADO",
  parteAtual: 2,
  segundosDecorridos: 40 * M,
  aCorrerDesde: null,
};
const JOGO_COM_SESSAO_TERMINADA = {
  ...JOGO_SEM_SESSAO,
  sessaoAoVivo: SESSAO_TERMINADA,
};

// Intervalos de referência: A joga tudo, B entra a meio e sai, BANCO fica de fora.
const EVENTOS_INPUT = [
  { tipo: "INICIO_PARTE", segundoJogo: 0, parte: 1 },
  { tipo: "ENTRADA", atletaId: A, segundoJogo: 0, parte: 1 },
  { tipo: "ENTRADA", atletaId: B, segundoJogo: 10 * M, parte: 1 },
  { tipo: "SAIDA", atletaId: B, segundoJogo: 28 * M, parte: 1 },
  { tipo: "FIM_PARTE", segundoJogo: 40 * M, parte: 1 },
];

// Como o `eventoJogo.findMany` devolve esses eventos depois de recriados (inclui
// `criadoEm`, que o caminho «terminar» usa para derivar quem está em campo).
const EVENTOS_DB = [
  { tipo: "INICIO_PARTE", atletaId: null, segundoJogo: 0, parte: 1, criadoEm: new Date(0) },
  { tipo: "ENTRADA", atletaId: A, segundoJogo: 0, parte: 1, criadoEm: new Date(1) },
  { tipo: "ENTRADA", atletaId: B, segundoJogo: 10 * M, parte: 1, criadoEm: new Date(2) },
  { tipo: "SAIDA", atletaId: B, segundoJogo: 28 * M, parte: 1, criadoEm: new Date(3) },
  { tipo: "FIM_PARTE", atletaId: null, segundoJogo: 40 * M, parte: 1, criadoEm: new Date(4) },
];

const CONVOCADOS = [
  { atletaId: A, titularPrevisto: true },
  { atletaId: B, titularPrevisto: false },
  { atletaId: BANCO, titularPrevisto: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  mock(obterClubeIdAtual).mockResolvedValue("clube1");
  mock(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
  mock(exigirCapacidade).mockResolvedValue({ ok: true });
  mock(prisma.jogo.findFirst).mockResolvedValue(JOGO_SEM_SESSAO);
  mock(prisma.convocatoria.findMany).mockResolvedValue(CONVOCADOS);
  mock(prisma.sessaoJogoAoVivo.create).mockResolvedValue(SESSAO_TERMINADA);
  mock(prisma.sessaoJogoAoVivo.update).mockResolvedValue(SESSAO_TERMINADA);
  mock(prisma.eventoJogo.findMany).mockResolvedValue(EVENTOS_DB);
  mock(prisma.eventoJogo.createMany).mockResolvedValue({ count: EVENTOS_DB.length });
  mock(prisma.eventoJogo.deleteMany).mockResolvedValue({ count: 0 });
  mock(prisma.eventoJogo.create).mockResolvedValue({ id: "evt" });
  mock(prisma.estatisticaAtleta.upsert).mockResolvedValue({});
  mock(prisma.$transaction).mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

/** Mapa atletaId → { minutos, utilizacao } a partir das chamadas ao upsert. */
function minutosPersistidos(desdeIndice = 0): Map<
  string,
  { minutos: number | null; utilizacao: string }
> {
  const m = new Map<string, { minutos: number | null; utilizacao: string }>();
  for (const c of calls(prisma.estatisticaAtleta.upsert).slice(desdeIndice)) {
    const arg = c[0] as {
      where: { jogoId_atletaId: { atletaId: string } };
      update: { minutos: number | null; utilizacao: string };
    };
    m.set(arg.where.jogoId_atletaId.atletaId, {
      minutos: arg.update.minutos,
      utilizacao: arg.update.utilizacao,
    });
  }
  return m;
}

describe("editarEventosJogoAoVivo — inserção retroativa SEM sessão prévia (RN-JV-15)", () => {
  it("persiste minutos/utilização (upsert de todos os convocados) sem exigir sessão", async () => {
    const res = await editarEventosJogoAoVivo(JOGO_ID, EVENTOS_INPUT);
    expect(res.sucesso).toBe(true);

    const m = minutosPersistidos();
    // Upsert de TODOS os convocados (RN-JV-13 alargada) — inclui quem não jogou.
    expect(m.size).toBe(3);
    expect(m.get(A)).toEqual({ minutos: 40, utilizacao: "TITULAR" });
    expect(m.get(B)).toEqual({ minutos: 18, utilizacao: "UTILIZADO" });
    expect(m.get(BANCO)).toEqual({ minutos: null, utilizacao: "NAO_UTILIZADO" });
  });

  it("materializa uma SessaoJogoAoVivo mínima (TERMINADO) quando nunca existiu", async () => {
    await editarEventosJogoAoVivo(JOGO_ID, EVENTOS_INPUT);

    expect(calls(prisma.sessaoJogoAoVivo.create)).toHaveLength(1);
    const dados = (calls(prisma.sessaoJogoAoVivo.create)[0][0] as { data: Record<string, unknown> })
      .data;
    expect(dados).toMatchObject({
      jogoId: JOGO_ID,
      numeroPartes: 2, // herdado do jogo
      estado: "TERMINADO",
      parteAtual: 1,
      segundosDecorridos: 40 * M, // maior FIM_PARTE
      aCorrerDesde: null,
    });
  });

  it("não apaga os eventos clássicos (golos/cartões): o delete só toca no cronómetro", async () => {
    await editarEventosJogoAoVivo(JOGO_ID, EVENTOS_INPUT);

    const where = (
      calls(prisma.eventoJogo.deleteMany)[0][0] as { where: { tipo: { in: string[] } } }
    ).where;
    const apagados = where.tipo.in;
    // Só os tipos do cronómetro/quintetos são substituídos.
    expect(apagados.sort()).toEqual(
      ["ENTRADA", "FIM_PARTE", "INICIO_PARTE", "PAUSA", "RETOMA", "SAIDA"].sort(),
    );
    // Os tipos clássicos NUNCA entram no deleteMany.
    for (const classico of ["GOLO", "GOLO_SOFRIDO", "ASSISTENCIA", "CARTAO_AMARELO", "CARTAO_VERMELHO"]) {
      expect(apagados).not.toContain(classico);
    }
  });

  it("sem eventos (limpeza total) NÃO cria sessão, mas ainda faz upsert dos convocados", async () => {
    const res = await editarEventosJogoAoVivo(JOGO_ID, []);
    expect(res.sucesso).toBe(true);
    expect(calls(prisma.sessaoJogoAoVivo.create)).toHaveLength(0);
    expect(calls(prisma.eventoJogo.createMany)).toHaveLength(0);
    // Continua a normalizar a grelha (todos os convocados a null/NAO_UTILIZADO).
    // Nota: findMany devolve EVENTOS_DB no mock, mas o teste foca-se no upsert existir.
    expect(calls(prisma.estatisticaAtleta.upsert).length).toBe(3);
  });
});

describe("editarEventosJogoAoVivo — convergência com o caminho ao vivo", () => {
  it("mesmos intervalos à mão vs terminados ao vivo → minutos idênticos", async () => {
    // 1) À mão, sem sessão prévia.
    mock(prisma.jogo.findFirst).mockResolvedValue(JOGO_SEM_SESSAO);
    await editarEventosJogoAoVivo(JOGO_ID, EVENTOS_INPUT);
    const aMao = minutosPersistidos();
    const nUpsertsMao = calls(prisma.estatisticaAtleta.upsert).length;

    // 2) Ao vivo: mesma lista de eventos, sessão em curso a terminar.
    mock(prisma.jogo.findFirst).mockResolvedValue({
      ...JOGO_SEM_SESSAO,
      sessaoAoVivo: { ...SESSAO_TERMINADA, estado: "EM_CURSO" },
    });
    await terminarJogoAoVivo(JOGO_ID, 40 * M);
    const aoVivo = minutosPersistidos(nUpsertsMao);

    for (const id of [A, B, BANCO]) {
      expect(aoVivo.get(id)).toEqual(aMao.get(id));
    }
    expect(aMao.get(A)).toEqual({ minutos: 40, utilizacao: "TITULAR" });
    expect(aMao.get(B)).toEqual({ minutos: 18, utilizacao: "UTILIZADO" });
  });
});

describe("editarEventosJogoAoVivo — não-regressão com sessão existente", () => {
  it("jogo com sessão ao vivo terminada continua editável e a sessão é preservada", async () => {
    mock(prisma.jogo.findFirst).mockResolvedValue(JOGO_COM_SESSAO_TERMINADA);

    const res = await editarEventosJogoAoVivo(JOGO_ID, EVENTOS_INPUT);
    expect(res.sucesso).toBe(true);

    // Sessão já existia → não se cria nem altera outra.
    expect(calls(prisma.sessaoJogoAoVivo.create)).toHaveLength(0);
    expect(calls(prisma.sessaoJogoAoVivo.update)).toHaveLength(0);

    // Os minutos recalculados persistem na mesma.
    const m = minutosPersistidos();
    expect(m.get(A)).toEqual({ minutos: 40, utilizacao: "TITULAR" });
    expect(m.get(B)).toEqual({ minutos: 18, utilizacao: "UTILIZADO" });
  });
});
