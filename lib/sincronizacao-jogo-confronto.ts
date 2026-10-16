import type { CasaFora, EstadoResultado, Prisma, PrismaClient } from "@prisma/client";
import { modalidadeEfetiva } from "@/lib/modalidade-escalao";

/**
 * Sincronização bidirecional Jogo ↔ confronto do quadro (§23.6).
 *
 * Um confronto (`ResultadoCompeticao`) que envolve a equipa própria fica ligado
 * a um `Jogo` (`Jogo.resultadoCompeticaoId`, 1:1). Os campos comuns — data/hora,
 * adversário, casa/fora e resultado — são mantidos iguais nos dois lados: editar
 * na competição reflete-se em /jogos (lista, agenda, detalhe) e vice-versa.
 *
 * Módulo partilhado (fora de `"use server"`) para não expor estas funções como
 * Server Actions; o cliente Prisma é injetado (pode ser `prisma` ou um `tx`).
 */

type ClienteDb = PrismaClient | Prisma.TransactionClient;

export type ConfrontoEquipas = {
  equipaCasa: string;
  equipaFora: string;
  equipaCasaId: string | null;
  equipaForaId: string | null;
};

export type EquipaPropria = { id: string | null; nome: string };

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Lado da equipa própria no confronto (CASA | FORA), ou `null` se o confronto
 * não a envolve. Identifica pelo participante `PROPRIO` (FK) e, em alternativa,
 * pelo nome da equipa própria — o mesmo critério de `obterClassificacao`.
 */
export function ladoProprio(c: ConfrontoEquipas, propria: EquipaPropria): CasaFora | null {
  const casa =
    (propria.id !== null && c.equipaCasaId === propria.id) ||
    norm(c.equipaCasa) === norm(propria.nome);
  const fora =
    (propria.id !== null && c.equipaForaId === propria.id) ||
    norm(c.equipaFora) === norm(propria.nome);
  if (casa === fora) return null;
  return casa ? "CASA" : "FORA";
}

/** Campos do `Jogo` derivados do confronto (competição → /jogos). */
export function camposJogoDoConfronto(
  c: ConfrontoEquipas & {
    dataHora: Date;
    golosCasa: number | null;
    golosFora: number | null;
    estado: EstadoResultado;
  },
  lado: CasaFora,
): {
  data: Date;
  adversario: string;
  casaFora: CasaFora;
  golosMarcados?: number;
  golosSofridos?: number;
} {
  const base = {
    data: c.dataHora,
    adversario: lado === "CASA" ? c.equipaFora : c.equipaCasa,
    casaFora: lado,
  };
  // Só um confronto REALIZADO com placar completo define o resultado do jogo;
  // nos restantes estados o resultado do jogo não é tocado.
  if (c.estado !== "REALIZADO" || c.golosCasa === null || c.golosFora === null) return base;
  return {
    ...base,
    golosMarcados: lado === "CASA" ? c.golosCasa : c.golosFora,
    golosSofridos: lado === "CASA" ? c.golosFora : c.golosCasa,
  };
}

/** Campos do confronto derivados do `Jogo` (/jogos → competição). */
export function camposConfrontoDoJogo(
  j: { data: Date; golosMarcados: number | null; golosSofridos: number | null },
  lado: CasaFora,
): {
  dataHora: Date;
  golosCasa?: number;
  golosFora?: number;
  estado?: "REALIZADO";
  walkoverVencedor?: null;
} {
  if (j.golosMarcados === null || j.golosSofridos === null) return { dataHora: j.data };
  // Resultado completo no jogo ⇒ confronto REALIZADO com esse placar (§23.6).
  return {
    dataHora: j.data,
    golosCasa: lado === "CASA" ? j.golosMarcados : j.golosSofridos,
    golosFora: lado === "CASA" ? j.golosSofridos : j.golosMarcados,
    estado: "REALIZADO",
    walkoverVencedor: null,
  };
}

async function obterEquipaPropria(
  db: ClienteDb,
  competicaoId: string,
  nomeEscalao: string,
): Promise<EquipaPropria> {
  const p = await db.equipaCompeticao.findFirst({
    where: { competicaoId, tipo: "PROPRIO" },
    select: { id: true, nome: true },
  });
  return p ?? { id: null, nome: nomeEscalao };
}

