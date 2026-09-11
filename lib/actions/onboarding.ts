"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { obterMembroAtual } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { registarSchema, criarClubeSchema, type RegistarInput } from "@/lib/schemas/onboarding";
import { PERFIS_ARRANQUE } from "@/lib/permissoes-catalogo";
import { instalarConteudoArranquePorModalidade } from "@/lib/biblioteca-arranque-instalar";
import { enviarEmail } from "@/lib/email/resend";
import { emailNovoRegisto, obterEmailAdmin } from "@/lib/email/templates/novo-registo";
import { Prisma } from "@prisma/client";
import type { TierEscolhido } from "@/lib/actions/licenciamento";

// Rótulo pt-PT por modalidade (nome da secção inicial — §3.1.1).
const ROTULO_MODALIDADE: Record<"FUTSAL" | "FUTEBOL", string> = {
  FUTSAL: "Futsal",
  FUTEBOL: "Futebol",
};

// Rótulo pt-PT por plano de registo — usado no email ao admin (§17.5), para o
// corpo ler "Clube Médio" em vez do enum cru "MEDIO". Chaveado pelos planos do
// contrato de registo (sem PARCEIRO, que é negociado fora do onboarding).
const ROTULO_PLANO: Record<RegistarInput["tier"], string> = {
  INDIVIDUAL: "Individual",
  PEQUENO: "Clube Pequeno",
  MEDIO: "Clube Médio",
  GRANDE: "Clube Grande",
};

const BCRYPT_COST = 12;

/** Cores por omissão do clube (o utilizador personaliza-as depois no wizard). */
const COR_PRIMARIA_PADRAO = "#1A2FD4";
const COR_SECUNDARIA_PADRAO = "#FFD700";

/**
 * Sinaliza, de dentro da transação de `criarClube`, que o utilizador já tem uma
 * adesão ATIVA — usado para abortar a transação e devolver um erro limpo (§5.4).
 */
class AdesaoAtivaError extends Error {}

/** Titular de uma licença: exatamente um dos dois preenchido (§3.11). */
type TitularLicenca = { clubeId: string } | { utilizadorId: string };

/**
 * Cria a licença PENDENTE do plano escolhido no onboarding (§8.1 / §17.1).
 *
 * Aceita o titular por `clubeId` (ramo Clube) OU `utilizadorId` (ramo Individual).
 * Semântica idêntica à v6 para o ramo Clube: estado PENDENTE, ciclo MENSAL, sem
 * `dataFim` (não é trial). `INDIVIDUAL` mapeia para TipoLicenca.INDIVIDUAL
 * (tier null) e titular por `utilizadorId`; os restantes para CLUBE + TierClube
 * e titular por `clubeId`; `numSeccoes` fica no default (1) e o preço é calculado
 * on-read no paywall.
 *
 * A `modalidade` só é gravada nas licenças Individual (§3.11/§17.1: registo
 * explícito do produto Individual vendido); nas licenças de Clube fica null (a
 * modalidade do clube deriva das secções, não da licença).
 *
 * Helper INTERNO (não exportado): a diretiva "use server" deste ficheiro não o
 * expõe ao cliente. Aceita um cliente Prisma normal ou de transação (tx) —
 * `Prisma.TransactionClient` cobre ambos.
 */
function criarLicencaPendente(
  db: Prisma.TransactionClient,
  tier: TierEscolhido,
  titular: TitularLicenca,
  modalidade: "FUTSAL" | "FUTEBOL",
) {
  return db.licenca.create({
    data: {
      tipo: tier === "INDIVIDUAL" ? "INDIVIDUAL" : "CLUBE",
      tier: tier === "INDIVIDUAL" ? null : tier,
      estado: "PENDENTE",
      ciclo: "MENSAL",
      // §3.11/§17.1: modalidade é atributo do produto Individual; null em Clube.
      modalidade: tier === "INDIVIDUAL" ? modalidade : null,
      ...titular,
    },
  });
}

