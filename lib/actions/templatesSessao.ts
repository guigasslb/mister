"use server";

// Templates de sessão (ModeloSessao) — bibliotecas 🎒 pessoal / 🏛️ clube (secção 3.4).
// Um template é uma sessão completa pré-construída e reutilizável. Criar uma sessão
// a partir de um template COPIA os exercícios/durações: o template não fica ligado
// à sessão (é um ponto de partida editável).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  criarModeloSessaoSchema,
  criarSessaoDeTemplateSchema,
} from "@/lib/schemas/exercicio";
import {
  filtroExerciciosVisiveis,
  filtroModelosSessaoVisiveis,
  origemDoItem,
  type OrigemBiblioteca,
} from "@/lib/biblioteca";
import { TEMPLATES_ARRANQUE } from "@/lib/templates-arranque";
import { construirSnapshotExercicio } from "@/lib/snapshot-exercicio";
import { Prisma, type ModeloSessao, type Sessao } from "@prisma/client";

// A listagem de templates vive em /treinos/templates (code review F3 — M5).
const PATH_TEMPLATES = "/treinos/templates";
const PATH_TREINOS = "/treinos";
// O picker de exercícios (biblioteca) vive em /exercicios — revalidado apenas
// nos fluxos que também mexem na biblioteca (ex.: instalar os seeds de arranque).
const PATH_EXERCICIOS = "/exercicios";

const INCLUDE_MODELO = {
  exercicios: {
    orderBy: { ordem: "asc" },
    include: {
      exercicio: {
        select: {
          id: true,
          nome: true,
          descricao: true,
          objetivo: true,
          duracaoMin: true,
          categoriaPrincipal: true,
          parteTreino: true,
          diagrama: true,
          proprietario: true,
        },
      },
    },
  },
} as const;

export type ModeloSessaoComExercicios = Prisma.ModeloSessaoGetPayload<{
  include: typeof INCLUDE_MODELO;
}> & { origem: OrigemBiblioteca };

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

// ─── Leitura ─────────────────────────────────────────────────────────────────

/** Templates visíveis: 🎒 pessoais do treinador + 🏛️ do clube ativo. */
export async function listarModelosSessao(
  escalaoAlvo?: string,
): Promise<Resultado<ModeloSessaoComExercicios[]>> {
  const ctx = await contextoLeitura();
  if (ctx.estado === "erro") return erro(ctx.erro);

  const alvo = (escalaoAlvo ?? "").trim();

  const modelos = await prisma.modeloSessao.findMany({
    where: {
      AND: [
        filtroModelosSessaoVisiveis(ctx.clubeId, ctx.utilizadorId),
        ...(alvo ? [{ escalaoAlvo: { equals: alvo, mode: "insensitive" as const } }] : []),
      ],
    },
    include: INCLUDE_MODELO,
    orderBy: [{ nome: "asc" }],
  });

  return ok(
    modelos.map((m) => ({ ...m, origem: origemDoItem(m, ctx.utilizadorId) })),
  );
}

