/**
 * §8.9.1 — Semana de trabalho (helpers puros).
 *
 * A UI expõe sempre o conceito de «Semana» (nunca «Microciclo»). As sessões
 * agrupam-se por semana ISO (segunda a domingo) automaticamente pela data.
 * Estas funções são puras (sem I/O) para poderem ser testadas e partilhadas
 * entre a sugestão de planeamento e a agregação de sessões por semana.
 *
 * ⚠️ Fuso: todas as fronteiras de dia/semana são ancoradas a `Europe/Lisbon`
 * (via `partesDataLisboa`/`wallClockLisbonToInstant`), nunca ao fuso do processo
 * Node. Em produção o processo corre em UTC; `getDay()`/`getDate()`/`setHours()`
 * colocariam as datas de Lisboa no dia errado (−1h no Verão, WEST=UTC+1),
 * quebrando o agrupamento por semana. Ver `lib/utils-datas.ts`.
 */

import { partesDataLisboa, wallClockLisbonToInstant } from "@/lib/utils-datas";
import { diaSemanaISO } from "@/lib/plano-semanal";

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Instante da meia-noite (00:00, hora de parede de Lisboa) do dia de calendário
 * `ano/mes/dia` (mês em base 1). Aceita `dia` fora do intervalo (ex.: `dia + 6`)
 * e normaliza via `Date.UTC` — composição fina sobre `wallClockLisbonToInstant`,
 * sem reimplementar lógica de fuso.
 */
function meiaNoiteLisboa(ano: number, mes: number, dia: number): Date {
  const norm = new Date(Date.UTC(ano, mes - 1, dia));
  const y = norm.getUTCFullYear();
  const m = String(norm.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(norm.getUTCDate()).padStart(2, "0");
  return wallClockLisbonToInstant(`${y}-${m}-${dd}T00:00`);
}

/** Segunda-feira (00:00 Lisboa) da semana ISO que contém `d`. */
export function segundaFeira(d: Date): Date {
  const { ano, mes, dia } = partesDataLisboa(d);
  const dow = diaSemanaISO(d); // 1 = segunda … 7 = domingo (dia de Lisboa)
  return meiaNoiteLisboa(ano, mes, dia + (1 - dow)); // recua até segunda
}

/** Domingo (00:00 Lisboa) da semana ISO que contém `d`. */
export function domingo(d: Date): Date {
  const { ano, mes, dia } = partesDataLisboa(d);
  const dow = diaSemanaISO(d); // 1 = segunda … 7 = domingo (dia de Lisboa)
  return meiaNoiteLisboa(ano, mes, dia + (7 - dow)); // avança até domingo
}

/**
 * Número da semana desde o início da época (1, 2, 3, …).
 *
 * Ancorado na segunda-feira da semana de `epocaInicio` e na segunda-feira da
 * semana de `data`, garantindo que todas as sessões da mesma semana ISO
 * partilham o mesmo número (grupos coerentes). Para uma época que começa à
 * segunda-feira, é equivalente à fórmula literal da bíblia
 * `Math.ceil((diferençaDias + 1) / 7)` medida desde `epocaInicio`.
 */
export function numeroSemana(epocaInicio: Date, data: Date): number {
  const ancora = segundaFeira(epocaInicio).getTime();
  const ref = segundaFeira(data).getTime();
  const diferencaDias = Math.round((ref - ancora) / MS_DIA);
  return Math.ceil((diferencaDias + 1) / 7);
}

/** True se a semana [segunda, domingo] se sobrepõe ao intervalo do planeamento. */
export function semanaSobrepoePlaneamento(
  segunda: Date,
  dom: Date,
  planInicio: Date,
  planFim: Date,
): boolean {
  return segunda.getTime() <= new Date(planFim).getTime() &&
    dom.getTime() >= new Date(planInicio).getTime();
}

/** Início do dia (00:00 Lisboa) de `d`. */
export function inicioDoDia(d: Date): Date {
  const { ano, mes, dia } = partesDataLisboa(d);
  return meiaNoiteLisboa(ano, mes, dia);
}

/**
 * True se um treino já foi realizado — ou seja, a data é estritamente anterior
 * ao dia de hoje (`data < inicioDoDia(agora)`). Um treino marcado para hoje
 * ainda NÃO está concluído (pode acontecer mais logo). Helper puro, partilhado
 * entre a lista e o detalhe do treino para tratamento visual consistente.
 */
export function treinoConcluido(data: Date, agora: Date = new Date()): boolean {
  return new Date(data).getTime() < inicioDoDia(agora).getTime();
}

/**
 * True se um treino já pode ser fechado/concluído pelo treinador — ou seja, o dia
 * do treino é hoje ou anterior (`inicioDoDia(data) <= inicioDoDia(agora)`). Ao
 * contrário de `treinoConcluido`, inclui o PRÓPRIO dia: se o treinador marcou
 * presenças e validou tudo hoje, deve poder fechar a sessão hoje. Não permite
 * fechar treinos futuros (ainda por acontecer). Helper puro para o gate do botão
 * de fechar, mantendo `treinoConcluido` intacto para o tratamento visual.
 */
export function treinoFechavel(data: Date, agora: Date = new Date()): boolean {
  return inicioDoDia(new Date(data)).getTime() <= inicioDoDia(agora).getTime();
}
