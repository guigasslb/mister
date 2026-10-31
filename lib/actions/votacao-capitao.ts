"use server";

/**
 * Votação secreta do capitão de um jogo (tablet do treinador, de mão em mão).
 *
 * Segredo: a participação (quem votou) e o voto (em quem) gravam-se na MESMA
 * transação, em tabelas sem ligação entre si. Nenhuma action devolve, regista em
 * log ou permite inferir quem votou em quem; contagens só com a votação FECHADA.
 * Guardado sob `CONVOCATORIA_GERIR` (como `definirCapitao`).
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  registarVotoCapitaoSchema,
  escolherVencedorVotacaoSchema,
} from "@/lib/schemas/votacao-capitao";
import {
  apurarVotacaoCapitao,
  type ApuramentoVotacaoCapitao,
} from "@/lib/votacao-capitao";
import { definirCapitao } from "@/lib/actions/jogos";
import type { Prisma } from "@prisma/client";

const PATH = "/jogos";

/**
 * Convocado votante, com a indicação de já ter votado (nunca em quem). Todos os
 * convocados votam; só os titulares (`titularPrevisto` do plano de jogo) podem
 * ser votados (`votavel`).
 */
export type ConvocadoVotacaoCapitao = {
  atletaId: string;
  nome: string;
  jaVotou: boolean;
  votavel: boolean;
};

export type VotacaoCapitaoVista =
  | { estado: "SEM_VOTACAO"; convocados: ConvocadoVotacaoCapitao[] }
  | { estado: "ABERTA"; criadaEm: Date; convocados: ConvocadoVotacaoCapitao[] }
  | {
      estado: "FECHADA";
      criadaEm: Date;
      fechadaEm: Date | null;
      convocados: ConvocadoVotacaoCapitao[];
      /** Eleito (vencedor único ou escolhido pelo treinador no empate); null se por decidir. */
      vencedorAtletaId: string | null;
      apuramento: ApuramentoVotacaoCapitao;
    };

const ERRO_SEM_VOTACAO = "Não existe votação para este jogo.";
const ERRO_ELEITO_NAO_TITULAR =
  "O eleito já não é titular. Coloca-o nos titulares do plano de jogo ou repete a votação.";

/** O atleta é convocado titular (`titularPrevisto`) deste jogo, neste momento. */
async function ehTitular(jogoId: string, atletaId: string): Promise<boolean> {
  const n = await prisma.convocatoria.count({
    where: { jogoId, atletaId, convocado: true, titularPrevisto: true },
  });
  return n > 0;
}

/** Clube do utilizador + jogo do clube + capacidade no escalão do jogo. */
async function jogoAutorizado(
  jogoId: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return { ok: false, erro: "Não autenticado" };
  const jogo = await prisma.jogo.findFirst({
    where: { id: jogoId, escalao: { clubeId } },
    select: { escalaoId: true },
  });
  if (!jogo) return { ok: false, erro: "Jogo não encontrado" };
  const perm = await exigirCapacidade("CONVOCATORIA_GERIR", jogo.escalaoId);
  if (!perm.ok) return { ok: false, erro: perm.erro };
  return { ok: true };
}

/** Contagem agregada por atleta votado e respetivo apuramento. */
async function apurar(
  db: Prisma.TransactionClient,
  votacaoId: string,
): Promise<ApuramentoVotacaoCapitao> {
  const grupos = await db.votoCapitao.groupBy({
    by: ["votadoAtletaId"],
    where: { votacaoId },
    _count: { _all: true },
  });
  return apurarVotacaoCapitao(
    grupos.map((g) => ({ atletaId: g.votadoAtletaId, votos: g._count._all })),
  );
}

/**
 * Bloqueia (FOR UPDATE) a votação do jogo dentro da transação, serializando votos
 * e fecho concorrentes. `null` se não existir.
 */
async function bloquearVotacao(
  tx: Prisma.TransactionClient,
  jogoId: string,
): Promise<{ id: string; estado: "ABERTA" | "FECHADA" } | null> {
  const linhas = await tx.$queryRaw<{ id: string; estado: "ABERTA" | "FECHADA" }[]>`
    SELECT "id", "estado"::text AS "estado" FROM "VotacaoCapitao" WHERE "jogoId" = ${jogoId} FOR UPDATE`;
  return linhas[0] ?? null;
}

