import { describe, it, expect, vi, beforeEach } from "vitest";

// P4.8 (§8.20) — Carga de treino (RPE / ACWR).

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/epoca-context", () => ({
  obterClubeIdAtual: vi.fn(),
  obterEpocaAtiva: vi.fn(),
  COOKIE_EPOCA: "epoca_ativa",
}));

vi.mock("@/lib/permissoes", () => ({
  obterMembroAtual: vi.fn(),
  podeLerEscalao: vi.fn(),
  exigirCapacidade: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    sessao: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    atleta: { findFirst: vi.fn() },
    atletaEscalao: { findMany: vi.fn() },
    escalao: { findFirst: vi.fn() },
    rpeAtleta: { upsert: vi.fn(), findMany: vi.fn() },
  },
}));

import {
  registarRpeSchema,
  registarRpeSessaoSchema,
} from "@/lib/schemas/cargaTreino";
import {
  calcularCargaSemanal,
  classificarAcwr,
  inicioSemana,
  type SessaoCarga,
} from "@/lib/utils/cargaTreino";
import {
  registarRpeSessao,
  registarRpeAtleta,
  obterCargaSemanal,
  obterCargaAtletas,
} from "@/lib/actions/cargaTreino";
import { auth } from "@/lib/auth";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import {
  obterMembroAtual,
  podeLerEscalao,
  exigirCapacidade,
} from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const CLUBE = "ckv9v0z1w0000abcd1234efgh";
const EPOCA = "ckv9v0z1w0001abcd1234efgh";
const ESCALAO = "ckv9v0z1w0002abcd1234efgh";
const ATLETA = "ckv9v0z1w0003abcd1234efgh";
const ATLETA2 = "ckv9v0z1w0005abcd1234efgh";
const SESSAO = "ckv9v0z1w0004abcd1234efgh";

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const MS_DIA = 24 * 60 * 60 * 1000;

function membro(overrides: Record<string, unknown> = {}) {
  return {
    utilizadorId: "user1",
    membroId: "membro1",
    clube: { id: CLUBE, nome: "Clube Teste" },
    capacidades: ["RELATORIOS_VER", "TREINOS_GERIR"],
    ambito: "TODO_CLUBE",
    escaloesAtribuidos: [],
    seccoesCoordenadas: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (obterClubeIdAtual as ReturnType<typeof vi.fn>).mockResolvedValue(CLUBE);
  (obterEpocaAtiva as ReturnType<typeof vi.fn>).mockResolvedValue({ id: EPOCA, nome: "2025/26" });
  (podeLerEscalao as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  (obterMembroAtual as ReturnType<typeof vi.fn>).mockResolvedValue(membro());
  (exigirCapacidade as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, ctx: membro() });
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "user1" } });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schemas Zod
// ─────────────────────────────────────────────────────────────────────────────

describe("registarRpeSchema", () => {
  it("aceita RPE de 1 a 10", () => {
    for (const rpe of [1, 5, 10]) {
      expect(registarRpeSchema.safeParse({ sessaoId: SESSAO, rpe }).success).toBe(true);
    }
  });

  it("rejeita 0 (abaixo do mínimo)", () => {
    expect(registarRpeSchema.safeParse({ sessaoId: SESSAO, rpe: 0 }).success).toBe(false);
  });

  it("rejeita 11 (acima do máximo)", () => {
    expect(registarRpeSchema.safeParse({ sessaoId: SESSAO, rpe: 11 }).success).toBe(false);
  });

  it("rejeita valores não inteiros", () => {
    expect(registarRpeSchema.safeParse({ sessaoId: SESSAO, rpe: 5.5 }).success).toBe(false);
  });

  it("rejeita string em vez de número", () => {
    expect(registarRpeSchema.safeParse({ sessaoId: SESSAO, rpe: "7" }).success).toBe(false);
  });

  it("rejeita sessaoId não-cuid", () => {
    expect(registarRpeSchema.safeParse({ sessaoId: "abc", rpe: 5 }).success).toBe(false);
  });
});

