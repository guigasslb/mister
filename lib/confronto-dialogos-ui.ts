// ─────────────────────────────────────────────────────────────────────────────
// Lógica PURA dos diálogos de edição/remoção de confrontos e de competições
// (§23.6 regra R3, decisões D1–D3). Sem React nem I/O — testável em Node.
// ─────────────────────────────────────────────────────────────────────────────

import {
  LABEL_MOTIVO_DADOS,
  type ImpactoRemocaoJogos,
  type MotivoDados,
} from "@/lib/remocao-jogos-competicao";
import type { DecisaoConvocatoria, DecisaoJogosComDados } from "@/lib/schemas/competicao";
import { eErroImpactoDesatualizado } from "@/lib/erros-impacto-confronto";

export type { DecisaoConvocatoria, DecisaoJogosComDados };

/** «estatísticas», «estatísticas e relatório», «a, b e c». */
export function listarMotivos(motivos: MotivoDados[]): string {
  const rotulos = motivos.map((m) => LABEL_MOTIVO_DADOS[m]);
  if (rotulos.length <= 1) return rotulos.join("");
  return `${rotulos.slice(0, -1).join(", ")} e ${rotulos[rotulos.length - 1]}`;
}

export function totalJogosImpacto(impacto: ImpactoRemocaoJogos): number {
  return impacto.vazios.length + impacto.comConvocatoria.length + impacto.comDados.length;
}

/** Jogos que ficam em /jogos: os com dados + os com convocatória mantidos. */
export function jogosQueSobram(
  impacto: ImpactoRemocaoJogos,
  convocatoria: DecisaoConvocatoria | null,
): number {
  return impacto.comDados.length + (convocatoria === "MANTER" ? impacto.comConvocatoria.length : 0);
}

export function pedeDecisaoConvocatoria(impacto: ImpactoRemocaoJogos): boolean {
  return impacto.comConvocatoria.length > 0;
}

/** D1: a pergunta «Manter/Retirar da competição» só aparece quando há jogos que sobram. */
export function pedeDecisaoDados(
  impacto: ImpactoRemocaoJogos,
  convocatoria: DecisaoConvocatoria | null,
): boolean {
  return jogosQueSobram(impacto, convocatoria) > 0;
}

/** Todas as perguntas visíveis têm resposta (sem pré-seleção — D1). */
export function decisoesCompletas(
  impacto: ImpactoRemocaoJogos,
  convocatoria: DecisaoConvocatoria | null,
  dados: DecisaoJogosComDados | null,
): boolean {
  if (pedeDecisaoConvocatoria(impacto) && convocatoria === null) return false;
  if (pedeDecisaoDados(impacto, convocatoria) && dados === null) return false;
  return true;
}

/** Campos de decisão a enviar à action — só os que se aplicam a este impacto. */
export function payloadDecisoes(
  impacto: ImpactoRemocaoJogos,
  convocatoria: DecisaoConvocatoria | null,
  dados: DecisaoJogosComDados | null,
): { jogosComConvocatoria?: DecisaoConvocatoria; jogosComDados?: DecisaoJogosComDados } {
  return {
    ...(pedeDecisaoConvocatoria(impacto) && convocatoria ? { jogosComConvocatoria: convocatoria } : {}),
    ...(pedeDecisaoDados(impacto, convocatoria) && dados ? { jogosComDados: dados } : {}),
  };
}

// ── Editar confronto (D3) ────────────────────────────────────────────────────

export type EquipaOpcao = { id: string; nome: string };

function normalizar(nome: string): string {
  return nome.trim().toLocaleLowerCase("pt");
}

/**
 * Identidade de um lado do confronto: a FK; sem FK (confrontos do wizard/gerador),
 * a equipa da competição com o mesmo nome (case-insensitive, trim); `null` se a
 * equipa já não existir (removida da competição).
 */
export function resolverEquipaId(
  id: string | null,
  nome: string,
  equipas: EquipaOpcao[],
): string | null {
  if (id && equipas.some((e) => e.id === id)) return id;
  const alvo = normalizar(nome);
  return equipas.find((e) => normalizar(e.nome) === alvo)?.id ?? null;
}

