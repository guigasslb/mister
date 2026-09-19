import { FormatoJogo } from "@prisma/client";
import type { ElementoCampo, TamanhoEscadinha } from "@/lib/schemas/exercicio";
import { ancoraElemento, rotuloElemento, pontosSemRepetidos } from "./animacao";

// Dimensões internas do campo (secção 13.1): 1 unidade = 10 cm, campo 400×200.
// 🔁 v7 (§11.5): o espaço de coordenadas interno mantém-se 400×200 para TODOS os
// formatos (futsal e futebol) — o que muda por formato são apenas as marcações do
// fundo. Assim os elementos (schema 0–400 / 0–200), a escala de hit-area e o
// teclado são coerentes e retrocompatíveis entre modalidades.
export const CAMPO_W = 400;
export const CAMPO_H = 200;

const COR_HEX: Record<string, string> = {
  azul: "#1A2FD4",
  vermelho: "#DC2626",
  amarelo: "#F5C518",
  verde: "#16A34A",
};

function corParaHex(cor: string): string {
  return COR_HEX[cor] ?? cor;
}

// ─── Cores de cone (secção 13.3) ─────────────────────────────────────────────
//
// Paleta partilhada pelo editor (toolbar) e pelo render. Cada cor tem um
// preenchimento e um contorno mais escuro para contraste. Ausente → laranja
// (default/retrocompatível com diagramas gravados antes do multicolor).

export const CONE_COR_DEFAULT = "laranja";

export const CONE_CORES: {
  valor: string;
  hex: string;
  stroke: string;
  nome: string;
}[] = [
  { valor: "laranja", hex: "#F97316", stroke: "#7C2D12", nome: "Laranja" },
  { valor: "amarelo", hex: "#F5C518", stroke: "#8A6D00", nome: "Amarelo" },
  { valor: "vermelho", hex: "#DC2626", stroke: "#7F1D1D", nome: "Vermelho" },
  { valor: "azul", hex: "#2563EB", stroke: "#1E3A8A", nome: "Azul" },
  { valor: "verde", hex: "#16A34A", stroke: "#14532D", nome: "Verde" },
  { valor: "branco", hex: "#E5E7EB", stroke: "#6B7280", nome: "Branco" },
];

const CONE_COR_MAP: Record<string, { hex: string; stroke: string }> =
  Object.fromEntries(CONE_CORES.map((c) => [c.valor, { hex: c.hex, stroke: c.stroke }]));

function coneCor(cor?: string): { hex: string; stroke: string } {
  return CONE_COR_MAP[cor ?? CONE_COR_DEFAULT] ?? CONE_COR_MAP[CONE_COR_DEFAULT];
}

// ─── Escadinha e barras para saltos (secção 11.2) ────────────────────────────
//
// Elementos de treino de agilidade/coordenação. Ambos suportam rotação
// (`angulo`, graus) para orientação no campo. A escadinha deriva o nº de degraus
// do `tamanho`; as barras têm forma de ⊓.

export const ESCADINHA_COR = "#F5C518"; // amarelo (visível sobre relvado/pitch)
export const BARRAS_COR = "#2563EB"; // azul

// ─── Cores de arco (secção 13.3) ─────────────────────────────────────────────
//
// Arco = aro/círculo deitado no chão (visto de cima → elipse achatada). Paleta
// partilhada pelo editor (toolbar) e pelo render. Cada cor tem um contorno mais
// escuro para contraste (essencial para o branco sobre relvado). Ausente →
// amarelo (default/retrocompatível com diagramas gravados antes dos arcos).

export const ARCO_COR_DEFAULT = "amarelo";

export const ARCO_CORES: {
  valor: string;
  hex: string;
  stroke: string;
  nome: string;
}[] = [
  { valor: "amarelo", hex: "#EAB308", stroke: "#854D0E", nome: "Amarelo" },
  { valor: "vermelho", hex: "#EF4444", stroke: "#7F1D1D", nome: "Vermelho" },
  { valor: "azul", hex: "#3B82F6", stroke: "#1E3A8A", nome: "Azul" },
  { valor: "verde", hex: "#22C55E", stroke: "#14532D", nome: "Verde" },
  { valor: "laranja", hex: "#F97316", stroke: "#7C2D12", nome: "Laranja" },
  { valor: "branco", hex: "#FFFFFF", stroke: "#6B7280", nome: "Branco" },
];

const ARCO_COR_MAP: Record<string, { hex: string; stroke: string }> =
  Object.fromEntries(ARCO_CORES.map((c) => [c.valor, { hex: c.hex, stroke: c.stroke }]));

function arcoCor(cor?: string): { hex: string; stroke: string } {
  return ARCO_COR_MAP[cor ?? ARCO_COR_DEFAULT] ?? ARCO_COR_MAP[ARCO_COR_DEFAULT];
}

// ─── Adversário (secção 11.3) ────────────────────────────────────────────────
//
// Token genérico da equipa adversária no quadro tático (§8.10). Independente da
// paleta da equipa própria (`cor`): render sempre neutro/escuro com contorno
// tracejado e rótulo genérico ("A"), para se distinguir à primeira vista dos
// jogadores da própria equipa (coloridos e numerados). Marcado por `equipa:
// "adversario"` no schema do jogador — retrocompatível (ausente → própria).
export const ADVERSARIO_COR = "#334155"; // slate-700 (neutro, "outra equipa")

export const ESCADINHA_DEGRAUS: Record<TamanhoEscadinha, number> = {
  pequena: 4,
  media: 6,
  grande: 8,
};

// ─── Fundos de campo por formato (secção 11.5 + Apêndice B) ──────────────────
//
// Todos os fundos partilham o mesmo espaço de coordenadas 400×200 (1u=10cm no
// futsal); as marcações de futebol são desenhadas em proporção reconhecível
// dentro dessa caixa (dimensões "de referência" — Apêndice B). O motor de
// elementos, animação e interação é agnóstico ao fundo.

const BRANCO = "#FFFFFF";
// Fundo do campo = cor do clube (--cor-primaria, alimentada pelo layout — ver
// docs/BRAND.md §3). Fallback = laranja da marca, como no resto do ficheiro.
// As linhas mantêm-se a branco (BRANCO) para contraste sobre o acento do clube.
const RELVA = "var(--cor-primaria, #F0531E)";
const TRACO = 1.5;
const MEIO_Y = CAMPO_H / 2;

/**
 * Enriquecimento visual do fundo (mantém a cor do clube): vinheta radial (brilho
 * central + escurecimento nos bordos → profundidade) e um filtro de relevo ténue
 * para as linhas ganharem sombra própria sem perder nitidez (a linha original é
 * pintada por cima da sua sombra). Definido UMA vez em `Relvado` — usado por todos
 * os fundos. Cor-independente, logo o mesmo id é seguro em qualquer campo.
 */
function FundoDefs() {
  return (
    <defs>
      <radialGradient id="campo-fundo-vinheta" cx="50%" cy="42%" r="75%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
        <stop offset="42%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="78%" stopColor="#000000" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.36" />
      </radialGradient>
      <filter
        id="campo-linha-relevo"
        x="-5%"
        y="-5%"
        width="110%"
        height="110%"
      >
        <feDropShadow
          dx="0"
          dy="0.5"
          stdDeviation="0.35"
          floodColor="#000000"
          floodOpacity="0.35"
        />
      </filter>
    </defs>
  );
}

