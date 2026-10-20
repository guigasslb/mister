import { describe, it, expect, vi, beforeEach } from "vitest";

// Calendário editável das competições (2026-10-20): Server Actions de
// registar/editar/apagar/reordenar confrontos, apagar competição com jogos (R3,
// D1–D3) e ordem persistida (R6). Prisma mockado (padrão de subequipas-competicao).

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
    competicao: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    escalao: { findFirst: vi.fn() },
    equipaCompeticao: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    resultadoCompeticao: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    jogo: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  registarConfronto,
  registarResultadoExterno,
  editarConfronto,
  obterImpactoEditarConfronto,
  apagarConfronto,
  obterImpactoApagarConfronto,
  apagarCompeticao,
  obterImpactoApagarCompeticao,
  reordenarConfrontos,
  criarCompeticaoCompleta,
  gerarQuadroCompeticao,
} from "@/lib/actions/competicoes";
import {
  apagarCompeticaoSchema,
  decisaoJogosComDadosSchema,
  editarConfrontoSchema,
  registarConfrontoSchema,
  reordenarConfrontosSchema,
} from "@/lib/schemas/competicao";
import { wherePodeApagar, type JogoParaRemocao } from "@/lib/remocao-jogos-competicao";
import { deGerados, paraPayload } from "@/lib/calendario-wizard";
import { gerarLiga } from "@/lib/quadro-cliente";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const perm = exigirCapacidade as ReturnType<typeof vi.fn>;

const CLUBE = "clube1";
const ESC = "ckv9v0z1w0000abcd1234efga";
const COMP = "ckv9v0z1w0000abcd1234efgb";
const RES = "ckv9v0z1w0000abcd1234efgc";
const EQ_P = "ckv9v0z1w0000abcd1234efgd"; // Benjamins (PROPRIO, única)
const EQ_X = "ckv9v0z1w0000abcd1234efge"; // Benfica
const EQ_Y = "ckv9v0z1w0000abcd1234efgf"; // Porto
const EQ_A = "ckv9v0z1w0000abcd1234efgg"; // Benjamins A (subequipa)
const EQ_B = "ckv9v0z1w0000abcd1234efgh"; // Benjamins B (subequipa)
const EQ_OUTRA = "ckv9v0z1w0000abcd1234efgi";
const R1 = "ckv9v0z1w0000abcd1234efgj";
const R2 = "ckv9v0z1w0000abcd1234efgk";
const R3 = "ckv9v0z1w0000abcd1234efgl";
const R4 = "ckv9v0z1w0000abcd1234efgm";
const DATA = new Date("2026-11-07T10:00:00Z");

const PERM_OK = { ok: true, ctx: { clube: { id: CLUBE }, utilizadorId: "u1" } };

type Equipa = { id: string; nome: string; tipo: "PROPRIO" | "EXTERNO" };
const SIMPLES: Equipa[] = [
  { id: EQ_P, nome: "Benjamins", tipo: "PROPRIO" },
  { id: EQ_X, nome: "Benfica", tipo: "EXTERNO" },
  { id: EQ_Y, nome: "Porto", tipo: "EXTERNO" },
];
const SUBEQUIPAS: Equipa[] = [
  { id: EQ_A, nome: "Benjamins A", tipo: "PROPRIO" },
  { id: EQ_B, nome: "Benjamins B", tipo: "PROPRIO" },
  { id: EQ_X, nome: "Benfica", tipo: "EXTERNO" },
];

const jogo = (
  id: string,
  over: Partial<JogoParaRemocao & { equipaCompeticaoId: string | null }> = {},
): JogoParaRemocao & { equipaCompeticaoId: string | null } => ({
  id,
  data: DATA,
  adversario: "Benfica",
  casaFora: "CASA",
  equipaCompeticao: null,
  equipaCompeticaoId: null,
  golosMarcados: null,
  golosSofridos: null,
  faltas1aParte: null,
  faltas2aParte: null,
  relatorio: null,
  videoUrl: null,
  fechado: false,
  sessaoAoVivo: null,
  _count: { convocatorias: 0, estatisticas: 0, eventos: 0, quadros: 0, observacoes: 0 },
  ...over,
});
const comConvocatoria = { _count: { convocatorias: 1, estatisticas: 0, eventos: 0, quadros: 0, observacoes: 0 } };
const comDados = { golosMarcados: 2, golosSofridos: 1 };

type Confronto = {
  id: string;
  competicaoId: string;
  estado: "AGENDADO" | "REALIZADO" | "WALKOVER" | "CANCELADO";
  golosCasa: number | null;
  golosFora: number | null;
  walkoverVencedor: "CASA" | "FORA" | null;
  equipaCasa: string;
  equipaFora: string;
  equipaCasaId: string | null;
  equipaForaId: string | null;
  ronda: number | null;
  dataHora: Date | null;
  jogosDetalhados: ReturnType<typeof jogo>[];
};

let equipas: Equipa[];
let confronto: Confronto;

/** Estado do confronto + equipas lido pelas actions e pela sincronização. */
function preparar(c: Partial<Confronto>, eqs: Equipa[] = SIMPLES) {
  equipas = eqs;
  confronto = {
    id: RES,
    competicaoId: COMP,
    estado: "AGENDADO",
    golosCasa: null,
    golosFora: null,
    walkoverVencedor: null,
    equipaCasa: "Benjamins",
    equipaFora: "Benfica",
    equipaCasaId: null,
    equipaForaId: null,
    ronda: 1,
    dataHora: DATA,
    jogosDetalhados: [],
    ...c,
  };
  const competicao = {
    escalaoId: ESC,
    epocaId: "ep1",
    tipo: "OFICIAL",
    formatoJogo: null,
    escalao: { nome: "Benjamins", seccao: { modalidade: "FUTSAL" } },
  };
  p.resultadoCompeticao.findFirst.mockImplementation(async () => ({ ...confronto, competicao }));
  p.resultadoCompeticao.update.mockImplementation(async ({ data }: { data: Partial<Confronto> }) => {
    confronto = { ...confronto, ...data };
    return { ...confronto };
  });
  // Sincronização: relê o confronto já editado (os jogos que saíram já não estão).
  p.resultadoCompeticao.findUnique.mockImplementation(async () => ({
    ...confronto,
    jogosDetalhados: confronto.jogosDetalhados
      .filter((j) => !removidos.has(j.id))
      .map((j) => ({ id: j.id, equipaCompeticaoId: atribuidos.get(j.id) ?? j.equipaCompeticaoId })),
    competicao,
  }));
  p.equipaCompeticao.findMany.mockImplementation(async ({ where }: { where: { tipo?: string } }) =>
    (where.tipo === "PROPRIO" ? equipas.filter((e) => e.tipo === "PROPRIO") : equipas).map((e) => ({
      id: e.id,
      nome: e.nome,
    })),
  );
}

