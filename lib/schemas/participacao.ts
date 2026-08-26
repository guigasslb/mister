import { z } from "zod";
import type { EstadoParticipacao, TipoParticipacao } from "@prisma/client";

// Participação de um atleta num escalão durante uma época (F1 — AtletaEscalao).
// Secção 8.5 da bíblia: associar / transferir / terminar participação.

export const TIPOS_PARTICIPACAO = ["PRINCIPAL", "SIMULTANEA", "OCASIONAL"] as const;

/**
 * Tipos que podem ser criados por «associar a escalão».
 *
 * A participação PRINCIPAL é única por atleta/época (secção 9 — «participação
 * principal obrigatória»): nasce com o atleta (`criarAtleta`) e só muda por
 * transferência. Associar nunca pode criar um segundo principal.
 */
export const TIPOS_PARTICIPACAO_ADICIONAL = ["SIMULTANEA", "OCASIONAL"] as const;

export const ESTADOS_PARTICIPACAO = [
  "ATIVO",
  "TRANSICAO_PERMANENTE",
  "INATIVO",
] as const;

export const LABEL_TIPO_PARTICIPACAO: Record<TipoParticipacao, string> = {
  PRINCIPAL: "Principal",
  SIMULTANEA: "Simultânea",
  OCASIONAL: "Ocasional",
};

/** Versão curta para cartões e listas densas (plantel). */
export const ABREV_TIPO_PARTICIPACAO: Record<TipoParticipacao, string> = {
  PRINCIPAL: "Principal",
  SIMULTANEA: "Simult.",
  OCASIONAL: "Ocas.",
};

export const LABEL_ESTADO_PARTICIPACAO: Record<EstadoParticipacao, string> = {
  ATIVO: "Ativa",
  TRANSICAO_PERMANENTE: "Transição permanente",
  INATIVO: "Terminada",
};

const numeroCamisola = z
  .number()
  .int()
  .min(1, "O número deve estar entre 1 e 999")
  .max(999, "O número deve estar entre 1 e 999");

export const associarAEscalaoSchema = z.object({
  atletaId: z.string().cuid("Atleta inválido"),
  escalaoId: z.string().cuid("Escalão inválido"),
  epocaId: z.string().cuid("Época inválida").optional(),
  tipo: z
    .enum(TIPOS_PARTICIPACAO_ADICIONAL, {
      errorMap: () => ({
        message:
          "A participação principal define-se na criação do atleta ou por transferência",
      }),
    })
    .default("SIMULTANEA"),
  numero: numeroCamisola.nullable().optional(),
});

export const transferirEscalaoSchema = z
  .object({
    atletaId: z.string().cuid("Atleta inválido"),
    deEscalaoId: z.string().cuid("Escalão de origem inválido"),
    paraEscalaoId: z.string().cuid("Escalão de destino inválido"),
    epocaId: z.string().cuid("Época inválida").optional(),
    tipo: z.enum(TIPOS_PARTICIPACAO).default("PRINCIPAL"),
    numero: numeroCamisola.nullable().optional(),
  })
  .refine((d) => d.deEscalaoId !== d.paraEscalaoId, {
    message: "O escalão de destino deve ser diferente do de origem",
    path: ["paraEscalaoId"],
  });

export const terminarParticipacaoSchema = z.object({
  atletaId: z.string().cuid("Atleta inválido"),
  escalaoId: z.string().cuid("Escalão inválido"),
  epocaId: z.string().cuid("Época inválida").optional(),
});

/**
 * Editar o tipo de uma participação ativa (secção 8.5).
 *
 * Ao contrário de `associar` (que nunca cria um segundo principal), aqui os três
 * tipos são permitidos: passar a PRINCIPAL despromove automaticamente o principal
 * anterior da mesma modalidade para SIMULTANEA (invariante da secção 9, imposto na
 * action). Passar o único PRINCIPAL a não-principal é recusado — deixaria a
 * modalidade sem participação principal obrigatória.
 */
export const editarTipoParticipacaoSchema = z.object({
  atletaId: z.string().cuid("Atleta inválido"),
  escalaoId: z.string().cuid("Escalão inválido"),
  epocaId: z.string().cuid("Época inválida").optional(),
  tipo: z.enum(TIPOS_PARTICIPACAO),
});

/** Participação ativa reduzida ao necessário para validar o invariante. */
export interface ParticipacaoAtivaResumo {
  escalaoId: string;
  tipo: TipoParticipacao;
}

/**
 * Invariante da secção 9: um atleta tem no máximo UMA participação ATIVA do
 * tipo PRINCIPAL por época.
 *
 * Função pura. Dadas as participações ativas do atleta na época, o destino
 * pretendido (que passa a PRINCIPAL) e os escalões que a operação vai encerrar,
 * devolve as participações principais que sobrariam ativas e que, por isso,
 * têm de ser **despromovidas** para SIMULTANEA na mesma transação.
 *
 * Devolve `[]` quando o destino não é PRINCIPAL (nada a despromover).
 */
export function principaisADespromover<T extends ParticipacaoAtivaResumo>(
  ativas: readonly T[],
  destino: { escalaoId: string; tipo: TipoParticipacao },
  escaloesEncerrados: readonly string[] = [],
): T[] {
  if (destino.tipo !== "PRINCIPAL") return [];

  const encerrados = new Set(escaloesEncerrados);
  return ativas.filter(
    (p) =>
      p.tipo === "PRINCIPAL" &&
      p.escalaoId !== destino.escalaoId &&
      !encerrados.has(p.escalaoId),
  );
}

/**
 * Como `principaisADespromover`, mas devolve apenas o `escalaoId` do primeiro
 * principal que permaneceria ativo — ou `null` quando não há nenhum.
 * Útil para detetar o conflito sem o resolver (validações, UI).
 */
export function conflitoPrincipalAtivo(
  ativas: readonly ParticipacaoAtivaResumo[],
  destino: { escalaoId: string; tipo: TipoParticipacao },
  escaloesEncerrados: readonly string[] = [],
): string | null {
  return (
    principaisADespromover(ativas, destino, escaloesEncerrados)[0]?.escalaoId ?? null
  );
}

/**
 * Invariante complementar (secção 9 — «participação principal obrigatória»):
 * uma operação que encerre/despromova participações não pode deixar o atleta
 * sem qualquer participação PRINCIPAL ativa na época.
 *
 * `destino` é a participação que a operação deixa ativa (ou `null` quando a
 * operação apenas encerra, como em `terminarParticipacao`).
 */
export function ficariaSemPrincipal(
  ativas: readonly ParticipacaoAtivaResumo[],
  destino: { escalaoId: string; tipo: TipoParticipacao } | null,
  escaloesEncerrados: readonly string[] = [],
): boolean {
  if (destino?.tipo === "PRINCIPAL") return false;

  const encerrados = new Set(escaloesEncerrados);
  return !ativas.some(
    (p) =>
      p.tipo === "PRINCIPAL" &&
      !encerrados.has(p.escalaoId) &&
      // O destino sobrepõe-se à participação existente nesse escalão.
      p.escalaoId !== destino?.escalaoId,
  );
}

export type AssociarAEscalaoInput = z.infer<typeof associarAEscalaoSchema>;
export type TransferirEscalaoInput = z.infer<typeof transferirEscalaoSchema>;
export type TerminarParticipacaoInput = z.infer<typeof terminarParticipacaoSchema>;
export type EditarTipoParticipacaoInput = z.infer<typeof editarTipoParticipacaoSchema>;
