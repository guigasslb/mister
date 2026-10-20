import type { CasaFora, EstadoJogoAoVivo, Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Remoção de jogos ao apagar/editar confrontos e competições (§23.6, regra R3).
//
// Fonte ÚNICA dos critérios «o jogo tem dados»: usada pela pré-visualização do
// impacto (`categoriaRemocao`/`agruparImpacto`) E pelo predicado do `deleteMany`
// (`wherePodeApagar`) — os dois lados derivam da mesma tabela de critérios.
// Módulo partilhado (fora de `"use server"`), sem I/O.
// ─────────────────────────────────────────────────────────────────────────────

export type MotivoDados =
  | "CONVOCATORIA"
  | "ESTATISTICAS"
  | "EVENTOS"
  | "AO_VIVO"
  | "RESULTADO"
  | "QUADRO_TATICO"
  | "RELATORIO"
  | "VIDEO"
  | "SCOUTING"
  | "FECHADO";

export type CategoriaRemocao = "VAZIO" | "CONVOCATORIA" | "DADOS";

/** Campos/contagens lidos do Jogo (select `SELECT_REMOCAO_JOGO`). */
export type JogoParaRemocao = {
  id: string;
  data: Date;
  adversario: string;
  casaFora: CasaFora;
  equipaCompeticao: { nome: string } | null;
  golosMarcados: number | null;
  golosSofridos: number | null;
  faltas1aParte: number | null;
  faltas2aParte: number | null;
  relatorio: string | null;
  videoUrl: string | null;
  fechado: boolean;
  sessaoAoVivo: { estado: EstadoJogoAoVivo } | null;
  _count: {
    convocatorias: number;
    estatisticas: number;
    eventos: number;
    quadros: number;
    observacoes: number;
  };
};

export const SELECT_REMOCAO_JOGO = {
  id: true,
  data: true,
  adversario: true,
  casaFora: true,
  equipaCompeticao: { select: { nome: true } },
  golosMarcados: true,
  golosSofridos: true,
  faltas1aParte: true,
  faltas2aParte: true,
  relatorio: true,
  videoUrl: true,
  fechado: true,
  sessaoAoVivo: { select: { estado: true } },
  _count: {
    select: { convocatorias: true, estatisticas: true, eventos: true, quadros: true, observacoes: true },
  },
} satisfies Prisma.JogoSelect;

type Criterio = {
  motivo: MotivoDados;
  /** O jogo tem este tipo de dados. */
  tem: (j: JogoParaRemocao) => boolean;
  /** Predicado SQL de «NÃO tem» (negação exata de `tem`). */
  semEle: Prisma.JogoWhereInput;
};

const vazio = (s: string | null) => s === null || s === "";

// Um motivo por linha (ordem = ordem de apresentação dos motivos).
const CRITERIOS: Criterio[] = [
  {
    motivo: "CONVOCATORIA",
    tem: (j) => j._count.convocatorias > 0,
    semEle: { convocatorias: { none: {} } },
  },
  {
    motivo: "ESTATISTICAS",
    tem: (j) => j._count.estatisticas > 0,
    semEle: { estatisticas: { none: {} } },
  },
  {
    motivo: "EVENTOS",
    tem: (j) => j._count.eventos > 0,
    semEle: { eventos: { none: {} } },
  },
  {
    // Uma sessão POR_INICIAR (sem mais nada) é apagada em cascata com o jogo.
    motivo: "AO_VIVO",
    tem: (j) => j.sessaoAoVivo !== null && j.sessaoAoVivo.estado !== "POR_INICIAR",
    semEle: {
      OR: [{ sessaoAoVivo: { is: null } }, { sessaoAoVivo: { is: { estado: "POR_INICIAR" } } }],
    },
  },
  {
    motivo: "RESULTADO",
    tem: (j) =>
      j.golosMarcados !== null ||
      j.golosSofridos !== null ||
      j.faltas1aParte !== null ||
      j.faltas2aParte !== null,
    semEle: { golosMarcados: null, golosSofridos: null, faltas1aParte: null, faltas2aParte: null },
  },
  {
    motivo: "QUADRO_TATICO",
    tem: (j) => j._count.quadros > 0,
    semEle: { quadros: { none: {} } },
  },
  {
    // Sem trim nos dois lados (simetria).
    motivo: "RELATORIO",
    tem: (j) => !vazio(j.relatorio),
    semEle: { OR: [{ relatorio: null }, { relatorio: "" }] },
  },
  {
    motivo: "VIDEO",
    tem: (j) => !vazio(j.videoUrl),
    semEle: { OR: [{ videoUrl: null }, { videoUrl: "" }] },
  },
  {
    motivo: "SCOUTING",
    tem: (j) => j._count.observacoes > 0,
    semEle: { observacoes: { none: {} } },
  },
  {
    motivo: "FECHADO",
    tem: (j) => j.fechado,
    semEle: { fechado: false },
  },
];

export const LABEL_MOTIVO_DADOS: Record<MotivoDados, string> = {
  CONVOCATORIA: "convocatória",
  ESTATISTICAS: "estatísticas",
  EVENTOS: "eventos registados",
  AO_VIVO: "jogo ao vivo iniciado",
  RESULTADO: "resultado",
  QUADRO_TATICO: "quadro tático",
  RELATORIO: "relatório",
  VIDEO: "vídeo",
  SCOUTING: "observação de scouting",
  FECHADO: "jogo fechado",
};

/** Motivos pelos quais o jogo tem dados (vazio = jogo sem nada). */
export function motivosDados(j: JogoParaRemocao): MotivoDados[] {
  return CRITERIOS.filter((c) => c.tem(j)).map((c) => c.motivo);
}

/**
 * DADOS ⇔ algum motivo ≠ CONVOCATORIA · CONVOCATORIA ⇔ só convocatória ·
 * VAZIO ⇔ nenhum motivo.
 */
export function categoriaRemocao(j: JogoParaRemocao): CategoriaRemocao {
  const motivos = motivosDados(j);
  if (motivos.length === 0) return "VAZIO";
  return motivos.every((m) => m === "CONVOCATORIA") ? "CONVOCATORIA" : "DADOS";
}

/**
 * Predicado SQL equivalente a `categoriaRemocao === "VAZIO"` (ou, com
 * `incluirConvocatoria`, ∈ {VAZIO, CONVOCATORIA}). Vai na própria query do
 * `deleteMany`: um jogo que ganhou dados entretanto nunca é apagado.
 */
export function wherePodeApagar(incluirConvocatoria: boolean): Prisma.JogoWhereInput {
  return {
    AND: CRITERIOS.filter((c) => !(incluirConvocatoria && c.motivo === "CONVOCATORIA")).map(
      (c) => c.semEle,
    ),
  };
}

export type JogoImpacto = {
  id: string;
  data: Date;
  adversario: string;
  casaFora: CasaFora;
  equipa: string | null;
  motivos: MotivoDados[];
};

export type ImpactoRemocaoJogos = {
  vazios: JogoImpacto[];
  comConvocatoria: JogoImpacto[];
  comDados: JogoImpacto[];
};

/** Agrupa os jogos pela categoria de remoção (pela ordem recebida). */
export function agruparImpacto(jogos: JogoParaRemocao[]): ImpactoRemocaoJogos {
  const impacto: ImpactoRemocaoJogos = { vazios: [], comConvocatoria: [], comDados: [] };
  for (const j of jogos) {
    const item: JogoImpacto = {
      id: j.id,
      data: j.data,
      adversario: j.adversario,
      casaFora: j.casaFora,
      equipa: j.equipaCompeticao?.nome ?? null,
      motivos: motivosDados(j),
    };
    const categoria = categoriaRemocao(j);
    if (categoria === "VAZIO") impacto.vazios.push(item);
    else if (categoria === "CONVOCATORIA") impacto.comConvocatoria.push(item);
    else impacto.comDados.push(item);
  }
  return impacto;
}
