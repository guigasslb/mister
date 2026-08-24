import { z } from "zod";
import {
  TipoManoMano,
  AmbitoManoMano,
  FormatoTorneioManoMano,
  FormatoDuelo,
  TipoParticipante,
  EstadoManoMano,
} from "@prisma/client";

// ─────────────────────────────────────────────
// Mano-a-Mano — duelos 1×1 (§3.16)
// ─────────────────────────────────────────────

export const LABEL_TIPO_MANO_MANO: Record<TipoManoMano, string> = {
  LIGA_ANUAL: "Liga anual",
  TORNEIO: "Torneio",
};

export const LABEL_AMBITO_MANO_MANO: Record<AmbitoManoMano, string> = {
  INTRA_CLUBE: "Intra-clube",
  INTER_CLUBES: "Inter-clubes",
};

export const LABEL_FORMATO_TORNEIO_MANO_MANO: Record<FormatoTorneioManoMano, string> = {
  ELIMINATORIO: "Eliminatório",
  ROUND_ROBIN: "Todos-contra-todos",
};

export const LABEL_FORMATO_DUELO: Record<FormatoDuelo, string> = {
  PRIMEIRO_A_DOIS: "Primeiro a 2 golos",
  MELHOR_DE_2_JOGOS: "Melhor de 2 jogos",
  TEMPO_LIMITE: "Tempo limite",
};

export const LABEL_ESTADO_MANO_MANO: Record<EstadoManoMano, string> = {
  ATIVA: "Ativa",
  CONCLUIDA: "Concluída",
  ARQUIVADA: "Arquivada",
};

// ─────────────────────────────────────────────
// Competições
// ─────────────────────────────────────────────

export const criarCompeticaoSchema = z
  .object({
    nome: z.string().trim().min(1, "O nome é obrigatório").max(100),
    tipo: z.nativeEnum(TipoManoMano),
    ambito: z.nativeEnum(AmbitoManoMano).default(AmbitoManoMano.INTRA_CLUBE),
    formatoTorneio: z.nativeEnum(FormatoTorneioManoMano).optional(),
    formatoDuelo: z.nativeEnum(FormatoDuelo).default(FormatoDuelo.PRIMEIRO_A_DOIS),
    golosParaVencer: z.number().int().min(1, "Mínimo 1 golo").max(50).default(2),
    duracaoLimiteMin: z.number().int().positive().max(240).optional(),
    pontosVitoria: z.number().int().min(0).max(10).default(3),
    pontosEmpate: z.number().int().min(0).max(10).default(1),
    pontosDerrota: z.number().int().min(0).max(10).default(0),
    integraTreinos: z.boolean().default(false),
    escalaoId: z.string().cuid("Escalão inválido").optional(),
  })
  .superRefine((dados, ctx) => {
    if (dados.tipo === TipoManoMano.TORNEIO && !dados.formatoTorneio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["formatoTorneio"],
        message: "Indica o formato do torneio.",
      });
    }
    if (dados.formatoDuelo === FormatoDuelo.TEMPO_LIMITE && !dados.duracaoLimiteMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["duracaoLimiteMin"],
        message: "Indica a duração limite (minutos).",
      });
    }
  });

export const atualizarCompeticaoSchema = z
  .object({
    nome: z.string().trim().min(1, "O nome é obrigatório").max(100),
    tipo: z.nativeEnum(TipoManoMano),
    ambito: z.nativeEnum(AmbitoManoMano),
    formatoTorneio: z.nativeEnum(FormatoTorneioManoMano).nullable(),
    formatoDuelo: z.nativeEnum(FormatoDuelo),
    golosParaVencer: z.number().int().min(1).max(50),
    duracaoLimiteMin: z.number().int().positive().max(240).nullable(),
    pontosVitoria: z.number().int().min(0).max(10),
    pontosEmpate: z.number().int().min(0).max(10),
    pontosDerrota: z.number().int().min(0).max(10),
    integraTreinos: z.boolean(),
    escalaoId: z.string().cuid("Escalão inválido").nullable(),
  })
  .partial();

// ─────────────────────────────────────────────
// Participantes
// ─────────────────────────────────────────────

