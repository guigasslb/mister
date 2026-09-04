"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { obterMembroAtual } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { registarSchema, criarClubeSchema } from "@/lib/schemas/onboarding";
import { PERFIS_ARRANQUE } from "@/lib/permissoes-catalogo";
import { instalarConteudoArranquePorModalidade } from "@/lib/biblioteca-arranque-instalar";

// Rótulo pt-PT por modalidade (nome da secção inicial — §3.1.1).
const ROTULO_MODALIDADE: Record<"FUTSAL" | "FUTEBOL", string> = {
  FUTSAL: "Futsal",
  FUTEBOL: "Futebol",
};

const BCRYPT_COST = 12;

/**
 * Sinaliza, de dentro da transação de `criarClube`, que o utilizador já tem uma
 * adesão ATIVA — usado para abortar a transação e devolver um erro limpo (§5.4).
 */
class AdesaoAtivaError extends Error {}

/** Registo de um novo utilizador (modo individual, sem clube). */
export async function registar(dados: unknown): Promise<Resultado<void>> {
  const parsed = registarSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const existe = await prisma.utilizador.findUnique({
    where: { email: parsed.data.email },
  });
  if (existe) return erro("Já existe uma conta com este email");

  await prisma.utilizador.create({
    data: {
      nome: parsed.data.nome,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, BCRYPT_COST),
    },
  });
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
    // 🔒 Guarda anti-duplicação re-verificada DENTRO da transação (§5.4): fecha a
    // janela TOCTOU entre o `jaAtivo` externo (acima) e a escrita do MembroClube.
    // Sem isto, dois pedidos concorrentes (duplo-submit, ou o formulário aberto
    // num separador enquanto outro já criou o clube) podiam ambos passar o check
    // externo e criar DOIS clubes para o mesmo utilizador. É a defesa em
    // profundidade que garante a regra "uma adesão ativa de cada vez".
    const adesaoConcorrente = await tx.membroClube.findFirst({
      where: { utilizadorId: session.user!.id!, estado: "ATIVO" },
    });
    if (adesaoConcorrente) throw new AdesaoAtivaError();

    const clube = await tx.clube.create({
      data: {
        nome: parsed.data.nome,
        corPrimaria: parsed.data.corPrimaria ?? "#1A2FD4",
        corSecundaria: parsed.data.corSecundaria ?? "#FFD700",
      },
    });

    // 🔁 v7 (§8.1.1): secção inicial da modalidade escolhida. A modalidade de
    // tudo o resto deriva daqui (§1.7.1); o conteúdo curado é instalado nela
    // após a transação e os escalões criados no wizard ligam-se a esta secção
    // (resolvida por `garantirSeccaoParaModalidade`, idempotente).
    await tx.seccao.create({
      data: {
        clubeId: clube.id,
        modalidade,
        nome: ROTULO_MODALIDADE[modalidade],
      },
    });

    // Época inicial: nome/datas derivados do ano corrente. A época de futsal
    // arranca em setembro; antes de agosto ainda estamos na época iniciada no
    // ano anterior. Fica ativa para que obterEpocaAtiva() não devolva null.
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
    // e modalidade corretos. Pré-criar um "Seniores" fixo dava um escalão errado
    // a clubes de formação jovem ou de futebol sem sénior (e a deteção de formação
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
        utilizadorId: session.user!.id!,
        clubeId: clube.id,
        perfilId: perfilAdminId,
        estado: "ATIVO",
      },
    });

    // 🔁 v7 (§8.1 / §17.1): plano escolhido no onboarding fica como licença
    // PENDENTE (ainda por pagar). O paywall (/sem-licenca) usa-a para mostrar o
    // valor exato a transferir. `INDIVIDUAL` → TipoLicenca.INDIVIDUAL (tier null);
    // os restantes → CLUBE + TierClube. Guardada no `clubeId` (o clube foi agora
    // criado) para que a guarda de licença e o paywall a resolvam pelo clube.
    // `numSeccoes` fica no default (1); o preço é calculado on-read em
    // obterLicencaPendente(). Sem `dataFim` (não é trial).
    const tierEscolhido = parsed.data.tier;
    await tx.licenca.create({
      data: {
        tipo: tierEscolhido === "INDIVIDUAL" ? "INDIVIDUAL" : "CLUBE",
        tier: tierEscolhido === "INDIVIDUAL" ? null : tierEscolhido,
        estado: "PENDENTE",
        ciclo: "MENSAL",
        clubeId: clube.id,
      },
    });

    return { clubeId: clube.id };
    });
  } catch (e) {
    // Adesão ativa detetada dentro da transação → aborta e devolve erro limpo
    // (a transação foi revertida, nenhum clube foi criado). Outros erros sobem.
    if (e instanceof AdesaoAtivaError) {
      return erro("Já tens uma adesão ativa a um clube. Sai desse clube primeiro.");
    }
    throw e;
  }

  // 🔁 v7 (§8.1.1): instala o conteúdo curado da modalidade escolhida para que a
  // secção inicial nunca comece vazia. Corre APÓS a transação (o membro admin já
  // existe — o instalador resolve o autor a partir dele). Best-effort: uma falha
  // na biblioteca de arranque não deve abortar a criação do clube (já persistida).
  try {
    await instalarConteudoArranquePorModalidade(resultado.clubeId, modalidade);
  } catch (e) {
    console.error("criarClube: falha a instalar o conteúdo de arranque", e);
  }

  // 🔁 v7 (§17.1/§17.2): regista a modalidade contratada na licença, se já existir
  // (o billing é deferido — normalmente não há licença no onboarding).
  await prisma.licenca.updateMany({
    where: { clubeId: resultado.clubeId },
    data: { modalidade },
  });

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