/**
 * Inicia a votação do jogo. Se já existir uma (aberta ou fechada), é apagada —
 * com participações e votos, em cascade — e criada de novo (repetir votação).
 * Só os titulares podem ser votados e ninguém vota em si próprio: exige pelo
 * menos 2 titulares (assim cada votante, titular ou não, tem ≥1 candidato).
 */
export async function iniciarVotacaoCapitao(jogoId: string): Promise<Resultado<void>> {
  const aut = await jogoAutorizado(jogoId);
  if (!aut.ok) return erro(aut.erro);

  const titulares = await prisma.convocatoria.count({
    where: { jogoId, convocado: true, titularPrevisto: true },
  });
  if (titulares < 2)
    return erro(
      "São precisos pelo menos 2 titulares definidos no plano de jogo para votar o capitão.",
    );

  await prisma.$transaction([
    prisma.votacaoCapitao.deleteMany({ where: { jogoId } }),
    prisma.votacaoCapitao.create({ data: { jogoId } }),
  ]);
  revalidatePath(`${PATH}/${jogoId}`);
  return ok(undefined);
}

/**
 * Estado da votação: convocados (ordenados por nome) com quem já votou. Com a
 * votação ABERTA não há qualquer contagem; com a FECHADA inclui o apuramento.
 */
export async function obterVotacaoCapitao(
  jogoId: string,
): Promise<Resultado<VotacaoCapitaoVista>> {
  const aut = await jogoAutorizado(jogoId);
  if (!aut.ok) return erro(aut.erro);

  const [votacao, convocatorias] = await Promise.all([
    prisma.votacaoCapitao.findUnique({
      where: { jogoId },
      select: {
        id: true,
        estado: true,
        criadaEm: true,
        fechadaEm: true,
        vencedorAtletaId: true,
        participacoes: { select: { atletaId: true } },
      },
    }),
    prisma.convocatoria.findMany({
      where: { jogoId, convocado: true },
      select: { titularPrevisto: true, atleta: { select: { id: true, nome: true } } },
      orderBy: { atleta: { nome: "asc" } },
    }),
  ]);

  const votaram = new Set(votacao?.participacoes.map((p) => p.atletaId));
  const convocados: ConvocadoVotacaoCapitao[] = convocatorias.map((c) => ({
    atletaId: c.atleta.id,
    nome: c.atleta.nome,
    jaVotou: votaram.has(c.atleta.id),
    votavel: c.titularPrevisto,
  }));

  if (!votacao) return ok({ estado: "SEM_VOTACAO", convocados });
  if (votacao.estado === "ABERTA")
    return ok({ estado: "ABERTA", criadaEm: votacao.criadaEm, convocados });
  return ok({
    estado: "FECHADA",
    criadaEm: votacao.criadaEm,
    fechadaEm: votacao.fechadaEm,
    convocados,
    vencedorAtletaId: votacao.vencedorAtletaId,
    apuramento: await apurar(prisma, votacao.id),
  });
}

/**
 * Regista um voto. Votante e votado têm de ser convocados do jogo e diferentes,
 * e o votado tem de ser titular no momento do voto; cada votante vota uma única vez e só com a votação ABERTA. Participação e voto
 * na mesma transação; não devolve nada sobre o voto.
 */
export async function registarVotoCapitao(
  jogoId: string,
  dados: unknown,
): Promise<Resultado<void>> {
  const parsed = registarVotoCapitaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const { votanteId, votadoId } = parsed.data;

  const aut = await jogoAutorizado(jogoId);
  if (!aut.ok) return erro(aut.erro);

  const convocados = await prisma.convocatoria.count({
    where: { jogoId, convocado: true, atletaId: { in: [votanteId, votadoId] } },
  });
  if (convocados !== 2)
    return erro("Votante e votado têm de estar convocados para este jogo.");
  if (!(await ehTitular(jogoId, votadoId)))
    return erro("Só é possível votar num titular do jogo.");

  const falha = await prisma.$transaction(async (tx): Promise<string | null> => {
    const votacao = await bloquearVotacao(tx, jogoId);
    if (!votacao) return ERRO_SEM_VOTACAO;
    if (votacao.estado !== "ABERTA") return "A votação está fechada.";
    const jaVotou = await tx.participacaoVotacaoCapitao.findUnique({
      where: { votacaoId_atletaId: { votacaoId: votacao.id, atletaId: votanteId } },
      select: { atletaId: true },
    });
    if (jaVotou) return "Este atleta já votou.";
    await tx.participacaoVotacaoCapitao.create({
      data: { votacaoId: votacao.id, atletaId: votanteId },
      select: { atletaId: true },
    });
    await tx.votoCapitao.create({
      data: { votacaoId: votacao.id, votadoAtletaId: votadoId },
      select: { id: true },
    });
    return null;
  });
  if (falha) return erro(falha);
  revalidatePath(`${PATH}/${jogoId}`);
  return ok(undefined);
}

