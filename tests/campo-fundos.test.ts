import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormatoJogo } from "@prisma/client";
import { LinhasCampo, rotuloCampo } from "@/components/campo/desenho";
import { CampoDesenho } from "@/components/campo/CampoDesenho";
import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";
import { CampoFutsal } from "@/components/campo/CampoFutsal";
import { diagramaSchema, type DiagramaCampo } from "@/lib/schemas/exercicio";

const TODOS: FormatoJogo[] = [
  FormatoJogo.FUTSAL_5,
  FormatoJogo.FUTEBOL_3_3,
  FormatoJogo.FUTEBOL_5_5,
  FormatoJogo.FUTEBOL_7,
  FormatoJogo.FUTEBOL_9,
  FormatoJogo.FUTEBOL_11,
];

function contar(markup: string, agulha: string): number {
  return markup.split(agulha).length - 1;
}

const diagramaVazio: DiagramaCampo = { versao: 1, elementos: [] };

describe("LinhasCampo — fundos por formato (§11.5 / Apêndice B)", () => {
  it("cada formato renderiza sem erros e produz marcações", () => {
    for (const formato of TODOS) {
      const markup = renderToStaticMarkup(createElement(LinhasCampo, { formato }));
      expect(markup).toContain("<g");
      // Relvado + contorno (dois rects comuns a todos os fundos).
      expect(contar(markup, "<rect")).toBeGreaterThanOrEqual(2);
      // Relva = cor do clube (--cor-primaria), com fallback laranja da marca.
      expect(markup).toContain("var(--cor-primaria, #F0531E)");
    }
  });

  it("retrocompatível: sem formato === FUTSAL_5", () => {
    const semFormato = renderToStaticMarkup(createElement(LinhasCampo, {}));
    const futsal = renderToStaticMarkup(
      createElement(LinhasCampo, { formato: FormatoJogo.FUTSAL_5 }),
    );
    expect(semFormato).toBe(futsal);
  });

  it("futsal desenha áreas em quarto-de-círculo (paths) e 2.ª penalidade", () => {
    const markup = renderToStaticMarkup(
      createElement(LinhasCampo, { formato: FormatoJogo.FUTSAL_5 }),
    );
    expect(contar(markup, "<path")).toBeGreaterThanOrEqual(4);
    // marca central + círculo central + 4 marcas de penalidade = 6 círculos
    expect(contar(markup, "<circle")).toBe(6);
  });

  it("FUTEBOL_3_3 é minimal: sem grandes áreas, sem círculo central, sem penáltis", () => {
    const markup = renderToStaticMarkup(
      createElement(LinhasCampo, { formato: FormatoJogo.FUTEBOL_3_3 }),
    );
    // Só a marca central (1 círculo); sem círculo central nem marcas de penálti.
    expect(contar(markup, "<circle")).toBe(1);
    // Sem arcos/áreas em path.
    expect(contar(markup, "<path")).toBe(0);
    // Apenas relvado + contorno (não há rectângulos de área).
    expect(contar(markup, "<rect")).toBe(2);
  });

  it("FUTEBOL_5_5 tem círculo central e pequenas áreas, sem penáltis", () => {
    const markup = renderToStaticMarkup(
      createElement(LinhasCampo, { formato: FormatoJogo.FUTEBOL_5_5 }),
    );
    // marca central + círculo central = 2 círculos (sem marcas de penálti)
    expect(contar(markup, "<circle")).toBe(2);
    // relvado + contorno + 2 pequenas áreas
    expect(contar(markup, "<rect")).toBe(4);
  });

  it("FUTEBOL_7 e FUTEBOL_9 têm grande área e marca de penálti", () => {
    for (const formato of [FormatoJogo.FUTEBOL_7, FormatoJogo.FUTEBOL_9]) {
      const markup = renderToStaticMarkup(createElement(LinhasCampo, { formato }));
      // marca central + círculo central + 2 penáltis = 4 círculos
      expect(contar(markup, "<circle")).toBe(4);
      // relvado + contorno + 2 grandes áreas
      expect(contar(markup, "<rect")).toBe(4);
    }
  });

  it("FUTEBOL_11 tem grandes áreas, pequenas áreas, penáltis e arcos", () => {
    const markup = renderToStaticMarkup(
      createElement(LinhasCampo, { formato: FormatoJogo.FUTEBOL_11 }),
    );
    // marca central + círculo central + 2 penáltis = 4 círculos
    expect(contar(markup, "<circle")).toBe(4);
    // relvado + contorno + 2 grandes + 2 pequenas áreas = 6 rects
    expect(contar(markup, "<rect")).toBe(6);
    // 2 arcos de grande área (paths)
    expect(contar(markup, "<path")).toBe(2);
  });
});

