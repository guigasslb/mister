import { z } from "zod";

export const TIPOS_SESSAO = ["NORMAL", "ABERTO", "CAPTACAO", "EVENTO"] as const;

export const LABEL_TIPO_SESSAO: Record<(typeof TIPOS_SESSAO)[number], string> = {
  NORMAL: "Treino normal",
  ABERTO: "Treino aberto",
  CAPTACAO: "Captação",
  EVENTO: "Evento",
};

/**
 * §8.9.1 — Momento da semana (modo ESTRUTURADO): dia de treino marcado por
 * relação com o dia de jogo (MD-X). Definido localmente para não acoplar o
 * schema à geração do cliente Prisma.
 */
export const MOMENTOS_SEMANA = [
  "MD_MENOS_3",
  "MD_MENOS_2",
  "MD_MENOS_1",
  "MD_MAIS_1",
  "ATIVACAO",
  "TAPER",
  "LIVRE",
] as const;
export type MomentoSemana = (typeof MOMENTOS_SEMANA)[number];

export const LABEL_MOMENTO_SEMANA: Record<MomentoSemana, string> = {
  MD_MENOS_3: "MD-3",
  MD_MENOS_2: "MD-2",
  MD_MENOS_1: "MD-1",
  MD_MAIS_1: "MD+1 / Recuperação",
  ATIVACAO: "Ativação",
  TAPER: "Taper / Carga",
  LIVRE: "Livre",
};

/**
 * Só sessões do tipo NORMAL podem ligar a periodização (secção 16, Grupo B):
 * um jogo/evento/captação/treino aberto com `planeamentoId` corromperia os
 * dados de periodização. Regra imposta via superRefine (schema) e reforçada
 * por uma guarda nas actions (dupla validação).
 */
export const sessaoSchema = z
  .object({
    data: z.coerce.date(),
    escalaoId: z.string().cuid("Escalão inválido"),
    tipoSessao: z.enum(TIPOS_SESSAO).default("NORMAL"),
    planeamentoId: z.string().cuid().nullable().optional(),
    // §8.9.1: momento da semana (MD-X) no modo ESTRUTURADO.
    momentoSemana: z.enum(MOMENTOS_SEMANA).optional(),
    duracaoMin: z.number().int().min(1).max(300).optional(),
    objetivo: z.string().max(500).optional(),
    local: z.string().max(100).optional(),
    notas: z.string().max(2000).optional(),
  })
  .superRefine((dados, ctx) => {
    if (dados.tipoSessao !== "NORMAL" && dados.planeamentoId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["planeamentoId"],
        message: "Só treinos normais podem estar associados a uma periodização.",
      });
    }
  });

export type SessaoInput = z.infer<typeof sessaoSchema>;

export const ESTADOS_PRESENCA = [
  "PRESENTE",
  "FALTA",
  "FALTA_JUSTIFICADA",
  "LESIONADO",
  "ATRASADO",
] as const;

export const MOTIVOS_FALTA = ["LESAO", "DOENCA", "OUTRO", "SEM_JUSTIFICACAO"] as const;

export const LABEL_MOTIVO_FALTA: Record<(typeof MOTIVOS_FALTA)[number], string> = {
  LESAO: "Lesão",
  DOENCA: "Doença",
  OUTRO: "Outro",
  SEM_JUSTIFICACAO: "Sem justificação",
};

export const presencaSchema = z.object({
  atletaId: z.string().cuid(),
  estado: z.enum(ESTADOS_PRESENCA),
  // Motivo da falta (F1 — lesões como motivo, secção 8.5).
  motivo: z.enum(MOTIVOS_FALTA).nullable().optional(),
  justificacao: z.string().max(300).optional(),
});

export const marcarPresencasSchema = z.array(presencaSchema);

/** Notas livres da sessão, editáveis inline no detalhe do treino (Melhoria 4.6). */
export const notasSessaoSchema = z.object({
  notas: z.string().max(2000, "Máximo de 2000 caracteres"),
});

export const LABEL_PRESENCA: Record<(typeof ESTADOS_PRESENCA)[number], string> = {
  PRESENTE: "Presente",
  FALTA: "Falta",
  FALTA_JUSTIFICADA: "Falta justificada",
  LESIONADO: "Lesionado",
  ATRASADO: "Atrasado",
};

export const sessaoExercicioOverrideSchema = z.object({
  duracaoMin:        z.number().int().min(1).max(180).nullable().optional(),
  series:            z.number().int().min(1).max(99).nullable().optional(),
  descricaoOverride: z.string().max(2000).nullable().optional(),
  notas:             z.string().max(2000).nullable().optional(),
});
export type SessaoExercicioOverrideInput = z.infer<typeof sessaoExercicioOverrideSchema>;
