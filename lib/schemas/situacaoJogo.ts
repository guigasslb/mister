import { z } from "zod";
import { diagramaSchema } from "@/lib/schemas/exercicio";
import { NOME_QUADRO_PLANO_JOGO } from "@/lib/schemas/modeloJogo";

// ─── Situações de jogo (bíblia §24.5) ────────────────────────────────────────

/**
 * Nome de uma situação (ou de um quadro de situação no jogo): 1–100 após `trim`.
 * «Plano de jogo» é reservado ao quadro do plano (RN-SJ-4), sem distinção de
 * maiúsculas.
 */
export const nomeSituacaoSchema = z
  .string()
  .trim()
  .min(1, "O nome é obrigatório")
  .max(100)
  .refine(
    (n) => n.toLowerCase() !== NOME_QUADRO_PLANO_JOGO.toLowerCase(),
    "Este nome está reservado ao quadro do plano de jogo.",
  );

/** Categoria opcional: `undefined`/`null`/`""` → sem categoria (null). */
export const referenciaCategoria = z
  .union([z.string().cuid("Categoria inválida"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" ? null : v));

/** Diagrama da situação: `campo` obrigatório (RN-SJ-3). */
export const diagramaSituacaoSchema = diagramaSchema.refine(
  (d) => d.campo !== undefined,
  "Escolhe o campo da situação.",
);

export const situacaoJogoSchema = z.object({
  escalaoId: z.string().cuid("Escalão inválido"),
  nome: nomeSituacaoSchema,
  categoriaId: referenciaCategoria,
  descricao: z.string().trim().max(2000).optional(),
  diagrama: diagramaSituacaoSchema,
});

/** Edição: o escalão é imutável. */
export const atualizarSituacaoJogoSchema = situacaoJogoSchema.omit({ escalaoId: true });

export const filtroSituacoesSchema = z
  .object({
    escalaoId: z.string().cuid().optional(),
    categoriaId: z.string().cuid().optional(),
    q: z.string().trim().max(100).optional(),
  })
  .optional();

export const categoriaSituacaoSchema = z.object({
  escalaoId: z.string().cuid("Escalão inválido"),
  nome: z.string().trim().min(1, "O nome é obrigatório").max(60),
  ordem: z.number().int().min(0).default(0),
});

/** Edição: o escalão da categoria é imutável. */
export const atualizarCategoriaSituacaoSchema = categoriaSituacaoSchema.omit({
  escalaoId: true,
});

export const importarSituacaoSchema = z.object({
  jogoId: z.string().cuid("Jogo inválido"),
  situacaoId: z.string().cuid("Situação inválida"),
});

/** Edição «Só neste jogo» de um quadro de situação. */
export const quadroSituacaoSchema = z.object({
  nome: nomeSituacaoSchema,
  notas: z.string().trim().max(2000).optional(),
  diagrama: diagramaSchema,
});

export const guardarComoNovaSituacaoSchema = quadroSituacaoSchema.extend({
  categoriaId: referenciaCategoria,
});

export const duplicarQuadroSituacaoSchema = z.object({ nome: nomeSituacaoSchema });

