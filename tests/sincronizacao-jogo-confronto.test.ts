import { describe, it, expect, vi } from "vitest";
import {
  ladoProprio,
  ladosProprios,
  validarLigacaoJogoConfronto,
  camposJogoDoConfronto,
  camposConfrontoDoJogo,
  sincronizarJogoDoConfronto,
  sincronizarConfrontoDoJogo,
} from "@/lib/sincronizacao-jogo-confronto";

// §23.6 — sincronização bidirecional Jogo ↔ confronto do quadro.

const PROPRIA = { id: "eq-proprio", nome: "Sub-13 A" };
const DATA = new Date("2026-10-18T10:30:00Z");

const confronto = (over: Record<string, unknown> = {}) => ({
  equipaCasa: "Sub-13 A",
  equipaFora: "Benfica",
  equipaCasaId: "eq-proprio",
  equipaForaId: "eq-benfica",
  ...over,
});

describe("ladoProprio", () => {
  it("identifica a equipa própria pela FK do participante PROPRIO", () => {
    expect(ladoProprio(confronto({ equipaCasa: "Outro nome" }), PROPRIA)).toEqual({
      lado: "CASA",
      equipaId: "eq-proprio",
    });
    expect(
      ladoProprio(
        confronto({
          equipaCasa: "Benfica",
          equipaCasaId: "eq-benfica",
          equipaFora: "X",
          equipaForaId: "eq-proprio",
        }),
        PROPRIA,
      ),
    ).toEqual({ lado: "FORA", equipaId: "eq-proprio" });
  });

  it("recorre ao nome (case-insensitive, trim) quando não há FK", () => {
    const c = confronto({
      equipaCasa: "Benfica",
      equipaFora: " sub-13 a ",
      equipaCasaId: null,
      equipaForaId: null,
    });
    expect(ladoProprio(c, { id: null, nome: "Sub-13 A" })).toEqual({
      lado: "FORA",
      equipaId: null,
    });
  });

  it("devolve null quando o confronto não envolve a equipa própria", () => {
    const c = confronto({ equipaCasa: "Porto", equipaCasaId: "eq-porto" });
    expect(ladoProprio(c, PROPRIA)).toBeNull();
  });
});

describe("camposJogoDoConfronto (competição → /jogos)", () => {
  it("mapeia data, adversário e casa/fora; sem golos se não REALIZADO", () => {
    const r = camposJogoDoConfronto(
      { ...confronto(), dataHora: DATA, golosCasa: null, golosFora: null, estado: "AGENDADO" },
      "CASA",
    );
    expect(r).toEqual({ data: DATA, adversario: "Benfica", casaFora: "CASA" });
  });

  it("REALIZADO: converte o placar casa/fora em marcados/sofridos da equipa própria", () => {
    const base = {
      ...confronto(),
      dataHora: DATA,
      golosCasa: 1,
      golosFora: 4,
      estado: "REALIZADO" as const,
    };
    expect(camposJogoDoConfronto(base, "CASA")).toMatchObject({
      golosMarcados: 1,
      golosSofridos: 4,
    });
    expect(camposJogoDoConfronto(base, "FORA")).toMatchObject({
      adversario: "Sub-13 A",
      casaFora: "FORA",
      golosMarcados: 4,
      golosSofridos: 1,
    });
  });

  it("WALKOVER/CANCELADO não tocam no resultado do jogo", () => {
    const r = camposJogoDoConfronto(
      { ...confronto(), dataHora: DATA, golosCasa: 2, golosFora: 0, estado: "WALKOVER" },
      "CASA",
    );
    expect(r).not.toHaveProperty("golosMarcados");
  });
});

describe("camposConfrontoDoJogo (/jogos → competição)", () => {
  it("sem resultado completo só sincroniza a data/hora", () => {
    expect(
      camposConfrontoDoJogo({ data: DATA, golosMarcados: 2, golosSofridos: null }, "CASA"),
    ).toEqual({
      dataHora: DATA,
    });
  });

  it("com resultado completo marca REALIZADO com o placar orientado casa/fora", () => {
    expect(
      camposConfrontoDoJogo({ data: DATA, golosMarcados: 3, golosSofridos: 1 }, "FORA"),
    ).toEqual({
      dataHora: DATA,
      golosCasa: 1,
      golosFora: 3,
      estado: "REALIZADO",
      walkoverVencedor: null,
    });
  });
});

