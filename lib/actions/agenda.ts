"use server";

import { prisma } from "@/lib/db";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import {
  podeLerEscalao,
  escaloesLegiveis,
  obterMembroAtual,
} from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  detetarConflitos,
  type ConflitoAgenda,
} from "@/lib/utils/agenda-conflitos";
import {
  verificarConflitoSchema,
  type VerificarConflitoInput,
} from "@/lib/schemas/agenda";
import { treinoConcluido } from "@/lib/semana";
import type { Prisma, Epoca, TipoSessao, TipoJogo, CasaFora } from "@prisma/client";

/**
 * Vista agregada da atividade de TODOS os escalões do clube (P2.2 — §8.x).
 * Para o Diretor Técnico / Admin acompanhar treinos e jogos de todos os
 * escalões numa única linha temporal, sem navegar escalão a escalão.
 *
 * É uma leitura agregada — não há entidade nova nem migração: combina os dados
 * que já existem em `Sessao` (treinos), `Jogo` e `Reuniao` num único stream
 * cronológico.
 */
export interface EventoAgenda {
  id: string;
  tipo: "TREINO" | "JOGO" | "REUNIAO";
  data: Date;
  escalaoNome: string;
  /** Título legível: objetivo/tipo do treino, "vs Adversário" no jogo, título da reunião. */
  titulo: string;
  local?: string | null;
  /** Tipo de sessão — só presente em eventos de tipo TREINO. */
  tipoSessao?: TipoSessao;
  /** Tipo de jogo (oficial/amigável) — só presente em eventos de tipo JOGO. */
  tipoJogo?: TipoJogo;
  /** Casa/Fora — só presente em eventos de tipo JOGO. */
  casaFora?: CasaFora;
  /** Descrição da reunião — só presente em eventos de tipo REUNIAO. */
  descricao?: string;
  /**
   * Só para TREINO: sessão já realizada sem exercícios registados — sinaliza um
   * indicador de aviso na UI (mesmo critério da lista/calendário de Treinos:
   * `treinoConcluido(data) && _count.exercicios === 0`).
   */
  precisaAtencao?: boolean;
}

export interface FiltrosAgenda {
  escalaoId?: string;
  /** Mês 1–12 (com `ano`) para focar num mês específico. */
  mes?: number;
  ano?: number;
  /** Restringe a agenda a um único tipo de evento (filtro server-side). */
  tipo?: "TREINO" | "JOGO" | "REUNIAO";
}

/** Rótulo pt-PT do tipo de sessão, usado como título quando não há objetivo. */
const ROTULO_TIPO_SESSAO: Record<TipoSessao, string> = {
  NORMAL: "Treino",
  ABERTO: "Treino aberto",
  CAPTACAO: "Captação",
  EVENTO: "Evento",
};

type Contexto =
  | { estado: "erro"; erro: string }
  | { estado: "ok"; clubeId: string; epoca: Epoca };

async function contexto(): Promise<Contexto> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return { estado: "erro", erro: "Não autenticado" };
  const epoca = await obterEpocaAtiva();
  if (!epoca) return { estado: "erro", erro: "Nenhuma época ativa" };
  return { estado: "ok", clubeId, epoca };
}

/**
 * Janela temporal a considerar. Com `mes` (1–12) + `ano` válidos, foca esse mês
 * completo; caso contrário, os próximos 30 dias a partir do início de hoje.
 */
function resolverJanela(mes?: number, ano?: number): { gte: Date; lte: Date } {
  const mesValido =
    typeof mes === "number" && Number.isInteger(mes) && mes >= 1 && mes <= 12;
  const anoValido =
    typeof ano === "number" && Number.isInteger(ano) && ano >= 2000 && ano <= 2100;

  if (mesValido && anoValido) {
    const gte = new Date(ano!, mes! - 1, 1, 0, 0, 0, 0);
    const lte = new Date(ano!, mes!, 0, 23, 59, 59, 999); // dia 0 do mês seguinte = último dia
    return { gte, lte };
  }

  const gte = new Date();
  gte.setHours(0, 0, 0, 0);
  const lte = new Date(gte);
  lte.setDate(lte.getDate() + 30);
  lte.setHours(23, 59, 59, 999);
  return { gte, lte };
}

/**
 * Agenda agregada do clube: treinos + jogos de todos os escalões legíveis,
 * ordenados cronologicamente. Respeita o âmbito de leitura (§6.4) — Admin/DT
 * (âmbito TODO_CLUBE) veem todos; treinadores veem os seus + os visíveis.
 * Opcionalmente filtrável por escalão e por mês/ano (defeito: próximos 30 dias).
 */
