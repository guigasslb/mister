import { z } from "zod";
import { FormatoJogo } from "@prisma/client";

// ─── Diagrama de campo (secção 13.3) ────────────────────────────────────────

const pontoSchema = z.object({ x: z.number(), y: z.number() });

const corJogadorSchema = z.enum(["azul", "vermelho", "amarelo", "verde"]);

// Cores de cone (secção 13.3). Ausente → laranja (default/retrocompatível com
// diagramas gravados antes do suporte multicolor).
const corConeSchema = z.enum([
  "laranja",
  "amarelo",
  "vermelho",
  "azul",
  "verde",
  "branco",
]);

const jogadorSchema = z.object({
  id: z.string(),
  tipo: z.literal("jogador"),
  x: z.number().min(0).max(400),
  y: z.number().min(0).max(200),
  numero: z.number().int().optional(),
  cor: corJogadorSchema,
  posicao: z.enum(["GR", "fixo", "ala", "pivo"]).optional(),
  // Equipa a que o jogador pertence (opcional; convenção da secção 11.3).
  equipa: z.enum(["propria", "adversario", "neutro"]).optional(),
});

const bolaSchema = z.object({
  id: z.string(),
  tipo: z.literal("bola"),
  x: z.number().min(0).max(400),
  y: z.number().min(0).max(200),
});

const coneSchema = z.object({
  id: z.string(),
  tipo: z.literal("cone"),
  x: z.number().min(0).max(400),
  y: z.number().min(0).max(200),
  // Ausente → laranja (default/retrocompatível).
  cor: corConeSchema.optional(),
});

const balizaSchema = z.object({
  id: z.string(),
  tipo: z.literal("baliza"),
  x: z.number().min(0).max(400),
  y: z.number().min(0).max(200),
  orientacao: z.enum(["horizontal", "vertical"]),
});

const setaSchema = z.object({
  id: z.string(),
  tipo: z.literal("seta"),
  estilo: z.enum(["movimento", "passe", "conducao"]),
  cor: z.string(),
  pontos: z.array(pontoSchema).min(2),
});

const linhaSchema = z.object({
  id: z.string(),
  tipo: z.literal("linha"),
  cor: z.string(),
  pontos: z.array(pontoSchema).min(2),
});

const textoSchema = z.object({
  id: z.string(),
  tipo: z.literal("texto"),
  x: z.number().min(0).max(400),
  y: z.number().min(0).max(200),
  conteudo: z.string().max(120),
});

// Tamanho da escadinha (nº de degraus derivado no render — secção 11.2).
const tamanhoEscadinhaSchema = z.enum(["pequena", "media", "grande"]);

// Escadinha de agilidade (escada de coordenação deitada no chão). Suporta
// rotação (`angulo`, graus 0–360) para o treinador a orientar no campo.
// `angulo`/`tamanho` têm default (media, 0°) — o editor coloca sempre valores
// explícitos, mas o default garante robustez na leitura.
const escadinhaSchema = z.object({
  id: z.string(),
  tipo: z.literal("escadinha"),
  x: z.number().min(0).max(400),
  y: z.number().min(0).max(200),
  angulo: z.number().min(0).max(360).default(0),
  tamanho: tamanhoEscadinhaSchema.default("media"),
});

// Barras para saltos (mini-barreiras/obstáculos). Suporta rotação (`angulo`).
const barrasSchema = z.object({
  id: z.string(),
  tipo: z.literal("barras"),
  x: z.number().min(0).max(400),
  y: z.number().min(0).max(200),
  angulo: z.number().min(0).max(360).default(0),
});

export const elementoCampoSchema = z.discriminatedUnion("tipo", [
  jogadorSchema,
  bolaSchema,
  coneSchema,
  balizaSchema,
  setaSchema,
  linhaSchema,
  textoSchema,
  escadinhaSchema,
  barrasSchema,
]);

