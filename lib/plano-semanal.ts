/**
 * §8.8.1 — Geração de datas do plano semanal (helper puro, sem I/O).
 *
 * Dado um intervalo de datas e uma lista de dias da semana (ISO 1-7), devolve
 * todas as datas no intervalo cujo dia da semana está na lista. É a base da
 * geração de sessões (`criarPlanoSemanal`) e da pré-visualização
 * (`preverPlanoSemanal`). Sendo pura, é testável isoladamente.
 *
 * Nunca devolve datas anteriores a `hoje` (o plano nunca gera treinos no
 * passado — §8.8.1). `hoje` é injetável para testes deterministas; por defeito
 * usa o momento atual.
 */

/** Dia da semana ISO-8601 (1=segunda … 7=domingo) de uma data JS. */
export function diaSemanaISO(d: Date): number {
  const dow = d.getDay(); // 0=domingo … 6=sábado
  return dow === 0 ? 7 : dow;
}

/** Cópia da data ao início do dia (00:00:00.000, hora local). */
export function inicioDoDia(d: Date): Date {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/** Chave de calendário `YYYY-MM-DD` (hora local) para deduplicação por dia. */
export function chaveDia(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

// ─── Ancoragem ao fuso Europe/Lisbon (§ bug de timezone) ─────────────────────
//
// Em produção o processo Node corre em UTC. Usar `setHours` aplicaria a hora na
// TZ do processo (UTC) e não em Lisboa, gerando +1h no Verão (WEST=UTC+1). Estas
// funções ancoram a combinação data+hora ao fuso de Lisboa usando apenas `Intl`
// nativo, sendo por isso independentes da TZ do processo.

const FUSO_LISBOA = "Europe/Lisbon";

const _fmtLisboa = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO_LISBOA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface PartesData {
  ano: number;
  mes: number; // 1-12
  dia: number;
  hora: number; // 0-23
  min: number;
  seg: number;
}

/** Decompõe um instante nas suas partes de calendário/relógio no fuso de Lisboa. */
function partesEmLisboa(instante: Date): PartesData {
  const partes = _fmtLisboa.formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  return {
    ano: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    hora: valor("hour"),
    min: valor("minute"),
    seg: valor("second"),
  };
}

/** Offset (ms) do fuso de Lisboa face ao UTC no instante dado (ex.: +3600000 no Verão). */
function offsetLisboaMs(instante: Date): number {
  const p = partesEmLisboa(instante);
  const comoUTC = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.min, p.seg);
  return comoUTC - instante.getTime();
}

/**
 * Converte uma hora de parede de Lisboa (ano/mês/dia/hora/min) no instante UTC
 * correspondente, independente da TZ do processo Node.
 */
function horaParedeLisboaParaInstante(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  min: number,
): Date {
  const palpiteUTC = Date.UTC(ano, mes - 1, dia, hora, min, 0);
  const offset = offsetLisboaMs(new Date(palpiteUTC));
  let instante = palpiteUTC - offset;
  // Refinar uma vez para instantes junto às transições DST (offset pode mudar).
  const offsetRefinado = offsetLisboaMs(new Date(instante));
  if (offsetRefinado !== offset) instante = palpiteUTC - offsetRefinado;
  return new Date(instante);
}

/**
 * Combina o dia de `data` (interpretado no fuso de Lisboa) com a hora "HH:MM"
 * (hora de parede de Lisboa) e devolve o instante UTC correspondente.
 *
 * Ancorado a Europe/Lisbon: o resultado é correto independentemente da TZ do
 * processo Node (UTC em produção, Lisboa em desenvolvimento).
 */
export function combinarDataHora(data: Date, hora: string): Date {
  const [h, m] = hora.split(":").map(Number);
  const { ano, mes, dia } = partesEmLisboa(data);
  return horaParedeLisboaParaInstante(ano, mes, dia, h, m);
}

/** "HH:MM" (hora local) de uma data. */
export function horaDeData(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Minutos entre duas horas "HH:MM" (fim − início). */
export function duracaoEntreHoras(inicio: string, fim: string): number {
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  return hf * 60 + mf - (hi * 60 + mi);
}

/** "HH:MM" resultante de somar `minutos` a uma hora "HH:MM" (limitado a 23:59). */
export function somarMinutos(inicio: string, minutos: number): string {
  const [hi, mi] = inicio.split(":").map(Number);
  const total = Math.min(hi * 60 + mi + minutos, 23 * 60 + 59);
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Todas as datas (ao início do dia) no intervalo [dataInicio, dataFim] cujo dia
 * da semana ISO está em `diasSemana`, excluindo datas anteriores a `hoje`.
 *
 * @param dataInicio Início do intervalo (inclusive).
 * @param dataFim    Fim do intervalo (inclusive).
 * @param diasSemana Dias ISO a incluir (1=segunda … 7=domingo).
 * @param hoje       Momento de referência para o corte do passado (default: agora).
 */
export function gerarDatasDePlano(
  dataInicio: Date,
  dataFim: Date,
  diasSemana: number[],
  hoje: Date = new Date(),
): Date[] {
  const dias = new Set(diasSemana);
  if (dias.size === 0) return [];

  const fim = inicioDoDia(dataFim);
  const corte = inicioDoDia(hoje);

  // Arranca no maior de (dataInicio, hoje): nunca gera no passado.
  const inicioIntervalo = inicioDoDia(dataInicio);
  let cursor = inicioIntervalo.getTime() < corte.getTime() ? corte : inicioIntervalo;

  const datas: Date[] = [];
  while (cursor.getTime() <= fim.getTime()) {
    if (dias.has(diaSemanaISO(cursor))) {
      datas.push(new Date(cursor));
    }
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return datas;
}
