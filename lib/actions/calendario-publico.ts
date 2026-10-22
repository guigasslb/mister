"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirCapacidade } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  linkCalendarioPublicoSchema,
  mostrarConvocadosCalendarioSchema,
} from "@/lib/schemas/calendario-publico";
import { gerarTokenCalendario } from "@/lib/calendario-publico";

// Link público só-de-leitura do calendário de jogos do escalão (bíblia §8.11.1).
// Gestão sob `JOGOS_GERIR` no âmbito do escalão; o escalão tem sempre de ser do
// clube do utilizador (filtro explícito em todas as queries).

const PATH = "/jogos";

/** Token atual do link do escalão (`null` = sem link ativo) e o opt-in dos convocados. */
export async function obterLinkCalendarioPublico(
  dados: unknown,
): Promise<Resultado<{ token: string | null; mostrarConvocados: boolean }>> {
  const parsed = linkCalendarioPublicoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("JOGOS_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const escalao = await prisma.escalao.findFirst({
    where: { id: parsed.data.escalaoId, clubeId: perm.ctx.clube.id },
    select: { calendarioPublicoToken: true, calendarioPublicoMostrarConvocados: true },
  });
  if (!escalao) return erro("Escalão não encontrado");
  return ok({
    token: escalao.calendarioPublicoToken,
    mostrarConvocados: escalao.calendarioPublicoMostrarConvocados,
  });
}

/** Gera (ou regenera — invalida o link anterior) o link público do escalão. */
export async function gerarLinkCalendarioPublico(
  dados: unknown,
): Promise<Resultado<{ token: string }>> {
  const parsed = linkCalendarioPublicoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("JOGOS_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const token = gerarTokenCalendario();
  const { count } = await prisma.escalao.updateMany({
    where: { id: parsed.data.escalaoId, clubeId: perm.ctx.clube.id },
    data: { calendarioPublicoToken: token },
  });
  if (count === 0) return erro("Escalão não encontrado");

  revalidatePath(PATH);
  return ok({ token });
}

/** Revoga o link público do escalão (o URL anterior deixa de existir). */
export async function revogarLinkCalendarioPublico(
  dados: unknown,
): Promise<Resultado<void>> {
  const parsed = linkCalendarioPublicoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("JOGOS_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const { count } = await prisma.escalao.updateMany({
    where: { id: parsed.data.escalaoId, clubeId: perm.ctx.clube.id },
    data: { calendarioPublicoToken: null },
  });
  if (count === 0) return erro("Escalão não encontrado");

  revalidatePath(PATH);
  return ok(undefined);
}

/**
 * Liga/desliga a lista de convocados no calendário público do escalão
 * (opt-in, desligado por defeito — §8.11.1). Não altera o token.
 */
export async function definirMostrarConvocadosCalendario(
  dados: unknown,
): Promise<Resultado<{ mostrarConvocados: boolean }>> {
  const parsed = mostrarConvocadosCalendarioSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("JOGOS_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const { count } = await prisma.escalao.updateMany({
    where: { id: parsed.data.escalaoId, clubeId: perm.ctx.clube.id },
    data: { calendarioPublicoMostrarConvocados: parsed.data.ativo },
  });
  if (count === 0) return erro("Escalão não encontrado");

  revalidatePath(PATH);
  return ok({ mostrarConvocados: parsed.data.ativo });
}
