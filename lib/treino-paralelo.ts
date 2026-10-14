/**
 * Exercícios em PARALELO na sessão de treino (§3.5): linhas com o mesmo
 * `grupoParalelo` (não-null) decorrem em simultâneo. Os membros de um grupo
 * ocupam valores de `ordem` consecutivos; dentro do grupo, `ordem` = coluna
 * da esquerda para a direita. Null = exercício sequencial.
 */

/**
 * Junta a sequência (já ordenada por `ordem`) em blocos: linhas SEGUIDAS com o
 * mesmo `grupoParalelo` não-null formam um bloco lado a lado; cada exercício
 * sequencial forma um bloco de um só elemento. Não muta o array recebido.
 */
export function agruparEmBlocos<T extends { grupoParalelo: string | null }>(
  itens: readonly T[],
): T[][] {
  const blocos: T[][] = [];
  for (const item of itens) {
    const ultimo = blocos[blocos.length - 1];
    if (
      item.grupoParalelo !== null &&
      ultimo !== undefined &&
      ultimo[0].grupoParalelo === item.grupoParalelo
    ) {
      ultimo.push(item);
    } else {
      blocos.push([item]);
    }
  }
  return blocos;
}

/** Letra da coluna de um exercício dentro de um bloco paralelo (0 → "a", 1 → "b"…). */
export function letraColuna(indice: number): string {
  return String.fromCharCode(97 + indice);
}
