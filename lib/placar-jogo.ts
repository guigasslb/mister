import type { Prisma } from "@prisma/client";

/**
 * Recalcula o resultado do jogo (`golosMarcados`/`golosSofridos`) a partir da
 * contagem de eventos `GOLO`/`GOLO_SOFRIDO` do jogo. Mantém o placar sincronizado
 * com o registo de eventos, seja ele feito no separador clássico
 * (`registarEventoJogo`, §8.11) ou no Modo Jogo ao Vivo
 * (`sincronizarJogoAoVivo`, §8.25). Corre sempre dentro de uma transação (recebe
 * o `tx`).
 *
 * É **idempotente por construção**: conta os eventos existentes; como o *sync* do
 * Modo Jogo ao Vivo faz *upsert* idempotente por `clientEventoId`
 * (`@@unique([jogoId, clientEventoId])`), re-sincronizar não duplica eventos e o
 * placar mantém-se estável.
 *
 * Função partilhada (fora de `"use server"`) para poder ser reutilizada pelas
 * várias actions sem a expor como Server Action.
 */
export async function recalcularResultadoJogo(
  tx: Prisma.TransactionClient,
  jogoId: string,
): Promise<void> {
  const [golosMarcados, golosSofridos] = await Promise.all([
    tx.eventoJogo.count({ where: { jogoId, tipo: "GOLO" } }),
    tx.eventoJogo.count({ where: { jogoId, tipo: "GOLO_SOFRIDO" } }),
  ]);
  await tx.jogo.update({
    where: { id: jogoId },
    data: { golosMarcados, golosSofridos },
  });
}
