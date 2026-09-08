-- CreateEnum
CREATE TYPE "PeDominante" AS ENUM ('DIREITO', 'ESQUERDO', 'AMBIDEXTRO');

-- CreateEnum
CREATE TYPE "DocTipo" AS ENUM ('NIC', 'PASSAPORTE', 'AR', 'CR', 'TR');

-- CreateEnum
CREATE TYPE "EstatutoFPF" AS ENUM ('PORTUGUES', 'ESTRANGEIRO', 'UNIAO_EUROPEIA', 'IGUALDADE');

-- AlterTable
ALTER TABLE "Atleta" ADD COLUMN     "docNumero" TEXT,
ADD COLUMN     "docTipo" "DocTipo",
ADD COLUMN     "docValidade" TIMESTAMP(3),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "encarregadoDocNumero" TEXT,
ADD COLUMN     "encarregadoDocTipo" "DocTipo",
ADD COLUMN     "encarregadoDocValidade" TIMESTAMP(3),
ADD COLUMN     "estatutoFPF" "EstatutoFPF",
ADD COLUMN     "nacionalidade" TEXT,
ADD COLUMN     "numeroLicencaFPF" TEXT,
ADD COLUMN     "paisNascimento" TEXT,
ADD COLUMN     "peDominante" "PeDominante",
ADD COLUMN     "telefone" TEXT;
