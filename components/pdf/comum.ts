// Blocos partilhados dos relatórios imprimíveis dos analíticos (Dossier do Treinador).
//
// Estratégia serverless-safe: em vez de gerar um binário PDF com um motor nativo
// (WASM/Yoga do `@react-pdf/renderer`, incompatível com o runtime serverless da
// Vercel), o route handler `/api/pdf` devolve um documento HTML auto-contido,
// otimizado para impressão A4, que o browser converte em PDF via "Guardar como
// PDF". Sem dependências externas, sem WASM, 100% compatível com serverless.
//
// Estes helpers produzem STRINGS de HTML (não React/DOM) e são usados apenas no
// pipeline server-side (`lib/pdf/gerar-pdf.ts` → route handler).

/** Laranja da marca Mister (fallback quando o clube não tem cor válida). */
export const COR_MARCA = "#F0531E";

/** Identidade visual do clube injetada nos relatórios. */
export interface MarcaClube {
  nome: string;
  epoca: string;
  corPrimaria: string;
  /** Logótipo já carregado como data URI (`data:image/...`) ou null. */
  logo: string | null;
}

/** Garante um hex #RRGGBB válido; caso contrário devolve a cor da marca. */
export function corValida(hex: string | null | undefined): string {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : COR_MARCA;
}

/** Taxa 0–1 → percentagem inteira ("0.83" → "83%"). */
export function pct(taxa: number): string {
  return `${Math.round(taxa * 100)}%`;
}

/** Número com uma casa decimal ("2.5"). */
export function n1(n: number): string {
  return n.toFixed(1);
}

/** Minutos acumulados → "123'". */
export function minutos(n: number): string {
  return `${Math.round(n)}'`;
}

/**
 * Escapa texto para inserção segura em HTML (nomes de atletas/clube/escalão são
 * dados de utilizador). Previne qualquer injeção no documento imprimível.
 */
