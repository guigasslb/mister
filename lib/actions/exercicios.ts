"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { exercicioSchema, partilharExercicioSchema } from "@/lib/schemas/exercicio";
import {
  filtroExerciciosVisiveis,
  origemDoItem,
  type OrigemBiblioteca,
} from "@/lib/biblioteca";
import { BIBLIOTECA_ARRANQUE } from "@/lib/biblioteca-arranque";
import { Prisma } from "@prisma/client";
import type {
  CategoriaExercicioPrincipal,
  Exercicio,
  Modalidade,
  ParteTreino,
} from "@prisma/client";

/**
 * Filtro de modalidade da biblioteca (§8.6). `"TODAS"` (ou ausente) = sem filtro.
 * Uma modalidade concreta inclui sempre os itens universais (`modalidade = null`),
 * que servem as duas modalidades.
 */
export type FiltroModalidade = Modalidade | "TODAS";

const PATH = "/exercicios";

/** Identidade mínima do autor, para a etiqueta discreta de criador nas listagens. */
export type CriadorLite = { id: string; nome: string } | null;

/** Exercício da biblioteca, anotado com a origem (🎒 pessoal ou 🏛️ clube). */
export type ExercicioBiblioteca = Exercicio & {
  origem: OrigemBiblioteca;
  /**
   * O exercício está na biblioteca 🏛️ do clube ativo — por propriedade
   * (`proprietario = CLUBE`) ou por contribuição explícita (PartilhaExercicioClube).
   * A UI precisa desta anotação para saber se mostra "Partilhar no clube" ou
   * "Remover da biblioteca do clube" (o toggle da secção 3.3).
   */
  naBibliotecaDoClube: boolean;
  /** Autor do exercício, para a etiqueta discreta de criador (null se legado). */
  criador: CriadorLite;
};

/** Linha do Prisma com as partilhas do clube ativo carregadas. */
type ExercicioComPartilhas = Exercicio & {
  partilhasClube: { id: string }[];
  criador: CriadorLite;
};

/**
 * Anota a linha com origem + presença na biblioteca do clube e remove a relação
 * `partilhasClube` (detalhe de leitura que não faz parte do contrato público).
 */
function anotar(
  linha: ExercicioComPartilhas,
  clubeId: string,
  utilizadorId: string,
): ExercicioBiblioteca {
  const { partilhasClube, ...exercicio } = linha;
  // Propriedade do clube ativo — incluindo as linhas legadas da fase expand,
  // em que `clubeProprietarioId` ainda é null e só o `clubeId` está preenchido.
  const doClube =
    exercicio.proprietario === "CLUBE" &&
    (exercicio.clubeProprietarioId === clubeId ||
      (exercicio.clubeProprietarioId === null && exercicio.clubeId === clubeId));

  return {
    ...exercicio,
    origem: origemDoItem(exercicio, utilizadorId),
    naBibliotecaDoClube: doClube || partilhasClube.length > 0,
  };
}

type ContextoBiblioteca =
  | { estado: "erro"; erro: string }
  | { estado: "ok"; clubeId: string; utilizadorId: string };

/** Contexto de leitura: utilizador autenticado + clube ativo. */
async function contextoLeitura(): Promise<ContextoBiblioteca> {
  const session = await auth();
  const utilizadorId = session?.user?.id;
  if (!utilizadorId) return { estado: "erro", erro: "Não autenticado" };
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return { estado: "erro", erro: "Não autenticado" };
  return { estado: "ok", clubeId, utilizadorId };
}

/**
 * Biblioteca visível ao membro: 🎒 exercícios pessoais do treinador ∪ 🏛️ exercícios
 * do clube (próprios do clube + contribuições explícitas via PartilhaExercicioClube).
 * Filtros opcionais por parte do treino, categoria principal, pesquisa por nome
 * e modalidade (§8.6). Na modalidade concreta incluem-se os itens universais
 * (`modalidade = null`); `"TODAS"` (default) não filtra por modalidade.
 */
