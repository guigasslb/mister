// Funções puras do editor/animação de campo (sem React — testáveis em Node).
// Convenção base ⇄ passos (secção 11.2 da bíblia):
//   `elementos` = frame inicial (keyframe 0, base implícita).
//   `passos[]`  = keyframes seguintes, guardados como DELTA (só os elementos que
//                 mudaram). Cada keyframe HERDA as posições do keyframe anterior.

import type { DiagramaCampo, ElementoCampo } from "@/lib/schemas/exercicio";

export type Pos = { x: number; y: number };
export type PosicaoPasso = { elementoId: string; x: number; y: number };

// Duração padrão de cada segmento de animação (ms).
export const DURACAO_PADRAO = 900;

// Alvo de toque: 32px. Raio de hit em unidades = metade, convertido pela escala.
// Nunca inferior a 14 unidades (o raio visual dos maiores elementos-ponto).
export function raioHitEfetivo(escala: number): number {
  const emUnidades = 32 / 2 / (escala || 1);
  return Math.max(14, emUnidades);
}

// Posições base (keyframe 0) a partir dos elementos-ponto.
export function posicoesBase(elementos: ElementoCampo[]): Map<string, Pos> {
  const base = new Map<string, Pos>();
  for (const el of elementos) {
    if ("x" in el && "y" in el) base.set(el.id, { x: el.x, y: el.y });
  }
  return base;
}

// Constrói os keyframes acumulados: [base, base⊕passo0, …⊕passoN].
// Cada keyframe herda do anterior e sobrepõe apenas o delta do passo.
export function construirKeyframes(diagrama: DiagramaCampo): Map<string, Pos>[] {
  const base = posicoesBase(diagrama.elementos);
  const passos = [...(diagrama.passos ?? [])].sort((a, b) => a.ordem - b.ordem);
  const frames: Map<string, Pos>[] = [base];
  for (const passo of passos) {
    const m = new Map(frames[frames.length - 1]); // herda do keyframe anterior
    for (const p of passo.posicoes) m.set(p.elementoId, { x: p.x, y: p.y });
    frames.push(m);
  }
  return frames;
}

// Delta de um passo: só os elementos cuja posição difere do keyframe anterior.
export function calcularDelta(
  anterior: Map<string, Pos>,
  atual: Map<string, Pos>,
): PosicaoPasso[] {
  const delta: PosicaoPasso[] = [];
  for (const [id, p] of atual) {
    const a = anterior.get(id);
    if (!a || a.x !== p.x || a.y !== p.y) {
      delta.push({ elementoId: id, x: p.x, y: p.y });
    }
  }
  return delta;
}

// Easing suave (ease-in-out quad). ease(0)=0, ease(0.5)=0.5, ease(1)=1.
export function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Âncora de posicionamento de um elemento (para anéis de selecção/foco).
// Elementos-ponto: (x,y). Setas/linhas: o primeiro ponto do trajecto.
export function ancoraElemento(el: ElementoCampo): Pos {
  if ("x" in el && "y" in el) return { x: el.x, y: el.y };
  return el.pontos[0] ?? { x: 0, y: 0 };
}

// Hit-test com raio configurável (em unidades). Procura de cima para baixo.
export function elementoEmPonto(
  elementos: ElementoCampo[],
  x: number,
  y: number,
  raioHit: number,
): ElementoCampo | null {
  for (let i = elementos.length - 1; i >= 0; i--) {
    const el = elementos[i];
    if ("x" in el && "y" in el) {
      if (Math.hypot(el.x - x, el.y - y) <= raioHit) return el;
    } else if (el.pontos.length) {
      for (const p of el.pontos) {
        if (Math.hypot(p.x - x, p.y - y) <= raioHit) return el;
      }
    }
  }
  return null;
}

// Rótulo acessível de um elemento (aria-label).
export function rotuloElemento(el: ElementoCampo): string {
  switch (el.tipo) {
    case "jogador":
      return `Jogador ${el.numero ?? ""} (${el.cor})`.replace(/\s+/g, " ").trim();
    case "bola":
      return "Bola";
    case "cone":
      return el.cor ? `Cone (${el.cor})` : "Cone";
    case "baliza":
      return "Baliza";
    case "seta":
      return "Seta";
    case "linha":
      return "Linha";
    case "texto":
      return `Texto: ${el.conteudo}`;
    case "escadinha":
      return `Escadinha de agilidade (${el.tamanho})`;
    case "barras":
      return "Barras para saltos";
  }
}
