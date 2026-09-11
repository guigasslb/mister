"use server";

import { prisma } from "@/lib/db";
import { obterMembroAtual } from "@/lib/permissoes";
import { calcularPrecoLicenca, PRECO_INDIVIDUAL_CENTIMOS } from "@/lib/billing";
import { ok, erro, type Resultado } from "@/lib/utils";
import type { Carteira, Licenca, MovimentoCarteira, TierClube } from "@prisma/client";

// F11 — Licenciamento, subscrição e carteira (§3.11 / §17).
// Billing (Paddle) DEFERIDO: estas actions preparam a arquitetura de dados;
// o enforcement de licença e o checkout entram numa fase posterior.

/** Licença do clube com os dados da carteira do utilizador autenticado. */
export type LicencaComCarteira = Licenca & { carteira: Carteira | null };

/**
 * Plano escolhido no onboarding, incluindo o Individual (§3.11 / §17.1). `INDIVIDUAL`
 * não é um TierClube — é o produto Individual (TipoLicenca.INDIVIDUAL).
 */
export type TierEscolhido = TierClube | "INDIVIDUAL";

/**
 * Plano escolhido no onboarding e ainda por pagar (§8.1 / §17.1). O preço é
 * calculado on-read (Clube: tier + nº de secções faturadas; Individual: preço
 * fixo), para ambos os ciclos, para o paywall mostrar "€X/mês ou €Y/ano".
 */
export type LicencaPendente = {
  tier: TierEscolhido;
  precoCentimos: number; // ciclo MENSAL
  precoAnualCentimos: number; // ciclo ANUAL
};

/**
 * Licença ATIVA do utilizador autenticado, com os dados da sua carteira. Devolve
 * `null` se não existir licença ativa.
 *
 * A licença ATIVA pode viver no clube (`clubeId`, licença de Clube) OU no próprio
 * utilizador (`utilizadorId`, licença Individual suportada por um clube técnico —
 * §3.11). O titular é exatamente um dos dois, mas resolvemos ambos para que
 * Definições→Licença funcione em qualquer dos ramos. `clubeId` e `utilizadorId`
 * são `@unique` em Licenca.
 */
export async function obterLicenca(): Promise<Resultado<LicencaComCarteira | null>> {
  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Sem acesso a este clube");

  const [licencaClube, licencaIndividual] = await Promise.all([
    prisma.licenca.findUnique({ where: { clubeId: ctx.clube.id } }),
    prisma.licenca.findUnique({ where: { utilizadorId: ctx.utilizadorId } }),
  ]);

  // Escolhe a licença efetivamente ATIVA (Clube tem precedência caso, por algum
  // motivo, ambas existam ativas — cenário fora do modelo normal).
  const licenca =
    (licencaClube?.estado === "ATIVA" ? licencaClube : null) ??
    (licencaIndividual?.estado === "ATIVA" ? licencaIndividual : null);
  if (!licenca) return ok(null);

  const carteira = await prisma.carteira.findUnique({
    where: { utilizadorId: ctx.utilizadorId },
  });

  return ok({ ...licenca, carteira });
}

/**
 * Plano PENDENTE do clube (escolhido no onboarding, ainda por pagar) com o preço
 * já calculado para os dois ciclos (§8.1 / §17.1). Usado pelo paywall
 * (/sem-licenca) para mostrar o valor exato a transferir.
 *
 * Devolve `null` quando o clube não tem licença PENDENTE (ex.: clubes criados
 * antes desta funcionalidade, ou licença já ATIVA) — o paywall cai então na
 * tabela completa de planos. Só considera licenças de tier de Clube (PARCEIRO
 * devolve preço 0, por ser negociado — ver calcularPrecoLicenca).
 */
export async function obterLicencaPendente(): Promise<LicencaPendente | null> {
  // Segurança (IDOR): o titular deriva SEMPRE da sessão do utilizador autenticado,
  // nunca de um parâmetro externo — caso contrário qualquer utilizador poderia
  // consultar o plano pendente de outro clube/utilizador passando um id arbitrário.
  const ctx = await obterMembroAtual();
  if (!ctx) return null;

  // O plano PENDENTE pode estar gravado na licença de Clube (clubeId) OU na
  // licença Individual do próprio utilizador (utilizadorId) — §3.11. O titular é
  // exatamente um dos dois, mas resolvemos ambos para que o paywall mostre o valor
  // a transferir em qualquer dos ramos. `clubeId` e `utilizadorId` são @unique.
  const campos = { estado: true, tipo: true, tier: true, numSeccoes: true } as const;
  const [licencaClube, licencaIndividual] = await Promise.all([
    prisma.licenca.findUnique({ where: { clubeId: ctx.clube.id }, select: campos }),
    prisma.licenca.findUnique({ where: { utilizadorId: ctx.utilizadorId }, select: campos }),
  ]);

  // Escolhe a licença que está efetivamente PENDENTE (Clube tem precedência caso,
  // por algum motivo, ambas existam pendentes — cenário fora do modelo normal).
  const licenca =
    (licencaClube?.estado === "PENDENTE" ? licencaClube : null) ??
    (licencaIndividual?.estado === "PENDENTE" ? licencaIndividual : null);

  if (!licenca) return null;

  // Individual: preço fixo (uma modalidade), não usa o cálculo multi-secção.
  if (licenca.tipo === "INDIVIDUAL") {
    return {
      tier: "INDIVIDUAL",
      precoCentimos: PRECO_INDIVIDUAL_CENTIMOS.MENSAL,
      precoAnualCentimos: PRECO_INDIVIDUAL_CENTIMOS.ANUAL,
    };
  }

  // Clube: preço do tier já com acréscimo por secção adicional.
  if (!licenca.tier) return null;
  return {
    tier: licenca.tier,
    precoCentimos: calcularPrecoLicenca(licenca.tier, licenca.numSeccoes, "MENSAL"),
    precoAnualCentimos: calcularPrecoLicenca(licenca.tier, licenca.numSeccoes, "ANUAL"),
  };
}

/**
 * Movimentos da carteira do utilizador autenticado, ordenados por data desc.
 * Devolve lista vazia se o utilizador ainda não tiver carteira.
 */
export async function listarMovimentosCarteira(): Promise<Resultado<MovimentoCarteira[]>> {
  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Sem acesso a este clube");

  const carteira = await prisma.carteira.findUnique({
    where: { utilizadorId: ctx.utilizadorId },
    select: { id: true },
  });
  if (!carteira) return ok([]);

  const movimentos = await prisma.movimentoCarteira.findMany({
    where: { carteiraId: carteira.id },
    orderBy: { criadoEm: "desc" },
  });
  return ok(movimentos);
}
