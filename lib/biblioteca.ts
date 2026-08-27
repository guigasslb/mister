// Regras de visibilidade das bibliotecas 🎒 pessoal / 🏛️ clube (secções 3.3, 3.4 e 4.2).
//
// `filtroModelosSessaoVisiveis` e `origemDoItem` são PUROS (só constroem/derivam
// cláusulas ou classificam). `filtroExerciciosVisiveis` é ASSÍNCRONO e pré-computa,
// em SQL simples, o conjunto de autores cujos 🎒 pessoais são visíveis por escalão
// partilhado (alternativa 2), aplicando-o depois como `autorId in (…)`.
//
// PORQUÊ a pré-computação: a condição da alternativa 2 — "o utilizador cobre, no clube
// ativo, pelo menos um escalão que o autor também cobre" — para autores de âmbito
// TODO_CLUBE é CONSTANTE por (clube, utilizador), não depende da linha do exercício.
// Exprimi-la como subquery correlacionado profundo (exercício → autor → membros →
// clube → escalões → cobertura do utilizador) leva o Prisma a gerar SQL que não casa
// os exercícios esperados (o filtro declarativo devolvia vazio mesmo com dados válidos).
// Ao resolver antes os `autorId` visíveis, o filtro final é uma disjunção de igualdades
// e um `in`, que o Prisma traduz de forma fiável.

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Origem de um item da biblioteca, para a UI distinguir 🎒 de 🏛️. */
export type OrigemBiblioteca = "PESSOAL" | "CLUBE";

/**
 * IDs dos escalões do clube `clubeId` COBERTOS por um membro (`utilizadorId`), cientes
 * do ÂMBITO do perfil (§6.3/§6.5/§6.9). Um membro cobre um escalão por uma de três vias:
 *  - PROPRIOS_ESCALOES → atribuição explícita (`AtribuicaoEscalao`) a esse escalão;
 *  - TODO_CLUBE → TODOS os escalões do clube (Administrador, Diretor Técnico,
 *    Presidente): NÃO existem linhas `AtribuicaoEscalao`, a cobertura vem do âmbito;
 *  - SECCAO → os escalões da(s) secção(ões) que coordena (Coordenador de Secção),
 *    também sem `AtribuicaoEscalao`, a cobertura vem de `MembroSeccao`.
 *
 * Devolve `[]` se o utilizador não é membro do clube (ou não cobre nenhum escalão).
 */
export async function escaloesCobertosPorUtilizador(
  clubeId: string,
  utilizadorId: string,
): Promise<string[]> {
  const membro = await prisma.membroClube.findFirst({
    where: { clubeId, utilizadorId },
    select: {
      perfil: { select: { ambito: true } },
      atribuicoes: { select: { escalaoId: true } },
      seccoes: { where: { papel: "COORDENADOR" }, select: { seccaoId: true } },
    },
  });
  if (!membro) return [];

  // TODO_CLUBE: cobre todos os escalões do clube.
  if (membro.perfil.ambito === "TODO_CLUBE") {
    const escaloes = await prisma.escalao.findMany({
      where: { clubeId },
      select: { id: true },
    });
    return escaloes.map((e) => e.id);
  }

  // SECCAO: cobre os escalões das secções que coordena.
  if (membro.perfil.ambito === "SECCAO") {
    const seccaoIds = membro.seccoes.map((s) => s.seccaoId);
    if (seccaoIds.length === 0) return [];
    const escaloes = await prisma.escalao.findMany({
      where: { clubeId, seccaoId: { in: seccaoIds } },
      select: { id: true },
    });
    return escaloes.map((e) => e.id);
  }

  // PROPRIOS_ESCALOES: só os escalões atribuídos explicitamente.
  return membro.atribuicoes.map((a) => a.escalaoId);
}

/**
 * Autores cujos 🎒 exercícios pessoais são visíveis ao utilizador no clube ativo por
 * ESCALÃO PARTILHADO (alternativa 2): treinadores que cobrem, no clube ativo, pelo
 * menos um escalão em comum com o utilizador. "Cobrir" respeita o âmbito do autor:
 *  - autor TODO_CLUBE        → cobre todos os escalões (partilha se o utilizador cobre algum);
 *  - autor PROPRIOS_ESCALOES → tem atribuição a um escalão coberto pelo utilizador;
 *  - autor SECCAO            → coordena uma secção com um escalão coberto pelo utilizador.
 *
 * O próprio utilizador pode constar da lista (inofensivo — a alternativa 1, por
 * `autorId`, já garante que vê os seus próprios exercícios). Devolve `[]` quando o
 * utilizador não cobre nenhum escalão do clube (não partilha escalão com ninguém).
 */
export async function autoresComEscalaoPartilhado(
  clubeId: string,
  utilizadorId: string,
): Promise<string[]> {
  const escalaoIds = await escaloesCobertosPorUtilizador(clubeId, utilizadorId);
  if (escalaoIds.length === 0) return [];

  const membros = await prisma.membroClube.findMany({
    where: {
      clubeId,
      OR: [
        // Autor TODO_CLUBE: cobre todos os escalões — partilha por o utilizador cobrir algum.
        { perfil: { ambito: "TODO_CLUBE" } },
        // Autor PROPRIOS_ESCALOES: atribuição a um escalão coberto pelo utilizador.
        { atribuicoes: { some: { escalaoId: { in: escalaoIds } } } },
        // Autor SECCAO: coordena uma secção com um escalão coberto pelo utilizador.
        {
          seccoes: {
            some: {
              papel: "COORDENADOR",
              seccao: { escaloes: { some: { id: { in: escalaoIds } } } },
            },
          },
        },
      ],
    },
    select: { utilizadorId: true },
  });

  return membros.map((m) => m.utilizadorId);
}

/**
 * Exercícios visíveis para um membro:
 *  1. 🎒 pessoais do próprio (proprietario = TREINADOR, autorId = utilizador) —
 *     portáteis, viajam com o treinador entre clubes;
 *  2. 🎒 pessoais de treinadores que partilham pelo menos um escalão com o utilizador
 *     no clube ativo (pré-computado por `autoresComEscalaoPartilhado`, aplicado como
 *     `autorId in (…)`);
 *  3. 🏛️ do clube ativo (proprietario = CLUBE), incluindo as linhas legadas da fase
 *     expand (clubeProprietarioId ainda a null, só o clubeId legado preenchido);
 *  4. 🏛️ pessoais de qualquer treinador partilhados neste clube (PartilhaExercicioClube).
 */
export async function filtroExerciciosVisiveis(
  clubeId: string,
  utilizadorId: string,
): Promise<Prisma.ExercicioWhereInput> {
  const autorIds = await autoresComEscalaoPartilhado(clubeId, utilizadorId);

  const pessoalDeColegas: Prisma.ExercicioWhereInput[] =
    autorIds.length > 0
      ? [{ proprietario: "TREINADOR", autorId: { in: autorIds } }]
      : [];

  return {
    OR: [
      { proprietario: "TREINADOR", autorId: utilizadorId },
      ...pessoalDeColegas,
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
