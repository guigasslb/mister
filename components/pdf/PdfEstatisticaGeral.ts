// Relatório imprimível — Estatísticas gerais (Dossier do Treinador, ref. PDF 2).
//
// Visão global do clube na época, no layout do relatório de referência: escudo
// grande + nome do clube em maiúsculas, bloco "Geral" (KPIs grandes), bloco
// "Resultados" (V/E/D com semáforo + percentagens), tabela por escalão e um
// gráfico de barras de golos marcados por escalão. Alimentado pelo
// AnaliticoClubeEpoca já calculado — zero recálculo.
//
// Produz uma STRING de HTML imprimível (ver `comum.ts`); usado só server-side.

import type { AnaliticoClubeEpoca } from "@/lib/actions/analise";
import {
  cabecalhoHtml,
  rodapeHtml,
  documentoHtml,
  barraHtml,
  corValida,
  corPercentagem,
  esc,
  pct,
  COR_TEXTO,
  COR_VERDE,
  COR_CINZA,
  COR_VERMELHO,
  type MarcaClube,
} from "./comum";

/** Título do documento (usado como nome sugerido em "Guardar como PDF"). */
export function tituloEstatisticaGeral(dados: AnaliticoClubeEpoca): string {
  return `Estatísticas gerais — ${dados.clube.nome}`;
}

/** Percentagem inteira de `parte` sobre `total` ("0%" quando total = 0). */
function pctDe(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)}%` : "0%";
}

/** Escudo grande do clube (data URI) ou placeholder colorido com a inicial. */
function marcaGrandeHtml(marca: MarcaClube, cor: string): string {
  const logo = marca.logo
    ? `<img class="marca-logo" src="${esc(marca.logo)}" alt="">`
    : `<div class="marca-logo-ph" style="background:${cor}">${esc(
        (marca.nome.trim()[0] ?? "?").toUpperCase(),
      )}</div>`;
  return `
    <div class="marca-grande">
      ${logo}
      <div class="marca-nome">${esc(marca.nome)}</div>
    </div>`;
}

/** Uma célula de KPI grande (número + label; cor e subtexto opcionais). */
function kpiCel(num: string, label: string, cor: string, sub?: string): string {
  const subHtml = sub ? ` <span class="kpi-num-sub">${esc(sub)}</span>` : "";
  return `
    <div class="kpi-cel">
      <div class="kpi-num" style="color:${cor}">${esc(num)}${subHtml}</div>
      <div class="kpi-lbl">${esc(label)}</div>
    </div>`;
}

export function htmlEstatisticaGeral(
  dados: AnaliticoClubeEpoca,
  marca: MarcaClube,
  geradoEm: Date = new Date(),
): string {
  const cor = corValida(marca.corPrimaria);
  const { totais, balanco, escaloes } = dados;
  const maxGolos = Math.max(1, ...escaloes.map((e) => e.golosMarcados));

  const linhasEscaloes =
    escaloes.length === 0
      ? `<tr><td class="vazio" colspan="7">Sem escalões com dados nesta época.</td></tr>`
      : escaloes
          .map(
            (e) => `
        <tr>
          <td class="esq destaque">${esc(e.nome)}</td>
          <td>${esc(e.nAtletas)}</td>
          <td>${esc(e.jogos)}</td>
          <td>${esc(e.vitorias)}/${esc(e.empates)}/${esc(e.derrotas)}</td>
          <td>${esc(e.golosMarcados)}–${esc(e.golosSofridos)}</td>
          <td>${esc(e.sessoesExecutadas)}</td>
          <td class="destaque" style="color:${corPercentagem(e.taxaPresencaMedia)}">${esc(
            pct(e.taxaPresencaMedia),
          )}</td>
        </tr>`,
          )
          .join("");

  const barrasGolos = escaloes.some((e) => e.golosMarcados > 0)
    ? `
      <div class="seccao">
        <div class="bloco-titulo">Golos por escalão</div>
        ${escaloes
          .filter((e) => e.golosMarcados > 0)
          .map((e) => barraHtml(e.nome, e.golosMarcados, maxGolos, cor))
          .join("")}
      </div>`
    : "";

  const corpo = `
    ${cabecalhoHtml(marca, "Estatísticas", `${esc(marca.nome)} (${esc(marca.epoca)})`)}

    ${marcaGrandeHtml(marca, cor)}

    <div class="seccao">
      <div class="bloco-titulo">Geral</div>
      <div class="kpi-faixa">
        ${kpiCel(String(totais.nAtletas), "Jogadores", COR_TEXTO)}
        ${kpiCel(String(totais.sessoesExecutadas), "Treinos", COR_TEXTO)}
        ${kpiCel(String(escaloes.length), "Escalões", COR_TEXTO)}
        ${kpiCel(String(totais.jogos), "Jogos oficiais", COR_TEXTO)}
      </div>
    </div>

    <div class="seccao">
      <div class="bloco-titulo">Resultados</div>
      <div class="kpi-faixa">
        ${kpiCel(String(balanco.jogos), "Jogos", COR_TEXTO)}
        ${kpiCel(String(balanco.vitorias), "Vitórias", COR_VERDE, pctDe(balanco.vitorias, balanco.jogos))}
        ${kpiCel(String(balanco.empates), "Empates", COR_CINZA, pctDe(balanco.empates, balanco.jogos))}
        ${kpiCel(String(balanco.derrotas), "Derrotas", COR_VERMELHO, pctDe(balanco.derrotas, balanco.jogos))}
      </div>
      <div class="nota">
        Golos: <strong style="color:${cor}">${esc(balanco.golosMarcados)}</strong> marcados ·
        <strong>${esc(balanco.golosSofridos)}</strong> sofridos ·
        assiduidade global <strong style="color:${corPercentagem(
          totais.taxaPresencaMediaGlobal,
        )}">${esc(pct(totais.taxaPresencaMediaGlobal))}</strong>.
      </div>
    </div>

    <div class="seccao">
      <div class="bloco-titulo">Por escalão</div>
      <div class="tabela-caixa">
        <table>
          <thead>
            <tr>
              <th class="esq">Escalão</th>
              <th>Atletas</th>
              <th>Jogos</th>
              <th>V/E/D</th>
              <th>Golos M–S</th>
              <th>Treinos</th>
              <th>Assid.</th>
            </tr>
          </thead>
          <tbody>${linhasEscaloes}</tbody>
        </table>
      </div>
    </div>

    ${barrasGolos}
    ${rodapeHtml(geradoEm)}`;

  return documentoHtml(tituloEstatisticaGeral(dados), corpo);
}
