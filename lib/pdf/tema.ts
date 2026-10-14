// Tokens visuais partilhados pelos dois pipelines de documentos imprimíveis
// (§8.15 / §12): (1) relatórios HTML server-side dos analíticos
// (`components/pdf/*` → `/api/pdf`) e (2) página de impressão React do treino
// (`components/treinos/TreinoPrintTemplate.tsx`).
//
// Regra de marca (docs/BRAND.md): nos documentos entregues pelo clube, o ACENTO
// é a cor do clube; a marca Mister aparece apenas no rodapé discreto
// ("Gerado com Mister"). Helpers puros (sem `server-only`, sem React) — podem
// ser importados por server components e por strings de HTML.

// Nota: helpers de contraste propositadamente locais (sem dependências) para o
// módulo de impressão ser autónomo; seguem a mesma fórmula WCAG 2.1 do tema da app.

/** Laranja da marca Mister — fallback quando o clube não tem cor válida. */
export const COR_MARCA_PDF = "#F0531E";
/** laranja-600 — fundo sólido AA (texto branco) quando o acento é a marca. */
const COR_MARCA_SOLIDO = "#C7430F";
const BRANCO = "#FFFFFF";
const INK = "#141210";
const AA = 4.5;

/** Normaliza `#rgb`/`#rrggbb` para `#RRGGBB`; inválido → null. */
function normalizar(hex: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return `#${v.toUpperCase()}`;
}

function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Luminância relativa WCAG 2.1 de um `#RRGGBB` normalizado. */
function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rácio de contraste WCAG entre duas cores normalizadas (1 a 21). */
export function contrastePdf(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Escurece (mistura com preto, passos de 1%) até o branco atingir AA sobre a cor. */
function escurecerAteAA(hex: string): string {
  const [r, g, b] = rgb(hex);
  for (let i = 0; i <= 100; i++) {
    const t = 1 - i / 100;
    const c = `#${[r, g, b]
      .map((v) => Math.round(v * t).toString(16).padStart(2, "0"))
      .join("")}`.toUpperCase();
    if (contrastePdf(c, BRANCO) >= AA) return c;
  }
  return "#000000";
}

/** Neutros quentes da marca (docs/BRAND.md §2.2), todos AA sobre branco quando texto. */
export const PDF_NEUTROS = {
  /** Texto principal — preto quente (ink). */
  texto: "#141210",
  /** Texto secundário (rótulos, contexto) — cinza-600, ≈7.9:1 sobre branco. */
  textoSec: "#57514A",
  /** Texto atenuado (zeros, legendas) — ≈5.6:1 sobre branco. */
  muted: "#6C665F",
  /** Bordas e separadores. */
  borda: "#E4E1DB",
  /** Borda mais marcada (cabeçalho de tabela). */
  bordaForte: "#D9D5CE",
  /** Zebra suave das tabelas (cinza-50). */
  zebra: "#F7F5F2",
  /** Fundo do cabeçalho das tabelas. */
  cabecalhoTabela: "#F1EEE9",
  /** Trilho das barras horizontais. */
  trilho: "#EEEBE6",
} as const;

/** Semáforo (assiduidade, resultados) — AA sobre branco. */
export const PDF_SEMAFORO = {
  verde: "#15803D",
  ambar: "#B45309",
  vermelho: "#DC2626",
  cinza: "#57514A",
} as const;

/** Tipografia: corpo/UI em Inter (quando instalada) com fallback de sistema. */
export const PDF_FONTE =
  '"Inter", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';

/** Paleta derivada da cor do clube para um documento imprimível. */
export interface TemaPdf {
  /** Cor do clube normalizada (`#RRGGBB`) — preenchimentos: faixas, barras, filetes. */
  acento: string;
  /** Acento usado como COR DE TEXTO sobre branco — escurecido o mínimo para AA (≥4.5:1). */
  acentoTexto: string;
  /** Fundo sólido para texto sobre a cor do clube (badges, botões) — AA garantido. */
  solidoFundo: string;
  /** Texto sobre `solidoFundo` (branco ou preto quente, pela luminância). */
  solidoTexto: string;
  /** Tinta muito suave do acento (8% sobre branco) — fundos de destaque. */
  acentoSuave: string;
}

/**
 * Deriva o tema do documento a partir da cor primária do clube. Cor ausente ou
 * inválida → laranja da marca Mister (default de `Clube.corPrimaria`).
 */
export function temaPdf(corPrimaria: string | null | undefined): TemaPdf {
  const acento = (corPrimaria && normalizar(corPrimaria)) || COR_MARCA_PDF;
  const acentoTexto = contrastePdf(acento, BRANCO) >= AA ? acento : escurecerAteAA(acento);
  // Fundo sólido: a própria cor com o texto (branco/ink) de maior contraste; se
  // nenhum atingir AA (meios-tons), escurece o mínimo e usa texto branco. A
  // marca usa o laranja-600 com branco (igual ao botão primário da app).
  let solidoFundo = acento;
  let solidoTexto = contrastePdf(acento, BRANCO) >= contrastePdf(acento, INK) ? BRANCO : INK;
  if (acento === COR_MARCA_PDF) {
    solidoFundo = COR_MARCA_SOLIDO;
    solidoTexto = BRANCO;
  } else if (contrastePdf(solidoFundo, solidoTexto) < AA) {
    solidoFundo = escurecerAteAA(acento);
    solidoTexto = BRANCO;
  }
  return { acento, acentoTexto, solidoFundo, solidoTexto, acentoSuave: `${acento}14` };
}

/** Variáveis CSS do tema (para `style` inline em HTML ou React). */
export function variaveisTemaPdf(tema: TemaPdf): Record<string, string> {
  return {
    "--pdf-acento": tema.acento,
    "--pdf-acento-texto": tema.acentoTexto,
    "--pdf-solido": tema.solidoFundo,
    "--pdf-solido-texto": tema.solidoTexto,
    "--pdf-acento-suave": tema.acentoSuave,
  };
}

/** Data curta pt-PT para cabeçalhos/rodapés ("12/10/2026"). */
export function dataCurtaPdf(data: Date): string {
  return data.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Lisbon",
  });
}

/**
 * Regras `@page` comuns: A4, margens de impressão e numeração de páginas
 * ("Página X de Y") nas caixas de margem — suportadas pelo Chromium ≥131; nos
 * restantes browsers a regra é ignorada sem efeitos laterais.
 */
export function cssPaginaPdf(): string {
  return `
  @page {
    size: A4;
    margin: 14mm 14mm 16mm 14mm;
    @bottom-right {
      content: "Página " counter(page) " de " counter(pages);
      font-family: ${PDF_FONTE};
      font-size: 8px;
      color: ${PDF_NEUTROS.muted};
    }
  }`;
}
