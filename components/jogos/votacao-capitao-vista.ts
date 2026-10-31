import type { ConvocadoVotacaoCapitao } from "@/lib/actions/votacao-capitao";
import type { ApuramentoVotacaoCapitao } from "@/lib/votacao-capitao";

/**
 * Votação secreta do capitão — derivações puras para o ecrã (sem I/O).
 * Só usa participação (`jaVotou`), `votavel` (titular) e, com a votação FECHADA,
 * a contagem agregada.
 */

/** Progresso da participação: quantos votaram e quem falta (nunca em quem). */
export function progressoVotacao(convocados: ConvocadoVotacaoCapitao[]): {
  votaram: number;
  total: number;
  emFalta: ConvocadoVotacaoCapitao[];
} {
  const emFalta = convocados.filter((c) => !c.jaVotou);
  return { votaram: convocados.length - emFalta.length, total: convocados.length, emFalta };
}

/** Convocados que podem ser votados (só os titulares — 5 inicial). */
export function votaveis(convocados: ConvocadoVotacaoCapitao[]): ConvocadoVotacaoCapitao[] {
  return convocados.filter((c) => c.votavel);
}

/**
 * Candidatos de um votante: os titulares (`votavel`) exceto o próprio — todos os
 * convocados votam, mas ninguém vota em si.
 */
export function candidatosVoto(
  convocados: ConvocadoVotacaoCapitao[],
  votanteId: string,
): ConvocadoVotacaoCapitao[] {
  return convocados.filter((c) => c.votavel && c.atletaId !== votanteId);
}

export type LinhaResultadoVotacao = { atletaId: string; nome: string; votos: number };

/**
 * Linhas do resultado: só atletas com votos, pela ordem do apuramento. Um votado
 * que entretanto saiu da convocatória aparece como «Atleta».
 */
export function linhasResultadoVotacao(
  apuramento: ApuramentoVotacaoCapitao,
  convocados: ConvocadoVotacaoCapitao[],
): LinhaResultadoVotacao[] {
  const nomes = new Map(convocados.map((c) => [c.atletaId, c.nome]));
  return apuramento.contagem
    .filter((c) => c.votos > 0)
    .map((c) => ({ atletaId: c.atletaId, nome: nomes.get(c.atletaId) ?? "Atleta", votos: c.votos }));
}