// ── Helpers com BD (cliente injetado) ────────────────────────────────────────

function dbFake(opts: {
  resultado?: unknown;
  proprias?: unknown[];
  candidatos?: { id: string; casaFora: string }[];
  jogo?: unknown;
}) {
  return {
    resultadoCompeticao: {
      findUnique: vi.fn().mockResolvedValue(opts.resultado ?? null),
      update: vi.fn().mockResolvedValue({}),
    },
    equipaCompeticao: { findMany: vi.fn().mockResolvedValue(opts.proprias ?? []) },
    jogo: {
      findUnique: vi.fn().mockResolvedValue(opts.jogo ?? null),
      findMany: vi.fn().mockResolvedValue(opts.candidatos ?? []),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: "jogo-novo" }),
    },
  };
}

const RESULTADO = {
  id: "res1",
  competicaoId: "comp1",
  ...confronto(),
  golosCasa: null,
  golosFora: null,
  estado: "AGENDADO",
  dataHora: DATA,
  jogosDetalhados: [],
  competicao: {
    escalaoId: "esc1",
    epocaId: "ep1",
    tipo: "OFICIAL",
    formatoJogo: null,
    escalao: { nome: "Sub-13 A", seccao: { modalidade: "FUTSAL" } },
  },
};

describe("sincronizarJogoDoConfronto", () => {
  it("atualiza o jogo já ligado", async () => {
    const db = dbFake({
      resultado: { ...RESULTADO, jogosDetalhados: [{ id: "j1", equipaCompeticaoId: null }] },
      proprias: [PROPRIA],
    });
    const ids = await sincronizarJogoDoConfronto(db as never, "res1", "u1");
    expect(ids).toEqual(["j1"]);
    expect(db.jogo.update).toHaveBeenCalledWith({
      where: { id: "j1" },
      data: { data: DATA, adversario: "Benfica", casaFora: "CASA" },
    });
    expect(db.jogo.create).not.toHaveBeenCalled();
  });

  it("adota um jogo existente não ligado contra o mesmo adversário (sem duplicar)", async () => {
    const db = dbFake({
      resultado: RESULTADO,
      proprias: [PROPRIA],
      candidatos: [{ id: "j7", casaFora: "FORA" }],
    });
    expect(await sincronizarJogoDoConfronto(db as never, "res1", "u1")).toEqual(["j7"]);
    expect(db.jogo.findMany.mock.calls[0][0].where).toMatchObject({
      competicaoId: "comp1",
      resultadoCompeticaoId: null,
    });
    expect(db.jogo.update).toHaveBeenCalledWith({
      where: { id: "j7" },
      data: { data: DATA, adversario: "Benfica", casaFora: "CASA", resultadoCompeticaoId: "res1" },
    });
    expect(db.jogo.create).not.toHaveBeenCalled();
  });

  it("com vários candidatos desempata pelo lado (casa/fora)", async () => {
    const db = dbFake({
      resultado: RESULTADO,
      proprias: [PROPRIA],
      candidatos: [
        { id: "j1", casaFora: "FORA" },
        { id: "j2", casaFora: "CASA" },
      ],
    });
    expect(await sincronizarJogoDoConfronto(db as never, "res1", "u1")).toEqual(["j2"]);
  });

  it("cria e liga um jogo novo quando não há candidato", async () => {
    const db = dbFake({ resultado: RESULTADO, proprias: [PROPRIA] });
    expect(await sincronizarJogoDoConfronto(db as never, "res1", "u1")).toEqual([
      "jogo-novo",
    ]);
    expect(db.jogo.create.mock.calls[0][0].data).toEqual({
      data: DATA,
      adversario: "Benfica",
      casaFora: "CASA",
      tipo: "OFICIAL",
      formato: "FUTSAL_5",
      competicaoId: "comp1",
      resultadoCompeticaoId: "res1",
      escalaoId: "esc1",
      epocaId: "ep1",
      criadorId: "u1",
    });
  });

  it("não faz nada sem data/hora ou quando o confronto é entre terceiros", async () => {
    const semData = dbFake({ resultado: { ...RESULTADO, dataHora: null }, proprias: [PROPRIA] });
    expect(await sincronizarJogoDoConfronto(semData as never, "res1", "u1")).toEqual([]);
    const terceiros = dbFake({
      resultado: { ...RESULTADO, equipaCasa: "Porto", equipaCasaId: "eq-porto" },
      proprias: [PROPRIA],
    });
    expect(await sincronizarJogoDoConfronto(terceiros as never, "res1", "u1")).toEqual([]);
    for (const db of [semData, terceiros]) {
      expect(db.jogo.update).not.toHaveBeenCalled();
      expect(db.jogo.create).not.toHaveBeenCalled();
    }
  });
});

