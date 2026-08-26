// Blocos partilhados dos templates PDF dos analíticos (Dossier do Treinador).
//
// ⚠️ SERVER-ONLY: estes componentes usam `@react-pdf/renderer` (primitivas de
// PDF, não DOM) e só devem ser importados pelo pipeline de geração server-side
// (`lib/pdf/gerar-pdf.ts` → route handler). Nunca importar num Client Component.

import { StyleSheet, Text, View, Image } from "@react-pdf/renderer";

/** Laranja da marca Mister (fallback quando o clube não tem cor válida). */
export const COR_MARCA = "#F0531E";

/** Identidade visual do clube injetada nos templates. */
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

/** Número com uma casa decimal e ponto decimal ("2.5"). */
export function n1(n: number): string {
  return n.toFixed(1);
}

/** Minutos acumulados → "123'". */
export function minutos(n: number): string {
  return `${Math.round(n)}'`;
}

const CINZA_900 = "#1A1A1A";
const CINZA_500 = "#6B7280";
const CINZA_200 = "#E5E7EB";
const CINZA_50 = "#F9FAFB";

export const estilos = StyleSheet.create({
  pagina: {
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 36,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: CINZA_900,
    backgroundColor: "#FFFFFF",
  },
  // Cabeçalho
  cabecalho: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    paddingBottom: 12,
    marginBottom: 18,
  },
  cabecalhoEsq: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 44, height: 44, objectFit: "contain" },
  logoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInicial: { color: "#FFFFFF", fontSize: 20, fontFamily: "Helvetica-Bold" },
  clubeNome: { fontSize: 15, fontFamily: "Helvetica-Bold", color: CINZA_900 },
  clubeEpoca: { fontSize: 9, color: CINZA_500, marginTop: 2 },
  cabecalhoDir: { alignItems: "flex-end" },
  tituloDoc: { fontSize: 11, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  subtituloDoc: { fontSize: 9, color: CINZA_500, marginTop: 2 },
  // Secções
  seccao: { marginBottom: 16 },
  seccaoTitulo: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: CINZA_500,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  // KPIs
  kpiLinha: { flexDirection: "row", gap: 10 },
  kpiCartao: {
    flex: 1,
    borderWidth: 1,
    borderColor: CINZA_200,
    borderRadius: 6,
    padding: 10,
  },
  kpiValor: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  kpiRotulo: { fontSize: 8, color: CINZA_500, marginTop: 2, textTransform: "uppercase" },
  // Tabelas
  tabela: { borderWidth: 1, borderColor: CINZA_200, borderRadius: 4 },
  linha: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: CINZA_200 },
  linhaUltima: { flexDirection: "row" },
  cabecalhoLinha: { backgroundColor: CINZA_50 },
  linhaZebra: { backgroundColor: CINZA_50 },
  celula: { paddingVertical: 5, paddingHorizontal: 6, fontSize: 8 },
  celulaCabecalho: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: CINZA_500,
    textTransform: "uppercase",
  },
  destaque: { fontFamily: "Helvetica-Bold" },
  // Barras (golos / rankings)
  barraLinha: { flexDirection: "row", alignItems: "center", marginBottom: 5, gap: 6 },
  barraRotulo: { width: 120, fontSize: 8 },
  barraTrilho: { flex: 1, height: 10, backgroundColor: CINZA_200, borderRadius: 3 },
  barraPreenchida: { height: 10, borderRadius: 3 },
  barraValor: { width: 34, fontSize: 8, textAlign: "right", fontFamily: "Helvetica-Bold" },
  // Rodapé
  rodape: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: CINZA_500,
  },
});

/** Cabeçalho comum: logótipo + nome/época do clube (esq.) e título do doc (dir.). */
export function Cabecalho({
  marca,
  titulo,
  subtitulo,
}: {
  marca: MarcaClube;
  titulo: string;
  subtitulo: string;
}) {
  const cor = corValida(marca.corPrimaria);
  return (
    <View style={[estilos.cabecalho, { borderBottomColor: cor }]}>
      <View style={estilos.cabecalhoEsq}>
        {marca.logo ? (
          // `Image` é uma primitiva do @react-pdf/renderer (PDF, não DOM) e não
          // aceita `alt`; a regra jsx-a11y não se aplica a este contexto.
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image style={estilos.logo} src={marca.logo} />
        ) : (
          <View style={[estilos.logoPlaceholder, { backgroundColor: cor }]}>
            <Text style={estilos.logoInicial}>{(marca.nome[0] ?? "?").toUpperCase()}</Text>
          </View>
        )}
        <View>
          <Text style={estilos.clubeNome}>{marca.nome}</Text>
          <Text style={estilos.clubeEpoca}>Época {marca.epoca}</Text>
        </View>
      </View>
      <View style={estilos.cabecalhoDir}>
        <Text style={[estilos.tituloDoc, { color: cor }]}>{titulo}</Text>
        <Text style={estilos.subtituloDoc}>{subtitulo}</Text>
      </View>
    </View>
  );
}

/** Rodapé com a origem do documento e a data de geração. */
export function Rodape({ geradoEm }: { geradoEm: Date }) {
  const data = geradoEm.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return (
    <View style={estilos.rodape} fixed>
      <Text>Mister · Dossier do Treinador</Text>
      <Text>Gerado a {data}</Text>
    </View>
  );
}

/** Cartão de KPI grande (valor destacado na cor do clube). */
export function Kpi({ valor, rotulo, cor }: { valor: string; rotulo: string; cor: string }) {
  return (
    <View style={estilos.kpiCartao}>
      <Text style={[estilos.kpiValor, { color: cor }]}>{valor}</Text>
      <Text style={estilos.kpiRotulo}>{rotulo}</Text>
    </View>
  );
}

/** Barra horizontal proporcional ao máximo (ranking / golos). */
export function BarraH({
  rotulo,
  valor,
  maximo,
  cor,
  formatar = (v) => String(v),
}: {
  rotulo: string;
  valor: number;
  maximo: number;
  cor: string;
  formatar?: (v: number) => string;
}) {
  const largura = maximo > 0 ? Math.max(2, Math.round((valor / maximo) * 100)) : 0;
  return (
    <View style={estilos.barraLinha}>
      <Text style={estilos.barraRotulo}>{rotulo}</Text>
      <View style={estilos.barraTrilho}>
        <View style={[estilos.barraPreenchida, { width: `${largura}%`, backgroundColor: cor }]} />
      </View>
      <Text style={estilos.barraValor}>{formatar(valor)}</Text>
    </View>
  );
}
