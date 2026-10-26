import type { CalendarioPublico, JogoCalendarioPublico } from "@/lib/calendario-publico";
import { tituloConfronto } from "@/lib/jogo-confronto";
import { formatarDataHoraLisboa, partesDataLisboa } from "@/lib/utils-datas";
import { temaPdf } from "@/lib/pdf/tema";

/**
 * Pré-visualização do link público do calendário (bíblia §8.11.1) — título,
 * descrição e linhas da imagem Open Graph. Funções puras (sem BD nem
 * `server-only`), a partir do DTO público já minimizado por
 * `obterCalendarioPublico` (nunca expõem mais do que a própria página).
 */

/** Limite da descrição (o WhatsApp/Telegram truncam a ~200 caracteres). */
export const MAX_DESCRICAO = 200;

/** Nº de próximos jogos mostrados na imagem de pré-visualização. */
export const JOGOS_NA_IMAGEM = 3;

const RE_URL = /\bhttps?:\/\/[^\s<>"']+/gi;

/**
 * Separa o campo livre `local` em texto e URL de mapa (só http/https). O URL
 * nunca é mostrado em bruto: a página mostra «Ver no mapa»; a descrição e a
 * imagem Open Graph usam só o texto. Qualquer outro esquema (ex. `javascript:`)
 * não é reconhecido como link e fica como texto (renderizado como texto, sem XSS).
 */
export function separarLocal(local: string | null | undefined): {
  texto: string | null;
  mapaUrl: string | null;
} {
  const bruto = local?.trim() ?? "";
  if (!bruto) return { texto: null, mapaUrl: null };
  let mapaUrl: string | null = null;
  for (const candidato of bruto.match(RE_URL) ?? []) {
    try {
      const u = new URL(candidato);
      if (u.protocol === "http:" || u.protocol === "https:") {
        mapaUrl = u.href;
        break;
      }
    } catch {
      // URL malformado: ignora (é removido do texto na mesma)
    }
  }
  const texto = bruto
    .replace(RE_URL, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s·,;:|–—-]+|[\s·,;:|–—-]+$/g, "")
    .trim();
  return { texto: texto || null, mapaUrl };
}

/** «sáb., 25 out.» + « · 15:30» (hora omitida em jogos sem hora — 00:00). */
export function dataHoraCurta(iso: string): string {
  const dia = formatarDataHoraLisboa(iso, { weekday: "short", day: "2-digit", month: "short" });
  const { hora, minuto } = partesDataLisboa(iso);
  if (hora === 0 && minuto === 0) return dia;
  return `${dia} · ${formatarDataHoraLisboa(iso, { hour: "2-digit", minute: "2-digit" })}`;
}

export function tituloCalendarioPublico(cal: CalendarioPublico): string {
  return `Calendário de jogos — ${abreviarNomeClube(cal.clube.nome)} · ${cal.escalao.nome}`;
}

function truncar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`;
}

function confronto(cal: CalendarioPublico, jogo: JogoCalendarioPublico): string {
  const nomes = nomesConfrontoPublico(cal.clube.nome, jogo.adversario);
  return tituloConfronto(nomes.clube, nomes.adversario, jogo.casaFora);
}

/**
 * Próximo jogo (confronto · data/hora · local) + nº de jogos da época; sem
 * próximo jogo, só o nº de jogos; sem jogos, mensagem de vazio.
 */
export function descricaoCalendarioPublico(cal: CalendarioPublico): string {
  const total = cal.proximos.length + cal.realizados.length;
  const epoca = cal.epoca ? ` na época ${cal.epoca.nome}` : "";
  const contagem = `${total} ${total === 1 ? "jogo" : "jogos"}${epoca}`;
  if (total === 0) return "Sem jogos agendados nesta época.";
  const proximo = cal.proximos[0];
  if (!proximo) return `${contagem}. Sem jogos por disputar.`;
  const partes = [`Próximo jogo: ${confronto(cal, proximo)}`, dataHoraCurta(proximo.data)];
  const local = separarLocal(proximo.local).texto;
  if (local) partes.push(local);
  return truncar(`${partes.join(" · ")}. ${contagem}.`, MAX_DESCRICAO);
}

export interface LinhaImagemCalendario {
  quando: string;
  confronto: string;
  detalhe: string | null; // competição/local
}

/** Até `JOGOS_NA_IMAGEM` próximos jogos, já formatados para a imagem. */
export function linhasImagemCalendario(cal: CalendarioPublico): LinhaImagemCalendario[] {
  return cal.proximos.slice(0, JOGOS_NA_IMAGEM).map((j) => ({
    quando: dataHoraCurta(j.data),
    confronto: confronto(cal, j),
    detalhe:
      [j.equipa, j.competicao, separarLocal(j.local).texto].filter(Boolean).join(" · ") || null,
  }));
}

/**
 * Base absoluta dos URLs da pré-visualização (`metadataBase`). Usa a URL pública
 * já configurada no projeto (`NEXTAUTH_URL`/`AUTH_URL`, só lidas) e, sem ela, o
 * host do pedido. Fora de localhost força https (o WhatsApp exige https).
 */
export function resolverUrlBase(opcoes: {
  envUrl?: string | null;
  host?: string | null;
  proto?: string | null;
}): URL | null {
  const candidato = opcoes.envUrl?.trim()
    || (opcoes.host?.trim() ? `${opcoes.proto?.trim() || "https"}://${opcoes.host.trim()}` : "");
  if (!candidato) return null;
  let url: URL;
  try {
    url = new URL(candidato);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!local) url.protocol = "https:";
  return new URL(url.origin);
}

