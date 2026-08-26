import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ElementoSVG } from "@/components/campo/desenho";
import type { ElementoCampo } from "@/lib/schemas/exercicio";

// Regressão da orientação da ponta das setas no editor de campo (secção 13).
//
// A ponta é desenhada por um <marker markerEnd orient="auto">, que orienta a
// cabeça pela direção do ÚLTIMO segmento do trajecto. Para setas retas isto é
// sempre correto (esquerda/direita/cima/baixo/diagonal). Para setas de
// "condução" (trajecto ondulado) o último segmento tem de assentar na linha
// central, senão a cabeça fica torta/apontada ao lado.

type Estilo = "movimento" | "passe" | "conducao";

/** Extrai o `d` do trajecto da seta (o último `d=` — o primeiro é o do marker). */
function trajectoDaSeta(el: ElementoCampo): string {
  const html = renderToStaticMarkup(createElement(ElementoSVG, { elemento: el }));
  const paths = [...html.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  return paths[paths.length - 1];
}

/** Ângulo (graus) do último segmento do trajecto — direção da ponta. */
function anguloDaPonta(d: string): number {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
}

function desvio(estilo: Estilo, de: [number, number], para: [number, number]): number {
  const el: ElementoCampo = {
    id: "s",
    tipo: "seta",
    estilo,
    cor: "#000",
    pontos: [
      { x: de[0], y: de[1] },
      { x: para[0], y: para[1] },
    ],
  };
  const travel = (Math.atan2(para[1] - de[1], para[0] - de[0]) * 180) / Math.PI;
  const ponta = anguloDaPonta(trajectoDaSeta(el));
  // Diferença angular mínima (0..180).
  return Math.abs(((ponta - travel + 540) % 360) - 180);
}

const DIRECOES: Array<[string, [number, number], [number, number]]> = [
  ["direita", [100, 100], [300, 100]],
  ["esquerda", [300, 100], [100, 100]],
  ["cima", [100, 180], [100, 20]],
  ["baixo", [100, 20], [100, 180]],
  ["diagonal ↘", [80, 60], [280, 160]],
  ["diagonal ↙", [280, 60], [80, 160]],
];

describe("orientação da ponta das setas", () => {
  for (const estilo of ["movimento", "passe", "conducao"] as const) {
    for (const [nome, de, para] of DIRECOES) {
      it(`${estilo} — ${nome}: ponta aponta no sentido do movimento`, () => {
        // Tolerância pequena: a ponta tem de acompanhar a direção real da seta.
        expect(desvio(estilo, de, para)).toBeLessThan(1);
      });
    }
  }
});

// Regressão do marcador SVG (bug das setas para a esquerda): sem `viewBox` a
// auto-orientação era mal renderizada no Chromium/WebKit a ~180°. O marcador tem
// de ter `viewBox` + `orient="auto"` + `refX/refY` (ponta ~coincidente com o fim
// da linha) para ficar correto em TODAS as direções.
describe("marcador da ponta da seta", () => {
  function markerHtml(estilo: Estilo): string {
    const el: ElementoCampo = {
      id: "s",
      tipo: "seta",
      estilo,
      cor: "#000",
      pontos: [
        { x: 300, y: 100 },
        { x: 100, y: 100 },
      ],
    };
    return renderToStaticMarkup(createElement(ElementoSVG, { elemento: el }));
  }

  for (const estilo of ["movimento", "passe", "conducao"] as const) {
    it(`${estilo}: marcador tem viewBox, orient=auto e refX/refY definidos`, () => {
      const html = markerHtml(estilo);
      const marker = html.match(/<marker[^>]*>/)?.[0] ?? "";
      expect(marker).toContain('viewBox="0 0 10 10"');
      expect(marker).toContain('orient="auto"');
      // refX próximo da ponta (tip em x=10 no viewBox) e refY no eixo (y=5).
      expect(marker).toMatch(/refX="9"/);
      expect(marker).toMatch(/refY="5"/);
    });
  }
});