describe("sincronizarConfrontoDoJogo", () => {
  const JOGO = {
    data: DATA,
    golosMarcados: 2,
    golosSofridos: 2,
    competicaoId: "comp1",
    escalaoId: "esc1",
    epocaId: "ep1",
    resultadoCompeticao: {
      id: "res1",
      competicaoId: "comp1",
      ...confronto(),
      competicao: { escalaoId: "esc1", epocaId: "ep1", escalao: { nome: "Sub-13 A" } },
    },
  };

  it("reflete data e resultado do jogo no confronto ligado", async () => {
    const db = dbFake({ jogo: JOGO, proprias: [PROPRIA] });
    expect(await sincronizarConfrontoDoJogo(db as never, "j1")).toBe("comp1");
    expect(db.resultadoCompeticao.update).toHaveBeenCalledWith({
      where: { id: "res1" },
      data: {
        dataHora: DATA,
        golosCasa: 2,
        golosFora: 2,
        estado: "REALIZADO",
        walkoverVencedor: null,
      },
    });
  });

  it("não sincroniza jogo sem ligação ou movido para outra competição", async () => {
    const semLigacao = dbFake({ jogo: { ...JOGO, resultadoCompeticao: null } });
    expect(await sincronizarConfrontoDoJogo(semLigacao as never, "j1")).toBeNull();
    const movido = dbFake({ jogo: { ...JOGO, competicaoId: "outra" }, proprias: [PROPRIA] });
    expect(await sincronizarConfrontoDoJogo(movido as never, "j1")).toBeNull();
    expect(semLigacao.resultadoCompeticao.update).not.toHaveBeenCalled();
    expect(movido.resultadoCompeticao.update).not.toHaveBeenCalled();
  });
});

// ── §23.11 — Subequipas por competição ──────────────────────────────────────

const A = { id: "eq-a", nome: "Benjamins A" };
const B = { id: "eq-b", nome: "Benjamins B" };

const RESULTADO_AB = {
  ...RESULTADO,
  equipaCasa: "Benjamins A",
  equipaFora: "Benjamins B",
  equipaCasaId: "eq-a",
  equipaForaId: "eq-b",
};

describe("zero-regressão (0/1 equipa própria — §23.11.7)", () => {
  it("sem participante PROPRIO usa o nome do escalão e cria UM jogo sem subequipa", async () => {
    const db = dbFake({
      resultado: { ...RESULTADO, equipaCasaId: null, equipaForaId: null },
      proprias: [],
    });
    expect(await sincronizarJogoDoConfronto(db as never, "res1", "u1")).toEqual(["jogo-novo"]);
    expect(db.jogo.create).toHaveBeenCalledTimes(1);
    expect(db.jogo.create.mock.calls[0][0].data).not.toHaveProperty("equipaCompeticaoId");
    expect(db.jogo.findMany.mock.calls[0][0].where).not.toHaveProperty("equipaCompeticaoId");
  });

  it("com uma equipa própria a adoção e a atualização não gravam equipaCompeticaoId", async () => {
    const db = dbFake({
      resultado: RESULTADO,
      proprias: [PROPRIA],
      candidatos: [{ id: "j7", casaFora: "CASA" }],
    });
    await sincronizarJogoDoConfronto(db as never, "res1", "u1");
    expect(db.jogo.findMany.mock.calls[0][0].where).not.toHaveProperty("equipaCompeticaoId");
    expect(db.jogo.update.mock.calls[0][0].data).not.toHaveProperty("equipaCompeticaoId");
  });

  it("/jogos → competição: jogo sem subequipa orienta pelo único PROPRIO (como antes)", async () => {
    const db = dbFake({
      jogo: {
        data: DATA,
        golosMarcados: 3,
        golosSofridos: 0,
        competicaoId: "comp1",
        escalaoId: "esc1",
        epocaId: "ep1",
        equipaCompeticaoId: null,
        resultadoCompeticao: {
          id: "res1",
          competicaoId: "comp1",
          ...confronto({ equipaCasa: "Benfica", equipaCasaId: "eq-benfica", equipaFora: "Sub-13 A", equipaForaId: "eq-proprio" }),
          competicao: { escalaoId: "esc1", epocaId: "ep1", escalao: { nome: "Sub-13 A" } },
        },
      },
      proprias: [PROPRIA],
    });
    await sincronizarConfrontoDoJogo(db as never, "j1");
    expect(db.resultadoCompeticao.update.mock.calls[0][0].data).toMatchObject({
      golosCasa: 0,
      golosFora: 3,
    });
  });
});

