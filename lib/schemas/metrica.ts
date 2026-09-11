import { z } from "zod";
import { TipoMetrica, ContextoMetrica } from "@prisma/client";

export const metricaSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório").max(60, "Máximo 60 caracteres"),
  tipo: z.nativeEnum(TipoMetrica),
  contexto: z.nativeEnum(ContextoMetrica).default(ContextoMetrica.JOGO),
});

export type MetricaInput = z.infer<typeof metricaSchema>;

export const LABEL_TIPO: Record<TipoMetrica, string> = {
  NUMERO: "Número",
  BOOLEANO: "Sim/Não",
  ESCALA: "Escala 1-5",
};

export const LABEL_CONTEXTO: Record<ContextoMetrica, string> = {
  JOGO: "Jogos",
  TREINO: "Treinos",
  AMBOS: "Jogos e treinos",
};

// §8.20: valores de métricas de uma sessão de treino, por atleta.
export const guardarMetricasSessaoSchema = z.array(
  z.object({
    atletaId: z.string().min(1),
    valores: z.array(
      z.object({
        metricaId: z.string().min(1),
        valor: z.number().int(),
      }),
    ),
  }),
);

export type GuardarMetricasSessaoInput = z.infer<typeof guardarMetricasSessaoSchema>;