/**
 * Estado do painel expansível de um jogo (bíblia §8.11.1), derivado só do DTO
 * público: `expansivel` (há concentração ou convocados visíveis), `temConvocados`
 * (convocatória feita e visível — mostra o badge «Convocatória») e o rótulo do
 * `summary`. Não expõe nada além do que a projeção já traz.
 */
export function detalheJogoPublico(
  jogo: Pick<JogoCalendarioPublico, "concentracao" | "convocados">,
): { expansivel: boolean; temConvocados: boolean; temConcentracao: boolean; rotulo: string } {
  const temConcentracao = jogo.concentracao != null;
  const temConvocados = (jogo.convocados?.length ?? 0) > 0;
  const rotulo = [temConcentracao && "Concentração", temConvocados && "Convocados"]
    .filter(Boolean)
    .join(" e ");
  return { expansivel: temConcentracao || temConvocados, temConvocados, temConcentracao, rotulo };
}

/**
 * Cores AA derivadas da cor do clube para a página pública (botão «Ver no mapa»,
 * badge «Convocatória», «Ver detalhes»): fundo sólido + texto com contraste ≥4.5:1
 * e a cor do clube como texto sobre branco (escurecida o mínimo para AA). Reutiliza
 * `temaPdf` (mesma fórmula WCAG 2.1). Cor inválida → laranja da marca.
 */
export function variaveisCorCalendarioPublico(
  corPrimaria: string | null | undefined,
): Record<"--cal-solido" | "--cal-solido-texto" | "--cal-acento-texto", string> {
  const tema = temaPdf(corPrimaria);
  return {
    "--cal-solido": tema.solidoFundo,
    "--cal-solido-texto": tema.solidoTexto,
    "--cal-acento-texto": tema.acentoTexto,
  };
}

/** Cores de um badge (fundo, texto e contorno) — texto AA (≥4.5:1) sobre o fundo. */
export interface CoresBadge {
  fundo: string;
  texto: string;
  contorno: string;
}

/**
 * Badge «Convocatória disponível» (🔁 2026-10-26): verde de estado do sistema de
 * design (`verde-600 #1E9E5A`, docs/BRAND.md) como contorno sobre um fundo verde
 * muito claro, com texto verde escuro para AA (o branco sobre `verde-600` dá só
 * ~3.4:1).
 */
export const CORES_BADGE_CONVOCATORIA: CoresBadge = {
  fundo: "#E8F5EE",
  texto: "#166534",
  contorno: "#1E9E5A",
};

/** Neutro (sem cor reconhecida no nome) — o aspeto anterior do badge (cinza-100/cinza-700). */
export const CORES_SUBEQUIPA_NEUTRO: CoresBadge = {
  fundo: "#F1EEE9",
  texto: "#57514A",
  contorno: "#E4E1DB",
};

/** Paleta por cor (ordem = prioridade); todas com texto AA sobre o fundo. */
export const PALETA_SUBEQUIPA: { re: RegExp; cores: CoresBadge }[] = [
  { re: /^(azul|azuis)$/, cores: { fundo: "#1D4ED8", texto: "#FFFFFF", contorno: "#1D4ED8" } },
  { re: /^brancos?$|^brancas?$/, cores: { fundo: "#FFFFFF", texto: "#141210", contorno: "#6B7280" } },
  { re: /^(vermelh|encarnad)[oa]s?$/, cores: { fundo: "#B91C1C", texto: "#FFFFFF", contorno: "#B91C1C" } },
  { re: /^verdes?$/, cores: { fundo: "#15803D", texto: "#FFFFFF", contorno: "#15803D" } },
  { re: /^(pret|negr)[oa]s?$/, cores: { fundo: "#141210", texto: "#FFFFFF", contorno: "#141210" } },
  { re: /^amarel[oa]s?$/, cores: { fundo: "#FACC15", texto: "#141210", contorno: "#A16207" } },
  { re: /^laranjas?$/, cores: { fundo: "#C2410C", texto: "#FFFFFF", contorno: "#C2410C" } },
  { re: /^(rox[oa]s?|lilases|lilas)$/, cores: { fundo: "#7E22CE", texto: "#FFFFFF", contorno: "#7E22CE" } },
  { re: /^ros(a|as)$/, cores: { fundo: "#BE185D", texto: "#FFFFFF", contorno: "#BE185D" } },
  { re: /^(cinz(a|as|ento|entos|enta|entas))$/, cores: { fundo: "#4B5563", texto: "#FFFFFF", contorno: "#4B5563" } },
];