export async function obterModeloSessao(
  id: string,
): Promise<Resultado<ModeloSessaoComExercicios>> {
  const ctx = await contextoLeitura();
  if (ctx.estado === "erro") return erro(ctx.erro);

  const modelo = await prisma.modeloSessao.findFirst({
    where: { AND: [{ id }, filtroModelosSessaoVisiveis(ctx.clubeId, ctx.utilizadorId)] },
    include: INCLUDE_MODELO,
  });
  if (!modelo) return erro("Template de sessão não encontrado");
  return ok({ ...modelo, origem: origemDoItem(modelo, ctx.utilizadorId) });
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Permissão base para gerir templates: `EXERCICIOS_GERIR` ou, em alternativa,
 * `TREINOS_GERIR` (quem monta treinos monta templates). Contribuir para a
 * biblioteca do clube (proprietario = CLUBE) exige sempre `EXERCICIOS_GERIR`.
 */
type PermTemplates =
  | { ok: false; erro: string }
  | {
      ok: true;
      clubeId: string;
      utilizadorId: string;
      podeBibliotecaClube: boolean;
    };

async function exigirGestaoTemplates(): Promise<PermTemplates> {
  const permExercicios = await exigirCapacidade("EXERCICIOS_GERIR");
  if (permExercicios.ok) {
    return {
      ok: true,
      clubeId: permExercicios.ctx.clube.id,
      utilizadorId: permExercicios.ctx.utilizadorId,
      podeBibliotecaClube: true,
    };
  }

  const permTreinos = await exigirCapacidade("TREINOS_GERIR");
  if (permTreinos.ok) {
    return {
      ok: true,
      clubeId: permTreinos.ctx.clube.id,
      utilizadorId: permTreinos.ctx.utilizadorId,
      podeBibliotecaClube: false,
    };
  }

  return { ok: false, erro: permExercicios.erro };
}

/** Confirma que todos os exercícios indicados são visíveis ao membro. */
async function exerciciosVisiveis(
  ids: string[],
  clubeId: string,
  utilizadorId: string,
): Promise<boolean> {
  const unicos = [...new Set(ids)];
  const filtroVisivel = await filtroExerciciosVisiveis(clubeId, utilizadorId);
  const encontrados = await prisma.exercicio.count({
    where: {
      AND: [{ id: { in: unicos } }, filtroVisivel],
    },
  });
  return encontrados === unicos.length;
}

export async function criarModeloSessao(dados: unknown): Promise<Resultado<ModeloSessao>> {
  const perm = await exigirGestaoTemplates();
  if (!perm.ok) return erro(perm.erro);

  const parsed = criarModeloSessaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const dadosModelo = parsed.data;

  if (dadosModelo.proprietario === "CLUBE" && !perm.podeBibliotecaClube)
    return erro("Sem permissão para contribuir para a biblioteca do clube");

  const todosVisiveis = await exerciciosVisiveis(
    dadosModelo.exercicios.map((e) => e.exercicioId),
    perm.clubeId,
    perm.utilizadorId,
  );
  if (!todosVisiveis) return erro("Um ou mais exercícios não estão disponíveis na biblioteca.");

  const modelo = await prisma.$transaction(async (tx) => {
    const criado = await tx.modeloSessao.create({
      data: {
        autorId: perm.utilizadorId,
        proprietario: dadosModelo.proprietario,
        clubeProprietarioId: dadosModelo.proprietario === "CLUBE" ? perm.clubeId : null,
        nome: dadosModelo.nome,
        descricao: dadosModelo.descricao ?? null,
        objetivoTatico: dadosModelo.objetivoTatico ?? null,
        faseEpoca: dadosModelo.faseEpoca ?? null,
        escalaoAlvo: dadosModelo.escalaoAlvo ?? null,
        duracaoMin: dadosModelo.duracaoMin ?? null,
      },
    });

    await tx.modeloSessaoExercicio.createMany({
      data: dadosModelo.exercicios.map((e) => ({
        modeloSessaoId: criado.id,
        exercicioId: e.exercicioId,
        ordem: e.ordem,
        duracaoMin: e.duracaoMin ?? null,
        parteTreino: e.parteTreino ?? null,
        notas: e.notas ?? null,
      })),
    });

    return criado;
  });

  revalidatePath(PATH_TEMPLATES);
  revalidatePath(PATH_TREINOS);
  return ok(modelo);
}

export async function atualizarModeloSessao(
  id: string,
  dados: unknown,
): Promise<Resultado<ModeloSessao>> {
  const perm = await exigirGestaoTemplates();
  if (!perm.ok) return erro(perm.erro);

  const parsed = criarModeloSessaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const dadosModelo = parsed.data;

  const existe = await prisma.modeloSessao.findFirst({
    where: { AND: [{ id }, filtroModelosSessaoVisiveis(perm.clubeId, perm.utilizadorId)] },
  });
  if (!existe) return erro("Template de sessão não encontrado");

  if (existe.proprietario === "TREINADOR" && existe.autorId !== perm.utilizadorId)
    return erro("Só o autor pode editar um template da biblioteca pessoal.");
  if (existe.proprietario === "CLUBE" && !perm.podeBibliotecaClube)
    return erro("Sem permissão para editar templates da biblioteca do clube");

  const todosVisiveis = await exerciciosVisiveis(
    dadosModelo.exercicios.map((e) => e.exercicioId),
    perm.clubeId,
    perm.utilizadorId,
  );
  if (!todosVisiveis) return erro("Um ou mais exercícios não estão disponíveis na biblioteca.");

  const modelo = await prisma.$transaction(async (tx) => {
    const atualizado = await tx.modeloSessao.update({
      where: { id },
      data: {
        // A propriedade NÃO se altera na edição (code review F3 — M3): passa-se de
        // pessoal a clube pelo toggle de partilha (partilharModeloSessaoNoClube),
        // nunca por edição. Reescrever aqui `proprietario`/`clubeProprietarioId`
        // com o default do schema (TREINADOR) esvaziaria a propriedade de um
        // template do clube. À semelhança de `atualizarExercicio`, ignoram-se.
        nome: dadosModelo.nome,
        descricao: dadosModelo.descricao ?? null,
        objetivoTatico: dadosModelo.objetivoTatico ?? null,
        faseEpoca: dadosModelo.faseEpoca ?? null,
        escalaoAlvo: dadosModelo.escalaoAlvo ?? null,
        duracaoMin: dadosModelo.duracaoMin ?? null,
      },
    });

    // A lista de exercícios é substituída por inteiro (evita colisões no
    // unique [modeloSessaoId, ordem] e simplifica a reordenação no cliente).
    await tx.modeloSessaoExercicio.deleteMany({ where: { modeloSessaoId: id } });
    await tx.modeloSessaoExercicio.createMany({
      data: dadosModelo.exercicios.map((e) => ({
        modeloSessaoId: id,
        exercicioId: e.exercicioId,
        ordem: e.ordem,
        duracaoMin: e.duracaoMin ?? null,
        parteTreino: e.parteTreino ?? null,
        notas: e.notas ?? null,
      })),
    });

    return atualizado;
  });

  revalidatePath(PATH_TEMPLATES);
  return ok(modelo);
}

export async function apagarModeloSessao(id: string): Promise<Resultado<void>> {
  const perm = await exigirGestaoTemplates();
  if (!perm.ok) return erro(perm.erro);

  const existe = await prisma.modeloSessao.findFirst({
    where: { AND: [{ id }, filtroModelosSessaoVisiveis(perm.clubeId, perm.utilizadorId)] },
  });
  if (!existe) return erro("Template de sessão não encontrado");

  // 🎒 pessoal: só o autor apaga. 🏛️ clube: quem tem EXERCICIOS_GERIR no clube.
  if (existe.proprietario === "TREINADOR" && existe.autorId !== perm.utilizadorId)
    return erro("Só o autor pode apagar um template da biblioteca pessoal.");
  if (existe.proprietario === "CLUBE" && !perm.podeBibliotecaClube)
    return erro("Sem permissão para apagar templates da biblioteca do clube");

  // ModeloSessaoExercicio tem onDelete: Cascade — as linhas seguem o template.
  await prisma.modeloSessao.delete({ where: { id } });
  revalidatePath(PATH_TEMPLATES);
  return ok(undefined);
}

/**
 * Contribui com um template 🎒 pessoal para a biblioteca 🏛️ do clube ativo.
 * Ao contrário dos exercícios (partilha por PartilhaExercicioClube), a contribuição
 * de um template transfere a propriedade para o clube (secção 3.4).
 */
export async function partilharModeloSessaoNoClube(id: string): Promise<Resultado<void>> {
  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;
  const utilizadorId = perm.ctx.utilizadorId;

  const modelo = await prisma.modeloSessao.findUnique({
    where: { id },
    select: { id: true, autorId: true, proprietario: true, clubeProprietarioId: true },
  });
  if (!modelo) return erro("Template de sessão não encontrado");
  if (modelo.autorId !== utilizadorId)
    return erro("Só o autor pode partilhar o template na biblioteca do clube.");
  // Só templates 🎒 pessoais (proprietario = TREINADOR) podem ser contribuídos:
  // um template 🏛️ do clube já pertence a um clube (code review F3 — M2).
  if (modelo.proprietario !== "TREINADOR")
    return erro("Só pode partilhar templates da sua biblioteca pessoal.");

  await prisma.modeloSessao.update({
    where: { id },
    data: { proprietario: "CLUBE", clubeProprietarioId: clubeId },
  });
  revalidatePath(PATH_TEMPLATES);
  return ok(undefined);
}

// ─── Sessão a partir de template ─────────────────────────────────────────────

/**
 * Cria uma sessão de treino a partir de um template. Os exercícios, durações,
 * ordem e notas são COPIADOS para a `Sessao` — não fica qualquer ligação
 * persistente ao template (é um ponto de partida editável, secção 3.4).
 *
 * Preservação de histórico (secção 3.3): a cópia guarda o `exercicioId` em
 * `SessaoExercicio`, cuja FK é `onDelete: Restrict`. Um exercício usado numa
 * sessão do clube deixa de poder ser apagado (ver `apagarExercicio`), pelo que
 * os planos de treino passados continuam legíveis mesmo que o treinador autor
 * saia do clube — o registo da sessão é, na prática, o snapshot do que foi feito.
 */
export async function criarSessaoDeTemplate(dados: unknown): Promise<Resultado<Sessao>> {
  const parsed = criarSessaoDeTemplateSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const { modeloSessaoId, escalaoId, data, epocaId } = parsed.data;

  const perm = await exigirCapacidade("TREINOS_GERIR", escalaoId);
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;
  const utilizadorId = perm.ctx.utilizadorId;

  const escalao = await prisma.escalao.findFirst({ where: { id: escalaoId, clubeId } });
  if (!escalao) return erro("O escalão selecionado não existe");

  let epocaAlvoId: string;
  if (epocaId) {
    const epoca = await prisma.epoca.findFirst({ where: { id: epocaId, clubeId } });
    if (!epoca) return erro("Época não encontrada");
    epocaAlvoId = epoca.id;
  } else {
    const epoca = await obterEpocaAtiva();
    if (!epoca) return erro("Nenhuma época ativa");
    epocaAlvoId = epoca.id;
  }

  const modelo = await prisma.modeloSessao.findFirst({
    where: {
      AND: [{ id: modeloSessaoId }, filtroModelosSessaoVisiveis(clubeId, utilizadorId)],
    },
    include: INCLUDE_MODELO,
  });
  if (!modelo) return erro("Template de sessão não encontrado");

  const exerciciosOrdenados = [...modelo.exercicios].sort((a, b) => a.ordem - b.ordem);

  const sessao = await prisma.$transaction(async (tx) => {
    const criada = await tx.sessao.create({
      data: {
        data,
        escalaoId,
        epocaId: epocaAlvoId,
        tipoSessao: "NORMAL",
        duracaoMin: modelo.duracaoMin ?? null,
        objetivo: modelo.objetivoTatico ?? null,
        notas: modelo.descricao ?? null,
        criadorId: utilizadorId,
      },
    });

    if (exerciciosOrdenados.length > 0) {
      // §4.2.1: instante único do snapshot para todos os exercícios portáteis copiados
      // nesta operação (o snapshot congela o estado no momento da adição à sessão).
      const agora = new Date();
      await tx.sessaoExercicio.createMany({
        // Ordem reindexada (0..n-1) para respeitar o unique [sessaoId, ordem].
        data: exerciciosOrdenados.map((e, i) => ({
          sessaoId: criada.id,
          exercicioId: e.exercicioId,
          ordem: i,
          duracaoMin: e.duracaoMin ?? e.exercicio.duracaoMin ?? null,
          notas: e.notas ?? null,
          // Exercícios do treinador geram snapshot; do clube não (helper devolve null).
          ...(construirSnapshotExercicio(e.exercicio, agora) ?? {}),
        })),
      });
    }

    return criada;
  });

  revalidatePath(PATH_TREINOS);
  revalidatePath(`${PATH_TREINOS}/${sessao.id}`);
  return ok(sessao);
}

// ─── Templates curados de arranque (seed) ────────────────────────────────────

/**
 * Instala os templates 🏛️ curados de arranque no clube ativo. Idempotente:
 * se o clube já tem templates de seed, não faz nada (devolve `criados: 0`).
 * Requer a biblioteca de exercícios de arranque instalada (os templates
 * referenciam-na pelo nome).
 */
export async function instalarTemplatesArranque(): Promise<Resultado<{ criados: number }>> {
  const perm = await exigirCapacidade("EXERCICIOS_GERIR");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;
  const utilizadorId = perm.ctx.utilizadorId;

  const jaTem = await prisma.modeloSessao.count({
    where: { clubeProprietarioId: clubeId, origemSeed: true },
  });
  if (jaTem > 0) return ok({ criados: 0 });

  const nomesNecessarios = [
    ...new Set(TEMPLATES_ARRANQUE.flatMap((t) => t.exercicios.map((e) => e.nomeExercicio))),
  ];
  const exercicios = await prisma.exercicio.findMany({
    where: { clubeId, origemSeed: true, nome: { in: nomesNecessarios } },
    select: { id: true, nome: true },
  });
  const idPorNome = new Map(exercicios.map((e) => [e.nome, e.id]));

  const emFalta = nomesNecessarios.filter((n) => !idPorNome.has(n));
  if (emFalta.length > 0)
    return erro(
      "Instala primeiro a biblioteca de exercícios de arranque para poderes instalar os templates.",
    );

  // Idempotência real (code review F3 — M6): além da verificação rápida acima,
  // a contagem é reavaliada DENTRO da transação com isolamento Serializable, para
  // que dois cliques concorrentes não instalem os templates em duplicado (o
  // PostgreSQL aborta um deles com erro de serialização). `skipDuplicates` nas
  // linhas de exercício respeita o unique [modeloSessaoId, ordem].
  const criados = await prisma.$transaction(
    async (tx) => {
      const aindaVazio = await tx.modeloSessao.count({
        where: { clubeProprietarioId: clubeId, origemSeed: true },
      });
      if (aindaVazio > 0) return 0;

      for (const template of TEMPLATES_ARRANQUE) {
        const criado = await tx.modeloSessao.create({
          data: {
            autorId: utilizadorId,
            proprietario: "CLUBE",
            clubeProprietarioId: clubeId,
            origemSeed: true,
            nome: template.nome,
            descricao: template.descricao,
            objetivoTatico: template.objetivoTatico,
            faseEpoca: template.faseEpoca,
            escalaoAlvo: template.escalaoAlvo,
            duracaoMin: template.duracaoMin,
          },
        });

        await tx.modeloSessaoExercicio.createMany({
          data: template.exercicios.map((e, i) => ({
            modeloSessaoId: criado.id,
            exercicioId: idPorNome.get(e.nomeExercicio)!,
            ordem: i,
            duracaoMin: e.duracaoMin,
            parteTreino: e.parteTreino,
            notas: e.notas ?? null,
          })),
          skipDuplicates: true,
        });
      }

      return TEMPLATES_ARRANQUE.length;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  revalidatePath(PATH_TEMPLATES);
  revalidatePath(PATH_TREINOS);
  // O picker de exercícios pode refletir o estado dos seeds instalados.
  revalidatePath(PATH_EXERCICIOS);
  return ok({ criados });
}
