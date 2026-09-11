import type {
  CicloFaturacao,
  EstadoLicenca,
  Modalidade,
  TierClube,
  TipoLicenca,
  TipoMovimento,
} from "@prisma/client";

// Schemas/rótulos do licenciamento (F11, §3.11 / §17).
// Fonte única partilhada cliente/servidor (convenção do projeto).

// ─────────────────────────────────────────────
// Rótulos PT-PT (fonte única cliente/servidor)
// ─────────────────────────────────────────────

export const LABEL_TIPO_LICENCA: Record<TipoLicenca, string> = {
  INDIVIDUAL: "Individual",
  CLUBE: "Clube",
};

export const LABEL_TIER: Record<TierClube, string> = {
  PEQUENO: "Pequeno",
  MEDIO: "Médio",
  GRANDE: "Grande",
  PARCEIRO: "Parceiro",
};

export const LABEL_ESTADO_LICENCA: Record<EstadoLicenca, string> = {
  ATIVA: "Ativa",
  EXPIRADA: "Expirada",
  CANCELADA: "Cancelada",
  SUSPENSA: "Suspensa",
  PENDENTE: "Pendente",
};

export const LABEL_CICLO: Record<CicloFaturacao, string> = {
  MENSAL: "Mensal",
  ANUAL: "Anual",
};

export const LABEL_MODALIDADE: Record<Modalidade, string> = {
  FUTSAL: "Futsal",
  FUTEBOL: "Futebol",
};

export const LABEL_TIPO_MOVIMENTO: Record<TipoMovimento, string> = {
  CREDITO_ABSORCAO: "Crédito de absorção",
  DEBITO_COMPRA: "Débito de compra",
  REEMBOLSO: "Reembolso",
  AJUSTE: "Ajuste",
};

/** Formata um valor em cêntimos como euros PT-PT (ex.: 1599 → "15,99 €"). */
export function formatarEuros(centimos: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(centimos / 100);
}
