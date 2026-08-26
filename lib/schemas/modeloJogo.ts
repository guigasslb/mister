import { z } from "zod";
import { diagramaSchema } from "@/lib/schemas/exercicio";
import type { MomentoJogo, TipoQuadroTatico } from "@prisma/client";

/**
 * Referência opcional a um id (cuid) num formulário (bíblia §3.6 — F4).
 *   `undefined` → campo não enviado (não altera o valor guardado)
 *   `null` / `""` → limpar explicitamente (metodologia genérica portátil)
 *   cuid → definir
 */
const referenciaOpcional = z
  .union([z.string().cuid("Identificador inválido"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" ? null : v));

/** Subprincípios táticos de um momento: array de textos curtos (bíblia §3.6). */
export const subprincipiosSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "O subprincípio não pode estar vazio")
      .max(300, "Máximo de 300 caracteres por subprincípio"),
  )
  .max(50, "Máximo de 50 subprincípios");

export const modeloJogoSchema = z.object({
  nome: z.string().min(1, "O nome é obrigatório").max(100),
  momento: z.enum([
    "ORG_OFENSIVA",
    "ORG_DEFENSIVA",
    "TRANS_OFENSIVA",
    "TRANS_DEFENSIVA",
    "BOLAS_PARADAS",
  ]),
  principios: z.string().max(3000).optional(),
  subprincipios: subprincipiosSchema.optional(),
  diagrama: diagramaSchema.optional(),
  /**
   * CLUBE = documento vivo da equipa (filosofia do clube).
   * TREINADOR = metodologia genérica portátil (biblioteca pessoal, sem escalão/época).
   */
  proprietario: z.enum(["CLUBE", "TREINADOR"]).default("CLUBE"),
  escalaoId: referenciaOpcional,
  epocaId: referenciaOpcional,
});

export type ModeloJogoInput = z.infer<typeof modeloJogoSchema>;

export const LABEL_MOMENTO: Record<MomentoJogo, string> = {
  ORG_OFENSIVA: "Organização ofensiva",
  ORG_DEFENSIVA: "Organização defensiva",
  TRANS_OFENSIVA: "Transição ofensiva",
  TRANS_DEFENSIVA: "Transição defensiva",
  BOLAS_PARADAS: "Bolas paradas",
};

export const MOMENTOS = Object.keys(LABEL_MOMENTO) as MomentoJogo[];

/**
 * Normaliza o campo `subprincipios` (Json?) para uma lista de textos.
 * Aceita o formato simples (`["Pressão alta"]`) e o estruturado
 * (`[{ titulo, detalhe }]`) previsto na bíblia §3.6, ignorando entradas inválidas.
 */
export function lerSubprincipios(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const lista: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const texto = item.trim();
      if (texto) lista.push(texto);
      continue;
    }
    if (item && typeof item === "object" && "titulo" in item) {
      const titulo = (item as { titulo?: unknown }).titulo;
      if (typeof titulo === "string" && titulo.trim()) lista.push(titulo.trim());
    }
  }
  return lista;
}

// ─────────────────────────────────────────────
// Quadro tático (por jogo) — bíblia §3.6
// ─────────────────────────────────────────────

export const LABEL_TIPO_QUADRO: Record<TipoQuadroTatico, string> = {
  GERAL: "Geral",
  BOLA_PARADA: "Bola parada",
};

/**
 * Nome canónico do quadro tático interativo do separador "Plano de jogo" (§8.10).
 * O detalhe do jogo identifica (e faz upsert d)este quadro por nome, para manter
 * um único quadro-plano por jogo, distinto de outros quadros criados à parte.
 */
export const NOME_QUADRO_PLANO_JOGO = "Plano de jogo";

export const TIPOS_QUADRO = Object.keys(LABEL_TIPO_QUADRO) as TipoQuadroTatico[];

export const quadroTaticoSchema = z.object({
  nome: z.string().min(1, "O nome é obrigatório").max(100),
  tipo: z.enum(["GERAL", "BOLA_PARADA"]).default("GERAL"),
  notas: z.string().max(2000).optional(),
  diagrama: diagramaSchema.optional(),
});

export type QuadroTaticoInput = z.infer<typeof quadroTaticoSchema>;

/** Criação: exige o jogo a que o quadro pertence (`QuadroTatico.jogoId`). */
export const criarQuadroTaticoSchema = quadroTaticoSchema.extend({
  jogoId: z.string().cuid("Jogo inválido"),
});

export type CriarQuadroTaticoInput = z.infer<typeof criarQuadroTaticoSchema>;
