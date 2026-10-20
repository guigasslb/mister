-- Ordem dos confrontos (R6, 2026-10-20).
-- * "ResultadoCompeticao"."ordem" (INTEGER, nullable): ordem de apresentação dentro
--   da competição (ordinal global por competição; a ordem dentro de uma jornada é a
--   subsequência ordenada por "ordem"). NULL = caminho legado sem ordem (aparece no fim).
--   Sem índice (consultas sempre por "competicaoId", já indexado) e sem unique.
-- * DDL gerado offline com `prisma migrate diff --from-schema-datamodel` (schema
--   anterior → atual); o backfill foi acrescentado à mão.
-- * Backfill determinístico = ordem de apresentação atual. Hoje o detalhe da
--   competição lê os resultados com ORDER_RESULTADOS = [{ data: "asc" }, { criadoEm: "asc" }]
--   (lib/actions/competicoes.ts; em ASC o Postgres põe NULLS LAST, como o Prisma) e a
--   UI só agrupa por ronda mantendo essa ordem. Replica-se a mesma ordenação por
--   competição, com "id" como desempate (os confrontos criados por createMany partilham
--   o mesmo "criadoEm"). Idempotente: só preenche linhas ainda sem ordem.
-- * Não remove o índice parcial "Jogo_resultadoCompeticaoId_sem_equipa_key" (§23.11.2).

-- AlterTable
ALTER TABLE "ResultadoCompeticao" ADD COLUMN     "ordem" INTEGER;

-- Backfill
UPDATE "ResultadoCompeticao" AS r
SET "ordem" = s.n
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "competicaoId"
           ORDER BY "data" ASC NULLS LAST, "criadoEm" ASC, "id" ASC
         ) AS n
  FROM "ResultadoCompeticao"
) AS s
WHERE r."id" = s."id" AND r."ordem" IS NULL;
