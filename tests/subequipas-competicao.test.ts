import { describe, it, expect, vi, beforeEach } from "vitest";

// §23.11 — Subequipas por competição: regras puras + actions (competições, jogos,
// convocatória, relatório de equipa). Inclui testes explícitos de zero-regressão
// (competições com 0/1 equipa própria e jogos sem subequipa — §23.11.7).

// ─── Mocks (hoisted pelo Vitest) ─────────────────────────────────────────────
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
    equipaCompeticao: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
    },
    equipaCompeticaoAtleta: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    resultadoCompeticao: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      createMany: vi.fn(),
    },
    atletaEscalao: { count: vi.fn(), findMany: vi.fn() },
    jogo: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    convocatoria: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    estatisticaAtleta: { deleteMany: vi.fn(), findMany: vi.fn() },
    sessao: { count: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

import {
  ERRO_JOGO_ENTRE_SUBEQUIPAS,
  validarSubequipaJogo,
  ehJogoInterno,
  placarDivergente,
  corresponderSubequipas,
} from "@/lib/subequipas";
import { calcularClassificacao } from "@/lib/classificacao";
import {
  obterClassificacao,
  criarCompeticaoCompleta,
  adicionarEquipaCompeticao,
  removerEquipaCompeticao,
  apagarCompeticao,
  ligarJogoAConfronto,
  definirPlantelEquipaCompeticao,
  obterPlantelEquipaCompeticao,
  copiarPlanteisCompeticao,
} from "@/lib/actions/competicoes";
import {
  criarJogo,
  atualizarJogo,
  obterJogo,
  definirConvocatoria,
  definirPlanoTatico,
} from "@/lib/actions/jogos";
import { obterRelatorioEquipa } from "@/lib/actions/relatorios";
import { auth } from "@/lib/auth";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerEscalao } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

const CLUBE = "clube1";
const ESC = "ckv9v0z1w0000abcd1234efga";
const COMP = "ckv9v0z1w0000abcd1234efgb";
const COMP2 = "ckv9v0z1w0000abcd1234efgc";
const EQ_A = "ckv9v0z1w0000abcd1234efgd";
const EQ_B = "ckv9v0z1w0000abcd1234efge";
const EQ_X = "ckv9v0z1w0000abcd1234efgf";
const JOGO = "ckv9v0z1w0000abcd1234efgg";
const A1 = "ckv9v0z1w0000abcd1234efgh";
const A2 = "ckv9v0z1w0000abcd1234efgi";
const A3 = "ckv9v0z1w0000abcd1234efgj";

const PERM_OK = { ok: true, ctx: { clube: { id: CLUBE }, utilizadorId: "u1" } };

