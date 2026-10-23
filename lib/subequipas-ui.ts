import { placarDivergente } from "@/lib/subequipas";

/**
 * Subequipas por competição (§23.11) — lógica pura das vistas (wizard, plantéis,
 * convocatória, confrontos, filtro de analíticos). Sem Prisma nem I/O.
 * Com 0/1 equipa própria e jogos sem subequipa o resultado é o comportamento
 * anterior (§23.11.7).
 */

const norm = (s: string) => s.trim().toLocaleLowerCase("pt");

// ─── Wizard de competição (§23.11.3 regra 9) ─────────────────────────────────

export type EquipaWizard = { nome: string; propria: boolean };
export type ParticipanteWizard = { nome: string; ehPropria: boolean; automatica: boolean };

/**
 * Participantes do Passo 2. Se alguma entrada estiver marcada como «Equipa
 * própria», são exatamente as entradas introduzidas. Senão, numa competição
 * PRÓPRIA, o escalão é juntado como primeiro participante (próprio, automático),
 * sem duplicar uma entrada com o mesmo nome — comportamento anterior.
 */
export function participantesWizard(
  equipas: EquipaWizard[],
  ambitoPropria: boolean,
  escalaoNome: string,
): ParticipanteWizard[] {
  const introduzidas = equipas.map((e) => ({
    nome: e.nome,
    ehPropria: e.propria,
    automatica: false,
  }));
  const algumaMarcada = equipas.some((e) => e.propria);
  if (algumaMarcada || !ambitoPropria || escalaoNome === "") return introduzidas;
  const semDup = introduzidas.filter((e) => norm(e.nome) !== norm(escalaoNome));
  return [{ nome: escalaoNome, ehPropria: true, automatica: true }, ...semDup];
}

// ─── Plantéis das subequipas (§23.11.3 regra 2) ──────────────────────────────

export type PlantelSubequipa = { id: string; nome: string; atletaIds: string[] };

/** Nomes das OUTRAS subequipas em cujo plantel o atleta também está (aviso). */
export function outrasSubequipasDoAtleta(
  atletaId: string,
  equipaId: string,
  planteis: PlantelSubequipa[],
): string[] {
  return planteis
    .filter((p) => p.id !== equipaId && p.atletaIds.includes(atletaId))
    .map((p) => p.nome);
}

// ─── Convocatória (§23.11.3 regras 4–5) ──────────────────────────────────────

export type LinhaConvocavel<A> = {
  atleta: A;
  /** Convocável apenas por exceção: não pertence ao plantel da subequipa. */
  foraPlantel: boolean;
  /** Já convocado pela outra subequipa do confronto interno (A vs B). */
  bloqueado: boolean;
};

export type Convocaveis<A> = {
  /** Há plantel definido: a lista base é só o plantel (com exceções). */
  restrito: boolean;
  visiveis: LinhaConvocavel<A>[];
  /** Restantes atletas do escalão, disponíveis para «Adicionar atleta fora do plantel». */
  foraDoPlantel: A[];
};

/**
 * Lista de convocáveis de um jogo. Sem plantel (0 atletas) ⇒ todo o escalão,
 * como antes. Com plantel ⇒ o plantel + os atletas fora do plantel já convocados
 * ou acrescentados por exceção (`revelados`). Os atletas convocados pela outra
 * subequipa num A vs B ficam assinalados como bloqueados e não são oferecidos
 * como exceção.
 */
export function convocaveisJogo<A extends { id: string }>(params: {
  atletas: A[];
  plantelIds: string[];
  convocados: ReadonlySet<string>;
  revelados: ReadonlySet<string>;
  bloqueadosIds: string[];
}): Convocaveis<A> {
  const { atletas, plantelIds, convocados, revelados, bloqueadosIds } = params;
  const bloqueados = new Set(bloqueadosIds);
  const plantel = new Set(plantelIds);
  const restrito = plantel.size > 0;
  const linha = (a: A): LinhaConvocavel<A> => ({
    atleta: a,
    foraPlantel: restrito && !plantel.has(a.id),
    bloqueado: bloqueados.has(a.id),
  });
  if (!restrito) return { restrito, visiveis: atletas.map(linha), foraDoPlantel: [] };

  const visivel = (a: A) => plantel.has(a.id) || convocados.has(a.id) || revelados.has(a.id);
  return {
    restrito,
    visiveis: atletas.filter(visivel).map(linha),
    foraDoPlantel: atletas.filter((a) => !visivel(a) && !bloqueados.has(a.id)),
  };
}

/**
 * Ids que «Selecionar todos» pode marcar: os visíveis, exceto os bloqueados
 * (a não ser que já estejam convocados — podem ser desmarcados).
 */
export function selecionaveis<A extends { id: string }>(
  visiveis: LinhaConvocavel<A>[],
  convocados: ReadonlySet<string>,
): string[] {
  return visiveis
    .filter((l) => !l.bloqueado || convocados.has(l.atleta.id))
    .map((l) => l.atleta.id);
}

// ─── Confrontos (§23.11.3 regra 6) ───────────────────────────────────────────

type JogoDoConfronto = {
  equipaCompeticaoId: string | null;
  golosMarcados: number | null;
  golosSofridos: number | null;
};

/**
 * Confronto interno (dois jogos de subequipas distintas) com placares
 * incoerentes entre as duas perspetivas. Confrontos com um só jogo ⇒ `false`.
 */
export function confrontoComPlacarDivergente(jogos: JogoDoConfronto[]): boolean {
  const comEquipa = jogos.filter((j) => j.equipaCompeticaoId !== null);
  const [a, b] = comEquipa;
  if (!a || !b || a.equipaCompeticaoId === b.equipaCompeticaoId) return false;
  return placarDivergente(a, b);
}

// ─── Filtro «Equipa» dos analíticos (§23.11.3 regra 10) ──────────────────────

/**
 * Valida o `?equipa=` face à competição selecionada: só é aplicado se for uma
 * das subequipas dessa competição (com ≥2); caso contrário é ignorado.
 */
export function equipaFiltroValida(
  competicoes: { id: string; equipas: { id: string }[] }[],
  competicaoId: string | undefined,
  equipaId: string | undefined,
): string | undefined {
  if (!competicaoId || !equipaId) return undefined;
  const comp = competicoes.find((c) => c.id === competicaoId);
  if (!comp || comp.equipas.length < 2) return undefined;
  return comp.equipas.some((e) => e.id === equipaId) ? equipaId : undefined;
}

/**
 * Opções do filtro «Equipa» do relatório de equipa (sem filtro de competição):
 * as subequipas de cada competição com ≥2, pela ordem recebida (competições e
 * equipas por ordem de criação — `ORDEM_EQUIPAS_PROPRIAS`), sem reordenar.
 */
export function opcoesEquipaRelatorio(
  competicoes: { nome: string; equipas: { id: string; nome: string }[] }[],
): { id: string; rotulo: string }[] {
  return competicoes
    .filter((c) => c.equipas.length >= 2)
    .flatMap((c) => c.equipas.map((e) => ({ id: e.id, rotulo: `${e.nome} · ${c.nome}` })));
}
