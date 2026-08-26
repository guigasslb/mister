-- Garante no máximo uma adesão ATIVO por utilizador — constraint anti-duplicado atómica.
--
-- Índice único PARCIAL: só se aplica às linhas com estado = 'ATIVO'. Permite manter
-- várias linhas INATIVO/CONVIDADO por utilizador (histórico de saídas/convites), mas
-- impede, ao nível da base de dados, duas adesões ATIVO em simultâneo para o mesmo
-- utilizador. É a garantia verdadeiramente atómica que fecha a janela TOCTOU de
-- criarClube (lib/actions/onboarding.ts, §5.4): mesmo que dois pedidos concorrentes
-- passem os re-checks aplicacionais, a segunda escrita falha aqui.
--
-- O Prisma ORM não modela índices parciais (WHERE), por isso este índice é criado
-- por SQL manual. Migração cumulativa: não altera dados existentes, só adiciona o índice.
-- NOTA: se existirem linhas com estado ATIVO duplicado para o mesmo utilizadorId, esta
-- migração falha (unicidade violada) — nesse caso, reconciliar os dados antes de aplicar.
CREATE UNIQUE INDEX "MembroClube_utilizadorId_ativo_unique"
  ON "MembroClube" ("utilizadorId")
  WHERE (estado = 'ATIVO');
