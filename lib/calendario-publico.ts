import "server-only";
import { randomBytes } from "node:crypto";
import type { CasaFora, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  BYTES_TOKEN_CALENDARIO,
  tokenCalendarioPublicoSchema,
} from "@/lib/schemas/calendario-publico";

/**
 * Calendário público de jogos do escalão (bíblia §8.11.1) — leitura SEM
 * autenticação pelo token do link. Expõe exclusivamente o que a página pública
 * mostra: identidade do clube, nome do escalão, época ativa e, por jogo, data/hora,
 * adversário, casa/fora, local, competição, subequipa, resultado (só se já
 * realizado), concentração e — só com o opt-in do escalão — os convocados como
 * «Primeiro Último · nº». Nada de ids, fotos, datas de nascimento, contactos,
 * encarregados, estatísticas, notas ou relatórios.
 */

/** Token não-adivinhável: 24 bytes aleatórios → 32 caracteres base64url. */
export function gerarTokenCalendario(): string {
  return randomBytes(BYTES_TOKEN_CALENDARIO).toString("base64url");
}

/** Seleção mínima do escalão (resolvido pelo token). */
export const SELECT_ESCALAO_CALENDARIO_PUBLICO = {
  id: true,
  nome: true,
  clubeId: true,
  calendarioPublicoMostrarConvocados: true,
  clube: { select: { nome: true, corPrimaria: true, logoUrl: true } },
} satisfies Prisma.EscalaoSelect;

/** Seleção mínima de cada jogo — lista fechada de campos públicos. */
export const SELECT_JOGO_CALENDARIO_PUBLICO = {
  data: true,
  adversario: true,
  casaFora: true,
  local: true,
  competicao: true, // texto livre legado (fallback do nome da competição)
  golosMarcados: true,
  golosSofridos: true,
  competicaoRef: { select: { nome: true } },
  equipaCompeticao: { select: { nome: true } },
  horaConcentracao: true,
  localConcentracao: true,
} satisfies Prisma.JogoSelect;

/**
 * Convocados (só com o opt-in do escalão): apenas o nome e o número da
 * participação no escalão/época do jogo, e só atletas do clube do escalão.
 */
export function selectConvocadosCalendarioPublico(ctx: {
  escalaoId: string;
  epocaId: string;
  clubeId: string;
}) {
  return {
    where: { convocado: true, atleta: { clubeId: ctx.clubeId } },
    select: {
      atleta: {
        select: {
          nome: true,
          participacoes: {
            where: { escalaoId: ctx.escalaoId, epocaId: ctx.epocaId },
            select: { numero: true },
            take: 1,
          },
        },
      },
    },
  } satisfies Prisma.Jogo$convocatoriasArgs;
}

/** Select dos jogos: base fechada + convocados só quando o opt-in está ligado. */
export function selectJogoCalendarioPublico(ctx: {
  escalaoId: string;
  epocaId: string;
  clubeId: string;
  mostrarConvocados: boolean;
}) {
  return ctx.mostrarConvocados
    ? { ...SELECT_JOGO_CALENDARIO_PUBLICO, convocatorias: selectConvocadosCalendarioPublico(ctx) }
    : SELECT_JOGO_CALENDARIO_PUBLICO;
}

type EscalaoCalendario = Prisma.EscalaoGetPayload<{
  select: typeof SELECT_ESCALAO_CALENDARIO_PUBLICO;
}>;
type JogoCalendario = Prisma.JogoGetPayload<{
  select: typeof SELECT_JOGO_CALENDARIO_PUBLICO;
}> & {
  convocatorias?: { atleta: { nome: string; participacoes: { numero: number | null }[] } }[];
};

/**
 * Nome público de um convocado (decisão do utilizador, 2026-10-22): primeira e
 * última palavra do nome completo («Maria da Silva Santos» → «Maria Santos»);
 * uma só palavra mantém-se. Espaços extra ignorados.
 */
