-- Gestão de Competições (Passo 1.1): migração aditiva e retrocompatível.
-- Adiciona âmbito de competição, regras de pontuação/walkover, participantes
-- tipados e ligação opcional entre Jogo e ResultadoCompeticao.

-- CreateEnum
CREATE TYPE "AmbitoCompeticao" AS ENUM ('EXTERNA', 'PROPRIA');

-- CreateEnum
CREATE TYPE "TipoParticipanteCompeticao" AS ENUM ('PROPRIO', 'CLUBE_MISTER', 'EXTERNO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoResultado" ADD VALUE 'CANCELADO';
ALTER TYPE "EstadoResultado" ADD VALUE 'WALKOVER';

-- AlterTable
ALTER TABLE "Jogo" ADD COLUMN     "resultadoCompeticaoId" TEXT;

-- AlterTable
ALTER TABLE "Competicao" ADD COLUMN     "ambito" "AmbitoCompeticao" NOT NULL DEFAULT 'PROPRIA',
ADD COLUMN     "golosWalkover" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "pontosDerrota" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pontosEmpate" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "pontosVitoria" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "ResultadoCompeticao" ADD COLUMN     "equipaCasaId" TEXT,
ADD COLUMN     "equipaForaId" TEXT,
ADD COLUMN     "walkoverVencedor" "CasaFora";

-- AlterTable
ALTER TABLE "EquipaCompeticao" ADD COLUMN     "clubeVinculadoId" TEXT,
ADD COLUMN     "escalaoVinculadoId" TEXT,
ADD COLUMN     "tipo" "TipoParticipanteCompeticao" NOT NULL DEFAULT 'EXTERNO';

-- CreateIndex
CREATE UNIQUE INDEX "Jogo_resultadoCompeticaoId_key" ON "Jogo"("resultadoCompeticaoId");

-- CreateIndex
CREATE INDEX "ResultadoCompeticao_equipaCasaId_idx" ON "ResultadoCompeticao"("equipaCasaId");

-- CreateIndex
CREATE INDEX "ResultadoCompeticao_equipaForaId_idx" ON "ResultadoCompeticao"("equipaForaId");

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_resultadoCompeticaoId_fkey" FOREIGN KEY ("resultadoCompeticaoId") REFERENCES "ResultadoCompeticao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoCompeticao" ADD CONSTRAINT "ResultadoCompeticao_equipaCasaId_fkey" FOREIGN KEY ("equipaCasaId") REFERENCES "EquipaCompeticao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoCompeticao" ADD CONSTRAINT "ResultadoCompeticao_equipaForaId_fkey" FOREIGN KEY ("equipaForaId") REFERENCES "EquipaCompeticao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
