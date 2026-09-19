-- CreateEnum
CREATE TYPE "TipoAusencia" AS ENUM ('LESAO', 'DOENCA', 'PESSOAL', 'TRABALHO', 'SEM_MOTIVO', 'OUTRO');

-- AlterTable
ALTER TABLE "Presenca" ADD COLUMN     "notaAusencia" TEXT,
ADD COLUMN     "tipoAusencia" "TipoAusencia";
