import { describe, it, expect } from "vitest";
import { construirUrlPdfAnaliticos } from "@/lib/pdf-analiticos-url";

describe("construirUrlPdfAnaliticos (§23.11.3 regra 10)", () => {
  it("sem filtros: URL igual ao anterior", () => {
    expect(construirUrlPdfAnaliticos({ tipo: "escalao", escalaoId: "e1" })).toBe(
      "/api/pdf?tipo=escalao&escalaoId=e1",
    );
    expect(construirUrlPdfAnaliticos({ tipo: "clube" })).toBe("/api/pdf?tipo=clube");
  });

  it("só competição: sem `equipa`", () => {
    expect(
      construirUrlPdfAnaliticos({ tipo: "escalao", escalaoId: "e1", competicaoId: "c1" }),
    ).toBe("/api/pdf?tipo=escalao&escalaoId=e1&competicao=c1");
  });

  it("com filtro «Equipa» ativo: envia `equipa`", () => {
    expect(
      construirUrlPdfAnaliticos({
        tipo: "escalao",
        escalaoId: "e1",
        competicaoId: "c1",
        equipaCompeticaoId: "q1",
      }),
    ).toBe("/api/pdf?tipo=escalao&escalaoId=e1&competicao=c1&equipa=q1");
  });
});
