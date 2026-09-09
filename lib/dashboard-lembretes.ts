/**
 * Lembretes in-app leves (F14 / secção 8.16) — funções PURAS.
 *
 * Sem entidade `Lembrete` (essa é a fase própria — §3.15/§8.19): aqui apenas
 * derivamos avisos do dashboard a partir dos dados já existentes de sessões e
 * jogos («há treino/jogo hoje»). Sem push, sem service worker.
 *
 * Módulo puro (sem Prisma/servidor) → testável e reutilizável no cliente.
 */

import { partesDataLisboa } from "@/lib/utils-datas";

/** Forma mínima de um evento (sessão ou jogo) para os lembretes. */
export interface EventoLite {
  id: string;
  data: Date;
  escalaoNome: string;
  local?: string | null;
  adversario?: string | null;
}

export type TipoLembrete = "treino" | "jogo";

export interface Lembrete {
  id: string;
  tipo: TipoLembrete;
  /** Ex.: "Treino hoje às 19:00". */
  titulo: string;
  /** Ex.: "Sub-13 · Pavilhão Municipal". */
  detalhe: string;
  href: string;
  /** O evento já decorreu (data anterior a "agora"), mas ainda é hoje. */
  passou: boolean;
}

/**
 * Verdadeiro se as duas datas caem no mesmo dia civil (hora de Lisboa).
 *
 * Ancorado a Europe/Lisbon (via `partesDataLisboa`): em produção o processo
 * Node corre em UTC e `getFullYear()/getMonth()/getDate()` colocariam eventos
 * junto à meia-noite no dia errado (−1h no Verão, WEST=UTC+1).
 */
export function mesmoDia(a: Date, b: Date): boolean {
  const pa = partesDataLisboa(a);
  const pb = partesDataLisboa(b);
  return pa.ano === pb.ano && pa.mes === pb.mes && pa.dia === pb.dia;
}

/**
 * Hora no formato "HH:MM", sempre em hora de parede de Lisboa.
 *
 * Ancorado a Europe/Lisbon (via `partesDataLisboa`): em produção (Node UTC),
 * `getHours()/getMinutes()` mostrariam a hora UTC (ex.: treino às 20:30 Lisboa
 * exibido como "19:30"). Ver `lib/utils-datas.ts`.
 */
export function horaCurta(d: Date): string {
  const { hora, minuto } = partesDataLisboa(d);
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

function detalheEvento(e: EventoLite, tipo: TipoLembrete): string {
  const partes: string[] = [];
  if (tipo === "jogo" && e.adversario) partes.push(`vs ${e.adversario}`);
  partes.push(e.escalaoNome);
  if (e.local) partes.push(e.local);
  return partes.join(" · ");
}

/**
 * Constrói a lista ordenada de lembretes de HOJE a partir das sessões e jogos
 * do dia. Ordena por hora ascendente; eventos já decorridos ficam depois dos
 * que ainda estão por vir (mas o mesmo horário mantém a ordem cronológica).
 */
export function construirLembretesHoje(
  sessoes: EventoLite[],
  jogos: EventoLite[],
  agora: Date,
): Lembrete[] {
  const deSessao = sessoes
    .filter((s) => mesmoDia(s.data, agora))
    .map<Lembrete>((s) => ({
      id: s.id,
      tipo: "treino",
      titulo: `Treino hoje às ${horaCurta(s.data)}`,
      detalhe: detalheEvento(s, "treino"),
      href: `/treinos/${s.id}`,
      passou: s.data.getTime() < agora.getTime(),
    }));

  const deJogo = jogos
    .filter((j) => mesmoDia(j.data, agora))
    .map<Lembrete>((j) => ({
      id: j.id,
      tipo: "jogo",
      titulo: `Jogo hoje às ${horaCurta(j.data)}`,
      detalhe: detalheEvento(j, "jogo"),
      href: `/jogos/${j.id}`,
      passou: j.data.getTime() < agora.getTime(),
    }));

  return [...deSessao, ...deJogo].sort((a, b) => {
    // Por vir antes de já decorrido; dentro do grupo, por hora ascendente.
    if (a.passou !== b.passou) return a.passou ? 1 : -1;
    const ta = extrairMinutos(a.titulo);
    const tb = extrairMinutos(b.titulo);
    return ta - tb;
  });
}

/** Extrai "HH:MM" do título e converte em minutos (auxiliar de ordenação). */
function extrairMinutos(titulo: string): number {
  const m = /(\d{2}):(\d{2})/.exec(titulo);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Há pelo menos um evento hoje (para o indicador visual do cabeçalho). */
export function temEventoHoje(
  sessoes: EventoLite[],
  jogos: EventoLite[],
  agora: Date,
): boolean {
  return (
    sessoes.some((s) => mesmoDia(s.data, agora)) ||
    jogos.some((j) => mesmoDia(j.data, agora))
  );
}
