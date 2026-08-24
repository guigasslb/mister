"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { obterMembroAtual, exigirCapacidade, capacidadesEfetivas } from "@/lib/permissoes";
import type { Capacidade } from "@/lib/permissoes-catalogo";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { convidarMembroSchema } from "@/lib/schemas/membro";
import { alterarPasswordSchema, passwordSchema } from "@/lib/schemas/utilizador";

const BCRYPT_COST = 12;
const PATH = "/definicoes/utilizadores";

export interface MembroLista {
  membroId: string;
  utilizadorId: string;
  nome: string;
  email: string;
  perfilId: string;
  perfilNome: string;
  estado: string;
  escaloesAtribuidos: string[];
  /** Capacidades do perfil base — necessárias para o editor de overrides (6.4). */
  perfilCapacidades: string[];
  capacidadesExtra: string[];
  capacidadesRevogadas: string[];
}

/** Identidade mínima de um membro (sem dados sensíveis). */
export interface MembroBasicoLista {
  membroId: string;
  utilizadorId: string;
  nome: string;
}

/**
 * Lista COMPLETA de membros com dados sensíveis (email, perfil, capacidades
 * efetivas, escalões). Requer `CLUBE_UTILIZADORES` (§6.7) — é a mesma capacidade
 * que autoriza as mutações de gestão de membros. Um membro sem esta capacidade
 * (ex.: Treinador Principal) NÃO pode enumerar os dados de todos os membros do
 * clube. Para necessidades de identidade não sensíveis (nome + id) usar
 * `listarMembrosBasico`.
 */
export async function listarMembros(): Promise<Resultado<MembroLista[]>> {
  const perm = await exigirCapacidade("CLUBE_UTILIZADORES");
  if (!perm.ok) return erro(perm.erro);

  const membros = await prisma.membroClube.findMany({
    where: { clubeId: perm.ctx.clube.id },
    include: {
      utilizador: { select: { id: true, nome: true, email: true } },
      perfil: { select: { id: true, nome: true, capacidades: true } },
      atribuicoes: { select: { escalaoId: true } },
    },
    orderBy: { utilizador: { nome: "asc" } },
  });

  return ok(
    membros.map((m) => ({
      membroId: m.id,
      utilizadorId: m.utilizadorId,
      nome: m.utilizador.nome,
      email: m.utilizador.email,
      perfilId: m.perfilId,
      perfilNome: m.perfil.nome,
      estado: m.estado,
      escaloesAtribuidos: m.atribuicoes.map((a) => a.escalaoId),
      perfilCapacidades: m.perfil.capacidades,
      capacidadesExtra: m.capacidadesExtra,
      capacidadesRevogadas: m.capacidadesRevogadas,
    })),
  );
}

/**
 * Lista MÍNIMA de membros (id + nome), sem dados sensíveis. Legível por qualquer
 * membro ativo do clube — serve seletores de identidade (destinatários de
 * lembretes §8.19, atribuição de coordenadores §8.22) sem expor emails,
 * perfis ou capacidades. Filtra sempre pelo clube da adesão ativa.
 */
export async function listarMembrosBasico(): Promise<Resultado<MembroBasicoLista[]>> {
  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Sem acesso a este clube");

  const membros = await prisma.membroClube.findMany({
    where: { clubeId: ctx.clube.id },
    include: { utilizador: { select: { id: true, nome: true } } },
    orderBy: { utilizador: { nome: "asc" } },
  });

  return ok(
    membros.map((m) => ({
      membroId: m.id,
      utilizadorId: m.utilizadorId,
      nome: m.utilizador.nome,
    })),
  );
}

export async function convidarMembro(dados: unknown): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("CLUBE_UTILIZADORES");
  if (!perm.ok) return erro(perm.erro);

  const parsed = convidarMembroSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perfil = await prisma.perfil.findFirst({
    where: { id: parsed.data.perfilId, clubeId: perm.ctx.clube.id },
  });
  if (!perfil) return erro("O perfil selecionado não existe");

  const utilizador = await prisma.utilizador.findUnique({
    where: { email: parsed.data.email },
  });

  if (utilizador) {
    const jaMembro = await prisma.membroClube.findUnique({
      where: {
        utilizadorId_clubeId: {
          utilizadorId: utilizador.id,
          clubeId: perm.ctx.clube.id,
        },
      },
    });
    if (jaMembro) return erro("Este utilizador já é membro do clube");
    const outraAtiva = await prisma.membroClube.findFirst({
      where: { utilizadorId: utilizador.id, estado: "ATIVO" },
    });
    if (outraAtiva) return erro("Este utilizador já tem uma adesão ativa noutro clube");
    // Utilizador existente — cria só a adesão.
    await prisma.membroClube.create({
      data: {
        utilizadorId: utilizador.id,
        clubeId: perm.ctx.clube.id,
        perfilId: perfil.id,
        estado: "ATIVO",
      },
    });
  } else {
    // Utilizador novo — cria conta + adesão atomicamente (evita conta órfã se falhar).
    const passwordHash = await bcrypt.hash(parsed.data.passwordInicial, BCRYPT_COST);
    await prisma.$transaction(async (tx) => {
      const novo = await tx.utilizador.create({
        data: {
          nome: parsed.data.nome,
          email: parsed.data.email,
          passwordHash,
        },
      });
      await tx.membroClube.create({
        data: {
          utilizadorId: novo.id,
          clubeId: perm.ctx.clube.id,
          perfilId: perfil.id,
          estado: "ATIVO",
        },
      });
    });
  }

  revalidatePath(PATH);
  return ok(undefined);
}