/**
 * Semeia o clube completo DENTRO de uma transação (§8.1.1): clube + secção
 * inicial da modalidade + época ativa + perfis de arranque + membro admin +
 * licença PENDENTE. Núcleo partilhado por `registar` (novo utilizador) e
 * `criarClube` (utilizador autenticado sem clube) — a atomicidade é garantida
 * pelo `tx` que o chamador abre. Não semeia escalões (o wizard trata disso).
 *
 * Helper INTERNO (não exportado): a diretiva "use server" não o expõe ao cliente.
 */
async function semearClubeNaTransacao(
  tx: Prisma.TransactionClient,
  params: {
    utilizadorId: string;
    nomeClube: string;
    corPrimaria: string;
    corSecundaria: string;
    modalidade: "FUTSAL" | "FUTEBOL";
    tier: TierEscolhido;
  },
): Promise<{ clubeId: string }> {
  // §3.11: `clubeTecnico` é o single source of truth do modo Individual — true
  // marca o clube técnico (invisível) que suporta a licença Individual; false é
  // um clube normal (multi-treinador). O frontend lê esta flag para ocultar a UI
  // de gestão de clube/membros; o servidor recusa essas ações na mesma (defesa em
  // profundidade — a ocultação de UI é cosmética).
  const eIndividual = params.tier === "INDIVIDUAL";

  const clube = await tx.clube.create({
    data: {
      nome: params.nomeClube,
      corPrimaria: params.corPrimaria,
      corSecundaria: params.corSecundaria,
      clubeTecnico: eIndividual,
    },
  });

  // 🔁 v7 (§8.1.1): secção inicial da modalidade escolhida. A modalidade de tudo
  // o resto deriva daqui (§1.7.1); o conteúdo curado é instalado nela após a
  // transação e os escalões do wizard ligam-se a esta secção.
  await tx.seccao.create({
    data: {
      clubeId: clube.id,
      modalidade: params.modalidade,
      nome: ROTULO_MODALIDADE[params.modalidade],
    },
  });

  // Época inicial: nome/datas derivados do ano corrente. A época de futsal
  // arranca em setembro; antes de agosto ainda estamos na época iniciada no ano
  // anterior. Fica ativa para que obterEpocaAtiva() não devolva null.
  const agora = new Date();
  const mes = agora.getMonth(); // 0 = janeiro, 7 = agosto
  const anoInicio = mes >= 7 ? agora.getFullYear() : agora.getFullYear() - 1;
  const anoFim = anoInicio + 1;
  await tx.epoca.create({
    data: {
      clubeId: clube.id,
      nome: `${anoInicio}/${anoFim}`,
      dataInicio: new Date(anoInicio, 8, 1), // 1 de setembro
      dataFim: new Date(anoFim, 5, 30), // 30 de junho
      ativa: true,
    },
  });

  // Nenhum escalão é semeado por defeito: o wizard de onboarding tem um passo
  // dedicado (PassoEscaloes) onde o utilizador cria os seus escalões com o nome
  // e modalidade corretos. Pré-criar um "Seniores" fixo dava um escalão errado a
  // clubes de formação jovem ou de futebol sem sénior (e a deteção de formação
  // jovem — eEscalaoFormacaoJovem — assenta no nome do escalão).
  let perfilAdminId = "";
  for (const p of PERFIS_ARRANQUE) {
    const perfil = await tx.perfil.create({
      data: {
        clubeId: clube.id,
        nome: p.nome,
        descricao: p.descricao,
        ambito: p.ambito,
        capacidades: p.capacidades,
        sistema: true,
      },
    });
    if (p.nome === "Administrador") perfilAdminId = perfil.id;
  }

  await tx.membroClube.create({
    data: {
      utilizadorId: params.utilizadorId,
      clubeId: clube.id,
      perfilId: perfilAdminId,
      estado: "ATIVO",
    },
  });

  // 🔁 v7 (§3.11): no modo Individual a licença pertence à PESSOA (utilizadorId),
  // não ao clube técnico. Nos tiers de Clube, a licença pertence ao clube. Exatamente
  // um dos dois titulares fica preenchido (constraint @unique em ambos).
  const titular: TitularLicenca = eIndividual
    ? { utilizadorId: params.utilizadorId }
    : { clubeId: clube.id };

  // 🔁 v7 (§3.11 / §8.1 / §17.1): plano escolhido fica como licença PENDENTE (por
  // pagar). O paywall (/sem-licenca) usa-a para mostrar o valor a transferir.
  // `INDIVIDUAL` → TipoLicenca.INDIVIDUAL (tier null, titular utilizadorId,
  // modalidade registada); os restantes → CLUBE + TierClube (titular clubeId,
  // modalidade null).
  await criarLicencaPendente(tx, params.tier, titular, params.modalidade);

  // 🔁 v7 (§3.11): a Carteira (crédito de absorção 🎒 portátil) é da pessoa e
  // materializa-se no arranque do modo Individual. Upsert (idempotente) porque a
  // carteira pode já existir de uma adesão anterior — nesse caso preserva o saldo.
  if (eIndividual) {
    await tx.carteira.upsert({
      where: { utilizadorId: params.utilizadorId },
      update: {},
      create: { utilizadorId: params.utilizadorId },
    });
  }

  return { clubeId: clube.id };
}

