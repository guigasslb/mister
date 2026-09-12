import { z } from "zod";
import {
  TipoJogo,
  FormatoCompeticao,
  FormatoJogo,
  AmbitoCompeticao,
  TipoParticipanteCompeticao,
  EstadoResultado,
  CasaFora,
} from "@prisma/client";

// ─────────────────────────────────────────────
// Competição (F6 — Fase 16 · P1.2 Gestão de Competições §23)
// ─────────────────────────────────────────────

// P1.2 (§23.3): campos de âmbito + pontuação configurável + walkover, partilhados
// pelos schemas de criação (simples e wizard completo). Todos com default → 100%
// retrocompatíveis: quem não os enviar mantém o comportamento anterior (3/1/0).
const configCompeticaoFields = {
  ambito: z.nativeEnum(AmbitoCompeticao).default(AmbitoCompeticao.PROPRIA),
  pontosVitoria: z.number().int().min(1).max(5).default(3),
  pontosEmpate: z.number().int().min(0).max(2).default(1),
  pontosDerrota: z.number().int().min(0).max(1).default(0),
  golosWalkover: z.number().int().min(1).max(9).default(3),
};

export const criarCompeticaoSchema = z.object({
  nome: z.string().min(1, "O nome é obrigatório").max(100),
  tipo: z.nativeEnum(TipoJogo).default(TipoJogo.OFICIAL),
  formato: z.nativeEnum(FormatoCompeticao).default(FormatoCompeticao.LIGA),
  escalaoId: z.string().cuid("Escalão inválido"),
  epocaId: z.string().cuid().optional(), // default = época ativa
  ...configCompeticaoFields,
});

export const atualizarCompeticaoSchema = criarCompeticaoSchema.partial().extend({
  id: z.string().cuid(),
});

// Golos opcionais/nullable: consistente com o schema Prisma (golosCasa/golosFora
// passaram a Int?) — um resultado pode ser registado sem golos (jogo agendado).
// A action deriva o `estado` (AGENDADO | REALIZADO) a partir da presença dos golos.
export const registarResultadoExternoSchema = z.object({
  competicaoId: z.string().cuid(),
  equipaCasa: z.string().min(1, "Indica a equipa da casa").max(100),
  equipaFora: z.string().min(1, "Indica a equipa visitante").max(100),
  golosCasa: z.number().int().min(0).max(99).nullable().optional(),
  golosFora: z.number().int().min(0).max(99).nullable().optional(),
  data: z.coerce.date().optional(),
});

/** Alias retrocompatível para o nome curto usado noutros contextos. */
export const registarResultadoSchema = registarResultadoExternoSchema;

// ─────────────────────────────────────────────
// P1.2 (§23) — Confrontos: registo, estado e ligação a jogo detalhado
// ─────────────────────────────────────────────

/**
 * Registo de um confronto (evolução de `registarResultadoExternoSchema`, §23.8).
 * As equipas identificam-se por FK (`equipaCasaId`/`equipaForaId`, participante já
 * existente) OU por nome (`equipaCasaNome`/`equipaForaNome`, criado on-the-fly como
 * participante EXTERNO na action). `competicaoId` é passado à action como parâmetro
 * separado (§23.8), não faz parte deste schema. WALKOVER exige `walkoverVencedor`.
 *
 * NOTA (retrocompatibilidade): `registarResultadoExternoSchema` mantém-se acima como
 * schema/alias independente — o seu contrato (equipaCasa/equipaFora, golos 0–99) é
 * preservado para não quebrar `registarResultadoExterno` nem o código/testes legados.
 */
export const registarConfrontoSchema = z
  .object({
    equipaCasaId: z.string().cuid().optional(),
    equipaForaId: z.string().cuid().optional(),
    equipaCasaNome: z.string().trim().min(1).max(100).optional(),
    equipaForaNome: z.string().trim().min(1).max(100).optional(),
    estado: z.nativeEnum(EstadoResultado).default(EstadoResultado.REALIZADO),
    walkoverVencedor: z.nativeEnum(CasaFora).optional(),
    golosCasa: z.number().int().min(0).max(99).optional(),
    golosFora: z.number().int().min(0).max(99).optional(),
  })
  .refine((d) => d.estado !== EstadoResultado.WALKOVER || d.walkoverVencedor != null, {
    message: "Indica o vencedor do walkover",
    path: ["walkoverVencedor"],
  });

/**
 * Definição do estado de um confronto (AGENDADO | REALIZADO | CANCELADO | WALKOVER).
 * WALKOVER exige `walkoverVencedor` (§23.7).
 */
export const definirEstadoConfrontoSchema = z
  .object({
    resultadoId: z.string().cuid(),
    estado: z.nativeEnum(EstadoResultado),
    walkoverVencedor: z.nativeEnum(CasaFora).optional(),
  })
  .refine((d) => d.estado !== EstadoResultado.WALKOVER || d.walkoverVencedor != null, {
    message: "Indica o vencedor do walkover",
    path: ["walkoverVencedor"],
  });

/** Ligação de um jogo detalhado (convocatória/estatísticas) a um confronto (§23.8). */
export const ligarJogoAConfrontoSchema = z.object({
  jogoId: z.string().cuid(),
  resultadoId: z.string().cuid(),
});

// ─────────────────────────────────────────────
// Equipas + quadro competitivo + agendamento
// ─────────────────────────────────────────────

