import { z } from "zod";
import { BlocoTempo, FormatoJogo, Posicao, TipoEventoJogo } from "@prisma/client";

/**
 * Valida um URL de vídeo: só https e só domínios YouTube (secção 8 da bíblia).
 * Impede esquemas perigosos (javascript:, data:) que `z.string().url()` aceita.
 */
const HOSTS_YOUTUBE = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

export function isVideoUrlValido(valor: string): boolean {
  if (valor === "") return true; // vazio = sem vídeo
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  return url.protocol === "https:" && HOSTS_YOUTUBE.has(url.hostname);
}

export const jogoSchema = z.object({
  data: z.coerce.date(),
  adversario: z.string().min(1, "Indica o adversário").max(100),
  casaFora: z.enum(["CASA", "FORA"]),
  tipo: z.enum(["OFICIAL", "AMIGAVEL"]).default("OFICIAL"),
  escalaoId: z.string().cuid("Escalão inválido"),
  // `competicao` (texto livre) foi deprecado no formulário (P4.3); a associação
  // faz-se por `competicaoId`. O campo legado mantém-se no modelo Prisma só para
  // leitura de jogos antigos.
  competicaoId: z.string().cuid().nullable().optional(),
  // 🔁 v7 (§3.7/§10.8): formato de jogo (FUTSAL_5 | FUTEBOL_*). Opcional no input:
  // se ausente, é derivado da modalidade da secção do escalão (FUTSAL → FUTSAL_5;
  // FUTEBOL → obrigatório indicar, não há default entre os 5 formatos). Editável.
  formato: z.nativeEnum(FormatoJogo).nullable().optional(),
  local: z.string().max(100).optional(),
  golosMarcados: z.number().int().min(0).max(99).nullable().optional(),
  golosSofridos: z.number().int().min(0).max(99).nullable().optional(),
  faltas1aParte: z.number().int().min(0).max(50).nullable().optional(),
  faltas2aParte: z.number().int().min(0).max(50).nullable().optional(),
  videoUrl: z
    .string()
    .max(300)
    .refine(isVideoUrlValido, "Indica um link válido do YouTube (https)")
    .optional()
    .or(z.literal("")),
});

export type JogoInput = z.infer<typeof jogoSchema>;

export const eventoJogoSchema = z.object({
  parte: z.number().int().min(1).max(2),
  minuto: z.number().int().min(0).max(120).nullable().optional(),
  tipo: z.nativeEnum(TipoEventoJogo),
  // F5 (M15): bloco de tempo associado ao evento (útil em substituições).
  bloco: z.nativeEnum(BlocoTempo).nullable().optional(),
  atletaId: z.string().cuid().nullable().optional(),
  atletaSecundarioId: z.string().cuid().nullable().optional(),
});

export type EventoJogoInput = z.infer<typeof eventoJogoSchema>;

/**
 * F5 (M15): registo de evento ao vivo com `jogoId` embutido no payload.
 * O modelo `EventoJogo` (§3.7) usa `parte` (obrigatório), `tipo` e
 * `atletaSecundarioId` (assistência / substituído); não tem `descricao`.
 */
export const registarEventoJogoSchema = eventoJogoSchema.extend({
  jogoId: z.string().cuid(),
});

export type RegistarEventoJogoInput = z.infer<typeof registarEventoJogoSchema>;

export const LABEL_TIPO_EVENTO: Record<TipoEventoJogo, string> = {
  GOLO: "Golo",
  ASSISTENCIA: "Assistência",
  FALTA: "Falta",
  CARTAO_AMARELO: "Cartão amarelo",
  CARTAO_VERMELHO: "Cartão vermelho",
  SUBSTITUICAO: "Substituição",
  DEFESA: "Defesa",
  GOLO_SOFRIDO: "Golo sofrido",
  TIMEOUT: "Timeout",
  // Futebol (§3.7)
  REMATE: "Remate",
  CANTO: "Canto",
  FORA_DE_JOGO: "Fora-de-jogo",
  DESARME: "Desarme",
};

/** Alias retrocompatível (usado no registo ao vivo). */
export const LABEL_EVENTO = LABEL_TIPO_EVENTO;

export const LABEL_BLOCO_TEMPO: Record<BlocoTempo, string> = {
  JOGO_COMPLETO: "Jogo completo",
  MEIA_PARTE: "Meia parte",
  BLOCO_10MIN: "10 minutos",
  BLOCO_5MIN: "5 minutos",
  NAO_JOGOU: "Não jogou",
};

// ─── Plano de dia de jogo (convocatória prevista) ─────────────────────────────

