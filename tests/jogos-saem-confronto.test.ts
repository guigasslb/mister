import { describe, it, expect } from "vitest";
import {
  jogosQueSaemDoConfronto,
  ladosInvertidos,
  ladosProprios,
  resultadoAposEdicao,
  type ConfrontoEquipas,
  type EquipaPropria,
} from "@/lib/sincronizacao-jogo-confronto";

// Edição de confronto (§23.6/§23.11): que jogos ligados deixam o confronto, que
// lado passam a representar os que ficam, e o placar após a edição (D3).

const A: EquipaPropria = { id: "eqA", nome: "Benjamins A" };
const B: EquipaPropria = { id: "eqB", nome: "Benjamins B" };
const c = (casa: string, fora: string, casaId: string | null = null, foraId: string | null = null): ConfrontoEquipas => ({
  equipaCasa: casa,
  equipaFora: fora,
  equipaCasaId: casaId,
  equipaForaId: foraId,
});

describe("jogosQueSaemDoConfronto — 0/1 equipa própria", () => {
  const propria: EquipaPropria[] = [{ id: null, nome: "Benjamins" }];
  const jogos = [{ id: "j1", equipaCompeticaoId: null }];
  const saida = (conf: ConfrontoEquipas) => jogosQueSaemDoConfronto(jogos, ladosProprios(conf, propria), propria);

  it("fica (com o lado novo) enquanto o confronto tiver lado próprio", () => {
    expect(saida(c("Benfica", "Benjamins"))).toEqual({
      saem: [],
      ficam: [{ id: "j1", lado: { lado: "FORA", equipaId: null } }],
    });
    expect(saida(c("Benjamins", "Porto")).ficam.map((f) => f.lado.lado)).toEqual(["CASA"]);
  });

  it("sai quando o confronto passa a ser entre terceiros", () => {
    expect(saida(c("Porto", "Benfica"))).toEqual({ saem: ["j1"], ficam: [] });
  });
});

describe("jogosQueSaemDoConfronto — ≥2 equipas próprias (subequipas)", () => {
  const proprias = [A, B];
  const saida = (jogos: { id: string; equipaCompeticaoId: string | null }[], conf: ConfrontoEquipas) =>
    jogosQueSaemDoConfronto(jogos, ladosProprios(conf, proprias), proprias);
  const ids = (r: ReturnType<typeof saida>) => ({ saem: r.saem, ficam: r.ficam.map((f) => [f.id, f.lado.equipaId]) });

  it("A vs X → B vs X: sai o jogo de A", () => {
    expect(ids(saida([{ id: "jA", equipaCompeticaoId: "eqA" }], c("Benjamins B", "Benfica", "eqB", "x")))).toEqual({
      saem: ["jA"],
      ficam: [],
    });
  });

  it("A vs B → A vs X: sai o jogo de B", () => {
    const jogos = [
      { id: "jA", equipaCompeticaoId: "eqA" },
      { id: "jB", equipaCompeticaoId: "eqB" },
    ];
    expect(ids(saida(jogos, c("Benjamins A", "Benfica", "eqA", "x")))).toEqual({ saem: ["jB"], ficam: [["jA", "eqA"]] });
  });

  it("A vs B → B vs A (troca): não sai ninguém, cada jogo no lado novo", () => {
    const jogos = [
      { id: "jA", equipaCompeticaoId: "eqA" },
      { id: "jB", equipaCompeticaoId: "eqB" },
    ];
    const r = saida(jogos, c("Benjamins B", "Benjamins A", "eqB", "eqA"));
    expect(r.saem).toEqual([]);
    expect(r.ficam.map((f) => [f.id, f.lado.lado])).toEqual([
      ["jA", "FORA"],
      ["jB", "CASA"],
    ]);
  });

  it("legado sem subequipa com UM só lado próprio é adotado por esse lado (como a sincronização), mesmo que seja B", () => {
    const legado = [{ id: "jL", equipaCompeticaoId: null }];
    expect(ids(saida(legado, c("Benjamins B", "Benfica", "eqB", "x")))).toEqual({ saem: [], ficam: [["jL", "eqB"]] });
  });

  it("legado num confronto interno fica com a 1.ª equipa própria; entre terceiros sai", () => {
    const legado = [{ id: "jL", equipaCompeticaoId: null }];
    expect(ids(saida(legado, c("Benjamins B", "Benjamins A", "eqB", "eqA")))).toEqual({ saem: [], ficam: [["jL", "eqA"]] });
    expect(ids(saida(legado, c("Porto", "Benfica", "y", "x")))).toEqual({ saem: ["jL"], ficam: [] });
  });

  it("legado sai se o lado que o adotaria já tem jogo da própria subequipa", () => {
    const jogos = [
      { id: "jL", equipaCompeticaoId: null },
      { id: "jB", equipaCompeticaoId: "eqB" },
    ];
    expect(ids(saida(jogos, c("Benjamins B", "Benfica", "eqB", "x")))).toEqual({ saem: ["jL"], ficam: [["jB", "eqB"]] });
  });
});

describe("ladosInvertidos + resultadoAposEdicao (D3)", () => {
  const P = "eqP"; // Benjamins
  const X = "eqX"; // Benfica
  const Y = "eqY"; // Porto
  const realizado = { estado: "REALIZADO" as const, golosCasa: 3, golosFora: 1, walkoverVencedor: null };

  it("Benjamins 3–1 Benfica → Porto vs Benjamins = 1–3 (Benjamins mantém os seus 3 golos)", () => {
    const inverte = ladosInvertidos({ casa: P, fora: X }, { casa: Y, fora: P });
    expect(inverte).toBe(true);
    expect(resultadoAposEdicao(realizado, inverte)).toEqual({ golosCasa: 1, golosFora: 3, walkoverVencedor: null });
  });

  it("troca total inverte; substituir sem mudar de lado mantém o placar por posição", () => {
    expect(ladosInvertidos({ casa: P, fora: X }, { casa: X, fora: P })).toBe(true);
    const mantem = ladosInvertidos({ casa: P, fora: X }, { casa: P, fora: Y });
    expect(mantem).toBe(false);
    expect(resultadoAposEdicao(realizado, mantem)).toEqual({ golosCasa: 3, golosFora: 1, walkoverVencedor: null });
  });

  it("equipa atual desconhecida (removida) nunca conta como inversão", () => {
    expect(ladosInvertidos({ casa: null, fora: null }, { casa: X, fora: P })).toBe(false);
  });

  it("walkover inverte o vencedor; sem resultado (AGENDADO/CANCELADO) ⇒ null", () => {
    expect(resultadoAposEdicao({ estado: "WALKOVER", golosCasa: null, golosFora: null, walkoverVencedor: "CASA" }, true)).toEqual({
      golosCasa: null,
      golosFora: null,
      walkoverVencedor: "FORA",
    });
    for (const estado of ["AGENDADO", "CANCELADO"] as const)
      expect(resultadoAposEdicao({ estado, golosCasa: null, golosFora: null, walkoverVencedor: null }, true)).toBeNull();
  });
});
