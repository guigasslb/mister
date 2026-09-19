import { z } from "zod";
import { Posicao } from "@prisma/client";

/**
 * Schemas Zod do Modo Jogo ao Vivo (§8.25.9/§8.25.10 da bíblia `docs/Mister_Spec_v7.md`).
 * Fonte única de validação partilhada cliente/servidor (§7.1). As `server actions`
 * em `lib/actions/jogo-ao-vivo.ts` validam sempre o input contra estes schemas.
 */

/**
 * Tipos de `EventoJogo` que pertencem ao Modo Jogo ao Vivo (subconjunto aditivo de
 * `TipoEventoJogo`, §8.25.8). Os eventos clássicos (GOLO, CARTAO_*, …) são geridos
 * pelas actions de `lib/actions/jogos.ts` e não são tocados aqui.
 */
export const TIPOS_EVENTO_AO_VIVO = [
  "INICIO_PARTE",
  "FIM_PARTE",
  "ENTRADA",
  "SAIDA",
  "PAUSA",
  "RETOMA",
] as const;

export type TipoEventoAoVivo = (typeof TIPOS_EVENTO_AO_VIVO)[number];

// ─── 1. iniciarJogoAoVivo ──────────────────────────────────────────────────────

/** Titular no arranque: atleta convocado + posição opcional (para a vista de campo). */
export const titularSchema = z.object({
  atletaId: z.string().cuid(),
  posicao: z.nativeEnum(Posicao).nullable().optional(),
});

/**
 * Configuração de arranque: nº de partes (2..4, RN-JV-5), duração de cada parte em
 * minutos (opcional, default no schema Prisma = 20) e titulares em campo. O nº exato
 * de titulares (= tamanho do formato, RN-JV-1) é validado na action, que conhece o
 * `formato` do jogo.
 */
export const iniciarJogoAoVivoSchema = z.object({
  numeroPartes: z.number().int().min(2).max(4),
  duracaoParteMins: z.number().int().min(1).max(60).optional(),
  titulares: z.array(titularSchema).min(1, "Indica os titulares."),
});

export type IniciarJogoAoVivoInput = z.infer<typeof iniciarJogoAoVivoSchema>;

// ─── 4./5. Substituições ───────────────────────────────────────────────────────

/** Uma substituição: quem sai, quem entra e a posição opcional de quem entra. */
export const substituicaoSchema = z.object({
  sai: z.string().cuid(),
  entra: z.string().cuid(),
  posicao: z.nativeEnum(Posicao).nullable().optional(),
});

export type SubstituicaoInput = z.infer<typeof substituicaoSchema>;

/** Substituição em campo (durante a parte), com o segundo corrente do cronómetro. */
export const substituirEmCampoSchema = substituicaoSchema.extend({
  segundoJogo: z.number().int().min(0),
});

export type SubstituirEmCampoInput = z.infer<typeof substituirEmCampoSchema>;

/** Troca em bloco (tipicamente no intervalo): lista de substituições atómicas. */
export const trocaEmBlocoSchema = z
  .array(substituicaoSchema)
  .min(1, "Indica pelo menos uma troca.");

export type TrocaEmBlocoInput = z.infer<typeof trocaEmBlocoSchema>;

// ─── Segundos (pausar/retomar/terminar) ────────────────────────────────────────

/** Segundo absoluto do cronómetro contínuo (0 = apito inicial da Parte 1). */
export const segundoSchema = z.number().int().min(0);

// ─── 9. Nota ao vivo ───────────────────────────────────────────────────────────

/** Nota de beira-campo; guardada na chave `notasAoVivo` de `Jogo.relatorio`. */
export const notaAoVivoSchema = z.string().max(5000);

// ─── 10. Sincronização (outbox offline) ────────────────────────────────────────

/**
 * Evento ao vivo vindo do cliente (offline-first). `clientEventoId` é OBRIGATÓRIO
 * (RN-JV-8) — é a chave de idempotência do *sync* (`@@unique([jogoId,
 * clientEventoId])`). ENTRADA/SAIDA exigem `atletaId`.
 */
export const eventoAoVivoClienteSchema = z
  .object({
    tipo: z.enum(TIPOS_EVENTO_AO_VIVO),
    segundoJogo: z.number().int().min(0),
    atletaId: z.string().cuid().nullable().optional(),
    parte: z.number().int().min(1).max(4).nullable().optional(),
    posicao: z.nativeEnum(Posicao).nullable().optional(),
    clientEventoId: z.string().min(1, "clientEventoId é obrigatório (idempotência)."),
  })
  .refine((e) => !(e.tipo === "ENTRADA" || e.tipo === "SAIDA") || !!e.atletaId, {
    message: "ENTRADA/SAIDA requerem atletaId.",
    path: ["atletaId"],
  });

export type EventoAoVivoClienteInput = z.infer<typeof eventoAoVivoClienteSchema>;

export const sincronizarEventosSchema = z.array(eventoAoVivoClienteSchema);

// ─── 11. Edição retroativa ─────────────────────────────────────────────────────

/**
 * Evento na edição manual/tabular (§8.25.6). Igual ao do cliente mas com
 * `clientEventoId` OPCIONAL (a inserção retroativa pode não ter passado pela
 * *outbox*). ENTRADA/SAIDA continuam a exigir `atletaId`.
 */
export const eventoEdicaoSchema = z
  .object({
    tipo: z.enum(TIPOS_EVENTO_AO_VIVO),
    segundoJogo: z.number().int().min(0),
    atletaId: z.string().cuid().nullable().optional(),
    parte: z.number().int().min(1).max(4).nullable().optional(),
    posicao: z.nativeEnum(Posicao).nullable().optional(),
    clientEventoId: z.string().min(1).nullable().optional(),
  })
  .refine((e) => !(e.tipo === "ENTRADA" || e.tipo === "SAIDA") || !!e.atletaId, {
    message: "ENTRADA/SAIDA requerem atletaId.",
    path: ["atletaId"],
  });

export type EventoEdicaoInput = z.infer<typeof eventoEdicaoSchema>;

export const editarEventosSchema = z.array(eventoEdicaoSchema);