beforeEach(() => {
  // reset (não só clear): nenhum mockResolvedValueOnce passa de um teste para outro.
  vi.resetAllMocks();
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
  (obterClubeIdAtual as ReturnType<typeof vi.fn>).mockResolvedValue(CLUBE);
  (obterEpocaAtiva as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "ep1", nome: "2026/27" });
  (exigirCapacidade as ReturnType<typeof vi.fn>).mockResolvedValue(PERM_OK);
  (podeLerEscalao as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  p.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

// ─── Regras puras (lib/subequipas.ts) ────────────────────────────────────────

describe("validarSubequipaJogo (§23.11.3 regra 1)", () => {
  it("zero-regressão: com 0/1 equipa própria a subequipa é opcional (null)", () => {
    expect(validarSubequipaJogo(COMP, undefined, [])).toEqual({ ok: true, equipaCompeticaoId: null });
    expect(validarSubequipaJogo(COMP, null, [EQ_A])).toEqual({ ok: true, equipaCompeticaoId: null });
    expect(validarSubequipaJogo(null, undefined, [])).toEqual({ ok: true, equipaCompeticaoId: null });
  });

  it("com ≥2 equipas próprias a subequipa é obrigatória", () => {
    const r = validarSubequipaJogo(COMP, null, [EQ_A, EQ_B]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/várias equipas próprias/);
  });

  it("aceita uma equipa própria da competição e rejeita outra (não PROPRIO / outra competição)", () => {
    expect(validarSubequipaJogo(COMP, EQ_B, [EQ_A, EQ_B])).toEqual({
      ok: true,
      equipaCompeticaoId: EQ_B,
    });
    expect(validarSubequipaJogo(COMP, EQ_X, [EQ_A, EQ_B]).ok).toBe(false);
  });

  it("sem competição não aceita subequipa", () => {
    expect(validarSubequipaJogo(undefined, EQ_A, []).ok).toBe(false);
  });
});

describe("ehJogoInterno / placarDivergente / corresponderSubequipas", () => {
  it("jogo interno = jogo de subequipa cujo confronto tem jogo de outra subequipa", () => {
    const ab = { jogosDetalhados: [{ equipaCompeticaoId: EQ_A }, { equipaCompeticaoId: EQ_B }] };
    expect(ehJogoInterno({ equipaCompeticaoId: EQ_A, resultadoCompeticao: ab })).toBe(true);
    expect(
      ehJogoInterno({
        equipaCompeticaoId: EQ_A,
        resultadoCompeticao: { jogosDetalhados: [{ equipaCompeticaoId: EQ_A }] },
      }),
    ).toBe(false);
    // Zero-regressão: jogos sem subequipa / sem confronto nunca são internos.
    expect(ehJogoInterno({ equipaCompeticaoId: null, resultadoCompeticao: ab })).toBe(false);
    expect(ehJogoInterno({})).toBe(false);
  });

  it("placar divergente só com os dois resultados completos e incoerentes", () => {
    const a = { golosMarcados: 3, golosSofridos: 1 };
    expect(placarDivergente(a, { golosMarcados: 1, golosSofridos: 3 })).toBe(false);
    expect(placarDivergente(a, { golosMarcados: 2, golosSofridos: 2 })).toBe(true);
    expect(placarDivergente(a, { golosMarcados: null, golosSofridos: null })).toBe(false);
  });

  it("corresponde subequipas por nome (case-insensitive, trim)", () => {
    expect(
      corresponderSubequipas(
        [
          { id: "d1", nome: "Benjamins A" },
          { id: "d2", nome: "Benjamins C" },
        ],
        [
          { id: "o1", nome: " benjamins a " },
          { id: "o2", nome: "Benjamins B" },
        ],
      ),
    ).toEqual([{ destinoId: "d1", origemId: "o1" }]);
  });
});

// ─── Classificação (§23.11.3 regra 7) ────────────────────────────────────────

describe("calcularClassificacao com várias equipas próprias", () => {
  const base = {
    nomeEquipaPropria: "Sub-15",
    formato: "LIGA" as const,
    jogosProprios: [{ adversario: "Benfica", golosMarcados: 2, golosSofridos: 1 }],
    resultados: [{ equipaCasa: "Porto", equipaFora: "Sub-15", golosCasa: 0, golosFora: 0 }],
  };

  it("zero-regressão: com a única equipa própria no conjunto o resultado é idêntico", () => {
    expect(calcularClassificacao({ ...base, nomesEquipasProprias: ["Sub-15"] })).toEqual(
      calcularClassificacao(base),
    );
  });

  it("destaca todas as subequipas e conta cada jogo para a sua subequipa", () => {
    const t = calcularClassificacao({
      nomeEquipaPropria: "Benjamins A",
      nomesEquipasProprias: ["Benjamins A", "Benjamins B"],
      formato: "LIGA",
      jogosProprios: [
        { adversario: "Benfica", golosMarcados: 2, golosSofridos: 0 },
        { equipa: "Benjamins B", adversario: "Porto", golosMarcados: 1, golosSofridos: 1 },
      ],
      resultados: [],
    });
    const a = t.find((l) => l.equipa === "Benjamins A")!;
    const b = t.find((l) => l.equipa === "Benjamins B")!;
    expect([a.ehProprio, a.pontos, a.jogos]).toEqual([true, 3, 1]);
    expect([b.ehProprio, b.pontos, b.jogos]).toEqual([true, 1, 1]);
    expect(t.find((l) => l.equipa === "Porto")!.ehProprio).toBe(false);
  });
});

describe("obterClassificacao — subequipas", () => {
  it("destaca A e B e conta o jogo não ligado para a subequipa do jogo", async () => {
    p.competicao.findFirst.mockResolvedValue({
      id: COMP,
      escalaoId: ESC,
      formato: "LIGA",
      escalao: { nome: "Benjamins" },
    });
    p.jogo.findMany.mockResolvedValue([
      { adversario: "Benfica", golosMarcados: 1, golosSofridos: 0, equipaCompeticaoId: EQ_B },
    ]);
    p.resultadoCompeticao.findMany.mockResolvedValue([]);
    p.equipaCompeticao.findMany.mockResolvedValue([
      { id: EQ_A, nome: "Benjamins A", tipo: "PROPRIO" },
      { id: EQ_B, nome: "Benjamins B", tipo: "PROPRIO" },
      { id: EQ_X, nome: "Benfica", tipo: "EXTERNO" },
    ]);

    const r = await obterClassificacao(COMP);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    const b = r.dados.find((l) => l.equipa === "Benjamins B")!;
    expect([b.ehProprio, b.vitorias]).toEqual([true, 1]);
    const a = r.dados.find((l) => l.equipa === "Benjamins A")!;
    expect([a.ehProprio, a.jogos]).toEqual([true, 0]);
    expect(r.dados.find((l) => l.equipa === "Benfica")!.ehProprio).toBe(false);
  });

  it("zero-regressão: jogo sem subequipa conta para a equipa própria única", async () => {
    p.competicao.findFirst.mockResolvedValue({
      id: COMP,
      escalaoId: ESC,
      formato: "LIGA",
      escalao: { nome: "Sub-15" },
    });
    p.jogo.findMany.mockResolvedValue([
      { adversario: "Benfica", golosMarcados: 3, golosSofridos: 1, equipaCompeticaoId: null },
    ]);
    p.resultadoCompeticao.findMany.mockResolvedValue([]);
    p.equipaCompeticao.findMany.mockResolvedValue([
      { id: EQ_A, nome: "Sub-15", tipo: "PROPRIO" },
      { id: EQ_X, nome: "Benfica", tipo: "EXTERNO" },
    ]);
    const r = await obterClassificacao(COMP);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.map((l) => [l.equipa, l.ehProprio, l.pontos])).toEqual([
      ["Sub-15", true, 3],
      ["Benfica", false, 0],
    ]);
  });
});

// ─── Wizard (§23.11.3 regra 9) ───────────────────────────────────────────────

describe("criarCompeticaoCompleta — várias «Equipa própria»", () => {
  const preparar = () => {
    p.escalao.findFirst.mockResolvedValue({ id: ESC, nome: "Benjamins" });
    p.competicao.create.mockResolvedValue({ id: COMP });
    p.equipaCompeticao.createMany.mockResolvedValue({ count: 0 });
    p.resultadoCompeticao.findMany.mockResolvedValue([]);
  };
  const participantesCriados = () =>
    (p.equipaCompeticao.createMany.mock.calls[0][0] as { data: Record<string, unknown>[] }).data;

  it("cria cada entrada marcada como PROPRIO do escalão e não junta o escalão", async () => {
    preparar();
    const r = await criarCompeticaoCompleta({
      nome: "Distrital",
      escalaoId: ESC,
      ambito: "EXTERNA",
      equipas: [
        { nome: "Benjamins A", propria: true },
        { nome: "Benjamins B", propria: true },
        { nome: "Benfica" },
      ],
    });
    expect(r.sucesso).toBe(true);
    expect(participantesCriados().map((e) => [e.nome, e.tipo, e.escalaoVinculadoId])).toEqual([
      ["Benjamins A", "PROPRIO", ESC],
      ["Benjamins B", "PROPRIO", ESC],
      ["Benfica", "EXTERNO", null],
    ]);
  });

  it("zero-regressão: nenhuma marcada em âmbito Própria ⇒ junta o escalão como PROPRIO", async () => {
    preparar();
    await criarCompeticaoCompleta({
      nome: "Torneio",
      escalaoId: ESC,
      ambito: "PROPRIA",
      equipas: [{ nome: "Benfica" }, { nome: "Porto" }],
    });
    expect(participantesCriados().map((e) => [e.nome, e.tipo])).toEqual([
      ["Benjamins", "PROPRIO"],
      ["Benfica", "EXTERNO"],
      ["Porto", "EXTERNO"],
    ]);
  });
});

// ─── Tab «Equipas»: subequipa numa competição existente ─────────────────────

describe("adicionarEquipaCompeticao — propria", () => {
  beforeEach(() => {
    p.competicao.findFirst.mockResolvedValue({ id: COMP, escalaoId: ESC });
    p.equipaCompeticao.findFirst.mockResolvedValue(null);
    p.equipaCompeticao.create.mockResolvedValue({ id: EQ_B });
  });

  it("zero-regressão: sem `propria` cria o participante exatamente como antes", async () => {
    const r = await adicionarEquipaCompeticao(COMP, { nome: " Benfica " });
    expect(r.sucesso).toBe(true);
    expect(p.equipaCompeticao.create.mock.calls[0][0]).toEqual({
      data: { competicaoId: COMP, nome: "Benfica", posicao: null },
    });
  });

  it("com `propria: true` cria uma equipa PROPRIO do escalão da competição", async () => {
    const r = await adicionarEquipaCompeticao(COMP, { nome: "Benjamins B", propria: true });
    expect(r.sucesso).toBe(true);
    expect(p.equipaCompeticao.create.mock.calls[0][0]).toEqual({
      data: {
        competicaoId: COMP,
        nome: "Benjamins B",
        posicao: null,
        tipo: "PROPRIO",
        escalaoVinculadoId: ESC,
        clubeVinculadoId: CLUBE,
      },
    });
  });

  it("mantém a unicidade de nome (case-insensitive) também para equipas próprias", async () => {
    p.equipaCompeticao.findFirst.mockResolvedValue({ id: EQ_A });
    const r = await adicionarEquipaCompeticao(COMP, { nome: "benjamins a", propria: true });
    expect(r.sucesso).toBe(false);
    expect(p.equipaCompeticao.create).not.toHaveBeenCalled();
  });
});

// ─── Plantéis (§23.11.3 regras 2 e 3) ────────────────────────────────────────

describe("definirPlantelEquipaCompeticao", () => {
  const equipa = (over: Record<string, unknown> = {}) => ({
    id: EQ_A,
    tipo: "PROPRIO",
    competicaoId: COMP,
    competicao: { escalaoId: ESC, epocaId: "ep1" },
    atletas: [],
    ...over,
  });

  it("só aceita equipas próprias", async () => {
    p.equipaCompeticao.findFirst.mockResolvedValue(equipa({ tipo: "EXTERNO" }));
    const r = await definirPlantelEquipaCompeticao(EQ_A, [A1]);
    expect(r.sucesso).toBe(false);
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("rejeita atletas sem participação ativa no escalão/época da competição", async () => {
    p.equipaCompeticao.findFirst.mockResolvedValue(equipa());
    p.atletaEscalao.count.mockResolvedValue(1);
    const r = await definirPlantelEquipaCompeticao(EQ_A, [A1, A2]);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não pertencem/);
    expect(p.atletaEscalao.count.mock.calls[0][0].where).toMatchObject({
      escalaoId: ESC,
      epocaId: "ep1",
      estado: "ATIVO",
    });
  });

  it("atleta também noutra subequipa: grava e devolve aviso (não bloqueia)", async () => {
    p.equipaCompeticao.findFirst.mockResolvedValue(equipa({ atletas: [{ atletaId: A3 }] }));
    p.atletaEscalao.count.mockResolvedValue(2);
    p.equipaCompeticaoAtleta.findMany.mockResolvedValue([
      { atletaId: A1, atleta: { nome: "Rui" }, equipaCompeticao: { nome: "Benjamins B" } },
    ]);
    const r = await definirPlantelEquipaCompeticao(EQ_A, [A1, A2]);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados).toEqual([{ atletaId: A1, nome: "Rui", tambemEm: ["Benjamins B"] }]);
    // Só os novos são validados/criados; o que saiu da lista é removido.
    expect(p.atletaEscalao.count.mock.calls[0][0].where.atletaId).toEqual({ in: [A1, A2] });
    expect(p.equipaCompeticaoAtleta.createMany.mock.calls[0][0].data).toEqual([
      { equipaCompeticaoId: EQ_A, atletaId: A1 },
      { equipaCompeticaoId: EQ_A, atletaId: A2 },
    ]);
    expect(p.equipaCompeticaoAtleta.deleteMany.mock.calls[0][0].where).toEqual({
      equipaCompeticaoId: EQ_A,
      atletaId: { in: [A3] },
    });
  });

  it("atleta já no plantel (mesmo inativo no escalão) mantém-se sem revalidar", async () => {
    p.equipaCompeticao.findFirst.mockResolvedValue(equipa({ atletas: [{ atletaId: A1 }] }));
    p.equipaCompeticaoAtleta.findMany.mockResolvedValue([]);
    const r = await definirPlantelEquipaCompeticao(EQ_A, [A1]);
    expect(r.sucesso).toBe(true);
    expect(p.atletaEscalao.count).not.toHaveBeenCalled();
  });
});

describe("obterPlantelEquipaCompeticao", () => {
  it("devolve o plantel com as outras subequipas de cada atleta", async () => {
    p.equipaCompeticao.findFirst.mockResolvedValue({
      id: EQ_A,
      competicaoId: COMP,
      competicao: { escalaoId: ESC },
      atletas: [
        { atletaId: A1, atleta: { nome: "Rui" } },
        { atletaId: A2, atleta: { nome: "Tiago" } },
      ],
    });
    p.equipaCompeticaoAtleta.findMany.mockResolvedValue([
      { atletaId: A2, atleta: { nome: "Tiago" }, equipaCompeticao: { nome: "Benjamins B" } },
    ]);
    const r = await obterPlantelEquipaCompeticao(EQ_A);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados).toEqual([
      { atletaId: A1, nome: "Rui", tambemEm: [] },
      { atletaId: A2, nome: "Tiago", tambemEm: ["Benjamins B"] },
    ]);
  });
});