export function nomePrimeiroUltimo(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length <= 1) return palavras[0] ?? "";
  return `${palavras[0]} ${palavras[palavras.length - 1]}`;
}

export interface ConvocadoPublico {
  nome: string; // «Primeiro Último»
  numero: number | null;
}

/** Ordena por número (sem número no fim) e depois por nome (pt). */
export function ordenarConvocadosPublicos(lista: ConvocadoPublico[]): ConvocadoPublico[] {
  return [...lista].sort((a, b) => {
    if (a.numero !== b.numero) {
      if (a.numero === null) return 1;
      if (b.numero === null) return -1;
      return a.numero - b.numero;
    }
    return a.nome.localeCompare(b.nome, "pt");
  });
}

/** Jogos do escalão na época, sempre restritos ao clube do escalão. */
export function whereJogosCalendarioPublico(
  escalao: { id: string; clubeId: string },
  epocaId: string,
): Prisma.JogoWhereInput {
  return {
    escalaoId: escalao.id,
    epocaId,
    escalao: { clubeId: escalao.clubeId },
  };
}

export interface JogoCalendarioPublico {
  data: string; // ISO
  adversario: string;
  casaFora: CasaFora;
  local: string | null;
  competicao: string | null;
  /** Nome próprio da subequipa (ex.: «Brancos» — `nomeSubequipaPublico`), quando o jogo é de subequipa. */
  equipa: string | null;
  /** Só em jogos já realizados com resultado completo. */
  resultado: { marcados: number; sofridos: number } | null;
  /** Concentração (ISO + local livre); null sem hora nem local. */
  concentracao: { hora: string | null; local: string | null } | null;
  /** Convocados («Primeiro Último» + nº); null com o opt-in desligado ou sem convocatória. */
  convocados: ConvocadoPublico[] | null;
}

export interface CalendarioPublico {
  clube: { nome: string; corPrimaria: string; logoUrl: string | null };
  escalao: { nome: string };
  epoca: { nome: string } | null;
  /** Data ≥ agora, do mais próximo para o mais distante. */
  proximos: JogoCalendarioPublico[];
  /** Data < agora, do mais recente para o mais antigo. */
  realizados: JogoCalendarioPublico[];
}

const SEPARADOR_SUBEQUIPA = /\s+[-–—]\s+/;

/**
 * Nome próprio da subequipa para o calendário público («Brancos», «Azuis»), sem
 * prefixo de clube. Determinístico: (1) remove o prefixo «<clube> - » quando o
 * nome começa pelo nome do clube (sem distinguir maiúsculas/espaços); (2) senão,
 * num nome «X - Y» (hífen/travessão com espaços) fica o último segmento. Nomes sem
 * separador mantêm-se. Nunca devolve vazio (cai no nome original).
 */
export function nomeSubequipaPublico(nome: string, clubeNome?: string | null): string {
  const original = nome.trim().replace(/\s+/g, " ");
  const clube = clubeNome?.trim().replace(/\s+/g, " ").toLowerCase();
  if (clube && original.toLowerCase().startsWith(clube)) {
    // Só conta como prefixo se, a seguir ao nome do clube, vier um separador.
    const m = /^\s*[-–—:·|]\s*(.+)$/.exec(original.slice(clube.length));
    if (m) return nomeSubequipaPublico(m[1]);
  }
  const segmentos = original.split(SEPARADOR_SUBEQUIPA).map((p) => p.trim()).filter(Boolean);
  return segmentos.length > 1 ? segmentos[segmentos.length - 1] : original;
}