describe("registarRpeSessaoSchema", () => {
  it("aceita rpeSessao válido", () => {
    expect(registarRpeSessaoSchema.safeParse({ sessaoId: SESSAO, rpeSessao: 8 }).success).toBe(true);
  });

  it("rejeita rpeSessao fora de 1-10", () => {
    expect(registarRpeSessaoSchema.safeParse({ sessaoId: SESSAO, rpeSessao: 0 }).success).toBe(false);
    expect(registarRpeSessaoSchema.safeParse({ sessaoId: SESSAO, rpeSessao: 11 }).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Funções puras — ACWR e zonas
// ─────────────────────────────────────────────────────────────────────────────

describe("classificarAcwr", () => {
  it("classifica pelas fronteiras 0.8 e 1.3 (§8.20)", () => {
    expect(classificarAcwr(0.5)).toBe("SUBCARGA");
    expect(classificarAcwr(0.79)).toBe("SUBCARGA");
    expect(classificarAcwr(0.8)).toBe("IDEAL");
    expect(classificarAcwr(1.0)).toBe("IDEAL");
    expect(classificarAcwr(1.3)).toBe("IDEAL");
    expect(classificarAcwr(1.31)).toBe("RISCO");
    expect(classificarAcwr(2.0)).toBe("RISCO");
    expect(classificarAcwr(null)).toBeNull();
  });
});

describe("inicioSemana", () => {
  it("normaliza qualquer dia para a segunda-feira dessa semana", () => {
    // 2026-08-12 é uma quarta-feira → segunda = 2026-08-10.
    const quarta = new Date(2026, 7, 12, 15, 30);
    const seg = inicioSemana(quarta);
    expect(seg.getDay()).toBe(1); // segunda-feira
    expect(seg.getDate()).toBe(10);
    expect(seg.getHours()).toBe(0);
  });

  it("uma segunda-feira mantém-se a si própria", () => {
    const seg = new Date(2026, 7, 10, 9, 0);
    expect(inicioSemana(seg).getDate()).toBe(10);
  });
});

describe("calcularCargaSemanal (ACWR)", () => {
  const AGORA = new Date(2026, 7, 12, 12, 0); // quarta-feira

  function sessaoNaSemana(offsetSemanas: number, duracaoMin: number, rpe: number): SessaoCarga {
    // Coloca a sessão firmemente a meio da semana desejada (mesma quarta-feira).
    return {
      data: new Date(AGORA.getTime() - offsetSemanas * 7 * MS_DIA),
      duracaoMin,
      rpeSessao: rpe,
    };
  }

  it("devolve exatamente `semanas` pontos, ordenados do mais antigo ao atual", () => {
    const dados = calcularCargaSemanal([], 8, AGORA);
    expect(dados).toHaveLength(8);
    // Sem sessões: tudo a zero e ACWR null.
    expect(dados.every((d) => d.cargaAcumulada === 0 && d.acwr === null)).toBe(true);
  });

  it("calcula carga = Σ(duracaoMin × rpeSessao) por semana", () => {
    const sessoes = [
      sessaoNaSemana(0, 60, 8), // semana atual: 480
      sessaoNaSemana(0, 30, 6), // + 180 → 660
    ];
    const dados = calcularCargaSemanal(sessoes, 8, AGORA);
    const atual = dados[dados.length - 1];
    expect(atual.cargaAcumulada).toBe(660);
    expect(atual.rpeMedia).toBe(7); // (8+6)/2
    expect(atual.nSessoes).toBe(2);
  });

  it("ACWR = carga atual / média das 4 semanas anteriores → RISCO quando > 1.3", () => {
    const sessoes = [
      sessaoNaSemana(4, 60, 5), // 300
      sessaoNaSemana(3, 60, 5), // 300
      sessaoNaSemana(2, 60, 5), // 300
      sessaoNaSemana(1, 60, 5), // 300
      sessaoNaSemana(0, 60, 8), // 480 (semana atual)
    ];
    const dados = calcularCargaSemanal(sessoes, 8, AGORA);
    const atual = dados[dados.length - 1];
    expect(atual.cargaAcumulada).toBe(480);
    // crónica = média(300,300,300,300) = 300 → ACWR = 480/300 = 1.6
    expect(atual.acwr).toBeCloseTo(1.6);
    expect(atual.zona).toBe("RISCO");
  });

  it("ACWR na zona ideal quando a carga é estável", () => {
    const sessoes = [
      sessaoNaSemana(4, 60, 5),
      sessaoNaSemana(3, 60, 5),
      sessaoNaSemana(2, 60, 5),
      sessaoNaSemana(1, 60, 5),
      sessaoNaSemana(0, 60, 5), // igual às anteriores → ACWR = 1.0
    ];
    const dados = calcularCargaSemanal(sessoes, 8, AGORA);
    const atual = dados[dados.length - 1];
    expect(atual.acwr).toBeCloseTo(1.0);
    expect(atual.zona).toBe("IDEAL");
  });

  it("ACWR de subcarga quando a carga atual cai face ao histórico", () => {
    const sessoes = [
      sessaoNaSemana(4, 60, 10), // 600
      sessaoNaSemana(3, 60, 10),
      sessaoNaSemana(2, 60, 10),
      sessaoNaSemana(1, 60, 10),
      sessaoNaSemana(0, 60, 4), // 240 → ACWR = 240/600 = 0.4
    ];
    const dados = calcularCargaSemanal(sessoes, 8, AGORA);
    const atual = dados[dados.length - 1];
    expect(atual.acwr).toBeCloseTo(0.4);
    expect(atual.zona).toBe("SUBCARGA");
  });

  it("ACWR é null quando não há semanas anteriores com carga", () => {
    const sessoes = [sessaoNaSemana(0, 60, 8)];
    const dados = calcularCargaSemanal(sessoes, 8, AGORA);
    const atual = dados[dados.length - 1];
    expect(atual.acwr).toBeNull();
    expect(atual.zona).toBeNull();
  });

  it("ignora sessões sem RPE (não há carga percebida)", () => {
    const dados = calcularCargaSemanal(
      [{ data: AGORA, duracaoMin: 60, rpeSessao: null }],
      8,
      AGORA,
    );
    const atual = dados[dados.length - 1];
    expect(atual.cargaAcumulada).toBe(0);
    expect(atual.nSessoes).toBe(0);
  });

  it("agrupa por semana local através da mudança de hora (Lisboa, 25/10/2026)", () => {
    // Regressão: os inícios de semana eram `segunda − k × 168h`; após o fim da hora
    // de verão as semanas anteriores começavam às 01:00 e nenhuma sessão lhes caía.
    const tzOriginal = process.env.TZ;
    process.env.TZ = "Europe/Lisbon";
    try {
      const agora = new Date(2026, 9, 26, 10); // segunda, já em WET
      const sessoes = [4, 3, 2, 1].map((k) => ({
        data: new Date(2026, 9, 26 - 7 * k, 10), // segundas anteriores, em WEST
        duracaoMin: 60,
        rpeSessao: 5,
      }));
      sessoes.push({ data: agora, duracaoMin: 60, rpeSessao: 8 });
      const dados = calcularCargaSemanal(sessoes, 8, agora);
      expect(dados.slice(-5).map((d) => d.inicioSemana)).toEqual([
        "2026-09-28",
        "2026-10-05",
        "2026-10-12",
        "2026-10-19",
        "2026-10-26",
      ]);
      expect(dados.slice(-5).map((d) => d.cargaAcumulada)).toEqual([300, 300, 300, 300, 480]);
      expect(dados[dados.length - 1].acwr).toBeCloseTo(1.6);
      expect(dados[dados.length - 1].zona).toBe("RISCO");
    } finally {
      if (tzOriginal === undefined) delete process.env.TZ;
      else process.env.TZ = tzOriginal;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Server Actions — escrita
// ─────────────────────────────────────────────────────────────────────────────

describe("registarRpeSessao", () => {
  it("regista o RPE da sessão com TREINOS_GERIR", async () => {
    p.sessao.findFirst.mockResolvedValue({ id: SESSAO, escalaoId: ESCALAO });
    p.sessao.update.mockResolvedValue({});
    const r = await registarRpeSessao(SESSAO, 8);
    expect(r.sucesso).toBe(true);
    expect(p.sessao.update).toHaveBeenCalledWith({
      where: { id: SESSAO },
      data: { rpeSessao: 8 },
    });
  });

  it("rejeita RPE inválido antes de tocar na BD", async () => {
    const r = await registarRpeSessao(SESSAO, 11);
    expect(r.sucesso).toBe(false);
    expect(p.sessao.findFirst).not.toHaveBeenCalled();
  });

  it("nega sem capacidade TREINOS_GERIR", async () => {
    p.sessao.findFirst.mockResolvedValue({ id: SESSAO, escalaoId: ESCALAO });
    (exigirCapacidade as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await registarRpeSessao(SESSAO, 8);
    expect(r.sucesso).toBe(false);
    expect(p.sessao.update).not.toHaveBeenCalled();
  });

  it("nega sessão de outro clube", async () => {
    p.sessao.findFirst.mockResolvedValue(null);
    const r = await registarRpeSessao(SESSAO, 8);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Sessão não encontrada");
  });
});

describe("registarRpeAtleta", () => {
  it("faz upsert do RPE individual", async () => {
    p.sessao.findFirst.mockResolvedValue({ id: SESSAO, escalaoId: ESCALAO });
    p.atleta.findFirst.mockResolvedValue({ id: ATLETA });
    p.rpeAtleta.upsert.mockResolvedValue({});
    const r = await registarRpeAtleta(SESSAO, ATLETA, 6);
    expect(r.sucesso).toBe(true);
    expect(p.rpeAtleta.upsert).toHaveBeenCalledWith({
      where: { sessaoId_atletaId: { sessaoId: SESSAO, atletaId: ATLETA } },
      create: { sessaoId: SESSAO, atletaId: ATLETA, rpe: 6 },
      update: { rpe: 6 },
    });
  });

  it("nega quando não autenticado", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await registarRpeAtleta(SESSAO, ATLETA, 6);
    expect(r.sucesso).toBe(false);
    expect(p.rpeAtleta.upsert).not.toHaveBeenCalled();
  });

  it("nega atleta de outro clube", async () => {
    p.sessao.findFirst.mockResolvedValue({ id: SESSAO, escalaoId: ESCALAO });
    p.atleta.findFirst.mockResolvedValue(null);
    const r = await registarRpeAtleta(SESSAO, ATLETA, 6);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Atleta não encontrado");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Server Action — leitura
// ─────────────────────────────────────────────────────────────────────────────

describe("obterCargaSemanal", () => {
  it("nega sem capacidade RELATORIOS_VER", async () => {
    (obterMembroAtual as ReturnType<typeof vi.fn>).mockResolvedValue(membro({ capacidades: [] }));
    const r = await obterCargaSemanal(ESCALAO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Sem permissão");
  });

  it("nega escalão inexistente", async () => {
    p.escalao.findFirst.mockResolvedValue(null);
    const r = await obterCargaSemanal(ESCALAO);
    expect(r.sucesso).toBe(false);
  });

  it("calcula o ACWR da semana atual a partir das sessões (dados mock)", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO });
    const agora = new Date();
    const semanaOffset = (k: number) => new Date(agora.getTime() - k * 7 * MS_DIA);
    p.sessao.findMany.mockResolvedValue([
      { data: semanaOffset(4), duracaoMin: 60, rpeSessao: 5 }, // 300
      { data: semanaOffset(3), duracaoMin: 60, rpeSessao: 5 }, // 300
      { data: semanaOffset(2), duracaoMin: 60, rpeSessao: 5 }, // 300
      { data: semanaOffset(1), duracaoMin: 60, rpeSessao: 5 }, // 300
      { data: semanaOffset(0), duracaoMin: 60, rpeSessao: 8 }, // 480 (atual)
    ]);

    const r = await obterCargaSemanal(ESCALAO, 8);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.temDados).toBe(true);
    expect(r.dados.semanas).toHaveLength(8);
    const atual = r.dados.semanas[r.dados.semanas.length - 1];
    expect(atual.cargaAcumulada).toBe(480);
    expect(atual.acwr).toBeCloseTo(1.6);
    expect(atual.zona).toBe("RISCO");
  });

  it("temDados=false quando não há RPE registado", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO });
    p.sessao.findMany.mockResolvedValue([]);
    const r = await obterCargaSemanal(ESCALAO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.temDados).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Server Action — ACWR individual por atleta (F2.1, §8.20)
// ─────────────────────────────────────────────────────────────────────────────

describe("obterCargaAtletas", () => {
  // Sessão "k" semanas atrás (mesma âncora do teste de obterCargaSemanal).
  const semanaOffset = (k: number) => new Date(Date.now() - k * 7 * MS_DIA);
  const rpe = (
    atletaId: string,
    k: number,
    duracaoMin: number,
    valor: number,
  ) => ({ atletaId, rpe: valor, sessao: { data: semanaOffset(k), duracaoMin } });

  it("nega sem capacidade RELATORIOS_VER", async () => {
    (obterMembroAtual as ReturnType<typeof vi.fn>).mockResolvedValue(
      membro({ capacidades: [] }),
    );
    const r = await obterCargaAtletas({ escalaoId: ESCALAO });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Sem permissão");
    expect(p.atletaEscalao.findMany).not.toHaveBeenCalled();
  });

  it("nega escalão inexistente no clube", async () => {
    p.escalao.findFirst.mockResolvedValue(null);
    const r = await obterCargaAtletas({ escalaoId: ESCALAO });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Escalão não encontrado");
  });

  it("calcula o ACWR por atleta (rpe × duração) e ordena por risco", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO });
    p.atletaEscalao.findMany.mockResolvedValue([
      // Ordem de entrada propositadamente com o IDEAL primeiro, para provar a ordenação.
      { atletaId: ATLETA2, atleta: { nome: "Bruno (ideal)" } },
      { atletaId: ATLETA, atleta: { nome: "Ana (risco)" } },
    ]);
    p.rpeAtleta.findMany.mockResolvedValue([
      // Ana: 4 semanas a 300 (60×5) + semana atual a 480 (60×8) → ACWR 1.6 → RISCO.
      rpe(ATLETA, 4, 60, 5),
      rpe(ATLETA, 3, 60, 5),
      rpe(ATLETA, 2, 60, 5),
      rpe(ATLETA, 1, 60, 5),
      rpe(ATLETA, 0, 60, 8),
      // Bruno: carga estável a 300 → ACWR 1.0 → IDEAL.
      rpe(ATLETA2, 4, 60, 5),
      rpe(ATLETA2, 3, 60, 5),
      rpe(ATLETA2, 2, 60, 5),
      rpe(ATLETA2, 1, 60, 5),
      rpe(ATLETA2, 0, 60, 5),
    ]);

    const r = await obterCargaAtletas({ escalaoId: ESCALAO });
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;

    // RISCO no topo, apesar de ter entrado em segundo.
    const [primeiro, segundo] = r.dados.atletas;
    expect(primeiro.atletaId).toBe(ATLETA);
    expect(primeiro.zona).toBe("RISCO");
    expect(primeiro.acwrAtual).toBeCloseTo(1.6);
    expect(primeiro.cargaSemanaAtual).toBe(480);

    expect(segundo.atletaId).toBe(ATLETA2);
    expect(segundo.zona).toBe("IDEAL");
    expect(segundo.acwrAtual).toBeCloseTo(1.0);
    expect(segundo.cargaSemanaAtual).toBe(300);
  });

  it("atleta sem RPE reportado surge com acwr/zona null e carga 0 (não é excluído)", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO });
    p.atletaEscalao.findMany.mockResolvedValue([
      { atletaId: ATLETA, atleta: { nome: "Ana (com RPE)" } },
      { atletaId: ATLETA2, atleta: { nome: "Bruno (sem RPE)" } },
    ]);
    p.rpeAtleta.findMany.mockResolvedValue([
      rpe(ATLETA, 4, 60, 5),
      rpe(ATLETA, 3, 60, 5),
      rpe(ATLETA, 2, 60, 5),
      rpe(ATLETA, 1, 60, 5),
      rpe(ATLETA, 0, 60, 8),
    ]);

    const r = await obterCargaAtletas({ escalaoId: ESCALAO });
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;

    expect(r.dados.atletas).toHaveLength(2);
    const semRpe = r.dados.atletas.find((a) => a.atletaId === ATLETA2);
    expect(semRpe).toBeDefined();
    expect(semRpe!.acwrAtual).toBeNull();
    expect(semRpe!.zona).toBeNull();
    expect(semRpe!.cargaSemanaAtual).toBe(0);
    // Sem dados fica no fim (a seguir a quem tem zona).
    expect(r.dados.atletas[r.dados.atletas.length - 1].atletaId).toBe(ATLETA2);
  });

  it("aplica default de 6 semanas quando não é indicado", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO });
    p.atletaEscalao.findMany.mockResolvedValue([
      { atletaId: ATLETA, atleta: { nome: "Ana" } },
    ]);
    p.rpeAtleta.findMany.mockResolvedValue([]);

    const r = await obterCargaAtletas({ escalaoId: ESCALAO });
    expect(r.sucesso).toBe(true);
    // A janela pedida à BD deve cobrir ~6 semanas (5 semanas antes do início da atual).
    const arg = p.rpeAtleta.findMany.mock.calls[0][0];
    const gte: Date = arg.where.sessao.data.gte;
    const semanasAtras = (Date.now() - gte.getTime()) / (7 * MS_DIA);
    expect(semanasAtras).toBeGreaterThan(4.9);
    expect(semanasAtras).toBeLessThan(6.1);
  });

  it("escalão com 0 atletas ativos devolve lista vazia (sem erro)", async () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO });
    p.atletaEscalao.findMany.mockResolvedValue([]);
    p.rpeAtleta.findMany.mockResolvedValue([]);

    const r = await obterCargaAtletas({ escalaoId: ESCALAO });
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.atletas).toEqual([]);
  });

  it("filtra RPE pela época ativa (epocaId) — RPE de outra época é ignorado pela query", async () => {
    // A action passa `epocaId: epoca.id` ao prisma.rpeAtleta.findMany.
    // Este teste verifica que o argumento da query inclui o filtro correto.
    p.escalao.findFirst.mockResolvedValue({ id: ESCALAO });
    p.atletaEscalao.findMany.mockResolvedValue([
      { atletaId: ATLETA, atleta: { nome: "Ana" } },
    ]);
    p.rpeAtleta.findMany.mockResolvedValue([]);

    await obterCargaAtletas({ escalaoId: ESCALAO });

    const arg = p.rpeAtleta.findMany.mock.calls[0][0];
    // O filtro da sessão deve restringir pela época ativa.
    expect(arg.where.sessao).toMatchObject({ epocaId: EPOCA });
    // E pelo escalão correto — garante que RPE de outros escalões da mesma época também não vaza.
    expect(arg.where.sessao).toMatchObject({ escalaoId: ESCALAO });
  });
});