describe("copiarPlanteisCompeticao", () => {
  it("copia por nome de subequipa e ignora atletas inativos no destino", async () => {
    p.competicao.findFirst
      .mockResolvedValueOnce({
        escalaoId: ESC,
        epocaId: "ep1",
        equipas: [
          { id: "d-a", nome: "Benjamins A" },
          { id: "d-c", nome: "Benjamins C" },
        ],
      })
      .mockResolvedValueOnce({
        escalaoId: ESC,
        equipas: [
          { id: "o-a", nome: "benjamins a", atletas: [{ atletaId: A1 }, { atletaId: A2 }] },
          { id: "o-b", nome: "Benjamins B", atletas: [{ atletaId: A3 }] },
        ],
      });
    p.atletaEscalao.findMany.mockResolvedValue([{ atletaId: A1 }]);
    p.equipaCompeticaoAtleta.createMany.mockResolvedValue({ count: 1 });

    const r = await copiarPlanteisCompeticao(COMP, COMP2);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados).toEqual({ subequipas: 1, atletasCopiados: 1, atletasIgnorados: 1 });
    expect(p.equipaCompeticaoAtleta.createMany.mock.calls[0][0]).toEqual({
      data: [{ equipaCompeticaoId: "d-a", atletaId: A1 }],
      skipDuplicates: true,
    });
  });

  it("rejeita origem de outro escalão e a própria competição", async () => {
    p.competicao.findFirst
      .mockResolvedValueOnce({ escalaoId: ESC, epocaId: "ep1", equipas: [] })
      .mockResolvedValueOnce({ escalaoId: "outro", equipas: [] });
    expect((await copiarPlanteisCompeticao(COMP, COMP2)).sucesso).toBe(false);
    expect((await copiarPlanteisCompeticao(COMP, COMP)).sucesso).toBe(false);
    expect(p.equipaCompeticaoAtleta.createMany).not.toHaveBeenCalled();
  });
});

