import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SIGLAS_CLUBE,
  abreviarNomeClube,
  descricaoCalendarioPublico,
  linhasImagemCalendario,
  nomesConfrontoPublico,
  tituloCalendarioPublico,
} from "@/lib/calendario-publico-partilha";
import { LinhaJogo } from "@/components/jogos/CalendarioPublicoJogo";
import type { CalendarioPublico, JogoCalendarioPublico } from "@/lib/calendario-publico";

// Nome do clube abreviado só na apresentação do calendário público (§8.11.1, 2026-10-26).

describe("abreviarNomeClube", () => {
  it("caso real: «Juventude Sport Clube» → «Juventude SC»", () => {
    expect(abreviarNomeClube("Juventude Sport Clube")).toBe("Juventude SC");
  });

  it.each([
    ["Sporting Clube de Braga", "SC de Braga"],
    ["Futebol Clube do Porto", "FC do Porto"],
    ["Grupo Desportivo de Chaves", "GD de Chaves"],
    ["Clube Desportivo Nacional", "CD Nacional"],
    ["Associação Desportiva de Fafe", "AD de Fafe"],
    ["Grupo Desportivo e Recreativo da Cruz", "GDR da Cruz"],
    ["Clube de Futebol Os Belenenses", "CF Os Belenenses"],
    ["União Desportiva de Leiria", "UD de Leiria"],
    ["Associação Recreativa e Cultural de Vila", "ARC de Vila"],
    ["Centro Cultural e Desportivo de Évora", "CCD de Évora"],
    ["Atlético Clube de Portugal", "AC de Portugal"],
  ])("%s → %s", (nome, esperado) => {
    expect(abreviarNomeClube(nome)).toBe(esperado);
  });

  it("todas as designações da lista explícita são substituídas pela sigla", () => {
    for (const { designacao, sigla } of SIGLAS_CLUBE) {
      expect(abreviarNomeClube(`Lusitano ${designacao}`)).toBe(`Lusitano ${sigla}`);
    }
  });

  it("sem distinguir maiúsculas nem acentos; resto do nome mantém-se como está", () => {
    expect(abreviarNomeClube("JUVENTUDE SPORT CLUBE")).toBe("JUVENTUDE SC");
    expect(abreviarNomeClube("juventude sport clube")).toBe("juventude SC");
    expect(abreviarNomeClube("Uniao Desportiva de Leiria")).toBe("UD de Leiria");
    expect(abreviarNomeClube("Associacao Desportiva Ágil")).toBe("AD Ágil");
    expect(abreviarNomeClube("  Juventude   Sport  Clube ")).toBe("Juventude SC");
  });

  it("só sequências completas de palavras", () => {
    expect(abreviarNomeClube("Sportinguista Clube")).toBe("Sportinguista Clube");
    expect(abreviarNomeClube("Clube Desportivos Unidos")).toBe("Clube Desportivos Unidos");
    expect(abreviarNomeClube("Sport Lisboa e Évora")).toBe("Sport Lisboa e Évora");
  });

  it("pontuação final da última palavra substituída mantém-se", () => {
    expect(abreviarNomeClube("Juventude Sport Clube, Évora")).toBe("Juventude SC, Évora");
  });

  it("já com sigla ou sem correspondência → igual", () => {
    expect(abreviarNomeClube("Juventude SC")).toBe("Juventude SC");
    expect(abreviarNomeClube("GD Exemplo")).toBe("GD Exemplo");
    expect(abreviarNomeClube("Mister FC")).toBe("Mister FC");
    expect(abreviarNomeClube("Benfica")).toBe("Benfica");
    expect(abreviarNomeClube("")).toBe("");
  });

  it("resultado só com a sigla (ou vazio) → original", () => {
    expect(abreviarNomeClube("Sport Clube")).toBe("Sport Clube");
    expect(abreviarNomeClube("Futebol Clube - ")).toBe("Futebol Clube - ");
  });
});

describe("nomesConfrontoPublico", () => {
  it("abrevia o nosso clube; o adversário só quando começa pelo nome do nosso clube", () => {
    expect(nomesConfrontoPublico("Juventude Sport Clube", "Benfica Futebol Clube")).toEqual({
      clube: "Juventude SC",
      adversario: "Benfica Futebol Clube",
    });
    expect(nomesConfrontoPublico("Juventude Sport Clube", "juventude sport clube - Azuis")).toEqual({
      clube: "Juventude SC",
      adversario: "Juventude SC - Azuis",
    });
    expect(nomesConfrontoPublico("Juventude Sport Clube", "Juventude Sport Clubense")).toEqual({
      clube: "Juventude SC",
      adversario: "Juventude Sport Clubense",
    });
  });
});

function jogo(extra: Partial<JogoCalendarioPublico> = {}): JogoCalendarioPublico {
  return {
    data: "2026-11-07T15:30:00.000Z",
    adversario: "Benfica",
    casaFora: "CASA",
    local: "Pavilhão",
    competicao: null,
    equipa: null,
    resultado: null,
    concentracao: null,
    convocados: null,
    marcadores: null,
    ...extra,
  };
}

const CAL: CalendarioPublico = {
  clube: { nome: "Juventude Sport Clube", corPrimaria: "#0A7F3F", logoUrl: null },
  escalao: { nome: "Benjamins" },
  epoca: { nome: "2026/27" },
  proximos: [jogo()],
  realizados: [],
  equipas: [],
};

describe("aplicação no calendário público", () => {
  it("metadata (título e descrição) e linhas da imagem OG usam o nome abreviado", () => {
    expect(tituloCalendarioPublico(CAL)).toBe("Calendário de jogos — Juventude SC · Benjamins");
    expect(descricaoCalendarioPublico(CAL)).toContain("Próximo jogo: Juventude SC vs Benfica");
    expect(descricaoCalendarioPublico(CAL)).not.toContain("Sport Clube");
    expect(linhasImagemCalendario(CAL)[0].confronto).toBe("Juventude SC vs Benfica");
  });

  it("título do jogo (TituloConfronto via LinhaJogo) mostra «Juventude SC»", () => {
    const html = renderToStaticMarkup(
      createElement(LinhaJogo, { jogo: jogo({ casaFora: "FORA" }), clubeNome: "Juventude Sport Clube" }),
    );
    expect(html).toContain(">Juventude SC</span>");
    expect(html).not.toContain("Sport Clube");
  });
});
