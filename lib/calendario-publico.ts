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
 * adversário, casa/fora, local, competição, subequipa e resultado (só se já
 * realizado). Nada de atletas, convocatórias, estatísticas, notas ou relatórios.
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
} satisfies Prisma.JogoSelect;

type EscalaoCalendario = Prisma.EscalaoGetPayload<{
  select: typeof SELECT_ESCALAO_CALENDARIO_PUBLICO;
}>;
type JogoCalendario = Prisma.JogoGetPayload<{
  select: typeof SELECT_JOGO_CALENDARIO_PUBLICO;
}>;

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
      .map((j) => mapearJogoPublico(j, agora, escalao.clube.nome)),
    realizados: ordenados
      .filter((j) => j.data.getTime() < ref)
      .reverse()
      .map((j) => mapearJogoPublico(j, agora, escalao.clube.nome)),
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
        select: SELECT_JOGO_CALENDARIO_PUBLICO,
        orderBy: { data: "asc" },
      })
    : [];

  return montarCalendarioPublico(escalao, epoca, jogos, agora);
}
