-- Simplificação das ausências nos treinos (§8.8.2 — decisão de produto 2026-10-04).
--
-- Antes: o estado (`FALTA` / `FALTA_JUSTIFICADA` / `LESIONADO`) e o tipo
-- (`tipoAusencia`) diziam ambos o porquê da ausência (ex.: LESIONADO + LESAO).
-- Agora: `estado` diz só SE compareceu (PRESENTE / ATRASADO / AUSENTE) e
-- `tipoAusencia` é a taxonomia única do motivo (+ novo FUTEBOL_FUTSAL).
--
-- Migração de dados determinística, sem apagar registos nem notas
-- (`notaAusencia` fica intacta). Mapeamento (estado, tipoAusencia) → (estado, tipoAusencia):
--   PRESENTE,          NULL     → PRESENTE, NULL
--   ATRASADO,          NULL     → ATRASADO, NULL
--   FALTA,             NULL     → AUSENTE,  SEM_MOTIVO
--   FALTA_JUSTIFICADA, NULL     → AUSENTE,  OUTRO
--   LESIONADO,         NULL     → AUSENTE,  LESAO
--   FALTA|FALTA_JUSTIFICADA|LESIONADO, X (não nulo) → AUSENTE, X  (o tipo explícito prevalece)
--     exceção: X = OUTRO com notaAusencia = 'futebol' (sem maiúsculas/espaços) → FUTEBOL_FUTSAL
-- Linhas PRESENTE/ATRASADO com tipoAusencia preenchido NÃO são limpas: o CHECK final
-- falha e a migração aborta (transação) em vez de perder dados em silêncio.

-- 1) TipoAusencia: novo valor FUTEBOL_FUTSAL (recriar o tipo, como o Prisma faz,
--    para o valor poder ser usado na mesma transação).
CREATE TYPE "TipoAusencia_new" AS ENUM ('LESAO', 'DOENCA', 'PESSOAL', 'TRABALHO', 'FUTEBOL_FUTSAL', 'SEM_MOTIVO', 'OUTRO');

-- 2) Backfill do motivo a partir do estado antigo (corre ANTES de alterar `estado`).
ALTER TABLE "Presenca" ALTER COLUMN "tipoAusencia" TYPE "TipoAusencia_new" USING (
  CASE
    WHEN "estado"::text IN ('PRESENTE', 'ATRASADO') THEN "tipoAusencia"::text
    WHEN "tipoAusencia"::text = 'OUTRO' AND lower(btrim("notaAusencia")) = 'futebol' THEN 'FUTEBOL_FUTSAL'
    WHEN "tipoAusencia" IS NOT NULL THEN "tipoAusencia"::text
    WHEN "estado"::text = 'LESIONADO' THEN 'LESAO'
    WHEN "estado"::text = 'FALTA_JUSTIFICADA' THEN 'OUTRO'
    WHEN "estado"::text = 'FALTA' THEN 'SEM_MOTIVO'
  END
)::"TipoAusencia_new";
DROP TYPE "TipoAusencia";
ALTER TYPE "TipoAusencia_new" RENAME TO "TipoAusencia";

-- 3) EstadoPresenca: PRESENTE / ATRASADO / AUSENTE.
CREATE TYPE "EstadoPresenca_new" AS ENUM ('PRESENTE', 'ATRASADO', 'AUSENTE');
ALTER TABLE "Presenca" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "Presenca" ALTER COLUMN "estado" TYPE "EstadoPresenca_new" USING (
  CASE
    WHEN "estado"::text IN ('FALTA', 'FALTA_JUSTIFICADA', 'LESIONADO') THEN 'AUSENTE'
    ELSE "estado"::text
  END
)::"EstadoPresenca_new";
DROP TYPE "EstadoPresenca";
ALTER TYPE "EstadoPresenca_new" RENAME TO "EstadoPresenca";
ALTER TABLE "Presenca" ALTER COLUMN "estado" SET DEFAULT 'PRESENTE';

-- 4) Coerência estado↔motivo: motivo SE E SÓ SE ausente.
ALTER TABLE "Presenca" ADD CONSTRAINT "Presenca_tipoAusencia_coerente_check"
  CHECK (("estado" = 'AUSENTE') = ("tipoAusencia" IS NOT NULL));
