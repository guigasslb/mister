import { describe, it, expect } from "vitest";
import {
  construirDiagramaFormacao,
  formacaoPadrao,
  sobreporNomesTitulares,
  type TitularFormacao,
} from "@/lib/formacao";
import type { DiagramaCampo } from "@/lib/schemas/exercicio";

function tit(
  id: string,
  posicao: TitularFormacao["posicao"],
  numero: number | null = null,
): TitularFormacao {
  return { id, numero, posicao };
}

/** Elementos-jogador do diagrama indexados por id (narrow do union para Jogador). */
function porId(d: ReturnType<typeof construirDiagramaFormacao>) {
  const jogadores = d.elementos.filter((e) => e.tipo === "jogador");
  return new Map(jogadores.map((e) => [e.id, e]));
}

/** Conjunto das coordenadas x dos tokens de jogador. */
function xsJogadores(d: ReturnType<typeof construirDiagramaFormacao>): Set<number> {
  return new Set(
    d.elementos.filter((e) => e.tipo === "jogador").map((e) => e.x),
  );
}

describe("construirDiagramaFormacao — todos os titulares no campo (§11.5)", () => {
  it("coloca no campo TODOS os 5 titulares mesmo sem posição (bug 'Sem posição')", () => {
    // Cenário do screenshot: 3 posicionados + 2 sem posição.
    const titulares = [
      tit("gr", "GUARDA_REDES"),
      tit("fixo", "FIXO"),
      tit("pivo", "PIVO"),
      tit("gabriel", null),
      tit("joao", null),
    ];
    const d = construirDiagramaFormacao(titulares, "FUTSAL", "FUTSAL_5");

    // Nenhum titular fica de fora — 5 tokens no campo.
    expect(d.elementos).toHaveLength(5);
    const ids = new Set(d.elementos.map((e) => e.id));
    for (const t of titulares) expect(ids.has(t.id)).toBe(true);

    // Os dois sem posição preenchem os lugares livres da formação (2 alas, x=225).
    const m = porId(d);
    expect(m.get("gabriel")!.x).toBe(225);
    expect(m.get("joao")!.x).toBe(225);
    // E ficam distribuídos verticalmente (y distinto), não sobrepostos.
    expect(m.get("gabriel")!.y).not.toBe(m.get("joao")!.y);
  });

  it("titulares posicionados mantêm a sua linha (GR/Fixo/Pivô)", () => {
    const d = construirDiagramaFormacao(
      [tit("gr", "GUARDA_REDES"), tit("fixo", "FIXO"), tit("pivo", "PIVO")],
      "FUTSAL",
      "FUTSAL_5",
    );
    const m = porId(d);
    expect(m.get("gr")!.x).toBe(35); // linha guarda-redes
    expect(m.get("fixo")!.x).toBe(130); // linha defesa
    expect(m.get("pivo")!.x).toBe(320); // linha avançado
  });

  it("5 titulares TODOS sem posição → formação padrão completa no campo", () => {
    const titulares = [
      tit("a", null),
      tit("b", null),
      tit("c", null),
      tit("d", null),
      tit("e", null),
    ];
    const d = construirDiagramaFormacao(titulares, "FUTSAL", "FUTSAL_5");
    expect(d.elementos).toHaveLength(5);
    // Formação padrão GR-FIXO-ALA-ALA-PIVO → cobre as 4 linhas do campo.
    expect(xsJogadores(d)).toEqual(new Set([35, 130, 225, 320]));
  });

  it("mais titulares que lugares → nenhum fica de fora (posição de recurso)", () => {
    const titulares = Array.from({ length: 7 }, (_, i) => tit(`p${i}`, null));
    const d = construirDiagramaFormacao(titulares, "FUTSAL", "FUTSAL_5");
    expect(d.elementos).toHaveLength(7);
    expect(new Set(d.elementos.map((e) => e.id)).size).toBe(7);
  });

  it("preserva o número da camisola quando existe", () => {
    const d = construirDiagramaFormacao(
      [tit("gr", "GUARDA_REDES", 1), tit("x", null, 7)],
      "FUTSAL",
      "FUTSAL_5",
    );
    const m = porId(d);
    expect(m.get("gr")!.numero).toBe(1);
    expect(m.get("x")!.numero).toBe(7);
  });

  it("futebol 11 sem posições → 11 titulares distribuídos, campo definido", () => {
    const titulares = Array.from({ length: 11 }, (_, i) => tit(`f${i}`, null));
    const d = construirDiagramaFormacao(titulares, "FUTEBOL", "FUTEBOL_11");
    expect(d.elementos).toHaveLength(11);
    expect(d.campo).toBe("FUTEBOL_11");
    // Distribui pelas 4 linhas de futebol (GR, defesa, meio, ataque).
    expect(xsJogadores(d)).toEqual(new Set([35, 115, 205, 315]));
  });
});

