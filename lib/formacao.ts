import type { FormatoJogo, Modalidade, Posicao } from "@prisma/client";
import type { DiagramaCampo, Jogador } from "@/lib/schemas/exercicio";

/**
 * Formação do plano de dia de jogo (§11.5): distribui os titulares no campo
 * (espaço 400×200). Lógica pura e testável, partilhada pelo quadro tático
 * (`PlanoTatico` → `QuadroTaticoJogo`) e pela ação "Repor formação".
 *
 * Regra-chave (correção): **todos** os titulares aparecem no campo. Quem não tem
 * posição prevista é colocado numa **posição padrão** livre da formação da
 * modalidade/formato, para nunca ficar de fora do diagrama.
 */

/** Titular a posicionar no campo. `posicao` a `null` → recebe uma posição padrão. */
export type TitularFormacao = {
  id: string;
  numero: number | null;
  posicao: Posicao | null;
};

/** Linha de formação: sector + coordenada x no espaço 400×200 do campo (§11.5). */
type LinhaFormacao = { titulo: string; x: number; posicoes: Posicao[] };

// A equipa própria defende à esquerda e ataca à direita (x cresce para a frente).
const LINHAS_FUTSAL: LinhaFormacao[] = [
  { titulo: "Guarda-redes", x: 35, posicoes: ["GUARDA_REDES"] },
  { titulo: "Defesa", x: 130, posicoes: ["FIXO"] },
  { titulo: "Meio", x: 225, posicoes: ["ALA", "UNIVERSAL"] },
  { titulo: "Avançado", x: 320, posicoes: ["PIVO"] },
];

const LINHAS_FUTEBOL: LinhaFormacao[] = [
  { titulo: "Guarda-redes", x: 35, posicoes: ["GUARDA_REDES"] },
  {
    titulo: "Defesa",
    x: 115,
    posicoes: ["DEFESA_CENTRAL", "LATERAL_DIREITO", "LATERAL_ESQUERDO"],
  },
  {
    titulo: "Meio",
    x: 205,
    posicoes: ["MEDIO_DEFENSIVO", "MEDIO_CENTRO", "MEDIO_OFENSIVO", "UNIVERSAL"],
  },
  {
    titulo: "Ataque",
    x: 315,
    posicoes: ["EXTREMO_DIREITO", "EXTREMO_ESQUERDO", "AVANCADO"],
  },
];

/** Linhas de formação da modalidade (futsal por defeito). */
export function linhasFormacao(modalidade: Modalidade): LinhaFormacao[] {
  return modalidade === "FUTEBOL" ? LINHAS_FUTEBOL : LINHAS_FUTSAL;
}

/**
 * Formação padrão (ordenada, com dimensão = jogadores em campo) por formato de
 * jogo. Alimenta o preenchimento de posições dos titulares sem posição prevista.
 */
const FORMACOES_PADRAO: Record<FormatoJogo, Posicao[]> = {
  FUTSAL_5: ["GUARDA_REDES", "FIXO", "ALA", "ALA", "PIVO"],
  FUTEBOL_3_3: ["GUARDA_REDES", "DEFESA_CENTRAL", "AVANCADO"],
  FUTEBOL_5_5: [
    "GUARDA_REDES",
    "DEFESA_CENTRAL",
    "LATERAL_DIREITO",
    "LATERAL_ESQUERDO",
    "AVANCADO",
  ],
  FUTEBOL_7: [
    "GUARDA_REDES",
    "DEFESA_CENTRAL",
    "LATERAL_DIREITO",
    "LATERAL_ESQUERDO",
    "MEDIO_CENTRO",
    "MEDIO_OFENSIVO",
    "AVANCADO",
  ],
  FUTEBOL_9: [
    "GUARDA_REDES",
    "DEFESA_CENTRAL",
    "LATERAL_DIREITO",
    "LATERAL_ESQUERDO",
    "MEDIO_DEFENSIVO",
    "MEDIO_CENTRO",
    "MEDIO_OFENSIVO",
    "EXTREMO_DIREITO",
    "AVANCADO",
  ],
  FUTEBOL_11: [
    "GUARDA_REDES",
    "DEFESA_CENTRAL",
    "DEFESA_CENTRAL",
    "LATERAL_DIREITO",
    "LATERAL_ESQUERDO",
    "MEDIO_DEFENSIVO",
    "MEDIO_CENTRO",
    "MEDIO_OFENSIVO",
    "EXTREMO_DIREITO",
    "EXTREMO_ESQUERDO",
    "AVANCADO",
  ],
};

/**
 * Posições padrão distribuídas no campo para a modalidade/formato. Sem formato,
 * cai no formato canónico da modalidade (futebol → 11; caso contrário futsal → 5).
 */
export function formacaoPadrao(
  modalidade: Modalidade,
  formato: FormatoJogo | null,
): Posicao[] {
  if (formato) return FORMACOES_PADRAO[formato];
  return modalidade === "FUTEBOL"
    ? FORMACOES_PADRAO.FUTEBOL_11
    : FORMACOES_PADRAO.FUTSAL_5;
}

/** Distribui n jogadores verticalmente (y) numa linha, no espaço útil 45..155. */
function distribuirY(indice: number, total: number): number {
  if (total <= 1) return 100;
  return 45 + ((155 - 45) * indice) / (total - 1);
}

/**
 * Constrói o diagrama de campo (v2) com **todos** os titulares posicionados por
 * linha. Os titulares sem posição prevista recebem uma posição padrão livre da
 * formação (§11.5), garantindo que nenhum titular fica de fora do campo.
 */
export function construirDiagramaFormacao(
  titulares: TitularFormacao[],
  modalidade: Modalidade,
  formato: FormatoJogo | null,
): DiagramaCampo {
  const linhas = linhasFormacao(modalidade);
  const idxMeio = Math.floor(linhas.length / 2);

  // Pool de posições padrão para os titulares sem posição. Remove primeiro as
  // posições já ocupadas pelos titulares posicionados, para os sem-posição
  // preencherem os lugares livres da formação (ex.: 2 alas em falta).
  const pool = [...formacaoPadrao(modalidade, formato)];
  for (const t of titulares) {
    if (t.posicao != null) {
      const i = pool.indexOf(t.posicao);
      if (i >= 0) pool.splice(i, 1);
    }
  }
  // Recurso final se o pool esgotar (mais titulares que lugares): posição do meio.
  const posicaoRecurso: Posicao = modalidade === "FUTEBOL" ? "MEDIO_CENTRO" : "ALA";

  // Agrupa os titulares por índice de linha, calculando a posição efetiva.
  const porLinha = new Map<number, TitularFormacao[]>();
  for (const t of titulares) {
    const posicao = t.posicao ?? pool.shift() ?? posicaoRecurso;
    let idx = linhas.findIndex((l) => l.posicoes.includes(posicao));
    if (idx < 0) idx = idxMeio; // posição fora das linhas (dados legados) → meio
    const lista = porLinha.get(idx) ?? [];
    lista.push(t);
    porLinha.set(idx, lista);
  }

  // Emite os elementos por ordem das linhas (GR → ataque) para render estável.
  const elementos: Jogador[] = [];
  linhas.forEach((linha, idx) => {
    const lista = porLinha.get(idx) ?? [];
    lista.forEach((t, i) => {
      elementos.push({
        id: t.id,
        tipo: "jogador",
        x: linha.x,
        y: distribuirY(i, lista.length),
        cor: "azul",
        equipa: "propria",
        ...(t.numero != null ? { numero: t.numero } : {}),
      });
    });
  });

  return { versao: 2, elementos, campo: formato ?? undefined };
}
