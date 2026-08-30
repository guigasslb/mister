import type { BlocoTempo, FormatoJogo, Utilizacao } from "@prisma/client";

/**
 * Conversão de cada bloco de tempo em minutos (secção 10.1 da bíblia).
 * O registo do tempo de jogo é por bloco (não minuto-a-minuto); o tempo
 * acumulado da época soma estes valores. `NAO_JOGOU` = 0.
 *
 * Esta é a tabela BASE (futsal — `FUTSAL_5`), mantida para retrocompatibilidade
 * total: `blocoParaMinutos(bloco)` sem formato usa-a. Para futebol, o tempo por
 * bloco depende do formato — ver `MINUTOS_POR_PARTE` (§10.8).
 */
export const MINUTOS_POR_BLOCO: Record<BlocoTempo, number> = {
  JOGO_COMPLETO: 40,
  MEIA_PARTE: 20,
  BLOCO_10MIN: 10,
  BLOCO_5MIN: 5,
  NAO_JOGOU: 0,
};

/**
 * Minutos de UMA parte (meia parte) por formato de jogo (§10.8 / Apêndice B).
 * O "jogo completo" = 2 × este valor; a "meia parte" = este valor. Os blocos
 * curtos (`BLOCO_10MIN`/`BLOCO_5MIN`) são constantes em qualquer formato.
 *
 * ⚠️ Decisão da Fase 28 (§10.8 deixava em aberto): `MINUTOS_POR_BLOCO` passa a
 * depender do formato via esta tabela de minutos-por-parte. Optou-se por manter
 * o nome `MINUTOS_POR_BLOCO` (tabela de futsal, testada) e introduzir
 * `MINUTOS_POR_PARTE: Record<FormatoJogo, number>` para evitar colidir com o
 * export existente e preservar zero-regressão no futsal (FUTSAL_5 → 40/20).
 */
export const MINUTOS_POR_PARTE: Record<FormatoJogo, number> = {
  FUTSAL_5: 20, // 2 × 20 min
  FUTEBOL_3_3: 15, // formação / formato livre
  FUTEBOL_5_5: 20, // 2 × 20 min
  FUTEBOL_7: 25, // 2 × 25 min
  FUTEBOL_9: 35, // 2 × 35 min
  FUTEBOL_11: 45, // 2 × 45 min
};

/**
 * Nº de jogadores em campo por formato (inclui o guarda-redes). Alimenta o
 * limite de titulares do plano de dia de jogo (futsal = 5). Zero-regressão no
 * futsal; os formatos de futebol usam o seu número de campo real.
 */
export const JOGADORES_EM_CAMPO: Record<FormatoJogo, number> = {
  FUTSAL_5: 5,
  FUTEBOL_3_3: 3,
  FUTEBOL_5_5: 5,
  FUTEBOL_7: 7,
  FUTEBOL_9: 9,
  FUTEBOL_11: 11,
};

/**
 * Máximo de titulares previstos para um jogo. Deriva do formato quando definido;
 * sem formato, cai na modalidade (FUTEBOL → 11; caso contrário futsal → 5).
 */
export function maxTitulares(
  formato?: FormatoJogo | null,
  modalidade?: "FUTSAL" | "FUTEBOL",
): number {
  if (formato) return JOGADORES_EM_CAMPO[formato];
  return modalidade === "FUTEBOL" ? 11 : 5;
}

/** Tabela `bloco → minutos` para um formato concreto (derivada de `MINUTOS_POR_PARTE`). */
export function minutosPorBlocoDoFormato(formato: FormatoJogo): Record<BlocoTempo, number> {
  const parte = MINUTOS_POR_PARTE[formato];
  return {
    JOGO_COMPLETO: parte * 2,
    MEIA_PARTE: parte,
    BLOCO_10MIN: 10,
    BLOCO_5MIN: 5,
    NAO_JOGOU: 0,
  };
}

/**
 * Minutos correspondentes a um bloco de tempo. `null`/`undefined` (bloco não
 * registado) conta como 0 para o tempo acumulado. Função pura.
 *
 * `formato` (§10.8): quando ausente/`null`, usa a tabela base de futsal
 * (`MINUTOS_POR_BLOCO`) — retrocompatível. Quando indicado, usa os minutos por
 * parte do formato (`FUTSAL_5` continua a dar 40/20).
 */
