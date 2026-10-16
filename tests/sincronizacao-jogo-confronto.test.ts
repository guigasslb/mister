import { describe, it, expect, vi } from "vitest";
import {
  ladoProprio,
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
    expect(ladoProprio(confronto({ equipaCasa: "Outro nome" }), PROPRIA)).toBe("CASA");
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
    ).toBe("FORA");
  });

  it("recorre ao nome (case-insensitive, trim) quando não há FK", () => {
    const c = confronto({
      equipaCasa: "Benfica",
      equipaFora: " sub-13 a ",
      equipaCasaId: null,
      equipaForaId: null,
    });
    expect(ladoProprio(c, { id: null, nome: "Sub-13 A" })).toBe("FORA");
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
  proprio?: unknown;
  candidatos?: { id: string; casaFora: string }[];
  jogo?: unknown;
}) {
  return {
    resultadoCompeticao: {
      findUnique: vi.fn().mockResolvedValue(opts.resultado ?? null),
      update: vi.fn().mockResolvedValue({}),
    },
    equipaCompeticao: { findFirst: vi.fn().mockResolvedValue(opts.proprio ?? null) },
    jogo: {
      findUnique: vi.fn().mockResolvedValue(opts.jogo ?? null),
      findMany: vi.fn().mockResolvedValue(opts.candidatos ?? []),
      update: vi.fn().mockResolvedValue({}),
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
  jogoDetalhado: null,
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
      resultado: { ...RESULTADO, jogoDetalhado: { id: "j1" } },
      proprio: PROPRIA,
    });
    const id = await sincronizarJogoDoConfronto(db as never, "res1", "u1");
    expect(id).toBe("j1");
    expect(db.jogo.update).toHaveBeenCalledWith({
      where: { id: "j1" },
      data: { data: DATA, adversario: "Benfica", casaFora: "CASA" },
    });
    expect(db.jogo.create).not.toHaveBeenCalled();
  });

  it("adota um jogo existente não ligado contra o mesmo adversário (sem duplicar)", async () => {
    const db = dbFake({
      resultado: RESULTADO,
      proprio: PROPRIA,
      candidatos: [{ id: "j7", casaFora: "FORA" }],
    });
    expect(await sincronizarJogoDoConfronto(db as never, "res1", "u1")).toBe("j7");
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
      proprio: PROPRIA,
      candidatos: [
        { id: "j1", casaFora: "FORA" },
        { id: "j2", casaFora: "CASA" },
      ],
    });
    expect(await sincronizarJogoDoConfronto(db as never, "res1", "u1")).toBe("j2");
  });

  it("cria e liga um jogo novo quando não há candidato", async () => {
    const db = dbFake({ resultado: RESULTADO, proprio: PROPRIA });
    expect(await sincronizarJogoDoConfronto(db as never, "res1", "u1")).toBe("jogo-novo");
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
    const semData = dbFake({ resultado: { ...RESULTADO, dataHora: null }, proprio: PROPRIA });
    expect(await sincronizarJogoDoConfronto(semData as never, "res1", "u1")).toBeNull();
    const terceiros = dbFake({
      resultado: { ...RESULTADO, equipaCasa: "Porto", equipaCasaId: "eq-porto" },
      proprio: PROPRIA,
    });
    expect(await sincronizarJogoDoConfronto(terceiros as never, "res1", "u1")).toBeNull();
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
    const db = dbFake({ jogo: JOGO, proprio: PROPRIA });
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
    const movido = dbFake({ jogo: { ...JOGO, competicaoId: "outra" }, proprio: PROPRIA });
    expect(await sincronizarConfrontoDoJogo(movido as never, "j1")).toBeNull();
    expect(semLigacao.resultadoCompeticao.update).not.toHaveBeenCalled();
    expect(movido.resultadoCompeticao.update).not.toHaveBeenCalled();
  });
});
