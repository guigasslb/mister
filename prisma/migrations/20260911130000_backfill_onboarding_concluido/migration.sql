-- Backfill: onboardingConcluido para clubes estabelecidos.
--
-- Contexto: a migração 20260806120711_f8_f11_licenciamento adicionou a coluna
-- "Clube"."onboardingConcluido" com DEFAULT false SEM backfill. Após o rework de
-- licenciamento (commit 35dc66b), a guarda de licença passou a enforçar este
-- campo no layout guard, atirando clubes já existentes para /onboarding em loop.
--
-- Correção: considerar "estabelecidos" (onboarding já implicitamente concluído)
-- os clubes que têm pelo menos uma época ATIVA — pois só entram nesse estado via
-- utilização normal da app, anterior à existência do assistente de onboarding.
--
-- Idempotente: reaplicar não tem efeito adicional (só afeta linhas ainda a false).

UPDATE "Clube" SET "onboardingConcluido" = true
WHERE id IN (
  SELECT DISTINCT "clubeId" FROM "Epoca" WHERE "ativa" = true
);