let removidos: Set<string>;
let atribuidos: Map<string, string>;

beforeEach(() => {
  vi.resetAllMocks();
  removidos = new Set();
  atribuidos = new Map();
  (obterClubeIdAtual as ReturnType<typeof vi.fn>).mockResolvedValue(CLUBE);
  (obterEpocaAtiva as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "ep1" });
  perm.mockResolvedValue(PERM_OK);
  p.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
  p.resultadoCompeticao.aggregate.mockResolvedValue({ _max: { ordem: 7 } });
  p.jogo.findMany.mockResolvedValue([]);
  p.jogo.create.mockResolvedValue({ id: "novo" });
  p.jogo.deleteMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => {
    for (const id of where.id.in) removidos.add(id);
    return { count: where.id.in.length };
  });
  p.jogo.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: { equipaCompeticaoId?: string } }) => {
      if (data.equipaCompeticaoId) atribuidos.set(where.id, data.equipaCompeticaoId);
      return { id: where.id };
    },
  );
  // updateMany por id (jogo que fica): só conta se o jogo continuar ligado ao confronto.
  p.jogo.updateMany.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { id: string | { in: string[] } };
      data: { equipaCompeticaoId?: string };
    }) => {
      if (typeof where.id !== "string") return { count: where.id.in.length };
      if (desligadosEntretanto.has(where.id)) return { count: 0 };
      if (data.equipaCompeticaoId) atribuidos.set(where.id, data.equipaCompeticaoId);
      return { count: 1 };
    },
  );
});

/** Jogos que outro pedido desligou do confronto depois da pré-visualização (corrida). */
let desligadosEntretanto: Set<string>;
beforeEach(() => {
  desligadosEntretanto = new Set();
});

/** Gravações explícitas dos jogos que ficam (`updateMany` por id + confronto). */
const gravacoesFicam = () =>
  (p.jogo.updateMany.mock.calls as [{ where: { id: unknown } }][])
    .map(([a]) => a)
    .filter((a) => typeof a.where.id === "string");

const editar = (over: Record<string, unknown> = {}) =>
  editarConfronto({ resultadoId: RES, equipaCasaId: EQ_P, equipaForaId: EQ_X, ronda: 1, ...over });

const dadosUpdate = () => p.resultadoCompeticao.update.mock.calls[0][0].data as Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