/**
 * Competição → /jogos. Reflete o confronto no `Jogo` ligado. Se ainda não houver
 * jogo ligado e o confronto (da equipa própria) já tiver data/hora, adota um jogo
 * existente da mesma competição contra o mesmo adversário e não ligado (evita
 * duplicar jogos criados à mão em /jogos) ou cria um novo. Devolve o id do jogo
 * sincronizado, ou `null` se o confronto não envolve a equipa própria / não tem data.
 */
export async function sincronizarJogoDoConfronto(
  db: ClienteDb,
  resultadoId: string,
  criadorId: string,
): Promise<string | null> {
  const c = await db.resultadoCompeticao.findUnique({
    where: { id: resultadoId },
    select: {
      id: true,
      competicaoId: true,
      equipaCasa: true,
      equipaFora: true,
      equipaCasaId: true,
      equipaForaId: true,
      golosCasa: true,
      golosFora: true,
      estado: true,
      dataHora: true,
      jogoDetalhado: { select: { id: true } },
      competicao: {
        select: {
          escalaoId: true,
          epocaId: true,
          tipo: true,
          formatoJogo: true,
          escalao: {
            select: { nome: true, seccao: { select: { modalidade: true } } },
          },
        },
      },
    },
  });
  if (!c) return null;

  const propria = await obterEquipaPropria(db, c.competicaoId, c.competicao.escalao.nome);
  const lado = ladoProprio(c, propria);
  if (!lado || !c.dataHora) return null;

  const campos = camposJogoDoConfronto({ ...c, dataHora: c.dataHora }, lado);

  if (c.jogoDetalhado) {
    await db.jogo.update({ where: { id: c.jogoDetalhado.id }, data: campos });
    return c.jogoDetalhado.id;
  }

  const candidatos = await db.jogo.findMany({
    where: {
      competicaoId: c.competicaoId,
      resultadoCompeticaoId: null,
      adversario: { equals: campos.adversario.trim(), mode: "insensitive" },
    },
    select: { id: true, casaFora: true },
  });
  const mesmoLado = candidatos.filter((j) => j.casaFora === lado);
  const adotar =
    candidatos.length === 1 ? candidatos[0] : mesmoLado.length === 1 ? mesmoLado[0] : null;

  if (adotar) {
    await db.jogo.update({
      where: { id: adotar.id },
      data: { ...campos, resultadoCompeticaoId: c.id },
    });
    return adotar.id;
  }

  const modalidade = modalidadeEfetiva(null, c.competicao.escalao.seccao?.modalidade);
  const criado = await db.jogo.create({
    data: {
      ...campos,
      tipo: c.competicao.tipo,
      formato: c.competicao.formatoJogo ?? (modalidade === "FUTSAL" ? "FUTSAL_5" : null),
      competicaoId: c.competicaoId,
      resultadoCompeticaoId: c.id,
      escalaoId: c.competicao.escalaoId,
      epocaId: c.competicao.epocaId,
      criadorId,
    },
    select: { id: true },
  });
  return criado.id;
}

/**
 * /jogos → competição. Reflete data/hora e resultado do `Jogo` no confronto
 * ligado. Só sincroniza se o jogo continuar na mesma competição, escalão e época
 * do confronto. Devolve o `competicaoId` sincronizado (para revalidação) ou `null`.
 */
export async function sincronizarConfrontoDoJogo(
  db: ClienteDb,
  jogoId: string,
): Promise<string | null> {
  const j = await db.jogo.findUnique({
    where: { id: jogoId },
    select: {
      data: true,
      golosMarcados: true,
      golosSofridos: true,
      competicaoId: true,
      escalaoId: true,
      epocaId: true,
      resultadoCompeticao: {
        select: {
          id: true,
          competicaoId: true,
          equipaCasa: true,
          equipaFora: true,
          equipaCasaId: true,
          equipaForaId: true,
          competicao: {
            select: {
              escalaoId: true,
              epocaId: true,
              escalao: { select: { nome: true } },
            },
          },
        },
      },
    },
  });
  const c = j?.resultadoCompeticao;
  if (!j || !c) return null;
  if (
    j.competicaoId !== c.competicaoId ||
    j.escalaoId !== c.competicao.escalaoId ||
    j.epocaId !== c.competicao.epocaId
  )
    return null;

  const propria = await obterEquipaPropria(db, c.competicaoId, c.competicao.escalao.nome);
  const lado = ladoProprio(c, propria);
  if (!lado) return null;

  await db.resultadoCompeticao.update({
    where: { id: c.id },
    data: camposConfrontoDoJogo(j, lado),
  });
  return c.competicaoId;
}
