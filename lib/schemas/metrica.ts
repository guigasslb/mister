import { z } from "zod";
import { TipoMetrica, ContextoMetrica } from "@prisma/client";

export const metricaSchema = z
  .object({
    nome: z.string().min(1, "Nome obrigatório").max(60, "Máximo 60 caracteres"),
    tipo: z.nativeEnum(TipoMetrica),
    contexto: z.nativeEnum(ContextoMetrica).default(ContextoMetrica.JOGO),
    // §8.24.3: métrica técnica exclusiva de guarda-redes. Só faz sentido em
    // métricas de treino (contexto TREINO/AMBOS); em contexto JOGO é sempre false.
    aplicaSoGuardaRedes: z.boolean().default(false),
  })
  .transform((dados) => ({
    ...dados,
    aplicaSoGuardaRedes:
      dados.contexto === ContextoMetrica.JOGO ? false : dados.aplicaSoGuardaRedes,
  }));

export type MetricaInput = z.infer<typeof metricaSchema>;

export const LABEL_TIPO: Record<TipoMetrica, string> = {
  NUMERO: "Número",
  BOOLEANO: "Sim/Não",
  ESCALA: "Escala 1-5",
  ESCALA_1_3: "Escala 1–3",
};

export const LABEL_CONTEXTO: Record<ContextoMetrica, string> = {
  JOGO: "Jogos",
  TREINO: "Treinos",
  AMBOS: "Jogos e treinos",
};

/**
 * Limites de valor das métricas de escala. Fonte única partilhada cliente/servidor:
 * a grelha de input restringe o campo (max=…) e as Server Actions revalidam
 * («não confia na UI»). ESCALA = 1..5; ESCALA_1_3 = 1..3.
 */
export const LIMITES_ESCALA = {
  ESCALA: { min: 1, max: 5 },
  ESCALA_1_3: { min: 1, max: 3 },
} as const satisfies Partial<Record<TipoMetrica, { min: number; max: number }>>;

/**
 * Valida o valor de uma métrica em função do seu tipo (§8.4). Aplica os limites
 * de domínio por tipo:
 *  - NUMERO      → inteiro ≥ 0
 *  - BOOLEANO    → 0 ou 1
 *  - ESCALA      → 1..5 (inclusivo)
 *  - ESCALA_1_3  → 1..3 (inclusivo)
 * Devolve `true` se o valor é aceitável para o tipo. Usada no servidor (nas
 * Server Actions que gravam `ValorMetrica`/`ValorMetricaSessao`) para revalidar
 * o que a UI submete.
 */
export function valorMetricaValido(tipo: TipoMetrica, valor: number): boolean {
  if (!Number.isInteger(valor)) return false;
  switch (tipo) {
    case TipoMetrica.NUMERO:
      return valor >= 0;
    case TipoMetrica.BOOLEANO:
      return valor === 0 || valor === 1;
    case TipoMetrica.ESCALA:
      return valor >= LIMITES_ESCALA.ESCALA.min && valor <= LIMITES_ESCALA.ESCALA.max;
    case TipoMetrica.ESCALA_1_3:
      return valor >= LIMITES_ESCALA.ESCALA_1_3.min && valor <= LIMITES_ESCALA.ESCALA_1_3.max;
    default:
      return false;
  }
}

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
