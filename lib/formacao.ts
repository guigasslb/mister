import type { FormatoJogo, Modalidade, Posicao } from "@prisma/client";
import type { DiagramaCampo, Jogador } from "@/lib/schemas/exercicio";
import { ABREV_POSICAO } from "@/lib/schemas/atleta";

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
  // Nome do atleta (§11.5): alimenta a etiqueta por cima da figura. Opcional/
  // retrocompatível — ausente → sem nome no campo.
  nome?: string | null;
  // Capitão de equipa (§11.5): quando true, o token recebe a braçadeira "C" no
  // campo. Opcional/retrocompatível — ausente → não é capitão.
  capitao?: boolean;
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

  // Agrupa os titulares por índice de linha, calculando a posição efetiva. A
  // posição efetiva (prevista ou padrão atribuída) é guardada para alimentar a
  // legenda da posição no campo (§11.5).
  const porLinha = new Map<number, { t: TitularFormacao; posicao: Posicao }[]>();
  for (const t of titulares) {
    const posicao = t.posicao ?? pool.shift() ?? posicaoRecurso;
    let idx = linhas.findIndex((l) => l.posicoes.includes(posicao));
    if (idx < 0) idx = idxMeio; // posição fora das linhas (dados legados) → meio
    const lista = porLinha.get(idx) ?? [];
    lista.push({ t, posicao });
    porLinha.set(idx, lista);
  }

  // Emite os elementos por ordem das linhas (GR → ataque) para render estável.
  const elementos: Jogador[] = [];
  linhas.forEach((linha, idx) => {
    const lista = porLinha.get(idx) ?? [];
    lista.forEach(({ t, posicao }, i) => {
      elementos.push({
        id: t.id,
        tipo: "jogador",
        x: linha.x,
        y: distribuirY(i, lista.length),
        cor: "azul",
        equipa: "propria",
        // Legenda visível da posição tática (abreviatura), por baixo da figura.
        etiquetaPosicao: ABREV_POSICAO[posicao],
        // Nome do atleta por cima da cabeça (§11.5): primeiro nome, truncado a 12
        // chars para não transbordar a figura. Ausente/vazio → sem nome.
        ...(t.nome
          ? { nomeAtleta: t.nome.split(" ")[0].slice(0, 12) }
          : {}),
        // Braçadeira de capitão (§11.5): só sinaliza quando é capitão (o "C" no
        // campo). Ausente quando não é, para manter o diagrama enxuto.
        ...(t.capitao ? { capitao: true } : {}),
        ...(t.numero != null ? { numero: t.numero } : {}),
      });
    });
  });

  return { versao: 2, elementos, campo: formato ?? undefined };
}

/**
 * Sobrepõe a IDENTIDADE viva dos titulares aos tokens de jogador de um diagrama,
 * emparelhando por `id` de token (§11.5). A identidade — nome e braçadeira de
 * capitão — é independente da posição no campo, por isso tem de ser aplicada mesmo
 * a um quadro tático JÁ GRAVADO.
 *
 * Correção do bug "o nome não aparece": no plano de jogo o quadro visível é o
 * gravado (`QuadroTatico.diagrama`) assim que existe, sombreando a formação viva.
 * Sem esta sobreposição, o nome do atleta só apareceria enquanto o quadro nunca
 * tivesse sido guardado; depois da primeira gravação desaparecia. O mesmo se aplica
 * à braçadeira de capitão: é lida da `fonte` (formação derivada dos titulares
 * atuais) e aplicada a `alvo` — incluindo a LIMPEZA de um "C" gravado que já não
 * corresponde ao capitão atual.
 *
 * Tokens de `alvo` sem correspondência em `fonte` (adversários, jogadores extra
 * adicionados à mão) ficam intactos. Só devolve um novo diagrama quando algo muda
 * de facto (mantém referências estáveis / no-op). Lógica pura e testável.
 */
export function sobreporNomesTitulares(
  alvo: DiagramaCampo,
  fonte: DiagramaCampo,
): DiagramaCampo {
  // Identidade viva por id de token: nome curto e se é capitão. Só tokens de
  // jogador da formação viva entram (adversários/extra não têm correspondência).
  const identidadePorId = new Map<string, { nome?: string; capitao: boolean }>();
  for (const el of fonte.elementos) {
    if (el.tipo === "jogador") {
      identidadePorId.set(el.id, { nome: el.nomeAtleta, capitao: el.capitao === true });
    }
  }
  if (identidadePorId.size === 0) return alvo;

  let mudou = false;
  const elementos = alvo.elementos.map((el) => {
    if (el.tipo !== "jogador") return el;
    const id = identidadePorId.get(el.id);
    if (!id) return el;
    const nomeAtleta = id.nome ?? el.nomeAtleta;
    const nomeMuda = nomeAtleta !== el.nomeAtleta;
    const capMuda = (el.capitao === true) !== id.capitao;
    // Só cria um novo objeto quando a identidade muda de facto (no-op preservado).
    if (!nomeMuda && !capMuda) return el;
    mudou = true;
    const base = { ...el };
    if (nomeAtleta != null) base.nomeAtleta = nomeAtleta;
    // Normaliza `capitao`: mantém-no só quando true (enxuto e retrocompatível).
    if (id.capitao) base.capitao = true;
    else delete base.capitao;
    return base;
  });
  return mudou ? { ...alvo, elementos } : alvo;
}