// Passo de animação (secção 11.2 da bíblia): posições dos elementos neste passo.
const passoAnimacaoSchema = z.object({
  id: z.string(),
  ordem: z.number().int(),
  posicoes: z.array(
    z.object({ elementoId: z.string(), x: z.number(), y: z.number() }),
  ),
  duracaoMs: z.number().int().min(100).max(10000).optional(),
});

// Retrocompatível: versão 1 (estático) ou 2 (com passos opcionais).
export const diagramaSchema = z.object({
  versao: z.union([z.literal(1), z.literal(2)]),
  elementos: z.array(elementoCampoSchema),
  passos: z.array(passoAnimacaoSchema).optional(),
  // 🔁 v7 (§11.5): fundo de campo (futsal ou formato de futebol). Ausente/legado
  // → FUTSAL_5 (retrocompatível — Apêndice C). `TipoCampo` alinha com FormatoJogo.
  campo: z.nativeEnum(FormatoJogo).optional(),
});

export type PassoAnimacao = z.infer<typeof passoAnimacaoSchema>;

export type CorJogador = z.infer<typeof corJogadorSchema>;
export type CorCone = z.infer<typeof corConeSchema>;
export type Jogador = z.infer<typeof jogadorSchema>;
export type Bola = z.infer<typeof bolaSchema>;
export type Cone = z.infer<typeof coneSchema>;
export type Baliza = z.infer<typeof balizaSchema>;
export type Seta = z.infer<typeof setaSchema>;
export type Linha = z.infer<typeof linhaSchema>;
export type Texto = z.infer<typeof textoSchema>;
export type TamanhoEscadinha = z.infer<typeof tamanhoEscadinhaSchema>;
export type Escadinha = z.infer<typeof escadinhaSchema>;
export type Barras = z.infer<typeof barrasSchema>;
export type ElementoCampo = z.infer<typeof elementoCampoSchema>;
export type DiagramaCampo = z.infer<typeof diagramaSchema>;

export const DIAGRAMA_VAZIO: DiagramaCampo = { versao: 1, elementos: [] };

// Diagrama vazio no formato v2 (base + passos). O editor grava sempre v2.
export const DIAGRAMA_VAZIO_V2: DiagramaCampo = { versao: 2, elementos: [], passos: [] };

// ─── Bibliotecas 🎒 pessoal / 🏛️ clube (secções 3.3 e 4.2) ──────────────────

/** Parte do treino onde o exercício se aplica (secção 3.3). */
export const PARTES_TREINO = [
  "AQUECIMENTO",
  "PRINCIPAL",
  "JOGO_REDUZIDO",
  "RETORNO_CALMA",
] as const;

export type ParteTreinoValor = (typeof PARTES_TREINO)[number];

export const LABEL_PARTE_TREINO: Record<ParteTreinoValor, string> = {
  AQUECIMENTO: "Aquecimento",
  PRINCIPAL: "Parte principal",
  JOGO_REDUZIDO: "Jogo reduzido",
  RETORNO_CALMA: "Retorno à calma",
};

/**
 * Propriedade do conteúdo metodológico. Decidida pelo treinador no momento da
 * criação (toggle), NÃO por quem paga a licença — secção 4.2 (decisão definitiva).
 */
export const PROPRIEDADES_CONTEUDO = ["TREINADOR", "CLUBE"] as const;

export type PropriedadeConteudoValor = (typeof PROPRIEDADES_CONTEUDO)[number];

export const LABEL_PROPRIEDADE_CONTEUDO: Record<PropriedadeConteudoValor, string> = {
  TREINADOR: "Biblioteca pessoal",
  CLUBE: "Biblioteca do clube",
};

/** Fase da época de um template de sessão (secção 3.4). */
export const FASES_EPOCA = ["PREPARATORIO", "COMPETITIVO", "TRANSICAO"] as const;

export const LABEL_FASE_EPOCA: Record<(typeof FASES_EPOCA)[number], string> = {
  PREPARATORIO: "Preparatório",
  COMPETITIVO: "Competitivo",
  TRANSICAO: "Transição",
};

