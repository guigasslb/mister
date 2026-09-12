// §8.24 — Treino específico de Guarda-Redes (GR): conteúdo de arranque curado
// (subcategorias, métricas técnicas e templates de sessão) e
// instaladores idempotentes por clube.
//
// Segue o modelo já estabelecido em lib/biblioteca-arranque-futebol.ts: os dados
// vivem em constantes exportadas e os instaladores só criam o que ainda não
// existe (diff por nome), pelo que podem correr múltiplas vezes sem duplicar.
//
// Notas de modelação (schema atual):
//  • `SubcategoriaExercicio` NÃO tem campo `modalidade` — as subcategorias são
//    transversais ao clube (únicas por clube+categoria+nome). A especificidade de
//    modalidade das subcategorias exclusivas fica expressa no próprio nome.
//  • `MetricaConfig` exige `clubeId` (não há métricas "de sistema" sem clube) e
//    NÃO tem campo `descricao` — a descrição de cada métrica fica documentada
//    aqui, junto à definição (campo `descricao` deste ficheiro, não persistido).
//  • `ModeloSessao` usa `descricao` (não tem campo `notas`).

import type {
  CategoriaExercicioPrincipal,
  Modalidade,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { prisma } from "@/lib/db";

/** Cliente Prisma ou cliente de transação — permite injeção a partir dos seeds. */
type ClientePrisma = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────
// 1. Subcategorias de exercício de GR (§8.24.2)
// ─────────────────────────────────────────────

export interface SubcategoriaArranqueGR {
  nome: string;
  categoria: CategoriaExercicioPrincipal;
  ordem: number;
  /** Documental: modalidade a que a subcategoria se destina (null = ambas). */
  modalidade: Modalidade | null;
}

export const SUBCATEGORIAS_ARRANQUE_GR: SubcategoriaArranqueGR[] = [
  // Comuns (futsal + futebol)
  { nome: "Reflexos e reação", categoria: "GUARDA_REDES", ordem: 10, modalidade: null },
  { nome: "Posicionamento e ângulos", categoria: "GUARDA_REDES", ordem: 11, modalidade: null },
  { nome: "Jogo com os pés / construção", categoria: "GUARDA_REDES", ordem: 12, modalidade: null },
  { nome: "Frente-a-frente (1×1)", categoria: "GUARDA_REDES", ordem: 13, modalidade: null },
  { nome: "Bolas paradas – defesa", categoria: "GUARDA_REDES", ordem: 14, modalidade: null },
  // Específicas de futsal
  { nome: "Saídas em bloco baixo", categoria: "GUARDA_REDES", ordem: 20, modalidade: "FUTSAL" },
  { nome: "GR-jogador / power play", categoria: "GUARDA_REDES", ordem: 21, modalidade: "FUTSAL" },
  {
    nome: "Reposição rápida / pontapé de baliza",
    categoria: "GUARDA_REDES",
    ordem: 22,
    modalidade: "FUTSAL",
  },
  // Específicas de futebol
  {
    nome: "Saídas ao cruzamento / bola aérea",
    categoria: "GUARDA_REDES",
    ordem: 30,
    modalidade: "FUTEBOL",
  },
  { nome: "Defesa de penálti", categoria: "GUARDA_REDES", ordem: 31, modalidade: "FUTEBOL" },
  {
    nome: "Distribuição longa / pontapé de baliza",
    categoria: "GUARDA_REDES",
    ordem: 32,
    modalidade: "FUTEBOL",
  },
];

// ─────────────────────────────────────────────
// 2. Métricas técnicas de GR (§8.24.3)
// ─────────────────────────────────────────────

export interface MetricaArranqueGR {
  nome: string;
  /** Documental — `MetricaConfig` não tem coluna de descrição no schema atual. */
  descricao: string;
  ordem: number;
}

export const METRICAS_ARRANQUE_GR: MetricaArranqueGR[] = [
  {
    nome: "Reflexos",
    descricao: "Capacidade de reação a remates e desvios inesperados",
    ordem: 10,
  },
  {
    nome: "Saídas",
    descricao: "Eficácia nas saídas ao pé do atacante e em bloco",
    ordem: 11,
  },
  {
    nome: "Jogo com os pés",
    descricao: "Qualidade na construção e reposição com os pés",
    ordem: 12,
  },
  {
    nome: "Posicionamento",
    descricao: "Colocação no espaço em função da bola e dos adversários",
    ordem: 13,
  },
  {
    // Nome conforme a bíblia §8.24.3 ("Comunicação/Concentração").
    nome: "Comunicação/Concentração",
    descricao: "Organização e comando da linha defensiva",
    ordem: 14,
  },
];

// ─────────────────────────────────────────────
// 3. Templates de sessão de GR (§8.24.5)
// ─────────────────────────────────────────────

export interface TemplateArranqueGR {
  nome: string;
  modalidade: Modalidade;
  duracaoMin: number;
  descricao: string;
  objetivoTatico: string;
}

// Templates "de esqueleto": sem exercícios pré-associados (a biblioteca curada de
// arranque não tem exercícios de GR suficientes nas duas modalidades). O treinador
// preenche a partir da sua biblioteca — o template garante nome, duração e foco.
export const TEMPLATES_ARRANQUE_GR: TemplateArranqueGR[] = [
  {
    nome: "Treino de GR – Reflexos e saídas (45 min)",
    modalidade: "FUTSAL",
    duracaoMin: 45,
    descricao: "Treino técnico dedicado ao guarda-redes de futsal",
    objetivoTatico: "Reflexos, saídas em bloco baixo e reposição rápida.",
  },
  {
    nome: "Treino de GR – Reflexos e saídas (60 min)",
    modalidade: "FUTEBOL",
    duracaoMin: 60,
    descricao: "Treino técnico dedicado ao guarda-redes de futebol",
    objetivoTatico: "Reflexos, saídas ao cruzamento e jogo com os pés.",
  },
];

// ─────────────────────────────────────────────
// 4. Instaladores idempotentes por clube
// ─────────────────────────────────────────────

/** Resolve o utilizador autor do conteúdo: primeiro membro do clube. */
async function resolverAutorId(db: ClientePrisma, clubeId: string): Promise<string> {
  const membro = await db.membroClube.findFirst({
    where: { clubeId },
    orderBy: { dataEntrada: "asc" },
    select: { utilizadorId: true },
  });
  if (!membro) {
    throw new Error(`instalarConteudoArranqueGR: nenhum membro encontrado para o clube ${clubeId}.`);
  }
  return membro.utilizadorId;
}

/**
 * Instala as subcategorias de exercício de GR. Idempotente por
 * (clubeId, categoria, nome): só cria as que ainda não existem.
 */
export async function instalarSubcategoriasGR(
  clubeId: string,
  db: ClientePrisma = prisma,
): Promise<{ criadas: number }> {
  const existentes = await db.subcategoriaExercicio.findMany({
    where: { clubeId },
    select: { nome: true, categoria: true },
  });
  const chave = (nome: string, categoria: CategoriaExercicioPrincipal) => `${categoria}::${nome}`;
  const jaExiste = new Set(existentes.map((s) => chave(s.nome, s.categoria)));

  const emFalta = SUBCATEGORIAS_ARRANQUE_GR.filter((s) => !jaExiste.has(chave(s.nome, s.categoria)));
  if (emFalta.length === 0) return { criadas: 0 };

  await db.subcategoriaExercicio.createMany({
    data: emFalta.map((s) => ({
      clubeId,
      nome: s.nome,
      categoria: s.categoria,
      ordem: s.ordem,
      sistema: true,
    })),
  });
  return { criadas: emFalta.length };
}

/**
 * Instala as métricas técnicas de GR (escala 1–5, contexto TREINO,
 * `aplicaSoGuardaRedes = true`). Idempotente por (clubeId, nome).
 */
export async function instalarMetricasGR(
  clubeId: string,
  db: ClientePrisma = prisma,
): Promise<{ criadas: number }> {
  const existentes = await db.metricaConfig.findMany({
    where: { clubeId },
    select: { nome: true },
  });
  const jaExiste = new Set(existentes.map((m) => m.nome));

  const emFalta = METRICAS_ARRANQUE_GR.filter((m) => !jaExiste.has(m.nome));
  if (emFalta.length === 0) return { criadas: 0 };

  await db.metricaConfig.createMany({
    data: emFalta.map((m) => ({
      clubeId,
      nome: m.nome,
      tipo: "ESCALA" as const,
      contexto: "TREINO" as const,
      aplicaSoGuardaRedes: true,
      ordem: m.ordem,
    })),
  });
  return { criadas: emFalta.length };
}

/**
 * Instala os templates de sessão de GR (biblioteca do clube).
 * Idempotente por (clubeProprietarioId, nome).
 */
export async function instalarTemplatesGR(
  clubeId: string,
  db: ClientePrisma = prisma,
): Promise<{ criados: number }> {
  const existentes = await db.modeloSessao.findMany({
    where: { clubeProprietarioId: clubeId },
    select: { nome: true },
  });
  const jaExiste = new Set(existentes.map((m) => m.nome));

  const emFalta = TEMPLATES_ARRANQUE_GR.filter((t) => !jaExiste.has(t.nome));
  if (emFalta.length === 0) return { criados: 0 };

  const autorId = await resolverAutorId(db, clubeId);

  for (const t of emFalta) {
    await db.modeloSessao.create({
      data: {
        autorId,
        proprietario: "CLUBE",
        clubeProprietarioId: clubeId,
        modalidade: t.modalidade,
        origemSeed: true,
        nome: t.nome,
        descricao: t.descricao,
        objetivoTatico: t.objetivoTatico,
        duracaoMin: t.duracaoMin,
      },
    });
  }
  return { criados: emFalta.length };
}

/**
 * Orquestração do conteúdo de arranque de GR (§8.24) para um clube:
 * subcategorias → métricas → templates. Idempotente.
 */
export async function instalarConteudoArranqueGR(
  clubeId: string,
  db: ClientePrisma = prisma,
): Promise<{
  subcategorias: number;
  metricas: number;
  templates: number;
}> {
  const sub = await instalarSubcategoriasGR(clubeId, db);
  const met = await instalarMetricasGR(clubeId, db);
  const tpl = await instalarTemplatesGR(clubeId, db);
  return {
    subcategorias: sub.criadas,
    metricas: met.criadas,
    templates: tpl.criados,
  };
}