/** Projeção explícita de um jogo para o DTO público (nunca espalha o registo). */
export function mapearJogoPublico(
  jogo: JogoCalendario,
  agora: Date,
  clubeNome?: string | null,
  mostrarConvocados = false,
): JogoCalendarioPublico {
  const realizado = jogo.data.getTime() < agora.getTime();
  const temResultado = jogo.golosMarcados != null && jogo.golosSofridos != null;
  return {
    data: jogo.data.toISOString(),
    adversario: jogo.adversario,
    casaFora: jogo.casaFora,
    local: jogo.local?.trim() || null,
    competicao: jogo.competicaoRef?.nome ?? (jogo.competicao?.trim() || null),
    equipa: jogo.equipaCompeticao
      ? nomeSubequipaPublico(jogo.equipaCompeticao.nome, clubeNome)
      : null,
    resultado:
      realizado && temResultado
        ? { marcados: jogo.golosMarcados as number, sofridos: jogo.golosSofridos as number }
        : null,
    concentracao:
      jogo.horaConcentracao || jogo.localConcentracao?.trim()
        ? {
            hora: jogo.horaConcentracao ? jogo.horaConcentracao.toISOString() : null,
            local: jogo.localConcentracao?.trim() || null,
          }
        : null,
    convocados:
      mostrarConvocados && jogo.convocatorias && jogo.convocatorias.length > 0
        ? ordenarConvocadosPublicos(
            jogo.convocatorias.map((c) => ({
              nome: nomePrimeiroUltimo(c.atleta.nome),
              numero: c.atleta.participacoes[0]?.numero ?? null,
            })),
          )
        : null,
  };
}

/** Composição pura do calendário (testável sem BD). */
export function montarCalendarioPublico(
  escalao: EscalaoCalendario,
  epoca: { nome: string } | null,
  jogos: JogoCalendario[],
  agora: Date,
): CalendarioPublico {
  const ordenados = [...jogos].sort((a, b) => a.data.getTime() - b.data.getTime());
  const ref = agora.getTime();
  return {
    clube: {
      nome: escalao.clube.nome,
      corPrimaria: escalao.clube.corPrimaria,
      logoUrl: escalao.clube.logoUrl,
    },
    escalao: { nome: escalao.nome },
    epoca: epoca ? { nome: epoca.nome } : null,
    proximos: ordenados
      .filter((j) => j.data.getTime() >= ref)
      .map((j) => mapearJogoPublico(j, agora, escalao.clube.nome, escalao.calendarioPublicoMostrarConvocados)),
    realizados: ordenados
      .filter((j) => j.data.getTime() < ref)
      .reverse()
      .map((j) => mapearJogoPublico(j, agora, escalao.clube.nome, escalao.calendarioPublicoMostrarConvocados)),
  };
}

/**
 * Leitura pública pelo token. Token malformado/inexistente/revogado → `null`
 * (a página responde `notFound()`). O token é validado (Zod) antes de qualquer
 * query. Só a época ATIVA do clube do escalão é mostrada.
 */
export async function obterCalendarioPublico(
  token: unknown,
  agora: Date = new Date(),
): Promise<CalendarioPublico | null> {
  const parsed = tokenCalendarioPublicoSchema.safeParse(token);
  if (!parsed.success) return null;

  const escalao = await prisma.escalao.findUnique({
    where: { calendarioPublicoToken: parsed.data },
    select: SELECT_ESCALAO_CALENDARIO_PUBLICO,
  });
  if (!escalao) return null;

  const epoca = await prisma.epoca.findFirst({
    where: { clubeId: escalao.clubeId, ativa: true },
    select: { id: true, nome: true },
  });
  const jogos = epoca
    ? await prisma.jogo.findMany({
        where: whereJogosCalendarioPublico(escalao, epoca.id),
        select: selectJogoCalendarioPublico({
          escalaoId: escalao.id,
          epocaId: epoca.id,
          clubeId: escalao.clubeId,
          mostrarConvocados: escalao.calendarioPublicoMostrarConvocados,
        }),
        orderBy: { data: "asc" },
      })
    : [];

  return montarCalendarioPublico(escalao, epoca, jogos, agora);
}
