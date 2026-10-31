import { z } from "zod";

/**
 * Voto na votação secreta do capitão. Ninguém vota em si próprio. A pertença de
 * ambos à convocatória do jogo e a unicidade do voto são validadas pela action.
 */
export const registarVotoCapitaoSchema = z
  .object({
    votanteId: z.string().cuid("Votante inválido"),
    votadoId: z.string().cuid("Atleta votado inválido"),
  })
  .refine((v) => v.votanteId !== v.votadoId, {
    message: "Não é possível votar em si próprio.",
    path: ["votadoId"],
  });

export type RegistarVotoCapitaoInput = z.infer<typeof registarVotoCapitaoSchema>;

/** Escolha do treinador em caso de empate (só aceita um dos empatados — action). */
export const escolherVencedorVotacaoSchema = z.object({
  atletaId: z.string().cuid("Atleta inválido"),
});

export type EscolherVencedorVotacaoInput = z.infer<typeof escolherVencedorVotacaoSchema>;