describe("ladosProprios (subequipas)", () => {
  it("num confronto interno A vs B devolve os dois lados com a respetiva equipa", () => {
    expect(ladosProprios(RESULTADO_AB, [A, B])).toEqual([
      { lado: "CASA", equipaId: "eq-a" },
      { lado: "FORA", equipaId: "eq-b" },
    ]);
  });

  it("confronto de uma subequipa com um externo devolve só esse lado", () => {
    const c = confronto({ equipaCasa: "Porto", equipaCasaId: "eq-porto", equipaFora: "Benjamins B", equipaForaId: "eq-b" });
    expect(ladosProprios(c, [A, B])).toEqual([{ lado: "FORA", equipaId: "eq-b" }]);
  });
});

describe("sincronizarJogoDoConfronto com subequipas (§23.11.3 regras 5 e 8)", () => {
  it("A vs B cria dois jogos: adversário = a outra subequipa e casa/fora por lado", async () => {
    const db = dbFake({ resultado: RESULTADO_AB, proprias: [A, B] });
    db.jogo.create
      .mockResolvedValueOnce({ id: "jogo-a" })
      .mockResolvedValueOnce({ id: "jogo-b" });
    expect(await sincronizarJogoDoConfronto(db as never, "res1", "u1")).toEqual([
      "jogo-a",
      "jogo-b",
    ]);
    expect(db.jogo.create).toHaveBeenCalledTimes(2);
    expect(db.jogo.create.mock.calls[0][0].data).toMatchObject({
      adversario: "Benjamins B",
      casaFora: "CASA",
      equipaCompeticaoId: "eq-a",
      resultadoCompeticaoId: "res1",
    });
    expect(db.jogo.create.mock.calls[1][0].data).toMatchObject({
      adversario: "Benjamins A",
      casaFora: "FORA",
      equipaCompeticaoId: "eq-b",
      resultadoCompeticaoId: "res1",
    });
  });

  it("A vs B REALIZADO: a competição nunca escreve golos nos jogos (cada um mantém o seu)", async () => {
    const db = dbFake({
      resultado: {
        ...RESULTADO_AB,
        estado: "REALIZADO",
        golosCasa: 3,
        golosFora: 1,
        jogosDetalhados: [
          { id: "jogo-a", equipaCompeticaoId: "eq-a" },
          { id: "jogo-b", equipaCompeticaoId: "eq-b" },
        ],
      },
      proprias: [A, B],
    });
    await sincronizarJogoDoConfronto(db as never, "res1", "u1");
    expect(db.jogo.update).toHaveBeenCalledTimes(2);
    for (const [arg] of db.jogo.update.mock.calls) {
      expect(arg.data).not.toHaveProperty("golosMarcados");
      expect(arg.data).not.toHaveProperty("golosSofridos");
      expect(arg.data.data).toEqual(DATA);
    }
  });

  it("zero-regressão: confronto não interno REALIZADO continua a escrever o placar", async () => {
    const db = dbFake({
      resultado: {
        ...RESULTADO,
        estado: "REALIZADO",
        golosCasa: 2,
        golosFora: 0,
        jogosDetalhados: [{ id: "j1", equipaCompeticaoId: null }],
      },
      proprias: [PROPRIA],
    });
    await sincronizarJogoDoConfronto(db as never, "res1", "u1");
    expect(db.jogo.update.mock.calls[0][0].data).toMatchObject({
      golosMarcados: 2,
      golosSofridos: 0,
    });
  });

  it("0/1 equipa própria: prefere o jogo ligado da própria equipa ao sem equipa", async () => {
    const db = dbFake({
      resultado: {
        ...RESULTADO,
        jogosDetalhados: [
          { id: "j-sem", equipaCompeticaoId: null },
          { id: "j-propria", equipaCompeticaoId: "eq-proprio" },
        ],
      },
      proprias: [PROPRIA],
    });
    expect(await sincronizarJogoDoConfronto(db as never, "res1", "u1")).toEqual(["j-propria"]);
    expect(db.resultadoCompeticao.findUnique.mock.calls[0][0].select.jogosDetalhados).toEqual({
      select: { id: true, equipaCompeticaoId: true },
      orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
    });
  });

  it("A vs B com os dois jogos já ligados atualiza cada um pela sua subequipa", async () => {
    const db = dbFake({
      resultado: {
        ...RESULTADO_AB,
        jogosDetalhados: [
          { id: "jogo-b", equipaCompeticaoId: "eq-b" },
          { id: "jogo-a", equipaCompeticaoId: "eq-a" },
        ],
      },
      proprias: [A, B],
    });
    expect(await sincronizarJogoDoConfronto(db as never, "res1", "u1")).toEqual([
      "jogo-a",
      "jogo-b",
    ]);
    expect(db.jogo.update).toHaveBeenCalledWith({
      where: { id: "jogo-a" },
      data: { data: DATA, adversario: "Benjamins B", casaFora: "CASA", equipaCompeticaoId: "eq-a" },
    });
    expect(db.jogo.update).toHaveBeenCalledWith({
      where: { id: "jogo-b" },
      data: { data: DATA, adversario: "Benjamins A", casaFora: "FORA", equipaCompeticaoId: "eq-b" },
    });
    expect(db.jogo.create).not.toHaveBeenCalled();
  });

  it("a adoção filtra os candidatos também pela subequipa", async () => {
    const db = dbFake({
      resultado: {
        ...RESULTADO,
        equipaCasa: "Benjamins A",
        equipaCasaId: "eq-a",
      },
      proprias: [A, B],
      candidatos: [{ id: "j9", casaFora: "CASA" }],
    });
    expect(await sincronizarJogoDoConfronto(db as never, "res1", "u1")).toEqual(["j9"]);
    expect(db.jogo.findMany.mock.calls[0][0].where).toMatchObject({
      competicaoId: "comp1",
      resultadoCompeticaoId: null,
      equipaCompeticaoId: "eq-a",
    });
  });

  it("jogo ligado antes de haver subequipas (sem equipa) é atualizado e fica com a subequipa", async () => {
    const db = dbFake({
      resultado: {
        ...RESULTADO,
        equipaCasa: "Benjamins A",
        equipaCasaId: "eq-a",
        jogosDetalhados: [{ id: "j-legado", equipaCompeticaoId: null }],
      },
      proprias: [A, B],
    });
    expect(await sincronizarJogoDoConfronto(db as never, "res1", "u1")).toEqual(["j-legado"]);
    expect(db.jogo.update.mock.calls[0][0]).toEqual({
      where: { id: "j-legado" },
      data: { data: DATA, adversario: "Benfica", casaFora: "CASA", equipaCompeticaoId: "eq-a" },
    });
  });
});

