// Instalação idempotente do conteúdo curado de arranque, POR MODALIDADE (§8.1.1).
//
// Espelha os instaladores de futebol (lib/biblioteca-arranque-futebol.ts), mas
// para o conteúdo de FUTSAL (modalidade `null` = genérico, tal como o seed base e
// as actions lib/actions/*Arranque). Serve o onboarding por modalidade: quando um
// clube é criado para uma modalidade, a sua secção inicial nunca começa vazia.
//
// Todos os instaladores são idempotentes e aceitam um cliente de transação, para
// poderem correr dentro (ou fora) de uma transação de onboarding.

import { type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { BIBLIOTECA_ARRANQUE } from "@/lib/biblioteca-arranque";
import { SUBCATEGORIAS_ARRANQUE } from "@/lib/subcategorias-arranque";
import { TEMPLATES_ARRANQUE } from "@/lib/templates-arranque";
import { instalarConteudoArranqueFutebol } from "@/lib/biblioteca-arranque-futebol";

/** Cliente Prisma ou cliente de transação — permite injeção a partir do onboarding. */
type ClientePrisma = PrismaClient | Prisma.TransactionClient;

/** Resumo do que foi criado por modalidade (0 = já existia / nada a fazer). */
export interface ResumoArranque {
  subcategorias: number;
  exercicios: number;
  templates: number;
}

// ─────────────────────────────────────────────
// Instaladores idempotentes de FUTSAL
// ─────────────────────────────────────────────

/** Resolve o criador/autor do conteúdo: primeiro membro do clube. */
async function resolverCriadorId(db: ClientePrisma, clubeId: string): Promise<string> {
  const membro = await db.membroClube.findFirst({
    where: { clubeId },
    orderBy: { dataEntrada: "asc" },
    select: { utilizadorId: true },
  });
  if (!membro) {
    throw new Error(
      `instalarConteudoArranqueFutsal: nenhum membro encontrado para o clube ${clubeId}.`,
    );
  }
  return membro.utilizadorId;
}

/** Subcategorias curadas de futsal. Idempotente por (clubeId, nome, categoria). */
export async function instalarSubcategoriasFutsal(
  clubeId: string,
  db: ClientePrisma = prisma,
): Promise<{ criadas: number }> {
  const existentes = await db.subcategoriaExercicio.findMany({
    where: { clubeId },
    select: { nome: true, categoria: true },
  });
  const chave = (nome: string, categoria: string) => `${categoria}::${nome}`;
  const jaExiste = new Set(existentes.map((s) => chave(s.nome, s.categoria)));

  const emFalta = SUBCATEGORIAS_ARRANQUE.filter((s) => !jaExiste.has(chave(s.nome, s.categoria)));
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
 * Biblioteca de exercícios curada de futsal (modalidade `null` = genérico).
 * Idempotente por (clubeId, origemSeed, modalidade null, nome).
 */
export async function instalarBibliotecaArranqueFutsal(
  clubeId: string,
  db: ClientePrisma = prisma,
): Promise<{ criados: number }> {
  const criadorId = await resolverCriadorId(db, clubeId);

  const existentes = await db.exercicio.findMany({
    where: { clubeId, origemSeed: true, modalidade: null },
    select: { nome: true },
  });
  const jaExiste = new Set(existentes.map((e) => e.nome));

  const emFalta = BIBLIOTECA_ARRANQUE.filter((e) => !jaExiste.has(e.nome));
  if (emFalta.length === 0) return { criados: 0 };

  await db.exercicio.createMany({
    data: emFalta.map((e) => ({
      nome: e.nome,
      descricao: e.descricao,
      objetivo: e.objetivo,
      duracaoMin: e.duracaoMin,
      categoriaPrincipal: e.categoriaPrincipal,
      parteTreino: e.parteTreino,
      escalaoAlvo: e.escalaoAlvo ?? null,
      diagrama: e.diagrama as unknown as Prisma.InputJsonValue,
      // Genérico (futsal) — modalidade `null`, como o seed base.
      modalidade: null,
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
 * Templates de sessão curados de futsal. Idempotente por
 * (clubeProprietarioId, origemSeed, modalidade null, nome). Requer a biblioteca
 * de futsal já instalada (resolve exercícios por nome).
 */
export async function instalarTemplatesArranqueFutsal(
  clubeId: string,
  db: ClientePrisma = prisma,
): Promise<{ criados: number }> {
  const criadorId = await resolverCriadorId(db, clubeId);

  const existentes = await db.modeloSessao.findMany({
    where: { clubeProprietarioId: clubeId, origemSeed: true, modalidade: null },
    select: { nome: true },
  });
  const jaExiste = new Set(existentes.map((m) => m.nome));

  const emFalta = TEMPLATES_ARRANQUE.filter((t) => !jaExiste.has(t.nome));
  if (emFalta.length === 0) return { criados: 0 };

  const nomesNecessarios = [
    ...new Set(emFalta.flatMap((t) => t.exercicios.map((e) => e.nomeExercicio))),
  ];
  const exercicios = await db.exercicio.findMany({
    where: { clubeId, origemSeed: true, modalidade: null, nome: { in: nomesNecessarios } },
    select: { id: true, nome: true },
  });
  const idPorNome = new Map(exercicios.map((e) => [e.nome, e.id]));

  const semExercicio = nomesNecessarios.filter((n) => !idPorNome.has(n));
  if (semExercicio.length > 0) {
    throw new Error(
      `instalarTemplatesArranqueFutsal: instala primeiro a biblioteca de futsal. Exercícios em falta: ${semExercicio.join(", ")}.`,
    );
  }

  let criados = 0;
  for (const template of emFalta) {
    const modelo = await db.modeloSessao.create({
      data: {
        autorId: criadorId,
        proprietario: "CLUBE",
        clubeProprietarioId: clubeId,
        modalidade: null,
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
 * Orquestração do conteúdo de arranque de FUTSAL, pela ordem de dependências:
 * subcategorias → exercícios → templates. Idempotente.
 */
export async function instalarConteudoArranqueFutsal(
  clubeId: string,
  db: ClientePrisma = prisma,
): Promise<ResumoArranque> {
  const sub = await instalarSubcategoriasFutsal(clubeId, db);
  const ex = await instalarBibliotecaArranqueFutsal(clubeId, db);
  const tpl = await instalarTemplatesArranqueFutsal(clubeId, db);
  return {
    subcategorias: sub.criadas,
    exercicios: ex.criados,
    templates: tpl.criados,
  };
}

/**
 * Instala o conteúdo curado da modalidade indicada (§8.1.1). Dispatcher usado
 * pelo onboarding para que a secção inicial do clube nunca comece vazia.
 * Idempotente: pode ser re-executado sem duplicar conteúdo.
 */
export async function instalarConteudoArranquePorModalidade(
  clubeId: string,
  modalidade: "FUTSAL" | "FUTEBOL",
  db: ClientePrisma = prisma,
): Promise<ResumoArranque> {
  return modalidade === "FUTEBOL"
    ? instalarConteudoArranqueFutebol(clubeId, db)
    : instalarConteudoArranqueFutsal(clubeId, db);
}
