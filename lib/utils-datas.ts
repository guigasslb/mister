// Conversão de datas entre o "wall clock" de Lisboa (o que o utilizador vê e
// escreve num <input type="datetime-local">) e o instante UTC guardado na BD.
//
// Porquê: um <input datetime-local> produz strings NAIVE (sem fuso), ex.
// "2026-08-30T18:00". Se essa string for enviada crua para o servidor e o
// servidor correr em UTC (produção), `new Date("2026-08-30T18:00")` é
// interpretado no fuso do servidor — divergindo do fuso do utilizador e
// causando desfasamentos (ex.: +1h no verão de Lisboa, UTC+1).
//
// A app é exclusivamente portuguesa, pelo que o fuso canónico é Europe/Lisbon
// (ver `lib/comunicacao-utils.ts` e `lib/google-calendar.ts`). Estes helpers
// interpretam/formatam sempre nesse fuso, usando apenas `Intl` nativo (sem
// dependências externas) para respeitar automaticamente o horário de verão.

/** Fuso canónico da aplicação (Portugal continental). */
export const FUSO_LISBOA = "Europe/Lisbon";

/**
 * Minutos que Lisboa está adiantada face ao UTC para uma dada data wall-clock.
 * Verão (WEST, UTC+1) → 60; inverno (WET, UTC+0) → 0.
 *
 * Estratégia: tratamos os componentes do wall-clock como se fossem UTC (probe)
 * e perguntamos ao `Intl` que horas seriam em Lisboa nesse instante. A diferença
 * entre a leitura de Lisboa e o probe é o offset do fuso.
 */
function offsetLisboaMinutos(wallClock: string): number {
  const probe = new Date(wallClock + "Z"); // componentes tratados como UTC
  const leituraLisboa = new Intl.DateTimeFormat("sv-SE", {
    timeZone: FUSO_LISBOA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(probe);
  const lisboaComoUtc = new Date(leituraLisboa.replace(" ", "T") + "Z");
  return (lisboaComoUtc.getTime() - probe.getTime()) / 60000;
}

/**
 * Interpreta uma string "YYYY-MM-DDTHH:mm" (sem fuso) como hora de parede de
 * Lisboa e devolve o `Date` (instante UTC) correspondente.
 *
 * Ex.: no verão, "2026-08-30T18:00" (Lisboa, UTC+1) → 2026-08-30T17:00Z.
 */
export function wallClockLisbonToInstant(wallClock: string): Date {
  const comoUtc = new Date(wallClock + "Z"); // componentes tratados como UTC
  const offset = offsetLisboaMinutos(wallClock);
  return new Date(comoUtc.getTime() - offset * 60000);
}

/**
 * Converte um instante (`Date` UTC) para a string "YYYY-MM-DDTHH:mm" em hora de
 * parede de Lisboa, pronta a alimentar um <input type="datetime-local">.
 *
 * Ex.: no verão, 2026-08-30T17:00Z → "2026-08-30T18:00".
 */
export function instantToWallClockLisbon(date: Date): string {
  const formatador = new Intl.DateTimeFormat("sv-SE", {
    timeZone: FUSO_LISBOA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatador.format(date).replace(" ", "T").slice(0, 16);
}

/**
 * Formata um instante (Date/ISO/epoch) em pt-PT, SEMPRE no fuso de Lisboa.
 *
 * Necessário porque os Server Components correm em UTC (produção): sem fixar o
 * fuso, `toLocaleString`/`toLocaleTimeString` usariam UTC e mostrariam a hora
 * −1h no verão de Lisboa (bug do detalhe do treino: 18:30 exibido como 17:30).
 * Ao fixar Europe/Lisbon o resultado é correto e idêntico em servidor e cliente,
 * respeitando automaticamente o horário de verão (WEST/WET).
 */
export function formatarDataHoraLisboa(
  data: Date | string | number,
  opcoes: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: FUSO_LISBOA,
    ...opcoes,
  }).format(new Date(data));
}

/**
 * Componentes wall-clock de Lisboa (números), para lógica dependente do dia/hora
 * (ex.: detetar 00:00 «sem hora», agrupar eventos por dia) sem depender do fuso
 * do runtime. Substitui `getHours()`/`getDate()`/… que usam o fuso do servidor.
 */
export function partesDataLisboa(data: Date | string | number): {
  ano: number;
  mes: number; // 1-12
  dia: number;
  hora: number; // 0-23
  minuto: number;
} {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO_LISBOA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(data));
  const valor = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)!.value);
  return {
    ano: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    hora: valor("hour") % 24, // en-GB pode devolver "24" à meia-noite
    minuto: valor("minute"),
  };
}
