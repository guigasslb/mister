/**
 * §8.9.1 — Semana de trabalho (helpers puros).
 *
 * A UI expõe sempre o conceito de «Semana» (nunca «Microciclo»). As sessões
 * agrupam-se por semana ISO (segunda a domingo) automaticamente pela data.
 * Estas funções são puras (sem I/O) para poderem ser testadas e partilhadas
 * entre a sugestão de planeamento e a agregação de sessões por semana.
 */

const MS_DIA = 24 * 60 * 60 * 1000;

/** Segunda-feira (00:00) da semana ISO que contém `d`. */
export function segundaFeira(d: Date): Date {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const dow = dt.getDay(); // 0 = domingo … 6 = sábado
  const desloca = dow === 0 ? -6 : 1 - dow; // recua até segunda
  dt.setDate(dt.getDate() + desloca);
  return dt;
}

/** Domingo (00:00) da semana ISO que contém `d`. */
export function domingo(d: Date): Date {
  const seg = segundaFeira(d);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  return dom;
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

/** Início do dia (00:00) de `d`. */
export function inicioDoDia(d: Date): Date {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
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