/**
 * Passos pós-transação da criação de um clube (§8.1.1 / §17.1). Best-effort para
 * a biblioteca: uma falha a instalar o conteúdo curado NÃO aborta a criação (já
 * persistida).
 *
 * NÃO grava a modalidade na licença: no modo Individual a modalidade é registada
 * na criação da licença (dentro da transação, por `criarLicencaPendente`); nas
 * licenças de Clube a modalidade é null (§3.11/§17.1 — a modalidade do clube
 * deriva das secções, não da licença).
 */
async function finalizarCriacaoClube(
  clubeId: string,
  modalidade: "FUTSAL" | "FUTEBOL",
): Promise<void> {
  // Instala o conteúdo curado da modalidade para que a secção inicial nunca
  // comece vazia. Corre APÓS a transação (o membro admin já existe — o instalador
  // resolve o autor a partir dele).
  try {
    await instalarConteudoArranquePorModalidade(clubeId, modalidade);
  } catch (e) {
    console.error("criarClube: falha a instalar o conteúdo de arranque", e);
  }
}

/**
 * Registo de um novo utilizador (§8.1 / §17.5). Cria ATOMICAMENTE, numa única
 * transação: conta (hash bcrypt) + clube + secção da modalidade + época + perfis
 * + membro admin + licença PENDENTE. Após a transação: instala o conteúdo curado
 * e notifica o admin por email (ambos best-effort — não partem o registo).
 *
 * Semântica de auth preservada: faz o hash da password mas NÃO chama `signIn` —
 * o formulário autentica a seguir e encaminha para o paywall (/sem-licenca), onde
 * o wizard fica bloqueado até a licença ser ativada.
 */
export async function registar(dados: unknown): Promise<Resultado<void>> {
  const parsed = registarSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Pré-verificação amigável do email (mensagem limpa no caso comum). A defesa
  // real contra a corrida TOCTOU é a constraint @unique do email, apanhada como
  // P2002 dentro da transação abaixo — sem isso, um duplo-submit criaria dois
  // clubes órfãos.
  const existe = await prisma.utilizador.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existe) return erro("Já existe uma conta com este email");

  const modalidade = parsed.data.modalidade;
  const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_COST);

  let resultado: { clubeId: string };
  try {
    resultado = await prisma.$transaction(async (tx) => {
      const utilizador = await tx.utilizador.create({
        data: {
          nome: parsed.data.nome,
          email: parsed.data.email,
          passwordHash,
        },
      });

      return semearClubeNaTransacao(tx, {
        utilizadorId: utilizador.id,
        nomeClube: parsed.data.nomeClube,
        corPrimaria: COR_PRIMARIA_PADRAO,
        corSecundaria: COR_SECUNDARIA_PADRAO,
        modalidade,
        tier: parsed.data.tier,
      });
    });
  } catch (e) {
    // Corrida TOCTOU no email: a constraint @unique dispara P2002 dentro da
    // transação (revertida — nenhuma conta/clube fica órfão). Erro limpo.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return erro("Já existe uma conta com este email");
    }
    throw e;
  }

  await finalizarCriacaoClube(resultado.clubeId, modalidade);

  // Notifica o admin do novo registo (§17.5). Best-effort: uma falha de email
  // NUNCA parte o registo (a conta/clube/licença já estão persistidos).
  try {
    const conteudo = emailNovoRegisto({
      nome: parsed.data.nome,
      email: parsed.data.email,
      clube: parsed.data.nomeClube,
      plano: ROTULO_PLANO[parsed.data.tier],
      modalidade: ROTULO_MODALIDADE[modalidade],
    });
    await enviarEmail({
      para: obterEmailAdmin(),
      assunto: conteudo.assunto,
      html: conteudo.html,
      texto: conteudo.texto,
    });
  } catch (e) {
    console.error("registar: falha ao notificar o admin do novo registo", e);
  }

  revalidatePath("/", "layout");
  return ok(undefined);
}

