import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LinhaJogo, LocalComMapa } from "@/components/jogos/CalendarioPublicoJogo";
import { TituloConfronto } from "@/components/jogos/TituloConfronto";
import {
  CORES_BADGE_CONVOCATORIA,
  CORES_SUBEQUIPA_NEUTRO,
  PALETA_SUBEQUIPA,
  coresSubequipa,
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
    marcadores: null,
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

  it("jogo com convocados: badge verde «Convocatória disponível» + «Ver detalhes» + chevron que roda", () => {
    const html = render(jogo({ convocados: CONVOCADOS }));
    expect(html).toContain("<details");
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain("Convocatória disponível");
    expect(summary).toContain("background-color:#E8F5EE;color:#166534;border-color:#1E9E5A");
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

describe("TituloConfronto — cor do nome do clube", () => {
  it("no calendário público usa o acento AA (--cal-acento-texto)", () => {
    const html = render(jogo());
    expect(html).toContain("color:var(--cal-acento-texto, #C7430F)");
    expect(html).not.toContain('style="color:var(--cor-primaria');
  });
  it("por defeito (restantes ecrãs) mantém --cor-primaria", () => {
    const html = renderToStaticMarkup(
      createElement(TituloConfronto, { clubeNome: "Mister FC", adversario: "Benfica", casaFora: "CASA" }),
    );
    expect(html).toContain("color:var(--cor-primaria, #F0531E)");
  });
});

describe("badge «Convocatória disponível» — verde de estado AA", () => {
  it("texto ≥4.5:1 sobre o fundo; contorno é o verde-600 do sistema de design", () => {
    const c = CORES_BADGE_CONVOCATORIA;
    expect(contrastePdf(c.texto, c.fundo)).toBeGreaterThanOrEqual(4.5);
    expect(c.contorno).toBe("#1E9E5A");
  });
});

describe("coresSubequipa — cor derivada do nome", () => {
  it.each([
    ["Azuis", "#1D4ED8"],
    ["Brancos", "#FFFFFF"],
    ["Equipa Branca", "#FFFFFF"],
    ["Vermelhos", "#B91C1C"],
    ["Encarnados", "#B91C1C"],
    ["Verdes", "#15803D"],
    ["Pretos", "#141210"],
    ["Amarelos", "#FACC15"],
    ["Laranjas", "#C2410C"],
    ["Roxos", "#7E22CE"],
    ["Lilases", "#7E22CE"],
    ["Rosas", "#BE185D"],
    ["Cinzentos", "#4B5563"],
    ["AZUL", "#1D4ED8"],
  ])("%s → %s", (nome, fundo) => {
    expect(coresSubequipa(nome).fundo).toBe(fundo);
  });

  it("sem cor reconhecida (ou palavras que só contêm a cor) → neutro", () => {
    for (const nome of ["Benjamins B", "Sub-11 A", "Verdelhos", "Rosário", "", null]) {
      expect(coresSubequipa(nome)).toBe(CORES_SUBEQUIPA_NEUTRO);
    }
  });

  it("brancos têm contorno visível (≥3:1 sobre o cartão branco)", () => {
    const b = coresSubequipa("Brancos");
    expect(contrastePdf(b.contorno, "#FFFFFF")).toBeGreaterThanOrEqual(3);
  });

  it("AA em toda a paleta (texto ≥4.5:1 sobre o fundo)", () => {
    for (const c of [...PALETA_SUBEQUIPA.map((p) => p.cores), CORES_SUBEQUIPA_NEUTRO]) {
      expect(contrastePdf(c.texto, c.fundo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("o cartão aplica a cor ao badge da subequipa", () => {
    const html = render(jogo({ equipa: "Azuis" }));
    expect(html).toContain("background-color:#1D4ED8;color:#FFFFFF;border-color:#1D4ED8");
    expect(html).toContain(">Azuis</span>");
  });
});

describe("Marcadores no cartão (jogos realizados)", () => {
  it("lista compacta «Nome ×N · Nome»; sem marcadores → nada", () => {
    const html = render(
      jogo({
        resultado: { marcados: 3, sofridos: 1 },
        marcadores: [
          { nome: "Tomás Rodrigues", golos: 2 },
          { nome: "Ana Silva", golos: 1 },
        ],
      }),
    );
    expect(html).toContain("Marcadores:");
    expect(html).toContain("Tomás Rodrigues");
    expect(html).toContain(" ×2");
    expect(html).toContain("(2 golos)");
    expect(html).toContain("Ana Silva");
    expect(html).not.toContain("×1");
    expect(render(jogo({ resultado: { marcados: 0, sofridos: 1 } }))).not.toContain("Marcadores");
  });
});
