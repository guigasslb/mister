"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { subcategoriaSchema } from "@/lib/schemas/subcategoria";
import { SUBCATEGORIAS_ARRANQUE } from "@/lib/subcategorias-arranque";
import type { CategoriaExercicioPrincipal, SubcategoriaExercicio } from "@prisma/client";

const PATH = "/definicoes/subcategorias";

export async function listarSubcategorias(
  categoria?: CategoriaExercicioPrincipal,
): Promise<Resultado<SubcategoriaExercicio[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const lista = await prisma.subcategoriaExercicio.findMany({
    where: { clubeId, ...(categoria ? { categorias: { has: categoria } } : {}) },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  return ok(lista);
}

export async function criarSubcategoria(dados: unknown): Promise<Resultado<SubcategoriaExercicio>> {
  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);

  const parsed = subcategoriaSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const sub = await prisma.subcategoriaExercicio.create({
    data: {
      nome: parsed.data.nome,
      categorias: parsed.data.categorias,
      ordem: parsed.data.ordem,
      clubeId: perm.ctx.clube.id,
      sistema: false,
    },
  });
  revalidatePath(PATH);
  return ok(sub);
}

export async function atualizarSubcategoria(
  id: string,
  dados: unknown,
): Promise<Resultado<SubcategoriaExercicio>> {
  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);

  const parsed = subcategoriaSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const existe = await prisma.subcategoriaExercicio.findFirst({
    where: { id, clubeId: perm.ctx.clube.id },
  });
  if (!existe) return erro("Subcategoria não encontrada");

  const sub = await prisma.subcategoriaExercicio.update({
    where: { id },
    data: {
      nome: parsed.data.nome,
      categorias: parsed.data.categorias,
      ordem: parsed.data.ordem,
    },
  });
  revalidatePath(PATH);
  return ok(sub);
}

export async function apagarSubcategoria(id: string): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);

  const existe = await prisma.subcategoriaExercicio.findFirst({
    where: { id, clubeId: perm.ctx.clube.id },
  });
  if (!existe) return erro("Subcategoria não encontrada");
  if (existe.sistema) return erro("Esta subcategoria de sistema não pode ser apagada.");

  const emUso = await prisma.exercicio.count({ where: { subcategoriaId: id } });
  if (emUso > 0)
    return erro(`Esta subcategoria está associada a ${emUso} exercício(s) e não pode ser apagada.`);

  await prisma.subcategoriaExercicio.delete({ where: { id } });
  revalidatePath(PATH);
  return ok(undefined);
}

export async function instalarSubcategoriasArranque(): Promise<Resultado<{ criadas: number }>> {
  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const jaTem = await prisma.subcategoriaExercicio.count({ where: { clubeId, sistema: true } });
  if (jaTem > 0) return erro("As subcategorias de arranque já foram instaladas.");

  await prisma.subcategoriaExercicio.createMany({
    data: SUBCATEGORIAS_ARRANQUE.map((s) => ({
      nome: s.nome,
      categorias: [s.categoria],
      ordem: s.ordem,
      clubeId,
      sistema: true,
    })),
  });
  revalidatePath(PATH);
  return ok({ criadas: SUBCATEGORIAS_ARRANQUE.length });
}
