-- AlterTable
ALTER TABLE "Exercicio" ADD COLUMN "numeroJogadores" TEXT,
ADD COLUMN "espaco" TEXT;

-- AlterTable
ALTER TABLE "SessaoExercicio" ADD COLUMN "numeroJogadoresOverride" TEXT,
ADD COLUMN "espacoOverride" TEXT,
ADD COLUMN "snapNumeroJogadores" TEXT,
ADD COLUMN "snapEspaco" TEXT;