/**
 * `troca` = só inversão casa↔visitante; `mudaEquipas` = o conjunto {casa, fora}
 * é diferente do atual (exige confirmação em confrontos com resultado — D3).
 */
export function classificarEdicao(
  atual: { casaId: string | null; foraId: string | null },
  nova: { casaId: string; foraId: string },
): { troca: boolean; mudaEquipas: boolean } {
  const troca =
    atual.casaId !== null &&
    atual.foraId !== null &&
    nova.casaId === atual.foraId &&
    nova.foraId === atual.casaId;
  const conjuntoAtual = new Set([atual.casaId, atual.foraId]);
  const mudaEquipas = !conjuntoAtual.has(nova.casaId) || !conjuntoAtual.has(nova.foraId);
  return { troca, mudaEquipas };
}

/** Opções do Select de jornada: 1…(máximo+1), com a ronda atual sempre incluída. */
export function opcoesRonda(rondaMaxima: number, atual: number | null = null): number[] {
  const limite = Math.max(rondaMaxima + 1, atual ?? 0, 1);
  return Array.from({ length: limite }, (_, i) => i + 1);
}

// ── Apagar competição (D2) ───────────────────────────────────────────────────

export type ResumoApagarCompeticao = {
  vazios: number;
  comConvocatoria: number;
  comDados: number;
  /** Há jogos que o botão «Apagar competição e jogos agendados» pode apagar. */
  doisBotoes: boolean;
};

export function resumoApagarCompeticao(impacto: ImpactoRemocaoJogos): ResumoApagarCompeticao {
  const vazios = impacto.vazios.length;
  const comConvocatoria = impacto.comConvocatoria.length;
  return {
    vazios,
    comConvocatoria,
    comDados: impacto.comDados.length,
    doisBotoes: vazios > 0 || comConvocatoria > 0,
  };
}

/** Sufixo do toast: « · 2 jogo(s) apagado(s)» (vazio sem jogos apagados). */
export function sufixoJogosApagados(n: number, onde = ""): string {
  return n > 0 ? ` · ${n} jogo(s) apagado(s)${onde}` : "";
}

/** «de Benjamins A» ou, sem subequipa, «contra Benfica». */
export function rotuloJogo(j: { equipa: string | null; adversario: string }): string {
  return j.equipa ? `de ${j.equipa}` : `contra ${j.adversario}`;
}

/**
 * A edição mexe em jogos de /jogos (⇒ 2.º passo do diálogo): há jogos que saem
 * do confronto, jogos com dados que mudam de adversário/lado, ou jogos a criar.
 */
export function edicaoTemImpacto(impacto: {
  saem: ImpactoRemocaoJogos;
  atualizados: { temDados: boolean }[];
  criaJogos: string[];
}): boolean {
  return (
    totalJogosImpacto(impacto.saem) > 0 ||
    impacto.atualizados.some((j) => j.temDados) ||
    impacto.criaJogos.length > 0
  );
}

// ── Ordem dos confrontos no separador «Confrontos» (R6) ──────────────────────

/**
 * Aplica a nova ordem de uma jornada à lista global (atualização otimista): as
 * posições ocupadas pelos ids de `novaJornada` são preenchidas por essa ordem;
 * as restantes ficam intactas.
 */
export function aplicarOrdemJornada(idsGlobais: string[], novaJornada: string[]): string[] {
  const daJornada = new Set(novaJornada);
  let i = 0;
  return idsGlobais.map((id) => (daJornada.has(id) ? novaJornada[i++] : id));
}

/** Ordena `itens` pela lista de ids (os ausentes ficam no fim, pela ordem original). */
export function ordenarPorIds<T extends { id: string }>(itens: T[], ids: string[]): T[] {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return itens
    .map((item, i) => ({ item, i }))
    .sort(
      (a, b) =>
        (pos.get(a.item.id) ?? ids.length + a.i) - (pos.get(b.item.id) ?? ids.length + b.i),
    )
    .map(({ item }) => item);
}

/**
 * Grupos por jornada pela ordem de chegada dentro de cada um; jornadas asc e o
 * grupo «Sem jornada» (`null`) no fim.
 */
