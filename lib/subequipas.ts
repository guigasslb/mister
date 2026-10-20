import type { Prisma } from "@prisma/client";

/**
 * Subequipas por competição (§23.11) — regras puras partilhadas pelas actions de
 * jogos, competições e analíticos. Sem `"use server"` nem Prisma (testável isolado).
 *
 * Uma competição pode ter várias equipas próprias (`EquipaCompeticao` `PROPRIO`, ex.:
 * «Benjamins A»/«Benjamins B») do mesmo escalão-mãe. Com 0 ou 1 equipa própria o
 * comportamento é o anterior (jogos com `equipaCompeticaoId = null`).
 */

/**
 * Ordem estável das equipas próprias de uma competição: a primeira é a equipa
 * implícita dos jogos sem subequipa (`equipaCompeticaoId = null`).
 */
export const ORDEM_EQUIPAS_PROPRIAS: Prisma.EquipaCompeticaoOrderByWithRelationInput[] = [
  { criadoEm: "asc" },
  { id: "asc" },
];

export type ValidacaoSubequipa =
  | { ok: true; equipaCompeticaoId: string | null }
  | { ok: false; erro: string };

/**
 * Regra 1 (§23.11.3): valida a subequipa indicada para um jogo face às equipas
 * próprias da competição. Sem competição ⇒ sem subequipa. Com ≥2 equipas próprias
 * a subequipa é obrigatória; quando indicada tem de ser uma equipa própria da
 * competição. Com 0/1 equipa própria é opcional (comportamento anterior).
 */
export function validarSubequipaJogo(
  competicaoId: string | null | undefined,
  equipaCompeticaoId: string | null | undefined,
  idsEquipasProprias: string[],
): ValidacaoSubequipa {
  if (!competicaoId) {
    if (equipaCompeticaoId)
      return { ok: false, erro: "A equipa só pode ser indicada num jogo de competição" };
    return { ok: true, equipaCompeticaoId: null };
  }
  if (equipaCompeticaoId) {
    if (!idsEquipasProprias.includes(equipaCompeticaoId))
      return { ok: false, erro: "A equipa indicada não é uma equipa própria desta competição" };
    return { ok: true, equipaCompeticaoId };
  }
  if (idsEquipasProprias.length >= 2)
    return { ok: false, erro: "Indica a equipa: esta competição tem várias equipas próprias" };
  return { ok: true, equipaCompeticaoId: null };
}

/** Mensagem (campo `adversario`) para um A vs B criado à mão em /jogos. */
export const ERRO_JOGO_ENTRE_SUBEQUIPAS =
  "Jogo entre subequipas: cria-o a partir do confronto na competição.";

/**
 * §23.11.3 regra 5: um jogo não ligado a confronto cujo adversário é OUTRA
 * subequipa própria da competição (com ≥2) é um A vs B criado à mão — tem de
 * nascer do confronto (dois jogos), senão contaria a dobrar na classificação.
 */
export function adversarioEhOutraSubequipa(
  adversario: string,
  equipaCompeticaoId: string | null | undefined,
  proprias: { id: string; nome: string }[],
): boolean {
  if (proprias.length < 2) return false;
  const alvo = adversario.trim().toLowerCase();
  return proprias.some((p) => p.id !== equipaCompeticaoId && p.nome.trim().toLowerCase() === alvo);
}

/** Seleção Prisma necessária para `ehJogoInterno`. */
export const SELECT_JOGO_INTERNO = {
  equipaCompeticaoId: true,
  resultadoCompeticao: {
    select: { jogosDetalhados: { select: { equipaCompeticaoId: true } } },
  },
} satisfies Prisma.JogoSelect;

export type JogoParaInterno = {
  equipaCompeticaoId?: string | null;
  resultadoCompeticao?: { jogosDetalhados: { equipaCompeticaoId: string | null }[] } | null;
};

/**
 * Jogo interno (§23.11.3 regras 5 e 10): jogo de uma subequipa cujo confronto tem
 * também o jogo de OUTRA subequipa (A vs B). Excluído dos totais de equipa do
 * escalão; para os atletas conta normalmente. Jogos sem subequipa nunca são internos.
 */
export function ehJogoInterno(j: JogoParaInterno): boolean {
  const propria = j.equipaCompeticaoId;
  if (!propria || !j.resultadoCompeticao) return false;
  return j.resultadoCompeticao.jogosDetalhados.some(
    (o) => o.equipaCompeticaoId !== null && o.equipaCompeticaoId !== propria,
  );
}

type Placar = { golosMarcados: number | null; golosSofridos: number | null };

/**
 * Regra 6 (§23.11.3): os dois jogos de um confronto interno registam o placar cada
 * um na sua perspetiva; divergem quando ambos têm resultado completo e os golos
 * marcados de um não são os sofridos do outro (e vice-versa). Prevalece no
 * confronto o último gravado; a UI mostra o aviso.
 */
export function placarDivergente(a: Placar, b: Placar): boolean {
  if (a.golosMarcados === null || a.golosSofridos === null) return false;
  if (b.golosMarcados === null || b.golosSofridos === null) return false;
  return a.golosMarcados !== b.golosSofridos || a.golosSofridos !== b.golosMarcados;
}

const normNome = (s: string) => s.trim().toLowerCase();

type SubequipaRef = { id: string; nome: string };

/**
 * Regra 3 (§23.11.3): correspondência entre as subequipas da competição de destino
 * e as de origem, por nome (case-insensitive, com trim). Subequipas sem
 * correspondência não entram no resultado (ficam inalteradas).
 */
export function corresponderSubequipas(
  destino: SubequipaRef[],
  origem: SubequipaRef[],
): { destinoId: string; origemId: string }[] {
  const porNome = new Map(origem.map((o) => [normNome(o.nome), o.id]));
  return destino.flatMap((d) => {
    const origemId = porNome.get(normNome(d.nome));
    return origemId ? [{ destinoId: d.id, origemId }] : [];
  });
}
