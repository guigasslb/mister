import { describe, it, expect } from "vitest";
import type { ParteTreinoValor } from "@/lib/schemas/exercicio";
import {
  ordenarExerciciosPorFase,
  fasesComExercicios,
  ordemDaFase,
  ORDEM_FASES,
  SEM_FASE,
} from "@/lib/treino-fases";

type Ex = { id: string; parteTreino: ParteTreinoValor | null };

describe("ordemDaFase — ordem canónica das fases (§3.5)", () => {
  it("Aquecimento → Principal → Jogo → Retorno à calma → Sem fase", () => {
    expect(ORDEM_FASES).toEqual([
      "AQUECIMENTO",
      "PRINCIPAL",
      "JOGO_REDUZIDO",
      "RETORNO_CALMA",
      SEM_FASE,
    ]);
    expect(ordemDaFase("AQUECIMENTO")).toBe(0);
    expect(ordemDaFase("PRINCIPAL")).toBe(1);
    expect(ordemDaFase("JOGO_REDUZIDO")).toBe(2);
    expect(ordemDaFase("RETORNO_CALMA")).toBe(3);
    expect(ordemDaFase(null)).toBe(4); // sem fase vai para o fim
  });
});

describe("ordenarExerciciosPorFase", () => {
  it("reordena exercícios baralhados para a sequência canónica das fases", () => {
    const baralhado: Ex[] = [
      { id: "jogo", parteTreino: "JOGO_REDUZIDO" },
      { id: "retorno", parteTreino: "RETORNO_CALMA" },
      { id: "aquec", parteTreino: "AQUECIMENTO" },
      { id: "principal", parteTreino: "PRINCIPAL" },
    ];
    expect(ordenarExerciciosPorFase(baralhado).map((e) => e.id)).toEqual([
      "aquec",
      "principal",
      "jogo",
      "retorno",
    ]);
  });

  it("preserva a ordem de entrada dentro da mesma fase (sort estável = `ordem`)", () => {
    // Entrada já por `ordem` asc dentro de cada fase, mas com fases intercaladas.
    const entrada: Ex[] = [
      { id: "p1", parteTreino: "PRINCIPAL" },
      { id: "a1", parteTreino: "AQUECIMENTO" },
      { id: "p2", parteTreino: "PRINCIPAL" },
      { id: "a2", parteTreino: "AQUECIMENTO" },
      { id: "p3", parteTreino: "PRINCIPAL" },
    ];
    expect(ordenarExerciciosPorFase(entrada).map((e) => e.id)).toEqual([
      "a1",
      "a2",
      "p1",
      "p2",
      "p3",
    ]);
  });

  it("coloca exercícios sem fase no fim, sem perder a sua ordem relativa", () => {
    const entrada: Ex[] = [
      { id: "sem1", parteTreino: null },
      { id: "aquec", parteTreino: "AQUECIMENTO" },
      { id: "sem2", parteTreino: null },
    ];
    expect(ordenarExerciciosPorFase(entrada).map((e) => e.id)).toEqual([
      "aquec",
      "sem1",
      "sem2",
    ]);
  });

  it("não muta o array recebido", () => {
    const entrada: Ex[] = [
      { id: "jogo", parteTreino: "JOGO_REDUZIDO" },
      { id: "aquec", parteTreino: "AQUECIMENTO" },
    ];
    ordenarExerciciosPorFase(entrada);
    expect(entrada.map((e) => e.id)).toEqual(["jogo", "aquec"]);
  });
});

describe("fasesComExercicios — navegação por fase", () => {
  it("lista só as fases presentes, na ordem canónica, com o índice do 1.º exercício", () => {
    // Sem fase PRINCIPAL: deve ser omitida da barra.
    const ordenados: Ex[] = ordenarExerciciosPorFase([
      { id: "a1", parteTreino: "AQUECIMENTO" },
      { id: "a2", parteTreino: "AQUECIMENTO" },
      { id: "j1", parteTreino: "JOGO_REDUZIDO" },
      { id: "r1", parteTreino: "RETORNO_CALMA" },
    ]);
    expect(fasesComExercicios(ordenados)).toEqual([
      { fase: "AQUECIMENTO", indice: 0 },
      { fase: "JOGO_REDUZIDO", indice: 2 },
      { fase: "RETORNO_CALMA", indice: 3 },
    ]);
  });

  it("inclui o bucket 'sem fase' quando há exercícios sem fase", () => {
    const ordenados: Ex[] = ordenarExerciciosPorFase([
      { id: "a1", parteTreino: "AQUECIMENTO" },
      { id: "sem1", parteTreino: null },
    ]);
    expect(fasesComExercicios(ordenados)).toEqual([
      { fase: "AQUECIMENTO", indice: 0 },
      { fase: SEM_FASE, indice: 1 },
    ]);
  });

  it("devolve lista vazia sem exercícios", () => {
    expect(fasesComExercicios([])).toEqual([]);
  });
});
