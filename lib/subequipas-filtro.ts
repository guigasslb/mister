import type { Prisma, PrismaClient } from "@prisma/client";
import { ORDEM_EQUIPAS_PROPRIAS } from "@/lib/subequipas";

/**
 * Filtro «Equipa» dos analíticos/relatórios (§23.11.3 regra 10), fora de
 * `"use server"` e com o cliente Prisma injetado. Restringe aos jogos da subequipa
 * indicada; quando ela é a PRIMEIRA equipa própria da competição (a implícita —
 * `ORDEM_EQUIPAS_PROPRIAS`, simétrico à classificação), inclui também os jogos
 * dessa competição sem subequipa (`equipaCompeticaoId = null`). Com
 * `competicaoId` indicado, a subequipa tem de ser dessa competição. Subequipa
 * inexistente no clube (ou de outra competição) ⇒ filtro que não devolve jogos
 * (combinado com o filtro de competição do chamador).
 */
export async function filtroJogosDaSubequipa(
  db: PrismaClient | Prisma.TransactionClient,
  clubeId: string,
  equipaCompeticaoId: string,
  competicaoId?: string,
): Promise<Prisma.JogoWhereInput> {
  const equipa = await db.equipaCompeticao.findFirst({
    where: {
      id: equipaCompeticaoId,
      tipo: "PROPRIO",
      competicao: { clubeId },
      ...(competicaoId ? { competicaoId } : {}),
    },
    select: {
      competicaoId: true,
      competicao: {
        select: {
          equipas: {
            where: { tipo: "PROPRIO" },
            select: { id: true },
            orderBy: ORDEM_EQUIPAS_PROPRIAS,
            take: 1,
          },
        },
      },
    },
  });
  if (equipa?.competicao.equipas[0]?.id === equipaCompeticaoId)
    return {
      competicaoId: equipa.competicaoId,
      OR: [{ equipaCompeticaoId }, { equipaCompeticaoId: null }],
    };
  return { equipaCompeticaoId };
}
