"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerEscalao } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { metricaSchema, guardarMetricasSessaoSchema } from "@/lib/schemas/metrica";
import type { MetricaConfig } from "@prisma/client";

const PATH = "/definicoes/metricas";

/**
 * Lista as métricas do clube. `contexto` filtra por âmbito de registo (§8.20):
 * "JOGO" devolve métricas de jogo + ambos; "TREINO" devolve métricas de treino
 * + ambos; omisso devolve todas.
 */
export async function listarMetricas(
  apenasAtivas = false,
  contexto?: "JOGO" | "TREINO",
): Promise<Resultado<MetricaConfig[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const metricas = await prisma.metricaConfig.findMany({
    where: {
      clubeId,
      ...(apenasAtivas ? { ativa: true } : {}),
      ...(contexto ? { contexto: { in: [contexto, "AMBOS"] } } : {}),
    },
    orderBy: { ordem: "asc" },
  });
  return ok(metricas);
}

export async function criarMetrica(dados: unknown): Promise<Resultado<MetricaConfig>> {
  const perm = await exigirCapacidade("CATALOGO_METRICAS");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const parsed = metricaSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const ultimo = await prisma.metricaConfig.findFirst({
    where: { clubeId },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  const ordem = (ultimo?.ordem ?? -1) + 1;

  const metrica = await prisma.metricaConfig.create({
    data: { ...parsed.data, ordem, clubeId },
  });
  revalidatePath(PATH);
  return ok(metrica);
}

/**
 * Edita uma métrica existente do clube. Permite alterar `nome`, `tipo` e
 * `contexto` (§8.4). O `id`, a `ordem` e o estado `ativa` mantêm-se. Reusa
 * `metricaSchema` (mesma validação da criação).
 */
export async function editarMetrica(
  id: string,
  dados: unknown,
): Promise<Resultado<MetricaConfig>> {
  const perm = await exigirCapacidade("CATALOGO_METRICAS");
  if (!perm.ok) return erro(perm.erro);

  const existe = await prisma.metricaConfig.findFirst({
    where: { id, clubeId: perm.ctx.clube.id },
    select: { id: true },
  });
  if (!existe) return erro("Métrica não encontrada");

  const parsed = metricaSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const metrica = await prisma.metricaConfig.update({
    where: { id },
    data: {
      nome: parsed.data.nome,
      tipo: parsed.data.tipo,
      contexto: parsed.data.contexto,
      aplicaSoGuardaRedes: parsed.data.aplicaSoGuardaRedes,
    },
  });
  revalidatePath(PATH);
  return ok(metrica);
}

/**
 * Elimina uma métrica do clube. Se existirem valores históricos associados
 * (jogo — `ValorMetrica` — ou treino — `ValorMetricaSessao`), a eliminação é
 * recusada para preservar o histórico (§9: «Nunca apagar ValorMetrica»); nesse
 * caso o utilizador deve desativar a métrica em vez de a apagar.
 */
export async function eliminarMetrica(id: string): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("CATALOGO_METRICAS");
  if (!perm.ok) return erro(perm.erro);

  const existe = await prisma.metricaConfig.findFirst({
    where: { id, clubeId: perm.ctx.clube.id },
    select: { id: true },
  });
  if (!existe) return erro("Métrica não encontrada");

  const [emJogos, emTreinos] = await Promise.all([
    prisma.valorMetrica.count({ where: { metricaId: id } }),
    prisma.valorMetricaSessao.count({ where: { metricaId: id } }),
  ]);
  if (emJogos + emTreinos > 0) {
    return erro("Métrica em uso — desativa em vez de apagar.");
  }

  await prisma.metricaConfig.delete({ where: { id } });
  revalidatePath(PATH);
  return ok(undefined);
}

export async function alternarMetrica(id: string, ativa: boolean): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("CATALOGO_METRICAS");
  if (!perm.ok) return erro(perm.erro);

  const existe = await prisma.metricaConfig.findFirst({ where: { id, clubeId: perm.ctx.clube.id } });
  if (!existe) return erro("Métrica não encontrada");

  await prisma.metricaConfig.update({ where: { id }, data: { ativa } });
  revalidatePath(PATH);
  return ok(undefined);
}

