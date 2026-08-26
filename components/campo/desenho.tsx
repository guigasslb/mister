import { FormatoJogo } from "@prisma/client";
import type { ElementoCampo, TamanhoEscadinha } from "@/lib/schemas/exercicio";
import { ancoraElemento, rotuloElemento } from "./animacao";

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
const RELVA = "#0E7A3C";
const TRACO = 1.5;
const MEIO_Y = CAMPO_H / 2;

/** Relvado + contorno + linha de meio-campo + marca central (comum a todos). */
function Relvado() {
  return (
    <>
      <rect x={0} y={0} width={CAMPO_W} height={CAMPO_H} fill={RELVA} />
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
  return (
    <g stroke={BRANCO} strokeWidth={TRACO} fill="none">
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

// ─── Render de um elemento ───────────────────────────────────────────────────

export function ElementoSVG({
  elemento,
  selecionado,
  focado,
  raioHit = 0,
  onFocarHit,
}: {
  elemento: ElementoCampo;
  selecionado?: boolean;
  focado?: boolean;
  // Raio (em unidades) do círculo de hit/toque invisível. 0 = read-only.
  raioHit?: number;
  onFocarHit?: (id: string) => void;
}) {
  // B3: para setas/linhas o anel usa o primeiro ponto do trajecto (não (0,0)).
  const ancora = ancoraElemento(elemento);
  const temPonto = "x" in elemento && "y" in elemento;

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

  const decoracoes = (
    <>
      {hit}
      {anelSelecao}
      {anelFoco}
    </>
  );

  switch (elemento.tipo) {
    case "jogador":
      return (
        <g>
          {decoracoes}
          <circle
            cx={elemento.x}
            cy={elemento.y}
            r={8}
            fill={corParaHex(elemento.cor)}
            stroke="#FFFFFF"
            strokeWidth={1.5}
          />
          {elemento.numero != null && (
            <text
              x={elemento.x}
              y={elemento.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={8}
              fontWeight={700}
              fill="#FFFFFF"
            >
              {elemento.numero}
            </text>
          )}
        </g>
      );

    case "bola":
      return (
        <g>
          {decoracoes}
          <circle
            cx={elemento.x}
            cy={elemento.y}
            r={4}
            fill="#FFFFFF"
            stroke="#1A1D29"
            strokeWidth={1}
          />
          <circle cx={elemento.x} cy={elemento.y} r={1.5} fill="#1A1D29" />
        </g>
      );

    case "cone": {
      const { hex, stroke } = coneCor(elemento.cor);
      return (
        <g>
          {decoracoes}
          <polygon
            points={`${elemento.x},${elemento.y - 7} ${elemento.x - 5},${elemento.y + 5} ${elemento.x + 5},${elemento.y + 5}`}
            fill={hex}
            stroke={stroke}
            strokeWidth={0.8}
          />
        </g>
      );
    }

    case "baliza": {
      const horizontal = elemento.orientacao === "horizontal";
      const w = horizontal ? 30 : 6;
      const h = horizontal ? 6 : 30;
      return (
        <g>
          {decoracoes}
          <rect
            x={elemento.x - w / 2}
            y={elemento.y - h / 2}
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
      const d = isConducao
        ? pathOndulado(elemento.pontos)
        : pontosParaPath(elemento.pontos);
      const markerId = `seta-${elemento.id}`;
      const cor = corParaHex(elemento.cor);
      return (
        <g>
          {decoracoes}
          <defs>
            <SetaMarker id={markerId} cor={cor} />
          </defs>
          <path
            d={d}
            fill="none"
            stroke={cor}
            strokeWidth={2}
            strokeDasharray={dash}
            markerEnd={`url(#${markerId})`}
          />
        </g>
      );
    }

    case "linha":
      return (
        <g>
          {decoracoes}
          <path
            d={pontosParaPath(elemento.pontos)}
            fill="none"
            stroke={corParaHex(elemento.cor)}
            strokeWidth={1.5}
          />
        </g>
      );

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
      const rungs = [];
      for (let i = 0; i <= degraus; i++) {
        const rx = x0 + i * cell;
        rungs.push(
          <line
            key={i}
            x1={rx}
            y1={-meiaLargura}
            x2={rx}
            y2={meiaLargura}
            stroke={ESCADINHA_COR}
            strokeWidth={1}
          />,
        );
      }
      return (
        <g>
          {decoracoes}
          <g
            transform={`translate(${elemento.x} ${elemento.y}) rotate(${elemento.angulo})`}
          >
            {/* Trilhos (lados compridos) */}
            <line
              x1={x0}
              y1={-meiaLargura}
              x2={-x0}
              y2={-meiaLargura}
              stroke={ESCADINHA_COR}
              strokeWidth={1.4}
            />
            <line
              x1={x0}
              y1={meiaLargura}
              x2={-x0}
              y2={meiaLargura}
              stroke={ESCADINHA_COR}
              strokeWidth={1.4}
            />
            {rungs}
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
      return (
        <g>
          {decoracoes}
          <g
            transform={`translate(${elemento.x} ${elemento.y}) rotate(${elemento.angulo})`}
          >
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
          </g>
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