/** Relvado + contorno + linha de meio-campo + marca central (comum a todos). */
function Relvado() {
  return (
    <>
      <FundoDefs />
      <rect x={0} y={0} width={CAMPO_W} height={CAMPO_H} fill={RELVA} />
      {/* Vinheta/brilho central — enriquece o acento do clube com volume, sem o
          substituir; as linhas brancas mantêm-se legíveis por cima. */}
      <rect
        x={0}
        y={0}
        width={CAMPO_W}
        height={CAMPO_H}
        fill="url(#campo-fundo-vinheta)"
      />
      {/* Ripado do pavilhão: linhas horizontais finas (textura de soalho/parquet)
          por cima do acento do clube. Muito ténues para não competir com as
          marcações brancas do campo (que se mantêm intactas). */}
      <g stroke={BRANCO} strokeOpacity={0.06} strokeWidth={0.5}>
        {Array.from({ length: Math.floor(CAMPO_H / 10) - 1 }, (_, i) => {
          const y = (i + 1) * 10;
          return <line key={i} x1={0} y1={y} x2={CAMPO_W} y2={y} />;
        })}
      </g>
      <g filter="url(#campo-linha-relevo)">
        <rect
          x={4}
          y={4}
          width={CAMPO_W - 8}
          height={CAMPO_H - 8}
          fill="none"
          stroke={BRANCO}
          strokeWidth={TRACO}
        />
        <line
          x1={CAMPO_W / 2}
          y1={4}
          x2={CAMPO_W / 2}
          y2={CAMPO_H - 4}
          stroke={BRANCO}
          strokeWidth={TRACO}
        />
        <circle cx={CAMPO_W / 2} cy={MEIO_Y} r={2} fill={BRANCO} />
      </g>
    </>
  );
}

/** Baliza desenhada por fora da linha de baliza (esquerda ou direita). */
function Baliza({ lado, altura }: { lado: "esq" | "dir"; altura: number }) {
  const prof = 5;
  const x = lado === "esq" ? 4 : CAMPO_W - 4;
  const d = lado === "esq" ? -prof : prof;
  const y1 = MEIO_Y - altura / 2;
  const y2 = MEIO_Y + altura / 2;
  const midX = x + d / 2;
  return (
    <g stroke={BRANCO} strokeWidth={TRACO} fill="none">
      {/* Rede sugerida (fios ténues) para dar profundidade à baliza. */}
      <g strokeOpacity={0.4} strokeWidth={0.5}>
        <line x1={midX} y1={y1} x2={midX} y2={y2} />
        <line x1={x} y1={MEIO_Y - altura / 4} x2={x + d} y2={MEIO_Y - altura / 4} />
        <line x1={x} y1={MEIO_Y + altura / 4} x2={x + d} y2={MEIO_Y + altura / 4} />
      </g>
      <line x1={x} y1={y1} x2={x + d} y2={y1} />
      <line x1={x + d} y1={y1} x2={x + d} y2={y2} />
      <line x1={x} y1={y2} x2={x + d} y2={y2} />
    </g>
  );
}

/** Área rectangular (grande ou pequena) num dos lados. */
function AreaRect({
  lado,
  prof,
  altura,
}: {
  lado: "esq" | "dir";
  prof: number;
  altura: number;
}) {
  const x = lado === "esq" ? 4 : CAMPO_W - 4 - prof;
  const y = MEIO_Y - altura / 2;
  return (
    <rect
      x={x}
      y={y}
      width={prof}
      height={altura}
      fill="none"
      stroke={BRANCO}
      strokeWidth={TRACO}
    />
  );
}

/** Marca de grande penalidade. */
function MarcaPenalti({ lado, dist }: { lado: "esq" | "dir"; dist: number }) {
  const cx = lado === "esq" ? 4 + dist : CAMPO_W - 4 - dist;
  return <circle cx={cx} cy={MEIO_Y} r={1.6} fill={BRANCO} />;
}

/** Arco de grande área (parte visível fora da grande área). */
function ArcoPenalti({
  lado,
  dist,
  arcR,
  profArea,
}: {
  lado: "esq" | "dir";
  dist: number;
  arcR: number;
  profArea: number;
}) {
  const cx = lado === "esq" ? 4 + dist : CAMPO_W - 4 - dist;
  const bordoX = lado === "esq" ? 4 + profArea : CAMPO_W - 4 - profArea;
  const dx = Math.abs(bordoX - cx);
  if (dx >= arcR) return null; // arco totalmente dentro da área → invisível
  const dy = Math.sqrt(arcR * arcR - dx * dx);
  // Bojo para o meio-campo: esquerda → sweep 1; direita → sweep 0.
  const sweep = lado === "esq" ? 1 : 0;
  const d = `M ${bordoX} ${MEIO_Y - dy} A ${arcR} ${arcR} 0 0 ${sweep} ${bordoX} ${MEIO_Y + dy}`;
  return <path d={d} fill="none" stroke={BRANCO} strokeWidth={TRACO} />;
}

/** Fundo de futsal (secção 13.1) — quartos de círculo de 6 m e 2.ª penalidade. */
function FundoFutsal5() {
  return (
    <g>
      <Relvado />
      <g filter="url(#campo-linha-relevo)">
      {/* Balizas nas duas extremidades (baliza de futsal = 3m ≈ 30 unidades).
          Antes só os fundos de futebol as desenhavam; no futsal (e no plano de
          jogo) têm de aparecer sempre. Só usam <line>, logo não alteram as
          contagens de <circle>/<rect>/<path> validadas nos testes de fundo. */}
      <Baliza lado="esq" altura={30} />
      <Baliza lado="dir" altura={30} />
      {/* Círculo central (raio 3m = 30 unidades) */}
      <circle
        cx={CAMPO_W / 2}
        cy={MEIO_Y}
        r={30}
        fill="none"
        stroke={BRANCO}
        strokeWidth={TRACO}
      />
      {/* Área esquerda: quarto de círculo 6m (60 unidades) em cada poste */}
      <path
        d={`M 4 ${MEIO_Y - 30 - 60} A 60 60 0 0 1 64 ${MEIO_Y - 30}`}
        fill="none"
        stroke={BRANCO}
        strokeWidth={TRACO}
      />
      <path
        d={`M 64 ${MEIO_Y + 30} A 60 60 0 0 1 4 ${MEIO_Y + 30 + 60}`}
        fill="none"
        stroke={BRANCO}
        strokeWidth={TRACO}
      />
      <line x1={64} y1={MEIO_Y - 30} x2={64} y2={MEIO_Y + 30} stroke={BRANCO} strokeWidth={TRACO} />
      <circle cx={64} cy={MEIO_Y} r={1.6} fill={BRANCO} />
      <circle cx={100} cy={MEIO_Y} r={1.6} fill={BRANCO} />
      {/* Área direita (espelhada) */}
      <path
        d={`M ${CAMPO_W - 4} ${MEIO_Y - 30 - 60} A 60 60 0 0 0 ${CAMPO_W - 64} ${MEIO_Y - 30}`}
        fill="none"
        stroke={BRANCO}
        strokeWidth={TRACO}
      />
      <path
        d={`M ${CAMPO_W - 64} ${MEIO_Y + 30} A 60 60 0 0 0 ${CAMPO_W - 4} ${MEIO_Y + 30 + 60}`}
        fill="none"
        stroke={BRANCO}
        strokeWidth={TRACO}
      />
      <line
        x1={CAMPO_W - 64}
        y1={MEIO_Y - 30}
        x2={CAMPO_W - 64}
        y2={MEIO_Y + 30}
        stroke={BRANCO}
        strokeWidth={TRACO}
      />
      <circle cx={CAMPO_W - 64} cy={MEIO_Y} r={1.6} fill={BRANCO} />
      <circle cx={CAMPO_W - 100} cy={MEIO_Y} r={1.6} fill={BRANCO} />
      </g>
    </g>
  );
}