// ─── Criar/editar jogo (§23.11.3 regra 1) ────────────────────────────────────

const ENTRADA = {
  data: "2026-10-20",
  adversario: "Benfica",
  casaFora: "CASA" as const,
  tipo: "OFICIAL" as const,
  escalaoId: ESC,
  competicaoId: COMP,
};

describe("criarJogo — subequipa", () => {
  beforeEach(() => {
    p.escalao.findFirst.mockResolvedValue({ id: ESC, seccao: { modalidade: "FUTSAL" } });
    p.jogo.create.mockResolvedValue({ id: JOGO });
  });

  it("zero-regressão: competição com 1 equipa própria cria o jogo sem subequipa", async () => {
    p.competicao.findFirst.mockResolvedValue({ id: COMP, equipas: [{ id: EQ_A, nome: "Benjamins" }] });
    const r = await criarJogo(ENTRADA);
    expect(r.sucesso).toBe(true);
    expect(p.jogo.create.mock.calls[0][0].data).toMatchObject({
      competicaoId: COMP,
      equipaCompeticaoId: null,
    });
  });

  it("com ≥2 equipas próprias exige a subequipa", async () => {
    p.competicao.findFirst.mockResolvedValue({ id: COMP, equipas: [{ id: EQ_A, nome: "Benjamins A" }, { id: EQ_B, nome: "Benjamins B" }] });
    const r = await criarJogo(ENTRADA);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.equipaCompeticaoId).toBeTruthy();
    expect(p.jogo.create).not.toHaveBeenCalled();
  });

  it("aceita uma subequipa da competição e rejeita uma que não é PROPRIO dela", async () => {
    p.competicao.findFirst.mockResolvedValue({ id: COMP, equipas: [{ id: EQ_A, nome: "Benjamins A" }, { id: EQ_B, nome: "Benjamins B" }] });
    expect((await criarJogo({ ...ENTRADA, equipaCompeticaoId: EQ_X })).sucesso).toBe(false);
    const r = await criarJogo({ ...ENTRADA, equipaCompeticaoId: EQ_B });
    expect(r.sucesso).toBe(true);
    expect(p.jogo.create.mock.calls[0][0].data.equipaCompeticaoId).toBe(EQ_B);
  });

  it("A vs B criado à mão (adversário = outra subequipa) é rejeitado no campo adversário", async () => {
    p.competicao.findFirst.mockResolvedValue({
      id: COMP,
      equipas: [{ id: EQ_A, nome: "Benjamins A" }, { id: EQ_B, nome: "Benjamins B" }],
    });
    const r = await criarJogo({ ...ENTRADA, adversario: " benjamins b ", equipaCompeticaoId: EQ_A });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) {
      expect(r.erro).toBe(ERRO_JOGO_ENTRE_SUBEQUIPAS);
      expect(r.camposInvalidos?.adversario).toBe(
        "Jogo entre subequipas: cria-o a partir do confronto na competição.",
      );
    }
    expect(p.jogo.create).not.toHaveBeenCalled();
  });

  it("zero-regressão: com 1 equipa própria o adversário não é verificado", async () => {
    p.competicao.findFirst.mockResolvedValue({ id: COMP, equipas: [{ id: EQ_A, nome: "Benjamins" }] });
    expect((await criarJogo({ ...ENTRADA, adversario: "Benjamins" })).sucesso).toBe(true);
  });

  it("jogo sem competição não aceita subequipa", async () => {
    const r = await criarJogo({ ...ENTRADA, competicaoId: null, equipaCompeticaoId: EQ_A });
    expect(r.sucesso).toBe(false);
    expect(p.jogo.create).not.toHaveBeenCalled();
  });
});

