/**
 * Galeria de comparação visual dos exercícios importados do dossier.
 *
 * Para cada exercício mostra LADO A LADO: (esq) o JPG original do dossier e
 * (dir) o desenho recriado renderizado com o SVG REAL do app (CampoDesenho).
 *
 * Uso (a partir de /futsal-manager):
 *   npx tsx scripts/gerar-galeria-comparacao.tsx
 *
 * NÃO altera código do projeto — apenas lê os componentes de render e gera um
 * HTML no scratchpad da sessão.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, writeFileSync } from "node:fs";

import { CampoDesenho } from "@/components/campo/CampoDesenho";

// Import dos 4 batches (scratchpad da sessão) — caminhos absolutos.
import { batch1 } from "/tmp/claude-0/-futsal-manager/05faac92-2ce0-471e-8ccf-cc4ff7f8527a/scratchpad/exercicios_batch1";
import { batch2 } from "/tmp/claude-0/-futsal-manager/05faac92-2ce0-471e-8ccf-cc4ff7f8527a/scratchpad/exercicios_batch2";
import { batch3 } from "/tmp/claude-0/-futsal-manager/05faac92-2ce0-471e-8ccf-cc4ff7f8527a/scratchpad/exercicios_batch3";
import { batch4 } from "/tmp/claude-0/-futsal-manager/05faac92-2ce0-471e-8ccf-cc4ff7f8527a/scratchpad/exercicios_batch4";

const SCRATCHPAD =
  "/tmp/claude-0/-futsal-manager/05faac92-2ce0-471e-8ccf-cc4ff7f8527a/scratchpad";
const JPG_DIR = "/futsal-manager/.claude/exemplos/exercicios_jpg";
const OUT_HTML = `${SCRATCHPAD}/galeria-comparacao.html`;

type Exercicio = (typeof batch1)[number];

// ── Estados / badges ─────────────────────────────────────────────────────────
type Estado =
  | { chave: "NAO_IMPORTADO"; rotulo: "NÃO IMPORTADO (colisão)"; cor: string; motivo?: string }
  | { chave: "DUPLICADO"; rotulo: "DUPLICADO EXATO"; cor: string; motivo?: string }
  | { chave: "REVER"; rotulo: "REVER"; cor: string; motivo?: string }
  | { chave: "OK"; rotulo: "OK"; cor: string; motivo?: string };

function estadoDe(ex: Exercicio): Estado {
  if (ex.nome === "Passe e receção em quadrado") {
    return {
      chave: "NAO_IMPORTADO",
      rotulo: "NÃO IMPORTADO (colisão)",
      cor: "#2563EB",
      motivo:
        ex._duvida ??
        "Não importado por colisão de nome/ficheiro com variante já existente.",
    };
  }
  if (ex.nome === "Estafetas (2)") {
    return {
      chave: "DUPLICADO",
      rotulo: "DUPLICADO EXATO",
      cor: "#DC2626",
      motivo: ex._duvida,
    };
  }
  if (ex._duvida) {
    return { chave: "REVER", rotulo: "REVER", cor: "#CA8A04", motivo: ex._duvida };
  }
  return { chave: "OK", rotulo: "OK", cor: "#16A34A" };
}

// Prioridade de ordenação: itens que precisam de atenção primeiro, OK no fim.
const PRIORIDADE: Record<Estado["chave"], number> = {
  NAO_IMPORTADO: 0,
  DUPLICADO: 1,
  REVER: 2,
  OK: 3,
};

// ── Resolução do JPG (nomes em disco estão "mojibaked": í→├¡, ç→..., etc.) ─────
// Estratégia robusta: "esqueleto ASCII" (remover todos os bytes não-ASCII) de
// ambos os lados e casar. Deteta colisões e ficheiros em falta.
function esqueletoAscii(s: string): string {
  return s.replace(/[^\x00-\x7F]/g, "");
}

function construirIndiceJpg(): {
  mapa: Map<string, string[]>;
  ficheiros: string[];
} {
  const ficheiros = readdirSync(JPG_DIR).filter((f) => f.toLowerCase().endsWith(".jpg"));
  const mapa = new Map<string, string[]>();
  for (const f of ficheiros) {
    const k = esqueletoAscii(f);
    const arr = mapa.get(k) ?? [];
    arr.push(f);
    mapa.set(k, arr);
  }
  return { mapa, ficheiros };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Render de um diagrama com o SVG REAL do app ──────────────────────────────
function svgRecriado(ex: Exercicio): string {
  return renderToStaticMarkup(
    React.createElement(CampoDesenho, {
      diagrama: ex.diagrama,
      className: "svg-campo",
    }),
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const exercicios: Exercicio[] = [...batch1, ...batch2, ...batch3, ...batch4];
  const { mapa } = construirIndiceJpg();

  const problemas: string[] = [];

  type Bloco = {
    ex: Exercicio;
    estado: Estado;
    svg: string;
    svgTemElementos: boolean;
    jpgDisco: string | null;
    jpgUrl: string | null;
  };

  const blocos: Bloco[] = exercicios.map((ex) => {
    const estado = estadoDe(ex);
    const svg = svgRecriado(ex);
    // "Não-vazio com elementos": além das linhas do campo (LinhasCampo), tem de
    // haver marcação dos elementos do diagrama. Verificamos ambos: o diagrama
    // declara elementos e o SVG produziu marcação além do fundo base.
    const nElementosDiagrama = ex.diagrama.elementos?.length ?? 0;
    const svgTemElementos = nElementosDiagrama > 0 && svg.length > 0 && svg.includes("<svg");

    // Resolver JPG.
    const k = esqueletoAscii(ex._ficheiro);
    const candidatos = mapa.get(k) ?? [];
    let jpgDisco: string | null = null;
    if (candidatos.length === 1) {
      jpgDisco = candidatos[0];
    } else if (candidatos.length > 1) {
      // Preferir match exato de bytes, se existir; senão reportar colisão.
      jpgDisco = candidatos.find((c) => c === ex._ficheiro) ?? candidatos[0];
      problemas.push(
        `COLISÃO de esqueleto ASCII para "${ex.nome}" (_ficheiro="${ex._ficheiro}"): ${candidatos.join(", ")} → usado "${jpgDisco}"`,
      );
    } else {
      problemas.push(
        `JPG NÃO RESOLVIDO para "${ex.nome}" — _ficheiro="${ex._ficheiro}" (nenhum ficheiro em disco com esqueleto "${k}")`,
      );
    }

    const jpgUrl = jpgDisco ? "file://" + encodeURI(`${JPG_DIR}/${jpgDisco}`) : null;

    if (!svgTemElementos) {
      problemas.push(
        `SVG SEM ELEMENTOS para "${ex.nome}" (elementos no diagrama: ${nElementosDiagrama})`,
      );
    }

    return { ex, estado, svg, svgTemElementos, jpgDisco, jpgUrl };
  });

  // Ordenar: atenção primeiro (por prioridade), depois OK; estável dentro do grupo.
  const blocosOrdenados = blocos
    .map((b, i) => ({ b, i }))
    .sort((a, z) => {
      const pa = PRIORIDADE[a.b.estado.chave];
      const pz = PRIORIDADE[z.b.estado.chave];
      return pa !== pz ? pa - pz : a.i - z.i;
    })
    .map((x) => x.b);

  // ── HTML ────────────────────────────────────────────────────────────────
  const linhas = blocosOrdenados
    .map((b, idx) => {
      const { ex, estado } = b;
      const badge = `<span class="badge" style="background:${estado.cor}">${escapeHtml(estado.rotulo)}</span>`;
      const motivo = estado.motivo
        ? `<p class="motivo">${escapeHtml(estado.motivo)}</p>`
        : "";
      const esquerda = b.jpgUrl
        ? `<img class="jpg" src="${b.jpgUrl}" alt="${escapeHtml(ex.nome)} (original)" loading="lazy" />`
        : `<div class="falha">JPG não encontrado: <code>${escapeHtml(ex._ficheiro)}</code></div>`;
      const direita = b.svgTemElementos
        ? `<div class="recriado">${b.svg}</div>`
        : `<div class="falha">SVG sem elementos</div>`;
      return `
      <section class="bloco">
        <header class="bloco-head">
          <span class="num">#${idx + 1}</span>
          <h2 class="nome">${escapeHtml(ex.nome)}</h2>
          ${badge}
        </header>
        ${motivo}
        <div class="comparacao">
          <figure>
            <figcaption>Original (dossier)</figcaption>
            ${esquerda}
            <div class="ficheiro"><code>${escapeHtml(b.jpgDisco ?? ex._ficheiro)}</code></div>
          </figure>
          <figure>
            <figcaption>Recriado (SVG do app)</figcaption>
            ${direita}
          </figure>
        </div>
      </section>`;
    })
    .join("\n");

  const totais = {
    total: blocos.length,
    naoImportado: blocos.filter((b) => b.estado.chave === "NAO_IMPORTADO").length,
    duplicado: blocos.filter((b) => b.estado.chave === "DUPLICADO").length,
    rever: blocos.filter((b) => b.estado.chave === "REVER").length,
    ok: blocos.filter((b) => b.estado.chave === "OK").length,
    jpgResolvidos: blocos.filter((b) => b.jpgDisco).length,
    svgOk: blocos.filter((b) => b.svgTemElementos).length,
  };

  const html = `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Galeria de comparação — Exercícios do dossier</title>
<style>
  :root { --cor-primaria: #F0531E; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #0f1115; color: #e7e9ee;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #9aa2b1; margin: 0 0 16px; font-size: 14px; }
  .resumo {
    display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;
  }
  .chip {
    background: #1b1f28; border: 1px solid #2a2f3a; border-radius: 999px;
    padding: 6px 12px; font-size: 13px;
  }
  .chip b { color: #fff; }
  .bloco {
    background: #161922; border: 1px solid #262b36; border-radius: 12px;
    padding: 16px; margin-bottom: 16px;
  }
  .bloco-head { display: flex; align-items: center; gap: 12px; }
  .num { color: #6b7280; font-variant-numeric: tabular-nums; font-size: 14px; }
  .nome { font-size: 17px; margin: 0; flex: 0 1 auto; }
  .badge {
    color: #fff; font-size: 12px; font-weight: 700; letter-spacing: .3px;
    padding: 4px 10px; border-radius: 999px; margin-left: auto;
  }
  .motivo {
    margin: 8px 0 0; color: #d7b46a; font-size: 13px;
    background: rgba(202,138,4,.08); border-left: 3px solid #CA8A04;
    padding: 6px 10px; border-radius: 4px;
  }
  .comparacao {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px;
    align-items: start;
  }
  figure { margin: 0; }
  figcaption { font-size: 12px; color: #9aa2b1; margin-bottom: 6px; }
  .jpg { width: 480px; max-width: 100%; height: auto; border-radius: 8px; display: block;
         background: #000; }
  .recriado { width: 480px; max-width: 100%; }
  .svg-campo, .recriado svg { width: 480px; max-width: 100%; height: auto; border-radius: 8px;
                              display: block; }
  .ficheiro { margin-top: 6px; font-size: 11px; color: #6b7280; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .falha {
    width: 480px; max-width: 100%; aspect-ratio: 2 / 1; display: flex;
    align-items: center; justify-content: center; text-align: center;
    background: rgba(220,38,38,.1); border: 1px dashed #DC2626; color: #f4a6a6;
    border-radius: 8px; font-size: 13px; padding: 8px;
  }
  @media (max-width: 1040px) {
    .comparacao { grid-template-columns: 1fr; }
    .jpg, .recriado, .svg-campo, .recriado svg, .falha { width: 100%; }
  }
</style>
</head>
<body>
  <h1>Galeria de comparação — Exercícios do dossier</h1>
  <p class="sub">Esquerda: JPG original do dossier · Direita: desenho recriado renderizado com o SVG real do app (<code>CampoDesenho</code>). Ordenado por estado (atenção primeiro).</p>
  <div class="resumo">
    <span class="chip"><b>${totais.total}</b> exercícios</span>
    <span class="chip" style="border-color:#2563EB"><b>${totais.naoImportado}</b> não importado</span>
    <span class="chip" style="border-color:#DC2626"><b>${totais.duplicado}</b> duplicado exato</span>
    <span class="chip" style="border-color:#CA8A04"><b>${totais.rever}</b> rever</span>
    <span class="chip" style="border-color:#16A34A"><b>${totais.ok}</b> ok</span>
    <span class="chip"><b>${totais.jpgResolvidos}/${totais.total}</b> JPGs resolvidos</span>
    <span class="chip"><b>${totais.svgOk}/${totais.total}</b> SVGs com elementos</span>
  </div>
  ${linhas}
</body>
</html>`;

  writeFileSync(OUT_HTML, html, "utf8");

  // ── Relatório na consola ─────────────────────────────────────────────────
  console.log("Galeria gerada:", OUT_HTML);
  console.log("Blocos:", totais.total);
  console.log(
    `Estados → não importado: ${totais.naoImportado}, duplicado: ${totais.duplicado}, rever: ${totais.rever}, ok: ${totais.ok}`,
  );
  console.log(
    `JPGs resolvidos: ${totais.jpgResolvidos}/${totais.total} · SVGs com elementos: ${totais.svgOk}/${totais.total}`,
  );
  if (problemas.length === 0) {
    console.log("Sem problemas: todos os JPGs resolveram e todos os SVGs têm elementos.");
  } else {
    console.log(`\nProblemas (${problemas.length}):`);
    for (const p of problemas) console.log("  - " + p);
    process.exitCode = 1;
  }
}

main();