export async function listarExercicios(
  parteTreino?: ParteTreino,
  categoriaPrincipal?: CategoriaExercicioPrincipal,
  q?: string,
  modalidade: FiltroModalidade = "TODAS",
): Promise<Resultado<ExercicioBiblioteca[]>> {
  const ctx = await contextoLeitura();
  if (ctx.estado === "erro") return erro(ctx.erro);

  const termo = (q ?? "").trim();

  const exercicios = await prisma.exercicio.findMany({
    where: {
      AND: [
        filtroExerciciosVisiveis(ctx.clubeId, ctx.utilizadorId),
        ...(parteTreino ? [{ parteTreino }] : []),
        ...(categoriaPrincipal ? [{ categoriaPrincipal }] : []),
        ...(termo ? [{ nome: { contains: termo, mode: "insensitive" as const } }] : []),
        ...(modalidade !== "TODAS"
          ? [{ OR: [{ modalidade }, { modalidade: null }] }]
          : []),
      ],
    },
    include: {
      partilhasClube: { where: { clubeId: ctx.clubeId }, select: { id: true } },
      criador: { select: { id: true, nome: true } },
    },
    orderBy: [{ categoriaPrincipal: "asc" }, { nome: "asc" }],
  });

  return ok(exercicios.map((e) => anotar(e, ctx.clubeId, ctx.utilizadorId)));
}

export async function obterExercicio(id: string): Promise<Resultado<ExercicioBiblioteca>> {
  const ctx = await contextoLeitura();
  if (ctx.estado === "erro") return erro(ctx.erro);

  const exercicio = await prisma.exercicio.findFirst({
    where: { AND: [{ id }, filtroExerciciosVisiveis(ctx.clubeId, ctx.utilizadorId)] },
    include: {
      partilhasClube: { where: { clubeId: ctx.clubeId }, select: { id: true } },
      criador: { select: { id: true, nome: true } },
    },
  });
  if (!exercicio) return erro("Exercício não encontrado");
  return ok(anotar(exercicio, ctx.clubeId, ctx.utilizadorId));
}

export async function criarExercicio(dados: unknown): Promise<Resultado<Exercicio>> {
  const session = await auth();
  if (!session?.user?.id) return erro("Não autenticado");

  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const parsed = exercicioSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  if (parsed.data.subcategoriaId) {
    const sub = await prisma.subcategoriaExercicio.findFirst({
      where: { id: parsed.data.subcategoriaId, clubeId },
    });
    if (!sub) return erro("Subcategoria não encontrada");
  }

  const { diagrama, proprietario, ...resto } = parsed.data;

  // F3 (secção 4.2): a propriedade é decidida pelo toggle na criação — pessoal por
  // defeito (TREINADOR), clube só se explicitamente escolhido. `autorId` regista
  // sempre quem criou. Dual-write dos campos legados (clubeId/criadorId) enquanto
  // a fase expand M5 não é consolidada pelo backfill M6.
  const exercicio = await prisma.exercicio.create({
    data: {
      ...resto,
      diagrama: diagrama ?? undefined,
      autorId: session.user.id,
      proprietario,
      clubeProprietarioId: proprietario === "CLUBE" ? clubeId : null,
      clubeId,
      criadorId: session.user.id,
    },
  });
  revalidatePath(PATH);
  return ok(exercicio);
}

export async function atualizarExercicio(
  id: string,
  dados: unknown,
): Promise<Resultado<Exercicio>> {
  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;
  const utilizadorId = perm.ctx.utilizadorId;

  const parsed = exercicioSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const existe = await prisma.exercicio.findFirst({
    where: { AND: [{ id }, filtroExerciciosVisiveis(clubeId, utilizadorId)] },
  });
  if (!existe) return erro("Exercício não encontrado");

  // Um exercício 🎒 pessoal só é editável pelo autor — mesmo quando está partilhado
  // na biblioteca do clube (a partilha dá leitura, não escrita).
  if (existe.proprietario === "TREINADOR" && existe.autorId !== utilizadorId)
    return erro("Só o autor pode editar um exercício da biblioteca pessoal.");

  if (parsed.data.subcategoriaId) {
    const sub = await prisma.subcategoriaExercicio.findFirst({
      where: { id: parsed.data.subcategoriaId, clubeId },
    });
    if (!sub) return erro("Subcategoria não encontrada");
  }

  // A propriedade não se altera aqui: passa-se de pessoal a clube pelo toggle de
  // partilha (partilharExercicioNoClube), nunca por edição.
  const exercicio = await prisma.exercicio.update({
    where: { id },
    data: {
      nome: parsed.data.nome,
      descricao: parsed.data.descricao ?? null,
      objetivo: parsed.data.objetivo ?? null,
      duracaoMin: parsed.data.duracaoMin ?? null,
      categoriaPrincipal: parsed.data.categoriaPrincipal ?? null,
      subcategoriaId: parsed.data.subcategoriaId ?? null,
      // Campos opcionais da organização da biblioteca (secção 3.3): só são
      // reescritos se vieram explicitamente no payload — `undefined` significa
      // "não fornecido" (não "apagar"). Ver code review F3 (M4).
      ...(parsed.data.parteTreino !== undefined && { parteTreino: parsed.data.parteTreino }),
      ...(parsed.data.escalaoAlvo !== undefined && { escalaoAlvo: parsed.data.escalaoAlvo }),
      diagrama: parsed.data.diagrama ?? undefined,
    },
  });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return ok(exercicio);
}

