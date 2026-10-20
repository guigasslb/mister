// ─────────────────────────────────────────────────────────────────────────────
// Erros de corrida do impacto em /jogos (§23.6 regra R3): o que foi pré-visualizado
// mudou antes da gravação. Módulo partilhado (fora de `"use server"`) para a UI
// detetar o caso e reabrir/recalcular o impacto.
// ─────────────────────────────────────────────────────────────────────────────

export const ERRO_IMPACTO_CONFRONTO =
  "Entretanto mudou algo nos jogos deste confronto. Revê o impacto e confirma de novo.";
export const ERRO_IMPACTO_COMPETICAO =
  "Entretanto mudou algo nos jogos desta competição. Revê o impacto e confirma de novo.";

/** A mensagem de erro é uma corrida de impacto (igualdade exata com as constantes). */
export function eErroImpactoDesatualizado(mensagem: string): boolean {
  return mensagem === ERRO_IMPACTO_CONFRONTO || mensagem === ERRO_IMPACTO_COMPETICAO;
}
