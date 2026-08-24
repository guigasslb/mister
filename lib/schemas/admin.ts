import { z } from "zod";

// Schemas Zod do backoffice interno da plataforma (Fase 2 — gestão de licenças
// cross-tenant). Fonte única partilhada cliente/servidor (convenção do projeto).
//
// Nota: estas operações são cross-tenant (operador do produto Mister), ao
// contrário das actions club-scoped de `lib/schemas/licenciamento.ts`.

/**
 * Mudança manual do estado de uma licença. EXPIRADA é EXCLUÍDA de propósito:
 * é um estado DERIVADO (calculado a partir de `dataFim`), nunca definido à mão.
 */
export const AlterarEstadoLicencaSchema = z.object({
  licencaId: z.string().cuid("Licença inválida"),
  estado: z.enum(["ATIVA", "SUSPENSA", "CANCELADA"]),
});

export type AlterarEstadoLicencaInput = z.infer<typeof AlterarEstadoLicencaSchema>;

/**
 * Edição da data de fim de uma licença. `null` = sem expiração (licença
 * perpétua/aberta).
 */
export const EditarDataFimLicencaSchema = z.object({
  licencaId: z.string().cuid("Licença inválida"),
  dataFim: z.coerce.date().nullable(),
});

export type EditarDataFimLicencaInput = z.infer<typeof EditarDataFimLicencaSchema>;

// ─────────────────────────────────────────────
// Gestão de contas/membros dentro de uma licença de clube (§21.2)
// ─────────────────────────────────────────────

/** Identificador de clube (cuid) — usado para listar os membros de um clube. */
export const ClubeIdSchema = z.string().cuid("Clube inválido");

/**
 * Edição de dados básicos de uma conta (nome + email), pelo admin de plataforma.
 * O email é normalizado (trim + lowercase), como nos restantes schemas de conta.
 */
export const EditarUtilizadorSchema = z.object({
  utilizadorId: z.string().cuid("Utilizador inválido"),
  nome: z.string().trim().min(1, "O nome é obrigatório").max(120, "Nome demasiado longo"),
  email: z.string().trim().email("Email inválido").toLowerCase(),
});

export type EditarUtilizadorInput = z.infer<typeof EditarUtilizadorSchema>;

/**
 * Suspender / reativar a adesão de uma conta a um clube (não o clube inteiro).
 * `INATIVO` = suspensa, `ATIVO` = reativada. `CONVIDADO` é excluído de propósito
 * (é um estado do fluxo de convite, não uma operação manual do admin).
 */
export const AlterarEstadoMembroSchema = z.object({
  membroId: z.string().cuid("Membro inválido"),
  estado: z.enum(["ATIVO", "INATIVO"]),
});

export type AlterarEstadoMembroInput = z.infer<typeof AlterarEstadoMembroSchema>;