export async function apagarExercicio(id: string): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;
  const utilizadorId = perm.ctx.utilizadorId;

  const existe = await prisma.exercicio.findFirst({
    where: { AND: [{ id }, filtroExerciciosVisiveis(clubeId, utilizadorId)] },
  });
  if (!existe) return erro("Exercício não encontrado");

  if (existe.proprietario === "TREINADOR" && existe.autorId !== utilizadorId)
    return erro("Só o autor pode apagar um exercício da biblioteca pessoal.");

  const emUso = await prisma.sessaoExercicio.count({ where: { exercicioId: id } });
  if (emUso > 0)
    return erro(
      `Este exercício está a ser usado em ${emUso} sessão(ões) de treino e não pode ser apagado.`,
    );

  const emTemplates = await prisma.modeloSessaoExercicio.count({
    where: { exercicioId: id },
  });
  if (emTemplates > 0)
    return erro(
      `Este exercício está a ser usado em ${emTemplates} template(s) de sessão e não pode ser apagado.`,
    );

  await prisma.exercicio.delete({ where: { id } });
  revalidatePath(PATH);
  return ok(undefined);
}

/**
 * Duplica um exercício visível (🎒 pessoal ou 🏛️ do clube) para a biblioteca
 * pessoal do utilizador autenticado (UX-P3-06). A cópia fica sempre privada:
 * `proprietario = TREINADOR`, sem contribuição no clube (partilhado = false),
 * com o nome sufixado por " (cópia)". A duplicação não copia a `origemSeed`
 * (uma cópia nunca é um item curado) nem as partilhas do original.
 */
export async function duplicarExercicio(id: string): Promise<Resultado<Exercicio>> {
  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;
  const utilizadorId = perm.ctx.utilizadorId;

  // O filtro de visibilidade garante que o utilizador vê o exercício no clube
  // ativo (pessoal próprio ou biblioteca do clube) antes de o poder duplicar.
  const original = await prisma.exercicio.findFirst({
    where: { AND: [{ id }, filtroExerciciosVisiveis(clubeId, utilizadorId)] },
  });
  if (!original) return erro("Exercício não encontrado");

  const copia = await prisma.exercicio.create({
    data: {
      nome: `${original.nome} (cópia)`,
      descricao: original.descricao,
      objetivo: original.objetivo,
      duracaoMin: original.duracaoMin,
      categoriaPrincipal: original.categoriaPrincipal,
      subcategoriaId: original.subcategoriaId,
      modalidade: original.modalidade,
      parteTreino: original.parteTreino,
      escalaoAlvo: original.escalaoAlvo,
      // O diagrama nulo tem de passar como `undefined` (o Prisma rejeita `null`
      // literal em campos Json — usaria JsonNull/DbNull).
      diagrama:
        original.diagrama == null
          ? undefined
          : (original.diagrama as Prisma.InputJsonValue),
      // A cópia é sempre 🎒 pessoal do utilizador, independentemente da origem.
      proprietario: "TREINADOR",
      clubeProprietarioId: null,
      autorId: utilizadorId,
      origemSeed: false,
      // Dual-write dos campos legados (fase expand).
      clubeId,
      criadorId: utilizadorId,
    },
  });

  revalidatePath(PATH);
  return ok(copia);
}

// ─── Partilha na biblioteca do clube (toggle explícito — secção 3.3) ─────────