describe("atualizarJogo — subequipa de jogo ligado a confronto", () => {
  const ligado = {
    id: JOGO,
    escalaoId: ESC,
    epocaId: "ep1",
    formato: "FUTSAL_5",
    resultadoCompeticaoId: "res1",
    equipaCompeticaoId: EQ_A,
  };
  const confronto = (jogosDetalhados: { id: string; equipaCompeticaoId: string | null }[]) => ({
    competicaoId: COMP,
    equipaCasa: "Benjamins A",
    equipaFora: "Benjamins B",
    equipaCasaId: EQ_A,
    equipaForaId: EQ_B,
    jogosDetalhados,
    competicao: { escalao: { nome: "Benjamins" } },
  });
  beforeEach(() => {
    p.jogo.findFirst.mockResolvedValue(ligado);
    p.competicao.findFirst.mockResolvedValue({
      id: COMP,
      equipas: [
        { id: EQ_A, nome: "Benjamins A" },
        { id: EQ_B, nome: "Benjamins B" },
        { id: EQ_X, nome: "Benjamins C" },
      ],
    });
    p.equipaCompeticao.findMany.mockResolvedValue([
      { id: EQ_A, nome: "Benjamins A" },
      { id: EQ_B, nome: "Benjamins B" },
      { id: EQ_X, nome: "Benjamins C" },
    ]);
  });

  it("bloqueia uma subequipa que não joga o confronto", async () => {
    p.resultadoCompeticao.findUnique.mockResolvedValue(confronto([{ id: JOGO, equipaCompeticaoId: EQ_A }]));
    const r = await atualizarJogo(JOGO, { ...ENTRADA, adversario: "Benjamins B", equipaCompeticaoId: EQ_X });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.equipaCompeticaoId).toBe(
      "A equipa do jogo não participa neste confronto",
    );
    expect(p.jogo.update).not.toHaveBeenCalled();
  });

  it("bloqueia passar para uma subequipa que já tem jogo nesse confronto", async () => {
    p.resultadoCompeticao.findUnique.mockResolvedValue(
      confronto([
        { id: JOGO, equipaCompeticaoId: EQ_A },
        { id: "jogo-b", equipaCompeticaoId: EQ_B },
      ]),
    );
    const r = await atualizarJogo(JOGO, { ...ENTRADA, adversario: "Benjamins A", equipaCompeticaoId: EQ_B });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.equipaCompeticaoId).toBe(
      "Esta equipa já tem um jogo ligado a este confronto",
    );
  });

  it("jogo ligado do A vs B pode ter a outra subequipa como adversário", async () => {
    p.resultadoCompeticao.findUnique.mockResolvedValue(
      confronto([
        { id: JOGO, equipaCompeticaoId: EQ_A },
        { id: "jogo-b", equipaCompeticaoId: EQ_B },
      ]),
    );
    p.jogo.update.mockResolvedValue({ id: JOGO });
    const r = await atualizarJogo(JOGO, { ...ENTRADA, adversario: "Benjamins B", equipaCompeticaoId: EQ_A });
    expect(r.sucesso).toBe(true);
  });
});

