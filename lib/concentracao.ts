import {
  formatarDataHoraLisboa,
  instantToWallClockLisbon,
  partesDataLisboa,
  wallClockLisbonToInstant,
} from "@/lib/utils-datas";

/**
 * Concentração do jogo (bíblia §3.7/§8.11) — helpers puros partilhados pelo
 * formulário, pelo detalhe do jogo e pelo calendário público. A hora guarda-se
 * como instante (`Jogo.horaConcentracao`), composta no fuso de Lisboa com o dia
 * do jogo.
 */

/** "HH:MM" (Lisboa) para o `<input type="time">`; "" sem concentração. */
export function horaConcentracaoParaInput(hora: Date | string | null | undefined): string {
  if (!hora) return "";
  return instantToWallClockLisbon(new Date(hora)).slice(11, 16);
}

/**
 * Compõe o instante da concentração a partir do valor `datetime-local` do jogo
 * ("YYYY-MM-DDTHH:MM", Lisboa) e da hora "HH:MM". Sem hora (ou sem data) → null.
 */
export function comporHoraConcentracao(dataJogoWallClock: string, hora: string): Date | null {
  const dia = /^(\d{4}-\d{2}-\d{2})T/.exec(dataJogoWallClock)?.[1];
  if (!dia || !/^\d{2}:\d{2}$/.test(hora)) return null;
  return wallClockLisbonToInstant(`${dia}T${hora}`);
}

function mesmoDiaLisboa(a: Date | string, b: Date | string): boolean {
  const pa = partesDataLisboa(a);
  const pb = partesDataLisboa(b);
  return pa.ano === pb.ano && pa.mes === pb.mes && pa.dia === pb.dia;
}

/** «09:15» no dia do jogo; noutro dia «sáb., 24/10 · 09:15». */
export function formatarConcentracao(hora: Date | string, dataJogo: Date | string): string {
  const hhmm = formatarDataHoraLisboa(hora, { hour: "2-digit", minute: "2-digit" });
  if (mesmoDiaLisboa(hora, dataJogo)) return hhmm;
  const dia = formatarDataHoraLisboa(hora, { weekday: "short", day: "2-digit", month: "2-digit" });
  return `${dia} · ${hhmm}`;
}
