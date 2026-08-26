"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerEscalao, escaloesLegiveis, obterMembroAtual } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  sessaoSchema,
  marcarPresencasSchema,
  notasSessaoSchema,
  sessaoExercicioOverrideSchema,
} from "@/lib/schemas/treino";
import { alcanceSchema } from "@/lib/schemas/planoSemanal";
import { construirSnapshotExercicio } from "@/lib/snapshot-exercicio";
import { combinarDataHora, duracaoEntreHoras, horaDeData, somarMinutos } from "@/lib/plano-semanal";
import { Prisma, type Epoca, type Sessao } from "@prisma/client";

const PATH = "/treinos";

const INCLUDE_LISTA = {
  escalao: { select: { id: true, nome: true } },
  _count: { select: { exercicios: true } },
  presencas: { select: { estado: true } },
  planeamento: { select: { id: true, tipo: true, dataInicio: true, dataFim: true, microciclo: true } },
  // Etiqueta discreta de autor nas listagens: quem criou a sessão (§ mostrar criador).
  criador: { select: { id: true, nome: true } },
} as const;

const INCLUDE_DETALHE = {
  escalao: { select: { id: true, nome: true } },
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
          diagrama: true,
        },
      },
    },
  },
  presencas: {
    include: { atleta: { select: { id: true, nome: true, posicoes: true } } },
  },
} as const;

export type SessaoLista = Prisma.SessaoGetPayload<{ include: typeof INCLUDE_LISTA }>;

/**
 * Detalhe da sessão. O número de camisola já não vive no Atleta (F1) — é resolvido
 * a partir da participação (AtletaEscalao) no escalão/época da sessão.
 */
export type SessaoDetalhe = Prisma.SessaoGetPayload<{ include: typeof INCLUDE_DETALHE }> & {
  numeroPorAtleta: Record<string, number | null>;
};

/** Números de camisola dos atletas indicados, no escalão/época dados. */
async function resolverNumeros(
  escalaoId: string,
  epocaId: string,
  atletaIds: string[],
): Promise<Record<string, number | null>> {
  if (atletaIds.length === 0) return {};
  const participacoes = await prisma.atletaEscalao.findMany({
    where: { escalaoId, epocaId, atletaId: { in: atletaIds } },
    select: { atletaId: true, numero: true },
  });
  const numeroPorAtleta: Record<string, number | null> = {};
  for (const id of atletaIds) numeroPorAtleta[id] = null;
  for (const p of participacoes) numeroPorAtleta[p.atletaId] = p.numero;
  return numeroPorAtleta;
}

/**
 * §8.9.1 — Auto-associação silenciosa ao planeamento. Quando uma sessão NORMAL
 * é criada/atualizada sem `planeamentoId` explícito, associa-se automaticamente
 * ao planeamento (do mesmo escalão/época) cujo intervalo de datas contém a data
 * da sessão. Se não houver nenhum, fica `null` — uma sessão nunca é bloqueada
 * pela ausência de semana. Só se aplica a sessões NORMAL (as restantes não podem
 * ligar a periodização).
 */
async function resolverPlaneamentoAuto(
  clubeId: string,
  epocaId: string,
  escalaoId: string,
  data: Date,
): Promise<string | null> {
  const plan = await prisma.planeamento.findFirst({
    where: {
      escalaoId,
      epocaId,
      escalao: { clubeId },
      dataInicio: { lte: data },
      dataFim: { gte: data },
    },
    orderBy: { dataInicio: "desc" },
    select: { id: true },
  });
  return plan?.id ?? null;
}

type Contexto =
  | { estado: "erro"; erro: string }
  | { estado: "ok"; clubeId: string; epoca: Epoca };

async function contexto(): Promise<Contexto> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return { estado: "erro", erro: "Não autenticado" };
  const epoca = await obterEpocaAtiva();
  if (!epoca) return { estado: "erro", erro: "Nenhuma época ativa" };
  return { estado: "ok", clubeId, epoca };
}

export async function listarSessoes(escalaoId?: string): Promise<Resultado<SessaoLista[]>> {
  const ctx = await contexto();
  if (ctx.estado === "erro") return erro(ctx.erro);

  const legiveis = await escaloesLegiveis();
  let filtroEscalao: Prisma.SessaoWhereInput = {};
  if (escalaoId) {
    if (!(await podeLerEscalao(escalaoId))) return ok([]);
    filtroEscalao = { escalaoId };
  } else if (legiveis !== "TODOS") {
    filtroEscalao = { escalaoId: { in: legiveis } };
  }

  const sessoes = await prisma.sessao.findMany({
    where: {
      epocaId: ctx.epoca.id,
      escalao: { clubeId: ctx.clubeId },
      ...filtroEscalao,
    },
    include: INCLUDE_LISTA,
    orderBy: { data: "desc" },
  });
  return ok(sessoes);
}

