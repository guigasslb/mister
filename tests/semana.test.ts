import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Pure helpers (sem mocks) ────────────────────────────────────────────────
import {
  segundaFeira,
  domingo,
  numeroSemana,
  semanaSobrepoePlaneamento,
  inicioDoDia,
  treinoConcluido,
} from "@/lib/semana";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("lib/semana — helpers puros", () => {
  it("segundaFeira devolve a segunda (00:00) da semana ISO", () => {
    // 2026-09-02 é quarta; a segunda da semana é 2026-08-31.
    const seg = segundaFeira(d("2026-09-02"));
    expect(seg.getFullYear()).toBe(2026);
    expect(seg.getMonth()).toBe(7); // agosto (0-based)
    expect(seg.getDate()).toBe(31);
    expect(seg.getHours()).toBe(0);
    expect(seg.getMinutes()).toBe(0);
  });

  it("segundaFeira trata o domingo como fim da semana anterior", () => {
    // 2026-09-06 é domingo; a sua segunda é 2026-08-31.
    const seg = segundaFeira(d("2026-09-06"));
    expect(seg.getDate()).toBe(31);
    expect(seg.getMonth()).toBe(7);
  });

  it("domingo devolve o domingo (00:00) da semana ISO", () => {
    const dom = domingo(d("2026-09-02"));
    expect(dom.getDate()).toBe(6);
    expect(dom.getMonth()).toBe(8); // setembro
  });

  it("numeroSemana conta 1, 2, 3 desde a segunda da época", () => {
    const inicio = d("2026-08-31"); // segunda
    expect(numeroSemana(inicio, d("2026-08-31"))).toBe(1);
    expect(numeroSemana(inicio, d("2026-09-02"))).toBe(1); // mesma semana
    expect(numeroSemana(inicio, d("2026-09-06"))).toBe(1); // domingo dessa semana
    expect(numeroSemana(inicio, d("2026-09-07"))).toBe(2);
    expect(numeroSemana(inicio, d("2026-09-14"))).toBe(3);
  });

  it("semanaSobrepoePlaneamento deteta interseção de intervalos", () => {
    const seg = d("2026-08-31");
    const dom = d("2026-09-06");
    expect(semanaSobrepoePlaneamento(seg, dom, d("2026-08-31"), d("2026-09-06"))).toBe(true);
    expect(semanaSobrepoePlaneamento(seg, dom, d("2026-09-05"), d("2026-09-12"))).toBe(true);
    expect(semanaSobrepoePlaneamento(seg, dom, d("2026-09-07"), d("2026-09-13"))).toBe(false);
  });

  it("inicioDoDia zera a hora mantendo o dia local", () => {
    const inicio = inicioDoDia(d("2026-09-02"));
    expect(inicio.getFullYear()).toBe(2026);
    expect(inicio.getMonth()).toBe(8); // setembro
    expect(inicio.getDate()).toBe(2);
    expect(inicio.getHours()).toBe(0);
    expect(inicio.getMinutes()).toBe(0);
    expect(inicio.getSeconds()).toBe(0);
  });

  it("treinoConcluido: true só quando a data é estritamente anterior a hoje", () => {
    const agora = d("2026-09-10"); // referência de "hoje"
    // Ontem (qualquer hora) → concluído.
    expect(treinoConcluido(d("2026-09-09"), agora)).toBe(true);
    expect(treinoConcluido(new Date("2026-09-09T23:59:00"), agora)).toBe(true);
    // Hoje (mesmo de manhã) → ainda não concluído (pode acontecer mais logo).
    expect(treinoConcluido(new Date("2026-09-10T00:00:00"), agora)).toBe(false);
    expect(treinoConcluido(new Date("2026-09-10T20:00:00"), agora)).toBe(false);
    // Amanhã → futuro, não concluído.
    expect(treinoConcluido(d("2026-09-11"), agora)).toBe(false);
  });
});

// ─── obterSessoesPorSemana ───────────────────────────────────────────────────
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
    sessao: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    planeamento: { findMany: vi.fn(), findFirst: vi.fn() },
    escalao: { findFirst: vi.fn() },
  },
}));

import { obterSessoesPorSemana } from "@/lib/actions/semana";
import { criarSessao } from "@/lib/actions/treinos";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { podeLerEscalao, exigirCapacidade } from "@/lib/permissoes";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const ESC_ID = "ckv9v0z1w0000abcd1234efga";

const mocked = <T,>(fn: T) =>
  fn as unknown as { mockResolvedValue: (v: unknown) => void };
const calls = (fn: unknown) => (fn as { mock: { calls: unknown[][] } }).mock.calls;

const EPOCA = {
  id: "ep1",
  nome: "2026/27",
  dataInicio: new Date("2026-08-31T00:00:00"),
  dataFim: new Date("2027-06-30T00:00:00"),
};

const sessao = (
  id: string,
  data: string,
  momentoSemana: string | null,
  exercicios = 0,
) => ({
  id,
  data: new Date(`${data}T18:00:00`),
  tipoSessao: "NORMAL" as const,
  objetivo: null,
  duracaoMin: 90,
  momentoSemana,
  _count: { exercicios },
});

