import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Função pura de geração de datas (sem mocks) ─────────────────────────────
import {
  gerarDatasDePlano,
  diaSemanaISO,
  chaveDia,
  combinarDataHora,
  duracaoEntreHoras,
  somarMinutos,
} from "@/lib/plano-semanal";
import { partesDataLisboa, wallClockLisbonToInstant } from "@/lib/utils-datas";

// Âncoras conhecidas (2026-08-31 é uma segunda-feira — ver tests/semana.test.ts).
const D = (ano: number, mes1: number, dia: number) => new Date(ano, mes1 - 1, dia);

describe("gerarDatasDePlano — função pura (§8.8.1)", () => {
  it("gera as datas dos dias configurados no intervalo (2 dias/semana)", () => {
    const datas = gerarDatasDePlano(
      D(2026, 8, 31), // segunda
      D(2026, 9, 13), // domingo (2 semanas depois)
      [1, 3], // segunda + quarta
      D(2026, 8, 31), // hoje
    );
    expect(datas.map(chaveDia)).toEqual([
      "2026-08-31", // seg
      "2026-09-02", // qua
      "2026-09-07", // seg
      "2026-09-09", // qua
    ]);
  });

  it("nunca inclui datas anteriores a hoje", () => {
    const datas = gerarDatasDePlano(
      D(2026, 8, 31),
      D(2026, 9, 13),
      [1], // segundas
      D(2026, 9, 7), // hoje = segunda da 2ª semana
    );
    // 2026-08-31 é passado → excluída; só a segunda 09-07.
    expect(datas.map(chaveDia)).toEqual(["2026-09-07"]);
  });

  it("trata o domingo como ISO 7", () => {
    const datas = gerarDatasDePlano(D(2026, 8, 31), D(2026, 9, 13), [7], D(2026, 8, 31));
    expect(datas.map(chaveDia)).toEqual(["2026-09-06", "2026-09-13"]);
  });

  it("devolve vazio quando não há dias configurados", () => {
    expect(gerarDatasDePlano(D(2026, 8, 31), D(2026, 9, 13), [], D(2026, 8, 31))).toEqual([]);
  });

  it("devolve vazio quando o intervalo é totalmente passado", () => {
    const datas = gerarDatasDePlano(D(2026, 8, 1), D(2026, 8, 20), [1, 2, 3, 4, 5], D(2026, 9, 1));
    expect(datas).toEqual([]);
  });
});

describe("helpers de hora (§8.8.1)", () => {
  it("diaSemanaISO converte 0=domingo → 7", () => {
    expect(diaSemanaISO(D(2026, 8, 31))).toBe(1); // segunda
    expect(diaSemanaISO(D(2026, 9, 6))).toBe(7); // domingo
  });

  it("combinarDataHora aplica HH:MM ao dia (hora de parede de Lisboa)", () => {
    // Asserção ancorada a Lisboa (não a `getHours()`, que depende do fuso do
    // processo): sob TZ=UTC o instante é 17:30Z mas continua a ser 18:30 em Lisboa.
    const dt = combinarDataHora(D(2026, 9, 2), "18:30");
    const { dia, hora, minuto } = partesDataLisboa(dt);
    expect(hora).toBe(18);
    expect(minuto).toBe(30);
    expect(dia).toBe(2);
  });

  it("duracaoEntreHoras calcula minutos", () => {
    expect(duracaoEntreHoras("18:00", "19:30")).toBe(90);
    expect(duracaoEntreHoras("20:15", "21:00")).toBe(45);
  });

  it("somarMinutos soma e satura em 23:59", () => {
    expect(somarMinutos("18:00", 90)).toBe("19:30");
    expect(somarMinutos("23:00", 120)).toBe("23:59");
  });
});

// ─── Actions (com mocks) ─────────────────────────────────────────────────────
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
    planoSemanal: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    planoSemanalDia: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
    sessao: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    escalao: { findFirst: vi.fn() },
    planeamento: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { criarPlanoSemanal } from "@/lib/actions/planoSemanal";
import { atualizarSessao } from "@/lib/actions/treinos";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mocked = <T,>(fn: T) => fn as unknown as { mockResolvedValue: (v: unknown) => void; mockImplementation: (f: (...a: unknown[]) => unknown) => void };
const calls = (fn: unknown) => (fn as { mock: { calls: unknown[][] } }).mock.calls;

