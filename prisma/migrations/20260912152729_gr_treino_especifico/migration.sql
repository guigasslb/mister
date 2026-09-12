-- AlterEnum
ALTER TYPE "TipoSessao" ADD VALUE 'EXTERNA_GR';

-- AlterTable
ALTER TABLE "Habilidade" ADD COLUMN     "aplicaSoGuardaRedes" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MetricaConfig" ADD COLUMN     "aplicaSoGuardaRedes" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Sessao" ADD COLUMN     "entidadeExterna" TEXT;