/**
 * Cria um clube e torna o utilizador autenticado Administrador.
 * Gera os perfis de arranque editáveis (secção 6.5).
 */
export async function criarClube(dados: unknown): Promise<Resultado<{ clubeId: string }>> {
  const session = await auth();
  if (!session?.user?.id) return erro("Não autenticado");

  const parsed = criarClubeSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // A sessão (JWT) pode referenciar um utilizador que já não existe (ex.: BD
  // reseeded, conta apagada). Sem este guard, o insert de MembroClube rebenta
  // com um erro de FK (500). Devolver erro limpo a pedir novo login.
  const utilizador = await prisma.utilizador.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  if (!utilizador)
    return erro("A tua sessão é inválida ou expirou. Termina sessão e volta a entrar.");

  // Regra: uma adesão ativa de cada vez
  const jaAtivo = await prisma.membroClube.findFirst({
    where: { utilizadorId: session.user.id, estado: "ATIVO" },
  });
  if (jaAtivo) return erro("Já tens uma adesão ativa a um clube. Sai desse clube primeiro.");

  const modalidade = parsed.data.modalidade;

  let resultado: { clubeId: string };
  try {
    resultado = await prisma.$transaction(async (tx) => {
      // 🔒 Guarda anti-duplicação re-verificada DENTRO da transação (§5.4): fecha
      // a janela TOCTOU entre o `jaAtivo` externo (acima) e a escrita do
      // MembroClube. Sem isto, dois pedidos concorrentes (duplo-submit, ou o
      // formulário aberto num separador enquanto outro já criou o clube) podiam
      // ambos passar o check externo e criar DOIS clubes para o mesmo utilizador.
      // É a defesa em profundidade que garante "uma adesão ativa de cada vez".
      const adesaoConcorrente = await tx.membroClube.findFirst({
        where: { utilizadorId: session.user!.id!, estado: "ATIVO" },
      });
      if (adesaoConcorrente) throw new AdesaoAtivaError();

      return semearClubeNaTransacao(tx, {
        utilizadorId: session.user!.id!,
        nomeClube: parsed.data.nome,
        corPrimaria: parsed.data.corPrimaria ?? COR_PRIMARIA_PADRAO,
        corSecundaria: parsed.data.corSecundaria ?? COR_SECUNDARIA_PADRAO,
        modalidade,
        tier: parsed.data.tier,
      });
    });
  } catch (e) {
    // Adesão ativa detetada dentro da transação → aborta e devolve erro limpo
    // (a transação foi revertida, nenhum clube foi criado). Outros erros sobem.
    if (e instanceof AdesaoAtivaError) {
      return erro("Já tens uma adesão ativa a um clube. Sai desse clube primeiro.");
    }
    throw e;
  }

  await finalizarCriacaoClube(resultado.clubeId, modalidade);

  revalidatePath("/", "layout");
  return ok(resultado);
}

/**
 * Marca o onboarding do clube como concluído (§8.1).
 *
 * Persiste em `Clube.onboardingConcluido` para que o estado seja partilhado
 * entre dispositivos/sessões (antes vivia apenas em localStorage e perdia-se
 * noutro browser). Chamada no final do wizard, antes de redirecionar.
 */
export async function marcarOnboardingConcluido(): Promise<Resultado<void>> {
  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Sem acesso a este clube");

  await prisma.clube.update({
    where: { id: ctx.clube.id },
    data: { onboardingConcluido: true },
  });

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  return ok<void>(undefined);
}