const ESC_ID = "ckv9v0z1w0000abcd1234efga";
const EPOCA = {
  id: "ep1",
  nome: "2026/27",
  dataInicio: D(2026, 8, 31),
  dataFim: D(2026, 9, 13),
};
const PERM_OK = { ok: true, ctx: { clube: { id: "clube1" } } };

describe("criarPlanoSemanal (§8.8.1)", () => {
  // Congela o "agora" ANTES do intervalo da época de teste (08-31…09-13) para
  // que o corte "nunca no passado" (§8.8.1) seja determinista e independente da
  // data real de execução. Instante em UTC → válido sob qualquer TZ.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T09:00:00Z"));
    vi.clearAllMocks();
    mocked(auth).mockResolvedValue({ user: { id: "user1" } });
    mocked(obterClubeIdAtual).mockResolvedValue("clube1");
    mocked(obterEpocaAtiva).mockResolvedValue(EPOCA);
    mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: ESC_ID, nome: "Sub-15" });
    // $transaction executa o callback com o próprio prisma mockado como tx.
    mocked(prisma.$transaction).mockImplementation(async (arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
    );
    mocked(prisma.sessao.createMany).mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const dadosBase = {
    escalaoId: ESC_ID,
    dataInicioGeracao: "2026-08-31",
    dias: [
      { diaSemana: 1, horaInicio: "18:00", horaFim: "19:30", tipoSessao: "NORMAL" as const },
      { diaSemana: 3, horaInicio: "18:00", horaFim: "19:30", tipoSessao: "NORMAL" as const },
    ],
  };

  it("gera o nº correto de sessões e liga-as ao plano/dia", async () => {
    mocked(prisma.planoSemanal.count).mockResolvedValue(0);
    mocked(prisma.planoSemanal.create).mockResolvedValue({
      id: "p1",
      dias: [
        { id: "d1", diaSemana: 1, horaInicio: "18:00", horaFim: "19:30", local: null, tipoSessao: "NORMAL" },
        { id: "d3", diaSemana: 3, horaInicio: "18:00", horaFim: "19:30", local: null, tipoSessao: "NORMAL" },
      ],
    });
    mocked(prisma.sessao.findMany).mockResolvedValue([]); // nenhum dia ocupado

    const r = await criarPlanoSemanal(dadosBase);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;

    // 2 segundas + 2 quartas no intervalo 08-31..09-13.
    expect(r.dados.geradas).toBe(4);
    expect(r.dados.ignoradas).toBe(0);

    const arg = calls(prisma.sessao.createMany)[0][0] as { data: Record<string, unknown>[] };
    expect(arg.data).toHaveLength(4);
    // Todas ligadas ao plano; periodização a null (passo separado, §8.9).
    for (const s of arg.data) {
      expect(s.planoSemanalId).toBe("p1");
      expect(s.planeamentoId).toBeNull();
      expect(s.duracaoMin).toBe(90);
      expect(s.personalizada).toBe(false);
    }
    // O dia da semana determina o planoSemanalDiaId.
    expect(arg.data.map((s) => s.planoSemanalDiaId).sort()).toEqual(["d1", "d1", "d3", "d3"]);
  });

  it("deduplica: datas que já têm sessão são ignoradas", async () => {
    mocked(prisma.planoSemanal.count).mockResolvedValue(0);
    mocked(prisma.planoSemanal.create).mockResolvedValue({
      id: "p1",
      dias: [{ id: "d1", diaSemana: 1, horaInicio: "18:00", horaFim: "19:30", local: null, tipoSessao: "NORMAL" }],
    });
    // Já existe uma sessão na segunda 08-31.
    mocked(prisma.sessao.findMany).mockResolvedValue([{ data: D(2026, 8, 31) }]);

    const r = await criarPlanoSemanal({ ...dadosBase, dias: [dadosBase.dias[0]] });
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    // Segundas no intervalo: 08-31 (ocupada) e 09-07 → 1 gerada, 1 ignorada.
    expect(r.dados.geradas).toBe(1);
    expect(r.dados.ignoradas).toBe(1);
    const arg = calls(prisma.sessao.createMany)[0][0] as { data: Record<string, unknown>[] };
    expect(arg.data).toHaveLength(1);
    expect(chaveDia((arg.data[0].data as Date))).toBe("2026-09-07");
  });

  it("recusa um segundo plano ativo para o mesmo (escalão, época)", async () => {
    mocked(prisma.planoSemanal.count).mockResolvedValue(1);
    const r = await criarPlanoSemanal(dadosBase);
    expect(r.sucesso).toBe(false);
    if (r.sucesso) return;
    expect(r.erro).toMatch(/já existe um plano semanal ativo/i);
    expect(prisma.planoSemanal.create).not.toHaveBeenCalled();
  });

  it("guarda época sem datas válidas", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue({ ...EPOCA, dataFim: D(2026, 7, 1) }); // fim < início
    const r = await criarPlanoSemanal(dadosBase);
    expect(r.sucesso).toBe(false);
    if (r.sucesso) return;
    expect(r.erro).toMatch(/datas de início e fim/i);
  });
});

