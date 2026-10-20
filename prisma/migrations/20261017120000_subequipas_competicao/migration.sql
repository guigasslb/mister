-- Subequipas por competição (2026-10-17).
-- * Várias EquipaCompeticao tipo PROPRIO por competição passam a ser permitidas
--   (não existia constraint que o impedisse; mantém-se o unique (competicaoId, nome)).
-- * Nova tabela "EquipaCompeticaoAtleta": plantel de cada subequipa na competição.
-- * "Jogo"."equipaCompeticaoId" (nullable, FK SET NULL): subequipa do jogo.
--   NULL = equipa implícita (comportamento atual). Sem backfill.
-- * O unique de "Jogo"."resultadoCompeticaoId" passa a composto
--   (resultadoCompeticaoId, equipaCompeticaoId): num confronto A vs B há dois Jogos.
--   Como o Postgres trata NULLs como distintos num unique composto, acrescenta-se
--   o índice único PARCIAL "Jogo_resultadoCompeticaoId_sem_equipa_key" que garante
--   que jogos com equipaCompeticaoId NULL continuam a ter resultadoCompeticaoId único
--   (preserva a garantia anterior). Este índice não está no schema.prisma (o Prisma
--   não suporta índices parciais); não o remover em migrações futuras.
--   Nota: num mesmo resultado podem coexistir um Jogo com equipaCompeticaoId NULL e
--   outro(s) com subequipa — a coerência fica a cargo da aplicação.

-- DropIndex
DROP INDEX "Jogo_resultadoCompeticaoId_key";

-- AlterTable
ALTER TABLE "Jogo" ADD COLUMN     "equipaCompeticaoId" TEXT;

-- CreateTable
CREATE TABLE "EquipaCompeticaoAtleta" (
    "id" TEXT NOT NULL,
    "equipaCompeticaoId" TEXT NOT NULL,
    "atletaId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipaCompeticaoAtleta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipaCompeticaoAtleta_atletaId_idx" ON "EquipaCompeticaoAtleta"("atletaId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipaCompeticaoAtleta_equipaCompeticaoId_atletaId_key" ON "EquipaCompeticaoAtleta"("equipaCompeticaoId", "atletaId");

-- CreateIndex
CREATE INDEX "Jogo_equipaCompeticaoId_idx" ON "Jogo"("equipaCompeticaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Jogo_resultadoCompeticaoId_equipaCompeticaoId_key" ON "Jogo"("resultadoCompeticaoId", "equipaCompeticaoId");

-- CreateIndex (manual — índice parcial, ver cabeçalho)
CREATE UNIQUE INDEX "Jogo_resultadoCompeticaoId_sem_equipa_key" ON "Jogo"("resultadoCompeticaoId") WHERE "equipaCompeticaoId" IS NULL;

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_equipaCompeticaoId_fkey" FOREIGN KEY ("equipaCompeticaoId") REFERENCES "EquipaCompeticao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipaCompeticaoAtleta" ADD CONSTRAINT "EquipaCompeticaoAtleta_equipaCompeticaoId_fkey" FOREIGN KEY ("equipaCompeticaoId") REFERENCES "EquipaCompeticao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipaCompeticaoAtleta" ADD CONSTRAINT "EquipaCompeticaoAtleta_atletaId_fkey" FOREIGN KEY ("atletaId") REFERENCES "Atleta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
