-- Remoção das features Habilidades e Caderneta (bíblia §19 — 2026-09-12).
--
-- Remove os modelos Habilidade e ProgressoHabilidade e os enums associados
-- (NivelHabilidade, EstadoHabilidade). ProgressoHabilidade é removido primeiro
-- por depender (FK) de Habilidade.

-- DropForeignKey
ALTER TABLE "ProgressoHabilidade" DROP CONSTRAINT "ProgressoHabilidade_atletaId_fkey";
ALTER TABLE "ProgressoHabilidade" DROP CONSTRAINT "ProgressoHabilidade_habilidadeId_fkey";
ALTER TABLE "ProgressoHabilidade" DROP CONSTRAINT "ProgressoHabilidade_epocaId_fkey";
ALTER TABLE "Habilidade" DROP CONSTRAINT "Habilidade_clubeId_fkey";

-- DropTable
DROP TABLE "ProgressoHabilidade";
DROP TABLE "Habilidade";

-- DropEnum
DROP TYPE "EstadoHabilidade";
DROP TYPE "NivelHabilidade";
