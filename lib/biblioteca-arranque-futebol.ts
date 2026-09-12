// Fase 29 — Conteúdo curado de FUTEBOL (exercícios, subcategorias)
// e funções de instalação idempotentes por clube.
//
// Espelha o modelo do futsal (lib/biblioteca-arranque.ts / lib/subcategorias-arranque.ts),
// mas todo o conteúdo é marcado com `modalidade: "FUTEBOL"` (§3.3/§3.4/§3.8) para que
// os filtros da biblioteca por modalidade (UI §8.6/§8.7) funcionem e uma secção de
// futebol nunca comece vazia (§16 Fase 29, Apêndice B).
//
// Sem migração: os campos `modalidade`, `origemSeed` e `sistema` já existem no schema
// desde a Fase 25. Esta fase é só dados + instaladores idempotentes.
//
// Os exercícios de futebol começam sem diagrama (`diagrama: null`); o editor de campo
// de futebol (todos os formatos) chega na Fase 26.

import type {
  CategoriaExercicioPrincipal,
  ParteTreino,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { TEMPLATES_ARRANQUE_FUTEBOL } from "@/lib/templates-arranque";

/** Cliente Prisma ou cliente de transação — permite injeção a partir dos seeds. */
type ClientePrisma = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────
// 1. Exercícios curados de futebol (~15)
// ─────────────────────────────────────────────

export interface ExercicioArranqueFutebol {
  nome: string;
  /** Categoria de núcleo (enum). Ver mapeamento das áreas do plano da Fase 29 abaixo. */
  categoriaPrincipal: CategoriaExercicioPrincipal;
  /** Parte do treino onde se aplica. */
  parteTreino: ParteTreino;
  /** Nome da subcategoria de futebol (SUBCATEGORIAS_ARRANQUE_FUTEBOL). Opcional. */
  subcategoria?: string;
  /** Escalão/faixa etária sugerida (texto livre). Opcional. */
  escalaoAlvo?: string;
  duracaoMin: number;
  objetivo: string;
  descricao: string;
}

// Nota de mapeamento (as áreas do plano não são todas valores do enum
// CategoriaExercicioPrincipal — mapeiam-se para categoria + parte do treino):
//   Aquecimento     → parteTreino AQUECIMENTO (+ categoria FISICO/ATAQUE)
//   Técnica         → categoria ATAQUE, parteTreino PRINCIPAL
//   Tática coletiva → categoria DEFESA/ATAQUE/TRANSICAO, parteTreino PRINCIPAL
//   Bolas paradas   → categoria BOLAS_PARADAS
//   Físico          → categoria FISICO
//   Guarda-redes    → categoria GUARDA_REDES
export const EXERCICIOS_ARRANQUE_FUTEBOL: ExercicioArranqueFutebol[] = [
  // ── Aquecimento (2) ──────────────────────────
  {
    nome: "Rondos 4v2",
    categoriaPrincipal: "FISICO",
    parteTreino: "AQUECIMENTO",
    duracaoMin: 12,
    objetivo: "Elevar a temperatura corporal e trabalhar o passe curto sob pressão.",
    descricao:
      "Quatro jogadores em quadrado com dois no meio a pressionar. Passe a um toque no exterior, apoios ativos. Trocar os do meio a cada minuto ou a cada bola perdida.",
  },
  {
    nome: "Jogo de Posição 5v5",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "AQUECIMENTO",
    duracaoMin: 18,
    objetivo: "Manter a posse com ocupação racional dos espaços e apoios em profundidade.",
    descricao:
      "Cinco contra cinco com jogadores de apoio nas linhas. Objetivo: circular a bola encontrando o homem livre entre linhas. Progressão: limitar toques e premiar a mudança de corredor.",
  },

  // ── Técnica (3) ──────────────────────────────
  {
    nome: "Controlo orientado com condução",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "PRINCIPAL",
    duracaoMin: 15,
    objetivo: "Melhorar o primeiro toque orientado e a condução com cabeça levantada.",
    descricao:
      "Estações de receção com controlo orientado para o espaço livre, seguido de condução até ao apoio seguinte. Alternar a superfície de controlo e o pé de condução.",
  },
  {
    nome: "Passe e movimento (combinações)",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "PRINCIPAL",
    duracaoMin: 15,
    objetivo: "Trabalhar combinações de passe e movimento (tabelas, terceiro homem).",
    descricao:
      "Sequências de passe e receção com movimento de apoio e rutura. Ensaiar a tabela e o passe para o terceiro homem. Progressão: dois toques → um toque.",
  },
  {
    nome: "Finalização com cruzamento",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "PRINCIPAL",
    duracaoMin: 18,
    objetivo: "Finalizar em zona de cruzamento com ataque ao primeiro e segundo poste.",
    descricao:
      "Construção pelo corredor lateral e cruzamento para finalização. Coordenar o ataque ao primeiro poste, segundo poste e zona de recarga. Alternar o pé de finalização.",
  },

  // ── Tática coletiva (3) ──────────────────────
  {
    nome: "Pressing alto em bloco",
    categoriaPrincipal: "DEFESA",
    parteTreino: "PRINCIPAL",
    subcategoria: "Pressing",
    duracaoMin: 20,
    objetivo: "Coordenar a pressão alta em bloco e os momentos de acionamento.",
    descricao:
      "Equipa pressiona a saída de bola adversária. Definir gatilhos (passe para trás, mau controlo) e o fecho das linhas interiores. Recuperar em bloco e sair a jogar.",
  },
  {
    nome: "Saída a jogar pelo GR",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "PRINCIPAL",
    subcategoria: "Saída a jogar",
    duracaoMin: 18,
    objetivo: "Construir a saída de bola desde o guarda-redes sob pressão.",
    descricao:
      "Guarda-redes inicia; defesas e médios criam linhas de passe para progredir sob pressão adversária. Trabalhar a superioridade na primeira fase de construção.",
  },
  {
    nome: "Transição rápida ofensiva",
    categoriaPrincipal: "TRANSICAO",
    parteTreino: "PRINCIPAL",
    subcategoria: "Transição O→D",
    duracaoMin: 15,
    objetivo: "Explorar a transição ofensiva após recuperação com largura e profundidade.",
    descricao:
      "Recuperada a bola, sair rápido para finalizar em inferioridade defensiva do adversário. Premiar a decisão rápida e o remate em menos de 8 segundos.",
  },

  // ── Bolas paradas (3) ────────────────────────
  {
    nome: "Canto directo ao primeiro poste",
    categoriaPrincipal: "BOLAS_PARADAS",
    parteTreino: "PRINCIPAL",
    subcategoria: "Canto",
    duracaoMin: 15,
    objetivo: "Criar perigo no canto com movimentos coordenados ao primeiro poste.",
    descricao:
      "Batedor no canto; jogadores executam bloqueios e cortinas para libertar o rematador ao primeiro poste. Ensaiar o timing do movimento e a zona de recarga.",
  },
  {
    nome: "Livre lateral em zona 3",
    categoriaPrincipal: "BOLAS_PARADAS",
    parteTreino: "PRINCIPAL",
    subcategoria: "Livre indirecto",
    duracaoMin: 15,
    objetivo: "Rentabilizar o livre lateral na zona de finalização.",
    descricao:
      "Definir batedor, zona de queda da bola e movimentos de ataque à área. Trabalhar a reação em caso de alívio defensivo e o equilíbrio defensivo.",
  },
  {
    nome: "Penálti: rotinas do executante",
    categoriaPrincipal: "BOLAS_PARADAS",
    parteTreino: "PRINCIPAL",
    subcategoria: "Penálti",
    duracaoMin: 12,
    objetivo: "Consolidar a rotina de marcação de grande penalidade sob pressão.",
    descricao:
      "Marcação repetida de penáltis com rotina consistente (aproximação, escolha do canto, execução). Introduzir pressão competitiva com o guarda-redes.",
  },

  // ── Físico (2) ───────────────────────────────
  {
    nome: "Sprints curtos com bola",
    categoriaPrincipal: "FISICO",
    parteTreino: "PRINCIPAL",
    duracaoMin: 12,
    objetivo: "Desenvolver a velocidade e a aceleração com bola.",
    descricao:
      "Repetições de sprints curtos com condução e mudanças de direção, intercaladas com pausa completa. Priorizar a qualidade da execução sobre o volume.",
  },
  {
    nome: "Resistência com posse",
    categoriaPrincipal: "FISICO",
    parteTreino: "PRINCIPAL",
    duracaoMin: 18,
    objetivo: "Trabalhar a resistência específica em contexto de posse de bola.",
    descricao:
      "Jogo de posse em espaço amplo com blocos de trabalho de alta intensidade e recuperação ativa. Manter a qualidade técnica com fadiga.",
  },

  // ── Guarda-redes (2) ─────────────────────────
  {
    nome: "Saídas a cruzamentos",
    categoriaPrincipal: "GUARDA_REDES",
    parteTreino: "PRINCIPAL",
    subcategoria: "Saídas",
    duracaoMin: 15,
    objetivo: "Melhorar a decisão e a técnica do guarda-redes nas saídas ao cruzamento.",
    descricao:
      "Cruzamentos variados para trabalhar a leitura da trajetória, a saída em segurança (agarrar ou aliviar) e a comunicação com a defesa.",
  },
  {
    nome: "Jogo com os pés — construção",
    categoriaPrincipal: "GUARDA_REDES",
    parteTreino: "PRINCIPAL",
    subcategoria: "Jogo com os pés",
    duracaoMin: 15,
    objetivo: "Integrar o guarda-redes na primeira fase de construção.",
    descricao:
      "Guarda-redes recebe e distribui sob pressão, escolhendo entre a saída curta e a bola longa. Trabalhar a orientação do apoio e a qualidade do passe.",
  },
];

// ─────────────────────────────────────────────
// 2. Subcategorias curadas de futebol
// ─────────────────────────────────────────────

export interface SubcategoriaArranqueFutebol {
  nome: string;
  categoria: CategoriaExercicioPrincipal;
  ordem: number;
}

// As áreas "Tática coletiva" e "Guarda-redes" do plano mapeiam para categorias do
// enum (DEFESA/ATAQUE/TRANSICAO/GUARDA_REDES). As subcategorias são idempotentes por
// (clubeId, nome, categoria) e marcadas com `sistema: true`.
export const SUBCATEGORIAS_ARRANQUE_FUTEBOL: SubcategoriaArranqueFutebol[] = [
  // BOLAS_PARADAS
  { nome: "Canto", categoria: "BOLAS_PARADAS", ordem: 0 },
  { nome: "Livre directo", categoria: "BOLAS_PARADAS", ordem: 1 },
  { nome: "Livre indirecto", categoria: "BOLAS_PARADAS", ordem: 2 },
  { nome: "Lançamento de linha", categoria: "BOLAS_PARADAS", ordem: 3 },
  { nome: "Pontapé de baliza", categoria: "BOLAS_PARADAS", ordem: 4 },
  { nome: "Penálti", categoria: "BOLAS_PARADAS", ordem: 5 },
  // Tática coletiva → DEFESA / ATAQUE / TRANSICAO
  { nome: "Pressing", categoria: "DEFESA", ordem: 0 },
  { nome: "Saída a jogar", categoria: "ATAQUE", ordem: 0 },
  { nome: "Transição O→D", categoria: "TRANSICAO", ordem: 0 },
  { nome: "Transição D→O", categoria: "TRANSICAO", ordem: 1 },
  // GUARDA_REDES
  { nome: "Saídas", categoria: "GUARDA_REDES", ordem: 0 },
  { nome: "Jogo com os pés", categoria: "GUARDA_REDES", ordem: 1 },
  { nome: "Defesa de penálti", categoria: "GUARDA_REDES", ordem: 2 },
];

// ─────────────────────────────────────────────
// 3. Instaladores idempotentes por clube
// ─────────────────────────────────────────────

/** Resolve o utilizador criador/autor do conteúdo: primeiro membro do clube. */
async function resolverCriadorId(db: ClientePrisma, clubeId: string): Promise<string> {
  const membro = await db.membroClube.findFirst({
    where: { clubeId },
    orderBy: { dataEntrada: "asc" },
    select: { utilizadorId: true },
  });
  if (!membro) {
    throw new Error(
      `instalarConteudoArranqueFutebol: nenhum membro encontrado para o clube ${clubeId}.`,
    );
  }
  return membro.utilizadorId;
}

/**
 * Instala as subcategorias curadas de futebol. Idempotente por
 * (clubeId, nome, categoria): só cria as que ainda não existem.
 */
export async function instalarSubcategoriasFutebol(
  clubeId: string,
  db: ClientePrisma = prisma,
): Promise<{ criadas: number }> {
  const existentes = await db.subcategoriaExercicio.findMany({
    where: { clubeId },
    select: { nome: true, categoria: true },
  });
  const chave = (nome: string, categoria: CategoriaExercicioPrincipal) => `${categoria}::${nome}`;
  const jaExiste = new Set(existentes.map((s) => chave(s.nome, s.categoria)));

  const emFalta = SUBCATEGORIAS_ARRANQUE_FUTEBOL.filter(
    (s) => !jaExiste.has(chave(s.nome, s.categoria)),
  );
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
 * Instala a biblioteca de exercícios curada de futebol. Idempotente por
 * (clubeId, nome, modalidade FUTEBOL): só cria os exercícios ainda inexistentes.
 * Liga cada exercício à subcategoria de futebol correspondente (se existir).
 */
export async function instalarBibliotecaArranqueFutebol(
  clubeId: string,
  db: ClientePrisma = prisma,
): Promise<{ criados: number }> {
  const criadorId = await resolverCriadorId(db, clubeId);

  const existentes = await db.exercicio.findMany({
    where: { clubeId, modalidade: "FUTEBOL" },
    select: { nome: true },
  });
  const jaExiste = new Set(existentes.map((e) => e.nome));

  const emFalta = EXERCICIOS_ARRANQUE_FUTEBOL.filter((e) => !jaExiste.has(e.nome));
  if (emFalta.length === 0) return { criados: 0 };

  // Mapa de subcategorias do clube por nome (para ligar os exercícios).
  const subcats = await db.subcategoriaExercicio.findMany({
    where: { clubeId },
    select: { id: true, nome: true },
  });
  const subIdPorNome = new Map(subcats.map((s) => [s.nome, s.id]));

  await db.exercicio.createMany({
    data: emFalta.map((e) => ({
      nome: e.nome,
      descricao: e.descricao,
      objetivo: e.objetivo,
      duracaoMin: e.duracaoMin,
      categoriaPrincipal: e.categoriaPrincipal,
      parteTreino: e.parteTreino,
      subcategoriaId: e.subcategoria ? subIdPorNome.get(e.subcategoria) ?? null : null,
      escalaoAlvo: e.escalaoAlvo ?? null,
      diagrama: undefined, // sem diagrama até à Fase 26 (editor de campo de futebol)
      modalidade: "FUTEBOL",
      // Biblioteca do clube (🏛️): propriedade do clube, autoria do primeiro membro.
      proprietario: "CLUBE",
      clubeProprietarioId: clubeId,
      autorId: criadorId,
      // Dual-write dos campos legados (fase expand).
      clubeId,
      criadorId,
      origemSeed: true,
    })),
  });
  return { criados: emFalta.length };
}

/**
 * Instala os templates de sessão curados de futebol. Idempotente por
 * (clubeProprietarioId, nome, modalidade FUTEBOL). Requer que a biblioteca de
 * exercícios de futebol já tenha sido instalada (resolve exercícios por nome).
 */
export async function instalarTemplatesArranqueFutebol(
  clubeId: string,
  db: ClientePrisma = prisma,
): Promise<{ criados: number }> {
  const criadorId = await resolverCriadorId(db, clubeId);

  const existentes = await db.modeloSessao.findMany({
    where: { clubeProprietarioId: clubeId, modalidade: "FUTEBOL" },
    select: { nome: true },
  });
  const jaExiste = new Set(existentes.map((m) => m.nome));

  const emFalta = TEMPLATES_ARRANQUE_FUTEBOL.filter((t) => !jaExiste.has(t.nome));
  if (emFalta.length === 0) return { criados: 0 };

  const nomesNecessarios = [
    ...new Set(emFalta.flatMap((t) => t.exercicios.map((e) => e.nomeExercicio))),
  ];
  const exercicios = await db.exercicio.findMany({
    where: { clubeId, modalidade: "FUTEBOL", nome: { in: nomesNecessarios } },
    select: { id: true, nome: true },
  });
  const idPorNome = new Map(exercicios.map((e) => [e.nome, e.id]));

  const semExercicio = nomesNecessarios.filter((n) => !idPorNome.has(n));
  if (semExercicio.length > 0) {
    throw new Error(
      `instalarTemplatesArranqueFutebol: instala primeiro a biblioteca de futebol. Exercícios em falta: ${semExercicio.join(", ")}.`,
    );
  }

  let criados = 0;
  for (const template of emFalta) {
    const modelo = await db.modeloSessao.create({
      data: {
        autorId: criadorId,
        proprietario: "CLUBE",
        clubeProprietarioId: clubeId,
        modalidade: "FUTEBOL",
        origemSeed: true,
        nome: template.nome,
        descricao: template.descricao,
        objetivoTatico: template.objetivoTatico,
        faseEpoca: template.faseEpoca,
        escalaoAlvo: template.escalaoAlvo,
        duracaoMin: template.duracaoMin,
      },
    });

    await db.modeloSessaoExercicio.createMany({
      data: template.exercicios.map((e, i) => ({
        modeloSessaoId: modelo.id,
        exercicioId: idPorNome.get(e.nomeExercicio)!,
        ordem: i,
        duracaoMin: e.duracaoMin,
        parteTreino: e.parteTreino,
        notas: e.notas ?? null,
      })),
      skipDuplicates: true,
    });
    criados += 1;
  }
  return { criados };
}

/**
 * Orquestração do conteúdo de arranque por modalidade. Para FUTEBOL instala,
 * pela ordem correta de dependências: subcategorias → exercícios → templates.
 * Idempotente (cada instalador só cria o que falta).
 *
 * Para FUTSAL não faz nada aqui — o conteúdo de futsal é instalado pelas actions
 * existentes (lib/actions/*Arranque) e pelo seed base.
 */
export async function instalarConteudoArranqueFutebol(
  clubeId: string,
  db: ClientePrisma = prisma,
): Promise<{
  subcategorias: number;
  exercicios: number;
  templates: number;
}> {
  const sub = await instalarSubcategoriasFutebol(clubeId, db);
  const ex = await instalarBibliotecaArranqueFutebol(clubeId, db);
  const tpl = await instalarTemplatesArranqueFutebol(clubeId, db);
  return {
    subcategorias: sub.criadas,
    exercicios: ex.criados,
    templates: tpl.criados,
  };
}