export async function atribuirPerfilMembro(
  membroId: string,
  perfilId: string,
): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("CLUBE_UTILIZADORES");
  if (!perm.ok) return erro(perm.erro);

  const membro = await prisma.membroClube.findFirst({
    where: { id: membroId, clubeId: perm.ctx.clube.id },
  });
  if (!membro) return erro("Membro não encontrado");

  const perfil = await prisma.perfil.findFirst({
    where: { id: perfilId, clubeId: perm.ctx.clube.id },
  });
  if (!perfil) return erro("Perfil não encontrado");

  if (await ficariaSemAdmin(perm.ctx.clube.id, membroId, perfilId)) {
    return erro("O clube não pode ficar sem administrador");
  }

  await prisma.membroClube.update({ where: { id: membroId }, data: { perfilId } });
  revalidatePath(PATH);
  return ok(undefined);
}

export async function atribuirEscaloesMembro(
  membroId: string,
  escalaoIds: string[],
): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("CLUBE_UTILIZADORES");
  if (!perm.ok) return erro(perm.erro);

  const membro = await prisma.membroClube.findFirst({
    where: { id: membroId, clubeId: perm.ctx.clube.id },
  });
  if (!membro) return erro("Membro não encontrado");

  const validos = await prisma.escalao.findMany({
    where: { id: { in: escalaoIds }, clubeId: perm.ctx.clube.id },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.atribuicaoEscalao.deleteMany({ where: { membroClubeId: membroId } }),
    ...validos.map((e) =>
      prisma.atribuicaoEscalao.create({
        data: { membroClubeId: membroId, escalaoId: e.id },
      }),
    ),
  ]);
  revalidatePath(PATH);
  return ok(undefined);
}

export async function removerMembro(membroId: string): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("CLUBE_UTILIZADORES");
  if (!perm.ok) return erro(perm.erro);

  const membro = await prisma.membroClube.findFirst({
    where: { id: membroId, clubeId: perm.ctx.clube.id },
  });
  if (!membro) return erro("Membro não encontrado");

  if (await ficariaSemAdmin(perm.ctx.clube.id, membroId, null)) {
    return erro("O clube não pode ficar sem administrador");
  }

  await prisma.membroClube.delete({ where: { id: membroId } });
  revalidatePath(PATH);
  return ok(undefined);
}

export async function redefinirPasswordMembro(
  membroId: string,
  novaPassword: unknown,
): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("CLUBE_UTILIZADORES");
  if (!perm.ok) return erro(perm.erro);

  const parsed = passwordSchema.safeParse(novaPassword);
  if (!parsed.success) return erro(parsed.error.issues[0]?.message ?? "Password inválida");

  const membro = await prisma.membroClube.findFirst({
    where: { id: membroId, clubeId: perm.ctx.clube.id },
    select: { utilizadorId: true },
  });
  if (!membro) return erro("Membro não encontrado");

  const passwordHash = await bcrypt.hash(parsed.data, BCRYPT_COST);
  await prisma.utilizador.update({
    where: { id: membro.utilizadorId },
    data: { passwordHash },
  });
  return ok(undefined);
}

export async function alterarMinhaPassword(dados: unknown): Promise<Resultado<void>> {
  const session = await auth();
  if (!session?.user?.id) return erro("Não autenticado");

  const parsed = alterarPasswordSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const utilizador = await prisma.utilizador.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!utilizador) return erro("Utilizador não encontrado");

  const correta = await bcrypt.compare(parsed.data.passwordAtual, utilizador.passwordHash);
  if (!correta) return erro("Password atual incorreta");

  const passwordHash = await bcrypt.hash(parsed.data.novaPassword, BCRYPT_COST);
  await prisma.utilizador.update({ where: { id: session.user.id }, data: { passwordHash } });
  return ok(undefined);
}

// Admin = capacidades EFETIVAS (perfil + extra − revogadas) com CLUBE_UTILIZADORES
// e CLUBE_PERFIS. Impede ficar sem admin (secção 6.7), considerando overrides (F0).
async function ficariaSemAdmin(
  clubeId: string,
  membroIdAlvo: string,
  novoPerfilId: string | null,
): Promise<boolean> {
  const membros = await prisma.membroClube.findMany({
    where: { clubeId, estado: "ATIVO" },
    include: { perfil: { select: { id: true, capacidades: true } } },
  });

  const eAdmin = (caps: Set<Capacidade>) =>
    caps.has("CLUBE_UTILIZADORES") && caps.has("CLUBE_PERFIS");

  // Base do novo perfil a atribuir ao membro alvo (apenas em atribuirPerfilMembro).
  let novaBase: string[] = [];
  if (novoPerfilId) {
    novaBase =
      membros.find((m) => m.perfil.id === novoPerfilId)?.perfil.capacidades ??
      (await prisma.perfil.findUnique({
        where: { id: novoPerfilId },
        select: { capacidades: true },
      }))?.capacidades ??
      [];
  }

  const adminsRestantes = membros.filter((m) => {
    if (m.id === membroIdAlvo) {
      // Remoção do membro: deixa de contar.
      if (novoPerfilId === null) return false;
      // Troca de perfil: muda a base; os overrides do membro mantêm-se.
      return eAdmin(
        capacidadesEfetivas(novaBase, m.capacidadesExtra, m.capacidadesRevogadas),
      );
    }
    return eAdmin(
      capacidadesEfetivas(m.perfil.capacidades, m.capacidadesExtra, m.capacidadesRevogadas),
    );
  });

  return adminsRestantes.length === 0;
}
