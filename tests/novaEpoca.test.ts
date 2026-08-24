import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: vi.fn(), get: vi.fn() }),
}));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));
vi.mock("@/lib/epoca-context", () => ({
  obterEpocaAtiva: vi.fn(),
  COOKIE_EPOCA: "epoca_ativa",
}));
vi.mock("@/lib/permissoes", () => ({
  exigirCapacidade: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    escalao: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    seccao: { findFirst: vi.fn() },
    licenca: { findFirst: vi.fn() },
    atletaEscalao: { findMany: vi.fn(), createMany: vi.fn() },
    atleta: { findMany: vi.fn() },
    epoca: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    utilizador: { findUnique: vi.fn() },
    membroClube: { findFirst: vi.fn(), count: vi.fn(), update: vi.fn(), create: vi.fn() },
    clube: { create: vi.fn() },
    perfil: { create: vi.fn() },
    metricaConfig: { findMany: vi.fn(), createMany: vi.fn() },
    exercicio: { findMany: vi.fn(), createMany: vi.fn() },
    modeloJogo: { findMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { prisma } from "@/lib/db";
import {
  transicaoAtletaSchema,
  novaEpocaStep1Schema,
  promocaoEscalaoSchema,
  novaEpocaRolloverSchema,
  novoClubeSchema,
  calcularIdade,
  deveSerPromovido,
} from "@/lib/schemas/novaEpoca";
import {
  verificarElegibilidadeWizard,
  criarEpocaRollover,
  criarNovoClube,
  sugerirPromocoes,
} from "@/lib/actions/novaEpoca";

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockImplementation: (f: (...a: unknown[]) => unknown) => void;
  };
const calls = (fn: unknown) => (fn as { mock: { calls: unknown[][] } }).mock.calls;

// cuids válidos (25 chars, começam por 'c').
const AT1 = "cku000000000000000000at01";
const AT2 = "cku000000000000000000at02";
const AT3 = "cku000000000000000000at03";
const ESC_A = "cku00000000000000000esca1";
const ESC_B = "cku00000000000000000escb1";

const PERM_OK = { ok: true as const, ctx: { clube: { id: "clube1" } } };
const PERM_NAO = { ok: false as const, erro: "Sem permissão" };

// ═════════════════════════════════════════════════════════════════════════════
// 1. Schemas e helpers puros
// ═════════════════════════════════════════════════════════════════════════════

describe("transicaoAtletaSchema", () => {
  it("aceita transição mínima (atletaId + transitaParaNova)", () => {
    const r = transicaoAtletaSchema.safeParse({ atletaId: AT1, transitaParaNova: true });
    expect(r.success).toBe(true);
  });

  it("aceita novoNumero opcional/nulo", () => {
    expect(
      transicaoAtletaSchema.safeParse({ atletaId: AT1, transitaParaNova: true, novoNumero: 10 }).success,
    ).toBe(true);
    expect(
      transicaoAtletaSchema.safeParse({ atletaId: AT1, transitaParaNova: false, novoNumero: null }).success,
    ).toBe(true);
  });

  it("rejeita atletaId não-cuid", () => {
    expect(transicaoAtletaSchema.safeParse({ atletaId: "nope", transitaParaNova: true }).success).toBe(false);
  });

  it("rejeita novoNumero fora de 1..999 ou não inteiro", () => {
    expect(transicaoAtletaSchema.safeParse({ atletaId: AT1, transitaParaNova: true, novoNumero: 0 }).success).toBe(false);
    expect(transicaoAtletaSchema.safeParse({ atletaId: AT1, transitaParaNova: true, novoNumero: 1000 }).success).toBe(false);
    expect(transicaoAtletaSchema.safeParse({ atletaId: AT1, transitaParaNova: true, novoNumero: 5.5 }).success).toBe(false);
  });
});

describe("novaEpocaStep1Schema", () => {
  const base = { nome: "2026/2027", dataInicio: "2026-09-01", dataFim: "2027-06-30", escalaoIds: [ESC_A] };

  it("aceita dados válidos e faz coerce das datas", () => {
    const r = novaEpocaStep1Schema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dataInicio).toBeInstanceOf(Date);
      expect(r.data.escalaoIds).toEqual([ESC_A]);
    }
  });

  it("exige pelo menos um escalão", () => {
    expect(novaEpocaStep1Schema.safeParse({ ...base, escalaoIds: [] }).success).toBe(false);
  });

  it("rejeita dataFim <= dataInicio", () => {
    const r = novaEpocaStep1Schema.safeParse({ ...base, dataFim: "2026-08-01" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["dataFim"]);
  });

  it("rejeita nome vazio ou acima de 20 caracteres", () => {
    expect(novaEpocaStep1Schema.safeParse({ ...base, nome: "" }).success).toBe(false);
    expect(novaEpocaStep1Schema.safeParse({ ...base, nome: "x".repeat(21) }).success).toBe(false);
  });
});

describe("promocaoEscalaoSchema", () => {
  it("aceita origem ≠ destino", () => {
    const r = promocaoEscalaoSchema.safeParse({
      escalaoOrigemId: ESC_A,
      escalaoDestinoId: ESC_B,
      atletasParaPromover: [{ atletaId: AT1, transitaParaNova: true }],
    });
    expect(r.success).toBe(true);
  });

  it("rejeita origem == destino", () => {
    const r = promocaoEscalaoSchema.safeParse({
      escalaoOrigemId: ESC_A,
      escalaoDestinoId: ESC_A,
      atletasParaPromover: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("novaEpocaRolloverSchema", () => {
  it("aplica defaults [] a atletas e promoções", () => {
    const r = novaEpocaRolloverSchema.safeParse({
      nome: "2026/2027",
      dataInicio: "2026-09-01",
      dataFim: "2027-06-30",
      escalaoIds: [ESC_A],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.atletas).toEqual([]);
      expect(r.data.promocoes).toEqual([]);
    }
  });
});

describe("novoClubeSchema", () => {
  const base = { nomeClube: "Novo FC", corClube: "#1A2FD4", escalaoNome: "Seniores" };

  it("aceita dados válidos com defaults de importação a true", () => {
    const r = novoClubeSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.importarExercicios).toBe(true);
      expect(r.data.importarModelosTaticos).toBe(true);
      expect(r.data.importarMetricas).toBe(true);
    }
  });

  it("rejeita cor inválida", () => {
    expect(novoClubeSchema.safeParse({ ...base, corClube: "azul" }).success).toBe(false);
  });

  it("rejeita nome de clube com menos de 2 caracteres", () => {
    expect(novoClubeSchema.safeParse({ ...base, nomeClube: "x" }).success).toBe(false);
  });
});

describe("calcularIdade / deveSerPromovido (helpers puros)", () => {
  it("calcula a idade descontando quem ainda não fez anos", () => {
    const ref = new Date(2026, 8, 1); // 1 set 2026
    expect(calcularIdade(new Date(2010, 0, 1), ref)).toBe(16); // aniversário já passou
    expect(calcularIdade(new Date(2010, 11, 31), ref)).toBe(15); // ainda não fez anos
  });

  it("nunca devolve idade negativa (nascimento futuro)", () => {
    expect(calcularIdade(new Date(2030, 0, 1), new Date(2026, 0, 1))).toBe(0);
  });

  it("sugere promoção apenas quando a idade excede idadeMax", () => {
    const ref = new Date(2026, 8, 1);
    // 16 anos, escalão até 15 → promove
    expect(deveSerPromovido(new Date(2010, 0, 1), 15, ref)).toBe(true);
    // 15 anos, escalão até 15 → não promove (dentro do limite)
    expect(deveSerPromovido(new Date(2010, 11, 31), 15, ref)).toBe(false);
  });

  it("não sugere sem data de nascimento ou sem idadeMax", () => {
    const ref = new Date(2026, 8, 1);
    expect(deveSerPromovido(null, 15, ref)).toBe(false);
    expect(deveSerPromovido(new Date(2000, 0, 1), null, ref)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Server Actions
// ═════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  vi.clearAllMocks();
  mocked(auth).mockResolvedValue({ user: { id: "user1" } });
  mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
  mocked(obterEpocaAtiva).mockResolvedValue({ id: "epAnterior", clubeId: "clube1" });

  // $transaction interativo: invoca o callback com o próprio prisma como `tx`.
  mocked(prisma.$transaction).mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );

  mocked(prisma.escalao.findMany).mockResolvedValue([]);
  mocked(prisma.licenca.findFirst).mockResolvedValue(null);
  mocked(prisma.atletaEscalao.findMany).mockResolvedValue([]);
  mocked(prisma.atletaEscalao.createMany).mockResolvedValue({ count: 0 });
  mocked(prisma.atleta.findMany).mockResolvedValue([]);
  mocked(prisma.epoca.updateMany).mockResolvedValue({ count: 1 });
  mocked(prisma.epoca.create).mockResolvedValue({ id: "epNova" });
  mocked(prisma.epoca.findFirst).mockResolvedValue(null);
  mocked(prisma.epoca.update).mockResolvedValue({ id: "epExistente" });
  mocked(prisma.seccao.findFirst).mockResolvedValue({ id: "seccao1" });
});

// ─── verificarElegibilidadeWizard ────────────────────────────────────────────

describe("verificarElegibilidadeWizard", () => {
  it("recusa sem a capacidade CLUBE_EPOCAS (treinador adicionado pelo DT)", async () => {
    mocked(exigirCapacidade).mockResolvedValue(PERM_NAO);
    const r = await verificarElegibilidadeWizard();
    expect(r.sucesso).toBe(false);
    // exige exatamente a capacidade de gestão de épocas
    expect(calls(exigirCapacidade)[0][0]).toBe("CLUBE_EPOCAS");
  });

  it("cenário A por defeito (licença de clube) com plantel e escalões", async () => {
    mocked(prisma.escalao.findMany).mockResolvedValue([
      { id: ESC_A, nome: "Sub-15", ordem: 1 },
    ]);
    mocked(prisma.licenca.findFirst).mockResolvedValue({ tipo: "CLUBE" });
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      {
        numero: 7,
        atleta: { id: AT1, nome: "Rui", dataNascimento: null },
        escalao: { id: ESC_A, nome: "Sub-15" },
      },
    ]);
    const r = await verificarElegibilidadeWizard();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados.cenario).toBe("A");
      expect(r.dados.escaloes).toHaveLength(1);
      expect(r.dados.atletasAtivos[0]).toMatchObject({ id: AT1, numero: 7, escalaoId: ESC_A });
    }
  });

  it("cenário C quando a licença é INDIVIDUAL", async () => {
    mocked(prisma.licenca.findFirst).mockResolvedValue({ tipo: "INDIVIDUAL" });
    const r = await verificarElegibilidadeWizard();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados.cenario).toBe("C");
  });

  it("plantel vazio quando não há época ativa", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue(null);
    const r = await verificarElegibilidadeWizard();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados.atletasAtivos).toEqual([]);
    // não consulta participações sem época ativa
    expect(calls(prisma.atletaEscalao.findMany)).toHaveLength(0);
  });
});

// ─── criarEpocaRollover ──────────────────────────────────────────────────────

describe("criarEpocaRollover (cenário A/B)", () => {
  const baseA = {
    nome: "2026/2027",
    dataInicio: "2026-09-01",
    dataFim: "2027-06-30",
    escalaoIds: [ESC_A],
    atletas: [
      { atletaId: AT1, transitaParaNova: true },
      { atletaId: AT2, transitaParaNova: false }, // saiu do plantel
    ],
  };

  beforeEach(() => {
    // Escalão do clube (validação de pertença).
    mocked(prisma.escalao.findMany).mockResolvedValue([{ id: ESC_A }]);
    // Participações principais anteriores.
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { atletaId: AT1, escalaoId: ESC_A, numero: 7 },
      { atletaId: AT2, escalaoId: ESC_A, numero: 9 },
    ]);
    mocked(prisma.atleta.findMany).mockResolvedValue([{ id: AT1 }]);
  });

  it("recusa input inválido sem tocar na BD", async () => {
    const r = await criarEpocaRollover({ nome: "" });
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("recusa sem a capacidade CLUBE_EPOCAS", async () => {
    mocked(exigirCapacidade).mockResolvedValue(PERM_NAO);
    const r = await criarEpocaRollover(baseA);
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("recusa escalão que não pertence ao clube", async () => {
    mocked(prisma.escalao.findMany).mockResolvedValue([]); // nenhum encontrado
    const r = await criarEpocaRollover(baseA);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não pertence/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("cria a nova época ativa e transita só quem foi marcado (mesmo escalão)", async () => {
    const r = await criarEpocaRollover(baseA);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados.epocaId).toBe("epNova");

    // Desmarca as épocas anteriores e cria a nova como ativa.
    expect(prisma.epoca.updateMany).toHaveBeenCalledWith({
      where: { clubeId: "clube1" },
      data: { ativa: false },
    });
    const epArgs = calls(prisma.epoca.create)[0][0] as { data: { ativa: boolean; clubeId: string } };
    expect(epArgs.data.ativa).toBe(true);
    expect(epArgs.data.clubeId).toBe("clube1");

    // Só AT1 transita (AT2 foi desmarcado); herda o número anterior (7).
    const partArgs = calls(prisma.atletaEscalao.createMany)[0][0] as {
      data: Array<{ atletaId: string; escalaoId: string; epocaId: string; tipo: string; numero: number | null }>;
    };
    expect(partArgs.data).toHaveLength(1);
    expect(partArgs.data[0]).toMatchObject({
      atletaId: AT1,
      escalaoId: ESC_A,
      epocaId: "epNova",
      tipo: "PRINCIPAL",
      numero: 7,
    });
  });

  it("aplica novoNumero quando indicado", async () => {
    const r = await criarEpocaRollover({
      ...baseA,
      atletas: [{ atletaId: AT1, transitaParaNova: true, novoNumero: 10 }],
    });
    expect(r.sucesso).toBe(true);
    const partArgs = calls(prisma.atletaEscalao.createMany)[0][0] as {
      data: Array<{ numero: number | null }>;
    };
    expect(partArgs.data[0].numero).toBe(10);
  });

  it("cenário B: a promoção sobrepõe-se e coloca o atleta no escalão de destino", async () => {
    mocked(prisma.escalao.findMany).mockResolvedValue([{ id: ESC_A }, { id: ESC_B }]);
    mocked(prisma.atleta.findMany).mockResolvedValue([{ id: AT1 }]);
    const r = await criarEpocaRollover({
      nome: "2026/2027",
      dataInicio: "2026-09-01",
      dataFim: "2027-06-30",
      escalaoIds: [ESC_A, ESC_B],
      // AT1 aparece na transição regular (ESC_A) e também na promoção (→ ESC_B).
      atletas: [{ atletaId: AT1, transitaParaNova: true }],
      promocoes: [
        {
          escalaoOrigemId: ESC_A,
          escalaoDestinoId: ESC_B,
          atletasParaPromover: [{ atletaId: AT1, transitaParaNova: true, novoNumero: 4 }],
        },
      ],
    });
    expect(r.sucesso).toBe(true);
    const partArgs = calls(prisma.atletaEscalao.createMany)[0][0] as {
      data: Array<{ atletaId: string; escalaoId: string; numero: number | null }>;
    };
    // uma única participação principal, no destino da promoção
    expect(partArgs.data).toHaveLength(1);
    expect(partArgs.data[0]).toMatchObject({ atletaId: AT1, escalaoId: ESC_B, numero: 4 });
  });

  it("recusa quando um atleta alvo não pertence ao clube", async () => {
    mocked(prisma.atleta.findMany).mockResolvedValue([]); // AT1 não encontrado
    const r = await criarEpocaRollover(baseA);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/atletas selecionados/i);
    // não chega a criar participações
    expect(prisma.atletaEscalao.createMany).not.toHaveBeenCalled();
  });
});

// ─── criarEpocaRollover multi-secção (§8.21) ─────────────────────────────────

describe("criarEpocaRollover — transição por secção (§8.21)", () => {
  const SEC1 = "cku00000000000000000secc1";
  const baseSeccao = {
    nome: "2026/2027",
    dataInicio: "2026-09-01",
    dataFim: "2027-06-30",
    escalaoIds: [ESC_A],
    atletas: [{ atletaId: AT1, transitaParaNova: true }],
    seccaoId: SEC1,
  };

  beforeEach(() => {
    mocked(prisma.escalao.findMany).mockResolvedValue([{ id: ESC_A }]);
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { atletaId: AT1, escalaoId: ESC_A, numero: 7 },
    ]);
    mocked(prisma.atleta.findMany).mockResolvedValue([{ id: AT1 }]);
    mocked(prisma.seccao.findFirst).mockResolvedValue({ id: SEC1 });
  });

  it("transita a secção indicada e cria a época quando ainda não existe", async () => {
    mocked(prisma.epoca.findFirst).mockResolvedValue(null);
    const r = await criarEpocaRollover(baseSeccao);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados.epocaId).toBe("epNova");
    // valida a pertença da secção ao clube
    expect(prisma.seccao.findFirst).toHaveBeenCalled();
    expect(prisma.epoca.create).toHaveBeenCalledOnce();
  });

  it("recusa uma secção que não pertence ao clube", async () => {
    mocked(prisma.seccao.findFirst).mockResolvedValue(null);
    const r = await criarEpocaRollover(baseSeccao);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/secção selecionada não pertence/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("reutiliza a época já criada por outra secção (não duplica) — mesma época p/ ambas", async () => {
    mocked(prisma.epoca.findFirst).mockResolvedValue({ id: "epExistente" });
    const r = await criarEpocaRollover(baseSeccao);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados.epocaId).toBe("epExistente");
    expect(prisma.epoca.update).toHaveBeenCalledOnce();
    expect(prisma.epoca.create).not.toHaveBeenCalled();
  });

  it("recusa escalão fora da secção indicada", async () => {
    mocked(prisma.escalao.findMany).mockResolvedValue([]); // filtro por secção não devolve nada
    const r = await criarEpocaRollover(baseSeccao);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não pertence a esta secção/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// ─── criarNovoClube ──────────────────────────────────────────────────────────

describe("criarNovoClube (cenário C)", () => {
  const base = {
    nomeClube: "Novo FC",
    corClube: "#F0531E",
    escalaoNome: "Seniores",
    importarExercicios: false,
    importarModelosTaticos: false,
    importarMetricas: false,
  };

  beforeEach(() => {
    mocked(prisma.utilizador.findUnique).mockResolvedValue({ id: "user1" });
    mocked(prisma.membroClube.findFirst).mockResolvedValue(null); // sem clube anterior
    mocked(prisma.membroClube.count).mockResolvedValue(0);
    mocked(prisma.membroClube.update).mockResolvedValue({ id: "m0" });
    mocked(prisma.membroClube.create).mockResolvedValue({ id: "m1" });
    mocked(prisma.clube.create).mockResolvedValue({ id: "clubeNovo" });
    mocked(prisma.epoca.create).mockResolvedValue({ id: "epNova" });
    mocked(prisma.escalao.create).mockResolvedValue({ id: "escNovo" });
    mocked(prisma.perfil.create).mockImplementation((args: unknown) => {
      const { data } = args as { data: { nome: string } };
      return Promise.resolve({ id: `perfil-${data.nome}` });
    });
    mocked(prisma.metricaConfig.findMany).mockResolvedValue([]);
    mocked(prisma.metricaConfig.createMany).mockResolvedValue({ count: 0 });
    mocked(prisma.exercicio.findMany).mockResolvedValue([]);
    mocked(prisma.exercicio.createMany).mockResolvedValue({ count: 0 });
    mocked(prisma.modeloJogo.findMany).mockResolvedValue([]);
    mocked(prisma.modeloJogo.createMany).mockResolvedValue({ count: 0 });
  });

  it("recusa sem sessão", async () => {
    mocked(auth).mockResolvedValue(null);
    const r = await criarNovoClube(base);
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("recusa input inválido", async () => {
    const r = await criarNovoClube({ nomeClube: "x", corClube: "nope", escalaoNome: "" });
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("cria clube + época ativa + escalão + perfis + membro admin", async () => {
    const r = await criarNovoClube(base);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados).toEqual({ clubeId: "clubeNovo", epocaId: "epNova" });

    const clubeArgs = calls(prisma.clube.create)[0][0] as { data: { nome: string; corPrimaria: string } };
    expect(clubeArgs.data).toMatchObject({ nome: "Novo FC", corPrimaria: "#F0531E" });
    const epArgs = calls(prisma.epoca.create)[0][0] as { data: { ativa: boolean; nome: string } };
    expect(epArgs.data.ativa).toBe(true);
    expect(epArgs.data.nome).toMatch(/^\d{4}\/\d{4}$/);
    const escArgs = calls(prisma.escalao.create)[0][0] as { data: { nome: string } };
    expect(escArgs.data.nome).toBe("Seniores");
    // 6 perfis de arranque (inclui Coordenador de Secção — §6.9 — e Presidente) + membro admin ATIVO
    expect(calls(prisma.perfil.create)).toHaveLength(6);
    const membroArgs = calls(prisma.membroClube.create)[0][0] as { data: { estado: string; perfilId: string } };
    expect(membroArgs.data.estado).toBe("ATIVO");
    expect(membroArgs.data.perfilId).toBe("perfil-Administrador");
  });

  it("encerra a adesão anterior (clube técnico individual sem outros membros)", async () => {
    mocked(prisma.membroClube.findFirst).mockResolvedValue({ id: "mAnt", clubeId: "clubeAnt" });
    mocked(prisma.membroClube.count).mockResolvedValue(0);
    const r = await criarNovoClube(base);
    expect(r.sucesso).toBe(true);
    const updArgs = calls(prisma.membroClube.update)[0][0] as {
      where: { id: string };
      data: { estado: string; dataSaida: Date };
    };
    expect(updArgs.where.id).toBe("mAnt");
    expect(updArgs.data.estado).toBe("INATIVO");
    expect(updArgs.data.dataSaida).toBeInstanceOf(Date);
  });

  it("recusa treinador adicionado pelo DT (adesão ativa sem CLUBE_EPOCAS)", async () => {
    mocked(prisma.membroClube.findFirst).mockResolvedValue({ id: "mAnt", clubeId: "clubeAnt" });
    mocked(exigirCapacidade).mockResolvedValue(PERM_NAO);
    const r = await criarNovoClube(base);
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("recusa quando o clube anterior tem outros membros ativos", async () => {
    mocked(prisma.membroClube.findFirst).mockResolvedValue({ id: "mAnt", clubeId: "clubeAnt" });
    mocked(prisma.membroClube.count).mockResolvedValue(2);
    const r = await criarNovoClube(base);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/outros membros/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("importa métricas/exercícios/modelos do clube anterior conforme as flags", async () => {
    mocked(prisma.membroClube.findFirst).mockResolvedValue({ id: "mAnt", clubeId: "clubeAnt" });
    mocked(prisma.membroClube.count).mockResolvedValue(0);
    mocked(prisma.metricaConfig.findMany).mockResolvedValue([
      { nome: "Dribles", tipo: "NUMERO", ativa: true, ordem: 0 },
    ]);
    mocked(prisma.exercicio.findMany).mockResolvedValue([
      { nome: "Roda de passe", descricao: null, objetivo: null, duracaoMin: 10, categoriaPrincipal: "FISICO", diagrama: null, parteTreino: "AQUECIMENTO", escalaoAlvo: null, proprietario: "TREINADOR" },
    ]);
    mocked(prisma.modeloJogo.findMany).mockResolvedValue([
      { nome: "Pressão alta", momento: "ORG_DEFENSIVA", principios: null, diagrama: null, subprincipios: null, proprietario: "TREINADOR" },
    ]);

    const r = await criarNovoClube({
      ...base,
      importarExercicios: true,
      importarModelosTaticos: true,
      importarMetricas: true,
    });
    expect(r.sucesso).toBe(true);

    const metArgs = calls(prisma.metricaConfig.createMany)[0][0] as { data: Array<{ clubeId: string }> };
    expect(metArgs.data[0].clubeId).toBe("clubeNovo");
    const exArgs = calls(prisma.exercicio.createMany)[0][0] as {
      data: Array<{ clubeId: string; autorId: string; subcategoriaId: string | null }>;
    };
    expect(exArgs.data[0]).toMatchObject({ clubeId: "clubeNovo", autorId: "user1", subcategoriaId: null });
    const mjArgs = calls(prisma.modeloJogo.createMany)[0][0] as {
      data: Array<{ clubeProprietarioId: string; escalaoId: string | null; epocaId: string | null }>;
    };
    expect(mjArgs.data[0]).toMatchObject({ clubeProprietarioId: "clubeNovo", escalaoId: null, epocaId: null });
  });

  it("não importa nada quando não há clube anterior", async () => {
    const r = await criarNovoClube({ ...base, importarMetricas: true, importarExercicios: true, importarModelosTaticos: true });
    expect(r.sucesso).toBe(true);
    expect(prisma.metricaConfig.findMany).not.toHaveBeenCalled();
    expect(prisma.exercicio.findMany).not.toHaveBeenCalled();
    expect(prisma.modeloJogo.findMany).not.toHaveBeenCalled();
  });
});

// ─── sugerirPromocoes ────────────────────────────────────────────────────────

describe("sugerirPromocoes (cenário B)", () => {
  beforeEach(() => {
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: ESC_A, idadeMax: 15 });
  });

  it("recusa escalão inválido (não-cuid) sem tocar na BD", async () => {
    const r = await sugerirPromocoes("nope");
    expect(r.sucesso).toBe(false);
    expect(calls(exigirCapacidade)).toHaveLength(0);
  });

  it("recusa sem a capacidade CLUBE_EPOCAS", async () => {
    mocked(exigirCapacidade).mockResolvedValue(PERM_NAO);
    const r = await sugerirPromocoes(ESC_A);
    expect(r.sucesso).toBe(false);
  });

  it("recusa escalão inexistente no clube", async () => {
    mocked(prisma.escalao.findFirst).mockResolvedValue(null);
    const r = await sugerirPromocoes(ESC_A);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não existe/i);
  });

  it("sugere apenas os atletas que excedem a idade máxima", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { numero: 7, atleta: { id: AT1, nome: "Velho", dataNascimento: new Date(2008, 0, 1) } }, // >15
      { numero: 9, atleta: { id: AT2, nome: "Novo", dataNascimento: new Date(2012, 0, 1) } }, // <=15
      { numero: 3, atleta: { id: AT3, nome: "SemData", dataNascimento: null } }, // sem data → não
    ]);
    const r = await sugerirPromocoes(ESC_A);
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados.atletas).toHaveLength(1);
      expect(r.dados.atletas[0]).toMatchObject({ atletaId: AT1, numeroAtual: 7 });
      expect(r.dados.atletas[0].idade).toBeGreaterThan(15);
    }
  });
});