/** Configuração de marcações de um fundo de futebol (proporções de referência). */
interface CfgFutebol {
  /** Raio do círculo central (0 = sem círculo, ex.: 3×3). */
  centerR: number;
  /** Grande área (rectângulo). */
  bigArea?: { prof: number; altura: number };
  /** Pequena área (rectângulo). */
  smallArea?: { prof: number; altura: number };
  /** Marca de grande penalidade (distância à linha de baliza). */
  penalti?: { dist: number };
  /** Arco da grande área (raio). Requer `bigArea` + `penalti`. */
  arco?: { arcR: number };
  /** Altura da baliza. */
  goalAltura: number;
}

/** Fundo genérico de futebol — desenha ambos os lados (espelhados). */
function FundoFutebol({ cfg }: { cfg: CfgFutebol }) {
  const lados: ("esq" | "dir")[] = ["esq", "dir"];
  return (
    <g>
      <Relvado />
      <g filter="url(#campo-linha-relevo)">
      {cfg.centerR > 0 && (
        <circle
          cx={CAMPO_W / 2}
          cy={MEIO_Y}
          r={cfg.centerR}
          fill="none"
          stroke={BRANCO}
          strokeWidth={TRACO}
        />
      )}
      {lados.map((lado) => (
        <g key={lado}>
          <Baliza lado={lado} altura={cfg.goalAltura} />
          {cfg.bigArea && (
            <AreaRect lado={lado} prof={cfg.bigArea.prof} altura={cfg.bigArea.altura} />
          )}
          {cfg.smallArea && (
            <AreaRect lado={lado} prof={cfg.smallArea.prof} altura={cfg.smallArea.altura} />
          )}
          {cfg.penalti && <MarcaPenalti lado={lado} dist={cfg.penalti.dist} />}
          {cfg.arco && cfg.bigArea && cfg.penalti && (
            <ArcoPenalti
              lado={lado}
              dist={cfg.penalti.dist}
              arcR={cfg.arco.arcR}
              profArea={cfg.bigArea.prof}
            />
          )}
        </g>
      ))}
      </g>
    </g>
  );
}

// Configurações por formato (Apêndice B — dimensões de referência, ⚠️ aproximadas).
const CFG_FUTEBOL_3_3: CfgFutebol = { centerR: 0, goalAltura: 34 };
const CFG_FUTEBOL_5_5: CfgFutebol = {
  centerR: 24,
  smallArea: { prof: 30, altura: 80 },
  goalAltura: 30,
};
const CFG_FUTEBOL_7: CfgFutebol = {
  centerR: 26,
  bigArea: { prof: 48, altura: 100 },
  penalti: { dist: 34 },
  goalAltura: 28,
};
const CFG_FUTEBOL_9: CfgFutebol = {
  centerR: 28,
  bigArea: { prof: 55, altura: 110 },
  penalti: { dist: 38 },
  goalAltura: 26,
};
const CFG_FUTEBOL_11: CfgFutebol = {
  centerR: 30,
  bigArea: { prof: 66, altura: 126 },
  smallArea: { prof: 22, altura: 57 },
  penalti: { dist: 44 },
  arco: { arcR: 37 },
  goalAltura: 23,
};

// ─── Linhas de referência do campo (secção 11.5) ─────────────────────────────

/**
 * Fundo do campo para o `formato` indicado (§11.5 / Apêndice B).
 * Ausente/legado → FUTSAL_5 (retrocompatível — Apêndice C).
 */
export function LinhasCampo({
  formato = FormatoJogo.FUTSAL_5,
}: {
  formato?: FormatoJogo;
}) {
  switch (formato) {
    case FormatoJogo.FUTEBOL_3_3:
      return <FundoFutebol cfg={CFG_FUTEBOL_3_3} />;
    case FormatoJogo.FUTEBOL_5_5:
      return <FundoFutebol cfg={CFG_FUTEBOL_5_5} />;
    case FormatoJogo.FUTEBOL_7:
      return <FundoFutebol cfg={CFG_FUTEBOL_7} />;
    case FormatoJogo.FUTEBOL_9:
      return <FundoFutebol cfg={CFG_FUTEBOL_9} />;
    case FormatoJogo.FUTEBOL_11:
      return <FundoFutebol cfg={CFG_FUTEBOL_11} />;
    case FormatoJogo.FUTSAL_5:
    default:
      return <FundoFutsal5 />;
  }
}

/** Rótulo acessível (PT-PT) do fundo de campo por formato. */
export function rotuloCampo(formato: FormatoJogo = FormatoJogo.FUTSAL_5): string {
  switch (formato) {
    case FormatoJogo.FUTEBOL_3_3:
      return "campo de futebol de 3";
    case FormatoJogo.FUTEBOL_5_5:
      return "campo de futebol de 5";
    case FormatoJogo.FUTEBOL_7:
      return "campo de futebol de 7";
    case FormatoJogo.FUTEBOL_9:
      return "campo de futebol de 9";
    case FormatoJogo.FUTEBOL_11:
      return "campo de futebol de 11";
    case FormatoJogo.FUTSAL_5:
    default:
      return "campo de futsal";
  }
}

// ─── Marcador de ponta de seta (partilhado) ──────────────────────────────────
//
// Bug das setas para a esquerda (2 tentativas anteriores): a cabeça aparecia
// deslocada/torta ou "no meio" da linha — o corpo parecia sair da ponta em vez de
// chegar a ela. Duas causas cumulativas:
//
//   1. `refX` NÃO coincidia com a ponta do triângulo (tip em x=10 no viewBox, mas
//      refX=9). O ponto de ancoragem — que assenta no fim da linha — ficava 1
//      unidade atrás da ponta, fazendo a ponta ultrapassar o fim da linha.
//   2. `markerUnits="strokeWidth"` escala o marcador pela espessura do traço E
//      remapeia o viewBox (0–10) para um viewport 6×6 (escala 0,6). Isto amplifica
//      o desalinhamento do refX ao longo da direção de deslocamento; a ~180°
//      (setas para a esquerda) empurra a cabeça rodada para fora do fim da linha.
//
// Correção robusta: `markerUnits="userSpaceOnUse"` com dimensões FIXAS (12×12),
// independentes da espessura do traço; `viewBox="0 0 10 10"` mantém o sistema de
// coordenadas bem definido para o `orient="auto"`; e `refX=10 refY=5` ancora
// EXACTAMENTE a ponta do triângulo (M0,0 L10,5 L0,10 → tip em (10,5)) ao fim da
// linha. A ponta assenta no ponto final em todas as direções (0/45/90/135/180/
// 225/270/315°). Tamanho visual ~12 unidades, igual ao anterior.
export function SetaMarker({ id, cor }: { id: string; cor: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      markerWidth={12}
      markerHeight={12}
      refX={10}
      refY={5}
      orient="auto"
      markerUnits="userSpaceOnUse"
    >
      <path d="M0,0 L10,5 L0,10 z" fill={cor} />
    </marker>
  );
}

