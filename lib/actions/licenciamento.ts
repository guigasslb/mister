"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obterMembroAtual } from "@/lib/permissoes";
import type { Capacidade } from "@/lib/permissoes-catalogo";
import { utilizadorIdSchema } from "@/lib/schemas/licenciamento";
import { calcularPrecoLicenca, PRECO_INDIVIDUAL_CENTIMOS } from "@/lib/billing";
import { ok, erro, type Resultado } from "@/lib/utils";
import type { Carteira, Licenca, MovimentoCarteira, TierClube } from "@prisma/client";

// F11 — Licenciamento, subscrição e carteira (§3.11 / §17).
// Billing (Paddle) DEFERIDO: estas actions preparam a arquitetura de dados;
// o enforcement de licença e o checkout entram numa fase posterior.

const PATH = "/definicoes/licenca";

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
 * Um membro é administrador se as suas capacidades efetivas incluírem a gestão
 * de utilizadores E de perfis (mesma definição usada em membros/utilizadores).
 */
function eAdmin(capacidades: Capacidade[]): boolean {
  return capacidades.includes("CLUBE_UTILIZADORES") && capacidades.includes("CLUBE_PERFIS");
}

/**
 * Cria a carteira do utilizador caso ainda não exista e devolve-a sempre.
 * Helper INTERNO (não é Server Action): não é exportado, pelo que a diretiva
 * "use server" deste ficheiro não o expõe ao cliente. É invocado por outras
 * actions do servidor (ex.: `criarLicencaDemostracao`).
 */
async function garantirCarteira(utilizadorId: string): Promise<Carteira> {
  const parsed = utilizadorIdSchema.parse(utilizadorId);

  // upsert é idempotente: cria com saldo 0 na primeira vez, devolve a existente depois.
  return prisma.carteira.upsert({
    where: { utilizadorId: parsed },
    update: {},
    create: { utilizadorId: parsed, saldoCentimos: 0 },
  });
}

/**
 * Licença ATIVA do clube do utilizador autenticado, com os dados da carteira
 * do próprio utilizador. Devolve `null` se não existir licença ativa
 * (ou se o utilizador não tiver clube ativo — modo individual sem clube).
 */
export async function obterLicenca(): Promise<Resultado<LicencaComCarteira | null>> {
  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Sem acesso a este clube");

  const licenca = await prisma.licenca.findFirst({
    where: { clubeId: ctx.clube.id, estado: "ATIVA" },
  });
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
  // Segurança (IDOR): o clube deriva SEMPRE da sessão do utilizador autenticado,
  // nunca de um parâmetro externo — caso contrário qualquer utilizador poderia
  // consultar o plano pendente de outro clube passando um clubeId arbitrário.
  const ctx = await obterMembroAtual();
  if (!ctx) return null;
  const clubeId = ctx.clube.id;

  const licenca = await prisma.licenca.findUnique({
    where: { clubeId },
    select: { estado: true, tipo: true, tier: true, numSeccoes: true },
  });

  if (!licenca || licenca.estado !== "PENDENTE") return null;

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

/**
 * Cria uma licença de demonstração (tipo CLUBE, tier PEQUENO, estado ATIVA,
 * ciclo MENSAL) para o clube do utilizador autenticado, além de garantir a
 * carteira do próprio utilizador (saldo 0). Só administradores.
 *
 * Idempotente: se já existir licença para o clube, devolve-a sem a recriar.
 */
export async function criarLicencaDemostracao(): Promise<Resultado<Licenca>> {
  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Sem acesso a este clube");
  if (!eAdmin(ctx.capacidades)) return erro("Sem permissão");

  const clubeId = ctx.clube.id;

  // Idempotência: clubeId é @unique em Licenca — no máximo uma por clube.
  const existente = await prisma.licenca.findUnique({ where: { clubeId } });

  // Garante a carteira do utilizador em qualquer caso (também idempotente).
  await garantirCarteira(ctx.utilizadorId);

  if (existente) {
    revalidatePath(PATH);
    return ok(existente);
  }

  const licenca = await prisma.licenca.create({
    data: {
      tipo: "CLUBE",
      tier: "PEQUENO",
      estado: "ATIVA",
      ciclo: "MENSAL",
      clubeId,
    },
  });

  revalidatePath(PATH);
  return ok(licenca);
}
