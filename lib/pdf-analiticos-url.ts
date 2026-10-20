/** Parâmetros do route handler `/api/pdf`: escalão (com filtros opcionais) ou clube. */
export type ParamsPdfAnaliticos =
  | { tipo: "escalao"; escalaoId: string; competicaoId?: string; equipaCompeticaoId?: string }
  | { tipo: "clube" };

/**
 * URL do relatório PDF dos analíticos. Os filtros só entram quando definidos
 * (`competicao`; `equipa` = subequipa — §23.11.3 regra 10); sem filtros o URL é
 * o de sempre.
 */
export function construirUrlPdfAnaliticos(params: ParamsPdfAnaliticos): string {
  const sp = new URLSearchParams({ tipo: params.tipo });
  if (params.tipo === "escalao") {
    sp.set("escalaoId", params.escalaoId);
    if (params.competicaoId) sp.set("competicao", params.competicaoId);
    if (params.equipaCompeticaoId) sp.set("equipa", params.equipaCompeticaoId);
  }
  return `/api/pdf?${sp.toString()}`;
}