describe("sincronizarConfrontoDoJogo com subequipas (§23.11.3 regra 6)", () => {
  const jogoDe = (equipaCompeticaoId: string, golosMarcados: number, golosSofridos: number) => ({
    data: DATA,
    golosMarcados,
    golosSofridos,
    competicaoId: "comp1",
    escalaoId: "esc1",
    epocaId: "ep1",
    equipaCompeticaoId,
    resultadoCompeticao: {
      id: "res1",
      competicaoId: "comp1",
      equipaCasa: "Benjamins A",
      equipaFora: "Benjamins B",
      equipaCasaId: "eq-a",
      equipaForaId: "eq-b",
      competicao: { escalaoId: "esc1", epocaId: "ep1", escalao: { nome: "Benjamins" } },
    },
  });

  it("cada jogo escreve o placar na sua perspetiva; prevalece o último gravado", async () => {
    // Jogo de B (fora) grava 2–0 a favor de B.
    const dbB = dbFake({ jogo: jogoDe("eq-b", 2, 0), proprias: [A, B] });
    expect(await sincronizarConfrontoDoJogo(dbB as never, "jogo-b")).toBe("comp1");
    expect(dbB.resultadoCompeticao.update.mock.calls[0][0].data).toMatchObject({
      golosCasa: 0,
      golosFora: 2,
      estado: "REALIZADO",
    });
    // Depois o jogo de A grava 1–1: o confronto fica com o último gravado.
    const dbA = dbFake({ jogo: jogoDe("eq-a", 1, 1), proprias: [A, B] });
    await sincronizarConfrontoDoJogo(dbA as never, "jogo-a");
    expect(dbA.resultadoCompeticao.update.mock.calls[0][0].data).toMatchObject({
      golosCasa: 1,
      golosFora: 1,
    });
    // O outro jogo nunca é sobrescrito pelo placar do primeiro: recebe só a data/hora.
    expect(dbA.jogo.update).not.toHaveBeenCalled();
    expect(dbB.jogo.update).not.toHaveBeenCalled();
    expect(dbB.jogo.updateMany).toHaveBeenCalledWith({
      where: {
        resultadoCompeticaoId: "res1",
        AND: [{ equipaCompeticaoId: { not: null } }, { equipaCompeticaoId: { not: "eq-b" } }],
      },
      data: { data: DATA },
    });
  });

  it("zero-regressão: jogo sem subequipa não propaga a data a outros jogos", async () => {
    const db = dbFake({ jogo: { ...jogoDe("eq-a", 1, 0), equipaCompeticaoId: null }, proprias: [PROPRIA] });
    await sincronizarConfrontoDoJogo(db as never, "j1");
    expect(db.jogo.updateMany).not.toHaveBeenCalled();
  });

  it("não sincroniza um jogo cuja subequipa não é própria desta competição", async () => {
    const db = dbFake({ jogo: jogoDe("eq-outra", 1, 0), proprias: [A, B] });
    expect(await sincronizarConfrontoDoJogo(db as never, "j1")).toBeNull();
    expect(db.resultadoCompeticao.update).not.toHaveBeenCalled();
  });
});

