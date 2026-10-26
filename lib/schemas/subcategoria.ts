import { z } from "zod";
import type { CategoriaExercicioPrincipal } from "@prisma/client";

export const CATEGORIAS_PRINCIPAIS = [
  "ATAQUE",
  "DEFESA",
  "TRANSICAO",
  "BOLAS_PARADAS",
  "FISICO",
  "GUARDA_REDES",
  "OUTRO",
] as const;

export const LABEL_CATEGORIA_PRINCIPAL: Record<CategoriaExercicioPrincipal, string> = {
  ATAQUE: "Ataque",
  DEFESA: "Defesa",
  TRANSICAO: "Transição",
  BOLAS_PARADAS: "Bolas paradas",
  FISICO: "Físico",
  GUARDA_REDES: "Guarda-redes",
  OUTRO: "Outro",
};

export const subcategoriaSchema = z.object({
  nome: z.string().min(1, "O nome é obrigatório").max(80),
  // 2026-10-12: uma subcategoria pode pertencer a várias categorias principais (≥1).
  categorias: z
    .array(z.enum(CATEGORIAS_PRINCIPAIS))
    .min(1, "Escolhe pelo menos uma categoria principal")
    .transform((lista) => [...new Set(lista)]),
  ordem: z.number().int().min(0).max(999).default(0),
});

export type SubcategoriaInput = z.infer<typeof subcategoriaSchema>;
