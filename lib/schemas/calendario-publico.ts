import { z } from "zod";

// Calendário público de jogos do escalão (bíblia §8.11.1). Fonte única de
// validação, partilhada cliente/servidor.

/** Bytes aleatórios do token (24 bytes → 32 caracteres base64url). */
export const BYTES_TOKEN_CALENDARIO = 24;

/** Prefixo da rota pública (fora do matcher de autenticação, como `/r/[token]`). */
export const PREFIXO_CALENDARIO_PUBLICO = "/r/calendario/";

/** Gerar/regenerar ou revogar o link público do calendário de um escalão. */
export const linkCalendarioPublicoSchema = z.object({
  escalaoId: z.string().cuid(),
});

/**
 * Token recebido no URL público (não confiável): exatamente 32 caracteres
 * base64url. Tudo o resto é recusado antes de chegar à BD.
 */
export const tokenCalendarioPublicoSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{32}$/);

/** Caminho relativo da página pública para um token. */
export function caminhoCalendarioPublico(token: string): string {
  return `${PREFIXO_CALENDARIO_PUBLICO}${token}`;
}
