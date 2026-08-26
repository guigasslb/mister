"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerEscalao, escaloesLegiveis } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { reuniaoSchema } from "@/lib/schemas/reuniao";
import { sincronizarComCalendario } from "@/lib/actions/integracao";
import type { Prisma, Reuniao } from "@prisma/client";

const PATH = "/reunioes";

export async function listarReunioes(): Promise<Resultado<Reuniao[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  // Reuniões de clube: visíveis a todos os membros.
  // Reuniões de escalão: visíveis a quem pode ler o escalão.
  const legiveis = await escaloesLegiveis();
  const reunioes = await prisma.reuniao.findMany({
    where: {
      clubeId,
      OR: [
        { ambito: "CLUBE" },
        legiveis === "TODOS" ? { ambito: "ESCALAO" } : { escalaoId: { in: legiveis } },
      ],
    },
    orderBy: { data: "desc" },
  });
  return ok(reunioes);
}

export async function obterReuniao(id: string): Promise<Resultado<Reuniao>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const reuniao = await prisma.reuniao.findFirst({ where: { id, clubeId } });
  if (!reuniao) return erro("Reunião não encontrada");
  if (reuniao.ambito === "ESCALAO" && reuniao.escalaoId) {
    if (!(await podeLerEscalao(reuniao.escalaoId))) return erro("Sem permissão neste escalão");
  }
  return ok(reuniao);
}

export async function criarReuniao(dados: unknown): Promise<Resultado<Reuniao>> {
  const session = await auth();
  if (!session?.user?.id) return erro("Não autenticado");

  const parsed = reuniaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const escalaoId = parsed.data.ambito === "ESCALAO" ? parsed.data.escalaoId ?? undefined : undefined;
  const perm = await exigirCapacidade("REUNIOES_GERIR", escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const reuniao = await prisma.reuniao.create({
    data: {
      clubeId: perm.ctx.clube.id,
      ambito: parsed.data.ambito,
      escalaoId: escalaoId ?? null,
      titulo: parsed.data.titulo,
      data: parsed.data.data,
      participantes: parsed.data.participantes ?? null,
      ordemTrabalhos: parsed.data.ordemTrabalhos ?? null,
      ata: parsed.data.ata ?? null,
      afixada: parsed.data.afixada,
      criadorId: session.user.id,
    },
  });

  // F8 (§3.12): reuniões futuras entram no Google Calendar do treinador na
  // criação (se ainda sem googleEventId). Fire-and-forget: não bloqueia nem
  // faz falhar a criação da reunião. Reuniões passadas não são sincronizadas.
  if (!reuniao.googleEventId && reuniao.data.getTime() >= Date.now()) {
    await sincronizarComCalendario("REUNIAO", reuniao.id);
  }

  revalidatePath(PATH);
  return ok(reuniao);
}

export async function atualizarReuniao(id: string, dados: unknown): Promise<Resultado<Reuniao>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = reuniaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const existe = await prisma.reuniao.findFirst({ where: { id, clubeId } });
  if (!existe) return erro("Reunião não encontrada");

  const escalaoId = parsed.data.ambito === "ESCALAO" ? parsed.data.escalaoId ?? undefined : undefined;
  const perm = await exigirCapacidade("REUNIOES_GERIR", escalaoId ?? existe.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  const reuniao = await prisma.reuniao.update({
    where: { id },
    data: {
      ambito: parsed.data.ambito,
      escalaoId: escalaoId ?? null,
      titulo: parsed.data.titulo,
      data: parsed.data.data,
      participantes: parsed.data.participantes ?? null,
      ordemTrabalhos: parsed.data.ordemTrabalhos ?? null,
      ata: parsed.data.ata ?? null,
      afixada: parsed.data.afixada,
    },
  });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return ok(reuniao);
}

export async function apagarReuniao(id: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const existe = await prisma.reuniao.findFirst({ where: { id, clubeId } });
  if (!existe) return erro("Reunião não encontrada");

  const perm = await exigirCapacidade("REUNIOES_GERIR", existe.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  await prisma.reuniao.delete({ where: { id } });
  revalidatePath(PATH);
  return ok(undefined);
}

/**
 * Alterna (toggle) a afixação de uma reunião no Dashboard. Uma reunião afixada
 * aparece no painel de arranque independentemente da data (ver
 * `obterReunioesParaDashboard`). Requer capacidade de gestão de reuniões.
 */
export async function alternarAfixadaReuniao(reuniaoId: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const existe = await prisma.reuniao.findFirst({ where: { id: reuniaoId, clubeId } });
  if (!existe) return erro("Reunião não encontrada");

  const perm = await exigirCapacidade("REUNIOES_GERIR", existe.escalaoId ?? undefined);
  if (!perm.ok) return erro(perm.erro);

  await prisma.reuniao.update({
    where: { id: reuniaoId },
    data: { afixada: !existe.afixada },
  });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${reuniaoId}`);
  revalidatePath("/dashboard");
  return ok(undefined);
}

/**
 * Reuniões a mostrar no Dashboard/Início, separadas em dois grupos:
 *
 * - `proximas`: reuniões futuras (data >= hoje), afixadas ou não, ordenadas por
 *   data ascendente (a mais próxima primeiro).
 * - `anteriores`: reuniões afixadas (`afixada = true`) já passadas (data < hoje),
 *   ordenadas por data descendente (a mais recente primeiro). Reuniões passadas
 *   NÃO afixadas nunca aparecem no dashboard.
 *
 * Filtra sempre pelo clube do utilizador autenticado e respeita a legibilidade
 * por escalão (igual a `listarReunioes`). Cada grupo limita a 5.
 */
export async function obterReunioesParaDashboard(): Promise<
  Resultado<{ proximas: Reuniao[]; anteriores: Reuniao[] }>
> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  // Início do dia de hoje (hora local) — "futuras" inclui as de hoje.
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);

  const legiveis = await escaloesLegiveis();
  // Filtro de âmbito partilhado pelos dois grupos (evita duplicação e assegura
  // simetria entre as duas consultas): reuniões de clube + escalões legíveis.
  const filtroAmbito: Prisma.ReuniaoWhereInput = {
    OR: [
      { ambito: "CLUBE" },
      legiveis === "TODOS" ? { ambito: "ESCALAO" } : { escalaoId: { in: legiveis } },
    ],
  };

  const [proximas, anteriores] = await Promise.all([
    // Próximas: futuras (data >= hoje), afixadas ou não — ordem ascendente.
    prisma.reuniao.findMany({
      where: { clubeId, AND: [filtroAmbito, { data: { gte: inicioHoje } }] },
      orderBy: { data: "asc" },
      take: 5,
    }),
    // Anteriores: apenas afixadas já passadas (data < hoje) — ordem descendente.
    prisma.reuniao.findMany({
      where: { clubeId, AND: [filtroAmbito, { afixada: true }, { data: { lt: inicioHoje } }] },
      orderBy: { data: "desc" },
      take: 5,
    }),
  ]);

  return ok({ proximas, anteriores });
}
