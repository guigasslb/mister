import { z } from "zod";
import { Posicao } from "@prisma/client";

/**
 * Schemas Zod do Modo Jogo ao Vivo (§8.25.9/§8.25.10 da bíblia `docs/Mister_Spec_v7.md`).
 * Fonte única de validação partilhada cliente/servidor (§7.1). As `server actions`
 * em `lib/actions/jogo-ao-vivo.ts` validam sempre o input contra estes schemas.
 */

/**
 * Tipos de `EventoJogo` do **cronómetro / quintetos** do Modo Jogo ao Vivo
 * (subconjunto aditivo de `TipoEventoJogo`, §8.25.8). São as primitivas que
 * sustentam o cálculo de minutos por intervalos ao segundo. A edição retroativa
 * (§8.25.6) opera exclusivamente sobre este subconjunto.
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

/**
 * 🔁 v7 Fase B (§8.25.3/§8.25.7): tipos de **captura ao vivo** de golos,
 * assistências e disciplina, agora registáveis no Modo Jogo ao Vivo (deixam de
 * viver só no separador clássico). São contabilizados pelo motor único
 * (`derivarEstatisticas`, §10.4) exatamente como os eventos clássicos.
 */
export const TIPOS_EVENTO_CAPTURA_AO_VIVO = [
  "GOLO",
  "GOLO_SOFRIDO",
  "ASSISTENCIA",
  "CARTAO_AMARELO",
  "CARTAO_VERMELHO",
] as const;

export type TipoEventoCapturaAoVivo =
  (typeof TIPOS_EVENTO_CAPTURA_AO_VIVO)[number];

/**
 * Universo de tipos aceites na **sincronização** da *outbox* do Modo Jogo ao Vivo
 * (§8.25.4): cronómetro/quintetos + captura de golos/assistências/disciplina.
 */
export const TIPOS_EVENTO_SYNC = [
  ...TIPOS_EVENTO_AO_VIVO,
  ...TIPOS_EVENTO_CAPTURA_AO_VIVO,
] as const;

export type TipoEventoSync = (typeof TIPOS_EVENTO_SYNC)[number];

/** Tipos que exigem `atletaId` obrigatório no *sync* (RN-JV-8, decisão 2026-09-20). */
const TIPOS_EXIGEM_ATLETA: readonly string[] = [
  "ENTRADA",
  "SAIDA",
  "ASSISTENCIA",
  "CARTAO_AMARELO",
  "CARTAO_VERMELHO",
];

// ─── 1. iniciarJogoAoVivo ──────────────────────────────────────────────────────

/** Titular no arranque: atleta convocado + posição opcional (para a vista de campo). */
export const titularSchema = z.object({
  atletaId: z.string().cuid(),
  posicao: z.nativeEnum(Posicao).nullable().optional(),
});

/**
 * Configuração de arranque: duração de cada parte em minutos (opcional, default no
 * schema Prisma = 20) e titulares em campo. O nº de partes deixou de ser escolhido
 * no arranque (§8.25.8): a `SessaoJogoAoVivo` herda `numeroPartes` de `Jogo`
 * (definido na criação/edição). `numeroPartes` permanece OPCIONAL aqui apenas para
 * retrocompatibilidade do input (1..4, RN-JV-5 alargada); a action ignora-o e usa
 * o valor do jogo como fonte de verdade. O nº exato de titulares (= tamanho do
 * formato, RN-JV-1) é validado na action, que conhece o `formato` do jogo.
 */
export const iniciarJogoAoVivoSchema = z.object({
  numeroPartes: z.number().int().min(1).max(4).optional(),
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
 * clientEventoId])`).
 *
 * Aceita o cronómetro/quintetos **e** a captura de golos/assistências/disciplina
 * (Fase B, §8.25.3). Regras de `atletaId` (decisão do supervisor, 2026-09-20 —
 * modelo simples por toque):
 *  - `ENTRADA`/`SAIDA`, `ASSISTENCIA`, `CARTAO_AMARELO`/`CARTAO_VERMELHO` **exigem** `atletaId`;
 *  - `GOLO` e `GOLO_SOFRIDO` aceitam `atletaId` a `null` (golo sem autor / sem GR);
 *  - `atletaSecundarioId` só é significativo no `GOLO` (o assistente, opcional).
 */
export const eventoAoVivoClienteSchema = z
  .object({
    tipo: z.enum(TIPOS_EVENTO_SYNC),
    segundoJogo: z.number().int().min(0),
    atletaId: z.string().cuid().nullable().optional(),
    // Assistente do golo (Fase B): só usado quando `tipo === "GOLO"`.
    atletaSecundarioId: z.string().cuid().nullable().optional(),
    parte: z.number().int().min(1).max(4).nullable().optional(),
    posicao: z.nativeEnum(Posicao).nullable().optional(),
    clientEventoId: z.string().min(1, "clientEventoId é obrigatório (idempotência)."),
  })
  .refine((e) => !TIPOS_EXIGEM_ATLETA.includes(e.tipo) || !!e.atletaId, {
    message: "Este tipo de evento requer atletaId.",
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
