import type { EstadoMatch, TipoParticipante } from "@prisma/client";

/** Forma mínima de um participante tal como vem incluído num duelo. */
export type ParticipanteMatch = {
  tipo: TipoParticipante;
  atleta: { nome: string } | null;
  atletaExternoNome: string | null;
  clubeExterno: { nome: string } | null;
} | null;

/** Nome apresentável de um participante de um duelo (ou "A definir" se vazio). */
export function nomeParticipanteMatch(p: ParticipanteMatch): string {
  if (!p) return "A definir";
  if (p.tipo === "ATLETA") return p.atleta?.nome ?? "—";
  const base = p.atletaExternoNome ?? "Externo";
  return p.clubeExterno ? `${base} (${p.clubeExterno.nome})` : base;
}

export const LABEL_ESTADO_MATCH: Record<EstadoMatch, string> = {
  AGENDADO: "Agendado",
  REALIZADO: "Realizado",
  ADIADO: "Adiado",
  ANULADO: "Anulado",
};

export const VARIANTE_ESTADO_MATCH: Record<
  EstadoMatch,
  "default" | "secondary" | "outline" | "destructive"
> = {
  AGENDADO: "outline",
  REALIZADO: "default",
  ADIADO: "secondary",
  ANULADO: "destructive",
};
