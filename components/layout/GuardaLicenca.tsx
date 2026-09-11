"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deveBloquearPorLicenca, destinoOnboarding } from "@/lib/guarda-licenca";

/**
 * Guarda de licença + gating do onboarding, dependente da rota (§3.11 / §8.1).
 *
 * A validade da licença e o estado do onboarding são avaliados server-side no
 * layout e chegam aqui via `licencaOk`/`onboardingConcluido`. Esta guarda apenas
 * DECIDE, no cliente, o destino com base na rota atual — necessário porque o
 * pathname não está disponível de forma limpa num layout server-side sem alterar
 * o middleware (intocável).
 *
 * Fluxo v7 (§8.1): sem licença válida → paywall (/sem-licenca), SEM exceção (o
 * wizard fica bloqueado enquanto PENDENTE). Com licença válida, o gating do
 * onboarding encaminha para o wizard (setup por concluir) ou dashboard.
 *
 * Quando redireciona, NÃO renderiza os filhos (evita flash de conteúdo indevido).
 */
export function GuardaLicenca({
  licencaOk,
  onboardingConcluido,
  children,
}: {
  licencaOk: boolean;
  onboardingConcluido: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const destino = deveBloquearPorLicenca(licencaOk)
    ? "/sem-licenca"
    : destinoOnboarding(onboardingConcluido, pathname);

  useEffect(() => {
    if (destino) router.replace(destino);
  }, [destino, router]);

  if (destino) return null;
  return <>{children}</>;
}
