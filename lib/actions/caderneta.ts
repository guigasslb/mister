"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidadeEmAlgumEscalao, podeLerAlgumEscalao } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { atualizarProgressoSchema } from "@/lib/schemas/caderneta";
import type { EstadoHabilidade, Habilidade, ProgressoHabilidade } from "@prisma/client";

export interface HabilidadeComProgresso extends Habilidade {
  estado: EstadoHabilidade;
  dataDesbloqueio: Date | null;
  notas: string | null;
}

export async function obterCadernetaAtleta(
  atletaId: string,
  // M5 (§10.1/§12.7): época em contexto. Quando indicada, a caderneta é lida
  // dessa época (validada contra o clube do utilizador) — usado pela vista de
  // evolução multi-época. Omitida = época ativa (comportamento pré-existente).
  epocaId?: string,
): Promise<Resultado<HabilidadeComProgresso[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const epoca = epocaId
    ? await prisma.epoca.findFirst({ where: { id: epocaId, clubeId }, select: { id: true } })
    : await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  // F1: permissão pelas participações ativas do atleta na época.
  const atleta = await prisma.atleta.findFirst({
    where: { id: atletaId, clubeId },
    select: {
      id: true,
      participacoes: {
        where: { epocaId: epoca.id, estado: "ATIVO" },
        select: { escalaoId: true },
      },
    },
  });
  if (!atleta) return erro("Atleta não encontrado");
  if (!(await podeLerAlgumEscalao(atleta.participacoes.map((p) => p.escalaoId))))
    return erro("Sem permissão neste escalão");

  const [habilidades, progressos] = await Promise.all([
    prisma.habilidade.findMany({
      where: { clubeId },
      orderBy: [{ nivel: "asc" }, { ordem: "asc" }],
    }),
    prisma.progressoHabilidade.findMany({
      where: { atletaId, epocaId: epoca.id },
    }),
  ]);

  const porHabilidade = new Map<string, ProgressoHabilidade>(
    progressos.map((p) => [p.habilidadeId, p]),
  );

  const resultado: HabilidadeComProgresso[] = habilidades.map((h) => {
    const p = porHabilidade.get(h.id);
    return {
      ...h,
      estado: p?.estado ?? "NAO_INICIADO",
      dataDesbloqueio: p?.dataDesbloqueio ?? null,
      notas: p?.notas ?? null,
    };
  });

  return ok(resultado);
}

export async function atualizarProgresso(
  atletaId: string,
  habilidadeId: string,
  estado: EstadoHabilidade,
  notas?: string,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = atualizarProgressoSchema.safeParse({ atletaId, habilidadeId, estado, notas });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  const [atleta, habilidade] = await Promise.all([
    prisma.atleta.findFirst({
      where: { id: atletaId, clubeId },
      select: {
        id: true,
        participacoes: {
          where: { epocaId: epoca.id, estado: "ATIVO" },
          select: { escalaoId: true },
        },
      },
    }),
    prisma.habilidade.findFirst({ where: { id: habilidadeId, clubeId }, select: { id: true } }),
  ]);
  if (!atleta) return erro("Atleta não encontrado");
  if (!habilidade) return erro("Habilidade não encontrada");

  const perm = await exigirCapacidadeEmAlgumEscalao(
    "CADERNETA_GERIR",
    atleta.participacoes.map((p) => p.escalaoId),
  );
  if (!perm.ok) return erro(perm.erro);

  // DESBLOQUEADO regista data; voltar atrás limpa (secção 12.7)
  const dataDesbloqueio = estado === "DESBLOQUEADO" ? new Date() : null;

  await prisma.progressoHabilidade.upsert({
    where: {
      atletaId_habilidadeId_epocaId: { atletaId, habilidadeId, epocaId: epoca.id },
    },
    create: {
      atletaId,
      habilidadeId,
      epocaId: epoca.id,
      estado,
      dataDesbloqueio,
      notas: notas ?? null,
    },
    update: { estado, dataDesbloqueio, notas: notas ?? null },
  });
  revalidatePath(`/plantel/${atletaId}`);
  return ok(undefined);
}
