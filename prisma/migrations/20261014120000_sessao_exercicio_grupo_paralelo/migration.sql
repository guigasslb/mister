-- Exercícios em paralelo na sessão de treino (§3.5 — 2026-10-14).
-- Linhas de "SessaoExercicio" da mesma sessão com o mesmo "grupoParalelo"
-- (não-null) decorrem em simultâneo. Nullable e sem backfill: todas as linhas
-- existentes ficam sequenciais (NULL). O unique ("sessaoId", "ordem") mantém-se.

-- AlterTable
ALTER TABLE "SessaoExercicio" ADD COLUMN     "grupoParalelo" TEXT;
