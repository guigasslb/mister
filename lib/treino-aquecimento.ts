import type { CategoriaExercicioPrincipal } from "@prisma/client";

/**
 * Adicionar exercícios da biblioteca à fase de aquecimento, sem sair do modo
 * treino (§8.8.2 ponto 3). Lógica pura de filtragem/ordenação do seletor rápido,
 * separada da UI para poder ser testada isoladamente (à imagem de
 * `lib/treino-fases.ts`).
 */

/** Item mínimo da biblioteca mostrado no seletor rápido do modo treino. */
export type ExercicioBibliotecaAquecimento = {
  id: string;
  nome: string;
  categoriaPrincipal: CategoriaExercicioPrincipal | null;
  duracaoMin: number | null;
};

/**
 * Filtra a biblioteca por termo de pesquisa (por nome, sem distinção de
 * maiúsculas) e ordena por nome (pt). Termo vazio devolve tudo, ordenado.
 * Não muta a lista recebida.
 */
export function filtrarBibliotecaAquecimento<T extends { nome: string }>(
  biblioteca: readonly T[],
  termo: string,
): T[] {
  const t = termo.trim().toLowerCase();
  return biblioteca
    .filter((ex) => t === "" || ex.nome.toLowerCase().includes(t))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
}
