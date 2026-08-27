// Blocos partilhados dos relatórios imprimíveis dos analíticos (Dossier do Treinador).
//
// Estratégia serverless-safe: em vez de gerar um binário PDF com um motor nativo
// (WASM/Yoga do `@react-pdf/renderer`, incompatível com o runtime serverless da
// Vercel), o route handler `/api/pdf` devolve um documento HTML auto-contido,
// otimizado para impressão A4, que o browser converte em PDF via "Guardar como
// PDF". Sem dependências externas, sem WASM, 100% compatível com serverless.
//
// Estes helpers produzem STRINGS de HTML (não React/DOM) e são usados apenas no
// pipeline server-side (`lib/pdf/gerar-pdf.ts` → route handler). O design replica
// os relatórios de referência do clube (cabeçalho com escudo + nome, tabelas
// limpas, valores destacados na cor do clube, percentagens semáforo verde/âmbar/
// vermelho).

/** Laranja da marca Mister (fallback quando o clube não tem cor válida). */
export const COR_MARCA = "#F0531E";

/** Paleta neutra do relatório. */
export const COR_TEXTO = "#141414";
export const COR_MUTED = "#6B7280";
export const COR_BORDA = "#E5E7EB";
export const COR_ZERO = "#9CA3AF";

/** Semáforo de percentagens (assiduidade, resultados). AA sobre branco. */
export const COR_VERDE = "#15803D";
export const COR_AMBAR = "#B45309";
export const COR_VERMELHO = "#DC2626";
export const COR_CINZA = "#6B7280";

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

