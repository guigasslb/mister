/**
 * Adaptadores de cliente para as Server Actions do Modo Jogo ao Vivo (§8.25.9),
 * implementadas em `lib/actions/jogo-ao-vivo.ts`. Este módulo é **puro** (sem I/O):
 * só converte as estruturas locais (offline-first, `lib/jogo-ao-vivo-local.ts`) nos
 * *inputs* Zod que as actions esperam (`lib/schemas/jogo-ao-vivo.ts`).
 */

import type { EventoLocal } from "@/lib/jogo-ao-vivo-local";
import type {
  EventoAoVivoClienteInput,
  EventoEdicaoInput,
} from "@/lib/schemas/jogo-ao-vivo";

/** Linha do editor manual de minutos (§8.25.6): um intervalo por atleta. */
export interface IntervaloManual {
  atletaId: string;
  entradaSegundo: number;
  saidaSegundo: number;
}

/** Converte um evento local (outbox) no *input* da action `sincronizarJogoAoVivo`. */
export function paraEventoCliente(e: EventoLocal): EventoAoVivoClienteInput {
  return {
    tipo: e.tipo,
    segundoJogo: e.segundoJogo,
    atletaId: e.atletaId ?? undefined,
    parte: e.parte ?? undefined,
    posicao: e.posicao ?? undefined,
    clientEventoId: e.clientEventoId,
  };
}

/**
 * Converte os intervalos do editor tabular em eventos `ENTRADA`/`SAIDA` + um
 * `FIM_PARTE` final (define o segundo final do cálculo de minutos), no formato de
 * `editarEventosJogoAoVivo` (§8.25.6). Só inclui intervalos válidos (saída > entrada).
 */
export function intervalosParaEventos(intervalos: IntervaloManual[]): EventoEdicaoInput[] {
  const eventos: EventoEdicaoInput[] = [];
  let segundoFinal = 0;
  for (const i of intervalos) {
    if (i.saidaSegundo <= i.entradaSegundo) continue;
    eventos.push({ tipo: "ENTRADA", segundoJogo: i.entradaSegundo, atletaId: i.atletaId });
    eventos.push({ tipo: "SAIDA", segundoJogo: i.saidaSegundo, atletaId: i.atletaId });
    segundoFinal = Math.max(segundoFinal, i.saidaSegundo);
  }
  if (eventos.length > 0) {
    eventos.push({ tipo: "FIM_PARTE", segundoJogo: segundoFinal });
  }
  return eventos;
}