// ─── Convocatória (§23.11.3 regras 4 e 5) ────────────────────────────────────

describe("definirConvocatoria — subequipas", () => {
  const jogoA = {
    id: JOGO,
    escalaoId: ESC,
    epocaId: "ep1",
    resultadoCompeticaoId: "res1",
    equipaCompeticaoId: EQ_A,
  };

  it("bloqueia o atleta já convocado pela outra subequipa no mesmo confronto", async () => {
    p.jogo.findFirst.mockResolvedValueOnce(jogoA).mockResolvedValueOnce({
      id: "jogo-b",
      adversario: "Benjamins A",
      golosMarcados: null,
      golosSofridos: null,
      equipaCompeticao: { nome: "Benjamins B" },
      convocatorias: [{ atletaId: A2 }],
    });
    p.atletaEscalao.count.mockResolvedValue(2);
    p.convocatoria.findMany.mockResolvedValue([]);
    const r = await definirConvocatoria(JOGO, [A1, A2]);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) {
      expect(r.erro).toBe("Este atleta já está convocado por Benjamins B neste confronto");
      expect(Object.keys(r.camposInvalidos ?? {})).toEqual([A2]);
    }
    // Verificação dentro da transação de escrita, com bloqueio dos jogos do confronto.
    expect(p.$transaction).toHaveBeenCalledOnce();
    const queryRaw = (prisma as unknown as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw;
    const sql = (queryRaw.mock.calls[0][0] as string[]).join("?");
    expect(sql).toMatch(/FROM "Jogo" WHERE "resultadoCompeticaoId" = \? ORDER BY "id" FOR UPDATE/);
    expect(queryRaw.mock.calls[0][1]).toBe("res1");
    expect(p.convocatoria.create).not.toHaveBeenCalled();
    expect(p.convocatoria.deleteMany).not.toHaveBeenCalled();
    // A consulta exclui o próprio jogo e jogos sem subequipa / da mesma subequipa.
    expect(p.jogo.findFirst.mock.calls[1][0].where).toMatchObject({
      id: { not: JOGO },
      resultadoCompeticaoId: "res1",
      AND: [{ equipaCompeticaoId: { not: null } }, { equipaCompeticaoId: { not: EQ_A } }],
    });
  });

  it("exceção «fora do plantel»: aceita atleta do escalão; rejeita quem não é do escalão", async () => {
    p.jogo.findFirst.mockResolvedValue({ ...jogoA, resultadoCompeticaoId: null });
    p.convocatoria.findMany.mockResolvedValue([]);
    p.atletaEscalao.count.mockResolvedValue(1);
    expect((await definirConvocatoria(JOGO, [A3])).sucesso).toBe(true);
    p.atletaEscalao.count.mockResolvedValue(0);
    expect((await definirConvocatoria(JOGO, [A3])).sucesso).toBe(false);
  });

  it("zero-regressão: jogo sem subequipa não consulta outros jogos", async () => {
    p.jogo.findFirst.mockResolvedValue({
      id: JOGO,
      escalaoId: ESC,
      epocaId: "ep1",
      resultadoCompeticaoId: "res1",
      equipaCompeticaoId: null,
    });
    p.convocatoria.findMany.mockResolvedValue([]);
    p.atletaEscalao.count.mockResolvedValue(1);
    expect((await definirConvocatoria(JOGO, [A1])).sucesso).toBe(true);
    expect(p.jogo.findFirst).toHaveBeenCalledTimes(1);
    expect(p.$queryRaw).not.toHaveBeenCalled();
    expect(p.convocatoria.create).toHaveBeenCalledWith({
      data: { jogoId: JOGO, atletaId: A1, convocado: true },
    });
  });
});

describe("definirPlanoTatico — bloqueio A vs B", () => {
  it("não convoca pelo plano um atleta convocado pela outra subequipa", async () => {
    p.jogo.findFirst
      .mockResolvedValueOnce({
        id: JOGO,
        escalaoId: ESC,
        epocaId: "ep1",
        resultadoCompeticaoId: "res1",
        equipaCompeticaoId: EQ_A,
      })
      .mockResolvedValueOnce({
        id: "jogo-b",
        adversario: "Benjamins A",
        golosMarcados: null,
        golosSofridos: null,
        equipaCompeticao: { nome: "Benjamins B" },
        convocatorias: [{ atletaId: A1 }],
      });
    p.atletaEscalao.count.mockResolvedValue(1);
    const r = await definirPlanoTatico(JOGO, [{ convocadoId: A1, titularPrevisto: true }]);
    expect(r.sucesso).toBe(false);
    expect(p.convocatoria.upsert).not.toHaveBeenCalled();
  });
});