export function agruparPorJornada<T extends { ronda: number | null }>(
  lista: T[],
): [number | null, T[]][] {
  const mapa = new Map<number | null, T[]>();
  for (const r of lista) {
    const g = mapa.get(r.ronda) ?? [];
    g.push(r);
    mapa.set(r.ronda, g);
  }
  return [...mapa.entries()].sort((a, b) => {
    if (a[0] === null) return 1;
    if (b[0] === null) return -1;
    return a[0] - b[0];
  });
}

/**
 * Vezes que a equipa joga na jornada (texto do aviso «joga N vezes»). Mesma
 * comparação de nomes de `avisosJornada` (trim, sem maiúsculas).
 */
export function vezesNaJornada(
  confrontos: { ronda: number | null; equipaCasa: string; equipaFora: string }[],
  ronda: number,
  equipa: string,
): number {
  const alvo = equipa.trim().toLowerCase();
  let n = 0;
  for (const c of confrontos) {
    if (c.ronda !== ronda) continue;
    if (c.equipaCasa.trim().toLowerCase() === alvo) n++;
    if (c.equipaFora.trim().toLowerCase() === alvo) n++;
  }
  return n;
}

/**
 * Apagar um confronto com resultado: efeito na classificação, coerente com D1 —
 * um jogo que fica na competição («Manter») e tem resultado continua a contar.
 */
export function textoClassificacaoApagar(
  impacto: ImpactoRemocaoJogos,
  convocatoria: DecisaoConvocatoria | null,
  dados: DecisaoJogosComDados | null,
): string {
  if (!pedeDecisaoDados(impacto, convocatoria) || dados === "DESASSOCIAR") {
    return "O resultado deixa de contar para a classificação.";
  }
  if (dados === "MANTER") {
    return "O resultado do confronto sai da classificação, mas o jogo que fica na competição continua a contar, se tiver resultado.";
  }
  return "O resultado do confronto sai da classificação; o jogo que fica só continua a contar se o mantiveres na competição.";
}

/**
 * Placar do aviso D3 a partir de `resultadoFinal` de `obterImpactoEditarConfronto`
 * (já reorientado pelo servidor): «3–1» ou «walkover a favor de X».
 */
export function textoResultadoFinal(
  r: { golosCasa: number | null; golosFora: number | null; walkoverVencedor: "CASA" | "FORA" | null },
  casa: string,
  fora: string,
): string {
  if (r.walkoverVencedor) return `walkover a favor de ${r.walkoverVencedor === "CASA" ? casa : fora}`;
  return `${r.golosCasa ?? 0}–${r.golosFora ?? 0}`;
}

/** Última resposta da pré-visualização D3, para a escolha de equipas `chave`. */
export type PreviaResultado<R> =
  | { chave: string; sucesso: true; resultado: R }
  | { chave: string; sucesso: false; erro: string };

/**
 * Estado da pré-visualização para a escolha atual: uma resposta de outra escolha
 * (ou nenhuma) conta como «a calcular»; um erro sai desse estado e permite tentar de novo.
 */
export function estadoPrevia<R>(
  previa: PreviaResultado<R> | null,
  chave: string,
): { tipo: "A_CALCULAR" } | { tipo: "ERRO"; erro: string } | { tipo: "OK"; resultado: R } {
  if (!previa || previa.chave !== chave) return { tipo: "A_CALCULAR" };
  return previa.sucesso
    ? { tipo: "OK", resultado: previa.resultado }
    : { tipo: "ERRO", erro: previa.erro };
}

/**
 * O servidor recusou porque o impacto mudou entre a pré-visualização e a gravação
 * (com `camposInvalidos` da decisão em falta, ou só a mensagem de corrida) — a UI
 * recalcula o impacto e volta a pedir as decisões.
 */
export function eCorridaImpacto(res: {
  erro: string;
  camposInvalidos?: Record<string, string>;
}): boolean {
  return (
    Boolean(res.camposInvalidos?.jogosComConvocatoria || res.camposInvalidos?.jogosComDados) ||
    eErroImpactoDesatualizado(res.erro)
  );
}
