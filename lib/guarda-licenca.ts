// ─────────────────────────────────────────────
// Guarda de licença + gating do onboarding — decisões PURAS e dependentes da
// rota (§3.11 / §8.1).
//
// Isoladas de infra (sem prisma / sem `server-only`) para poderem ser usadas num
// componente client (<GuardaLicenca>) E testadas isoladamente. NÃO importar aqui
// nada de `lib/licenca.ts` (esse módulo importa `prisma` e não pode ir para o
// bundle do cliente).
//
// Fluxo v7 (§8.1): sem licença válida → paywall (/sem-licenca), SEM exceção — o
// wizard de onboarding passa a estar bloqueado enquanto a licença for PENDENTE
// (só acessível após ativação). Com licença válida, o gating do onboarding
// encaminha para o wizard (setup por concluir) ou para o dashboard (concluído).
// ─────────────────────────────────────────────

/**
 * Verdadeiro quando a guarda deve bloquear o acesso e redirecionar para o
 * paywall (/sem-licenca), dado o estado da licença.
 *
 * v7 (§8.1): a decisão é agora independente da rota — o wizard de onboarding
 * deixou de ser uma exceção. Sem licença válida → bloqueia SEMPRE.
 */
export function deveBloquearPorLicenca(licencaOk: boolean): boolean {
  return !licencaOk;
}

/** Destino do gating do onboarding (ou `null` para deixar renderizar a rota). */
export type DestinoOnboarding = "/onboarding" | "/dashboard" | null;

/**
 * Gating do wizard de onboarding, aplicado APENAS quando a licença já é válida
 * (§8.1). Assume que a guarda de licença não bloqueou (licença ATIVA).
 *
 * - Setup por concluir (`onboardingConcluido=false`): força o wizard
 *   (`/onboarding`), exceto se já lá estiver (evita loop de redirect).
 * - Setup concluído: impede reentrar no wizard — de `/onboarding` encaminha para
 *   o dashboard; qualquer outra rota renderiza normalmente.
 *
 * O match de onboarding é por prefixo exato (`/onboarding` ou `/onboarding/...`)
 * para não apanhar falsos positivos como `/onboarding-algo`.
 */
export function destinoOnboarding(
  onboardingConcluido: boolean,
  pathname: string | null | undefined,
): DestinoOnboarding {
  const p = pathname ?? "";
  const emOnboarding = p === "/onboarding" || p.startsWith("/onboarding/");
  if (!onboardingConcluido) return emOnboarding ? null : "/onboarding";
  return emOnboarding ? "/dashboard" : null;
}