// ─── Caminho suave a partir de pontos ────────────────────────────────────────

function pontosParaPath(pontos: { x: number; y: number }[]): string {
  if (pontos.length === 0) return "";
  if (pontos.length === 1) return `M ${pontos[0].x} ${pontos[0].y}`;
  // Linha poligonal simples (quebrada) — suficiente e previsível.
  return pontos.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

// ─── Volume das peças (gradientes/sombra partilhados) ────────────────────────
//
// Gradientes COR-INDEPENDENTES (branco/preto → transparente) sobrepostos ao
// preenchimento sólido de cada peça para lhe dar volume esférico/3D, mantendo a
// cor lógica (equipa/cone) intacta. Como não dependem da cor da peça, o mesmo id
// é seguro em múltiplas instâncias (conteúdo idêntico → `url(#id)` resolve igual).
//   · peca-sombra-chao : sombra projetada elíptica no chão (radial escuro→transp.)
//   · peca-luz         : brilho especular (radial branco no canto superior-esq.)
//   · peca-rim         : escurecimento do bordo (dá curvatura/volume)
//   · peca-cone-brilho : gradiente vertical topo-claro→base-escura (faces do cone)
function PecaDefs() {
  return (
    <defs>
      <radialGradient id="peca-sombra-chao" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#000000" stopOpacity="0.42" />
        <stop offset="60%" stopColor="#000000" stopOpacity="0.22" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="peca-luz" cx="32%" cy="26%" r="72%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="42%" stopColor="#ffffff" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="peca-rim" cx="50%" cy="52%" r="58%">
        <stop offset="55%" stopColor="#000000" stopOpacity="0" />
        <stop offset="88%" stopColor="#000000" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.44" />
      </radialGradient>
      <linearGradient id="peca-cone-brilho" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
        <stop offset="30%" stopColor="#ffffff" stopOpacity="0.12" />
        <stop offset="55%" stopColor="#000000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.42" />
      </linearGradient>
    </defs>
  );
}

/** Pontos de um polígono regular de `n` lados (topo primeiro). */
function pontosPoligono(
  cx: number,
  cy: number,
  r: number,
  n: number,
  rotDeg = 0,
): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((rotDeg - 90) * Math.PI) / 180 + (i * 2 * Math.PI) / n;
    out.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return out.join(" ");
}

// ─── Render de um elemento ───────────────────────────────────────────────────

