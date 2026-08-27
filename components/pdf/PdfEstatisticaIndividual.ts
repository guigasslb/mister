// Relatório imprimível — Estatística individual (Dossier do Treinador, ref. PDF 1).
//
// Tabela por atleta com o bloco "Jogos oficiais" (golos, assistências, jogos
// utilizados, tempo de jogo, cartões) e a "Assiduidade" (presenças e taxa),
// no mesmo layout do relatório de referência do clube: cabeçalho com escudo,
// grupos de colunas, valores destacados na cor do clube e a taxa de presença
// em semáforo (verde/âmbar/vermelho). Alimentado pelo AnaliticoEscalao já
// calculado — os atletas apresentados são a UNIÃO dos que surgem nos rankings
// agregados desse analítico (marcadores, assistentes, mais utilizados,
// assiduidade e disciplina), em paridade exata com o export CSV
// (`exportarAnaliticoEscalaoCsv`). Zero recálculo, zero queries adicionais.
//
// Produz uma STRING de HTML imprimível (ver `comum.ts`); usado só server-side.

import type { AnaliticoEscalao } from "@/lib/actions/analise";
import {
  cabecalhoHtml,
  rodapeHtml,
  documentoHtml,
  corValida,
  corPercentagem,
  esc,
  minutos,
  pct,
  type MarcaClube,
} from "./comum";

interface LinhaAtleta {
  atletaId: string;
  nome: string;
  golos: number;
  assistencias: number;
  jogosUtilizados: number;
  tempo: number;
  amarelos: number;
  vermelhos: number;
  presencas: number;
  taxaPresenca: number;
}

/** Funde os rankings do AnaliticoEscalao numa tabela por atleta (sem recálculo). */
function montarLinhas(dados: AnaliticoEscalao): LinhaAtleta[] {
  const mapa = new Map<string, LinhaAtleta>();
  const obter = (atletaId: string, nome: string): LinhaAtleta => {
    let linha = mapa.get(atletaId);
    if (!linha) {
      linha = {
        atletaId,
        nome,
        golos: 0,
        assistencias: 0,
        jogosUtilizados: 0,
        tempo: 0,
        amarelos: 0,
        vermelhos: 0,
        presencas: 0,
        taxaPresenca: 0,
      };
      mapa.set(atletaId, linha);
    }
    return linha;
  };

  for (const u of dados.maisUtilizados) {
    const l = obter(u.atletaId, u.nome);
    l.tempo = u.tempoJogoAcumulado;
    l.jogosUtilizados = u.jogosUtilizados;
  }
  for (const m of dados.marcadores) obter(m.atletaId, m.nome).golos = m.valor;
  for (const a of dados.assistentes) obter(a.atletaId, a.nome).assistencias = a.valor;
  for (const d of dados.rankingDisciplina) {
    const l = obter(d.atletaId, d.nome);
    l.amarelos = d.amarelos;
    l.vermelhos = d.vermelhos;
  }
  for (const a of dados.rankingAssiduidade) {
    const l = obter(a.atletaId, a.nome);
    l.presencas = a.presencas;
    l.taxaPresenca = a.taxa;
  }

  return [...mapa.values()].sort(
    (x, y) =>
      y.golos - x.golos ||
      y.tempo - x.tempo ||
      x.nome.localeCompare(y.nome, "pt"),
  );
}

/** Célula numérica: zeros esbatidos, valores destacados na cor indicada (ou dark). */
function celula(valor: number, texto: string, cor?: string): string {
  if (valor === 0) return `<td class="zero">${esc(texto)}</td>`;
  const estilo = cor ? ` class="destaque" style="color:${cor}"` : ` class="destaque"`;
  return `<td${estilo}>${esc(texto)}</td>`;
}

/** Título do documento (usado como nome sugerido em "Guardar como PDF"). */
export function tituloEstatisticaIndividual(dados: AnaliticoEscalao): string {
  return `Estatística individual — ${dados.escalao.nome}`;
}

export function htmlEstatisticaIndividual(
  dados: AnaliticoEscalao,
  marca: MarcaClube,
  geradoEm: Date = new Date(),
): string {
  const cor = corValida(marca.corPrimaria);
  const linhas = montarLinhas(dados);

  const corpoTabela =
    linhas.length === 0
      ? `<tr><td class="vazio" colspan="9">Sem dados de atletas para o período selecionado.</td></tr>`
      : linhas
          .map(
            (l) => `
        <tr>
          <td class="esq destaque">${esc(l.nome)}</td>
          ${celula(l.golos, String(l.golos), cor)}
          ${celula(l.assistencias, String(l.assistencias), cor)}
          ${celula(l.jogosUtilizados, String(l.jogosUtilizados))}
          ${celula(l.tempo, minutos(l.tempo))}
          ${celula(l.amarelos, String(l.amarelos), "#B45309")}
          ${celula(l.vermelhos, String(l.vermelhos), "#DC2626")}
          ${celula(l.presencas, String(l.presencas))}
          <td class="destaque" style="color:${corPercentagem(l.taxaPresenca)}">${esc(
            pct(l.taxaPresenca),
          )}</td>
        </tr>`,
          )
          .join("");

  const corpo = `
    ${cabecalhoHtml(marca, "Estatística", `${esc(marca.nome)} (${esc(marca.epoca)})`)}

    <div class="seccao">
      <div class="banda-sub">
        ${esc(dados.escalao.nome)} · Jogos oficiais (${esc(dados.jogos)}) · Assiduidade (${esc(
          dados.sessoesExecutadas,
        )} treinos)
      </div>
      <div class="tabela-caixa">
        <table>
          <thead>
            <tr>
              <th class="esq grupo" rowspan="2">Atleta</th>
              <th class="grupo" colspan="6">Jogos oficiais (${esc(dados.jogos)})</th>
              <th class="grupo" colspan="2">Assiduidade (${esc(dados.sessoesExecutadas)} treinos)</th>
            </tr>
            <tr>
              <th>Golos</th>
              <th>Assist.</th>
              <th>Jogos</th>
              <th>Tempo</th>
              <th>Amar.</th>
              <th>Verm.</th>
              <th>Presenças</th>
              <th>Assid.</th>
            </tr>
          </thead>
          <tbody>${corpoTabela}</tbody>
        </table>
      </div>
      <div class="nota">
        Taxa de presença média da equipa:
        <strong style="color:${corPercentagem(dados.taxaPresencaMedia)}">${esc(
          pct(dados.taxaPresencaMedia),
        )}</strong> · ${esc(dados.nAtletas)} atletas · Golos destacados na cor do clube.
      </div>
    </div>

    ${rodapeHtml(geradoEm)}`;

  return documentoHtml(tituloEstatisticaIndividual(dados), corpo);
}
