import type { CalendarioPublico, JogoCalendarioPublico } from "@/lib/calendario-publico";
import { tituloConfronto } from "@/lib/jogo-confronto";
import { formatarDataHoraLisboa, partesDataLisboa } from "@/lib/utils-datas";

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
  return `Calendário de jogos — ${cal.clube.nome} · ${cal.escalao.nome}`;
}

function truncar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`;
}

function confronto(cal: CalendarioPublico, jogo: JogoCalendarioPublico): string {
  return tituloConfronto(cal.clube.nome, jogo.adversario, jogo.casaFora);
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
