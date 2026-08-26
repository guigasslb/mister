// Template PDF — Estatística individual (Dossier do Treinador, ref. PDF 1).
//
// Tabela por atleta com o bloco "Jogos" (golos, assistências, jogos utilizados,
// tempo de jogo, cartões) e o bloco "Assiduidade" (presenças e taxa). Alimentado
// pelo AnaliticoEscalao já calculado — os atletas apresentados são a UNIÃO dos
// que surgem nos rankings agregados desse analítico (marcadores, assistentes,
// mais utilizados, assiduidade e disciplina), em paridade exata com o export CSV
// (`exportarAnaliticoEscalaoCsv`). Zero recálculo, zero queries adicionais.
//
// ⚠️ SERVER-ONLY: usa `@react-pdf/renderer`; importar só no pipeline server-side.

import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { AnaliticoEscalao } from "@/lib/actions/analise";
import {
  Cabecalho,
  Rodape,
  estilos,
  corValida,
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

// Grelha de colunas (soma das larguras = 100).
const COLS = {
  nome: "22%",
  golos: "9%",
  assist: "9%",
  jogos: "11%",
  tempo: "11%",
  amarelos: "9%",
  vermelhos: "9%",
  presencas: "10%",
  assid: "10%",
} as const;

export function PdfEstatisticaIndividual({
  dados,
  marca,
  geradoEm = new Date(),
}: {
  dados: AnaliticoEscalao;
  marca: MarcaClube;
  geradoEm?: Date;
}) {
  const cor = corValida(marca.corPrimaria);
  const linhas = montarLinhas(dados);

  return (
    <Document
      title={`Estatística individual — ${dados.escalao.nome}`}
      author="Mister"
    >
      <Page size="A4" style={estilos.pagina}>
        <Cabecalho
          marca={marca}
          titulo="Estatística"
          subtitulo={`${dados.escalao.nome} · Individual`}
        />

        <View style={estilos.seccao}>
          <Text style={estilos.seccaoTitulo}>
            Jogos oficiais ({dados.jogos}) · Assiduidade ({dados.sessoesExecutadas} treinos)
          </Text>

          <View style={estilos.tabela}>
            {/* Cabeçalho */}
            <View style={[estilos.linha, estilos.cabecalhoLinha]}>
              <Text style={[estilos.celulaCabecalho, { width: COLS.nome }]}>Atleta</Text>
              <Text style={[estilos.celulaCabecalho, { width: COLS.golos, textAlign: "center" }]}>
                Golos
              </Text>
              <Text style={[estilos.celulaCabecalho, { width: COLS.assist, textAlign: "center" }]}>
                Assist.
              </Text>
              <Text style={[estilos.celulaCabecalho, { width: COLS.jogos, textAlign: "center" }]}>
                Jogos
              </Text>
              <Text style={[estilos.celulaCabecalho, { width: COLS.tempo, textAlign: "center" }]}>
                Tempo
              </Text>
              <Text style={[estilos.celulaCabecalho, { width: COLS.amarelos, textAlign: "center" }]}>
                Amar.
              </Text>
              <Text
                style={[estilos.celulaCabecalho, { width: COLS.vermelhos, textAlign: "center" }]}
              >
                Verm.
              </Text>
              <Text
                style={[estilos.celulaCabecalho, { width: COLS.presencas, textAlign: "center" }]}
              >
                Presenças
              </Text>
              <Text style={[estilos.celulaCabecalho, { width: COLS.assid, textAlign: "center" }]}>
                Assid.
              </Text>
            </View>

            {/* Linhas */}
            {linhas.length === 0 ? (
              <View style={estilos.linhaUltima}>
                <Text style={[estilos.celula, { width: "100%", color: "#6B7280" }]}>
                  Sem dados de atletas para o período selecionado.
                </Text>
              </View>
            ) : (
              linhas.map((l, i) => {
                const ultima = i === linhas.length - 1;
                const estiloLinha = [
                  ultima ? estilos.linhaUltima : estilos.linha,
                  i % 2 === 1 ? estilos.linhaZebra : {},
                ];
                return (
                  <View key={l.atletaId} style={estiloLinha} wrap={false}>
                    <Text style={[estilos.celula, estilos.destaque, { width: COLS.nome }]}>
                      {l.nome}
                    </Text>
                    <Text
                      style={[
                        estilos.celula,
                        estilos.destaque,
                        { width: COLS.golos, textAlign: "center", color: cor },
                      ]}
                    >
                      {l.golos}
                    </Text>
                    <Text style={[estilos.celula, { width: COLS.assist, textAlign: "center" }]}>
                      {l.assistencias}
                    </Text>
                    <Text style={[estilos.celula, { width: COLS.jogos, textAlign: "center" }]}>
                      {l.jogosUtilizados}
                    </Text>
                    <Text style={[estilos.celula, { width: COLS.tempo, textAlign: "center" }]}>
                      {minutos(l.tempo)}
                    </Text>
                    <Text style={[estilos.celula, { width: COLS.amarelos, textAlign: "center" }]}>
                      {l.amarelos}
                    </Text>
                    <Text style={[estilos.celula, { width: COLS.vermelhos, textAlign: "center" }]}>
                      {l.vermelhos}
                    </Text>
                    <Text style={[estilos.celula, { width: COLS.presencas, textAlign: "center" }]}>
                      {l.presencas}
                    </Text>
                    <Text
                      style={[
                        estilos.celula,
                        estilos.destaque,
                        { width: COLS.assid, textAlign: "center", color: cor },
                      ]}
                    >
                      {pct(l.taxaPresenca)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          <Text style={{ fontSize: 7, color: "#6B7280", marginTop: 6 }}>
            Taxa de presença média da equipa: {pct(dados.taxaPresencaMedia)} ·{" "}
            {dados.nAtletas} atletas
          </Text>
        </View>

        <Rodape geradoEm={geradoEm} />
      </Page>
    </Document>
  );
}
