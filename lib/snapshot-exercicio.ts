import { Prisma, type CategoriaExercicioPrincipal } from "@prisma/client";

/**
 * Mecanismo de snapshot de exercícios (bíblia §4.2.1).
 *
 * Quando um exercício portátil (`proprietario = TREINADOR`) é adicionado a uma
 * sessão do clube, o sistema congela uma cópia só-de-leitura dos dados relevantes
 * (nome, descrição, objetivo, diagrama) no `SessaoExercicio`. Assim, quando o
 * treinador sai e leva o master editável, o clube continua a conseguir reconstruir
 * o plano de treino histórico a partir do snapshot — sem "buracos".
 *
 * Regras (§4.2.1):
 * - Exercícios `proprietario = TREINADOR` → snapshot preenchido.
 * - Exercícios `proprietario = CLUBE` → sem snapshot (já pertencem ao clube).
 * - O snapshot é criado UMA vez, no momento da adição, e é IMUTÁVEL.
 */

/** Campos do exercício necessários para construir o snapshot. */
export type ExercicioParaSnapshot = {
  proprietario: "CLUBE" | "TREINADOR";
  nome: string;
  descricao: string | null;
  objetivo: string | null;
  diagrama: Prisma.JsonValue | null;
  // Plano de treino imprimível (§4.2.1). Opcionais: rows legadas podem não os ter.
  numeroJogadores?: string | null;
  espaco?: string | null;
};

/** Campos `snap*` a persistir no `SessaoExercicio` (input de escrita Prisma). */
export type DadosSnapshot = {
  snapNome: string;
  snapDescricao: string | null;
  snapObjetivo: string | null;
  snapDiagrama: Prisma.InputJsonValue | typeof Prisma.DbNull;
  snapNumeroJogadores: string | null;
  snapEspaco: string | null;
  snapCriadoEm: Date;
};

/**
 * Constrói os campos `snap*` a gravar quando um exercício é adicionado a uma sessão.
 * Devolve `null` para exercícios do clube (que não geram snapshot).
 *
 * `agora` é injetável para testes determinísticos; por omissão usa o instante atual.
 */
export function construirSnapshotExercicio(
  exercicio: ExercicioParaSnapshot,
  agora: Date = new Date(),
): DadosSnapshot | null {
  if (exercicio.proprietario !== "TREINADOR") return null;
  return {
    snapNome: exercicio.nome,
    snapDescricao: exercicio.descricao,
    snapObjetivo: exercicio.objetivo,
    // Json nullable no Prisma: DbNull grava NULL; caso contrário copia o diagrama.
    snapDiagrama:
      exercicio.diagrama === null
        ? Prisma.DbNull
        : (exercicio.diagrama as Prisma.InputJsonValue),
    snapNumeroJogadores: exercicio.numeroJogadores ?? null,
    snapEspaco: exercicio.espaco ?? null,
    snapCriadoEm: agora,
  };
}

// ─────────────────────────────────────────────
// Resolução para exibição do histórico
// ─────────────────────────────────────────────

/** Exercício (parcial) carregado via relação, ou `null` se já não for visível ao clube. */
export type ExercicioVisivel = {
  id: string;
  nome: string;
  categoriaPrincipal: CategoriaExercicioPrincipal | null;
  descricao?: string | null;
  objetivo?: string | null;
  diagrama?: Prisma.JsonValue | null;
} | null;

/** Linha `SessaoExercicio` com o exercício (talvez ausente) e os campos de snapshot. */
export type SessaoExercicioParaExibir = {
  exercicio: ExercicioVisivel;
  snapNome: string | null;
  snapDescricao: string | null;
  snapObjetivo: string | null;
  snapDiagrama: Prisma.JsonValue | null;
  // Plano de treino imprimível (§4.2.1): override por sessão (semeado da base ao
  // adicionar) com fallback ao snapshot. Opcionais — rows legadas podem não os ter.
  numeroJogadoresOverride?: string | null;
  espacoOverride?: string | null;
  snapNumeroJogadores?: string | null;
  snapEspaco?: string | null;
};

/** Dados resolvidos para exibição do plano de treino histórico. */
export type ExercicioResolvido = {
  /** Id do exercício original, ou `null` se já não for visível (histórico via snapshot). */
  id: string | null;
  nome: string;
  categoriaPrincipal: CategoriaExercicioPrincipal | null;
  descricao: string | null;
  objetivo: string | null;
  diagrama: Prisma.JsonValue | null;
  /** Nº de jogadores (§4.2.1): override por sessão → snapshot → null. */
  numeroJogadores: string | null;
  /** Espaço (§4.2.1): override por sessão → snapshot → null. */
  espaco: string | null;
  /** `true` quando os dados vieram do snapshot (exercício original indisponível). */
  origemSnapshot: boolean;
};

/**
 * Resolve os dados a exibir para um exercício de sessão, com fallback ao snapshot
 * (§4.2.1). Ordem: exercício original visível → snapshot congelado → placeholder.
 *
 * Garante que o histórico do clube nunca fica com "buracos" (null/erro) quando o
 * exercício do treinador deixa de estar visível.
 */
export function resolverExercicioSessao(se: SessaoExercicioParaExibir): ExercicioResolvido {
  const ex = se.exercicio;
  const temExercicio = ex != null;
  return {
    id: ex?.id ?? null,
    nome: ex?.nome ?? se.snapNome ?? "(exercício removido)",
    categoriaPrincipal: ex?.categoriaPrincipal ?? null,
    descricao: ex?.descricao ?? se.snapDescricao ?? null,
    objetivo: ex?.objetivo ?? se.snapObjetivo ?? null,
    diagrama: ex?.diagrama ?? se.snapDiagrama ?? null,
    // Nº de jogadores/espaço: override por sessão prevalece (semeado da base ao
    // adicionar), com fallback ao snapshot congelado (§4.2.1).
    numeroJogadores: se.numeroJogadoresOverride ?? se.snapNumeroJogadores ?? null,
    espaco: se.espacoOverride ?? se.snapEspaco ?? null,
    origemSnapshot: !temExercicio && se.snapNome != null,
  };
}