describe("schemas do calendário editável", () => {
  it("decisaoJogosComDadosSchema só aceita MANTER | DESASSOCIAR", () => {
    expect(decisaoJogosComDadosSchema.safeParse("MANTER").success).toBe(true);
    expect(decisaoJogosComDadosSchema.safeParse("DESASSOCIAR").success).toBe(true);
    expect(decisaoJogosComDadosSchema.safeParse("APAGAR").success).toBe(false);
  });

  it("editarConfrontoSchema: confirmarAlteracaoResultado default false; casa ≠ visitante", () => {
    const r = editarConfrontoSchema.safeParse({ resultadoId: RES, equipaCasaId: EQ_P, equipaForaId: EQ_X, ronda: null });
    expect(r.success && r.data.confirmarAlteracaoResultado).toBe(false);
    const igual = editarConfrontoSchema.safeParse({ resultadoId: RES, equipaCasaId: EQ_P, equipaForaId: EQ_P, ronda: 1 });
    expect(igual.success).toBe(false);
    expect(editarConfrontoSchema.safeParse({ resultadoId: RES, equipaCasaId: EQ_P, equipaForaId: EQ_X, ronda: 0 }).success).toBe(false);
  });

  it("apagarCompeticaoSchema: apagarJogos default false e sem jogosComDados", () => {
    const r = apagarCompeticaoSchema.safeParse({ jogosComDados: "MANTER" });
    expect(r.success && r.data).toEqual({ apagarJogos: false });
  });

  it("registarConfrontoSchema: ronda ≥ 1 e dataHora opcionais (aditivo)", () => {
    expect(registarConfrontoSchema.safeParse({ equipaCasaId: EQ_P, equipaForaId: EQ_X }).success).toBe(true);
    expect(registarConfrontoSchema.safeParse({ equipaCasaId: EQ_P, equipaForaId: EQ_X, ronda: 0 }).success).toBe(false);
    const r = registarConfrontoSchema.safeParse({ equipaCasaId: EQ_P, equipaForaId: EQ_X, ronda: 3, dataHora: "2026-11-07T10:00:00Z" });
    expect(r.success && r.data.dataHora).toBeInstanceOf(Date);
  });

  it("reordenarConfrontosSchema rejeita ids repetidos e lista vazia", () => {
    expect(reordenarConfrontosSchema.safeParse({ competicaoId: COMP, ronda: 1, ids: [R1, R1] }).success).toBe(false);
    expect(reordenarConfrontosSchema.safeParse({ competicaoId: COMP, ronda: null, ids: [] }).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// registarConfronto
// ─────────────────────────────────────────────────────────────────────────────

describe("registarConfronto — ronda, dataHora, ordem e sincronização", () => {
  beforeEach(() => {
    p.competicao.findFirst.mockResolvedValue({ id: COMP, escalaoId: ESC });
    p.equipaCompeticao.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const e = SIMPLES.find((x) => x.id === where.id);
      return e ? { id: e.id, nome: e.nome } : null;
    });
    p.resultadoCompeticao.create.mockImplementation(async ({ data }: { data: Partial<Confronto> }) => {
      preparar({ ...data, id: RES, jogosDetalhados: [] } as Partial<Confronto>);
      return { id: RES, ...data };
    });
  });

  it("com ronda/dataHora grava-os, ordem = max+1, e cria o jogo da equipa própria", async () => {
    const r = await registarConfronto(COMP, {
      equipaCasaId: EQ_P,
      equipaForaId: EQ_X,
      estado: "AGENDADO",
      ronda: 3,
      dataHora: DATA,
    });
    expect(r.sucesso).toBe(true);
    expect(p.resultadoCompeticao.create.mock.calls[0][0].data).toMatchObject({ ronda: 3, dataHora: DATA, ordem: 8 });
    expect(p.resultadoCompeticao.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: RES } }));
    expect(p.jogo.create.mock.calls[0][0].data).toMatchObject({
      adversario: "Benfica",
      casaFora: "CASA",
      data: DATA,
      resultadoCompeticaoId: RES,
      competicaoId: COMP,
    });
  });

  it("zero-regressão: sem ronda/dataHora o create tem os mesmos dados de antes (+ nulls, ordem) e não cria jogo", async () => {
    const r = await registarConfronto(COMP, { equipaCasaId: EQ_P, equipaForaId: EQ_X, golosCasa: 2, golosFora: 1 });
    expect(r.sucesso).toBe(true);
    expect(p.resultadoCompeticao.create.mock.calls[0][0]).toEqual({
      data: {
        competicaoId: COMP,
        equipaCasaId: EQ_P,
        equipaForaId: EQ_X,
        equipaCasa: "Benjamins",
        equipaFora: "Benfica",
        golosCasa: 2,
        golosFora: 1,
        estado: "REALIZADO",
        walkoverVencedor: null,
        ronda: null,
        dataHora: null,
        ordem: 8,
      },
    });
    expect(p.jogo.create).not.toHaveBeenCalled();
    expect(p.jogo.update).not.toHaveBeenCalled();
  });

  it("registarResultadoExterno (legado) fica sem ordem", async () => {
    await registarResultadoExterno({ competicaoId: COMP, equipaCasa: "A", equipaFora: "B" });
    expect(p.resultadoCompeticao.create.mock.calls[0][0].data).not.toHaveProperty("ordem");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// editarConfronto
// ─────────────────────────────────────────────────────────────────────────────

describe("editarConfronto — validação, isolamento e permissões", () => {
  it("isolamento por clube: o confronto é lido pelo clube da sessão", async () => {
    p.resultadoCompeticao.findFirst.mockResolvedValue(null);
    const r = await editar();
    expect(r).toMatchObject({ sucesso: false, erro: "Confronto não encontrado" });
    expect(p.resultadoCompeticao.findFirst.mock.calls[0][0].where).toEqual({ id: RES, competicao: { clubeId: CLUBE } });
  });

  it("exige COMPETICOES_GERIR no escalão", async () => {
    preparar({});
    perm.mockResolvedValue({ ok: false, erro: "Sem permissão" });
    expect(await editar()).toMatchObject({ sucesso: false, erro: "Sem permissão" });
    expect(perm).toHaveBeenCalledWith("COMPETICOES_GERIR", ESC);
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("equipa de outra competição ⇒ erro", async () => {
    preparar({});
    const r = await editar({ equipaForaId: EQ_OUTRA });
    expect(r).toMatchObject({ sucesso: false, erro: "A equipa indicada não pertence a esta competição" });
    expect(p.resultadoCompeticao.update).not.toHaveBeenCalled();
  });

  it("casa = visitante ⇒ erro Zod", async () => {
    const r = await editar({ equipaForaId: EQ_P });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.equipaForaId).toMatch(/diferentes/);
  });
});

describe("editarConfronto — troca, D3 e texto legado", () => {
  it("troca em AGENDADO: FKs e texto atualizados, sem golos, jogo inverte casaFora", async () => {
    preparar({ jogosDetalhados: [jogo("j1")] });
    const r = await editar({ equipaCasaId: EQ_X, equipaForaId: EQ_P });
    expect(r).toMatchObject({ sucesso: true, dados: { jogosApagados: 0, jogosDesligados: 0 } });
    expect(dadosUpdate()).toEqual({
      equipaCasaId: EQ_X,
      equipaForaId: EQ_P,
      equipaCasa: "Benfica",
      equipaFora: "Benjamins",
      ronda: 1,
    });
    expect(p.jogo.deleteMany).not.toHaveBeenCalled();
    expect(p.jogo.update.mock.calls[0][0]).toMatchObject({
      where: { id: "j1" },
      data: { adversario: "Benfica", casaFora: "FORA" },
    });
  });

  it("troca em REALIZADO inverte os golos sem precisar de confirmação", async () => {
    preparar({ estado: "REALIZADO", golosCasa: 3, golosFora: 1 });
    const r = await editar({ equipaCasaId: EQ_X, equipaForaId: EQ_P });
    expect(r.sucesso).toBe(true);
    expect(dadosUpdate()).toMatchObject({ golosCasa: 1, golosFora: 3, walkoverVencedor: null });
  });

  it("troca em WALKOVER inverte o vencedor", async () => {
    preparar({ estado: "WALKOVER", walkoverVencedor: "CASA" });
    expect((await editar({ equipaCasaId: EQ_X, equipaForaId: EQ_P })).sucesso).toBe(true);
    expect(dadosUpdate()).toMatchObject({ walkoverVencedor: "FORA" });
  });

  it("REALIZADO + mudar equipa SEM confirmação ⇒ erro e nada gravado", async () => {
    preparar({ estado: "REALIZADO", golosCasa: 3, golosFora: 1 });
    const r = await editar({ equipaForaId: EQ_Y });
    expect(r).toMatchObject({ sucesso: false, erro: expect.stringMatching(/altera a classificação/) });
    expect(p.$transaction).not.toHaveBeenCalled();
    expect(p.resultadoCompeticao.update).not.toHaveBeenCalled();
  });

  it("REALIZADO + mudar equipa COM confirmação ⇒ equipas mudam, golos/estado/vencedor mantidos", async () => {
    preparar({ estado: "REALIZADO", golosCasa: 3, golosFora: 1 });
    const r = await editar({ equipaForaId: EQ_Y, confirmarAlteracaoResultado: true });
    expect(r.sucesso).toBe(true);
    expect(dadosUpdate()).toEqual({
      equipaCasaId: EQ_P,
      equipaForaId: EQ_Y,
      equipaCasa: "Benjamins",
      equipaFora: "Porto",
      ronda: 1,
    });
  });

  it("inversão parcial com mudança (A vs B → C vs A): inverte primeiro, depois substitui", async () => {
    preparar({ estado: "REALIZADO", golosCasa: 3, golosFora: 1 });
    // Benjamins (casa, 3) passa a visitante e mantém os 3 golos; Porto herda o 1.
    const r = await editar({ equipaCasaId: EQ_Y, equipaForaId: EQ_P, confirmarAlteracaoResultado: true });
    expect(r.sucesso).toBe(true);
    expect(dadosUpdate()).toMatchObject({ equipaCasa: "Porto", equipaFora: "Benjamins", golosCasa: 1, golosFora: 3 });
  });

  it("confronto legado sem FKs resolve a identidade por nome e passa a ter FKs", async () => {
    preparar({ equipaCasa: " benjamins ", equipaFora: "BENFICA" });
    expect((await editar({ ronda: 1 })).sucesso).toBe(true);
    expect(dadosUpdate()).toMatchObject({ equipaCasaId: EQ_P, equipaForaId: EQ_X, equipaCasa: "Benjamins" });
  });
});

describe("editarConfronto — ordem (R6)", () => {
  it("mudança de jornada ⇒ ordem = max + 1 (fim da jornada de destino)", async () => {
    preparar({ ronda: 1 });
    await editar({ ronda: 4 });
    expect(dadosUpdate()).toMatchObject({ ronda: 4, ordem: 8 });
  });

  it("mesma jornada ⇒ ordem intacta", async () => {
    preparar({ ronda: 1 });
    await editar({ ronda: 1 });
    expect(dadosUpdate()).not.toHaveProperty("ordem");
    expect(p.resultadoCompeticao.aggregate).not.toHaveBeenCalled();
  });

  it("«Sem jornada» (null) a partir de uma jornada também vai para o fim", async () => {
    preparar({ ronda: 2 });
    await editar({ ronda: null });
    expect(dadosUpdate()).toMatchObject({ ronda: null, ordem: 8 });
  });
});

describe("editarConfronto — jogos que saem (R3 + D1)", () => {
  // Benjamins vs Benfica → Porto vs Benfica: a equipa própria sai.
  const sair = (over: Record<string, unknown> = {}) => editar({ equipaCasaId: EQ_Y, ...over });

  it("jogo VAZIO ⇒ apagado (predicado wherePodeApagar(false) na query)", async () => {
    preparar({ jogosDetalhados: [jogo("j1")] });
    const r = await sair();
    expect(r).toMatchObject({ sucesso: true, dados: { jogosApagados: 1 } });
    expect(p.jogo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["j1"] }, ...wherePodeApagar(false) } });
    expect(p.jogo.create).not.toHaveBeenCalled();
  });

  it("CONVOCATORIA sem decisão ⇒ erro de corrida (camposInvalidos.jogosComConvocatoria)", async () => {
    preparar({ jogosDetalhados: [jogo("j1", comConvocatoria)] });
    const r = await sair();
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) {
      expect(r.erro).toMatch(/Revê o impacto/);
      expect(r.camposInvalidos).toHaveProperty("jogosComConvocatoria");
    }
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("CONVOCATORIA + APAGAR sem JOGOS_GERIR ⇒ erro de permissão", async () => {
    preparar({ jogosDetalhados: [jogo("j1", comConvocatoria)] });
    perm.mockImplementation(async (cap: string) => (cap === "JOGOS_GERIR" ? { ok: false, erro: "x" } : PERM_OK));
    const r = await sair({ jogosComConvocatoria: "APAGAR" });
    expect(r).toMatchObject({ sucesso: false, erro: "Não tens permissão para apagar jogos com convocatória neste escalão." });
    expect(perm).toHaveBeenCalledWith("JOGOS_GERIR", ESC);
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("CONVOCATORIA + APAGAR com JOGOS_GERIR ⇒ deleteMany com wherePodeApagar(true)", async () => {
    preparar({ jogosDetalhados: [jogo("j1", comConvocatoria)] });
    expect((await sair({ jogosComConvocatoria: "APAGAR" })).sucesso).toBe(true);
    expect(p.jogo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["j1"] }, ...wherePodeApagar(true) } });
  });

  it("CONVOCATORIA + MANTER sobra ⇒ exige jogosComDados", async () => {
    preparar({ jogosDetalhados: [jogo("j1", comConvocatoria)] });
    const r = await sair({ jogosComConvocatoria: "MANTER" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos).toHaveProperty("jogosComDados");
  });

  it("DADOS sem jogosComDados ⇒ erro de corrida", async () => {
    preparar({ jogosDetalhados: [jogo("j1", comDados)] });
    const r = await sair();
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos).toHaveProperty("jogosComDados");
  });

  it("DADOS + MANTER ⇒ só resultadoCompeticaoId = null", async () => {
    preparar({ jogosDetalhados: [jogo("j1", comDados)] });
    expect((await sair({ jogosComDados: "MANTER" })).sucesso).toBe(true);
    expect(p.jogo.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["j1"] }, resultadoCompeticaoId: RES },
      data: { resultadoCompeticaoId: null },
    });
  });

  it("DADOS + DESASSOCIAR ⇒ resultadoCompeticaoId/competicaoId/equipaCompeticaoId = null", async () => {
    preparar({ jogosDetalhados: [jogo("j1", comDados)] });
    expect((await sair({ jogosComDados: "DESASSOCIAR" })).sucesso).toBe(true);
    expect(p.jogo.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["j1"] }, resultadoCompeticaoId: RES },
      data: { resultadoCompeticaoId: null, competicaoId: null, equipaCompeticaoId: null },
    });
  });

  it("jogosComDados sem sobras ⇒ ignorado (não é erro, não desassocia)", async () => {
    preparar({ jogosDetalhados: [jogo("j1")] });
    expect((await sair({ jogosComDados: "DESASSOCIAR" })).sucesso).toBe(true);
    expect(p.jogo.updateMany.mock.calls[0][0].data).toEqual({ resultadoCompeticaoId: null });
  });

  it("equipa própria que entra com dataHora ⇒ jogo criado", async () => {
    preparar({ equipaCasa: "Porto", equipaFora: "Benfica" });
    expect((await editar({ equipaCasaId: EQ_P })).sucesso).toBe(true);
    expect(p.jogo.create.mock.calls[0][0].data).toMatchObject({ adversario: "Benfica", casaFora: "CASA" });
  });
});

