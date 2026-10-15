// Ordenação da lista de jogos (§8.11 › Calendário/Lista).
//
// Regra: primeiro os jogos **futuros** (data >= agora) por data ascendente —
// o próximo jogo fica no topo —; depois os jogos **passados** por data
// descendente — o mais recente primeiro, o mais antigo no fim da lista.
// Um jogo com data exatamente igual a `agora` conta como futuro.

type ComData = { data: Date | string };

function instante(d: Date | string): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

/** Comparator puro para `Array.prototype.sort` (estável em empates de data). */
export function compararJogosPorProximidade(
  a: ComData,
  b: ComData,
  agora: Date = new Date(),
): number {
  const ref = agora.getTime();
  const ta = instante(a.data);
  const tb = instante(b.data);
  const futuroA = ta >= ref;
  const futuroB = tb >= ref;
  if (futuroA !== futuroB) return futuroA ? -1 : 1;
  return futuroA ? ta - tb : tb - ta;
}

/** Devolve uma cópia ordenada segundo `compararJogosPorProximidade`. */
export function ordenarJogosPorProximidade<T extends ComData>(
  jogos: readonly T[],
  agora: Date = new Date(),
): T[] {
  return [...jogos].sort((a, b) => compararJogosPorProximidade(a, b, agora));
}