/**
 * Fecha a votação e apura. Vencedor único → gravado em `vencedorAtletaId`.
 * Empate ou zero votos → sem vencedor (no empate o treinador escolhe com
 * `escolherVencedorVotacaoCapitao`).
 */
export async function fecharVotacaoCapitao(
  jogoId: string,
): Promise<Resultado<ApuramentoVotacaoCapitao>> {
  const aut = await jogoAutorizado(jogoId);
  if (!aut.ok) return erro(aut.erro);

  const r = await prisma.$transaction(
    async (tx): Promise<Resultado<ApuramentoVotacaoCapitao>> => {
      const votacao = await bloquearVotacao(tx, jogoId);
      if (!votacao) return erro(ERRO_SEM_VOTACAO);
      if (votacao.estado !== "ABERTA") return erro("A votação já está fechada.");
      const apuramento = await apurar(tx, votacao.id);
      await tx.votacaoCapitao.update({
        where: { id: votacao.id },
        data: {
          estado: "FECHADA",
          fechadaEm: new Date(),
          vencedorAtletaId:
            apuramento.tipo === "VENCEDOR" ? apuramento.vencedorAtletaId : null,
        },
      });
      return ok(apuramento);
    },
  );
  if (r.sucesso) revalidatePath(`${PATH}/${jogoId}`);
  return r;
}

/** Desempate pelo treinador: só aceita um dos atletas empatados da votação FECHADA. */
export async function escolherVencedorVotacaoCapitao(
  jogoId: string,
  dados: unknown,
): Promise<Resultado<void>> {
  const parsed = escolherVencedorVotacaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const aut = await jogoAutorizado(jogoId);
  if (!aut.ok) return erro(aut.erro);

  const votacao = await prisma.votacaoCapitao.findUnique({
    where: { jogoId },
    select: { id: true, estado: true, vencedorAtletaId: true },
  });
  if (!votacao) return erro(ERRO_SEM_VOTACAO);
  if (votacao.estado !== "FECHADA") return erro("A votação ainda está aberta.");
  if (votacao.vencedorAtletaId) return erro("A votação já tem vencedor.");

  const apuramento = await apurar(prisma, votacao.id);
  if (apuramento.tipo !== "EMPATE" || !apuramento.empatados.includes(parsed.data.atletaId))
    return erro("Só é possível escolher um dos atletas empatados.");
  if (!(await ehTitular(jogoId, parsed.data.atletaId))) return erro(ERRO_ELEITO_NAO_TITULAR);

  await prisma.votacaoCapitao.update({
    where: { id: votacao.id },
    data: { vencedorAtletaId: parsed.data.atletaId },
  });
  revalidatePath(`${PATH}/${jogoId}`);
  return ok(undefined);
}

/**
 * Define o eleito da votação FECHADA como capitão do jogo (via `definirCapitao`).
 * Recusa se o eleito entretanto deixou de ser titular.
 */
export async function aplicarCapitaoVotacao(jogoId: string): Promise<Resultado<void>> {
  const aut = await jogoAutorizado(jogoId);
  if (!aut.ok) return erro(aut.erro);

  const votacao = await prisma.votacaoCapitao.findUnique({
    where: { jogoId },
    select: { estado: true, vencedorAtletaId: true },
  });
  if (!votacao) return erro(ERRO_SEM_VOTACAO);
  if (votacao.estado !== "FECHADA" || !votacao.vencedorAtletaId)
    return erro("A votação ainda não tem eleito.");
  if (!(await ehTitular(jogoId, votacao.vencedorAtletaId)))
    return erro(ERRO_ELEITO_NAO_TITULAR);

  return definirCapitao(jogoId, votacao.vencedorAtletaId);
}
