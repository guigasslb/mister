-- Modo Jogo ao Vivo — desenho consolidado (bíblia v7 §8.25.8).
--
-- Transforma o desenho inicial (migração 20260913164305) no modelo final:
--   - Novo enum EstadoJogoAoVivo (substitui EstadoCronometro).
--   - Novos valores no enum TipoEventoJogo (primitivas do cronómetro/substituições);
--     os eventos ao vivo passam a viver em EventoJogo (não numa tabela à parte).
--   - Colunas aditivas nullable em EventoJogo (segundoJogo, posicao, clientEventoId)
--     + unicidade idempotente da outbox offline (jogoId + clientEventoId).
--   - SessaoJogoAoVivo redesenhada (duracaoParteMins, segundosDecorridos, aCorrerDesde).
--   - Remove a tabela EventoAoVivo e os enums EstadoCronometro/TipoEventoAoVivo do
--     desenho inicial (sem dados: 0 linhas à data da migração).
-- Migração destrutiva apenas sobre objetos do desenho inicial (vazios). Não toca em auth.

-- CreateEnum
CREATE TYPE "EstadoJogoAoVivo" AS ENUM ('POR_INICIAR', 'EM_CURSO', 'INTERVALO', 'PAUSADO', 'TERMINADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoEventoJogo" ADD VALUE 'INICIO_PARTE';
ALTER TYPE "TipoEventoJogo" ADD VALUE 'FIM_PARTE';
ALTER TYPE "TipoEventoJogo" ADD VALUE 'ENTRADA';
ALTER TYPE "TipoEventoJogo" ADD VALUE 'SAIDA';
ALTER TYPE "TipoEventoJogo" ADD VALUE 'PAUSA';
ALTER TYPE "TipoEventoJogo" ADD VALUE 'RETOMA';

-- DropForeignKey
ALTER TABLE "EventoAoVivo" DROP CONSTRAINT "EventoAoVivo_atletaId_fkey";

-- DropForeignKey
ALTER TABLE "EventoAoVivo" DROP CONSTRAINT "EventoAoVivo_sessaoAoVivoId_fkey";

-- DropIndex
DROP INDEX "SessaoJogoAoVivo_jogoId_idx";

-- AlterTable
ALTER TABLE "EventoJogo" ADD COLUMN     "clientEventoId" TEXT,
ADD COLUMN     "posicao" "Posicao",
ADD COLUMN     "segundoJogo" INTEGER;

-- AlterTable
ALTER TABLE "SessaoJogoAoVivo" DROP COLUMN "duracaoParteMin",
DROP COLUMN "jogadoresEmCampo",
DROP COLUMN "segundoDecorridoParte",
DROP COLUMN "ultimoRetomeEm",
ADD COLUMN     "aCorrerDesde" TIMESTAMP(3),
ADD COLUMN     "duracaoParteMins" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "segundosDecorridos" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "estado",
ADD COLUMN     "estado" "EstadoJogoAoVivo" NOT NULL DEFAULT 'POR_INICIAR',
ALTER COLUMN "parteAtual" SET DEFAULT 0;

-- DropTable
DROP TABLE "EventoAoVivo";

-- DropEnum
DROP TYPE "EstadoCronometro";

-- DropEnum
DROP TYPE "TipoEventoAoVivo";

-- CreateIndex
CREATE INDEX "EventoJogo_jogoId_segundoJogo_idx" ON "EventoJogo"("jogoId", "segundoJogo");

-- CreateIndex
CREATE UNIQUE INDEX "EventoJogo_clientEventoId_key" ON "EventoJogo"("jogoId", "clientEventoId");
