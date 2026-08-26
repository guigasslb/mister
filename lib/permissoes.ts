import { cache } from "react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  CAPACIDADES_POR_ESCALAO,
  capacidadesEfetivas,
  type Capacidade,
} from "@/lib/permissoes-catalogo";
import type { Clube, Perfil, Utilizador } from "@prisma/client";

export type UtilizadorSemHash = Omit<Utilizador, "passwordHash">;

// `capacidadesEfetivas` (secção 6.4) vive no módulo PURO `permissoes-catalogo`
// para poder ser partilhada com o cliente; é reexportada aqui porque este é o
// ponto de entrada habitual das permissões no servidor.
export { capacidadesEfetivas };

export interface ContextoMembro {
  utilizadorId: string;
  membroId: string;
  clube: Clube;
  perfil: Perfil;
  capacidades: Capacidade[];
  // 🔁 v7 (§6.3): âmbito SECCAO para o Coordenador de Secção.
  ambito: "TODO_CLUBE" | "SECCAO" | "PROPRIOS_ESCALOES";
  escaloesAtribuidos: string[];
  // 🔁 v7 (§6.9): secções coordenadas por este membro (âmbito SECCAO).
  seccoesCoordenadas: string[];
}

/** Utilizador autenticado (sem hash). Null se não houver sessão. */
export const obterUtilizadorAtual = cache(async (): Promise<UtilizadorSemHash | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const u = await prisma.utilizador.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      isAdmin: true,
      criadoEm: true,
      atualizadoEm: true,
    },
  });
  return u;
});

/**
 * Contexto do membro na adesão de clube ATIVA (secção 5.4).
 * Null se não autenticado ou sem clube (modo individual).
 */
export const obterMembroAtual = cache(async (): Promise<ContextoMembro | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const membro = await prisma.membroClube.findFirst({
    where: { utilizadorId: session.user.id, estado: "ATIVO" },
    include: {
      clube: true,
      perfil: true,
      atribuicoes: { select: { escalaoId: true } },
      // 🔁 v7 (§6.9): secções coordenadas (âmbito SECCAO).
      seccoes: { where: { papel: "COORDENADOR" }, select: { seccaoId: true } },
    },
  });
  if (!membro) return null;

  return {
    utilizadorId: membro.utilizadorId,
    membroId: membro.id,
    clube: membro.clube,
    perfil: membro.perfil,
    capacidades: [
      ...capacidadesEfetivas(
        membro.perfil.capacidades,
        membro.capacidadesExtra,
        membro.capacidadesRevogadas,
      ),
    ],
    ambito: membro.perfil.ambito,
    escaloesAtribuidos: membro.atribuicoes.map((a) => a.escalaoId),
    seccoesCoordenadas: membro.seccoes.map((s) => s.seccaoId),
  };
});

/** Clube ativo do utilizador (ou null no modo individual). */
export const obterClubeAtivo = cache(async (): Promise<Clube | null> => {
  const ctx = await obterMembroAtual();
  return ctx?.clube ?? null;
});

export type ResultadoPermissao =
  | { ok: true; ctx: ContextoMembro }
  | { ok: false; erro: string };

/**
 * Capacidades cujo alcance é limitado pelo âmbito (escalão/secção): dados de
 * equipa (§6.3) + a gestão de escalões da secção (`SECCAO_ESCALOES_GERIR`, §6.9).
 * As capacidades de estrutura (`CLUBE_*`, `CATALOGO_*`) são sempre de nível clube
 * e não são restringidas por escalão/secção.
 */
const CAPACIDADES_LIMITADAS_POR_AMBITO = new Set<Capacidade>([
  ...CAPACIDADES_POR_ESCALAO,
  "SECCAO_ESCALOES_GERIR",
]);

/**
 * Verdadeiro se PELO MENOS UM dos escalões dados pertence a uma secção coordenada
 * pelo membro (âmbito SECCAO — §6.7/§6.9). Lista vazia ou sem secções → false.
 */
