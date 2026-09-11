import { describe, it, expect } from "vitest";
import { licencaValida, type LicencaAvaliavel } from "@/lib/licenca";
import { deveBloquearPorLicenca, destinoOnboarding } from "@/lib/guarda-licenca";

// §3.11 — validade de licença (guarda de acesso à plataforma). Função pura.

const AGORA = new Date("2026-08-19T12:00:00Z");

function lic(over: Partial<LicencaAvaliavel>): LicencaAvaliavel {
  return { estado: "ATIVA", dataFim: null, ...over };
}

describe("licencaValida (§3.11)", () => {
  it("null/undefined (sem licença) → inválida", () => {
    expect(licencaValida(null, AGORA)).toBe(false);
    expect(licencaValida(undefined, AGORA)).toBe(false);
  });

  it("ATIVA sem dataFim → válida", () => {
    expect(licencaValida(lic({ estado: "ATIVA", dataFim: null }), AGORA)).toBe(true);
  });

  it("ATIVA com dataFim no futuro (trial válido) → válida", () => {
    const futuro = new Date(AGORA.getTime() + 86_400_000); // +1 dia
    expect(licencaValida(lic({ estado: "ATIVA", dataFim: futuro }), AGORA)).toBe(true);
  });

  it("ATIVA mas com dataFim já passada (trial expirado) → inválida", () => {
    const passado = new Date(AGORA.getTime() - 86_400_000); // -1 dia
    expect(licencaValida(lic({ estado: "ATIVA", dataFim: passado }), AGORA)).toBe(false);
  });

  it("estados não-ATIVA → inválida (mesmo sem dataFim)", () => {
    for (const estado of ["EXPIRADA", "CANCELADA", "SUSPENSA", "PENDENTE"] as const) {
      expect(licencaValida(lic({ estado, dataFim: null }), AGORA)).toBe(false);
    }
  });

  it("PENDENTE (plano escolhido, por pagar) → inválida (§8.1 / §17.1)", () => {
    expect(licencaValida(lic({ estado: "PENDENTE", dataFim: null }), AGORA)).toBe(false);
  });

  it("dataFim exatamente == agora → ainda válida (só inválida quando passa)", () => {
    expect(licencaValida(lic({ estado: "ATIVA", dataFim: new Date(AGORA) }), AGORA)).toBe(
      true,
    );
  });
});

// §3.11 / §8.1 (v7) — guarda de licença agora INDEPENDENTE da rota: o wizard de
// onboarding deixou de ser exceção e fica bloqueado enquanto a licença não for
// válida (PENDENTE/expirada). Sem licença válida → paywall, sempre.
describe("deveBloquearPorLicenca (§3.11 / §8.1)", () => {
  it("licença válida → nunca bloqueia", () => {
    expect(deveBloquearPorLicenca(true)).toBe(false);
  });

  it("sem licença válida → bloqueia (inclui o wizard de onboarding)", () => {
    expect(deveBloquearPorLicenca(false)).toBe(true);
  });
});

// §8.1 (v7) — gating do onboarding, aplicado só quando a licença já é válida.
// Testa a tabela de decisão de routing sem loops (idempotência nas rotas-destino).
describe("destinoOnboarding (§8.1)", () => {
  it("setup por concluir + fora do wizard → força /onboarding", () => {
    expect(destinoOnboarding(false, "/dashboard")).toBe("/onboarding");
    expect(destinoOnboarding(false, "/plantel")).toBe("/onboarding");
    expect(destinoOnboarding(false, "/")).toBe("/onboarding");
  });

  it("setup por concluir + já no wizard → não redireciona (evita loop)", () => {
    expect(destinoOnboarding(false, "/onboarding")).toBeNull();
    expect(destinoOnboarding(false, "/onboarding/escaloes")).toBeNull();
  });

  it("setup concluído + no wizard → encaminha para /dashboard", () => {
    expect(destinoOnboarding(true, "/onboarding")).toBe("/dashboard");
    expect(destinoOnboarding(true, "/onboarding/escaloes")).toBe("/dashboard");
  });

  it("setup concluído + noutra rota → não redireciona (renderiza)", () => {
    expect(destinoOnboarding(true, "/dashboard")).toBeNull();
    expect(destinoOnboarding(true, "/plantel")).toBeNull();
  });

  it("rota que só começa por 'onboarding' (falso positivo) não conta como wizard", () => {
    // Setup por concluir: como NÃO está no wizard, força /onboarding.
    expect(destinoOnboarding(false, "/onboarding-extra")).toBe("/onboarding");
    // Setup concluído: não está no wizard, logo não encaminha para dashboard.
    expect(destinoOnboarding(true, "/onboarding-extra")).toBeNull();
  });

  it("pathname null/undefined (SSR) → tratado como fora do wizard", () => {
    expect(destinoOnboarding(false, null)).toBe("/onboarding");
    expect(destinoOnboarding(false, undefined)).toBe("/onboarding");
    expect(destinoOnboarding(true, null)).toBeNull();
  });
});