describe("rotuloCampo — acessibilidade PT-PT", () => {
  it("devolve o rótulo correto por formato", () => {
    expect(rotuloCampo(FormatoJogo.FUTSAL_5)).toBe("campo de futsal");
    expect(rotuloCampo(FormatoJogo.FUTEBOL_3_3)).toBe("campo de futebol de 3");
    expect(rotuloCampo(FormatoJogo.FUTEBOL_5_5)).toBe("campo de futebol de 5");
    expect(rotuloCampo(FormatoJogo.FUTEBOL_7)).toBe("campo de futebol de 7");
    expect(rotuloCampo(FormatoJogo.FUTEBOL_9)).toBe("campo de futebol de 9");
    expect(rotuloCampo(FormatoJogo.FUTEBOL_11)).toBe("campo de futebol de 11");
  });

  it("sem argumento assume futsal (retrocompatível)", () => {
    expect(rotuloCampo()).toBe("campo de futsal");
  });
});

describe("CampoDesenho — resolução de formato", () => {
  it("diagrama sem `campo` render como futsal", () => {
    const markup = renderToStaticMarkup(
      createElement(CampoDesenho, { diagrama: diagramaVazio }),
    );
    expect(markup).toContain('aria-label="Diagrama de campo de futsal"');
  });

  it("usa `diagrama.campo` quando presente", () => {
    const markup = renderToStaticMarkup(
      createElement(CampoDesenho, {
        diagrama: { ...diagramaVazio, campo: FormatoJogo.FUTEBOL_11 },
      }),
    );
    expect(markup).toContain('aria-label="Diagrama de campo de futebol de 11"');
  });

  it("a prop `formato` tem prioridade sobre `diagrama.campo`", () => {
    const markup = renderToStaticMarkup(
      createElement(CampoDesenho, {
        diagrama: { ...diagramaVazio, campo: FormatoJogo.FUTSAL_5 },
        formato: FormatoJogo.FUTEBOL_7,
      }),
    );
    expect(markup).toContain('aria-label="Diagrama de campo de futebol de 7"');
  });

  it("desenha os elementos do diagrama", () => {
    const diagrama: DiagramaCampo = {
      versao: 2,
      elementos: [{ id: "a", tipo: "jogador", x: 100, y: 100, cor: "azul", numero: 7 }],
      campo: FormatoJogo.FUTEBOL_9,
    };
    const markup = renderToStaticMarkup(createElement(CampoDesenho, { diagrama }));
    expect(markup).toContain(">7<");
  });
});

describe("CampoFutsal / MiniaturaCampo — retrocompat + formato", () => {
  it("CampoFutsal é alias de CampoDesenho (futsal por defeito)", () => {
    const a = renderToStaticMarkup(createElement(CampoFutsal, { diagrama: diagramaVazio }));
    const b = renderToStaticMarkup(createElement(CampoDesenho, { diagrama: diagramaVazio }));
    expect(a).toBe(b);
  });

  it("MiniaturaCampo aceita formato e ajusta o aria-label", () => {
    const markup = renderToStaticMarkup(
      createElement(MiniaturaCampo, {
        diagrama: diagramaVazio,
        formato: FormatoJogo.FUTEBOL_5_5,
      }),
    );
    expect(markup).toContain('aria-label="Miniatura de diagrama de campo de futebol de 5"');
  });

  it("MiniaturaCampo sem formato assume futsal", () => {
    const markup = renderToStaticMarkup(
      createElement(MiniaturaCampo, { diagrama: diagramaVazio }),
    );
    expect(markup).toContain('aria-label="Miniatura de diagrama de campo de futsal"');
  });
});

describe("diagramaSchema — campo `campo` (§11.5)", () => {
  it("aceita diagrama legado sem `campo`", () => {
    const r = diagramaSchema.safeParse({ versao: 1, elementos: [] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.campo).toBeUndefined();
  });

  it("aceita todos os formatos válidos", () => {
    for (const campo of TODOS) {
      const r = diagramaSchema.safeParse({ versao: 2, elementos: [], passos: [], campo });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.campo).toBe(campo);
    }
  });

  it("rejeita um valor de `campo` inválido", () => {
    const r = diagramaSchema.safeParse({ versao: 1, elementos: [], campo: "FUTEBOL_20" });
    expect(r.success).toBe(false);
  });
});
