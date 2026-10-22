-- §8.11.1 (2026-10-21): link público só-de-leitura do calendário de jogos do escalão.
-- Só ADD COLUMN nullable (sem backfill): nenhum escalão existente fica com link.
ALTER TABLE "Escalao" ADD COLUMN "calendarioPublicoToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Escalao_calendarioPublicoToken_key" ON "Escalao"("calendarioPublicoToken");
