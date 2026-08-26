import { describe, it, expect } from "vitest";
import { diagramaSchema } from "@/lib/schemas/exercicio";
import { construirKeyframes } from "@/components/campo/animacao";

const diagramaObj = {
  versao: 2 as const,
  elementos: [
    { id: "j1", tipo: "jogador", equipa: "propria", cor: "azul", numero: 7, x: 100, y: 100 },
    { id: "b1", tipo: "bola", x: 120, y: 110 },
  ],
  passos: [
    {
      id: "p1",
      ordem: 0,
      posicoes: [
        { elementoId: "j1", x: 200, y: 120 },
        { elementoId: "b1", x: 220, y: 130 },
      ],
      duracaoMs: 900,
    },
  ],
};

describe("repro autoplay", () => {
  it("parse de objeto preserva passos", () => {
    const r = diagramaSchema.safeParse(diagramaObj);
    console.log("OBJ success:", r.success, r.success ? "passos=" + (r.data.passos?.length ?? 0) : r.error?.issues);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.passos?.length ?? 0).toBe(1);
      const kf = construirKeyframes(r.data);
      console.log("keyframes:", kf.length);
      expect(kf.length).toBe(2);
    }
  });

  it("parse de STRING JSON", () => {
    const r = diagramaSchema.safeParse(JSON.stringify(diagramaObj));
    console.log("STRING success:", r.success);
    // documenta o comportamento
  });
});