describe("editarConfronto — subequipas (§23.11)", () => {
  it("A vs X → A vs B: jogo de A passa a ser contra B; jogo de B criado; golos não propagados", async () => {
    preparar(
      {
        estado: "REALIZADO",
        golosCasa: 2,
        golosFora: 0,
        equipaCasa: "Benjamins A",
        equipaFora: "Benfica",
        equipaCasaId: EQ_A,
        equipaForaId: EQ_X,
        jogosDetalhados: [jogo("jA", { equipaCompeticaoId: EQ_A, ...comDados })],
      },
      SUBEQUIPAS,
    );
    const r = await editar({ equipaCasaId: EQ_A, equipaForaId: EQ_B, confirmarAlteracaoResultado: true });
    expect(r).toMatchObject({ sucesso: true, dados: { jogosApagados: 0, jogosDesligados: 0 } });
    expect(p.jogo.deleteMany).not.toHaveBeenCalled();
    const upd = p.jogo.update.mock.calls[0][0];
    expect(upd).toMatchObject({ where: { id: "jA" }, data: { adversario: "Benjamins B", casaFora: "CASA", equipaCompeticaoId: EQ_A } });
    expect(upd.data).not.toHaveProperty("golosMarcados");
    expect(p.jogo.create.mock.calls[0][0].data).toMatchObject({
      adversario: "Benjamins A",
      casaFora: "FORA",
      equipaCompeticaoId: EQ_B,
    });
  });

  it("A vs B → A vs X: jogo de B (vazio) apagado, jogo de A com dados mantém-se e é atualizado", async () => {
    preparar(
      {
        equipaCasa: "Benjamins A",
        equipaFora: "Benjamins B",
        equipaCasaId: EQ_A,
        equipaForaId: EQ_B,
        jogosDetalhados: [
          jogo("jA", { equipaCompeticaoId: EQ_A, ...comDados }),
          jogo("jB", { equipaCompeticaoId: EQ_B }),
        ],
      },
      SUBEQUIPAS,
    );
    const r = await editar({ equipaCasaId: EQ_A, equipaForaId: EQ_X });
    expect(r).toMatchObject({ sucesso: true, dados: { jogosApagados: 1 } });
    expect(p.jogo.deleteMany.mock.calls[0][0].where.id).toEqual({ in: ["jB"] });
    expect(p.jogo.update.mock.calls[0][0]).toMatchObject({ where: { id: "jA" }, data: { adversario: "Benfica" } });
  });

  it("jogo legado sem subequipa que fica (A vs X → A vs B) passa a ser da 1.ª equipa própria", async () => {
    preparar(
      {
        equipaCasa: "Benjamins A",
        equipaFora: "Benfica",
        equipaCasaId: EQ_A,
        equipaForaId: EQ_X,
        jogosDetalhados: [jogo("jL")],
      },
      SUBEQUIPAS,
    );
    expect((await editar({ equipaCasaId: EQ_A, equipaForaId: EQ_B })).sucesso).toBe(true);
    expect(gravacoesFicam()).toEqual([
      {
        where: { id: "jL", resultadoCompeticaoId: RES },
        data: { adversario: "Benjamins B", casaFora: "CASA", equipaCompeticaoId: EQ_A },
      },
    ]);
    expect(p.jogo.deleteMany).not.toHaveBeenCalled();
    expect(p.jogo.create.mock.calls[0][0].data).toMatchObject({ equipaCompeticaoId: EQ_B });
  });

  it("jogo legado sem subequipa com um só lado próprio (B vs X → B vs Porto) é mantido, não apagado e recriado", async () => {
    preparar(
      {
        equipaCasa: "Benjamins B",
        equipaFora: "Benfica",
        equipaCasaId: EQ_B,
        equipaForaId: EQ_X,
        jogosDetalhados: [jogo("jL")],
      },
      [...SUBEQUIPAS, { id: EQ_Y, nome: "Porto", tipo: "EXTERNO" }],
    );
    expect((await editar({ equipaCasaId: EQ_B, equipaForaId: EQ_Y })).sucesso).toBe(true);
    expect(p.jogo.deleteMany).not.toHaveBeenCalled();
    expect(p.jogo.create).not.toHaveBeenCalled();
    expect(gravacoesFicam()).toEqual([
      {
        where: { id: "jL", resultadoCompeticaoId: RES },
        data: { adversario: "Porto", casaFora: "CASA", equipaCompeticaoId: EQ_B },
      },
    ]);
  });
});