export function esc(texto: unknown): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Folha de estilos do relatório (print A4 + pré-visualização em ecrã). */
const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: #1A1A1A;
    font-size: 11px;
    line-height: 1.4;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: A4; margin: 14mm 12mm; }

  /* Barra de ação (apenas em ecrã; nunca sai no PDF) */
  .barra-acoes {
    position: sticky;
    top: 0;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 12px 16px;
    background: #ffffff;
    border-bottom: 1px solid #E5E7EB;
    z-index: 10;
  }
  .barra-acoes button {
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    border: none;
    border-radius: 8px;
    padding: 10px 18px;
    min-height: 44px;
    color: #ffffff;
  }
  .barra-acoes .secundario {
    background: #F3F4F6;
    color: #1A1A1A;
    border: 1px solid #E5E7EB;
  }

  .folha { padding: 0; }

  /* Cabeçalho */
  .cabecalho {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #F0531E;
    padding-bottom: 12px;
    margin-bottom: 18px;
  }
  .cabecalho-esq { display: flex; align-items: center; gap: 12px; }
  .logo { width: 44px; height: 44px; object-fit: contain; }
  .logo-placeholder {
    width: 44px; height: 44px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 20px; font-weight: 700;
  }
  .clube-nome { font-size: 15px; font-weight: 700; }
  .clube-epoca { font-size: 9px; color: #6B7280; margin-top: 2px; }
  .cabecalho-dir { text-align: right; }
  .titulo-doc { font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .subtitulo-doc { font-size: 9px; color: #6B7280; margin-top: 2px; }

  /* Secções */
  .seccao { margin-bottom: 16px; page-break-inside: avoid; }
  .seccao-titulo {
    font-size: 8px; font-weight: 700; color: #6B7280;
    text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;
  }

  /* KPIs */
  .kpi-linha { display: flex; gap: 10px; }
  .kpi-cartao {
    flex: 1; border: 1px solid #E5E7EB; border-radius: 6px; padding: 10px;
  }
  .kpi-valor { font-size: 22px; font-weight: 700; }
  .kpi-rotulo { font-size: 8px; color: #6B7280; margin-top: 2px; text-transform: uppercase; }

  /* Tabelas */
  table { width: 100%; border-collapse: collapse; border: 1px solid #E5E7EB; border-radius: 4px; }
  thead th {
    background: #F9FAFB; padding: 6px; font-size: 7px; font-weight: 700;
    color: #6B7280; text-transform: uppercase; text-align: center;
    border-bottom: 1px solid #E5E7EB;
  }
  thead th.esq { text-align: left; }
  tbody td { padding: 5px 6px; font-size: 8px; text-align: center; border-bottom: 1px solid #E5E7EB; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) { background: #F9FAFB; }
  td.esq { text-align: left; }
  .destaque { font-weight: 700; }
  .vazio { color: #6B7280; text-align: left; }

  /* Barras (golos / rankings) */
  .barra-linha { display: flex; align-items: center; margin-bottom: 5px; gap: 6px; }
  .barra-rotulo { width: 120px; font-size: 8px; }
  .barra-trilho { flex: 1; height: 10px; background: #E5E7EB; border-radius: 3px; overflow: hidden; }
  .barra-preenchida { height: 10px; border-radius: 3px; }
  .barra-valor { width: 34px; font-size: 8px; text-align: right; font-weight: 700; }

  .nota { font-size: 7px; color: #6B7280; margin-top: 6px; }

  /* Rodapé */
  .rodape {
    display: flex; justify-content: space-between;
    font-size: 7px; color: #6B7280;
    margin-top: 24px; padding-top: 8px; border-top: 1px solid #E5E7EB;
  }

  @media screen {
    body { background: #F3F4F6; }
    .folha {
      max-width: 210mm; margin: 16px auto; background: #ffffff;
      padding: 16mm 14mm; box-shadow: 0 1px 4px rgba(0,0,0,0.12);
    }
  }
  @media print {
    .barra-acoes { display: none !important; }
    body { background: #ffffff; }
    .folha { max-width: none; margin: 0; padding: 0; box-shadow: none; }
    .rodape { position: fixed; bottom: 0; left: 0; right: 0; }
  }
`;

/** Cabeçalho comum: logótipo + nome/época do clube (esq.) e título do doc (dir.). */
export function cabecalhoHtml(marca: MarcaClube, titulo: string, subtitulo: string): string {
  const cor = corValida(marca.corPrimaria);
  const logo = marca.logo
    ? `<img class="logo" src="${esc(marca.logo)}" alt="">`
    : `<div class="logo-placeholder" style="background:${cor}">${esc(
        (marca.nome[0] ?? "?").toUpperCase(),
      )}</div>`;
  return `
    <div class="cabecalho" style="border-bottom-color:${cor}">
      <div class="cabecalho-esq">
        ${logo}
        <div>
          <div class="clube-nome">${esc(marca.nome)}</div>
          <div class="clube-epoca">Época ${esc(marca.epoca)}</div>
        </div>
      </div>
      <div class="cabecalho-dir">
        <div class="titulo-doc" style="color:${cor}">${esc(titulo)}</div>
        <div class="subtitulo-doc">${esc(subtitulo)}</div>
      </div>
    </div>`;
}

/** Rodapé com a origem do documento e a data de geração. */
export function rodapeHtml(geradoEm: Date): string {
  const data = geradoEm.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `
    <div class="rodape">
      <span>Mister · Dossier do Treinador</span>
      <span>Gerado a ${esc(data)}</span>
    </div>`;
}

/** Cartão de KPI grande (valor destacado na cor do clube). */
export function kpiHtml(valor: string, rotulo: string, cor: string): string {
  return `
    <div class="kpi-cartao">
      <div class="kpi-valor" style="color:${cor}">${esc(valor)}</div>
      <div class="kpi-rotulo">${esc(rotulo)}</div>
    </div>`;
}

/** Barra horizontal proporcional ao máximo (ranking / golos). */
export function barraHtml(
  rotulo: string,
  valor: number,
  maximo: number,
  cor: string,
  formatar: (v: number) => string = (v) => String(v),
): string {
  const largura = maximo > 0 ? Math.max(2, Math.round((valor / maximo) * 100)) : 0;
  return `
    <div class="barra-linha">
      <span class="barra-rotulo">${esc(rotulo)}</span>
      <div class="barra-trilho">
        <div class="barra-preenchida" style="width:${largura}%;background:${cor}"></div>
      </div>
      <span class="barra-valor">${esc(formatar(valor))}</span>
    </div>`;
}

/**
 * Empacota o corpo do relatório num documento HTML auto-contido e imprimível.
 * Inclui a barra de ação (só em ecrã) e um script que abre o diálogo de
 * impressão automaticamente ao carregar (com um pequeno atraso para garantir
 * layout e imagens prontos antes de imprimir).
 */
export function documentoHtml(titulo: string, corpo: string): string {
  return `<!DOCTYPE html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="barra-acoes">
  <button type="button" class="secundario" onclick="window.close()">Fechar</button>
  <button type="button" id="btn-imprimir" style="background:${COR_MARCA}" onclick="window.print()">Guardar como PDF</button>
</div>
<div class="folha">
${corpo}
</div>
<script>
  window.addEventListener('load', function () {
    setTimeout(function () { window.print(); }, 350);
  });
</script>
</body>
</html>`;
}
