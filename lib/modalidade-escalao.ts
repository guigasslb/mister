import type { Escalao, Modalidade, Prisma, Seccao } from "@prisma/client";

/**
 * Helpers puros (sem acesso a dados) para relacionar escalões com a modalidade da
 * sua secção (§3.2). Usados pelos Server Components do plantel para enriquecer os
 * escalões com a modalidade sem tocar nas Server Actions.
 */

// 🔁 v7 (§10.8): reexporta os utilitários de tempo-por-formato a partir da sua
// fonte única (`lib/estatisticas.ts`), para os consumidores de jogos os
// importarem junto dos restantes helpers de modalidade (Fase 28).
export {
  blocoParaMinutos,
  MINUTOS_POR_PARTE,
  JOGADORES_EM_CAMPO,
  maxTitulares,
} from "./estatisticas";

/** Mapa `escalaoId → modalidade` da secção do escalão. `null` se o escalão não
 * tem secção associada (backfill pendente — Apêndice C). */
export function mapaModalidadePorEscalao(
  escaloes: Pick<Escalao, "id" | "seccaoId">[],
  seccoes: Pick<Seccao, "id" | "modalidade">[],
): Map<string, Modalidade | null> {
  const modPorSeccao = new Map<string, Modalidade>(
    seccoes.map((s) => [s.id, s.modalidade]),
  );
  return new Map(
    escaloes.map((e) => [
      e.id,
      e.seccaoId ? (modPorSeccao.get(e.seccaoId) ?? null) : null,
    ]),
  );
}

/**
 * Modalidade EFETIVA de um jogo/sessão (§3.5/§3.7): a atividade pontual
 * (`modalidadeAtividade`), se indicada, prevalece; caso contrário herda a
 * modalidade da secção do escalão. Fallback `FUTSAL` para dados legados sem
 * secção (backfill pendente — Apêndice C). Função pura.
 */
export function modalidadeEfetiva(
  modalidadeAtividade: Modalidade | null | undefined,
  modalidadeSeccao: Modalidade | null | undefined,
): Modalidade {
  return modalidadeAtividade ?? modalidadeSeccao ?? "FUTSAL";
}

/**
 * Fragmento de `where` de `Jogo` que filtra pela modalidade EFETIVA (§10.8):
 * o jogo pertence à modalidade `M` se a sua atividade pontual for `M`, ou se não
 * tiver atividade pontual e a secção do escalão for `M`. Sem modalidade → `{}`
 * (sem filtro). Combinável (spread) com outros filtros de jogo.
 */
export function filtroModalidadeJogo(
  modalidade?: Modalidade | null,
): Prisma.JogoWhereInput {
  if (!modalidade) return {};
  return {
    OR: [
      { modalidadeAtividade: modalidade },
      { modalidadeAtividade: null, escalao: { seccao: { modalidade } } },
    ],
  };
}

/** Escalões enriquecidos com a modalidade da secção, para o `AtletaForm`. */
export function escaloesComModalidade(
  escaloes: Pick<Escalao, "id" | "nome" | "seccaoId">[],
  seccoes: Pick<Seccao, "id" | "modalidade">[],
): { id: string; nome: string; modalidade: Modalidade | null }[] {
  const mapa = mapaModalidadePorEscalao(escaloes, seccoes);
  return escaloes.map((e) => ({
    id: e.id,
    nome: e.nome,
    modalidade: mapa.get(e.id) ?? null,
  }));
}
