-- Situações de jogo (2026-10-22 — §24, Apêndice C.8).
-- * Nova tabela "CategoriaSituacaoJogo": categorias do escalão (sem seed).
-- * Nova tabela "SituacaoJogo": biblioteca de diagramas táticos do escalão (sem época).
--   FK categoriaId com ON DELETE NO ACTION: o bloqueio de apagar categoria em uso é
--   feito na action; NO ACTION é verificado no fim da instrução, pelo que apagar o
--   escalão (cascade em categorias e situações) não falha.
-- * "QuadroTatico"."situacaoOrigemId" (nullable, FK SET NULL): original da biblioteca.
-- Sem backfill; sem alteração a colunas existentes.

-- AlterTable
ALTER TABLE "QuadroTatico" ADD COLUMN     "situacaoOrigemId" TEXT;

-- CreateTable
CREATE TABLE "CategoriaSituacaoJogo" (
    "id" TEXT NOT NULL,
    "escalaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoriaSituacaoJogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SituacaoJogo" (
    "id" TEXT NOT NULL,
    "clubeId" TEXT NOT NULL,
    "escalaoId" TEXT NOT NULL,
    "categoriaId" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "diagrama" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SituacaoJogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoriaSituacaoJogo_escalaoId_ordem_idx" ON "CategoriaSituacaoJogo"("escalaoId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaSituacaoJogo_escalaoId_nome_key" ON "CategoriaSituacaoJogo"("escalaoId", "nome");

-- CreateIndex
CREATE INDEX "SituacaoJogo_clubeId_escalaoId_idx" ON "SituacaoJogo"("clubeId", "escalaoId");

-- CreateIndex
CREATE INDEX "SituacaoJogo_categoriaId_idx" ON "SituacaoJogo"("categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "SituacaoJogo_escalaoId_nome_key" ON "SituacaoJogo"("escalaoId", "nome");

-- CreateIndex
CREATE INDEX "QuadroTatico_situacaoOrigemId_idx" ON "QuadroTatico"("situacaoOrigemId");

-- AddForeignKey
ALTER TABLE "QuadroTatico" ADD CONSTRAINT "QuadroTatico_situacaoOrigemId_fkey" FOREIGN KEY ("situacaoOrigemId") REFERENCES "SituacaoJogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaSituacaoJogo" ADD CONSTRAINT "CategoriaSituacaoJogo_escalaoId_fkey" FOREIGN KEY ("escalaoId") REFERENCES "Escalao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SituacaoJogo" ADD CONSTRAINT "SituacaoJogo_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SituacaoJogo" ADD CONSTRAINT "SituacaoJogo_escalaoId_fkey" FOREIGN KEY ("escalaoId") REFERENCES "Escalao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SituacaoJogo" ADD CONSTRAINT "SituacaoJogo_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaSituacaoJogo"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

