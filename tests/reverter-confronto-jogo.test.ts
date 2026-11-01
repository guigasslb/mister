import { describe, it, expect, vi } from "vitest";
import { reverterConfrontoDoJogo } from "@/lib/sincronizacao-jogo-confronto";

// §8.25.9 — reinício do jogo: desfazer no confronto ligado o que /jogos → competição
// derivou do jogo (REALIZADO → AGENDADO, golos null), com as guardas de §23.6.

const DATA = new Date("2026-10-18T10:30:00Z");
const PROPRIA = { id: "eq-proprio", nome: "Sub-13 A" };

const jogo = (over: Record<string, unknown> = {}, confronto: Record<string, unknown> = {}) => ({
  data: DATA,
  golosMarcados: null,
  golosSofridos: null,
  competicaoId: "comp1",
  escalaoId: "esc1",
  epocaId: "ep1",
  equipaCompeticaoId: null,
  resultadoCompeticao: {
    id: "res1",
    competicaoId: "comp1",
    equipaCasa: "Sub-13 A",
    equipaFora: "Benfica",
    equipaCasaId: "eq-proprio",
    equipaForaId: "eq-benfica",
    estado: "REALIZADO",
    competicao: { escalaoId: "esc1", epocaId: "ep1", escalao: { nome: "Sub-13 A" } },
    ...confronto,
  },
  ...over,
});

function dbFake(j: unknown, outrosComResultado = 0, proprias: unknown[] = [PROPRIA]) {
  return {
    jogo: {
      findUnique: vi.fn().mockResolvedValue(j),
      count: vi.fn().mockResolvedValue(outrosComResultado),
    },
    equipaCompeticao: { findMany: vi.fn().mockResolvedValue(proprias) },
    resultadoCompeticao: { update: vi.fn().mockResolvedValue({}) },
  };
}

describe("reverterConfrontoDoJogo", () => {
  it("confronto REALIZADO volta a AGENDADO com resultado null (data mantém-se)", async () => {
    const db = dbFake(jogo());
    expect(await reverterConfrontoDoJogo(db as never, "j1")).toBe("comp1");
    expect(db.resultadoCompeticao.update).toHaveBeenCalledWith({
      where: { id: "res1" },
      data: { estado: "AGENDADO", golosCasa: null, golosFora: null, walkoverVencedor: null },
    });
    expect(db.jogo.count).toHaveBeenCalledWith({
      where: {
        resultadoCompeticaoId: "res1",
        id: { not: "j1" },
        golosMarcados: { not: null },
        golosSofridos: { not: null },
      },
    });
  });

  it.each(["AGENDADO", "CANCELADO", "WALKOVER"])(
    "confronto %s não é tocado (não derivado do jogo)",
    async (estado) => {
      const db = dbFake(jogo({}, { estado }));
      expect(await reverterConfrontoDoJogo(db as never, "j1")).toBeNull();
      expect(db.resultadoCompeticao.update).not.toHaveBeenCalled();
    },
  );

  it("jogo sem confronto ligado não toca em nada", async () => {
    const db = dbFake(jogo({ resultadoCompeticao: null }));
    expect(await reverterConfrontoDoJogo(db as never, "j1")).toBeNull();
    expect(db.resultadoCompeticao.update).not.toHaveBeenCalled();
  });

  it("mesmas guardas da sincronização: jogo movido de competição/escalão/época não reverte", async () => {
    for (const over of [{ competicaoId: "outra" }, { escalaoId: "outro" }, { epocaId: "outra" }]) {
      const db = dbFake(jogo(over));
      expect(await reverterConfrontoDoJogo(db as never, "j1")).toBeNull();
      expect(db.resultadoCompeticao.update).not.toHaveBeenCalled();
    }
  });

  it("confronto sem lado próprio identificável não reverte", async () => {
    const db = dbFake(
      jogo({}, { equipaCasa: "Porto", equipaCasaId: "eq-porto" }),
    );
    expect(await reverterConfrontoDoJogo(db as never, "j1")).toBeNull();
    expect(db.resultadoCompeticao.update).not.toHaveBeenCalled();
  });

  it("confronto interno A vs B com o outro jogo com resultado não reverte", async () => {
    const A = { id: "eq-a", nome: "Benjamins A" };
    const B = { id: "eq-b", nome: "Benjamins B" };
    const db = dbFake(
      jogo(
        { equipaCompeticaoId: "eq-a" },
        {
          equipaCasa: "Benjamins A",
          equipaFora: "Benjamins B",
          equipaCasaId: "eq-a",
          equipaForaId: "eq-b",
          competicao: { escalaoId: "esc1", epocaId: "ep1", escalao: { nome: "Benjamins" } },
        },
      ),
      1,
      [A, B],
    );
    expect(await reverterConfrontoDoJogo(db as never, "jogo-a")).toBeNull();
    expect(db.resultadoCompeticao.update).not.toHaveBeenCalled();
  });
});