export function ElementoSVG({
  elemento,
  selecionado,
  focado,
  raioHit = 0,
  onFocarHit,
  pathSelecionavel = true,
  animarTrajeto,
}: {
  elemento: ElementoCampo;
  selecionado?: boolean;
  focado?: boolean;
  // Raio (em unidades) do círculo de hit/toque invisível. 0 = read-only.
  raioHit?: number;
  onFocarHit?: (id: string) => void;
  // Setas/linhas selecionáveis? `false` no modo animação (§11): as setas não
  // participam nos passos, logo a faixa de hit/foco do trajecto é desativada para
  // não interceptar cliques/foco de teclado destinados aos elementos-ponto.
  pathSelecionavel?: boolean;
  // Reprodução "desenho de trajeto": quando definido, uma seta/linha desenha-se
  // progressivamente (stroke-dashoffset 1→0 sobre um trajeto normalizado). O
  // `atrasoMs` dá o efeito sequencial (uma seta após a outra). Aditivo: ausente →
  // render estático de sempre (não afeta o editor nem os testes de regressão).
  animarTrajeto?: { atrasoMs: number; duracaoMs: number } | null;
}) {
  // B3: para setas/linhas o anel usa o primeiro ponto do trajecto (não (0,0)).
  const ancora = ancoraElemento(elemento);
  const temPonto = "x" in elemento && "y" in elemento;

  // Estilo de "desenho" aplicado a setas/linhas quando em reprodução. Normaliza o
  // comprimento do trajecto a 1 (pathLength) para animar o dashoffset sem precisar
  // de medir o path. `both` mantém o estado inicial (invisível) durante o atraso e
  // o final (desenhado) após terminar.
  const estiloDesenho = animarTrajeto
    ? {
        strokeDasharray: 1,
        strokeDashoffset: 1,
        animation: `campo-desenhar-trajeto ${animarTrajeto.duracaoMs}ms ease-in-out ${animarTrajeto.atrasoMs}ms both`,
      }
    : undefined;

  const anelSelecao = selecionado ? (
    <circle
      cx={ancora.x}
      cy={ancora.y}
      r={12}
      fill="none"
      stroke="#F5C518"
      strokeWidth={2}
      strokeDasharray="4 3"
    />
  ) : null;

  // Anel de foco de teclado — distinto do anel de selecção (cor do clube).
  const anelFoco = focado ? (
    <circle
      cx={ancora.x}
      cy={ancora.y}
      r={15}
      fill="none"
      stroke="var(--cor-primaria, #F0531E)"
      strokeWidth={1.5}
      strokeDasharray="2 3"
    />
  ) : null;

  // Círculo de hit/toque invisível (só no editor) — alvo ≥32px e foco de teclado.
  const hit =
    temPonto && raioHit > 0 ? (
      <circle
        cx={ancora.x}
        cy={ancora.y}
        r={raioHit}
        fill="transparent"
        tabIndex={0}
        role="button"
        aria-label={rotuloElemento(elemento)}
        style={{ cursor: "grab", outline: "none" }}
        onFocus={onFocarHit ? () => onFocarHit(elemento.id) : undefined}
      />
    ) : null;

  // Alvo de hit/toque invisível para setas/linhas: uma faixa espessa sobre o
  // trajecto (stroke largo transparente) para aumentar a área de clique/toque e
  // servir de alvo de foco de teclado — paridade com o círculo dos elementos-ponto.
  const hitPath =
    !temPonto && "pontos" in elemento && raioHit > 0 && pathSelecionavel ? (
      <path
        d={pontosParaPath(pontosSemRepetidos(elemento.pontos))}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(raioHit, 8)}
        strokeLinecap="round"
        strokeLinejoin="round"
        tabIndex={0}
        role="button"
        aria-label={rotuloElemento(elemento)}
        style={{ cursor: "grab", outline: "none" }}
        onFocus={onFocarHit ? () => onFocarHit(elemento.id) : undefined}
      />
    ) : null;

  const decoracoes = (
    <>
      {hit}
      {hitPath}
      {anelSelecao}
      {anelFoco}
    </>
  );

  switch (elemento.tipo) {
    case "jogador": {
      // §11.3: o adversário é neutro/escuro, tracejado e sem número (rótulo "A"),
      // para se distinguir dos jogadores da equipa própria (coloridos/numerados).
      const eAdversario = elemento.equipa === "adversario";
      const preenchimento = eAdversario ? ADVERSARIO_COR : corParaHex(elemento.cor);
      const etiqueta =
        elemento.rotulo != null && elemento.rotulo !== ""
          ? elemento.rotulo
          : elemento.numero != null
            ? String(elemento.numero)
            : eAdversario
              ? "A"
              : null;
      // Rótulos longos (ex.: "Pivot", "Ala") reduzem o tamanho do texto para
      // caber dentro do círculo do jogador (r=8). Números/rótulos curtos mantêm 8.
      const tamanhoEtiqueta =
        etiqueta != null && etiqueta.length > 3 ? 5 : etiqueta != null && etiqueta.length > 2 ? 6 : 8;
      const cx = elemento.x;
      const cy = elemento.y;
      // §11.3 (visual 3/4 realista): figura humana vista de trás em leve ângulo
      // 3/4 — cabeça proporcional + pescoço + ombros + tronco em perspetiva
      // (largo em cima, estreito na cintura) + calções + pernas + botas + braços
      // ao longo do corpo. ANCORADA no ponto lógico (cx,cy): o TRONCO fica centrado
      // no ponto (o número assenta nas "costas"), coerente com o hit-test em círculo
      // r≈8 à volta de (cx,cy). A figura ocupa ~24u de altura (cabeça acima, pés
      // abaixo) SEM alterar o centro lógico nem o raio de hit-test.
      // Tons: adversário → cinza (camisola neutra + pele cinza-ardósia); próprio →
      // pele quente + camisola na cor da equipa.
      const peleFill = eAdversario ? "#9AA6B5" : "#EAC7A2";
      const peleStroke = eAdversario ? "#334155" : "#8A5A38";
      const botaFill = eAdversario ? "#1E293B" : "#242833";
      // Geometria da figura, toda relativa a (cx,cy). O tronco (ombros→cintura) é a
      // "caixa" do número, com o seu centro sobre (cx,cy).
      const headR = 2.7; // proporcional ao corpo (não bobblehead)
      const headCy = cy - 8.9;
      const shoulderY = cy - 5.6;
      const waistY = cy + 2.2;
      const shoulderHalf = 5.6; // meia-largura aos ombros
      const waistHalf = 3.7; // meia-largura à cintura (perspetiva: estreita)
      const golaHalf = 1.6; // meia-abertura da gola (pescoço)
      const shortTop = waistY - 0.3;
      const shortBot = waistY + 3.6;
      const legTopY = shortBot - 0.4;
      const legBotY = cy + 10.4;
      // Legenda de posição tática (§11.5): apresentada numa pílula por baixo dos
      // pés, sem tapar o número (que fica no tronco). Só quando o elemento a traz
      // (plano de jogo) — exercícios/diagramas antigos não a definem.
      const etiquetaPos =
        elemento.etiquetaPosicao != null && elemento.etiquetaPosicao !== ""
          ? elemento.etiquetaPosicao
          : null;
      const posLargura = etiquetaPos ? Math.max(9, etiquetaPos.length * 2.7 + 4) : 0;
      const posTopo = legBotY + 3;
      // Camisola vista de trás: ombros arredondados largos com entalhe de gola ao
      // centro, laterais a estreitar até à bainha curva na cintura (perspetiva 3D).
      const camisola =
        `M ${cx - shoulderHalf} ${shoulderY + 0.9}` +
        ` Q ${cx - shoulderHalf} ${shoulderY - 0.9} ${cx - shoulderHalf + 1.6} ${shoulderY - 1.1}` +
        ` L ${cx - golaHalf} ${shoulderY - 1.3}` +
        ` Q ${cx} ${shoulderY + 0.7} ${cx + golaHalf} ${shoulderY - 1.3}` +
        ` L ${cx + shoulderHalf - 1.6} ${shoulderY - 1.1}` +
        ` Q ${cx + shoulderHalf} ${shoulderY - 0.9} ${cx + shoulderHalf} ${shoulderY + 0.9}` +
        ` L ${cx + waistHalf} ${waistY}` +
        ` Q ${cx} ${waistY + 1.7} ${cx - waistHalf} ${waistY}` +
        ` Z`;
      // Calções: trapézio abaixo da bainha (tom escurecido da camisola).
      const calcao =
        `M ${cx - waistHalf} ${shortTop}` +
        ` L ${cx + waistHalf} ${shortTop}` +
        ` L ${cx + waistHalf - 0.5} ${shortBot}` +
        ` L ${cx - waistHalf + 0.5} ${shortBot}` +
        ` Z`;
      return (
        <g>
          {decoracoes}
          <PecaDefs />
          <defs>
            {/* Luz lateral da camisola: esquerda iluminada → direita em sombra
                (dá volume 3D ao tronco). Cor-independente → id seguro entre
                instâncias (tal como PecaDefs). */}
            <linearGradient id="jog-camisola-luz" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
              <stop offset="34%" stopColor="#ffffff" stopOpacity="0.06" />
              <stop offset="60%" stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.4" />
            </linearGradient>
            {/* Volume esférico da cabeça: topo claro (luz de cima) → base escura. */}
            <radialGradient id="jog-cabeca" cx="40%" cy="26%" r="80%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.05" />
              <stop offset="72%" stopColor="#000000" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.5" />
            </radialGradient>
          </defs>
          {/* Sombra elíptica projetada no chão (aos pés) → a figura "levanta". */}
          <ellipse cx={cx} cy={legBotY + 1.4} rx={6.4} ry={2} fill="url(#peca-sombra-chao)" />
          {/* Botas (elipses escuras) ligeiramente abertas (ângulo 3/4). */}
          <ellipse cx={cx - 2.2} cy={legBotY + 0.6} rx={2.3} ry={1.35} fill={botaFill} transform={`rotate(-8 ${cx - 2.2} ${legBotY + 0.6})`} />
          <ellipse cx={cx + 2.2} cy={legBotY + 0.6} rx={2.3} ry={1.35} fill={botaFill} transform={`rotate(8 ${cx + 2.2} ${legBotY + 0.6})`} />
          <ellipse cx={cx - 2.2} cy={legBotY + 0.6} rx={2.3} ry={1.35} fill="url(#peca-rim)" transform={`rotate(-8 ${cx - 2.2} ${legBotY + 0.6})`} />
          <ellipse cx={cx + 2.2} cy={legBotY + 0.6} rx={2.3} ry={1.35} fill="url(#peca-rim)" transform={`rotate(8 ${cx + 2.2} ${legBotY + 0.6})`} />
          {/* Pernas/canelas (tom de pele) — dois membros vistos de trás. */}
          <line x1={cx - 2.0} y1={legTopY} x2={cx - 2.2} y2={legBotY} stroke={peleFill} strokeWidth={2.5} strokeLinecap="round" />
          <line x1={cx + 2.0} y1={legTopY} x2={cx + 2.2} y2={legBotY} stroke={peleFill} strokeWidth={2.5} strokeLinecap="round" />
          {/* Sombreado das pernas (lado direito mais escuro → volume). */}
          <line x1={cx - 2.0} y1={legTopY} x2={cx - 2.2} y2={legBotY} stroke="#000000" strokeOpacity={0.16} strokeWidth={1} strokeLinecap="round" />
          <line x1={cx + 2.0} y1={legTopY} x2={cx + 2.2} y2={legBotY} stroke="#000000" strokeOpacity={0.3} strokeWidth={1.1} strokeLinecap="round" />
          {/* Calções (por trás da bainha) + sombra + luz lateral + costura central. */}
          <path d={calcao} fill={preenchimento} />
          <path d={calcao} fill="#000000" fillOpacity={0.34} />
          <path d={calcao} fill="url(#jog-camisola-luz)" />
          <line x1={cx} y1={shortTop + 0.5} x2={cx} y2={shortBot - 0.3} stroke="#000000" strokeOpacity={0.35} strokeWidth={0.5} />
          {/* Pescoço (liga a cabeça ao tronco, por trás da gola). */}
          <rect x={cx - 1.3} y={headCy + headR - 0.9} width={2.6} height={2.7} fill={peleFill} />
          <rect x={cx - 1.3} y={headCy + headR - 0.9} width={2.6} height={2.7} fill="#000000" fillOpacity={0.18} />
          {/* Cabeça proporcional (pele) + volume esférico (topo claro→base escura)
              + realce especular (luz vinda de cima-esquerda). */}
          <circle cx={cx} cy={headCy} r={headR} fill={peleFill} />
          <circle cx={cx} cy={headCy} r={headR} fill="url(#jog-cabeca)" />
          <circle cx={cx} cy={headCy} r={headR} fill="none" stroke={peleStroke} strokeWidth={0.5} strokeOpacity={0.9} />
          <ellipse cx={cx - 0.9} cy={headCy - 1.1} rx={0.8} ry={0.6} fill="#ffffff" fillOpacity={0.5} />
          {/* Tronco/camisola na cor da equipa (número nas costas) + luz lateral +
              escurecimento de bordo (volume). */}
          <path d={camisola} fill={preenchimento} />
          <path d={camisola} fill="url(#jog-camisola-luz)" />
          <path d={camisola} fill="url(#peca-rim)" />
          {/* Realce especular no ombro esquerdo (lado iluminado). */}
          <ellipse cx={cx - shoulderHalf + 2.4} cy={shoulderY + 0.5} rx={1.6} ry={0.9} fill="#ffffff" fillOpacity={0.3} />
          {/* Gola em C (costas) sob a cabeça → reforça a leitura de "camisola". */}
          <path
            d={`M ${cx - golaHalf - 0.3} ${shoulderY - 0.6} Q ${cx} ${shoulderY + 1.8} ${cx + golaHalf + 0.3} ${shoulderY - 0.6}`}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.6}
            strokeWidth={0.8}
            strokeLinecap="round"
          />
          {/* Contorno da camisola (branco; tracejado distingue o adversário). */}
          <path
            d={camisola}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={1.1}
            strokeDasharray={eAdversario ? "3 2" : undefined}
            strokeLinejoin="round"
          />
          {/* Braços ao longo do corpo: manga (camisola) + antebraço (pele) + mão.
              Desenhados por cima do tronco → leem-se como membros à frente. */}
          {/* Braço esquerdo (lado iluminado). */}
          <ellipse cx={cx - shoulderHalf + 0.7} cy={shoulderY + 2.2} rx={1.7} ry={2.5} fill={preenchimento} />
          <ellipse cx={cx - shoulderHalf + 0.7} cy={shoulderY + 2.2} rx={1.7} ry={2.5} fill="url(#jog-camisola-luz)" />
          <line x1={cx - shoulderHalf + 0.7} y1={shoulderY + 3.8} x2={cx - waistHalf - 0.9} y2={waistY + 2.6} stroke={peleFill} strokeWidth={1.8} strokeLinecap="round" />
          <circle cx={cx - waistHalf - 0.9} cy={waistY + 2.8} r={1.1} fill={peleFill} />
          {/* Braço direito (lado sombra). */}
          <ellipse cx={cx + shoulderHalf - 0.7} cy={shoulderY + 2.2} rx={1.7} ry={2.5} fill={preenchimento} />
          <ellipse cx={cx + shoulderHalf - 0.7} cy={shoulderY + 2.2} rx={1.7} ry={2.5} fill="url(#peca-rim)" />
          <line x1={cx + shoulderHalf - 0.7} y1={shoulderY + 3.8} x2={cx + waistHalf + 0.9} y2={waistY + 2.6} stroke={peleFill} strokeWidth={1.8} strokeLinecap="round" />
          <line x1={cx + shoulderHalf - 0.7} y1={shoulderY + 3.8} x2={cx + waistHalf + 0.9} y2={waistY + 2.6} stroke="#000000" strokeOpacity={0.22} strokeWidth={0.8} strokeLinecap="round" />
          <circle cx={cx + waistHalf + 0.9} cy={waistY + 2.8} r={1.1} fill={peleFill} />
          {/* Número/rótulo — centrado no tronco (costas). */}
          {etiqueta != null && (
            <text
              x={cx}
              y={cy - 1.4}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={tamanhoEtiqueta}
              fontWeight={700}
              fill="#FFFFFF"
              stroke="rgba(15,17,23,0.6)"
              strokeWidth={0.7}
              paintOrder="stroke"
            >
              {etiqueta}
            </text>
          )}
          {/* Legenda da posição tática (pílula escura + abreviatura) por baixo da
              figura — não substitui o número. */}
          {etiquetaPos != null && (
            <g>
              <rect
                x={cx - posLargura / 2}
                y={posTopo}
                width={posLargura}
                height={6}
                rx={2}
                fill="rgba(15,17,23,0.75)"
              />
              <text
                x={cx}
                y={posTopo + 3.1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={4.4}
                fontWeight={700}
                fill="#FFFFFF"
              >
                {etiquetaPos}
              </text>
            </g>
          )}
        </g>
      );
    }

    case "bola": {
      const bx = elemento.x;
      const by = elemento.y;
      const R = 4;
      const PRETO = "#15181f";
      // Padrão clássico de bola de futebol legível a ~8px: pentágono central preto
      // + 5 costuras finas até ao bordo + 5 pequenos pentágonos parciais junto à
      // borda (entre costuras). Tudo contido dentro da esfera (sem recorte branco,
      // que criava um efeito "estrela"); o sombreado esférico é aplicado por cima.
      const rCentral = 1.5;
      const centro = pontosPoligono(bx, by, rCentral, 5, 0);
      const seams = [];
      for (let i = 0; i < 5; i++) {
        const a = ((i * 72 - 90) * Math.PI) / 180;
        seams.push(
          <line
            key={i}
            x1={bx + rCentral * 0.9 * Math.cos(a)}
            y1={by + rCentral * 0.9 * Math.sin(a)}
            x2={bx + 3.5 * Math.cos(a)}
            y2={by + 3.5 * Math.sin(a)}
            stroke={PRETO}
            strokeWidth={0.4}
            strokeLinecap="round"
          />,
        );
      }
      const patches = [];
      for (let i = 0; i < 5; i++) {
        // Entre costuras (offset 36°); pequenos e bem dentro do bordo (< R).
        const a = ((i * 72 - 90 + 36) * Math.PI) / 180;
        const px = bx + 3.0 * Math.cos(a);
        const py = by + 3.0 * Math.sin(a);
        // Vértice apontado para fora (aresta plana virada ao centro).
        patches.push(
          <polygon key={i} points={pontosPoligono(px, py, 0.85, 5, (a * 180) / Math.PI + 90)} fill={PRETO} />,
        );
      }
      return (
        <g>
          {decoracoes}
          <PecaDefs />
          <ellipse cx={bx} cy={by + 4.4} rx={3.7} ry={1.4} fill="url(#peca-sombra-chao)" />
          {/* Esfera branca + painéis (pentágono central + costuras + bordo). */}
          <circle cx={bx} cy={by} r={R} fill="#FFFFFF" />
          {seams}
          <polygon points={centro} fill={PRETO} />
          {patches}
          {/* Sombreado esférico (core shadow + highlight) + contorno. */}
          <circle cx={bx} cy={by} r={R} fill="url(#peca-rim)" />
          <circle cx={bx} cy={by} r={R} fill="url(#peca-luz)" />
          <circle cx={bx} cy={by} r={R} fill="none" stroke="#1A1D29" strokeWidth={0.6} />
        </g>
      );
    }

    case "cone": {
      const { hex, stroke } = coneCor(elemento.cor);
      const cx = elemento.x;
      const cy = elemento.y;
      const apexY = cy - 7.5;
      const baseY = cy + 5;
      const baseHalf = 5.2;
      // Meia-largura do cone a uma dada altura (interpola apex→base).
      const halfAt = (yy: number) => baseHalf * ((yy - apexY) / (baseY - apexY));
      const bandTop = cy - 1.8;
      const bandBot = cy + 1;
      const htT = halfAt(bandTop);
      const htB = halfAt(bandBot);
      // Corpo com apex arredondado: quase-triângulo cujo topo é uma curva suave.
      const body =
        `M ${cx - baseHalf} ${baseY}` +
        ` L ${cx - 1.1} ${apexY + 1.2}` +
        ` Q ${cx} ${apexY - 0.6} ${cx + 1.1} ${apexY + 1.2}` +
        ` L ${cx + baseHalf} ${baseY} Z`;
      const band = `${cx - htT},${bandTop} ${cx + htT},${bandTop} ${cx + htB},${bandBot} ${cx - htB},${bandBot}`;
      const streak = `${cx - 0.3},${cy - 5} ${cx + 0.7},${cy - 5} ${cx - 2.6},${cy + 4.4} ${cx - 3.8},${cy + 4.4}`;
      return (
        <g>
          {decoracoes}
          <PecaDefs />
          {/* Sombra projetada no chão. */}
          <ellipse cx={cx + 1.4} cy={cy + 5.8} rx={7.2} ry={2.3} fill="url(#peca-sombra-chao)" />
          {/* Base/flange quadrada sugerida por elipse larga (o cone assenta nela). */}
          <ellipse cx={cx} cy={baseY + 0.8} rx={6.3} ry={2} fill={hex} stroke={stroke} strokeWidth={0.5} />
          <ellipse cx={cx} cy={baseY + 0.8} rx={6.3} ry={2} fill="url(#peca-rim)" />
          {/* "Pé" elíptico escuro (contacto com o solo). */}
          <ellipse cx={cx} cy={baseY} rx={5.2} ry={1.6} fill={stroke} />
          {/* Corpo + gradiente vertical (topo claro→base escura). */}
          <path d={body} fill={hex} stroke={stroke} strokeWidth={0.6} strokeLinejoin="round" />
          <path d={body} fill="url(#peca-cone-brilho)" />
          {/* Banda refletora + fio superior + brilho especular lateral. */}
          <polygon points={band} fill="#ffffff" fillOpacity={0.85} />
          <polygon points={band} fill="none" stroke={stroke} strokeWidth={0.3} strokeOpacity={0.35} />
          <polygon points={streak} fill="#ffffff" fillOpacity={0.42} />
          {/* Tampa arredondada do topo (realça o vértice em vez de bico agudo). */}
          <circle cx={cx} cy={apexY + 0.6} r={1} fill={hex} stroke={stroke} strokeWidth={0.4} />
          <circle cx={cx} cy={apexY + 0.6} r={1} fill="url(#peca-luz)" />
        </g>
      );
    }

    case "baliza": {
      const horizontal = elemento.orientacao === "horizontal";
      const w = horizontal ? 30 : 6;
      const h = horizontal ? 6 : 30;
      const x0 = elemento.x - w / 2;
      const y0 = elemento.y - h / 2;
      const net = [];
      for (let i = 1; i < 4; i++) {
        const gx = x0 + (w * i) / 4;
        net.push(
          <line key={`v${i}`} x1={gx} y1={y0} x2={gx} y2={y0 + h} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={0.4} />,
        );
      }
      for (let i = 1; i < 4; i++) {
        const gy = y0 + (h * i) / 4;
        net.push(
          <line key={`h${i}`} x1={x0} y1={gy} x2={x0 + w} y2={gy} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={0.4} />,
        );
      }
      return (
        <g>
          {decoracoes}
          <PecaDefs />
          <ellipse cx={elemento.x} cy={elemento.y + h / 2 + 1.5} rx={w / 2} ry={2} fill="url(#peca-sombra-chao)" />
          {/* Rede sugerida (véu + fios) + moldura branca sólida por cima. */}
          <rect x={x0} y={y0} width={w} height={h} fill="#ffffff" fillOpacity={0.06} />
          {net}
          <rect
            x={x0}
            y={y0}
            width={w}
            height={h}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2}
          />
        </g>
      );
    }

    case "seta": {
      const dash =
        elemento.estilo === "passe"
          ? "6 4"
          : elemento.estilo === "conducao"
            ? undefined
            : undefined;
      const isConducao = elemento.estilo === "conducao";
      // Remove pontos repetidos no fim (duplo-clique) para o último segmento não
      // ficar degenerado — senão o markerEnd/orient="auto" cai no default (0°) e
      // as setas para a esquerda aparecem invertidas.
      const pontos = pontosSemRepetidos(elemento.pontos);
      const d = isConducao ? pathOndulado(pontos) : pontosParaPath(pontos);
      const markerId = `seta-${elemento.id}`;
      const haloId = `seta-halo-${elemento.id}`;
      const cor = corParaHex(elemento.cor);
      return (
        <g>
          {decoracoes}
          <defs>
            <SetaMarker id={markerId} cor={cor} />
            {/* Cabeça de halo (contorno branco) — ligeiramente maior, por trás da
                cabeça colorida → contraste sobre qualquer fundo. */}
            <marker
              id={haloId}
              viewBox="0 0 10 10"
              markerWidth={16}
              markerHeight={16}
              refX={10}
              refY={5}
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path
                d="M0,0 L10,5 L0,10 z"
                fill="none"
                stroke="#ffffff"
                strokeOpacity={0.85}
                strokeWidth={2.4}
                strokeLinejoin="round"
              />
            </marker>
          </defs>
          {/* Halo (traço branco largo) por baixo do traço colorido. */}
          <path
            d={d}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.8}
            strokeWidth={3.6}
            strokeDasharray={dash}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={`url(#${haloId})`}
            pathLength={estiloDesenho ? 1 : undefined}
            style={estiloDesenho}
          />
          <path
            d={d}
            fill="none"
            stroke={cor}
            strokeWidth={2}
            strokeDasharray={dash}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={`url(#${markerId})`}
            pathLength={estiloDesenho ? 1 : undefined}
            style={estiloDesenho}
          />
        </g>
      );
    }

    case "linha": {
      const dLinha = pontosParaPath(pontosSemRepetidos(elemento.pontos));
      return (
        <g>
          {decoracoes}
          {/* Halo branco por baixo para contraste sobre a cor do clube. */}
          <path
            d={dLinha}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.75}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={estiloDesenho ? 1 : undefined}
            style={estiloDesenho}
          />
          <path
            d={dLinha}
            fill="none"
            stroke={corParaHex(elemento.cor)}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={estiloDesenho ? 1 : undefined}
            style={estiloDesenho}
          />
        </g>
      );
    }

    case "texto":
      return (
        <g>
          {decoracoes}
          <text
            x={elemento.x}
            y={elemento.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fontWeight={600}
            fill="#FFFFFF"
            stroke="#1A1D29"
            strokeWidth={0.4}
            paintOrder="stroke"
          >
            {elemento.conteudo}
          </text>
        </g>
      );

    case "escadinha": {
      // Escada de coordenação: dois trilhos paralelos + degraus horizontais.
      // Nº de degraus por tamanho; comprimento e largura em unidades (1u=10cm).
      const degraus = ESCADINHA_DEGRAUS[elemento.tamanho];
      const cell = 7; // comprimento de cada célula (entre degraus)
      const comprimento = degraus * cell;
      const meiaLargura = 6; // meia-largura da escada (separação dos trilhos)
      const x0 = -comprimento / 2;
      // Sombra do degrau (fio escuro por baixo, ligeiramente deslocado → relevo).
      const ESCADINHA_SOMBRA = "#8A6D00";
      const rungsSombra = [];
      const rungs = [];
      for (let i = 0; i <= degraus; i++) {
        const rx = x0 + i * cell;
        rungsSombra.push(
          <line
            key={`s${i}`}
            x1={rx + 0.5}
            y1={-meiaLargura + 0.6}
            x2={rx + 0.5}
            y2={meiaLargura + 0.6}
            stroke={ESCADINHA_SOMBRA}
            strokeWidth={1.2}
            strokeOpacity={0.6}
          />,
        );
        rungs.push(
          <line
            key={i}
            x1={rx}
            y1={-meiaLargura}
            x2={rx}
            y2={meiaLargura}
            stroke={ESCADINHA_COR}
            strokeWidth={1}
            strokeLinecap="round"
          />,
        );
      }
      return (
        <g>
          {decoracoes}
          <g
            transform={`translate(${elemento.x} ${elemento.y}) rotate(${elemento.angulo})`}
          >
            {/* Sombra dos trilhos + degraus (relevo sobre o piso). */}
            <line
              x1={x0 + 0.5}
              y1={-meiaLargura + 0.6}
              x2={-x0 + 0.5}
              y2={-meiaLargura + 0.6}
              stroke={ESCADINHA_SOMBRA}
              strokeWidth={1.6}
              strokeOpacity={0.6}
            />
            <line
              x1={x0 + 0.5}
              y1={meiaLargura + 0.6}
              x2={-x0 + 0.5}
              y2={meiaLargura + 0.6}
              stroke={ESCADINHA_SOMBRA}
              strokeWidth={1.6}
              strokeOpacity={0.6}
            />
            {rungsSombra}
            {/* Trilhos (lados compridos) */}
            <line
              x1={x0}
              y1={-meiaLargura}
              x2={-x0}
              y2={-meiaLargura}
              stroke={ESCADINHA_COR}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
            <line
              x1={x0}
              y1={meiaLargura}
              x2={-x0}
              y2={meiaLargura}
              stroke={ESCADINHA_COR}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
            {rungs}
            {/* Realce fino no topo dos trilhos (luz). */}
            <line
              x1={x0}
              y1={-meiaLargura - 0.4}
              x2={-x0}
              y2={-meiaLargura - 0.4}
              stroke="#FFF6C2"
              strokeWidth={0.4}
              strokeOpacity={0.7}
            />
          </g>
        </g>
      );
    }

    case "barras": {
      // Mini-barreira para saltos: duas hastes verticais + barra por cima (⊓).
      const largura = 12; // separação entre hastes
      const altura = 9; // altura das hastes
      const topo = -altura / 2;
      const base = altura / 2;
      const meia = largura / 2;
      const BARRAS_SOMBRA = "#1E3A8A"; // azul escuro (relevo/lado sombreado)
      return (
        <g>
          {decoracoes}
          <PecaDefs />
          <g
            transform={`translate(${elemento.x} ${elemento.y}) rotate(${elemento.angulo})`}
          >
            {/* Sombra projetada no chão (aos pés das hastes). */}
            <ellipse
              cx={0}
              cy={base + 0.8}
              rx={meia + 1.5}
              ry={1.6}
              fill="url(#peca-sombra-chao)"
            />
            {/* Contorno escuro (lado sombreado) por baixo → dá volume às barras. */}
            <line x1={-meia + 0.5} y1={topo + 0.5} x2={meia + 0.5} y2={topo + 0.5} stroke={BARRAS_SOMBRA} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={-meia + 0.5} y1={topo} x2={-meia + 0.5} y2={base + 0.4} stroke={BARRAS_SOMBRA} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={meia + 0.5} y1={topo} x2={meia + 0.5} y2={base + 0.4} stroke={BARRAS_SOMBRA} strokeWidth={2.4} strokeLinecap="round" />
            {/* Barra horizontal superior */}
            <line
              x1={-meia}
              y1={topo}
              x2={meia}
              y2={topo}
              stroke={BARRAS_COR}
              strokeWidth={2}
              strokeLinecap="round"
            />
            {/* Hastes verticais */}
            <line
              x1={-meia}
              y1={topo}
              x2={-meia}
              y2={base}
              stroke={BARRAS_COR}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <line
              x1={meia}
              y1={topo}
              x2={meia}
              y2={base}
              stroke={BARRAS_COR}
              strokeWidth={2}
              strokeLinecap="round"
            />
            {/* Realce de luz na barra superior. */}
            <line
              x1={-meia + 1}
              y1={topo - 0.5}
              x2={meia - 1}
              y2={topo - 0.5}
              stroke="#BFDBFE"
              strokeWidth={0.6}
              strokeOpacity={0.8}
              strokeLinecap="round"
            />
          </g>
        </g>
      );
    }

    case "arco": {
      // Aro deitado no chão visto de cima → elipse achatada (perspetiva). Um
      // contorno escuro por baixo garante contraste sobre o relvado (sobretudo
      // para o arco branco).
      const { hex, stroke } = arcoCor(elemento.cor);
      return (
        <g>
          {decoracoes}
          <PecaDefs />
          {/* Sombra do aro no chão → dá-lhe espessura/relevo. */}
          <ellipse cx={elemento.x} cy={elemento.y + 2} rx={9} ry={4} fill="url(#peca-sombra-chao)" opacity={0.55} />
          <ellipse
            cx={elemento.x}
            cy={elemento.y}
            rx={9.5}
            ry={5.5}
            fill="none"
            stroke={stroke}
            strokeWidth={0.8}
          />
          <ellipse
            cx={elemento.x}
            cy={elemento.y}
            rx={9}
            ry={5}
            fill="none"
            stroke={hex}
            strokeWidth={1.5}
          />
          {/* Brilho na parte de cima do aro (reflexo). */}
          <path
            d={`M ${elemento.x - 8.4} ${elemento.y - 1.2} A 9 5 0 0 1 ${elemento.x + 8.4} ${elemento.y - 1.2}`}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.5}
            strokeWidth={0.8}
            strokeLinecap="round"
          />
        </g>
      );
    }
  }
}

// Caminho ondulado (condução de bola)
function pathOndulado(pontos: { x: number; y: number }[]): string {
  if (pontos.length < 2) return pontosParaPath(pontos);
  const segs: string[] = [`M ${pontos[0].x} ${pontos[0].y}`];
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist;
    const ny = dx / dist;
    const ondas = Math.max(2, Math.round(dist / 12));
    for (let k = 1; k <= ondas; k++) {
      const t = k / ondas;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      // As duas últimas ondulações assentam na linha central: assim o segmento
      // final fica alinhado com a direção real do movimento e a ponta da seta
      // (markerEnd, orientada por `orient="auto"` a partir do último segmento)
      // aponta no sentido correto — evita a cabeça "torta" nas setas de condução.
      const amp = k >= ondas - 1 || k % 2 === 0 ? 0 : 3;
      segs.push(`L ${px + nx * amp} ${py + ny * amp}`);
    }
  }
  return segs.join(" ");
}
