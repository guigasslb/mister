import { describe, it, expect } from "vitest";
import { filtrarBibliotecaAquecimento } from "@/lib/treino-aquecimento";

type Ex = { id: string; nome: string };

const biblioteca: Ex[] = [
  { id: "1", nome: "Rondo 4x1" },
  { id: "2", nome: "Aquecimento articular" },
  { id: "3", nome: "Circuito de mobilidade" },
  { id: "4", nome: "Jogo reduzido 3x3" },
];

describe("filtrarBibliotecaAquecimento — seletor rápido do modo treino (§8.8.2)", () => {
  it("com termo vazio devolve tudo, ordenado por nome (pt)", () => {
    expect(filtrarBibliotecaAquecimento(biblioteca, "").map((e) => e.id)).toEqual([
      "2", // Aquecimento articular
      "3", // Circuito de mobilidade
      "4", // Jogo reduzido 3x3
      "1", // Rondo 4x1
    ]);
  });

  it("filtra por substring do nome, sem distinção de maiúsculas", () => {
    expect(filtrarBibliotecaAquecimento(biblioteca, "rondo").map((e) => e.id)).toEqual([
      "1",
    ]);
    expect(filtrarBibliotecaAquecimento(biblioteca, "AQUEC").map((e) => e.id)).toEqual([
      "2",
    ]);
  });

  it("ignora espaços em redor do termo", () => {
    expect(
      filtrarBibliotecaAquecimento(biblioteca, "  circuito  ").map((e) => e.id),
    ).toEqual(["3"]);
  });

  it("devolve vazio quando nada corresponde", () => {
    expect(filtrarBibliotecaAquecimento(biblioteca, "penáltis")).toEqual([]);
  });

  it("mantém a ordenação por nome nos resultados filtrados", () => {
    const res = filtrarBibliotecaAquecimento(
      [
        { id: "b", nome: "Passe B" },
        { id: "a", nome: "Passe A" },
      ],
      "passe",
    );
    expect(res.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("não muta a lista recebida", () => {
    const entrada: Ex[] = [
      { id: "1", nome: "Rondo 4x1" },
      { id: "2", nome: "Aquecimento articular" },
    ];
    filtrarBibliotecaAquecimento(entrada, "");
    expect(entrada.map((e) => e.id)).toEqual(["1", "2"]);
  });
});
