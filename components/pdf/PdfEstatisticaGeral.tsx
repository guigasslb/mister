// Template PDF — Estatísticas gerais (Dossier do Treinador, ref. PDF 2).
//
// Visão global do clube na época: bloco "Geral" (KPIs), "Resultados" (V/E/D +
// golos), tabela por escalão e um gráfico de barras de golos marcados por
// escalão. Alimentado pelo AnaliticoClubeEpoca já calculado — zero recálculo.
//
// ⚠️ SERVER-ONLY: usa `@react-pdf/renderer`; importar só no pipeline server-side.

import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { AnaliticoClubeEpoca } from "@/lib/actions/analise";
import {
  Cabecalho,
  Rodape,
  Kpi,
  BarraH,
  estilos,
  corValida,
  pct,
  type MarcaClube,
} from "./comum";

const COLS = {
  escalao: "26%",
  atletas: "10%",
  jogos: "9%",
  ved: "15%",
  golos: "14%",
  treinos: "13%",
  assid: "13%",
} as const;

export function PdfEstatisticaGeral({
  dados,
  marca,
  geradoEm = new Date(),
}: {
  dados: AnaliticoClubeEpoca;
  marca: MarcaClube;
  geradoEm?: Date;
}) {
  const cor = corValida(marca.corPrimaria);
  const { totais, balanco, escaloes } = dados;
  const maxGolos = Math.max(1, ...escaloes.map((e) => e.golosMarcados));

  return (
    <Document title={`Estatísticas gerais — ${dados.clube.nome}`} author="Mister">
      <Page size="A4" style={estilos.pagina}>
        <Cabecalho marca={marca} titulo="Estatística" subtitulo="Geral do clube" />

        {/* Geral — 4 KPIs */}
        <View style={estilos.seccao}>
          <Text style={estilos.seccaoTitulo}>Geral</Text>
          <View style={estilos.kpiLinha}>
            <Kpi valor={String(totais.nAtletas)} rotulo="Jogadores" cor={cor} />
            <Kpi valor={String(totais.sessoesExecutadas)} rotulo="Treinos" cor={cor} />
            <Kpi valor={String(escaloes.length)} rotulo="Escalões" cor={cor} />
            <Kpi valor={String(totais.jogos)} rotulo="Jogos" cor={cor} />
          </View>
        </View>

        {/* Resultados — V/E/D + golos */}
        <View style={estilos.seccao}>
          <Text style={estilos.seccaoTitulo}>Resultados da época</Text>
          <View style={estilos.kpiLinha}>
            <Kpi valor={String(balanco.vitorias)} rotulo="Vitórias" cor={cor} />
            <Kpi valor={String(balanco.empates)} rotulo="Empates" cor={cor} />
            <Kpi valor={String(balanco.derrotas)} rotulo="Derrotas" cor={cor} />
            <Kpi
              valor={`${balanco.golosMarcados}-${balanco.golosSofridos}`}
              rotulo="Golos (M-S)"
              cor={cor}
            />
          </View>
        </View>

        {/* Tabela por escalão */}
        <View style={estilos.seccao}>
          <Text style={estilos.seccaoTitulo}>Por escalão</Text>
          <View style={estilos.tabela}>
            <View style={[estilos.linha, estilos.cabecalhoLinha]}>
              <Text style={[estilos.celulaCabecalho, { width: COLS.escalao }]}>Escalão</Text>
              <Text style={[estilos.celulaCabecalho, { width: COLS.atletas, textAlign: "center" }]}>
                Atletas
              </Text>
              <Text style={[estilos.celulaCabecalho, { width: COLS.jogos, textAlign: "center" }]}>
                Jogos
              </Text>
              <Text style={[estilos.celulaCabecalho, { width: COLS.ved, textAlign: "center" }]}>
                V/E/D
              </Text>
              <Text style={[estilos.celulaCabecalho, { width: COLS.golos, textAlign: "center" }]}>
                Golos M-S
              </Text>
              <Text style={[estilos.celulaCabecalho, { width: COLS.treinos, textAlign: "center" }]}>
                Treinos
              </Text>
              <Text style={[estilos.celulaCabecalho, { width: COLS.assid, textAlign: "center" }]}>
                Assid.
              </Text>
            </View>

            {escaloes.length === 0 ? (
              <View style={estilos.linhaUltima}>
                <Text style={[estilos.celula, { width: "100%", color: "#6B7280" }]}>
                  Sem escalões com dados nesta época.
                </Text>
              </View>
            ) : (
              escaloes.map((e, i) => {
                const ultima = i === escaloes.length - 1;
                const estiloLinha = [
                  ultima ? estilos.linhaUltima : estilos.linha,
                  i % 2 === 1 ? estilos.linhaZebra : {},
                ];
                return (
                  <View key={e.escalaoId} style={estiloLinha} wrap={false}>
                    <Text style={[estilos.celula, estilos.destaque, { width: COLS.escalao }]}>
                      {e.nome}
                    </Text>
                    <Text style={[estilos.celula, { width: COLS.atletas, textAlign: "center" }]}>
                      {e.nAtletas}
                    </Text>
                    <Text style={[estilos.celula, { width: COLS.jogos, textAlign: "center" }]}>
                      {e.jogos}
                    </Text>
                    <Text style={[estilos.celula, { width: COLS.ved, textAlign: "center" }]}>
                      {e.vitorias}/{e.empates}/{e.derrotas}
                    </Text>
                    <Text style={[estilos.celula, { width: COLS.golos, textAlign: "center" }]}>
                      {e.golosMarcados}-{e.golosSofridos}
                    </Text>
                    <Text style={[estilos.celula, { width: COLS.treinos, textAlign: "center" }]}>
                      {e.sessoesExecutadas}
                    </Text>
                    <Text
                      style={[
                        estilos.celula,
                        estilos.destaque,
                        { width: COLS.assid, textAlign: "center", color: cor },
                      ]}
                    >
                      {pct(e.taxaPresencaMedia)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* Golos marcados por escalão (barras) */}
        {escaloes.some((e) => e.golosMarcados > 0) && (
          <View style={estilos.seccao}>
            <Text style={estilos.seccaoTitulo}>Golos marcados por escalão</Text>
            {escaloes.map((e) => (
              <BarraH
                key={e.escalaoId}
                rotulo={e.nome}
                valor={e.golosMarcados}
                maximo={maxGolos}
                cor={cor}
              />
            ))}
          </View>
        )}

        <Rodape geradoEm={geradoEm} />
      </Page>
    </Document>
  );
}
