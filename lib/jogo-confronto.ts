import type { CasaFora } from "@prisma/client";

/**
 * Confronto de um jogo ("Nós vs Adversário") — fonte única para compor o título
 * de um jogo de forma consistente em toda a app (§9). O nome da nossa equipa é
 * SEMPRE o nome do clube do utilizador (nunca "Nós" nem vazio); a ordem casa–fora
 * respeita `casaFora` (em casa: nós à esquerda; fora: nós à direita).
 */

/** Rótulo de recurso quando, por algum motivo, o clube não tem nome definido. */
export const NOME_EQUIPA_FALLBACK = "A nossa equipa";

/** Nome do clube saneado: nunca vazio (cai para o fallback). */
export function nomeClubeSeguro(clubeNome: string | null | undefined): string {
  const n = clubeNome?.trim();
  return n && n.length > 0 ? n : NOME_EQUIPA_FALLBACK;
}

/**
 * Ordena as duas equipas do confronto conforme casa/fora.
 * `casaEhNossa` indica se a nossa equipa (o clube) fica do lado "casa".
 */
export function ordemConfronto(
  clubeNome: string | null | undefined,
  adversario: string,
  casaFora: CasaFora,
): { casa: string; fora: string; casaEhNossa: boolean } {
  const nome = nomeClubeSeguro(clubeNome);
  const casaEhNossa = casaFora === "CASA";
  return casaEhNossa
    ? { casa: nome, fora: adversario, casaEhNossa }
    : { casa: adversario, fora: nome, casaEhNossa };
}

/** Título textual do confronto: "A vs B" na ordem casa–fora. */
export function tituloConfronto(
  clubeNome: string | null | undefined,
  adversario: string,
  casaFora: CasaFora,
): string {
  const { casa, fora } = ordemConfronto(clubeNome, adversario, casaFora);
  return `${casa} vs ${fora}`;
}