export const adicionarParticipanteSchema = z
  .object({
    tipo: z.nativeEnum(TipoParticipante),
    atletaId: z.string().cuid("Atleta inválido").optional(),
    atletaExternoNome: z.string().trim().min(1).max(100).optional(),
    clubeExternoId: z.string().cuid("Clube externo inválido").optional(),
    seed: z.number().int().positive().max(999).optional(),
  })
  .superRefine((dados, ctx) => {
    if (dados.tipo === TipoParticipante.ATLETA && !dados.atletaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["atletaId"],
        message: "Seleciona o atleta.",
      });
    }
    if (dados.tipo === TipoParticipante.EXTERNO && !dados.atletaExternoNome) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["atletaExternoNome"],
        message: "Indica o nome do participante externo.",
      });
    }
  });

// ─────────────────────────────────────────────
// Duelos (matches)
// ─────────────────────────────────────────────

export const agendarDueloSchema = z.object({
  data: z.coerce.date().optional().nullable(),
  local: z.string().trim().max(100).optional().nullable(),
  sessaoId: z.string().cuid("Sessão inválida").optional().nullable(),
});

/**
 * Registo de resultado de um duelo. `formatoDuelo` e `golosParaVencer` são
 * injetados pela action a partir da competição (fonte de verdade) — nunca vêm
 * do cliente. No formato PRIMEIRO_A_DOIS só é válido um placar em que um lado
 * atinge exatamente `golosParaVencer` e o outro fica abaixo (ex: 2-0 ou 2-1).
 */
export const registarResultadoSchema = z
  .object({
    golosA: z.number().int().min(0).max(99),
    golosB: z.number().int().min(0).max(99),
    formatoDuelo: z.nativeEnum(FormatoDuelo).optional(),
    golosParaVencer: z.number().int().min(1).max(50).optional(),
  })
  .superRefine((dados, ctx) => {
    const formato = dados.formatoDuelo ?? FormatoDuelo.PRIMEIRO_A_DOIS;
    if (formato !== FormatoDuelo.PRIMEIRO_A_DOIS) return;

    const alvo = dados.golosParaVencer ?? 2;
    const { golosA, golosB } = dados;
    const valido =
      (golosA === alvo && golosB < alvo) || (golosB === alvo && golosA < alvo);
    if (!valido) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["golosA"],
        message: `Resultado inválido: um dos lados tem de ter exatamente ${alvo} golos e o outro menos.`,
      });
    }
  });

export const criarDueloAdHocSchema = z
  .object({
    competicaoId: z.string().cuid("Competição inválida"),
    participanteAId: z.string().cuid("Participante inválido"),
    participanteBId: z.string().cuid("Participante inválido"),
    sessaoId: z.string().cuid("Sessão inválida").optional().nullable(),
    data: z.coerce.date().optional().nullable(),
  })
  .superRefine((dados, ctx) => {
    if (dados.participanteAId === dados.participanteBId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participanteBId"],
        message: "Os dois participantes têm de ser diferentes.",
      });
    }
  });

// ─────────────────────────────────────────────
// Fixtures / bracket
// ─────────────────────────────────────────────

export const gerarFixturesSchema = z.object({
  duasMaos: z.boolean().default(false),
  dataInicio: z.coerce.date().optional(),
});

// ─────────────────────────────────────────────
// Clubes externos
// ─────────────────────────────────────────────

export const criarClubeExternoSchema = z.object({
  nome: z.string().trim().min(1, "O nome é obrigatório").max(100),
  localidade: z.string().trim().max(100).optional(),
});

export type CriarCompeticaoManoManoInput = z.infer<typeof criarCompeticaoSchema>;
export type AtualizarCompeticaoManoManoInput = z.infer<typeof atualizarCompeticaoSchema>;
export type AdicionarParticipanteInput = z.infer<typeof adicionarParticipanteSchema>;
export type AgendarDueloInput = z.infer<typeof agendarDueloSchema>;
export type RegistarResultadoManoManoInput = z.infer<typeof registarResultadoSchema>;
export type CriarDueloAdHocInput = z.infer<typeof criarDueloAdHocSchema>;
export type GerarFixturesInput = z.infer<typeof gerarFixturesSchema>;
export type CriarClubeExternoInput = z.infer<typeof criarClubeExternoSchema>;