/**
 * Contribui com um exercício 🎒 pessoal para a biblioteca 🏛️ do clube ativo.
 * A propriedade NÃO é transferida: o autor mantém o exercício na sua biblioteca
 * pessoal e leva-o consigo (secção 4.2). Idempotente.
 */
export async function partilharExercicioNoClube(dados: unknown): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;
  const utilizadorId = perm.ctx.utilizadorId;

  const parsed = partilharExercicioSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const { exercicioId } = parsed.data;

  // Buscar com o filtro de visibilidade garante que o membro vê o exercício
  // no clube ativo antes de o poder contribuir (code review F3 — M1).
  const exercicio = await prisma.exercicio.findFirst({
    where: { AND: [{ id: exercicioId }, filtroExerciciosVisiveis(clubeId, utilizadorId)] },
    select: { id: true, autorId: true, proprietario: true },
  });
  if (!exercicio) return erro("Exercício não encontrado");
  if (exercicio.autorId !== utilizadorId)
    return erro("Só o autor pode partilhar o exercício na biblioteca do clube.");
  // Só exercícios 🎒 pessoais (proprietario = TREINADOR) podem ser contribuídos:
  // um exercício 🏛️ do clube já é do clube, não faz sentido "partilhá-lo".
  if (exercicio.proprietario !== "TREINADOR")
    return erro("Só pode partilhar exercícios da sua biblioteca pessoal.");

  await prisma.partilhaExercicioClube.upsert({
    where: { exercicioId_clubeId: { exercicioId, clubeId } },
    create: { exercicioId, clubeId },
    update: {},
  });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${exercicioId}`);
  return ok(undefined);
}

/** Retira o exercício da biblioteca do clube ativo. Idempotente. */
export async function removerPartilhaNoClube(dados: unknown): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;
  const utilizadorId = perm.ctx.utilizadorId;

  const parsed = partilharExercicioSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const { exercicioId } = parsed.data;

  const exercicio = await prisma.exercicio.findUnique({
    where: { id: exercicioId },
    select: { id: true, autorId: true },
  });
  if (!exercicio) return erro("Exercício não encontrado");
  if (exercicio.autorId !== utilizadorId)
    return erro("Só o autor pode remover a partilha do exercício.");

  await prisma.partilhaExercicioClube.deleteMany({ where: { exercicioId, clubeId } });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${exercicioId}`);
  return ok(undefined);
}

// ─── Biblioteca curada de arranque (seed) ────────────────────────────────────

/**
 * Instala a biblioteca 🏛️ curada de arranque no clube ativo. Idempotente:
 * se o clube já tem exercícios de seed, não faz nada (devolve `criados: 0`).
 */
export async function instalarBibliotecaArranque(): Promise<Resultado<{ criados: number }>> {
  const session = await auth();
  if (!session?.user?.id) return erro("Não autenticado");

  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const dados: Prisma.ExercicioCreateManyInput[] = BIBLIOTECA_ARRANQUE.map((e) => ({
    nome: e.nome,
    descricao: e.descricao,
    objetivo: e.objetivo,
    duracaoMin: e.duracaoMin,
    categoriaPrincipal: e.categoriaPrincipal,
    parteTreino: e.parteTreino,
    escalaoAlvo: e.escalaoAlvo ?? null,
    diagrama: e.diagrama as unknown as Prisma.InputJsonValue,
    // Biblioteca do clube (🏛️): propriedade do clube, autoria de quem instalou.
    proprietario: "CLUBE",
    clubeProprietarioId: clubeId,
    autorId: session.user!.id!,
    // Dual-write dos campos legados (fase expand).
    clubeId,
    criadorId: session.user!.id!,
    origemSeed: true,
  }));

  // Idempotência real (code review F3 — M6): não há constraint única de nome+clube
  // no schema (não se acrescentam migrations aqui), pelo que `skipDuplicates` não
  // ajudaria. A contagem e a inserção correm na mesma transação com isolamento
  // Serializable — dois cliques concorrentes não conseguem ambos observar "vazio"
  // e inserir (o PostgreSQL aborta um deles com erro de serialização).
  const criados = await prisma.$transaction(
    async (tx) => {
      const jaTem = await tx.exercicio.count({ where: { clubeId, origemSeed: true } });
      if (jaTem > 0) return 0;
      await tx.exercicio.createMany({ data: dados });
      return dados.length;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  revalidatePath(PATH);
  return ok({ criados });
}
