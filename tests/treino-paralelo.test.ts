import { describe, it, expect } from "vitest";
import { agruparEmBlocos, letraColuna } from "@/lib/treino-paralelo";

type Ex = { id: string; grupoParalelo: string | null };

const ids = (blocos: Ex[][]) => blocos.map((b) => b.map((e) => e.id));

describe("agruparEmBlocos — exercícios em paralelo (§3.5)", () => {
  it("sem grupos: cada exercício é um bloco próprio", () => {
    const entrada: Ex[] = [
      { id: "a", grupoParalelo: null },
      { id: "b", grupoParalelo: null },
    ];
    expect(ids(agruparEmBlocos(entrada))).toEqual([["a"], ["b"]]);
  });

  it("junta linhas seguidas com o mesmo grupo num só bloco, pela ordem recebida", () => {
    const entrada: Ex[] = [
      { id: "a", grupoParalelo: null },
      { id: "b", grupoParalelo: "g1" },
      { id: "c", grupoParalelo: "g1" },
      { id: "d", grupoParalelo: null },
    ];
    expect(ids(agruparEmBlocos(entrada))).toEqual([["a"], ["b", "c"], ["d"]]);
  });

  it("grupos diferentes seguidos ficam em blocos distintos", () => {
    const entrada: Ex[] = [
      { id: "a", grupoParalelo: "g1" },
      { id: "b", grupoParalelo: "g1" },
      { id: "c", grupoParalelo: "g2" },
      { id: "d", grupoParalelo: "g2" },
    ];
    expect(ids(agruparEmBlocos(entrada))).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("só junta linhas SEGUIDAS (o mesmo grupo interrompido não se funde)", () => {
    const entrada: Ex[] = [
      { id: "a", grupoParalelo: "g1" },
      { id: "b", grupoParalelo: null },
      { id: "c", grupoParalelo: "g1" },
    ];
    expect(ids(agruparEmBlocos(entrada))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("não muta o array recebido", () => {
    const entrada: Ex[] = [
      { id: "a", grupoParalelo: "g1" },
      { id: "b", grupoParalelo: "g1" },
    ];
    const copia = [...entrada];
    agruparEmBlocos(entrada);
    expect(entrada).toEqual(copia);
  });
});

describe("letraColuna", () => {
  it("numera as colunas do bloco com letras minúsculas", () => {
    expect([0, 1, 2].map(letraColuna)).toEqual(["a", "b", "c"]);
  });
});
