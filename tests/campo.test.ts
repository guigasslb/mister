import { describe, it, expect } from "vitest";
import {
  construirKeyframes,
  calcularDelta,
  ease,
  ancoraElemento,
  elementoEmPonto,
  posicoesBase,
  raioHitEfetivo,
  rotuloElemento,
  type Pos,
} from "@/components/campo/animacao";
import { diagramaSchema } from "@/lib/schemas/exercicio";
import type { DiagramaCampo, ElementoCampo } from "@/lib/schemas/exercicio";

const jogador = (id: string, x: number, y: number): ElementoCampo => ({
  id,
  tipo: "jogador",
  x,
  y,
  cor: "azul",
});

function mapaPara(entradas: [string, Pos][]): Map<string, Pos> {
  return new Map(entradas);
}

describe("construirKeyframes", () => {
  it("sem passos devolve apenas o keyframe base", () => {
    const d: DiagramaCampo = {
      versao: 2,
      elementos: [jogador("a", 100, 100)],
      passos: [],
    };
    const kfs = construirKeyframes(d);
    expect(kfs).toHaveLength(1);
    expect(kfs[0].get("a")).toEqual({ x: 100, y: 100 });
  });

  it("herda do keyframe anterior (delta parcial acumula)", () => {
    const d: DiagramaCampo = {
      versao: 2,
      elementos: [jogador("a", 0, 0), jogador("b", 10, 10)],
      passos: [
        { id: "p0", ordem: 0, posicoes: [{ elementoId: "a", x: 50, y: 50 }] },
        { id: "p1", ordem: 1, posicoes: [{ elementoId: "b", x: 80, y: 80 }] },
      ],
    };
    const kfs = construirKeyframes(d);
    expect(kfs).toHaveLength(3); // base + 2 passos

    // base
    expect(kfs[0].get("a")).toEqual({ x: 0, y: 0 });
    expect(kfs[0].get("b")).toEqual({ x: 10, y: 10 });

    // após passo 0: a moveu-se; b mantém-se
    expect(kfs[1].get("a")).toEqual({ x: 50, y: 50 });
    expect(kfs[1].get("b")).toEqual({ x: 10, y: 10 });

    // após passo 1: b move-se; a MANTÉM a posição herdada do keyframe anterior
    expect(kfs[2].get("a")).toEqual({ x: 50, y: 50 });
    expect(kfs[2].get("b")).toEqual({ x: 80, y: 80 });
  });

  it("keyframe vazio não altera posições (herda tudo)", () => {
    const d: DiagramaCampo = {
      versao: 2,
      elementos: [jogador("a", 20, 20)],
      passos: [{ id: "p0", ordem: 0, posicoes: [] }],
    };
    const kfs = construirKeyframes(d);
    expect(kfs[1].get("a")).toEqual({ x: 20, y: 20 });
  });

  it("respeita a ordem dos passos mesmo desordenados no array", () => {
    const d: DiagramaCampo = {
      versao: 2,
      elementos: [jogador("a", 0, 0)],
      passos: [
        { id: "p1", ordem: 1, posicoes: [{ elementoId: "a", x: 200, y: 0 }] },
        { id: "p0", ordem: 0, posicoes: [{ elementoId: "a", x: 100, y: 0 }] },
      ],
    };
    const kfs = construirKeyframes(d);
    expect(kfs[1].get("a")).toEqual({ x: 100, y: 0 });
    expect(kfs[2].get("a")).toEqual({ x: 200, y: 0 });
  });
});

describe("calcularDelta", () => {
  it("filtra elementos que não se moveram", () => {
    const anterior = mapaPara([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 1, y: 1 }],
    ]);
    const atual = mapaPara([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 5, y: 5 }],
    ]);
    const delta = calcularDelta(anterior, atual);
    expect(delta).toEqual([{ elementoId: "b", x: 5, y: 5 }]);
  });

  it("inclui elementos novos (sem posição anterior)", () => {
    const anterior = mapaPara([["a", { x: 0, y: 0 }]]);
    const atual = mapaPara([
      ["a", { x: 0, y: 0 }],
      ["c", { x: 9, y: 9 }],
    ]);
    const delta = calcularDelta(anterior, atual);
    expect(delta).toEqual([{ elementoId: "c", x: 9, y: 9 }]);
  });

  it("devolve vazio quando nada mudou", () => {
    const m = mapaPara([["a", { x: 3, y: 4 }]]);
    expect(calcularDelta(m, new Map(m))).toEqual([]);
  });
});

describe("ease", () => {
  it("tem pontos fixos em 0, 0.5 e 1", () => {
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(1)).toBe(1);
  });

  it("é monotónica crescente", () => {
    expect(ease(0.25)).toBeLessThan(ease(0.5));
    expect(ease(0.5)).toBeLessThan(ease(0.75));
  });
});

