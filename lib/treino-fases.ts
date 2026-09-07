import { PARTES_TREINO, type ParteTreinoValor } from "@/lib/schemas/exercicio";

/**
 * Ordenação por fase do treino (§3.5) — usada na condução do treino (ModoTreino)
 * para apresentar os exercícios sempre na sequência canónica das fases,
 * independentemente da ordem com que foram adicionados ao plano.
 *
 * Ordem canónica: Aquecimento → Parte principal → Jogo → Retorno à calma.
 * Exercícios sem fase (rows legadas) vão para o fim, num bucket próprio.
 */

/** Sentinela para exercícios sem fase atribuída (linhas legadas). */
export const SEM_FASE = "SEM_FASE" as const;
export type FaseKey = ParteTreinoValor | typeof SEM_FASE;

/** Ordem canónica das fases + bucket "sem fase" no fim. */
export const ORDEM_FASES: FaseKey[] = [...PARTES_TREINO, SEM_FASE];

/** Chave de fase de um exercício (null → bucket "sem fase"). */
export function faseDe(parte: ParteTreinoValor | null): FaseKey {
  return parte ?? SEM_FASE;
}

/** Posição da fase na ordem canónica — chave primária da ordenação. */
export function ordemDaFase(parte: ParteTreinoValor | null): number {
  return ORDEM_FASES.indexOf(faseDe(parte));
}

/**
 * Ordena os exercícios pela ordem canónica das fases, preservando a posição
 * original (`ordem`) dentro de cada fase. `Array.sort` é estável (ES2019+), por
 * isso ordenar só pela fase mantém a sequência de entrada dentro de cada grupo.
 * Não muta o array recebido.
 */
export function ordenarExerciciosPorFase<
  T extends { parteTreino: ParteTreinoValor | null },
>(exercicios: readonly T[]): T[] {
  return [...exercicios].sort(
    (a, b) => ordemDaFase(a.parteTreino) - ordemDaFase(b.parteTreino),
  );
}

/**
 * Fases presentes (com exercícios), na ordem canónica, com o índice do 1.º
 * exercício de cada uma — alimenta a navegação por fase (salto direto).
 * Assume `exerciciosOrdenados` já ordenado por {@link ordenarExerciciosPorFase}.
 */
export function fasesComExercicios<
  T extends { parteTreino: ParteTreinoValor | null },
>(exerciciosOrdenados: readonly T[]): { fase: FaseKey; indice: number }[] {
  const primeiro = new Map<FaseKey, number>();
  exerciciosOrdenados.forEach((e, i) => {
    const fase = faseDe(e.parteTreino);
    if (!primeiro.has(fase)) primeiro.set(fase, i);
  });
  return ORDEM_FASES.filter((f) => primeiro.has(f)).map((fase) => ({
    fase,
    indice: primeiro.get(fase)!,
  }));
}