/** Cor semáforo de uma taxa 0–1: verde (≥75%), âmbar (≥50%), vermelho (<50%). */
export function corPercentagem(taxa: number): string {
  if (taxa >= 0.75) return COR_VERDE;
  if (taxa >= 0.5) return COR_AMBAR;
  return COR_VERMELHO;
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
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: ${COR_TEXTO};
    font-size: 11px;
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: A4; margin: 15mm; }

  /* Barra de ação (apenas em ecrã; nunca sai no PDF) */
  .barra-acoes {
    position: sticky;
    top: 0;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 12px 16px;
    background: #ffffff;
    border-bottom: 1px solid ${COR_BORDA};
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
    color: ${COR_TEXTO};
    border: 1px solid ${COR_BORDA};
  }

  .folha { padding: 0; }

  /* ── Cabeçalho ─────────────────────────────────────────────── */
  .cabecalho {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 14px;
    border-bottom: 1px solid #D1D5DB;
    margin-bottom: 20px;
  }
  .cab-esq { display: flex; align-items: center; gap: 14px; }
  .cab-logo { width: 56px; height: 56px; object-fit: contain; }
  .cab-logo-ph {
    width: 56px; height: 56px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 26px; font-weight: 800;
  }
  .cab-nome { font-size: 22px; font-weight: 800; letter-spacing: -0.4px; line-height: 1.1; }
  .cab-tag { font-size: 10px; color: ${COR_MUTED}; margin-top: 3px; }
  .cab-dir { text-align: right; }
  .cab-titulo { font-size: 15px; font-weight: 400; color: ${COR_MUTED}; }
  .cab-sub { font-size: 15px; font-weight: 800; color: ${COR_TEXTO}; margin-top: 1px; }

  /* ── Marca grande (relatório geral) ────────────────────────── */
  .marca-grande { margin: 4px 0 22px; }
  .marca-logo { width: 132px; height: 132px; object-fit: contain; display: block; }
  .marca-logo-ph {
    width: 132px; height: 132px; border-radius: 18px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 62px; font-weight: 800;
  }
  .marca-nome {
    font-size: 26px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.5px; margin-top: 14px; line-height: 1.1;
  }

  /* ── Secções ───────────────────────────────────────────────── */
  .seccao { margin-bottom: 22px; page-break-inside: avoid; }
  .bloco-titulo {
    font-size: 16px; font-weight: 700; color: ${COR_TEXTO};
    padding-bottom: 6px; border-bottom: 1px solid ${COR_BORDA}; margin-bottom: 14px;
  }
  .banda-sub {
    font-size: 10px; font-weight: 700; color: ${COR_MUTED};
    text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px;
  }

  /* ── KPIs em faixa (relatório geral) ───────────────────────── */
  .kpi-faixa {
    display: flex; border: 1px solid ${COR_BORDA};
    border-radius: 12px; overflow: hidden;
  }
  .kpi-cel {
    flex: 1; padding: 16px 14px; border-right: 1px solid ${COR_BORDA};
  }
  .kpi-cel:last-child { border-right: none; }
  .kpi-num { font-size: 38px; font-weight: 800; line-height: 1; }
  .kpi-num-sub { font-size: 11px; font-weight: 700; color: ${COR_MUTED}; margin-top: 3px; }
  .kpi-lbl { font-size: 11px; color: ${COR_MUTED}; margin-top: 7px; }

  /* ── Grelha mensal de treinos ──────────────────────────────── */
  .meses-grelha {
    display: grid; grid-template-columns: repeat(6, 1fr);
    border: 1px solid ${COR_BORDA}; border-radius: 12px; overflow: hidden;
  }
  .mes-cel {
    padding: 12px 8px; text-align: center;
    border-right: 1px solid ${COR_BORDA}; border-bottom: 1px solid ${COR_BORDA};
  }
  .mes-num { font-size: 24px; font-weight: 800; line-height: 1; }
  .mes-lbl { font-size: 9px; color: ${COR_MUTED}; margin-top: 5px; text-transform: capitalize; }

  /* ── Tabelas ───────────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; }
  thead th {
    background: #F3F4F6; padding: 7px 8px; font-size: 8px; font-weight: 700;
    color: ${COR_MUTED}; text-transform: uppercase; letter-spacing: 0.4px;
    text-align: center; border-bottom: 1px solid #D1D5DB;
  }
  thead th.esq { text-align: left; }
  thead th.grupo {
    background: #ffffff; color: ${COR_TEXTO}; font-size: 9px;
    border-bottom: 1px solid ${COR_BORDA};
  }
  tbody td {
    padding: 6px 8px; font-size: 9px; text-align: center;
    border-bottom: 1px solid ${COR_BORDA};
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) { background: #FAFAFA; }
  td.esq { text-align: left; }
  .destaque { font-weight: 700; }
  .zero { color: ${COR_ZERO}; }
  .vazio { color: ${COR_MUTED}; text-align: left; padding: 12px 8px; }
  .tabela-caixa { border: 1px solid ${COR_BORDA}; border-radius: 12px; overflow: hidden; }

  /* ── Barras (golos por escalão) ────────────────────────────── */
  .barra-linha { display: flex; align-items: center; margin-bottom: 8px; gap: 10px; }
  .barra-rotulo { width: 130px; font-size: 9px; font-weight: 600; }
  .barra-trilho { flex: 1; height: 14px; background: #EEF0F2; border-radius: 4px; overflow: hidden; }
  .barra-preenchida { height: 14px; border-radius: 4px; }
  .barra-valor { width: 40px; font-size: 10px; text-align: right; font-weight: 800; }

  .nota { font-size: 9px; color: ${COR_MUTED}; margin-top: 10px; }

  /* ── Rodapé ────────────────────────────────────────────────── */
  .rodape {
    display: flex; justify-content: space-between;
    font-size: 8px; color: ${COR_MUTED};
    margin-top: 28px; padding-top: 10px; border-top: 1px solid ${COR_BORDA};
  }
  .rodape strong { color: ${COR_TEXTO}; font-weight: 700; }

  @media screen {
    body { background: #F3F4F6; }
    .folha {
      max-width: 210mm; margin: 16px auto; background: #ffffff;
      padding: 15mm; box-shadow: 0 1px 6px rgba(0,0,0,0.14);
    }
  }
  @media print {
    .barra-acoes { display: none !important; }
    body { background: #ffffff; }
    .folha { max-width: none; margin: 0; padding: 0; box-shadow: none; }
  }
`;

/**
 * Cabeçalho comum: escudo + nome do clube e tagline (esq.) e o título do
 * documento com o clube/época (dir.), separados por uma linha divisória.
 */
export function cabecalhoHtml(marca: MarcaClube, titulo: string, linha: string): string {
  const cor = corValida(marca.corPrimaria);
  const logo = marca.logo
    ? `<img class="cab-logo" src="${esc(marca.logo)}" alt="">`
    : `<div class="cab-logo-ph" style="background:${cor}">${esc(
        (marca.nome.trim()[0] ?? "?").toUpperCase(),
      )}</div>`;
  return `
    <div class="cabecalho">
      <div class="cab-esq">
        ${logo}
        <div>
          <div class="cab-nome">${esc(marca.nome)}</div>
          <div class="cab-tag">Dossier do Treinador</div>
        </div>
      </div>
      <div class="cab-dir">
        <div class="cab-titulo">${esc(titulo)}</div>
        <div class="cab-sub">${esc(linha)}</div>
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
      <span><strong>Mister</strong> · Dossier do Treinador</span>
      <span>Gerado a ${esc(data)}</span>
    </div>`;
}

/** Barra horizontal proporcional ao máximo (golos por escalão). */
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