describe("validarLigacaoJogoConfronto (§23.11.3 regras 1, 5 e 8)", () => {
  const conf = (jogosDetalhados: { id: string; equipaCompeticaoId: string | null }[]) => ({
    competicaoId: "comp1",
    equipaCasa: "Benjamins A",
    equipaFora: "Benfica",
    equipaCasaId: null,
    equipaForaId: null,
    jogosDetalhados,
    competicao: { escalao: { nome: "Benjamins" } },
  });
  const validar = (db: unknown, equipaCompeticaoId: string | null) =>
    validarLigacaoJogoConfronto(db as never, {
      jogoId: "j1",
      resultadoId: "res1",
      competicaoId: "comp1",
      equipaCompeticaoId,
    });

  it("com ≥2 próprias exige que a subequipa jogue o confronto (por nome sem FK)", async () => {
    const db = dbFake({ resultado: conf([]), proprias: [A, B] });
    expect(await validar(db, "eq-b")).toBe("A equipa do jogo não participa neste confronto");
    expect(await validar(db, null)).toMatch(/várias equipas próprias/);
    expect(await validar(db, "eq-a")).toBeNull();
  });

  it("bloqueia 2.º jogo da mesma subequipa e 2.º jogo num confronto não interno", async () => {
    const mesma = dbFake({ resultado: conf([{ id: "j9", equipaCompeticaoId: "eq-a" }]), proprias: [A, B] });
    expect(await validar(mesma, "eq-a")).toBe("Esta equipa já tem um jogo ligado a este confronto");
    const naoInterno = dbFake({
      resultado: { ...conf([{ id: "j9", equipaCompeticaoId: null }]), equipaCasa: "Sub-13 A" },
      proprias: [PROPRIA],
    });
    expect(await validar(naoInterno, null)).toBe("Este confronto já tem um jogo ligado");
  });

  it("zero-regressão: 0/1 próprias e confronto sem outros jogos ⇒ válido", async () => {
    const db = dbFake({ resultado: conf([{ id: "j1", equipaCompeticaoId: null }]), proprias: [PROPRIA] });
    expect(await validar(db, null)).toBeNull();
  });

  it("confronto de outra competição não é validado (a sincronização ignora-o)", async () => {
    const db = dbFake({ resultado: { ...conf([]), competicaoId: "outra" }, proprias: [A, B] });
    expect(await validar(db, null)).toBeNull();
  });
});