describe("obterSessoesPorSemana", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked(obterClubeIdAtual).mockResolvedValue("clube1");
    mocked(obterEpocaAtiva).mockResolvedValue(EPOCA);
    mocked(podeLerEscalao).mockResolvedValue(true);
  });

  it("falha sem permissão no escalão", async () => {
    mocked(podeLerEscalao).mockResolvedValue(false);
    const r = await obterSessoesPorSemana({ escalaoId: ESC_ID });
    expect(r.sucesso).toBe(false);
  });

  it("agrupa sessões por semana, ordena da mais recente para a mais antiga", async () => {
    mocked(prisma.sessao.findMany).mockResolvedValue([
      sessao("s1", "2026-09-02", "MD_MENOS_2"), // semana 1 (Mon 08-31)
      sessao("s2", "2026-09-04", "MD_MENOS_2"), // semana 1
      sessao("s3", "2026-09-09", "MD_MENOS_1"), // semana 2 (Mon 09-07)
      sessao("s4", "2026-09-11", "MD_MAIS_1"), // semana 2
    ]);
    mocked(prisma.planeamento.findMany).mockResolvedValue([
      {
        id: "plan1",
        nome: "Semana do arranque",
        modoSemana: "TEXTO_LIVRE",
        dataInicio: new Date("2026-08-31T00:00:00"),
        dataFim: new Date("2026-09-06T00:00:00"),
      },
    ]);

    const r = await obterSessoesPorSemana({ escalaoId: ESC_ID });
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;

    expect(r.dados).toHaveLength(2);

    // Mais recente primeiro: semana 2 (sem planeamento).
    const [semanaRecente, semanaAntiga] = r.dados;
    expect(semanaRecente.semanaNumero).toBe(2);
    expect(semanaRecente.nome).toBe("Semana 2");
    expect(semanaRecente.planeamentoId).toBeUndefined();
    expect(semanaRecente.momentoSemana).toBeUndefined(); // MD-1 e MD+1 divergem
    expect(semanaRecente.sessoes.map((s) => s.id)).toEqual(["s3", "s4"]);
    expect(semanaRecente.dataInicio.getDate()).toBe(7); // segunda 09-07
    expect(semanaRecente.dataFim.getDate()).toBe(13); // domingo 09-13

    // Semana 1: herda nome/modo do planeamento e tem momento unânime.
    expect(semanaAntiga.semanaNumero).toBe(1);
    expect(semanaAntiga.nome).toBe("Semana do arranque");
    expect(semanaAntiga.planeamentoId).toBe("plan1");
    expect(semanaAntiga.modoSemana).toBe("TEXTO_LIVRE");
    expect(semanaAntiga.momentoSemana).toBe("MD_MENOS_2");
    expect(semanaAntiga.sessoes.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(semanaAntiga.dataInicio.getDate()).toBe(31); // segunda 08-31
  });

  it("usa fallback numérico quando o planeamento não tem nome", async () => {
    mocked(prisma.sessao.findMany).mockResolvedValue([sessao("s1", "2026-09-02", null)]);
    mocked(prisma.planeamento.findMany).mockResolvedValue([
      {
        id: "plan1",
        nome: null,
        modoSemana: "ESTRUTURADO",
        dataInicio: new Date("2026-08-31T00:00:00"),
        dataFim: new Date("2026-09-06T00:00:00"),
      },
    ]);
    const r = await obterSessoesPorSemana({ escalaoId: ESC_ID });
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados[0].nome).toBe("Semana 1");
      expect(r.dados[0].planeamentoId).toBe("plan1");
    }
  });
});

// ─── Auto-associação em criarSessao ──────────────────────────────────────────
describe("criarSessao — auto-associação ao planeamento (§8.9.1)", () => {
  const PERM_OK = { ok: true, ctx: { clube: { id: "clube1" } } };

  beforeEach(() => {
    vi.clearAllMocks();
    mocked(auth).mockResolvedValue({ user: { id: "user1" } });
    mocked(obterClubeIdAtual).mockResolvedValue("clube1");
    mocked(obterEpocaAtiva).mockResolvedValue(EPOCA);
    mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: ESC_ID, clubeId: "clube1" });
    mocked(prisma.sessao.create).mockResolvedValue({ id: "sess1" });
  });

  it("associa automaticamente quando a data cai num planeamento (sessão NORMAL)", async () => {
    mocked(prisma.planeamento.findFirst).mockResolvedValue({ id: "planX" });
    const r = await criarSessao({
      data: "2026-09-02",
      escalaoId: ESC_ID,
      tipoSessao: "NORMAL",
      momentoSemana: "MD_MENOS_1",
    });
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.sessao.create)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.planeamentoId).toBe("planX");
    expect(arg.data.momentoSemana).toBe("MD_MENOS_1");
  });

  it("deixa planeamentoId a null quando nenhum planeamento contém a data", async () => {
    mocked(prisma.planeamento.findFirst).mockResolvedValue(null);
    const r = await criarSessao({
      data: "2026-09-02",
      escalaoId: ESC_ID,
      tipoSessao: "NORMAL",
    });
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.sessao.create)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.planeamentoId).toBeNull();
  });

  it("não auto-associa sessões não-NORMAL (ABERTO)", async () => {
    const r = await criarSessao({
      data: "2026-09-02",
      escalaoId: ESC_ID,
      tipoSessao: "ABERTO",
    });
    expect(r.sucesso).toBe(true);
    // A auto-associação não deve sequer consultar planeamentos.
    expect(prisma.planeamento.findFirst).not.toHaveBeenCalled();
    const arg = calls(prisma.sessao.create)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.planeamentoId).toBeNull();
  });

  it("respeita o planeamentoId explícito sem sobrepor com auto-associação", async () => {
    const PLAN_ID = "ckv9v0z1w0000abcd1234efgb";
    // findFirst é usado para validar o planeamento explícito.
    mocked(prisma.planeamento.findFirst).mockResolvedValue({ id: PLAN_ID, escalaoId: ESC_ID });
    const r = await criarSessao({
      data: "2026-09-02",
      escalaoId: ESC_ID,
      tipoSessao: "NORMAL",
      planeamentoId: PLAN_ID,
    });
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.sessao.create)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.planeamentoId).toBe(PLAN_ID);
  });
});