describe("elementoEmPonto (hit-test com raio expandido)", () => {
  const elementos = [jogador("a", 100, 100)];

  it("não acerta fora do raio visual com raio pequeno", () => {
    // distância ~12.7 unidades do centro; raio visual do jogador = 8
    expect(elementoEmPonto(elementos, 109, 109, 8)).toBeNull();
  });

  it("acerta com raio de hit expandido", () => {
    expect(elementoEmPonto(elementos, 109, 109, 20)?.id).toBe("a");
  });

  it("acerta em setas pelo trajecto", () => {
    const seta: ElementoCampo = {
      id: "s",
      tipo: "seta",
      estilo: "movimento",
      cor: "#000",
      pontos: [
        { x: 0, y: 0 },
        { x: 40, y: 40 },
      ],
    };
    expect(elementoEmPonto([seta], 41, 41, 14)?.id).toBe("s");
  });

  it("prioriza o elemento mais acima (último do array)", () => {
    const dois = [jogador("baixo", 100, 100), jogador("cima", 100, 100)];
    expect(elementoEmPonto(dois, 100, 100, 14)?.id).toBe("cima");
  });
});

describe("ancoraElemento", () => {
  it("usa (x,y) para elementos-ponto", () => {
    expect(ancoraElemento(jogador("a", 30, 40))).toEqual({ x: 30, y: 40 });
  });

  it("usa o PRIMEIRO ponto do trajecto para setas (corrige B3)", () => {
    const seta: ElementoCampo = {
      id: "s",
      tipo: "seta",
      estilo: "passe",
      cor: "#000",
      pontos: [
        { x: 120, y: 60 },
        { x: 200, y: 90 },
      ],
    };
    expect(ancoraElemento(seta)).toEqual({ x: 120, y: 60 });
  });

  it("usa o primeiro ponto do trajecto para linhas", () => {
    const linha: ElementoCampo = {
      id: "l",
      tipo: "linha",
      cor: "#000",
      pontos: [
        { x: 10, y: 10 },
        { x: 90, y: 10 },
      ],
    };
    expect(ancoraElemento(linha)).toEqual({ x: 10, y: 10 });
  });
});

describe("posicoesBase", () => {
  it("extrai só os elementos-ponto", () => {
    const seta: ElementoCampo = {
      id: "s",
      tipo: "seta",
      estilo: "movimento",
      cor: "#000",
      pontos: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    const base = posicoesBase([jogador("a", 5, 5), seta]);
    expect(base.size).toBe(1);
    expect(base.get("a")).toEqual({ x: 5, y: 5 });
  });
});

describe("raioHitEfetivo", () => {
  it("nunca é inferior a 14 unidades", () => {
    expect(raioHitEfetivo(2)).toBe(14); // 16/2 = 8 → clamp para 14
  });

  it("cresce em ecrãs mais pequenos (escala < 1)", () => {
    // escala 0.5 → 16/0.5 = 32 unidades
    expect(raioHitEfetivo(0.5)).toBe(32);
  });
});

// §8.10/§11.3: tokens do adversário no quadro tático do jogo.
describe("adversário (quadro tático do jogo)", () => {
  it("rótulo acessível distingue adversário de jogador próprio", () => {
    const proprio: ElementoCampo = {
      id: "p",
      tipo: "jogador",
      x: 100,
      y: 100,
      cor: "azul",
      numero: 7,
    };
    const adversario: ElementoCampo = {
      id: "a",
      tipo: "jogador",
      x: 100,
      y: 100,
      cor: "vermelho",
      equipa: "adversario",
    };
    expect(rotuloElemento(proprio)).toBe("Jogador 7 (azul)");
    expect(rotuloElemento(adversario)).toBe("Adversário");
  });

  it("o diagrama aceita tokens de adversário (equipa: adversario)", () => {
    const r = diagramaSchema.safeParse({
      versao: 2,
      elementos: [
        { id: "p", tipo: "jogador", x: 30, y: 100, cor: "azul", numero: 1, equipa: "propria" },
        { id: "a", tipo: "jogador", x: 300, y: 100, cor: "vermelho", equipa: "adversario" },
      ],
      passos: [],
    });
    expect(r.success).toBe(true);
  });

  // Regressão: diagramas gravados como string JSON (ex.: conteúdo curado via
  // `seed-sub11-pg`, ou valores legados) têm de parsear na mesma — senão a
  // animação/diagrama desaparece silenciosamente no Modo Treino e no detalhe.
  it("aceita diagrama como string JSON (retrocompatível) preservando os passos", () => {
    const objeto = {
      versao: 2 as const,
      elementos: [
        { id: "j1", tipo: "jogador", x: 100, y: 100, cor: "azul", numero: 7, equipa: "propria" },
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

    const r = diagramaSchema.safeParse(JSON.stringify(objeto));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.passos).toHaveLength(1);
      // O diagrama string desserializado produz a mesma animação (base + 1 passo).
      expect(construirKeyframes(r.data)).toHaveLength(2);
    }
  });

  it("string não-JSON falha de forma limpa (não lança)", () => {
    const r = diagramaSchema.safeParse("isto não é json");
    expect(r.success).toBe(false);
  });
});
