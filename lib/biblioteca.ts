// Regras de visibilidade das bibliotecas 🎒 pessoal / 🏛️ clube (secções 3.3, 3.4 e 4.2).
// Módulo PURO (só constrói cláusulas Prisma) — partilhado pelas Server Actions de
// exercícios e de templates de sessão, que não podem exportar funções síncronas.

import type { Prisma } from "@prisma/client";

/** Origem de um item da biblioteca, para a UI distinguir 🎒 de 🏛️. */
export type OrigemBiblioteca = "PESSOAL" | "CLUBE";

/**
 * Escalões do clube `clubeId` COBERTOS por um membro (`utilizadorId`), de forma
 * declarativa e ciente do ÂMBITO do perfil (§6.3/§6.5/§6.9). Um membro cobre um
 * escalão por uma de três vias:
 *  - PROPRIOS_ESCALOES → tem uma atribuição explícita (`AtribuicaoEscalao`) a esse escalão;
 *  - TODO_CLUBE → cobre TODOS os escalões do clube (Administrador, Diretor Técnico,
 *    Presidente): NÃO existem linhas `AtribuicaoEscalao`, a cobertura vem do âmbito;
 *  - SECCAO → cobre os escalões da(s) secção(ões) que coordena (Coordenador de Secção):
 *    também sem `AtribuicaoEscalao`, a cobertura vem de `MembroSeccao`.
 *
 * Devolve um `EscalaoWhereInput` que casa exatamente com os escalões cobertos pelo
 * membro. Fundamental para a visibilidade por escalão partilhado: a versão anterior
 * só reconhecia a via PROPRIOS_ESCALOES, pelo que treinadores de âmbito TODO_CLUBE
 * ou SECCAO (que não têm `AtribuicaoEscalao`) nunca partilhavam escalão com ninguém
 * — e por isso não viam (nem eram vistos por) as bibliotecas pessoais dos colegas.
 */
function escalaoCobertoPor(
  clubeId: string,
  utilizadorId: string,
): Prisma.EscalaoWhereInput {
  return {
    clubeId,
    OR: [
      // PROPRIOS_ESCALOES: atribuição explícita membro↔escalão neste clube.
      { atribuicoes: { some: { membroClube: { clubeId, utilizadorId } } } },
      // TODO_CLUBE: o membro deste clube tem um perfil de âmbito TODO_CLUBE.
      {
        clube: {
          membros: {
            some: { utilizadorId, perfil: { ambito: "TODO_CLUBE" } },
          },
        },
      },
      // SECCAO: o membro coordena a secção a que este escalão pertence.
      {
        seccao: {
          membros: {
            some: { papel: "COORDENADOR", membroClube: { clubeId, utilizadorId } },
          },
        },
      },
    ],
  };
}

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
 * escalão em comum com o autor. "Partilhar um escalão" respeita o ÂMBITO de cada
 * perfil (não só as atribuições explícitas): TODO_CLUBE cobre todos os escalões do
 * clube e SECCAO cobre os escalões da secção coordenada (ver `escaloesCobertoPor`).
 * A condição é: existe um escalão E do clube ativo tal que o AUTOR cobre E e o
 * UTILIZADOR atual também cobre E. Expressa de forma declarativa (sem pré-query),
 * ancorando no percurso do autor:
 *   - autor PROPRIOS_ESCALOES → E é um escalão atribuído ao autor coberto pelo utilizador;
 *   - autor TODO_CLUBE        → E é qualquer escalão do clube coberto pelo utilizador;
 *   - autor SECCAO            → E é um escalão de uma secção do autor coberto pelo utilizador.
 * O próprio autor continua a ver o exercício pela alternativa 1 (autorId), pelo que
 * não depende de ter escalões atribuídos.
 *
 * Nota (fase expand F3/M5): enquanto o backfill M6 não corre, os exercícios
 * existentes têm `clubeProprietarioId = null` e só o `clubeId` legado preenchido —
 * daí a terceira/quarta alternativas, que os mantêm visíveis.
 */
export function filtroExerciciosVisiveis(
  clubeId: string,
  utilizadorId: string,
): Prisma.ExercicioWhereInput {
  // Escalões do clube ativo cobertos pelo utilizador atual (âmbito-aware).
  const cobertoPeloUtilizador = escalaoCobertoPor(clubeId, utilizadorId);

  return {
    OR: [
      { proprietario: "TREINADOR", autorId: utilizadorId },
      {
        proprietario: "TREINADOR",
        autor: {
          membros: {
            some: {
              clubeId,
              OR: [
                // Autor PROPRIOS_ESCALOES: um escalão atribuído ao autor que o
                // utilizador atual também cobre.
                { atribuicoes: { some: { escalao: cobertoPeloUtilizador } } },
                // Autor TODO_CLUBE: cobre todos os escalões do clube — basta que o
                // utilizador atual cubra algum escalão do clube.
                {
                  perfil: { ambito: "TODO_CLUBE" },
                  clube: { escaloes: { some: cobertoPeloUtilizador } },
                },
                // Autor SECCAO: um escalão de uma secção que o autor coordena e que
                // o utilizador atual também cobre.
                {
                  seccoes: {
                    some: {
                      papel: "COORDENADOR",
                      seccao: { escaloes: { some: cobertoPeloUtilizador } },
                    },
                  },
                },
              ],
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