describe("obterImpactoEditarConfronto (só leitura)", () => {
  it("agrupa os que saem, os atualizados (valores novos) e os que entram, sem escrever", async () => {
    preparar(
      {
        equipaCasa: "Benjamins A",
        equipaFora: "Benjamins B",
        equipaCasaId: EQ_A,
        equipaForaId: EQ_B,
        jogosDetalhados: [
          jogo("jA", { equipaCompeticaoId: EQ_A, equipaCompeticao: { nome: "Benjamins A" }, ...comConvocatoria }),
          jogo("jB", { equipaCompeticaoId: EQ_B, equipaCompeticao: { nome: "Benjamins B" } }),
        ],
      },
      SUBEQUIPAS,
    );
    const r = await obterImpactoEditarConfronto({ resultadoId: RES, equipaCasaId: EQ_X, equipaForaId: EQ_A, ronda: 1 });
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.bloqueio).toBeNull();
    expect(r.dados.troca).toBe(false);
    expect(r.dados.saem.vazios.map((j) => j.id)).toEqual(["jB"]);
    expect(r.dados.atualizados).toEqual([
      { id: "jA", equipa: "Benjamins A", adversario: "Benfica", casaFora: "FORA", temDados: true },
    ]);
    expect(r.dados.criaJogos).toEqual([]);
    expect(p.$transaction).not.toHaveBeenCalled();
    expect(p.resultadoCompeticao.update).not.toHaveBeenCalled();
  });

  it("bloqueio D3 em REALIZADO sem confirmação; troca sinalizada; criaJogos quando a própria entra", async () => {
    preparar({ estado: "REALIZADO", golosCasa: 1, golosFora: 1, equipaCasa: "Porto", equipaFora: "Benfica" });
    const mudar = await obterImpactoEditarConfronto({ resultadoId: RES, equipaCasaId: EQ_P, equipaForaId: EQ_X, ronda: 1 });
    expect(mudar.sucesso && mudar.dados.bloqueio).toMatch(/altera a classificação/);
    expect(mudar.sucesso && mudar.dados.criaJogos).toEqual(["Benjamins"]);
    const trocar = await obterImpactoEditarConfronto({ resultadoId: RES, equipaCasaId: EQ_X, equipaForaId: EQ_Y, ronda: 1 });
    expect(trocar.sucesso && trocar.dados).toMatchObject({ bloqueio: null, troca: true, criaJogos: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// apagarConfronto
// ─────────────────────────────────────────────────────────────────────────────

describe("apagarConfronto (R3 + D1)", () => {
  const apagar = (over: Record<string, unknown> = {}) => apagarConfronto({ resultadoId: RES, ...over });

  it("sem jogos ⇒ só apaga o confronto", async () => {
    preparar({});
    expect(await apagar()).toEqual({ sucesso: true, dados: { jogosApagados: 0, jogosMantidos: 0 } });
    expect(p.jogo.deleteMany).not.toHaveBeenCalled();
    expect(p.resultadoCompeticao.delete).toHaveBeenCalledWith({ where: { id: RES } });
  });

  it("isolamento por clube e COMPETICOES_GERIR", async () => {
    p.resultadoCompeticao.findFirst.mockResolvedValue(null);
    expect(await apagar()).toMatchObject({ sucesso: false, erro: "Confronto não encontrado" });
    expect(p.resultadoCompeticao.findFirst.mock.calls[0][0].where).toEqual({ id: RES, competicao: { clubeId: CLUBE } });
    preparar({});
    perm.mockResolvedValue({ ok: false, erro: "Sem permissão" });
    expect(await apagar()).toMatchObject({ sucesso: false });
    expect(p.resultadoCompeticao.delete).not.toHaveBeenCalled();
  });

  it("VAZIO ⇒ apagado só com COMPETICOES_GERIR (sem pedir JOGOS_GERIR)", async () => {
    preparar({ jogosDetalhados: [jogo("j1")] });
    expect((await apagar()).sucesso).toBe(true);
    expect(p.jogo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["j1"] }, ...wherePodeApagar(false) } });
    expect(perm).not.toHaveBeenCalledWith("JOGOS_GERIR", ESC);
  });

  it("CONVOCATORIA: indefinida ⇒ erro; APAGAR ⇒ predicado com convocatória; MANTER + MANTER ⇒ desligado", async () => {
    preparar({ jogosDetalhados: [jogo("j1", comConvocatoria)] });
    const indef = await apagar();
    expect(indef.sucesso).toBe(false);
    expect(p.resultadoCompeticao.delete).not.toHaveBeenCalled();

    expect((await apagar({ jogosComConvocatoria: "APAGAR" })).sucesso).toBe(true);
    expect(p.jogo.deleteMany.mock.calls[0][0]).toEqual({ where: { id: { in: ["j1"] }, ...wherePodeApagar(true) } });

    expect((await apagar({ jogosComConvocatoria: "MANTER", jogosComDados: "MANTER" })).sucesso).toBe(true);
    expect(p.jogo.deleteMany.mock.calls[1][0]).toEqual({ where: { id: { in: ["j1"] }, ...wherePodeApagar(false) } });
    expect(p.jogo.updateMany.mock.calls[1][0].data).toEqual({ resultadoCompeticaoId: null });
  });

  it("DADOS: MANTER / DESASSOCIAR / indefinido (erro)", async () => {
    preparar({ jogosDetalhados: [jogo("j1", comDados)] });
    expect((await apagar()).sucesso).toBe(false);
    await apagar({ jogosComDados: "MANTER" });
    expect(p.jogo.updateMany.mock.calls[0][0].data).toEqual({ resultadoCompeticaoId: null });
    await apagar({ jogosComDados: "DESASSOCIAR" });
    expect(p.jogo.updateMany.mock.calls[1][0].data).toEqual({
      resultadoCompeticaoId: null,
      competicaoId: null,
      equipaCompeticaoId: null,
    });
  });

  it("A vs B com um jogo vazio e outro com dados", async () => {
    preparar(
      {
        equipaCasaId: EQ_A,
        equipaForaId: EQ_B,
        jogosDetalhados: [jogo("jA", { equipaCompeticaoId: EQ_A }), jogo("jB", { equipaCompeticaoId: EQ_B, ...comDados })],
      },
      SUBEQUIPAS,
    );
    expect((await apagar({ jogosComDados: "MANTER" })).sucesso).toBe(true);
    expect(p.jogo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["jA", "jB"] }, ...wherePodeApagar(false) } });
    expect(p.resultadoCompeticao.delete).toHaveBeenCalledWith({ where: { id: RES } });
  });
});

