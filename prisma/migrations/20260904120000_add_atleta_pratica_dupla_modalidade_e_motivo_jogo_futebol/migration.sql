-- AlterEnum
ALTER TYPE "MotivoFalta" ADD VALUE 'JOGO_FUTEBOL';

-- AlterTable
ALTER TABLE "Atleta" ADD COLUMN     "praticaDuplaModalidade" BOOLEAN NOT NULL DEFAULT false;