describe("sobreporNomesTitulares — nome aparece mesmo em quadro gravado (§11.5)", () => {
  // Formação viva derivada dos titulares atuais (traz os nomes).
  const fonte = construirDiagramaFormacao(
    [
      { id: "gr", numero: 1, posicao: "GUARDA_REDES", nome: "Gabriel Silva" },
      { id: "fx", numero: 4, posicao: "FIXO", nome: "Joao Costa" },
    ],
    "FUTSAL",
    "FUTSAL_5",
  );

  it("injeta os nomes nos tokens de um quadro GRAVADO sem nomes (bug do runtime)", () => {
    // Quadro gravado antes da feature: mesmos ids, mas sem `nomeAtleta`.
    const gravado: DiagramaCampo = {
      versao: 2,
      campo: "FUTSAL_5",
      elementos: [
        { id: "gr", tipo: "jogador", x: 40, y: 100, cor: "azul", numero: 1 },
        { id: "fx", tipo: "jogador", x: 130, y: 90, cor: "azul", numero: 4 },
      ],
    };
    const out = sobreporNomesTitulares(gravado, fonte);
    const m = new Map(
      out.elementos
        .filter((e) => e.tipo === "jogador")
        .map((e) => [e.id, e.nomeAtleta]),
    );
    expect(m.get("gr")).toBe("Gabriel");
    expect(m.get("fx")).toBe("Joao");
    // Não altera as posições gravadas (só sobrepõe a identidade/nome).
    const gr = out.elementos.find((e) => e.id === "gr")!;
    expect(gr.tipo === "jogador" && gr.x).toBe(40);
  });

  it("não toca em tokens sem correspondência (adversário/jogador extra)", () => {
    const gravado: DiagramaCampo = {
      versao: 2,
      elementos: [
        { id: "gr", tipo: "jogador", x: 40, y: 100, cor: "azul", numero: 1 },
        {
          id: "adv1",
          tipo: "jogador",
          x: 300,
          y: 100,
          cor: "vermelho",
          equipa: "adversario",
        },
      ],
    };
    const out = sobreporNomesTitulares(gravado, fonte);
    const adv = out.elementos.find((e) => e.id === "adv1")!;
    expect("nomeAtleta" in adv && adv.nomeAtleta).toBeFalsy();
  });

  it("sem titulares com nome → devolve o diagrama tal como está (no-op)", () => {
    const semNomes = construirDiagramaFormacao(
      [{ id: "gr", numero: 1, posicao: "GUARDA_REDES" }],
      "FUTSAL",
      "FUTSAL_5",
    );
    const alvo: DiagramaCampo = {
      versao: 2,
      elementos: [{ id: "gr", tipo: "jogador", x: 40, y: 100, cor: "azul" }],
    };
    expect(sobreporNomesTitulares(alvo, semNomes)).toBe(alvo);
  });
});

describe("construirDiagramaFormacao — braçadeira de capitão (§11.5)", () => {
  it("marca capitao:true só no titular capitão (os outros ficam sem a flag)", () => {
    const d = construirDiagramaFormacao(
      [
        { id: "gr", numero: 1, posicao: "GUARDA_REDES", capitao: true },
        { id: "fx", numero: 4, posicao: "FIXO" },
      ],
      "FUTSAL",
      "FUTSAL_5",
    );
    const m = porId(d);
    expect(m.get("gr")!.capitao).toBe(true);
    // Não-capitão: sem a flag (diagrama enxuto), nunca capitao:true.
    expect(m.get("fx")!.capitao).toBeUndefined();
  });

  it("sem capitão nenhum token traz a flag", () => {
    const d = construirDiagramaFormacao(
      [{ id: "gr", numero: 1, posicao: "GUARDA_REDES" }],
      "FUTSAL",
      "FUTSAL_5",
    );
    expect(porId(d).get("gr")!.capitao).toBeUndefined();
  });
});

describe("sobreporNomesTitulares — capitão vivo prevalece em quadro gravado (§11.5)", () => {
  it("injeta capitao:true no token gravado que passou a capitão", () => {
    const fonte = construirDiagramaFormacao(
      [
        { id: "gr", numero: 1, posicao: "GUARDA_REDES", capitao: true },
        { id: "fx", numero: 4, posicao: "FIXO" },
      ],
      "FUTSAL",
      "FUTSAL_5",
    );
    const gravado: DiagramaCampo = {
      versao: 2,
      campo: "FUTSAL_5",
      elementos: [
        { id: "gr", tipo: "jogador", x: 40, y: 100, cor: "azul", numero: 1 },
        { id: "fx", tipo: "jogador", x: 130, y: 90, cor: "azul", numero: 4 },
      ],
    };
    const out = sobreporNomesTitulares(gravado, fonte);
    const m = new Map(
      out.elementos
        .filter((e) => e.tipo === "jogador")
        .map((e) => [e.id, e.capitao]),
    );
    expect(m.get("gr")).toBe(true);
    expect(m.get("fx")).toBeUndefined();
  });

  it("limpa um 'C' gravado que já não corresponde ao capitão atual", () => {
    const fonte = construirDiagramaFormacao(
      [{ id: "gr", numero: 1, posicao: "GUARDA_REDES" }], // já não é capitão
      "FUTSAL",
      "FUTSAL_5",
    );
    const gravado: DiagramaCampo = {
      versao: 2,
      elementos: [
        { id: "gr", tipo: "jogador", x: 40, y: 100, cor: "azul", numero: 1, capitao: true },
      ],
    };
    const out = sobreporNomesTitulares(gravado, fonte);
    const gr = out.elementos.find((e) => e.id === "gr")!;
    expect(gr.tipo === "jogador" && gr.capitao).toBeFalsy();
  });
});

describe("formacaoPadrao — dimensão = jogadores em campo", () => {
  it("futsal → 5 posições", () => {
    expect(formacaoPadrao("FUTSAL", "FUTSAL_5")).toHaveLength(5);
  });
  it("sem formato cai no canónico da modalidade (futebol → 11)", () => {
    expect(formacaoPadrao("FUTEBOL", null)).toHaveLength(11);
    expect(formacaoPadrao("FUTSAL", null)).toHaveLength(5);
  });
});
