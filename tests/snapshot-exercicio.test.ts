import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  construirSnapshotExercicio,
  resolverExercicioSessao,
  type ExercicioParaSnapshot,
} from "@/lib/snapshot-exercicio";

// Mecanismo de snapshot §4.2.1 — testes das funções puras.

const diagramaExemplo: Prisma.JsonValue = { jogadores: [{ id: "a", x: 10, y: 20 }] };

describe("construirSnapshotExercicio (§4.2.1)", () => {
  const base: ExercicioParaSnapshot = {
    proprietario: "TREINADOR",
    nome: "Rondo 4x2",
    descricao: "Posse em espaço reduzido",
    objetivo: "Circulação de bola sob pressão",
    diagrama: diagramaExemplo,
  };

  it("cria snapshot para exercício do TREINADOR (portátil)", () => {
    const agora = new Date("2026-08-16T10:00:00.000Z");
    const snap = construirSnapshotExercicio(base, agora);
    expect(snap).not.toBeNull();
    expect(snap).toEqual({
      snapNome: "Rondo 4x2",
      snapDescricao: "Posse em espaço reduzido",
      snapObjetivo: "Circulação de bola sob pressão",
      snapDiagrama: diagramaExemplo,
      snapNumeroJogadores: null,
      snapEspaco: null,
      snapCriadoEm: agora,
    });
  });

  it("NÃO cria snapshot para exercício do CLUBE (já é do clube)", () => {
    const snap = construirSnapshotExercicio({ ...base, proprietario: "CLUBE" });
    expect(snap).toBeNull();
  });

  it("usa Prisma.DbNull quando o diagrama é null", () => {
    const snap = construirSnapshotExercicio({ ...base, diagrama: null });
    expect(snap?.snapDiagrama).toBe(Prisma.DbNull);
  });

  it("preserva descrição/objetivo nulos como null (não placeholder)", () => {
    const snap = construirSnapshotExercicio({ ...base, descricao: null, objetivo: null });
    expect(snap?.snapDescricao).toBeNull();
    expect(snap?.snapObjetivo).toBeNull();
  });
});

describe("resolverExercicioSessao (§4.2.1)", () => {
  const snap = {
    snapNome: "Rondo 4x2",
    snapDescricao: "Posse em espaço reduzido",
    snapObjetivo: "Circulação de bola sob pressão",
    snapDiagrama: diagramaExemplo as unknown as Prisma.JsonValue,
  };

  it("prefere o exercício original quando visível", () => {
    const r = resolverExercicioSessao({
      exercicio: {
        id: "ex1",
        nome: "Rondo 4x2 (atualizado)",
        categoriaPrincipal: "ATAQUE",
        descricao: "Nova descrição",
        objetivo: "Novo objetivo",
        diagrama: null,
      },
      ...snap,
    });
    expect(r.id).toBe("ex1");
    expect(r.nome).toBe("Rondo 4x2 (atualizado)");
    expect(r.descricao).toBe("Nova descrição");
    expect(r.origemSnapshot).toBe(false);
  });

  it("usa o snapshot quando o exercício já não é visível (treinador saiu)", () => {
    const r = resolverExercicioSessao({ exercicio: null, ...snap });
    expect(r.id).toBeNull();
    expect(r.nome).toBe("Rondo 4x2");
    expect(r.descricao).toBe("Posse em espaço reduzido");
    expect(r.objetivo).toBe("Circulação de bola sob pressão");
    expect(r.diagrama).toEqual(diagramaExemplo);
    expect(r.origemSnapshot).toBe(true);
  });

  it("cai no placeholder quando não há exercício nem snapshot", () => {
    const r = resolverExercicioSessao({
      exercicio: null,
      snapNome: null,
      snapDescricao: null,
      snapObjetivo: null,
      snapDiagrama: null,
    });
    expect(r.nome).toBe("(exercício removido)");
    expect(r.origemSnapshot).toBe(false);
  });
});