export async function obterAgendaClube(
  filtros: FiltrosAgenda = {},
): Promise<Resultado<EventoAgenda[]>> {
  const ctx = await contexto();
  if (ctx.estado === "erro") return erro(ctx.erro);

  const janela = resolverJanela(filtros.mes, filtros.ano);

  // Que tipos de evento incluir. Sem `filtros.tipo`, incluem-se os três
  // (comportamento atual de agregação completa).
  const incluirTreinos = !filtros.tipo || filtros.tipo === "TREINO";
  const incluirJogos = !filtros.tipo || filtros.tipo === "JOGO";
  const incluirReunioes = !filtros.tipo || filtros.tipo === "REUNIAO";

  // Âmbito de leitura por escalão (mesmo padrão de listarSessoes/listarJogos).
  const legiveis = await escaloesLegiveis();
  let filtroEscalao: Prisma.SessaoWhereInput & Prisma.JogoWhereInput = {};
  // Sessões/Jogos ficam vazios quando não há escalões legíveis e não foi pedido
  // um escalão específico — mas as reuniões de CLUBE continuam visíveis a
  // qualquer membro (ver `reuniaoWhere`), pelo que não fazemos short-circuit.
  let semEscaloesLegiveis = false;
  if (filtros.escalaoId) {
    if (!(await podeLerEscalao(filtros.escalaoId))) return ok([]);
    filtroEscalao = { escalaoId: filtros.escalaoId };
  } else if (legiveis !== "TODOS") {
    if (legiveis.length === 0) semEscaloesLegiveis = true;
    else filtroEscalao = { escalaoId: { in: legiveis } };
  }

  // Âmbito das reuniões (mesmo padrão de `listarReunioes`): as de CLUBE são
  // visíveis a qualquer membro; as de ESCALAO respeitam a legibilidade. Com um
  // escalão específico selecionado, restringe-se a esse escalão (simetria com
  // o filtro de treinos/jogos).
  const reuniaoWhere: Prisma.ReuniaoWhereInput = {
    clubeId: ctx.clubeId,
    data: janela,
    ...(filtros.escalaoId
      ? { escalaoId: filtros.escalaoId }
      : {
          OR: [
            { ambito: "CLUBE" },
            legiveis === "TODOS"
              ? { ambito: "ESCALAO" }
              : { escalaoId: { in: legiveis } },
          ],
        }),
  };

  const [sessoes, jogos, reunioes] = await Promise.all([
    incluirTreinos && !semEscaloesLegiveis
      ? prisma.sessao.findMany({
          where: {
            epocaId: ctx.epoca.id,
            escalao: { clubeId: ctx.clubeId },
            data: janela,
            ...filtroEscalao,
          },
          select: {
            id: true,
            data: true,
            local: true,
            objetivo: true,
            tipoSessao: true,
            escalao: { select: { nome: true } },
            _count: { select: { exercicios: true } },
          },
          orderBy: { data: "asc" },
        })
      : Promise.resolve([]),
    incluirJogos && !semEscaloesLegiveis
      ? prisma.jogo.findMany({
          where: {
            epocaId: ctx.epoca.id,
            escalao: { clubeId: ctx.clubeId },
            data: janela,
            ...filtroEscalao,
          },
          select: {
            id: true,
            data: true,
            local: true,
            adversario: true,
            tipo: true,
            casaFora: true,
            escalao: { select: { nome: true } },
          },
          orderBy: { data: "asc" },
        })
      : Promise.resolve([]),
    incluirReunioes
      ? prisma.reuniao.findMany({
          where: reuniaoWhere,
          select: {
            id: true,
            data: true,
            titulo: true,
            escalaoId: true,
            ordemTrabalhos: true,
          },
          orderBy: { data: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Reuniao só tem `escalaoId` (FK), sem relação Prisma para Escalao — resolver
  // os nomes dos escalões referenciados num único query adicional (só quando há
  // reuniões de escalão). Reuniões de CLUBE (escalaoId null) ficam "Geral".
  const escalaoIdsReuniao = [
    ...new Set(
      reunioes
        .map((r) => r.escalaoId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const nomesEscaloes = new Map<string, string>();
  if (escalaoIdsReuniao.length > 0) {
    const escaloes = await prisma.escalao.findMany({
      where: { id: { in: escalaoIdsReuniao }, clubeId: ctx.clubeId },
      select: { id: true, nome: true },
    });
    for (const e of escaloes) nomesEscaloes.set(e.id, e.nome);
  }

  const eventos: EventoAgenda[] = [
    ...sessoes.map((s): EventoAgenda => ({
      id: s.id,
      tipo: "TREINO",
      data: s.data,
      escalaoNome: s.escalao.nome,
      titulo: s.objetivo?.trim() || ROTULO_TIPO_SESSAO[s.tipoSessao],
      local: s.local,
      tipoSessao: s.tipoSessao,
      // Sessão já realizada sem exercícios registados — precisa de atenção.
      precisaAtencao: treinoConcluido(s.data) && s._count.exercicios === 0,
    })),
    ...jogos.map((j): EventoAgenda => ({
      id: j.id,
      tipo: "JOGO",
      data: j.data,
      escalaoNome: j.escalao.nome,
      titulo: `vs ${j.adversario}`,
      local: j.local,
      tipoJogo: j.tipo,
      casaFora: j.casaFora,
    })),
    ...reunioes.map((r): EventoAgenda => ({
      id: r.id,
      tipo: "REUNIAO",
      data: r.data,
      escalaoNome: r.escalaoId ? nomesEscaloes.get(r.escalaoId) ?? "Geral" : "Geral",
      titulo: r.titulo,
      // Reuniao não tem coluna `local`; e a descrição da reunião é o texto livre
      // da ordem de trabalhos (o schema não tem coluna `descricao`).
      descricao: r.ordemTrabalhos ?? undefined,
    })),
  ];

  // Ordenação cronológica (crescente); desempate estável por tipo para saída determinística.
  eventos.sort((a, b) => {
    const diff = a.data.getTime() - b.data.getTime();
    if (diff !== 0) return diff;
    return a.tipo.localeCompare(b.tipo);
  });

  return ok(eventos);
}

// ─────────────────────────────────────────────────────────────────────────────
// F3.2 (§8.16) — Pré-verificação de conflitos de pavilhão.
// ─────────────────────────────────────────────────────────────────────────────

/** Margem para trás na janela de fetch (aproximação — refinada por `detetarConflitos`). */
const JANELA_ANTES_MS = 2 * 60 * 60 * 1000; // 2 h
/** Margem para a frente na janela de fetch. */
const JANELA_DEPOIS_MS = 8 * 60 * 60 * 1000; // 8 h

/**
 * Verifica, sem bloquear, se um evento (treino ou jogo) a criar/editar colide
 * com outro no mesmo pavilhão à mesma hora — atravessando TODOS os escalões do
 * clube. É só leitura de sobreposição, por isso não exige capacidade especial:
 * basta pertencer a um clube (adesão ativa).
 *
 * A UI chama esta action antes de submeter; a criação/edição em si nunca é
 * impedida por conflitos (regra da feature F3).
 */
export async function verificarConflitoAgenda(
  input: VerificarConflitoInput,
): Promise<Resultado<{ conflitos: ConflitoAgenda[] }>> {
  const parsed = verificarConflitoSchema.safeParse(input);
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const { data, duracaoMin, local, excluirId } = parsed.data;

  const membro = await obterMembroAtual();
  if (!membro) return erro("Não autenticado");

  // Janela de fetch aproximada para limitar a query; `detetarConflitos` faz o
  // teste de sobreposição exato depois.
  const gte = new Date(data.getTime() - JANELA_ANTES_MS);
  const lte = new Date(data.getTime() + JANELA_DEPOIS_MS);

  const [sessoes, jogos] = await Promise.all([
    prisma.sessao.findMany({
      where: {
        escalao: { clubeId: membro.clube.id },
        data: { gte, lte },
        local: { not: null },
      },
      select: {
        id: true,
        data: true,
        duracaoMin: true,
        local: true,
        escalao: { select: { nome: true } },
      },
    }),
    prisma.jogo.findMany({
      where: {
        escalao: { clubeId: membro.clube.id },
        data: { gte, lte },
        local: { not: null },
      },
      select: {
        id: true,
        data: true,
        local: true,
        escalao: { select: { nome: true } },
      },
    }),
  ]);

  const eventosExistentes = [
    ...sessoes.map((s) => ({
      id: s.id,
      data: s.data,
      duracaoMin: s.duracaoMin,
      local: s.local,
      tipo: "TREINO" as const,
      escalaoNome: s.escalao.nome,
    })),
    // Jogo não tem `duracaoMin` no schema → assume duração padrão.
    ...jogos.map((j) => ({
      id: j.id,
      data: j.data,
      duracaoMin: null,
      local: j.local,
      tipo: "JOGO" as const,
      escalaoNome: j.escalao.nome,
    })),
  ];

  const conflitos = detetarConflitos(
    { data, duracaoMin: duracaoMin ?? null, local },
    eventosExistentes,
    excluirId,
  );

  return ok({ conflitos });
}