export async function obterSessao(id: string): Promise<Resultado<SessaoDetalhe>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({
    where: { id, escalao: { clubeId } },
    include: INCLUDE_DETALHE,
  });
  if (!sessao) return erro("Sessão não encontrada");
  if (!(await podeLerEscalao(sessao.escalaoId))) return erro("Sem permissão neste escalão");

  const numeroPorAtleta = await resolverNumeros(
    sessao.escalaoId,
    sessao.epocaId,
    sessao.presencas.map((p) => p.atletaId),
  );
  return ok({ ...sessao, numeroPorAtleta });
}

export async function criarSessao(dados: unknown): Promise<Resultado<Sessao>> {
  const session = await auth();
  if (!session?.user?.id) return erro("Não autenticado");

  const ctx = await contexto();
  if (ctx.estado === "erro") return erro(ctx.erro);

  const parsed = sessaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Guarda de dupla validação: só treinos NORMAL podem ligar a periodização.
  if (parsed.data.tipoSessao !== "NORMAL" && parsed.data.planeamentoId) {
    return erro("Só treinos normais podem estar associados a uma periodização.", {
      planeamentoId: "Só treinos normais podem estar associados a uma periodização.",
    });
  }

  const perm = await exigirCapacidade("TREINOS_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const escalao = await prisma.escalao.findFirst({
    where: { id: parsed.data.escalaoId, clubeId: ctx.clubeId },
  });
  if (!escalao) return erro("O escalão selecionado não existe");

  if (parsed.data.planeamentoId) {
    const plan = await prisma.planeamento.findFirst({
      where: { id: parsed.data.planeamentoId, escalao: { clubeId: ctx.clubeId } },
    });
    if (!plan) return erro("Planeamento não encontrado");
    if (plan.escalaoId !== parsed.data.escalaoId)
      return erro("O planeamento pertence a um escalão diferente");
  }

  // §8.9.1: se não foi fornecido planeamento e a sessão é NORMAL, tenta associar
  // automaticamente ao planeamento cuja semana contém a data da sessão.
  let planeamentoId = parsed.data.planeamentoId ?? null;
  if (!planeamentoId && parsed.data.tipoSessao === "NORMAL") {
    planeamentoId = await resolverPlaneamentoAuto(
      ctx.clubeId,
      ctx.epoca.id,
      parsed.data.escalaoId,
      parsed.data.data,
    );
  }

  const sessao = await prisma.sessao.create({
    data: {
      data: parsed.data.data,
      escalaoId: parsed.data.escalaoId,
      tipoSessao: parsed.data.tipoSessao,
      planeamentoId,
      momentoSemana: parsed.data.momentoSemana ?? null,
      duracaoMin: parsed.data.duracaoMin ?? null,
      objetivo: parsed.data.objetivo ?? null,
      local: parsed.data.local ?? null,
      notas: parsed.data.notas ?? null,
      epocaId: ctx.epoca.id,
      criadorId: session.user.id,
    },
  });
  revalidatePath(PATH);
  return ok(sessao);
}

/**
 * Sessão atualizada. Quando o alcance é ESTA_E_FUTURAS, inclui a contagem da
 * propagação (§8.8.1) para a UI reportar "N atualizadas; M personalizadas mantidas".
 */
export type SessaoAtualizada = Sessao & {
  propagacao?: { atualizadas: number; personalizadasMantidas: number };
};

/**
 * §8.8.1 — `alcance` controla o âmbito da edição de uma sessão ligada a um plano:
 *  - SO_ESTA (default): altera só esta; marca `personalizada` se ligada a um plano.
 *  - ESTA_E_FUTURAS: atualiza o baseline do dia e propaga o AGENDAMENTO (hora,
 *    duração, local, tipo) às sessões futuras não-personalizadas do mesmo dia.
 *    Nunca toca no passado nem no conteúdo (exercícios/presenças/notas/objetivo/RPE).
 */
