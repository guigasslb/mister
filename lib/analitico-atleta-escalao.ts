import type { Modalidade } from "@prisma/client";

/**
 * Decisão do escalão de contexto para o analítico do atleta no seu perfil
 * (§10.1 — histórico persistente). Helper puro, sem acesso a dados: recebe as
 * participações já lidas e devolve o `escalaoId` a passar a `obterAnaliticoAtleta`
 * (ou `undefined` para pedir a VISTA CONJUNTA de uma modalidade).
 *
 * Contexto do bug: quando um atleta muda de escalão a meio da época (ex.: sai
 * dos Benjamins e passa aos Infantis A), a participação de origem passa a
 * INATIVO/TRANSICAO mas NÃO é apagada — os treinos/jogos ficam ligados a esse
 * escalão. Se o perfil pedir o analítico limitado ao escalão ATIVO atual
 * (Infantis A), o histórico do escalão de onde saiu (Benjamins) desaparece e o
 * painel mostra «Sem jogos ou sessões registados nesta época». A vista conjunta
 * agrega todos os escalões da modalidade e recupera esse histórico.
 */

/** Participação mínima (qualquer estado) usada na decisão de contexto. */
export interface ParticipacaoEpocaMinima {
  escalaoId: string;
  epocaId: string;
}

export interface EscolhaEscalaoAnaliticoParams {
  /** Escalão de contexto ativo (participação principal/atual), se existir. */
  escalaoContextoAtivoId: string | undefined;
  /** Escalões com participação ATIVA do atleta na época em contexto. */
  escaloesAtivos: string[];
  /** Todas as participações do atleta (qualquer estado, qualquer época). */
  participacoes: ParticipacaoEpocaMinima[];
  /** Época em contexto (as participações de outras épocas são ignoradas). */
  epocaId: string;
  /** Modalidade do contexto ativo (`null` em escalões sem secção). */
  modalidadeCtx: Modalidade | null;
  /** Mapa `escalaoId → modalidade` (de `mapaModalidadePorEscalao`). */
  modalidadePorEscalao: Map<string, Modalidade | null>;
}

/**
 * Decide o escalão de contexto do analítico do perfil:
 *
 * - Se o atleta tem histórico de participação (qualquer estado) num escalão
 *   DIFERENTE dos seus escalões ativos, na MESMA modalidade e época — sinal de
 *   que mudou de escalão a meio da época — devolve `undefined` para forçar a
 *   VISTA CONJUNTA da modalidade (agrega todos os escalões e preserva o
 *   histórico do escalão de onde saiu).
 * - Caso contrário mantém o contexto do escalão ativo (`escalaoContextoAtivoId`),
 *   preservando a comparação com a média da equipa. Para os atletas que nunca
 *   mudaram de escalão o comportamento é EXATAMENTE o anterior (zero regressão).
 */
export function escolherEscalaoContextoAnalitico(
  params: EscolhaEscalaoAnaliticoParams,
): string | undefined {
  const ativos = new Set(params.escaloesAtivos);
  const temHistoricoNoutroEscalao = params.participacoes.some(
    (p) =>
      p.epocaId === params.epocaId &&
      !ativos.has(p.escalaoId) &&
      (params.modalidadePorEscalao.get(p.escalaoId) ?? null) ===
        params.modalidadeCtx,
  );
  return temHistoricoNoutroEscalao ? undefined : params.escalaoContextoAtivoId;
}