/**
 * F5 (M15): plano tático de dia de jogo por convocado — posição e titularidade
 * previstas. `convocadoId` é o `atletaId` da convocatória.
 */
export const convocatoriaPrevistaSchema = z.object({
  convocadoId: z.string().cuid(),
  posicaoPrevista: z.nativeEnum(Posicao).nullable().optional(),
  titularPrevisto: z.boolean().optional(),
});

export const planoTaticoSchema = z.array(convocatoriaPrevistaSchema);

export type ConvocatoriaPrevistaInput = z.infer<typeof convocatoriaPrevistaSchema>;
export type PlanoTaticoInput = z.infer<typeof planoTaticoSchema>;

export const LABEL_TIPO_JOGO: Record<"OFICIAL" | "AMIGAVEL", string> = {
  OFICIAL: "Oficial",
  AMIGAVEL: "Amigável",
};

export const estatisticaSchema = z.object({
  atletaId: z.string().cuid(),
  utilizacao: z.enum(["TITULAR", "UTILIZADO", "NAO_UTILIZADO"]),
  // F5 (M15): tempo de jogo por bloco (alternativa/complemento a `minutos`).
  blocoTempo: z.nativeEnum(BlocoTempo).nullable().optional(),
  minutos: z.number().int().min(0).max(60).nullable().optional(),
  golos: z.number().int().min(0).default(0),
  assistencias: z.number().int().min(0).default(0),
  defesas: z.number().int().min(0).nullable().optional(),
  golosSofridosGR: z.number().int().min(0).nullable().optional(),
  faltasCometidas: z.number().int().min(0).nullable().optional(),
  // Disciplina (§3.7): cartões acumulados por jogo. Aplicam-se a futsal e
  // futebol, pelo que são gravados sempre (não dependem da modalidade efetiva).
  cartaoAmarelo: z.number().int().min(0).default(0),
  cartaoVermelho: z.number().int().min(0).default(0),
  // 🔁 v7 (§3.7/§10.8): núcleo estatístico de FUTEBOL 🥅. Só é gravado em jogos de
  // futebol; em jogos de futsal estes campos são ignorados/postos a null pela action.
  remates: z.number().int().min(0).nullable().optional(),
  cantos: z.number().int().min(0).nullable().optional(),
  forasDeJogo: z.number().int().min(0).nullable().optional(),
  desarmes: z.number().int().min(0).nullable().optional(),
  valoresMetricas: z
    .array(z.object({ metricaId: z.string().cuid(), valor: z.number().int() }))
    .optional(),
});

export const guardarEstatisticasSchema = z.array(estatisticaSchema);
export type EstatisticaInput = z.infer<typeof estatisticaSchema>;

export const LABEL_UTILIZACAO: Record<
  "TITULAR" | "UTILIZADO" | "NAO_UTILIZADO",
  string
> = {
  TITULAR: "Titular",
  UTILIZADO: "Utilizado",
  NAO_UTILIZADO: "Não utilizado",
};

export const LABEL_CASA_FORA: Record<"CASA" | "FORA", string> = {
  CASA: "Casa",
  FORA: "Fora",
};

// ─── Disciplina / suspensões (BUG-P1-04) ──────────────────────────────────────

/** Nº de amarelos acumulados na época que desencadeia suspensão (§ disciplina). */
export const LIMITE_AMARELOS_SUSPENSAO = 3;

/** Motivo pelo qual um atleta está suspenso para o próximo jogo. */
export type SuspensaoMotivo = "ACUMULACAO_AMARELOS" | "CARTAO_VERMELHO";

/**
 * Suspensão pendente de um atleta para o próximo jogo do escalão. Tipo partilhado
 * cliente/servidor (o cálculo vive em `obterSuspensoesPendentes`, a apresentação
 * na convocatória do detalhe do jogo).
 */
export type SuspensaoPendente = {
  atletaId: string;
  nome: string;
  motivo: SuspensaoMotivo;
  /** Jogo onde recebeu o vermelho (só em CARTAO_VERMELHO). */
  cartaoVermelhoNoJogoId?: string;
  /** Amarelos acumulados na época (só em ACUMULACAO_AMARELOS). */
  amarelosAcumulados?: number;
};

/** Rótulo PT-PT curto do motivo de suspensão (badge da convocatória). */
export const LABEL_SUSPENSAO: Record<SuspensaoMotivo, string> = {
  ACUMULACAO_AMARELOS: "Suspenso (amarelos)",
  CARTAO_VERMELHO: "Suspenso (vermelho)",
};
