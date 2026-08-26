// Regras de visibilidade das bibliotecas 🎒 pessoal / 🏛️ clube (secções 3.3, 3.4 e 4.2).
// Módulo PURO (só constrói cláusulas Prisma) — partilhado pelas Server Actions de
// exercícios e de templates de sessão, que não podem exportar funções síncronas.

import type { Prisma } from "@prisma/client";

/** Origem de um item da biblioteca, para a UI distinguir 🎒 de 🏛️. */
export type OrigemBiblioteca = "PESSOAL" | "CLUBE";

/**
 * Exercícios visíveis para um membro:
 *  1. 🎒 pessoais do próprio (proprietario = TREINADOR, autorId = utilizador) —
 *     portáteis, viajam com o treinador entre clubes;
 *  2. 🎒 pessoais de treinadores que partilham pelo menos um escalão com o
 *     utilizador no clube ativo (visibilidade por escalão partilhado — ver abaixo);
 *  3. 🏛️ do clube ativo (proprietario = CLUBE);
 *  4. 🏛️ pessoais de qualquer treinador partilhados neste clube (PartilhaExercicioClube).
 *
 * Alternativa 2 (visibilidade por escalão partilhado): um exercício pessoal é
 * visível a todos os treinadores que coordenem, no clube ativo, pelo menos um
 * escalão em comum com o autor. Expresso de forma declarativa (sem pré-query) via
 * o caminho de relações:
 *   Exercicio.autor → membros(MembroClube deste clube) → atribuicoes(AtribuicaoEscalao)
 *     → escalao → atribuicoes → membroClube(deste clube, do utilizador atual).
 * Ou seja: existe um escalão atribuído ao autor que também está atribuído ao
 * utilizador atual, ambos como membros do mesmo clube. O próprio autor satisfaz
 * trivialmente a condição (partilha escalões consigo), sem duplicar linhas (o
 * findMany devolve linhas distintas por PK).
 *
 * Nota (fase expand F3/M5): enquanto o backfill M6 não corre, os exercícios
 * existentes têm `clubeProprietarioId = null` e só o `clubeId` legado preenchido —
 * daí a terceira/quarta alternativas, que os mantêm visíveis.
 */
export function filtroExerciciosVisiveis(
  clubeId: string,
  utilizadorId: string,
): Prisma.ExercicioWhereInput {
  return {
    OR: [
      { proprietario: "TREINADOR", autorId: utilizadorId },
      {
        proprietario: "TREINADOR",
        autor: {
          membros: {
            some: {
              clubeId,
              atribuicoes: {
                some: {
                  escalao: {
                    atribuicoes: {
                      some: { membroClube: { clubeId, utilizadorId } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      { proprietario: "CLUBE", clubeProprietarioId: clubeId },
      { proprietario: "CLUBE", clubeProprietarioId: null, clubeId },
      { partilhasClube: { some: { clubeId } } },
    ],
  };
}

/**
 * Templates de sessão visíveis: 🎒 pessoais do próprio + 🏛️ do clube ativo.
 * (Não há partilha pontual de templates — a contribuição transfere a propriedade.)
 */
export function filtroModelosSessaoVisiveis(
  clubeId: string,
  utilizadorId: string,
): Prisma.ModeloSessaoWhereInput {
  return {
    OR: [
      { proprietario: "TREINADOR", autorId: utilizadorId },
      { proprietario: "CLUBE", clubeProprietarioId: clubeId },
    ],
  };
}

/** Classifica um item como 🎒 pessoal (do próprio) ou 🏛️ do clube. */
export function origemDoItem(
  item: { proprietario: "CLUBE" | "TREINADOR"; autorId: string | null },
  utilizadorId: string,
): OrigemBiblioteca {
  return item.proprietario === "TREINADOR" && item.autorId === utilizadorId
    ? "PESSOAL"
    : "CLUBE";
}