export async function atualizarSessao(
  id: string,
  dados: unknown,
  alcance?: unknown,
): Promise<Resultado<SessaoAtualizada>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = sessaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const alcanceParsed = alcanceSchema.catch("SO_ESTA").parse(alcance ?? "SO_ESTA");

  // Guarda de dupla validação: só treinos NORMAL podem ligar a periodização.
  if (parsed.data.tipoSessao !== "NORMAL" && parsed.data.planeamentoId) {
    return erro("Só treinos normais podem estar associados a uma periodização.", {
      planeamentoId: "Só treinos normais podem estar associados a uma periodização.",
    });
  }

  const existe = await prisma.sessao.findFirst({ where: { id, escalao: { clubeId } } });
  if (!existe) return erro("Sessão não encontrada");

  const perm = await exigirCapacidade("TREINOS_GERIR", existe.escalaoId);
  if (!perm.ok) return erro(perm.erro);
  if (parsed.data.escalaoId !== existe.escalaoId) {
    const permDestino = await exigirCapacidade("TREINOS_GERIR", parsed.data.escalaoId);
    if (!permDestino.ok) return erro(permDestino.erro);
  }

  if (parsed.data.planeamentoId) {
    const plan = await prisma.planeamento.findFirst({
      where: { id: parsed.data.planeamentoId, escalao: { clubeId } },
    });
    if (!plan) return erro("Planeamento não encontrado");
    if (plan.escalaoId !== parsed.data.escalaoId)
      return erro("O planeamento pertence a um escalão diferente");
  }

  // §8.9.1: auto-associação silenciosa quando não há planeamento explícito e a
  // sessão é NORMAL (usa a época da própria sessão).
  let planeamentoId = parsed.data.planeamentoId ?? null;
  if (!planeamentoId && parsed.data.tipoSessao === "NORMAL") {
    planeamentoId = await resolverPlaneamentoAuto(
      clubeId,
      existe.epocaId,
      parsed.data.escalaoId,
      parsed.data.data,
    );
  }

  // §8.8.1: "só esta" numa sessão ligada a um plano marca-a como personalizada
  // (fica protegida de futuras propagações). "Esta e futuras" mantém-na como
  // parte do plano (não personalizada).
  const ligadaAoPlano = existe.planoSemanalId !== null;
  const personalizada =
    ligadaAoPlano && alcanceParsed === "SO_ESTA" ? true : undefined;

  const sessao = await prisma.sessao.update({
    where: { id },
    data: {
      data: parsed.data.data,
      escalaoId: parsed.data.escalaoId,
      tipoSessao: parsed.data.tipoSessao,
      planeamentoId,
      momentoSemana: parsed.data.momentoSemana ?? null,
      duracaoMin: parsed.data.duracaoMin ?? null,
      objetivo: parsed.data.objetivo ?? null,
      local: parsed.data.local ?? null,
      notas: parsed.data.notas ?? null,
      ...(personalizada !== undefined ? { personalizada } : {}),
    },
  });

  let propagacao: SessaoAtualizada["propagacao"];
  if (alcanceParsed === "ESTA_E_FUTURAS" && existe.planoSemanalDiaId) {
    propagacao = await propagarAgendamento(existe.planoSemanalDiaId, id, {
      data: parsed.data.data,
      duracaoMin: parsed.data.duracaoMin ?? null,
      local: parsed.data.local ?? null,
      tipoSessao: parsed.data.tipoSessao,
    });
  }

  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return ok({ ...sessao, propagacao });
}

/**
 * §8.8.1 — Propaga o AGENDAMENTO de uma sessão-âncora ao baseline do dia e às
 * sessões FUTURAS não-personalizadas do mesmo `planoSemanalDiaId` (exceto a
 * âncora, já atualizada). Só campos de agendamento; nunca o passado nem o
 * conteúdo. Devolve os contadores para a UI.
 */