export async function moverMetrica(
  id: string,
  direcao: "subir" | "descer",
): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("CATALOGO_METRICAS");
  if (!perm.ok) return erro(perm.erro);

  const todas = await prisma.metricaConfig.findMany({
    where: { clubeId: perm.ctx.clube.id },
    orderBy: { ordem: "asc" },
  });
  const idx = todas.findIndex((m) => m.id === id);
  if (idx === -1) return erro("Métrica não encontrada");

  const idxAdj = direcao === "subir" ? idx - 1 : idx + 1;
  if (idxAdj < 0 || idxAdj >= todas.length) return ok(undefined);

  await prisma.$transaction([
    prisma.metricaConfig.update({ where: { id: todas[idx].id }, data: { ordem: todas[idxAdj].ordem } }),
    prisma.metricaConfig.update({ where: { id: todas[idxAdj].id }, data: { ordem: todas[idx].ordem } }),
  ]);
  revalidatePath(PATH);
  return ok(undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// Métricas de sessão de treino (§8.20)
// ─────────────────────────────────────────────────────────────────────────────

/** Métrica de treino ativa + os valores já registados numa sessão. */
export interface MetricasSessao {
  metricas: MetricaConfig[];
  /** valores[atletaId][metricaId] = valor. */
  valores: Record<string, Record<string, number>>;
}

/**
 * Métricas de treino ativas (contexto TREINO/AMBOS) do clube e os valores já
 * registados na sessão indicada. Exige leitura do escalão da sessão (§8.20).
 */
export async function listarMetricasSessao(
  sessaoId: string,
): Promise<Resultado<MetricasSessao>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({
    where: { id: sessaoId, escalao: { clubeId } },
    select: { id: true, escalaoId: true },
  });
  if (!sessao) return erro("Sessão não encontrada");
  if (!(await podeLerEscalao(sessao.escalaoId))) return erro("Sem permissão neste escalão");

  const [metricas, valores] = await Promise.all([
    // Devolve o MetricaConfig completo — inclui `aplicaSoGuardaRedes` (§8.24.3),
    // que a grelha da sessão usa para desativar ("—") a coluna nos atletas não-GR.
    prisma.metricaConfig.findMany({
      where: { clubeId, ativa: true, contexto: { in: ["TREINO", "AMBOS"] } },
      orderBy: { ordem: "asc" },
    }),
    prisma.valorMetricaSessao.findMany({
      where: { sessaoId: sessao.id },
      select: { atletaId: true, metricaId: true, valor: true },
    }),
  ]);

  const mapa: Record<string, Record<string, number>> = {};
  for (const v of valores) {
    (mapa[v.atletaId] ??= {})[v.metricaId] = v.valor;
  }

  return ok({ metricas, valores: mapa });
}

/**
 * Grava (upsert) os valores de métricas de treino de uma sessão, por atleta.
 * Só grava valores de métricas de treino ativas do clube; um valor `null` (ou
 * ausente) remove o registo. Exige TREINOS_GERIR no escalão da sessão (§8.20).
 */
export async function guardarMetricasSessao(
  sessaoId: string,
  dados: unknown,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({
    where: { id: sessaoId, escalao: { clubeId } },
    select: { id: true, escalaoId: true, fechado: true },
  });
  if (!sessao) return erro("Sessão não encontrada");
  if (sessao.fechado) return erro("Sessão fechada");

  const perm = await exigirCapacidade("TREINOS_GERIR", sessao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const parsed = guardarMetricasSessaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Só métricas de treino ativas do clube são aceites.
  const metricasValidas = await prisma.metricaConfig.findMany({
    where: { clubeId, ativa: true, contexto: { in: ["TREINO", "AMBOS"] } },
    select: { id: true, aplicaSoGuardaRedes: true },
  });
  const idsValidos = new Set(metricasValidas.map((m) => m.id));
  // §8.24.3 (RN-GR-2): métricas que só se aplicam a guarda-redes.
  const metricasSoGR = new Set(
    metricasValidas.filter((m) => m.aplicaSoGuardaRedes).map((m) => m.id),
  );

  // Só atletas do clube (com as posições para validar as métricas de GR).
  const idsAtletas = parsed.data.map((d) => d.atletaId);
  const atletas = await prisma.atleta.findMany({
    where: { id: { in: idsAtletas }, clubeId },
    select: { id: true, posicoes: true },
  });
  const idsAtletasValidos = new Set(atletas.map((a) => a.id));
  const atletaEGR = new Map(
    atletas.map((a) => [a.id, a.posicoes.includes("GUARDA_REDES")]),
  );

  const linhasValidas = parsed.data.filter((l) => idsAtletasValidos.has(l.atletaId));

  // §8.24.3 (RN-GR-2): rejeita (não confia na UI) valores de métricas
  // `aplicaSoGuardaRedes=true` para atletas que não são guarda-redes.
  for (const linha of linhasValidas) {
    if (atletaEGR.get(linha.atletaId)) continue;
    const invalida = linha.valores.find(
      (v) => idsValidos.has(v.metricaId) && metricasSoGR.has(v.metricaId),
    );
    if (invalida) {
      return erro("Métrica de guarda-redes não aplicável a este atleta.", {
        [linha.atletaId]: "Métrica de guarda-redes não aplicável a este atleta.",
      });
    }
  }
  const atletasSubmetidos = linhasValidas.map((l) => l.atletaId);

  const novos = linhasValidas.flatMap((linha) =>
    linha.valores
      .filter((v) => idsValidos.has(v.metricaId))
      .map((v) => ({
        metricaId: v.metricaId,
        sessaoId: sessao.id,
        atletaId: linha.atletaId,
        valor: v.valor,
      })),
  );

  // Delete-then-create pelos atletas submetidos: valores omitidos são removidos
  // (o treinador limpou o campo). Só toca nos atletas enviados nesta gravação.
  await prisma.$transaction([
    prisma.valorMetricaSessao.deleteMany({
      where: { sessaoId: sessao.id, atletaId: { in: atletasSubmetidos } },
    }),
    ...(novos.length > 0
      ? [prisma.valorMetricaSessao.createMany({ data: novos })]
      : []),
  ]);

  revalidatePath("/treinos");
  revalidatePath(`/treinos/${sessao.id}`);
  return ok(undefined);
}