export const exercicioSchema = z.object({
  nome: z.string().min(1, "O nome é obrigatório").max(100),
  descricao: z.string().max(2000).optional(),
  objetivo: z.string().max(500).optional(),
  duracaoMin: z
    .number()
    .int()
    .min(1, "A duração deve ser pelo menos 1 minuto")
    .max(180, "A duração máxima é 180 minutos")
    .optional(),
  categoriaPrincipal: z
    .enum(["ATAQUE", "DEFESA", "TRANSICAO", "BOLAS_PARADAS", "FISICO", "GUARDA_REDES", "OUTRO"])
    .optional(),
  subcategoriaId: z.string().cuid().nullable().optional(),
  // F3: organização da biblioteca (secção 3.3).
  parteTreino: z.enum(PARTES_TREINO).optional(),
  escalaoAlvo: z.string().max(40, "Máximo 40 caracteres").optional(),
  // F3: toggle pessoal (default) vs clube na criação (secção 4.2).
  proprietario: z.enum(PROPRIEDADES_CONTEUDO).default("TREINADOR"),
  diagrama: diagramaSchema.optional(),
});

export type ExercicioInput = z.infer<typeof exercicioSchema>;

/** Toggle explícito de contribuição de um exercício pessoal para a biblioteca do clube. */
export const partilharExercicioSchema = z.object({
  exercicioId: z.string().cuid("Exercício inválido"),
});

export type PartilharExercicioInput = z.infer<typeof partilharExercicioSchema>;

// ─── Templates de sessão (secção 3.4) ───────────────────────────────────────

export const modeloSessaoExercicioSchema = z.object({
  exercicioId: z.string().cuid("Exercício inválido"),
  ordem: z.number().int().min(0).max(99),
  duracaoMin: z.number().int().min(1).max(180).optional(),
  notas: z.string().max(500).optional(),
  parteTreino: z.enum(PARTES_TREINO).optional(),
});

export const criarModeloSessaoSchema = z.object({
  nome: z.string().min(1, "O nome é obrigatório").max(120),
  descricao: z.string().max(2000).optional(),
  objetivoTatico: z.string().max(500).optional(),
  faseEpoca: z.enum(FASES_EPOCA).optional(),
  escalaoAlvo: z.string().max(40, "Máximo 40 caracteres").optional(),
  duracaoMin: z
    .number()
    .int()
    .min(1, "A duração deve ser pelo menos 1 minuto")
    .max(300, "A duração máxima é 300 minutos")
    .optional(),
  proprietario: z.enum(PROPRIEDADES_CONTEUDO).default("TREINADOR"),
  exercicios: z
    .array(modeloSessaoExercicioSchema)
    .min(1, "O template tem de ter pelo menos um exercício")
    .max(30, "Máximo de 30 exercícios por template")
    .refine(
      (lista) => new Set(lista.map((e) => e.ordem)).size === lista.length,
      "A ordem dos exercícios não pode repetir-se",
    ),
});

export type CriarModeloSessaoInput = z.infer<typeof criarModeloSessaoSchema>;

/** Criação de uma sessão de treino a partir de um template (cópia, sem ligação). */
export const criarSessaoDeTemplateSchema = z.object({
  modeloSessaoId: z.string().cuid("Template inválido"),
  escalaoId: z.string().cuid("Escalão inválido"),
  data: z.coerce.date(),
  epocaId: z.string().cuid("Época inválida").optional(),
});

export type CriarSessaoDeTemplateInput = z.infer<typeof criarSessaoDeTemplateSchema>;

// Re-exportado para retrocompatibilidade com imports que usavam LABEL_CATEGORIA/CATEGORIAS.
// Mapeia para o novo enum CategoriaExercicioPrincipal.
export { LABEL_CATEGORIA_PRINCIPAL as LABEL_CATEGORIA, CATEGORIAS_PRINCIPAIS as CATEGORIAS } from "@/lib/schemas/subcategoria";