describe("obterJogo — dados do confronto interno para a UI", () => {
  it("expõe o jogo da outra subequipa, os seus convocados e a divergência de placar", async () => {
    p.jogo.findFirst
      .mockResolvedValueOnce({
        id: JOGO,
        escalaoId: ESC,
        epocaId: "ep1",
        modalidadeAtividade: null,
        golosMarcados: 3,
        golosSofridos: 1,
        resultadoCompeticaoId: "res1",
        equipaCompeticaoId: EQ_A,
        escalao: { id: ESC, nome: "Benjamins", seccao: { modalidade: "FUTSAL" } },
        equipaCompeticao: { id: EQ_A, nome: "Benjamins A", atletas: [{ atletaId: A1 }] },
        convocatorias: [],
      })
      .mockResolvedValueOnce({
        id: "jogo-b",
        adversario: "Benjamins A",
        golosMarcados: 2,
        golosSofridos: 2,
        equipaCompeticao: { nome: "Benjamins B" },
        convocatorias: [{ atletaId: A2 }],
      });
    p.atletaEscalao.findMany.mockResolvedValue([]);
    const r = await obterJogo(JOGO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.confrontoInterno).toEqual({
      jogoId: "jogo-b",
      equipaNome: "Benjamins B",
      convocadosAtletaIds: [A2],
      placarDivergente: true,
    });
  });

  it("zero-regressão: jogo sem subequipa ⇒ confrontoInterno null sem consulta extra", async () => {
    p.jogo.findFirst.mockResolvedValue({
      id: JOGO,
      escalaoId: ESC,
      epocaId: "ep1",
      modalidadeAtividade: null,
      resultadoCompeticaoId: "res1",
      equipaCompeticaoId: null,
      escalao: { id: ESC, nome: "Benjamins", seccao: { modalidade: "FUTSAL" } },
      equipaCompeticao: null,
      convocatorias: [],
    });
    const r = await obterJogo(JOGO);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.confrontoInterno).toBeNull();
    expect(p.jogo.findFirst).toHaveBeenCalledTimes(1);
  });
});

// ─── Relatório de equipa (§23.11.3 regra 10) ─────────────────────────────────

describe("obterRelatorioEquipa — jogo interno fora dos totais", () => {
  it("exclui os dois jogos de um A vs B do V/E/D e golos", async () => {
    const ab = { jogosDetalhados: [{ equipaCompeticaoId: EQ_A }, { equipaCompeticaoId: EQ_B }] };
    p.escalao.findFirst.mockResolvedValue({ id: ESC, nome: "Benjamins" });
    p.jogo.findMany.mockResolvedValue([
      { golosMarcados: 2, golosSofridos: 1, equipaCompeticaoId: null, resultadoCompeticao: null },
      { golosMarcados: 3, golosSofridos: 1, equipaCompeticaoId: EQ_A, resultadoCompeticao: ab },
      { golosMarcados: 1, golosSofridos: 3, equipaCompeticaoId: EQ_B, resultadoCompeticao: ab },
    ]);
    p.sessao.count.mockResolvedValue(0);
    p.atletaEscalao.count.mockResolvedValue(10);
    p.estatisticaAtleta.findMany.mockResolvedValue([]);
    const r = await obterRelatorioEquipa(ESC);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect([r.dados.jogos, r.dados.vitorias, r.dados.derrotas, r.dados.golosMarcados]).toEqual([
      1, 1, 0, 2,
    ]);
  });
});

// ─── Correções da revisão de código ──────────────────────────────────────────

describe("obterClassificacao — A vs B não ligado não conta a dobrar", () => {
  it("ignora jogo próprio cujo adversário é outra subequipa", async () => {
    p.competicao.findFirst.mockResolvedValue({
      id: COMP,
      escalaoId: ESC,
      formato: "LIGA",
      escalao: { nome: "Benjamins" },
    });
    p.jogo.findMany.mockResolvedValue([
      { adversario: "Benjamins B", golosMarcados: 2, golosSofridos: 0, equipaCompeticaoId: EQ_A },
      { adversario: "Benjamins A", golosMarcados: 0, golosSofridos: 2, equipaCompeticaoId: EQ_B },
      { adversario: "Benfica", golosMarcados: 1, golosSofridos: 0, equipaCompeticaoId: EQ_A },
    ]);
    p.resultadoCompeticao.findMany.mockResolvedValue([]);
    p.equipaCompeticao.findMany.mockResolvedValue([
      { id: EQ_A, nome: "Benjamins A", tipo: "PROPRIO" },
      { id: EQ_B, nome: "Benjamins B", tipo: "PROPRIO" },
      { id: EQ_X, nome: "Benfica", tipo: "EXTERNO" },
    ]);
    const r = await obterClassificacao(COMP);
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.find((l) => l.equipa === "Benjamins A")!.jogos).toBe(1);
    expect(r.dados.find((l) => l.equipa === "Benjamins B")!.jogos).toBe(0);
  });
});

describe("removerEquipaCompeticao — equipas próprias não removíveis", () => {
  it("bloqueia PROPRIO no servidor e mantém o comportamento para as restantes", async () => {
    p.equipaCompeticao.findFirst.mockResolvedValue({
      id: EQ_A,
      nome: "Benjamins A",
      tipo: "PROPRIO",
      competicaoId: COMP,
      competicao: { escalaoId: ESC },
    });
    const r = await removerEquipaCompeticao(EQ_A);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("As equipas próprias não podem ser removidas");
    expect(p.equipaCompeticao.delete).not.toHaveBeenCalled();

    p.equipaCompeticao.findFirst.mockResolvedValue({
      id: EQ_X,
      nome: "Benfica",
      tipo: "EXTERNO",
      competicaoId: COMP,
      competicao: { escalaoId: ESC },
    });
    p.resultadoCompeticao.findFirst.mockResolvedValue(null);
    expect((await removerEquipaCompeticao(EQ_X)).sucesso).toBe(true);
    expect(p.equipaCompeticao.delete).toHaveBeenCalledWith({ where: { id: EQ_X } });
  });
});

