// Relatório imprimível — Estatísticas gerais (Dossier do Treinador, ref. PDF 2).
//
// Visão global do clube na época: bloco "Geral" (KPIs), "Resultados" (V/E/D +
// golos), tabela por escalão e um gráfico de barras de golos marcados por
// escalão. Alimentado pelo AnaliticoClubeEpoca já calculado — zero recálculo.
//
// Produz uma STRING de HTML imprimível (ver `comum.ts`); usado só server-side.

import type { AnaliticoClubeEpoca } from "@/lib/actions/analise";
import {
  cabecalhoHtml,
  rodapeHtml,
  documentoHtml,
  kpiHtml,
  barraHtml,
  corValida,
  esc,
  pct,
  type MarcaClube,
} from "./comum";

/** Título do documento (usado como nome sugerido em "Guardar como PDF"). */
export function tituloEstatisticaGeral(dados: AnaliticoClubeEpoca): string {
  return `Estatísticas gerais — ${dados.clube.nome}`;
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
          <td>${esc(e.golosMarcados)}-${esc(e.golosSofridos)}</td>
          <td>${esc(e.sessoesExecutadas)}</td>
          <td class="destaque" style="color:${cor}">${esc(pct(e.taxaPresencaMedia))}</td>
        </tr>`,
          )
          .join("");

  const barrasGolos = escaloes.some((e) => e.golosMarcados > 0)
    ? `
      <div class="seccao">
        <div class="seccao-titulo">Golos marcados por escalão</div>
        ${escaloes.map((e) => barraHtml(e.nome, e.golosMarcados, maxGolos, cor)).join("")}
      </div>`
    : "";

  const corpo = `
    ${cabecalhoHtml(marca, "Estatística", "Geral do clube")}

    <div class="seccao">
      <div class="seccao-titulo">Geral</div>
      <div class="kpi-linha">
        ${kpiHtml(String(totais.nAtletas), "Jogadores", cor)}
        ${kpiHtml(String(totais.sessoesExecutadas), "Treinos", cor)}
        ${kpiHtml(String(escaloes.length), "Escalões", cor)}
        ${kpiHtml(String(totais.jogos), "Jogos", cor)}
      </div>
    </div>

    <div class="seccao">
      <div class="seccao-titulo">Resultados da época</div>
      <div class="kpi-linha">
        ${kpiHtml(String(balanco.vitorias), "Vitórias", cor)}
        ${kpiHtml(String(balanco.empates), "Empates", cor)}
        ${kpiHtml(String(balanco.derrotas), "Derrotas", cor)}
        ${kpiHtml(`${balanco.golosMarcados}-${balanco.golosSofridos}`, "Golos (M-S)", cor)}
      </div>
    </div>

    <div class="seccao">
      <div class="seccao-titulo">Por escalão</div>
      <table>
        <thead>
          <tr>
            <th class="esq">Escalão</th>
            <th>Atletas</th>
            <th>Jogos</th>
            <th>V/E/D</th>
            <th>Golos M-S</th>
            <th>Treinos</th>
            <th>Assid.</th>
          </tr>
        </thead>
        <tbody>${linhasEscaloes}</tbody>
      </table>
    </div>

    ${barrasGolos}
    ${rodapeHtml(geradoEm)}`;

  return documentoHtml(tituloEstatisticaGeral(dados), corpo);
}
