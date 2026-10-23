import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LinhaJogo, LocalComMapa } from "@/components/jogos/CalendarioPublicoJogo";
import {
  detalheJogoPublico,
  variaveisCorCalendarioPublico,
} from "@/lib/calendario-publico-partilha";
import { contrastePdf } from "@/lib/pdf/tema";
import type { JogoCalendarioPublico } from "@/lib/calendario-publico";

// Dados de teste em memória (sem BD) — apresentação do calendário público (§8.11.1).
function jogo(extra: Partial<JogoCalendarioPublico> = {}): JogoCalendarioPublico {
  return {
    data: "2026-11-07T15:30:00.000Z",
    adversario: "Benfica",
    casaFora: "CASA",
    local: null,
    competicao: null,
    equipa: null,
    resultado: null,
    concentracao: null,
    convocados: null,
    ...extra,
  };
}

const render = (j: JogoCalendarioPublico) =>
  renderToStaticMarkup(createElement(LinhaJogo, { jogo: j, clubeNome: "Mister FC" }));

const CONVOCADOS = [
  { nome: "Ana Silva", numero: 7 },
  { nome: "Rui Costa", numero: null },
];

describe("detalheJogoPublico", () => {
  it("sem concentração nem convocados → não expansível", () => {
    expect(detalheJogoPublico(jogo())).toEqual({
      expansivel: false,
      temConvocados: false,
      temConcentracao: false,
      rotulo: "",
    });
  });
  it("só concentração → expansível sem convocados", () => {
    const d = detalheJogoPublico(jogo({ concentracao: { hora: null, local: "Sede" } }));
    expect(d).toMatchObject({ expansivel: true, temConvocados: false, rotulo: "Concentração" });
  });
  it("convocados (com ou sem concentração)", () => {
    expect(detalheJogoPublico(jogo({ convocados: CONVOCADOS }))).toMatchObject({
      expansivel: true,
      temConvocados: true,
      rotulo: "Convocados",
    });
    expect(
      detalheJogoPublico(
        jogo({ convocados: CONVOCADOS, concentracao: { hora: null, local: "Sede" } }),
      ).rotulo,
    ).toBe("Concentração e Convocados");
  });
  it("lista vazia de convocados conta como sem convocados", () => {
    expect(detalheJogoPublico(jogo({ convocados: [] }))).toMatchObject({
      expansivel: false,
      temConvocados: false,
    });
  });
});

describe("variaveisCorCalendarioPublico — AA para qualquer cor do clube", () => {
  it.each(["#F0531E", "#FFD400", "#0A7F3F", "#7FB3FF", "#000000", "#FFFFFF", "inválida"])(
    "%s",
    (cor) => {
      const v = variaveisCorCalendarioPublico(cor);
      expect(contrastePdf(v["--cal-solido"], v["--cal-solido-texto"])).toBeGreaterThanOrEqual(4.5);
      expect(contrastePdf(v["--cal-acento-texto"], "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("LinhaJogo — badge e indicador de expansão", () => {
  it("jogo sem detalhe: sem <details>, sem badge, sem chevron", () => {
    const html = render(jogo());
    expect(html).not.toContain("<details");
    expect(html).not.toContain("Convocatória");
    expect(html).not.toContain("Ver detalhes");
  });

  it("jogo com convocados: badge «Convocatória» na cor do clube + «Ver detalhes» + chevron que roda", () => {
    const html = render(jogo({ convocados: CONVOCADOS }));
    expect(html).toContain("<details");
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain("Convocatória");
    expect(summary).toContain("bg-[color:var(--cal-solido,#C7430F)]");
    expect(summary).toContain("Ver detalhes");
    expect(summary).toContain("Ocultar detalhes");
    expect(summary).toContain("group-open:rotate-180");
    expect(summary).toContain("min-h-11");
    expect(summary).toContain("focus-visible:ring-2");
    expect(summary).not.toContain("<a "); // sem interativos aninhados
    expect(html).toContain("Ana Silva · 7");
  });

  it("jogo só com concentração: indicador de expansão sem badge", () => {
    const html = render(jogo({ concentracao: { hora: "2026-11-07T14:45:00.000Z", local: "Sede" } }));
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain("Ver detalhes");
    expect(summary).toContain("group-open:rotate-180");
    expect(summary).not.toContain("Convocatória");
    expect(summary).toContain("Concentração");
  });
});

describe("LocalComMapa — botão «Ver no mapa»", () => {
  const renderLocal = (valor: string | null) =>
    renderToStaticMarkup(createElement(LocalComMapa, { valor }));

  it("URL → botão sólido na cor do clube, ≥44px, foco visível, nova aba segura", () => {
    const html = renderLocal("Pavilhão Municipal https://maps.app.goo.gl/abc");
    expect(html).toContain('href="https://maps.app.goo.gl/abc"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain("bg-[color:var(--cal-solido,#C7430F)]");
    expect(html).toContain("text-[color:var(--cal-solido-texto,#FFFFFF)]");
    expect(html).toContain("min-h-11");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("lucide-map-pin");
    expect(html).toContain('aria-label="Ver no mapa: Pavilhão Municipal"');
    expect(html).toContain("Ver no mapa");
  });

  it("sem URL → só texto, sem botão", () => {
    const html = renderLocal("Pavilhão Municipal");
    expect(html).not.toContain("<a");
    expect(html).toContain("Pavilhão Municipal");
  });

  it("concentração com URL também tem o botão", () => {
    const html = render(
      jogo({ concentracao: { hora: null, local: "https://maps.google.com/?q=sede" } }),
    );
    const painel = html.slice(html.indexOf("</summary>"));
    expect(painel).toContain('href="https://maps.google.com/?q=sede"');
    expect(painel).toContain("bg-[color:var(--cal-solido,#C7430F)]");
  });

  it("esquema não-http fica texto", () => {
    expect(renderLocal("javascript:alert(1)")).not.toContain("<a");
  });
});