describe("atualizarSessao — alcance ESTA_E_FUTURAS (§8.8.1)", () => {
  const SESSAO_ANCORA = {
    id: "s1",
    escalaoId: ESC_ID,
    epocaId: "ep1",
    planoSemanalId: "p1",
    planoSemanalDiaId: "d1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocked(obterClubeIdAtual).mockResolvedValue("clube1");
    mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
    mocked(prisma.sessao.findFirst).mockResolvedValue(SESSAO_ANCORA);
    mocked(prisma.planeamento.findFirst).mockResolvedValue(null);
    mocked(prisma.sessao.update).mockResolvedValue({ id: "s1", tipoSessao: "NORMAL" });
    mocked(prisma.planoSemanalDia.findUnique).mockResolvedValue({ horaInicio: "18:00", horaFim: "19:30" });
    mocked(prisma.planoSemanalDia.update).mockResolvedValue({});
    mocked(prisma.sessao.count).mockResolvedValue(2); // 2 personalizadas mantidas
    mocked(prisma.$transaction).mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma),
    );
  });

  const dados = {
    // 2026-09-07 20:00 hora de parede de Lisboa (como o <input datetime-local>
    // produz na app). Construído via `wallClockLisbonToInstant` para ser
    // independente do fuso do processo (sob TZ=UTC o instante é 19:00Z).
    data: wallClockLisbonToInstant("2026-09-07T20:00"),
    escalaoId: ESC_ID,
    tipoSessao: "NORMAL" as const,
    duracaoMin: 75,
    local: "Pavilhão B",
  };

  it("propaga o agendamento só a sessões futuras não-personalizadas", async () => {
    // 3 futuras não-personalizadas (além da âncora).
    mocked(prisma.sessao.findMany).mockResolvedValue([
      { id: "s2", data: new Date(2026, 8, 14, 18, 0) },
      { id: "s3", data: new Date(2026, 8, 21, 18, 0) },
      { id: "s4", data: new Date(2026, 8, 28, 18, 0) },
    ]);

    const r = await atualizarSessao("s1", dados, "ESTA_E_FUTURAS");
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;

    // 3 futuras + 1 âncora = 4 atualizadas; 2 personalizadas mantidas.
    expect(r.dados.propagacao).toEqual({ atualizadas: 4, personalizadasMantidas: 2 });

    // O filtro exclui personalizadas, passado e a própria âncora.
    const whereFind = (calls(prisma.sessao.findMany)[0][0] as { where: Record<string, unknown> }).where;
    expect(whereFind.planoSemanalDiaId).toBe("d1");
    expect(whereFind.personalizada).toBe(false);
    expect(whereFind.id).toEqual({ not: "s1" });
    expect(whereFind.data).toHaveProperty("gte");

    // Baseline do dia atualizado (hora nova + fim = início + duração).
    const argDia = (calls(prisma.planoSemanalDia.update)[0][0] as { data: Record<string, unknown> }).data;
    expect(argDia.horaInicio).toBe("20:00");
    expect(argDia.horaFim).toBe("21:15"); // 20:00 + 75min
    expect(argDia.local).toBe("Pavilhão B");
  });

  it("SO_ESTA marca a sessão como personalizada e não propaga", async () => {
    mocked(prisma.sessao.findMany).mockResolvedValue([]);
    const r = await atualizarSessao("s1", dados, "SO_ESTA");
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.propagacao).toBeUndefined();

    const argUpdate = (calls(prisma.sessao.update)[0][0] as { data: Record<string, unknown> }).data;
    expect(argUpdate.personalizada).toBe(true);
    // Não toca no baseline nem propaga.
    expect(prisma.planoSemanalDia.update).not.toHaveBeenCalled();
  });
});