describe("apagarCompeticao — desliga confronto e subequipa dos jogos", () => {
  it("o updateMany limpa competicaoId, resultadoCompeticaoId e equipaCompeticaoId", async () => {
    p.competicao.findFirst.mockResolvedValue({ id: COMP, escalaoId: ESC });
    expect((await apagarCompeticao(COMP)).sucesso).toBe(true);
    expect(p.jogo.updateMany).toHaveBeenCalledWith({
      where: { competicaoId: COMP },
      data: { competicaoId: null, resultadoCompeticaoId: null, equipaCompeticaoId: null },
    });
  });
});

describe("ligarJogoAConfronto — guardas de subequipa", () => {
  beforeEach(() => {
    p.resultadoCompeticao.findFirst.mockResolvedValue({
      id: "res1",
      competicaoId: COMP,
      competicao: { escalaoId: ESC, epocaId: "ep1" },
    });
    p.equipaCompeticao.findMany.mockResolvedValue([
      { id: EQ_A, nome: "Benjamins A" },
      { id: EQ_B, nome: "Benjamins B" },
    ]);
  });
  const confronto = (jogosDetalhados: { id: string; equipaCompeticaoId: string | null }[]) => ({
    competicaoId: COMP,
    equipaCasa: "Benjamins A",
    equipaFora: "Benfica",
    equipaCasaId: EQ_A,
    equipaForaId: EQ_X,
    jogosDetalhados,
    competicao: { escalao: { nome: "Benjamins" } },
  });
  const RES = "ckv9v0z1w0000abcd1234efgk";

  it("rejeita subequipa que não joga o confronto e 2.º jogo da mesma subequipa", async () => {
    p.jogo.findFirst.mockResolvedValue({ id: JOGO, escalaoId: ESC, epocaId: "ep1", equipaCompeticaoId: EQ_B });
    p.resultadoCompeticao.findUnique.mockResolvedValue(confronto([]));
    const r1 = await ligarJogoAConfronto(JOGO, RES);
    expect(r1.sucesso).toBe(false);
    if (!r1.sucesso) expect(r1.erro).toBe("A equipa do jogo não participa neste confronto");

    p.jogo.findFirst.mockResolvedValue({ id: JOGO, escalaoId: ESC, epocaId: "ep1", equipaCompeticaoId: EQ_A });
    p.resultadoCompeticao.findUnique.mockResolvedValue(confronto([{ id: "j9", equipaCompeticaoId: EQ_A }]));
    const r2 = await ligarJogoAConfronto(JOGO, RES);
    expect(r2.sucesso).toBe(false);
    expect(p.jogo.update).not.toHaveBeenCalled();
  });

  it("liga quando a subequipa joga o confronto e não tem outro jogo nele", async () => {
    p.jogo.findFirst.mockResolvedValue({ id: JOGO, escalaoId: ESC, epocaId: "ep1", equipaCompeticaoId: EQ_A });
    p.resultadoCompeticao.findUnique.mockResolvedValue(confronto([]));
    expect((await ligarJogoAConfronto(JOGO, RES)).sucesso).toBe(true);
    expect(p.jogo.update).toHaveBeenCalledWith({
      where: { id: JOGO },
      data: { resultadoCompeticaoId: RES },
    });
  });
});

describe("obterRelatorioEquipa — filtro «Equipa»", () => {
  beforeEach(() => {
    p.escalao.findFirst.mockResolvedValue({ id: ESC, nome: "Benjamins" });
    p.jogo.findMany.mockResolvedValue([]);
    p.sessao.count.mockResolvedValue(0);
    p.atletaEscalao.count.mockResolvedValue(0);
    p.estatisticaAtleta.findMany.mockResolvedValue([]);
  });

  it("restringe jogos e estatísticas à subequipa", async () => {
    p.equipaCompeticao.findFirst.mockResolvedValue({
      competicaoId: COMP,
      competicao: { equipas: [{ id: EQ_A }] },
    });
    expect((await obterRelatorioEquipa(ESC, EQ_B)).sucesso).toBe(true);
    expect(p.jogo.findMany.mock.calls[0][0].where).toMatchObject({ equipaCompeticaoId: EQ_B });
    expect(p.estatisticaAtleta.findMany.mock.calls[0][0].where.jogo).toMatchObject({
      equipaCompeticaoId: EQ_B,
    });
  });

  it("zero-regressão: sem filtro a query é a de sempre; id inválido é rejeitado", async () => {
    await obterRelatorioEquipa(ESC);
    expect(p.jogo.findMany.mock.calls[0][0].where).toEqual({ epocaId: "ep1", escalaoId: ESC });
    expect(p.equipaCompeticao.findFirst).not.toHaveBeenCalled();
    expect((await obterRelatorioEquipa(ESC, "nao-cuid")).sucesso).toBe(false);
  });
});
