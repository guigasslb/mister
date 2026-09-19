-- Unificação da classificação de ausências (§8.8.2 — decisão de produto 2026-09-19).
-- Remove o sistema antigo `motivo`/`justificacao` (enum `MotivoFalta`) da tabela
-- Presenca. O sistema `tipoAusencia`/`notaAusencia` (enum `TipoAusencia`) passa a
-- ser a fonte única de classificação da ausência.
--
-- NOTA: migração destrutiva de colunas. Os dados de `motivo`/`justificacao` não são
-- migrados automaticamente (não eram consumidos em analytics/relatórios/exports —
-- apenas no marcador). Se for necessário preservar o histórico, executar um
-- backfill para `tipoAusencia`/`notaAusencia` ANTES de aplicar esta migração.

-- AlterTable
ALTER TABLE "Presenca" DROP COLUMN "motivo",
DROP COLUMN "justificacao";

-- DropEnum
DROP TYPE "MotivoFalta";
