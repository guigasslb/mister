-- 2026-10-22 (§3.7 / §8.11 / §8.11.1):
-- * "Jogo": concentração opcional (hora como instante + local em texto/link). Sem backfill.
-- * "Escalao": opt-in para o calendário público mostrar os convocados (desligado por defeito,
--   também nos escalões existentes).

-- AlterTable
ALTER TABLE "Escalao" ADD COLUMN     "calendarioPublicoMostrarConvocados" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Jogo" ADD COLUMN     "horaConcentracao" TIMESTAMP(3),
ADD COLUMN     "localConcentracao" TEXT;