async function propagarAgendamento(
  planoSemanalDiaId: string,
  ancoraId: string,
  campos: { data: Date; duracaoMin: number | null; local: string | null; tipoSessao: Sessao["tipoSessao"] },
): Promise<{ atualizadas: number; personalizadasMantidas: number }> {
  const agora = new Date();
  const horaInicio = horaDeData(campos.data);

  // Atualiza o baseline do dia (hora/local/tipo; hora de fim a partir da duração).
  const dia = await prisma.planoSemanalDia.findUnique({
    where: { id: planoSemanalDiaId },
    select: { horaInicio: true, horaFim: true },
  });
  if (dia) {
    const duracaoMin =
      campos.duracaoMin ?? duracaoEntreHoras(dia.horaInicio, dia.horaFim);
    await prisma.planoSemanalDia.update({
      where: { id: planoSemanalDiaId },
      data: {
        horaInicio,
        horaFim: somarMinutos(horaInicio, duracaoMin),
        local: campos.local,
        tipoSessao: campos.tipoSessao,
      },
    });
  }

  const alvo = await prisma.sessao.findMany({
    where: {
      planoSemanalDiaId,
      personalizada: false,
      data: { gte: agora },
      id: { not: ancoraId },
    },
    select: { id: true, data: true },
  });

  await prisma.$transaction(
    alvo.map((s) =>
      prisma.sessao.update({
        where: { id: s.id },
        data: {
          data: combinarDataHora(s.data, horaInicio),
          duracaoMin: campos.duracaoMin,
          local: campos.local,
          tipoSessao: campos.tipoSessao,
        },
      }),
    ),
  );

  const personalizadasMantidas = await prisma.sessao.count({
    where: {
      planoSemanalDiaId,
      personalizada: true,
      data: { gte: agora },
      id: { not: ancoraId },
    },
  });

  // +1 pela âncora (sempre atualizada).
  return { atualizadas: alvo.length + 1, personalizadasMantidas };
}