async function algumEscalaoNaSeccaoCoordenada(
  escalaoIds: string[],
  ctx: ContextoMembro,
): Promise<boolean> {
  const ids = [...new Set(escalaoIds)];
  if (ids.length === 0 || ctx.seccoesCoordenadas.length === 0) return false;

  const escalao = await prisma.escalao.findFirst({
    where: {
      id: { in: ids },
      clubeId: ctx.clube.id,
      seccaoId: { in: ctx.seccoesCoordenadas },
    },
    select: { id: true },
  });
  return escalao !== null;
}

/**
 * Verifica autenticação → adesão ativa → capacidade → âmbito sobre o escalão (secção 6.7).
 * Usar no início de cada Server Action de escrita.
 */
export async function exigirCapacidade(
  cap: Capacidade,
  escalaoId?: string,
): Promise<ResultadoPermissao> {
  const ctx = await obterMembroAtual();
  if (!ctx) return { ok: false, erro: "Sem acesso a este clube" };

  if (!ctx.capacidades.includes(cap)) {
    return { ok: false, erro: "Sem permissão" };
  }

  if (CAPACIDADES_LIMITADAS_POR_AMBITO.has(cap) && escalaoId) {
    if (ctx.ambito === "PROPRIOS_ESCALOES") {
      if (!ctx.escaloesAtribuidos.includes(escalaoId)) {
        return { ok: false, erro: "Sem permissão neste escalão" };
      }
    } else if (ctx.ambito === "SECCAO") {
      if (!(await algumEscalaoNaSeccaoCoordenada([escalaoId], ctx))) {
        return { ok: false, erro: "Sem permissão nesta secção" };
      }
    }
    // TODO_CLUBE → permitido em qualquer escalão.
  }

  return { ok: true, ctx };
}

/**
 * Pode ler os dados de um escalão? Verdadeiro se tem capacidade/âmbito para o gerir,
 * OU se o escalão está marcado como visível a outros treinadores (secção 6.4).
 */
export async function podeLerEscalao(escalaoId: string): Promise<boolean> {
  const ctx = await obterMembroAtual();
  if (!ctx) return false;

  if (ctx.ambito === "TODO_CLUBE") return true;
  if (ctx.escaloesAtribuidos.includes(escalaoId)) return true;
  // 🔁 v7 (§6.5/§6.9): o Coordenador lê todos os escalões da sua secção.
  if (ctx.ambito === "SECCAO" && (await algumEscalaoNaSeccaoCoordenada([escalaoId], ctx)))
    return true;

  const escalao = await prisma.escalao.findFirst({
    where: { id: escalaoId, clubeId: ctx.clube.id },
    select: { visivelOutrosTreinadores: true },
  });
  return escalao?.visivelOutrosTreinadores ?? false;
}

/**
 * Pode ler PELO MENOS UM dos escalões dados (F1 — participações N-N).
 * Um atleta com participações em vários escalões é legível se o membro
 * puder ler qualquer um deles (secção 8.5).
 * Devolve false se a lista estiver vazia (atleta sem participações).
 */
export async function podeLerAlgumEscalao(escalaoIds: string[]): Promise<boolean> {
  const ids = [...new Set(escalaoIds)];
  if (ids.length === 0) return false;

  const ctx = await obterMembroAtual();
  if (!ctx) return false;
  if (ctx.ambito === "TODO_CLUBE") return true;
  if (ids.some((id) => ctx.escaloesAtribuidos.includes(id))) return true;
  // 🔁 v7 (§6.5/§6.9): o Coordenador lê todos os escalões da sua secção.
  if (ctx.ambito === "SECCAO" && (await algumEscalaoNaSeccaoCoordenada(ids, ctx)))
    return true;

  const visivel = await prisma.escalao.findFirst({
    where: {
      id: { in: ids },
      clubeId: ctx.clube.id,
      visivelOutrosTreinadores: true,
    },
    select: { id: true },
  });
  return visivel !== null;
}