/** Equipa participante numa competição (base do quadro competitivo). */
export const equipaCompeticaoSchema = z.object({
  nome: z.string().trim().min(1, "Indica o nome da equipa").max(100),
  posicao: z.number().int().positive().optional(),
  // P1.2 (§23.3): natureza do participante + vínculos opcionais (metadados).
  // Default EXTERNO → retrocompatível com o quadro competitivo já existente.
  tipo: z
    .nativeEnum(TipoParticipanteCompeticao)
    .default(TipoParticipanteCompeticao.EXTERNO),
  escalaoVinculadoId: z.string().cuid().optional(),
  clubeVinculadoId: z.string().cuid().optional(),
});

/**
 * Jogo pré-agendado (usado no wizard de criação e no update de agendamento).
 * `ronda` = jornada (LIGA) ou fase eliminatória (TORNEIO/TAÇA). `dataHora` opcional
 * (null = por definir).
 */
export const jogoAgendadoSchema = z.object({
  equipaCasa: z.string().trim().min(1, "Indica a equipa da casa"),
  equipaFora: z.string().trim().min(1, "Indica a equipa visitante"),
  ronda: z.number().int().positive().optional(),
  dataHora: z.coerce.date().optional().nullable(),
});

/** Criação completa de uma competição a partir do wizard (base + equipas + jogos). */
export const criarCompeticaoCompletaSchema = z.object({
  nome: z.string().trim().min(1, "O nome é obrigatório").max(100),
  tipo: z.nativeEnum(TipoJogo).default(TipoJogo.OFICIAL),
  formato: z.nativeEnum(FormatoCompeticao).default(FormatoCompeticao.LIGA),
  formatoJogo: z.nativeEnum(FormatoJogo).optional(),
  escalaoId: z.string().cuid("Escalão inválido"),
  equipas: z.array(equipaCompeticaoSchema).min(2, "Mínimo 2 equipas"),
  jogos: z.array(jogoAgendadoSchema).optional().default([]),
  duasMaos: z.boolean().default(false), // só LIGA
  ...configCompeticaoFields,
});

/** Atualização do agendamento (data/hora) de um jogo do quadro. */
export const atualizarAgendamentoSchema = z.object({
  resultadoId: z.string().cuid(),
  dataHora: z.coerce.date().optional().nullable(),
});

export const LABEL_FORMATO_COMPETICAO: Record<FormatoCompeticao, string> = {
  LIGA: "Liga",
  TORNEIO: "Torneio",
  TACA: "Taça",
};

// P1.2 (§23.2): rótulos de apresentação (pt-PT) para âmbito e tipo de participante.
export const LABEL_AMBITO_COMPETICAO: Record<AmbitoCompeticao, string> = {
  EXTERNA: "Externa",
  PROPRIA: "Própria",
};

export const LABEL_TIPO_PARTICIPANTE_COMPETICAO: Record<TipoParticipanteCompeticao, string> = {
  PROPRIO: "Equipa própria",
  CLUBE_MISTER: "Clube Mister",
  EXTERNO: "Externa",
};

// P1.6 (§23.7): rótulos de estado de um confronto (pt-PT), partilhados pela UI.
export const LABEL_ESTADO_RESULTADO: Record<EstadoResultado, string> = {
  AGENDADO: "Agendado",
  REALIZADO: "Realizado",
  CANCELADO: "Cancelado",
  WALKOVER: "Walkover",
};

/**
 * Alias retrocompatível: código anterior a F6 importa `competicaoSchema`.
 * Aponta para o schema de criação (superset com defaults — nome/tipo/escalaoId
 * mantêm-se, `formato` e `epocaId` são opcionais/têm default).
 */
export const competicaoSchema = criarCompeticaoSchema;

export type CriarCompeticaoInput = z.infer<typeof criarCompeticaoSchema>;
export type AtualizarCompeticaoInput = z.infer<typeof atualizarCompeticaoSchema>;
export type RegistarResultadoExternoInput = z.infer<typeof registarResultadoExternoSchema>;
export type EquipaCompeticaoInput = z.infer<typeof equipaCompeticaoSchema>;
export type JogoAgendadoInput = z.infer<typeof jogoAgendadoSchema>;
export type CriarCompeticaoCompletaInput = z.infer<typeof criarCompeticaoCompletaSchema>;
export type AtualizarAgendamentoInput = z.infer<typeof atualizarAgendamentoSchema>;
export type RegistarConfrontoInput = z.infer<typeof registarConfrontoSchema>;
export type DefinirEstadoConfrontoInput = z.infer<typeof definirEstadoConfrontoSchema>;
export type LigarJogoAConfrontoInput = z.infer<typeof ligarJogoAConfrontoSchema>;
/** Alias retrocompatível do tipo de input de competição. */
export type CompeticaoInput = CriarCompeticaoInput;

// ─────────────────────────────────────────────
// Scouting (mantido — usado por lib/actions/scouting.ts)
// ─────────────────────────────────────────────

export const observacaoAdversarioSchema = z.object({
  equipa: z.string().min(1, "Indica a equipa").max(100),
  escalaoId: z.string().cuid().nullable().optional(),
  // F5 (M15): scouting contextualizado num jogo específico (dia de jogo) ou avulso.
  jogoId: z.string().cuid().nullable().optional(),
  jogoObservado: z.string().max(100).optional(),
  competicao: z.string().max(100).optional(),
  sistemaTatico: z.string().max(100).optional(),
  pontosFortes: z.string().max(2000).optional(),
  pontosFracos: z.string().max(2000).optional(),
  notas: z.string().max(2000).optional(),
});

export type ObservacaoAdversarioInput = z.infer<typeof observacaoAdversarioSchema>;
