import { describe, it, expect } from "vitest";
import {
  ERRO_IMPACTO_COMPETICAO,
  ERRO_IMPACTO_CONFRONTO,
  eErroImpactoDesatualizado,
} from "@/lib/erros-impacto-confronto";

describe("eErroImpactoDesatualizado", () => {
  it("reconhece as duas mensagens de corrida (igualdade exata)", () => {
    expect(eErroImpactoDesatualizado(ERRO_IMPACTO_CONFRONTO)).toBe(true);
    expect(eErroImpactoDesatualizado(ERRO_IMPACTO_COMPETICAO)).toBe(true);
  });

  it("não aceita prefixos, variações nem outros erros", () => {
    expect(eErroImpactoDesatualizado("Entretanto mudou algo nos jogos")).toBe(false);
    expect(eErroImpactoDesatualizado(`${ERRO_IMPACTO_CONFRONTO} `)).toBe(false);
    expect(eErroImpactoDesatualizado("Confronto não encontrado")).toBe(false);
  });

  it("mensagens inalteradas", () => {
    expect(ERRO_IMPACTO_CONFRONTO).toBe(
      "Entretanto mudou algo nos jogos deste confronto. Revê o impacto e confirma de novo.",
    );
    expect(ERRO_IMPACTO_COMPETICAO).toBe(
      "Entretanto mudou algo nos jogos desta competição. Revê o impacto e confirma de novo.",
    );
  });
});
