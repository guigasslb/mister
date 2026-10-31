/**
 * Votação secreta do capitão — apuramento (lógica pura, sem I/O).
 *
 * Recebe apenas a contagem agregada por atleta votado (nunca votos individuais
 * nem votantes) e determina: vencedor único, empate entre os mais votados, ou
 * ausência de votos. A contagem devolvida é ordenada por votos (desc) e, em
 * igualdade, por `atletaId` — ordem determinística que não reflete a ordem de
 * registo dos votos.
 */

export type ContagemVotosCapitao = { atletaId: string; votos: number };

export type ApuramentoVotacaoCapitao =
  | { tipo: "VENCEDOR"; vencedorAtletaId: string; contagem: ContagemVotosCapitao[] }
  | { tipo: "EMPATE"; empatados: string[]; contagem: ContagemVotosCapitao[] }
  | { tipo: "SEM_VOTOS"; contagem: ContagemVotosCapitao[] };

export function apurarVotacaoCapitao(
  contagens: ContagemVotosCapitao[],
): ApuramentoVotacaoCapitao {
  const contagem = contagens
    .filter((c) => c.votos > 0)
    .sort((a, b) => b.votos - a.votos || a.atletaId.localeCompare(b.atletaId));
  if (contagem.length === 0) return { tipo: "SEM_VOTOS", contagem };
  const maximo = contagem[0].votos;
  const lideres = contagem.filter((c) => c.votos === maximo).map((c) => c.atletaId);
  if (lideres.length === 1)
    return { tipo: "VENCEDOR", vencedorAtletaId: lideres[0], contagem };
  return { tipo: "EMPATE", empatados: lideres, contagem };
}