/**
 * Cor do badge da subequipa no calendário público (🔁 2026-10-26), derivada de
 * forma determinística do nome (não há campo de cor no modelo): normaliza
 * (minúsculas, sem acentos), divide em palavras e a primeira palavra que seja
 * uma cor («Azuis», «Brancos», «Vermelhos»/«Encarnados», «Verdes», «Pretos»,
 * «Amarelos», «Laranjas», «Roxos», «Rosas», «Cinzentos»…) decide. Sem
 * correspondência → neutro.
 */
export function coresSubequipa(nome: string | null | undefined): CoresBadge {
  const palavras = (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  for (const palavra of palavras) {
    const hit = PALETA_SUBEQUIPA.find((p) => p.re.test(palavra));
    if (hit) return hit.cores;
  }
  return CORES_SUBEQUIPA_NEUTRO;
}


/**
 * Designações institucionais → siglas usadas em Portugal (🔁 2026-10-26, só
 * apresentação no calendário público). Lista explícita; as mais longas primeiro
 * para que «Grupo Desportivo e Recreativo» ganhe a «Grupo Desportivo».
 */
export const SIGLAS_CLUBE: readonly { designacao: string; sigla: string }[] = [
  { designacao: "Grupo Desportivo e Recreativo", sigla: "GDR" },
  { designacao: "Associação Recreativa e Cultural", sigla: "ARC" },
  { designacao: "Centro Cultural e Desportivo", sigla: "CCD" },
  { designacao: "Sporting Clube", sigla: "SC" },
  { designacao: "Sport Clube", sigla: "SC" },
  { designacao: "Futebol Clube", sigla: "FC" },
  { designacao: "Grupo Desportivo", sigla: "GD" },
  { designacao: "Clube Desportivo", sigla: "CD" },
  { designacao: "Associação Desportiva", sigla: "AD" },
  { designacao: "Clube de Futebol", sigla: "CF" },
  { designacao: "União Desportiva", sigla: "UD" },
  { designacao: "Atlético Clube", sigla: "AC" },
];

/** Minúsculas, sem acentos e sem pontuação nas pontas — só para comparar palavras. */
function chavePalavra(palavra: string): string {
  return palavra
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

const PADROES_SIGLA = SIGLAS_CLUBE.map((s) => ({
  palavras: s.designacao.split(" ").map(chavePalavra),
  sigla: s.sigla,
})).sort((a, b) => b.palavras.length - a.palavras.length);

/**
 * Abrevia o nome do clube só para apresentação («Juventude Sport Clube» →
 * «Juventude SC»). Substitui apenas sequências completas de palavras de
 * `SIGLAS_CLUBE` (sem distinguir maiúsculas/acentos), mantendo o resto do nome
 * e a pontuação final da última palavra substituída. Sem correspondência (ou já
 * com sigla) → igual. Se o resultado ficar vazio ou só com siglas → original.
 * Nunca altera dados.
 */
export function abreviarNomeClube(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  const chaves = palavras.map(chavePalavra);
  const out: string[] = [];
  let substituiu = false;
  let soSiglas = true;
  for (let i = 0; i < palavras.length; ) {
    const p = PADROES_SIGLA.find((pad) =>
      pad.palavras.every((w, k) => chaves[i + k] === w),
    );
    if (p) {
      const ultima = palavras[i + p.palavras.length - 1];
      const pontuacao = /[^\p{L}\p{N}]+$/u.exec(ultima)?.[0] ?? "";
      out.push(p.sigla + pontuacao);
      i += p.palavras.length;
      substituiu = true;
    } else {
      out.push(palavras[i]);
      if (chaves[i]) soSiglas = false;
      i += 1;
    }
  }
  if (!substituiu || out.length === 0 || soSiglas) return nome;
  return out.join(" ");
}

/**
 * Nomes do confronto no calendário público: o nosso clube abreviado e o
 * adversário abreviado **só** quando começa pelo nome do nosso clube (ex.:
 * confronto interno «Juventude Sport Clube - Azuis» → «Juventude SC - Azuis»);
 * os restantes adversários ficam como estão.
 */
export function nomesConfrontoPublico(
  clubeNome: string,
  adversario: string,
): { clube: string; adversario: string } {
  const clube = abreviarNomeClube(clubeNome);
  const base = clubeNome.trim();
  const chave = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const adv = adversario.trim();
  const ehNosso =
    base.length > 0 &&
    chave(adv).startsWith(chave(base)) &&
    (adv.length === base.length || /^[\s\-–—:·|]/.test(adv.slice(base.length)));
  return { clube, adversario: ehNosso ? clube + adv.slice(base.length) : adversario };
}