describe("obterImpactoApagarConfronto", () => {
  it("devolve o resumo do confronto e os jogos agrupados, filtrado pelo clube", async () => {
    preparar({ ronda: 2, jogosDetalhados: [jogo("j1"), jogo("j2", comDados)] });
    const r = await obterImpactoApagarConfronto(RES);
    expect(p.resultadoCompeticao.findFirst.mock.calls[0][0].where).toEqual({ id: RES, competicao: { clubeId: CLUBE } });
    expect(r.sucesso && r.dados.confronto).toEqual({
      equipaCasa: "Benjamins",
      equipaFora: "Benfica",
      ronda: 2,
      dataHora: DATA,
      estado: "AGENDADO",
    });
    expect(r.sucesso && [r.dados.jogos.vazios.length, r.dados.jogos.comDados.length]).toEqual([1, 1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// apagarCompeticao (D2) + impacto
// ─────────────────────────────────────────────────────────────────────────────

const WHERE_JOGOS_COMP = {
  escalao: { clubeId: CLUBE },
  OR: [{ competicaoId: COMP }, { resultadoCompeticao: { is: { competicaoId: COMP } } }],
};
const DESLIGAR = {
  where: { competicaoId: COMP },
  data: { competicaoId: null, resultadoCompeticaoId: null, equipaCompeticaoId: null },
};

describe("apagarCompeticao", () => {
  beforeEach(() => {
    p.competicao.findFirst.mockResolvedValue({ id: COMP, escalaoId: ESC });
    p.jogo.updateMany.mockResolvedValue({ count: 2 });
  });

  it("zero-regressão: sem opções ⇒ só desliga os jogos e apaga (sem ler/apagar jogos)", async () => {
    const r = await apagarCompeticao(COMP);
    expect(r).toEqual({ sucesso: true, dados: { jogosApagados: 0, jogosMantidos: 2 } });
    expect(p.jogo.updateMany).toHaveBeenCalledWith(DESLIGAR);
    expect(p.competicao.delete).toHaveBeenCalledWith({ where: { id: COMP } });
    expect(p.jogo.findMany).not.toHaveBeenCalled();
    expect(p.jogo.deleteMany).not.toHaveBeenCalled();
    expect(await apagarCompeticao(COMP, { apagarJogos: false })).toEqual(r);
  });

  it("opções inválidas ⇒ erro de validação, nada apagado", async () => {
    expect((await apagarCompeticao(COMP, { apagarJogos: "sim" })).sucesso).toBe(false);
    expect(p.competicao.delete).not.toHaveBeenCalled();
  });

  it("apagarJogos ⇒ deleteMany (wherePodeApagar sobre competicaoId OU confronto da competição) → desligar → delete", async () => {
    p.jogo.findMany.mockResolvedValue([jogo("j1"), jogo("j2", comDados)]);
    p.jogo.deleteMany.mockResolvedValue({ count: 1 });
    p.jogo.updateMany.mockResolvedValue({ count: 1 });
    const r = await apagarCompeticao(COMP, { apagarJogos: true });
    expect(r).toEqual({ sucesso: true, dados: { jogosApagados: 1, jogosMantidos: 1 } });
    expect(p.jogo.findMany.mock.calls[0][0].where).toEqual(WHERE_JOGOS_COMP);
    expect(p.jogo.deleteMany).toHaveBeenCalledWith({ where: { AND: [WHERE_JOGOS_COMP, wherePodeApagar(false)] } });
    expect(p.jogo.updateMany).toHaveBeenCalledWith(DESLIGAR);
    const ordem = [p.jogo.deleteMany, p.jogo.updateMany, p.competicao.delete].map((f) => f.mock.invocationCallOrder[0]);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it("apagarJogos com convocatória: indefinida ⇒ erro; APAGAR ⇒ JOGOS_GERIR + predicado com convocatória", async () => {
    p.jogo.findMany.mockResolvedValue([jogo("j1", comConvocatoria)]);
    p.jogo.deleteMany.mockResolvedValue({ count: 1 });
    const indef = await apagarCompeticao(COMP, { apagarJogos: true });
    expect(indef.sucesso).toBe(false);
    if (!indef.sucesso) expect(indef.camposInvalidos).toHaveProperty("jogosComConvocatoria");
    expect(p.competicao.delete).not.toHaveBeenCalled();

    expect((await apagarCompeticao(COMP, { apagarJogos: true, jogosComConvocatoria: "APAGAR" })).sucesso).toBe(true);
    expect(perm).toHaveBeenCalledWith("JOGOS_GERIR", ESC);
    expect(p.jogo.deleteMany).toHaveBeenCalledWith({ where: { AND: [WHERE_JOGOS_COMP, wherePodeApagar(true)] } });
  });
});

describe("obterImpactoApagarCompeticao", () => {
  it("competição de outro clube ⇒ erro", async () => {
    p.competicao.findFirst.mockResolvedValue(null);
    expect(await obterImpactoApagarCompeticao(COMP)).toMatchObject({ sucesso: false, erro: "Competição não encontrada" });
    expect(p.competicao.findFirst.mock.calls[0][0].where).toEqual({ id: COMP, clubeId: CLUBE });
  });

  it("agrupa os jogos (incl. ligados por confronto) e devolve o total", async () => {
    p.competicao.findFirst.mockResolvedValue({ id: COMP, escalaoId: ESC });
    p.jogo.findMany.mockResolvedValue([jogo("j1"), jogo("j2", comConvocatoria), jogo("j3", comDados)]);
    const r = await obterImpactoApagarCompeticao(COMP);
    expect(p.jogo.findMany.mock.calls[0][0].where).toEqual(WHERE_JOGOS_COMP);
    expect(r.sucesso && r.dados.total).toBe(3);
    expect(r.sucesso && [r.dados.vazios, r.dados.comConvocatoria, r.dados.comDados].map((l) => l.map((j) => j.id))).toEqual([
      ["j1"],
      ["j2"],
      ["j3"],
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reordenarConfrontos (R6)
// ─────────────────────────────────────────────────────────────────────────────

describe("reordenarConfrontos", () => {
  // Ordem atual (ORDER_RESULTADOS): R1 (j1, 1), R2 (j1, 2), R3 (j2, 3), R4 (j1, null).
  const TODOS = [
    { id: R1, ronda: 1, ordem: 1 },
    { id: R2, ronda: 1, ordem: 2 },
    { id: R3, ronda: 2, ordem: 3 },
    { id: R4, ronda: 1, ordem: null },
  ];
  beforeEach(() => {
    p.competicao.findFirst.mockResolvedValue({ id: COMP, escalaoId: ESC });
    p.resultadoCompeticao.findMany.mockResolvedValue(TODOS);
    p.resultadoCompeticao.update.mockImplementation(async (a: unknown) => a);
  });
  const reordenar = (ronda: number | null, ids: string[]) => reordenarConfrontos({ competicaoId: COMP, ronda, ids });
  const atualizacoes = () =>
    (p.resultadoCompeticao.update.mock.calls as [{ where: { id: string }; data: { ordem: number } }][]).map(([a]) => [
      a.where.id,
      a.data.ordem,
    ]);

  it("competição de outro clube ⇒ erro", async () => {
    p.competicao.findFirst.mockResolvedValue(null);
    expect(await reordenar(1, [R1, R2, R4])).toMatchObject({ sucesso: false, erro: "Competição não encontrada" });
    expect(p.competicao.findFirst.mock.calls[0][0].where).toEqual({ id: COMP, clubeId: CLUBE });
  });

  it("ids de outra jornada, em falta, a mais ou repetidos ⇒ erro, nada gravado", async () => {
    for (const ids of [[R1, R2, R3], [R1, R2], [R1, R2, R4, R3], [R1, R1, R2]]) {
      expect((await reordenar(1, ids)).sucesso).toBe(false);
    }
    expect((await reordenar(1, [R1, R2, "ckv9v0z1w0000abcd1234zzzz"])).sucesso).toBe(false);
    expect(p.resultadoCompeticao.update).not.toHaveBeenCalled();
  });

  it("permutação válida ⇒ renumera 1..N só nas linhas alteradas, outras jornadas no lugar", async () => {
    expect(await reordenar(1, [R4, R2, R1])).toEqual({ sucesso: true, dados: undefined });
    expect(p.resultadoCompeticao.findMany.mock.calls[0][0]).toMatchObject({
      where: { competicaoId: COMP },
      orderBy: [{ ordem: { sort: "asc", nulls: "last" } }, { data: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
    });
    // Nova lista global: R4, R2, R3, R1 → R2 (2) e R3 (3) não mudam.
    expect(atualizacoes()).toEqual([
      [R4, 1],
      [R1, 4],
    ]);
  });

  it("mesma ordem ⇒ só normaliza ordem = null", async () => {
    await reordenar(1, [R1, R2, R4]);
    expect(atualizacoes()).toEqual([[R4, 4]]);
  });

  it("ronda null («Sem jornada»)", async () => {
    p.resultadoCompeticao.findMany.mockResolvedValue([
      { id: R1, ronda: null, ordem: 1 },
      { id: R2, ronda: 1, ordem: 2 },
      { id: R3, ronda: null, ordem: 3 },
    ]);
    expect((await reordenar(null, [R3, R1])).sucesso).toBe(true);
    expect(atualizacoes()).toEqual([
      [R3, 1],
      [R1, 3],
    ]);
  });

  it("exige COMPETICOES_GERIR", async () => {
    perm.mockResolvedValue({ ok: false, erro: "Sem permissão" });
    expect((await reordenar(1, [R1, R2, R4])).sucesso).toBe(false);
    expect(p.resultadoCompeticao.findMany).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Criação: ordem preenchida (R6) + zero-regressão do wizard
// ─────────────────────────────────────────────────────────────────────────────

describe("criarCompeticaoCompleta — ordem = índice + 1", () => {
  const equipasWizard = ["Benjamins", "Benfica", "Porto", "Sporting"];

  beforeEach(() => {
    p.escalao.findFirst.mockResolvedValue({ id: ESC, nome: "Benjamins" });
    p.competicao.create.mockResolvedValue({ id: COMP });
    p.equipaCompeticao.createMany.mockResolvedValue({ count: 4 });
    p.resultadoCompeticao.createMany.mockResolvedValue({ count: 0 });
    p.resultadoCompeticao.findMany.mockResolvedValue([]);
  });

  it("zero-regressão: quadro gerado sem edições ⇒ mesmos dados de antes (sem FKs) + ordem", async () => {
    const gerados = gerarLiga(equipasWizard.map((nome, i) => ({ nome, posicao: i + 1 })), false);
    const r = await criarCompeticaoCompleta({
      nome: "Distrital",
      escalaoId: ESC,
      equipas: equipasWizard.map((nome, i) => ({ nome, posicao: i + 1 })),
      jogos: paraPayload(deGerados(gerados)),
    });
    expect(r.sucesso).toBe(true);
    expect(p.resultadoCompeticao.createMany.mock.calls[0][0].data).toEqual(
      gerados.map((g, i) => ({
        competicaoId: COMP,
        equipaCasa: g.equipaCasa,
        equipaFora: g.equipaFora,
        ronda: g.ronda,
        dataHora: null,
        golosCasa: null,
        golosFora: null,
        estado: "AGENDADO",
        ordem: i + 1,
      })),
    );
  });

  it("0 confrontos ⇒ cria a competição sem quadro", async () => {
    const r = await criarCompeticaoCompleta({
      nome: "Distrital",
      escalaoId: ESC,
      equipas: equipasWizard.map((nome) => ({ nome })),
      jogos: [],
    });
    expect(r.sucesso).toBe(true);
    expect(p.resultadoCompeticao.createMany).not.toHaveBeenCalled();
  });
});

describe("gerarQuadroCompeticao — ordem a seguir aos existentes", () => {
  it("ordem = max + 1… pela ordem do gerador; relê por ORDER_RESULTADOS", async () => {
    p.competicao.findFirst.mockResolvedValue({
      id: COMP,
      escalaoId: ESC,
      formato: "LIGA",
      equipas: [
        { nome: "A", posicao: 1 },
        { nome: "B", posicao: 2 },
        { nome: "C", posicao: 3 },
      ],
    });
    p.resultadoCompeticao.findFirst.mockResolvedValue(null);
    p.resultadoCompeticao.aggregate.mockResolvedValue({ _max: { ordem: 4 } });
    p.resultadoCompeticao.findMany.mockResolvedValue([]);
    expect((await gerarQuadroCompeticao(COMP)).sucesso).toBe(true);
    const dados = p.resultadoCompeticao.createMany.mock.calls[0][0].data as { ordem: number }[];
    expect(dados.map((d) => d.ordem)).toEqual([5, 6, 7]);
    expect(p.resultadoCompeticao.findMany.mock.calls[0][0].orderBy[0]).toEqual({ ordem: { sort: "asc", nulls: "last" } });
  });
});

describe("editarConfronto — jogos que ficam sem dataHora (sincronização não atua)", () => {
  it("troca ⇄ sem dataHora: o jogo inverte casaFora e bate com `atualizados` do impacto", async () => {
    preparar({ dataHora: null, jogosDetalhados: [jogo("j1")] });
    const imp = await obterImpactoEditarConfronto({ resultadoId: RES, equipaCasaId: EQ_X, equipaForaId: EQ_P, ronda: 1 });
    expect(imp.sucesso && imp.dados.atualizados).toEqual([
      { id: "j1", equipa: null, adversario: "Benfica", casaFora: "FORA", temDados: false },
    ]);
    expect((await editar({ equipaCasaId: EQ_X, equipaForaId: EQ_P })).sucesso).toBe(true);
    expect(gravacoesFicam()).toEqual([
      { where: { id: "j1", resultadoCompeticaoId: RES }, data: { adversario: "Benfica", casaFora: "FORA" } },
    ]);
    expect(p.jogo.update).not.toHaveBeenCalled();
    // /jogos e o detalhe do jogo que ficou são revalidados (mesmo sem sincronização).
    expect(revalidatePath).toHaveBeenCalledWith("/jogos");
    expect(revalidatePath).toHaveBeenCalledWith("/jogos/j1");
    expect(p.jogo.create).not.toHaveBeenCalled();
  });

  it("adversário muda sem dataHora: o jogo passa a ser contra a equipa nova (dados mantêm-se)", async () => {
    preparar({ dataHora: null, jogosDetalhados: [jogo("j1", comDados)] });
    const imp = await obterImpactoEditarConfronto({ resultadoId: RES, equipaCasaId: EQ_P, equipaForaId: EQ_Y, ronda: 1 });
    expect(imp.sucesso && imp.dados.atualizados).toEqual([
      { id: "j1", equipa: null, adversario: "Porto", casaFora: "CASA", temDados: true },
    ]);
    expect((await editar({ equipaForaId: EQ_Y })).sucesso).toBe(true);
    expect(gravacoesFicam()).toEqual([
      { where: { id: "j1", resultadoCompeticaoId: RES }, data: { adversario: "Porto", casaFora: "CASA" } },
    ]);
    expect(p.jogo.update).not.toHaveBeenCalled();
    expect(p.jogo.deleteMany).not.toHaveBeenCalled();
  });
});

describe("editarConfronto — corrida nos jogos que ficam", () => {
  it("jogo desligado do confronto entretanto ⇒ erro claro, transação abortada, nada revalidado nem sincronizado", async () => {
    preparar({ jogosDetalhados: [jogo("j1")] });
    desligadosEntretanto.add("j1");
    const r = await editar({ equipaCasaId: EQ_X, equipaForaId: EQ_P });
    expect(r).toEqual({
      sucesso: false,
      erro: "Entretanto mudou algo nos jogos deste confronto. Revê o impacto e confirma de novo.",
      camposInvalidos: undefined,
    });
    expect(p.resultadoCompeticao.findUnique).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("outros erros da transação continuam a propagar", async () => {
    preparar({ jogosDetalhados: [jogo("j1")] });
    p.jogo.updateMany.mockRejectedValueOnce(new Error("BD em baixo"));
    await expect(editar({ equipaCasaId: EQ_X, equipaForaId: EQ_P })).rejects.toThrow("BD em baixo");
  });
});

describe("obterImpactoEditarConfronto — resultadoFinal (D3)", () => {
  const impacto = (casa: string, fora: string) =>
    obterImpactoEditarConfronto({ resultadoId: RES, equipaCasaId: casa, equipaForaId: fora, ronda: 1, confirmarAlteracaoResultado: true });

  it("Benjamins 3–1 Benfica → Porto vs Benjamins = 1–3, igual ao que editarConfronto grava", async () => {
    preparar({ estado: "REALIZADO", golosCasa: 3, golosFora: 1 });
    const r = await impacto(EQ_Y, EQ_P);
    expect(r.sucesso && r.dados.resultadoFinal).toEqual({ golosCasa: 1, golosFora: 3, walkoverVencedor: null });
    await editar({ equipaCasaId: EQ_Y, equipaForaId: EQ_P, confirmarAlteracaoResultado: true });
    expect(dadosUpdate()).toMatchObject({ golosCasa: 1, golosFora: 3, walkoverVencedor: null });
  });

  it("mudar só o adversário mantém o placar por posição; WO trocado inverte o vencedor; sem resultado ⇒ null", async () => {
    preparar({ estado: "REALIZADO", golosCasa: 3, golosFora: 1 });
    expect((await impacto(EQ_P, EQ_Y)).sucesso && (await impacto(EQ_P, EQ_Y))).toMatchObject({
      dados: { resultadoFinal: { golosCasa: 3, golosFora: 1, walkoverVencedor: null } },
    });
    preparar({ estado: "WALKOVER", walkoverVencedor: "CASA" });
    expect(await impacto(EQ_X, EQ_P)).toMatchObject({ dados: { resultadoFinal: { walkoverVencedor: "FORA" } } });
    preparar({});
    expect(await impacto(EQ_X, EQ_P)).toMatchObject({ dados: { resultadoFinal: null } });
  });
});
