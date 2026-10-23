import { describe, it, expect } from "vitest";
import {
  confrontoComPlacarDivergente,
  convocaveisJogo,
  equipaFiltroValida,
  opcoesEquipaRelatorio,
  outrasSubequipasDoAtleta,
  participantesWizard,
  selecionaveis,
} from "@/lib/subequipas-ui";

const atletas = [
  { id: "a1", nome: "Ana" },
  { id: "a2", nome: "Bruno" },
  { id: "a3", nome: "Carla" },
  { id: "a4", nome: "Duarte" },
];
const vazio = new Set<string>();
const ids = (l: { atleta: { id: string } }[]) => l.map((x) => x.atleta.id);

describe("convocaveisJogo (§23.11.3 regras 4–5)", () => {
  it("sem plantel: todo o escalão, sem exceções nem avisos (zero-regressão)", () => {
    const r = convocaveisJogo({
      atletas,
      plantelIds: [],
      convocados: vazio,
      revelados: vazio,
      bloqueadosIds: [],
    });
    expect(r.restrito).toBe(false);
    expect(ids(r.visiveis)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(r.visiveis.every((l) => !l.foraPlantel && !l.bloqueado)).toBe(true);
    expect(r.foraDoPlantel).toEqual([]);
    expect(selecionaveis(r.visiveis, vazio)).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("com plantel: só o plantel; os restantes ficam disponíveis como exceção", () => {
    const r = convocaveisJogo({
      atletas,
      plantelIds: ["a1", "a2"],
      convocados: vazio,
      revelados: vazio,
      bloqueadosIds: [],
    });
    expect(r.restrito).toBe(true);
    expect(ids(r.visiveis)).toEqual(["a1", "a2"]);
    expect(r.foraDoPlantel.map((a) => a.id)).toEqual(["a3", "a4"]);
  });

  it("convocado ou revelado fora do plantel fica visível e assinalado", () => {
    const r = convocaveisJogo({
      atletas,
      plantelIds: ["a1"],
      convocados: new Set(["a3"]),
      revelados: new Set(["a4"]),
      bloqueadosIds: [],
    });
    expect(ids(r.visiveis)).toEqual(["a1", "a3", "a4"]);
    expect(r.visiveis.filter((l) => l.foraPlantel).map((l) => l.atleta.id)).toEqual(["a3", "a4"]);
    expect(r.foraDoPlantel.map((a) => a.id)).toEqual(["a2"]);
  });

  it("plantel com atletas que já não estão no escalão não os inventa", () => {
    const r = convocaveisJogo({
      atletas,
      plantelIds: ["saiu", "a2"],
      convocados: vazio,
      revelados: vazio,
      bloqueadosIds: [],
    });
    expect(ids(r.visiveis)).toEqual(["a2"]);
  });

  it("A vs B: convocados pela outra subequipa ficam bloqueados e fora das exceções", () => {
    const r = convocaveisJogo({
      atletas,
      plantelIds: ["a1", "a2"],
      convocados: new Set(["a1"]),
      revelados: vazio,
      bloqueadosIds: ["a2", "a4"],
    });
    expect(r.visiveis.find((l) => l.atleta.id === "a2")?.bloqueado).toBe(true);
    expect(r.foraDoPlantel.map((a) => a.id)).toEqual(["a3"]);
    expect(selecionaveis(r.visiveis, new Set(["a1"]))).toEqual(["a1"]);
    // Bloqueado mas já convocado: pode ser desmarcado.
    expect(selecionaveis(r.visiveis, new Set(["a1", "a2"]))).toEqual(["a1", "a2"]);
  });
});

describe("participantesWizard (§23.11.3 regra 9)", () => {
  it("PRÓPRIA sem marcadas: junta o escalão primeiro, sem duplicar (comportamento anterior)", () => {
    const r = participantesWizard(
      [
        { nome: "CD Aves", propria: false },
        { nome: " benjamins ", propria: false },
      ],
      true,
      "Benjamins",
    );
    expect(r).toEqual([
      { nome: "Benjamins", ehPropria: true, automatica: true },
      { nome: "CD Aves", ehPropria: false, automatica: false },
    ]);
  });

  it("EXTERNA sem marcadas: só as introduzidas", () => {
    const r = participantesWizard([{ nome: "CD Aves", propria: false }], false, "Benjamins");
    expect(r).toEqual([{ nome: "CD Aves", ehPropria: false, automatica: false }]);
  });

  it("com marcadas (Própria ou Externa): o escalão não é juntado", () => {
    const equipas = [
      { nome: "Benjamins A", propria: true },
      { nome: "Benjamins B", propria: true },
      { nome: "CD Aves", propria: false },
    ];
    for (const ambitoPropria of [true, false]) {
      expect(participantesWizard(equipas, ambitoPropria, "Benjamins")).toEqual([
        { nome: "Benjamins A", ehPropria: true, automatica: false },
        { nome: "Benjamins B", ehPropria: true, automatica: false },
        { nome: "CD Aves", ehPropria: false, automatica: false },
      ]);
    }
  });
});

describe("outrasSubequipasDoAtleta (§23.11.3 regra 2)", () => {
  const planteis = [
    { id: "A", nome: "Benjamins A", atletaIds: ["a1", "a2"] },
    { id: "B", nome: "Benjamins B", atletaIds: ["a2"] },
  ];
  it("lista as outras subequipas, nunca a própria", () => {
    expect(outrasSubequipasDoAtleta("a2", "A", planteis)).toEqual(["Benjamins B"]);
    expect(outrasSubequipasDoAtleta("a1", "A", planteis)).toEqual([]);
    expect(outrasSubequipasDoAtleta("a1", "B", planteis)).toEqual(["Benjamins A"]);
  });
});

describe("confrontoComPlacarDivergente (§23.11.3 regra 6)", () => {
  it("um só jogo (ou sem subequipa) nunca diverge", () => {
    expect(
      confrontoComPlacarDivergente([{ equipaCompeticaoId: null, golosMarcados: 1, golosSofridos: 0 }]),
    ).toBe(false);
    expect(confrontoComPlacarDivergente([])).toBe(false);
  });
  it("A vs B coerente vs divergente", () => {
    const a = { equipaCompeticaoId: "A", golosMarcados: 2, golosSofridos: 1 };
    expect(
      confrontoComPlacarDivergente([a, { equipaCompeticaoId: "B", golosMarcados: 1, golosSofridos: 2 }]),
    ).toBe(false);
    expect(
      confrontoComPlacarDivergente([a, { equipaCompeticaoId: "B", golosMarcados: 2, golosSofridos: 2 }]),
    ).toBe(true);
  });
});

describe("equipaFiltroValida (§23.11.3 regra 10)", () => {
  const competicoes = [
    { id: "c1", equipas: [{ id: "A" }, { id: "B" }] },
    { id: "c2", equipas: [] },
  ];
  it("aplica só subequipas da competição selecionada", () => {
    expect(equipaFiltroValida(competicoes, "c1", "A")).toBe("A");
    expect(equipaFiltroValida(competicoes, "c1", "X")).toBeUndefined();
    expect(equipaFiltroValida(competicoes, "c2", "A")).toBeUndefined();
    expect(equipaFiltroValida(competicoes, undefined, "A")).toBeUndefined();
    expect(equipaFiltroValida(competicoes, "c1", undefined)).toBeUndefined();
  });
});

describe("opcoesEquipaRelatorio (§23.11.3 regra 10)", () => {
  it("só competições com ≥2 subequipas, pela ordem recebida (sem reordenar)", () => {
    expect(
      opcoesEquipaRelatorio([
        { nome: "Liga", equipas: [{ id: "B", nome: "Benjamins B" }, { id: "A", nome: "Benjamins A" }] },
        { nome: "Taça", equipas: [] },
      ]),
    ).toEqual([
      { id: "B", rotulo: "Benjamins B · Liga" },
      { id: "A", rotulo: "Benjamins A · Liga" },
    ]);
    expect(opcoesEquipaRelatorio([])).toEqual([]);
  });
});