export function blocoParaMinutos(
  bloco: BlocoTempo | null | undefined,
  formato?: FormatoJogo | null,
): number {
  if (bloco == null) return 0;
  if (formato == null) return MINUTOS_POR_BLOCO[bloco];
  return minutosPorBlocoDoFormato(formato)[bloco];
}

export interface EstatisticasAgregadas {
  jogosConvocado: number;
  jogosUtilizados: number;
  titularidades: number;
  totalGolos: number;
  totalAssistencias: number;
  totalMinutos: number | null;
  /** Σ dos blocos de tempo convertidos em minutos (secção 10.1). Sempre numérico. */
  tempoJogoAcumulado: number;
  totalDefesas: number | null;
  totalGolosSofridos: number | null;
  sessoesTotais: number;
  presencas: number;
  taxaPresenca: number;
}

export interface LinhaEstatistica {
  utilizacao: Utilizacao;
  minutos: number | null;
  /** Bloco de tempo de jogo (F5). Ausente/null = não registado (0 minutos). */
  blocoTempo?: BlocoTempo | null;
  /**
   * Formato do jogo desta linha (§10.8). Ausente/null = futsal base (`JOGO_COMPLETO=40`);
   * determina os minutos por bloco no `tempoJogoAcumulado` para jogos de futebol.
   */
  formato?: FormatoJogo | null;
  golos: number;
  assistencias: number;
  defesas: number | null;
  golosSofridosGR: number | null;
}

export interface EntradaAgregacao {
  eGR: boolean;
  jogosConvocado: number;
  sessoesTotais: number;
  presencas: number;
  estatisticas: LinhaEstatistica[];
}

/**
 * Agrega as estatísticas de um atleta na época (secção 15.2).
 * Função pura — toda a matemática de agregação vive aqui para ser testável sem BD.
 *
 * Regras:
 *  - `totalMinutos`: null se nenhum jogo tiver minutos registados (distingue "não registado" de "zero").
 *  - Estatísticas de GR (defesas, golos sofridos) só calculadas se `eGR`; caso contrário null.
 *  - `taxaPresenca`: presencas / sessoesTotais (0 se sessoesTotais = 0).
 *    ATRASADO conta como presença (já refletido em `presencas`); o divisor são as sessões
 *    desde o ingresso do atleta (calculado a montante — secção 22.3).
 */
export function agregarEstatisticas(entrada: EntradaAgregacao): EstatisticasAgregadas {
  const { eGR, jogosConvocado, sessoesTotais, presencas, estatisticas } = entrada;

  const jogosUtilizados = estatisticas.filter(
    (e) => e.utilizacao !== "NAO_UTILIZADO",
  ).length;
  const titularidades = estatisticas.filter((e) => e.utilizacao === "TITULAR").length;
  const totalGolos = estatisticas.reduce((acc, e) => acc + e.golos, 0);
  const totalAssistencias = estatisticas.reduce((acc, e) => acc + e.assistencias, 0);

  const minutosRegistados = estatisticas
    .map((e) => e.minutos)
    .filter((m): m is number => m != null);
  const totalMinutos = minutosRegistados.length
    ? minutosRegistados.reduce((acc, m) => acc + m, 0)
    : null;

  // Tempo de jogo acumulado a partir dos blocos (secção 10.1). Ao contrário de
  // `totalMinutos` (que distingue "não registado" de zero), este é sempre numérico.
  const tempoJogoAcumulado = estatisticas.reduce(
    (acc, e) => acc + blocoParaMinutos(e.blocoTempo ?? null, e.formato ?? null),
    0,
  );

  const totalDefesas = eGR
    ? estatisticas.reduce((acc, e) => acc + (e.defesas ?? 0), 0)
    : null;
  const totalGolosSofridos = eGR
    ? estatisticas.reduce((acc, e) => acc + (e.golosSofridosGR ?? 0), 0)
    : null;

  const taxaPresenca = sessoesTotais > 0 ? presencas / sessoesTotais : 0;

  return {
    jogosConvocado,
    jogosUtilizados,
    titularidades,
    totalGolos,
    totalAssistencias,
    totalMinutos,
    tempoJogoAcumulado,
    totalDefesas,
    totalGolosSofridos,
    sessoesTotais,
    presencas,
    taxaPresenca,
  };
}
