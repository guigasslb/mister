"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type EstadoMembro } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirAdminPlataforma } from "@/lib/admin-guard";
import {
  ClubeIdSchema,
  EditarUtilizadorSchema,
  AlterarEstadoMembroSchema,
} from "@/lib/schemas/admin";
import { capacidadesEfetivas } from "@/lib/permissoes-catalogo";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";

// Fase 21.2 — Backoffice interno: gestão de CONTAS/MEMBROS dentro de uma licença
// de clube. Como `lib/actions/admin-licencas.ts`, estas actions são CROSS-TENANT
// (operador do produto Mister): o único gate é `exigirAdminPlataforma()`, chamado
// no início de cada action. NUNCA usar `obterMembroAtual()` aqui (isso é
// club-scoped e pressupõe uma adesão ativa do próprio, que o admin não tem).

const PATH = "/admin";

/** Membro de um clube, tal como exibido na gestão do backoffice. */
export interface MembroClubeAdmin {
  membroId: string;
  utilizadorId: string;
  nome: string;
  email: string;
  perfilNome: string;
  estado: EstadoMembro;
  /** true se as capacidades efetivas o tornam administrador do clube. */
  eAdminClube: boolean;
}

/**
 * Lista os membros (contas) associados a um clube — nome, email, perfil e estado.
 * Só admins de plataforma. Sinaliza quem é administrador do clube (capacidades
 * efetivas com CLUBE_UTILIZADORES + CLUBE_PERFIS, a mesma definição de
 * `admin-licencas.ts`), para a UI poder alertar antes de suspender o último admin.
 */
export async function listarMembrosClube(
  clubeId: string,
): Promise<Resultado<MembroClubeAdmin[]>> {
  await exigirAdminPlataforma();

  const parsed = ClubeIdSchema.safeParse(clubeId);
  if (!parsed.success) return erro("Clube inválido");

  try {
    const membros = await prisma.membroClube.findMany({
      where: { clubeId: parsed.data },
      select: {
        id: true,
        utilizadorId: true,
        estado: true,
        capacidadesExtra: true,
        capacidadesRevogadas: true,
        utilizador: { select: { nome: true, email: true } },
        perfil: { select: { nome: true, capacidades: true } },
      },
      orderBy: { utilizador: { nome: "asc" } },
    });

    return ok(
      membros.map((m) => {
        const efetivas = capacidadesEfetivas(
          m.perfil.capacidades,
          m.capacidadesExtra,
          m.capacidadesRevogadas,
        );
        return {
          membroId: m.id,
          utilizadorId: m.utilizadorId,
          nome: m.utilizador.nome,
          email: m.utilizador.email,
          perfilNome: m.perfil.nome,
          estado: m.estado,
          eAdminClube:
            efetivas.has("CLUBE_UTILIZADORES") && efetivas.has("CLUBE_PERFIS"),
        };
      }),
    );
  } catch {
    return erro("Não foi possível listar os membros do clube");
  }
}

/**
 * Edita os dados básicos de uma conta (nome + email). Só admins de plataforma.
 * O email é único na plataforma: uma colisão devolve um erro tratável.
 */
export async function editarUtilizadorAdmin(
  dados: unknown,
): Promise<Resultado<void>> {
  await exigirAdminPlataforma();

  const parsed = EditarUtilizadorSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  try {
    await prisma.utilizador.update({
      where: { id: parsed.data.utilizadorId },
      data: { nome: parsed.data.nome, email: parsed.data.email },
    });

    revalidatePath(PATH);
    return ok(undefined);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return erro("Já existe uma conta com esse email");
      if (e.code === "P2025") return erro("Conta não encontrada");
    }
    return erro("Não foi possível editar a conta");
  }
}

/**
 * Suspende (INATIVO) ou reativa (ATIVO) a adesão de uma conta a um clube — não o
 * clube inteiro. Só admins de plataforma. Ao suspender, regista `dataSaida`; ao
 * reativar, limpa-a e garante a invariante "no máximo uma adesão ATIVA por
 * utilizador" (recusa se a conta já tem outra adesão ativa noutro clube).
 */
export async function alterarEstadoMembroAdmin(
  dados: unknown,
): Promise<Resultado<void>> {
  await exigirAdminPlataforma();

  const parsed = AlterarEstadoMembroSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const { membroId, estado } = parsed.data;

  const membro = await prisma.membroClube.findUnique({
    where: { id: membroId },
    select: { utilizadorId: true },
  });
  if (!membro) return erro("Membro não encontrado");

  // Reativar não pode violar a invariante de uma única adesão ativa por conta.
  if (estado === "ATIVO") {
    const outraAtiva = await prisma.membroClube.findFirst({
      where: {
        utilizadorId: membro.utilizadorId,
        estado: "ATIVO",
        NOT: { id: membroId },
      },
      select: { id: true },
    });
    if (outraAtiva) {
      return erro("A conta já tem uma adesão ativa noutro clube");
    }
  }

  try {
    await prisma.membroClube.update({
      where: { id: membroId },
      data: {
        estado,
        dataSaida: estado === "INATIVO" ? new Date() : null,
      },
    });

    revalidatePath(PATH);
    return ok(undefined);
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return erro("Membro não encontrado");
    }
    return erro("Não foi possível alterar o estado da conta");
  }
}
