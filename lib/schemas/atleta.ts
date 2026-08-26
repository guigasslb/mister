import { z } from "zod";
import { Posicao, type Modalidade } from "@prisma/client";
import { TIPOS_PARTICIPACAO } from "@/lib/schemas/participacao";

// 🔁 v7 (§3.2): o enum de posições cobre FUTSAL + FUTEBOL. Deriva do enum do
// Prisma (`Posicao`) para ficar sempre em sincronia; o seletor da UI filtra as
// opções por modalidade (ver `posicoesPorModalidade`), mas o modelo do atleta
// guarda todas as posições (um atleta multi-desporto pode ter posições de ambas
// as modalidades — §3.2).
const posicaoEnum = z.nativeEnum(Posicao);

/**
 * Dados PESSOAIS do atleta (F1 — o atleta pertence ao clube, não ao escalão).
 * Escalão e número de camisola pertencem à participação (AtletaEscalao),
 * validados em `lib/schemas/participacao.ts`.
 */
export const atletaPessoalSchema = z.object({
  nome: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(100),
  dataNascimento: z.coerce.date().optional(),
  // Data de ingresso no clube (secção 10/22.3): divisor da taxa de presença.
  // Se ausente, usa-se criadoEm.
  dataIngresso: z.coerce.date().optional(),
  posicoes: z.array(posicaoEnum).default([]),
  observacoes: z.string().max(1000).optional(),
  // Segurança: `z.string().url()` aceita esquemas perigosos (javascript:, data:).
  // Restringir a http(s) — o URL alimenta um <img src> na UI.
  fotoUrl: z
    .string()
    .url("URL inválido")
    .max(500)
    .refine((url) => /^https?:\/\//i.test(url), { message: "URL inválido" })
    .optional()
    .or(z.literal("")),
  // Estado no plantel (secção 8): distingue quem está ativo de quem saiu ou
  // ainda está em período experimental. Opcional e SEM default de propósito: a
  // edição de dados pessoais (`atualizarAtleta`) não deve fazer reset do estado
  // — o ciclo de vida do `ativo` é gerido por ações dedicadas
  // (`toggleAtivoAtleta`, `apagarAtleta`). Na criação, o default `true` é
  // aplicado explicitamente em `criarAtleta`.
  ativo: z.boolean().optional(),
  // Inscrição federativa/no clube (secção 8 — plantel): editável no formulário do
  // atleta. Opcional; quando ausente, a action assume `false` (por inscrever).
  inscrito: z.boolean().optional(),
  encarregadoNome: z.string().max(100).optional(),
  encarregadoContacto: z.string().max(40).optional(),
  encarregadoEmail: z.string().email("Email inválido").optional().or(z.literal("")),
});

/** Edição de atleta: só dados pessoais. */
export const atualizarAtletaSchema = atletaPessoalSchema;

/** Criação de atleta: dados pessoais + participação inicial (escalão + número). */
export const criarAtletaSchema = atletaPessoalSchema.extend({
  participacaoInicial: z.object({
    escalaoId: z.string().cuid("Escalão inválido"),
    numero: z
      .number()
      .int()
      .min(1, "O número deve estar entre 1 e 999")
      .max(999, "O número deve estar entre 1 e 999")
      .optional(),
    tipo: z.enum(TIPOS_PARTICIPACAO).default("PRINCIPAL"),
  }),
});

/**
 * Hard-delete definitivo de um atleta (P1.3 — RGPD, direito ao apagamento).
 * O id é um cuid (convenção de IDs do projeto), não um uuid.
 */
export const apagarAtletaDefinitivamenteSchema = z.object({
  atletaId: z.string().cuid("Atleta inválido"),
});

/** Toggle do estado `ativo` do atleta (secção 8 — período experimental/saída). */
export const toggleAtivoAtletaSchema = z.object({
  atletaId: z.string().cuid("Atleta inválido"),
});

export type AtletaPessoalInput = z.infer<typeof atletaPessoalSchema>;
export type CriarAtletaInput = z.infer<typeof criarAtletaSchema>;

export const LABEL_POSICAO: Record<Posicao, string> = {
  // Partilhados / futsal
  GUARDA_REDES: "Guarda-redes",
  FIXO: "Fixo",
  ALA: "Ala",
  PIVO: "Pivô",
  UNIVERSAL: "Universal",
  // Futebol (§2.3/§3.2)
  DEFESA_CENTRAL: "Defesa central",
  LATERAL_DIREITO: "Lateral direito",
  LATERAL_ESQUERDO: "Lateral esquerdo",
  MEDIO_DEFENSIVO: "Médio defensivo",
  MEDIO_CENTRO: "Médio centro",
  MEDIO_OFENSIVO: "Médio ofensivo",
  EXTREMO_DIREITO: "Extremo direito",
  EXTREMO_ESQUERDO: "Extremo esquerdo",
  AVANCADO: "Avançado",
};

// 🔁 v7 (§3.2): posições por modalidade. GUARDA_REDES e UNIVERSAL são partilhados
// pelas duas modalidades; aparecem em ambas as listas.
export const POSICOES_FUTSAL: Posicao[] = [
  "GUARDA_REDES",
  "FIXO",
  "ALA",
  "PIVO",
  "UNIVERSAL",
];

export const POSICOES_FUTEBOL: Posicao[] = [
  "GUARDA_REDES",
  "DEFESA_CENTRAL",
  "LATERAL_DIREITO",
  "LATERAL_ESQUERDO",
  "MEDIO_DEFENSIVO",
  "MEDIO_CENTRO",
  "MEDIO_OFENSIVO",
  "EXTREMO_DIREITO",
  "EXTREMO_ESQUERDO",
  "AVANCADO",
  "UNIVERSAL",
];

/**
 * Posições disponíveis para uma modalidade (§3.2). Usado pelo seletor de posições
 * do formulário do atleta para mostrar apenas as posições relevantes à modalidade
 * do escalão em contexto. Sem modalidade definida (ex.: edição sem escalão em
 * contexto), devolve todas as posições, sem duplicar as partilhadas.
 */
export function posicoesPorModalidade(
  modalidade: Modalidade | null | undefined,
): Posicao[] {
  if (modalidade === "FUTSAL") return POSICOES_FUTSAL;
  if (modalidade === "FUTEBOL") return POSICOES_FUTEBOL;
  return [
    ...POSICOES_FUTSAL,
    ...POSICOES_FUTEBOL.filter((p) => !POSICOES_FUTSAL.includes(p)),
  ];
}

export const ABREV_POSICAO: Record<Posicao, string> = {
  // Partilhados / futsal
  GUARDA_REDES: "GR",
  FIXO: "Fixo",
  ALA: "Ala",
  PIVO: "Pivô",
  UNIVERSAL: "Univ.",
  // Futebol (§2.3/§3.2)
  DEFESA_CENTRAL: "DC",
  LATERAL_DIREITO: "LD",
  LATERAL_ESQUERDO: "LE",
  MEDIO_DEFENSIVO: "MD",
  MEDIO_CENTRO: "MC",
  MEDIO_OFENSIVO: "MO",
  EXTREMO_DIREITO: "ED",
  EXTREMO_ESQUERDO: "EE",
  AVANCADO: "AV",
};