export async function apagarSessao(id: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const existe = await prisma.sessao.findFirst({ where: { id, escalao: { clubeId } } });
  if (!existe) return erro("Sessão não encontrada");

  const perm = await exigirCapacidade("TREINOS_GERIR", existe.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.sessao.delete({ where: { id } });
  revalidatePath(PATH);
  return ok(undefined);
}

/**
 * Melhoria 4.6 — Atualiza apenas as notas da sessão (edição inline no detalhe,
 * sem passar pelo formulário completo). Mantém as restrições habituais: clube do
 * utilizador + capacidade TREINOS_GERIR no escalão da sessão.
 */
export async function atualizarNotasSessao(
  sessaoId: string,
  notas: unknown,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({ where: { id: sessaoId, escalao: { clubeId } } });
  if (!sessao) return erro("Sessão não encontrada");

  const perm = await exigirCapacidade("TREINOS_GERIR", sessao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const parsed = notasSessaoSchema.safeParse({ notas });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  await prisma.sessao.update({
    where: { id: sessaoId },
    data: { notas: parsed.data.notas.trim() === "" ? null : parsed.data.notas },
  });
  revalidatePath(`${PATH}/${sessaoId}`);
  return ok(undefined);
}

// ─── Exercícios da sessão ────────────────────────────────────────────────────

export async function adicionarExercicioSessao(
  sessaoId: string,
  exercicioId: string,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({ where: { id: sessaoId, escalao: { clubeId } } });
  if (!sessao) return erro("Sessão não encontrada");

  const perm = await exigirCapacidade("TREINOS_GERIR", sessao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const exercicio = await prisma.exercicio.findFirst({ where: { id: exercicioId, clubeId } });
  if (!exercicio) return erro("Exercício não encontrado");

  const ultimo = await prisma.sessaoExercicio.findFirst({
    where: { sessaoId },
    orderBy: { ordem: "desc" },
  });
  const ordem = ultimo ? ultimo.ordem + 1 : 0;

  // §4.2.1: exercícios do treinador (portáteis) geram snapshot só-de-leitura no
  // momento da adição; exercícios do clube não geram (construirSnapshotExercicio
  // devolve null).
  const snapshot = construirSnapshotExercicio(exercicio);

  await prisma.sessaoExercicio.create({
    data: { sessaoId, exercicioId, ordem, duracaoMin: exercicio.duracaoMin, ...(snapshot ?? {}) },
  });
  revalidatePath(`${PATH}/${sessaoId}`);
  return ok(undefined);
}

export async function removerExercicioSessao(
  sessaoExercicioId: string,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const se = await prisma.sessaoExercicio.findFirst({
    where: { id: sessaoExercicioId, sessao: { escalao: { clubeId } } },
    select: { id: true, sessaoId: true, sessao: { select: { escalaoId: true } } },
  });
  if (!se) return erro("Exercício da sessão não encontrado");

  const perm = await exigirCapacidade("TREINOS_GERIR", se.sessao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.sessaoExercicio.delete({ where: { id: sessaoExercicioId } });
  revalidatePath(`${PATH}/${se.sessaoId}`);
  return ok(undefined);
}

/**
 * Atualiza os campos de personalização (override) de um exercício da sessão:
 * duração, séries, descrição própria e notas. Segue o padrão de autorização das
 * restantes actions de exercícios da sessão (clube do utilizador + capacidade
 * TREINOS_GERIR no escalão da sessão). Não toca no exercício-base nem no snapshot.
 */
export async function atualizarExercicioSessao(
  sessaoExercicioId: string,
  dados: unknown,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const se = await prisma.sessaoExercicio.findFirst({
    where: { id: sessaoExercicioId, sessao: { escalao: { clubeId } } },
    select: { id: true, sessaoId: true, sessao: { select: { escalaoId: true } } },
  });
  if (!se) return erro("Exercício da sessão não encontrado");

  const perm = await exigirCapacidade("TREINOS_GERIR", se.sessao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const parsed = sessaoExercicioOverrideSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  await prisma.sessaoExercicio.update({
    where: { id: sessaoExercicioId },
    data: parsed.data,
  });
  revalidatePath(`${PATH}/${se.sessaoId}`);
  return ok(undefined);
}

export async function reordenarExercicios(
  sessaoId: string,
  ordens: { id: string; ordem: number }[],
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({ where: { id: sessaoId, escalao: { clubeId } } });
  if (!sessao) return erro("Sessão não encontrada");

  const perm = await exigirCapacidade("TREINOS_GERIR", sessao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  // Validação: todos os ids têm de pertencer a esta sessão (impede reordenar/corromper
  // SessaoExercicio de outra sessão via id forjado).
  const ids = ordens.map((o) => o.id);
  if (ids.length > 0) {
    const validos = await prisma.sessaoExercicio.count({
      where: { id: { in: ids }, sessaoId },
    });
    if (validos !== ids.length)
      return erro("Um ou mais exercícios não pertencem a esta sessão.");
  }

  // Evita colisões no unique [sessaoId, ordem]: desloca para offset alto, depois assenta.
  await prisma.$transaction([
    ...ordens.map((o, i) =>
      prisma.sessaoExercicio.update({ where: { id: o.id }, data: { ordem: 1000 + i } }),
    ),
    ...ordens.map((o) =>
      prisma.sessaoExercicio.update({ where: { id: o.id }, data: { ordem: o.ordem } }),
    ),
  ]);
  revalidatePath(`${PATH}/${sessaoId}`);
  return ok(undefined);
}

// ─── Presenças (Passo 8) ─────────────────────────────────────────────────────

export async function marcarPresencas(
  sessaoId: string,
  presencas: unknown,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({ where: { id: sessaoId, escalao: { clubeId } } });
  if (!sessao) return erro("Sessão não encontrada");

  const perm = await exigirCapacidade("PRESENCAS_MARCAR", sessao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const parsed = marcarPresencasSchema.safeParse(presencas);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Segurança (cross-tenant): garantir que todos os atletaIds pertencem ao clube
  // do utilizador autenticado antes de escrever. Impede que um atletaId forjado
  // de outro clube seja gravado nas presenças desta sessão.
  const ids = parsed.data.map((p) => p.atletaId);
  if (ids.length > 0) {
    const atletasDoClube = await prisma.atleta.findMany({
      where: { id: { in: ids }, clubeId },
      select: { id: true },
    });
    const idsValidos = new Set(atletasDoClube.map((a) => a.id));
    const idsInvalidos = ids.filter((id) => !idsValidos.has(id));
    if (idsInvalidos.length > 0) return erro("Atletas inválidos para este clube.");
  }

  // Auditoria: regista o membro que marcou a presença. Opcional — null se o
  // utilizador não tiver adesão de clube ativa (modo individual).
  const membro = await obterMembroAtual();
  const marcadoPorId = membro?.membroId ?? null;

  // F1: a presença guarda o escalão da sessão (analytics por escalão) e o motivo da falta.
  await prisma.$transaction(
    parsed.data.map((p) =>
      prisma.presenca.upsert({
        where: { sessaoId_atletaId: { sessaoId, atletaId: p.atletaId } },
        create: {
          sessaoId,
          atletaId: p.atletaId,
          escalaoId: sessao.escalaoId,
          estado: p.estado,
          motivo: p.motivo ?? null,
          justificacao: p.justificacao ?? null,
          marcadoPorId,
        },
        update: {
          escalaoId: sessao.escalaoId,
          estado: p.estado,
          motivo: p.motivo ?? null,
          justificacao: p.justificacao ?? null,
          marcadoPorId,
        },
      }),
    ),
  );
  revalidatePath(`${PATH}/${sessaoId}`);
  return ok(undefined);
}
