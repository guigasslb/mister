// Duração dos exercícios de uma sessão de treino com exercícios em PARALELO (bíblia §3.5).
//
// Função pura, sem I/O — vive fora de `lib/actions/` (um módulo `"use server"` só pode
// exportar funções `async`) para ser usada diretamente em componentes e testada.

/**
 * Minutos totais dos exercícios: as linhas sequenciais (`grupoParalelo = null`) somam;
 * cada grupo paralelo conta UMA vez, com a maior duração dos seus membros
 * (10 min ∥ 10 min = 10 min). Durações em falta (`null`) contam 0.
 */
export function calcularDuracaoExercicios(
  itens: { duracaoMin: number | null; grupoParalelo: string | null }[],
): number {
  let sequencial = 0;
  const maxPorGrupo = new Map<string, number>();
  for (const { duracaoMin, grupoParalelo } of itens) {
    const minutos = duracaoMin ?? 0;
    if (grupoParalelo === null) {
      sequencial += minutos;
    } else {
      maxPorGrupo.set(grupoParalelo, Math.max(maxPorGrupo.get(grupoParalelo) ?? 0, minutos));
    }
  }
  let total = sequencial;
  for (const minutos of maxPorGrupo.values()) total += minutos;
  return total;
}