/**
 * Como exigirCapacidade, mas basta ter o âmbito sobre PELO MENOS UM dos escalões
 * dados (F1 — o atleta pode participar em vários escalões).
 * Mantém a convenção Resultado (não lança) para uso direto em Server Actions.
 */
export async function exigirCapacidadeEmAlgumEscalao(
  cap: Capacidade,
  escalaoIds: string[],
): Promise<ResultadoPermissao> {
  const ctx = await obterMembroAtual();
  if (!ctx) return { ok: false, erro: "Sem acesso a este clube" };

  if (!ctx.capacidades.includes(cap)) {
    return { ok: false, erro: "Sem permissão" };
  }

  if (CAPACIDADES_LIMITADAS_POR_AMBITO.has(cap)) {
    const ids = [...new Set(escalaoIds)];
    if (ctx.ambito === "PROPRIOS_ESCALOES") {
      if (!ids.some((id) => ctx.escaloesAtribuidos.includes(id))) {
        return { ok: false, erro: "Sem permissão neste escalão" };
      }
    } else if (ctx.ambito === "SECCAO") {
      if (!(await algumEscalaoNaSeccaoCoordenada(ids, ctx))) {
        return { ok: false, erro: "Sem permissão nesta secção" };
      }
    }
    // TODO_CLUBE → permitido em qualquer escalão.
  }

  return { ok: true, ctx };
}

/**
 * Escalão "principal" do utilizador autenticado (para seleção por defeito de tabs
 * por escalão — treinos, plantel, analíticos). A fonte de verdade é a atribuição
 * membro↔escalão (`AtribuicaoEscalao`, via `escaloesAtribuidos`).
 *
 * Regras:
 *  - null se não autenticado / sem adesão ativa (modo individual sem clube).
 *  - null se o membro não tem nenhum escalão atribuído — caso típico de perfis de
 *    âmbito TODO_CLUBE (admin de clube, presidente) ou SECCAO (coordenador), que
 *    gerem por âmbito e não por atribuição direta. Nesses casos a UI deve usar o
 *    seu próprio default (ex.: primeira tab).
 *  - Com múltiplos escalões atribuídos, o "principal" é o de menor `ordem`
 *    (mesma ordenação usada em todo o lado; desempate por `nome` e `id` para
 *    determinismo). Filtra sempre pelo clube da adesão ativa.
 */
export const obterEscalaoDoUtilizador = cache(async (): Promise<string | null> => {
  const ctx = await obterMembroAtual();
  if (!ctx) return null;
  if (ctx.escaloesAtribuidos.length === 0) return null;

  const principal = await prisma.escalao.findFirst({
    where: { id: { in: ctx.escaloesAtribuidos }, clubeId: ctx.clube.id },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  return principal?.id ?? null;
});

/**
 * IDs dos escalões que o membro atual pode LER.
 * Devolve "TODOS" quando o âmbito é todo o clube (sem restrição).
 * Devolve [] se não houver membro ativo.
 */
export const escaloesLegiveis = cache(async (): Promise<string[] | "TODOS"> => {
  const ctx = await obterMembroAtual();
  if (!ctx) return [];
  if (ctx.ambito === "TODO_CLUBE") return "TODOS";

  const visiveis = await prisma.escalao.findMany({
    where: { clubeId: ctx.clube.id, visivelOutrosTreinadores: true },
    select: { id: true },
  });

  // 🔁 v7 (§6.5/§6.9): o Coordenador lê todos os escalões da(s) sua(s) secção(ões).
  const daSeccao =
    ctx.ambito === "SECCAO" && ctx.seccoesCoordenadas.length > 0
      ? await prisma.escalao.findMany({
          where: { clubeId: ctx.clube.id, seccaoId: { in: ctx.seccoesCoordenadas } },
          select: { id: true },
        })
      : [];

  return [
    ...new Set([
      ...ctx.escaloesAtribuidos,
      ...visiveis.map((v) => v.id),
      ...daSeccao.map((v) => v.id),
    ]),
  ];
});
