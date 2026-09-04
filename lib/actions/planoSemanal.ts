"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerEscalao, escaloesLegiveis } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  criarPlanoSemanalSchema,
  atualizarPlanoSemanalSchema,
  modoApagarSchema,
  type PlanoSemanalDiaInput,
} from "@/lib/schemas/planoSemanal";
import {
  gerarDatasDePlano,
  diaSemanaISO,
  inicioDoDia,
  fimDoDia,
  chaveDia,
  combinarDataHora,
  duracaoEntreHoras,
} from "@/lib/plano-semanal";
import { Prisma, type Epoca, type TipoSessao } from "@prisma/client";

const PATH = "/treinos";
const PATH_PLANOS = "/treinos/planos";

// ─── Contexto (clube + época ativa) ──────────────────────────────────────────

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

/** Erro de negócio propagável dentro de uma transação. */
class ErroNegocio extends Error {}

/**
 * Data efetiva de início da geração: o maior de `dataInicioGeracao` e o início
 * da época — nunca antes do arranque da época. A exclusão do passado (< hoje)
 * é responsabilidade de `gerarDatasDePlano`.
 */
function inicioEfetivo(dataInicioGeracao: string, epoca: Epoca): Date {
  // "YYYY-MM-DD" ancorado ao meio-dia UTC: garante que o dia de calendário de
  // Lisboa é o pretendido (imune ao fuso do processo), antes de o normalizar
  // para o início do dia de Lisboa via `inicioDoDia`.
  const pedido = inicioDoDia(new Date(`${dataInicioGeracao}T12:00:00Z`));
  const inicioEpoca = inicioDoDia(epoca.dataInicio);
  return pedido.getTime() < inicioEpoca.getTime() ? inicioEpoca : pedido;
}

/** Valida que a época tem datas de geração utilizáveis. */
function epocaTemDatasValidas(epoca: Epoca): boolean {
  return (
    !!epoca.dataInicio &&
    !!epoca.dataFim &&
    inicioDoDia(epoca.dataInicio).getTime() <= inicioDoDia(epoca.dataFim).getTime()
  );
}

/** Constrói o payload de uma `Sessao` gerada para uma data e um dia do plano. */
function construirSessao(params: {
  data: Date;
  dia: { id: string; horaInicio: string; horaFim: string; local: string | null; tipoSessao: TipoSessao };
  planoSemanalId: string;
  escalaoId: string;
  epocaId: string;
  criadorId: string;
}): Prisma.SessaoCreateManyInput {
  const { data, dia, planoSemanalId, escalaoId, epocaId, criadorId } = params;
  return {
    data: combinarDataHora(data, dia.horaInicio),
    duracaoMin: duracaoEntreHoras(dia.horaInicio, dia.horaFim),
    local: dia.local ?? null,
    tipoSessao: dia.tipoSessao,
    escalaoId,
    epocaId,
    // §8.8.1: sessões geradas ficam sem periodização (ligação é um passo separado, §8.9).
    planeamentoId: null,
    planoSemanalId,
    planoSemanalDiaId: dia.id,
    personalizada: false,
    criadorId,
  };
}

// ─── preverPlanoSemanal (dry-run) ────────────────────────────────────────────

export interface PrevisaoPlano {
  geradas: number;
  ignoradas: number;
  dataInicio: string; // YYYY-MM-DD (início efetivo)
  dataFim: string; // YYYY-MM-DD (fim da época)
}

export async function preverPlanoSemanal(dados: unknown): Promise<Resultado<PrevisaoPlano>> {
  const ctx = await contexto();
  if (ctx.estado === "erro") return erro(ctx.erro);

  const parsed = criarPlanoSemanalSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("TREINOS_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const escalao = await prisma.escalao.findFirst({
    where: { id: parsed.data.escalaoId, clubeId: ctx.clubeId },
    select: { id: true },
  });
  if (!escalao) return erro("O escalão selecionado não existe");

  if (!epocaTemDatasValidas(ctx.epoca))
    return erro("A época precisa de datas de início e fim válidas para gerar o plano.");

  const inicio = inicioEfetivo(parsed.data.dataInicioGeracao, ctx.epoca);
  const diasSemana = parsed.data.dias.map((d) => d.diaSemana);
  const datas = gerarDatasDePlano(inicio, ctx.epoca.dataFim, diasSemana);

  const ocupados = await diasOcupados(
    parsed.data.escalaoId,
    ctx.epoca.id,
    inicio,
    ctx.epoca.dataFim,
  );
  const ignoradas = datas.reduce((n, d) => (ocupados.has(chaveDia(d)) ? n + 1 : n), 0);

  return ok({
    geradas: datas.length - ignoradas,
    ignoradas,
    dataInicio: chaveDia(datas[0] ?? inicio),
    dataFim: chaveDia(ctx.epoca.dataFim),
  });
}

/** Conjunto de dias (YYYY-MM-DD) que já têm sessão no escalão/época/intervalo. */
async function diasOcupados(
  escalaoId: string,
  epocaId: string,
  inicio: Date,
  fim: Date,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Set<string>> {
  const existentes = await client.sessao.findMany({
    where: { escalaoId, epocaId, data: { gte: inicioDoDia(inicio), lte: fimDoDia(fim) } },
    select: { data: true },
  });
  return new Set(existentes.map((s) => chaveDia(s.data)));
}

// ─── criarPlanoSemanal ───────────────────────────────────────────────────────

export interface ResultadoCriacaoPlano {
  planoId: string;
  geradas: number;
  ignoradas: number;
}

export async function criarPlanoSemanal(
  dados: unknown,
): Promise<Resultado<ResultadoCriacaoPlano>> {
  const session = await auth();
  if (!session?.user?.id) return erro("Não autenticado");

  const ctx = await contexto();
  if (ctx.estado === "erro") return erro(ctx.erro);

  const parsed = criarPlanoSemanalSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("TREINOS_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const escalao = await prisma.escalao.findFirst({
    where: { id: parsed.data.escalaoId, clubeId: ctx.clubeId },
    select: { id: true, nome: true },
  });
  if (!escalao) return erro("O escalão selecionado não existe");

  if (!epocaTemDatasValidas(ctx.epoca))
    return erro("A época precisa de datas de início e fim válidas para gerar o plano.");

  const criadorId = session.user.id;
  const inicio = inicioEfetivo(parsed.data.dataInicioGeracao, ctx.epoca);

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Invariante: no máximo UM plano ativo por (escalão, época).
      const ativos = await tx.planoSemanal.count({
        where: { escalaoId: parsed.data.escalaoId, epocaId: ctx.epoca.id, ativo: true },
      });
      if (ativos > 0)
        throw new ErroNegocio("Já existe um plano semanal ativo para este escalão nesta época.");

      const plano = await tx.planoSemanal.create({
        data: {
          clubeId: ctx.clubeId,
          escalaoId: parsed.data.escalaoId,
          epocaId: ctx.epoca.id,
          nome: parsed.data.nome ?? null,
          criadorId,
          dias: {
            create: parsed.data.dias.map((d) => ({
              diaSemana: d.diaSemana,
              horaInicio: d.horaInicio,
              horaFim: d.horaFim,
              local: d.local ?? null,
              tipoSessao: d.tipoSessao,
            })),
          },
        },
        include: { dias: true },
      });

      const mapaDias = new Map(plano.dias.map((d) => [d.diaSemana, d]));
      const datas = gerarDatasDePlano(
        inicio,
        ctx.epoca.dataFim,
        plano.dias.map((d) => d.diaSemana),
      );
      const ocupados = await diasOcupados(
        parsed.data.escalaoId,
        ctx.epoca.id,
        inicio,
        ctx.epoca.dataFim,
        tx,
      );

      const novas: Prisma.SessaoCreateManyInput[] = [];
      for (const data of datas) {
        if (ocupados.has(chaveDia(data))) continue;
        const dia = mapaDias.get(diaSemanaISO(data));
        if (!dia) continue;
        novas.push(
          construirSessao({
            data,
            dia,
            planoSemanalId: plano.id,
            escalaoId: parsed.data.escalaoId,
            epocaId: ctx.epoca.id,
            criadorId,
          }),
        );
      }

      if (novas.length > 0)
        await tx.sessao.createMany({ data: novas, skipDuplicates: false });

      return {
        planoId: plano.id,
        geradas: novas.length,
        ignoradas: datas.length - novas.length,
      };
    });

    revalidatePath(PATH);
    revalidatePath(PATH_PLANOS);
    return ok(resultado);
  } catch (e) {
    if (e instanceof ErroNegocio) return erro(e.message);
    throw e;
  }
}

// ─── listarPlanosSemanais ────────────────────────────────────────────────────

const INCLUDE_LISTA = {
  escalao: { select: { id: true, nome: true } },
  dias: { orderBy: { diaSemana: "asc" } },
  _count: { select: { sessoes: true } },
} as const;

export type PlanoSemanalLista = Prisma.PlanoSemanalGetPayload<{ include: typeof INCLUDE_LISTA }>;

export async function listarPlanosSemanais(
  escalaoId?: string,
): Promise<Resultado<PlanoSemanalLista[]>> {
  const ctx = await contexto();
  if (ctx.estado === "erro") return erro(ctx.erro);

  const legiveis = await escaloesLegiveis();
  let filtroEscalao: Prisma.PlanoSemanalWhereInput = {};
  if (escalaoId) {
    if (!(await podeLerEscalao(escalaoId))) return ok([]);
    filtroEscalao = { escalaoId };
  } else if (legiveis !== "TODOS") {
    filtroEscalao = { escalaoId: { in: legiveis } };
  }

  const planos = await prisma.planoSemanal.findMany({
    where: { clubeId: ctx.clubeId, epocaId: ctx.epoca.id, ...filtroEscalao },
    include: INCLUDE_LISTA,
    orderBy: { criadoEm: "desc" },
  });
  return ok(planos);
}

// ─── obterPlanoSemanal ───────────────────────────────────────────────────────

const INCLUDE_DETALHE = {
  escalao: { select: { id: true, nome: true } },
  dias: { orderBy: { diaSemana: "asc" } },
} as const;

export type PlanoSemanalDetalhe = Prisma.PlanoSemanalGetPayload<{
  include: typeof INCLUDE_DETALHE;
}> & {
  sessoes: {
    id: string;
    data: Date;
    duracaoMin: number | null;
    local: string | null;
    tipoSessao: TipoSessao;
    personalizada: boolean;
    planoSemanalDiaId: string | null;
  }[];
};

export async function obterPlanoSemanal(id: string): Promise<Resultado<PlanoSemanalDetalhe>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const plano = await prisma.planoSemanal.findFirst({
    where: { id, clubeId },
    include: INCLUDE_DETALHE,
  });
  if (!plano) return erro("Plano semanal não encontrado");
  if (!(await podeLerEscalao(plano.escalaoId))) return erro("Sem permissão neste escalão");

  // Só sessões futuras, para não sobrecarregar o detalhe.
  const sessoes = await prisma.sessao.findMany({
    where: { planoSemanalId: id, data: { gte: new Date() } },
    select: {
      id: true,
      data: true,
      duracaoMin: true,
      local: true,
      tipoSessao: true,
      personalizada: true,
      planoSemanalDiaId: true,
    },
    orderBy: { data: "asc" },
  });

  return ok({ ...plano, sessoes });
}

// ─── atualizarPlanoSemanal ───────────────────────────────────────────────────

export interface ResultadoAtualizacaoPlano {
  geradas: number;
  desvinculadas: number;
  apagadas: number;
  propagadas: number;
}

export async function atualizarPlanoSemanal(
  id: string,
  dados: unknown,
): Promise<Resultado<ResultadoAtualizacaoPlano>> {
  const session = await auth();
  if (!session?.user?.id) return erro("Não autenticado");

  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = atualizarPlanoSemanalSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const plano = await prisma.planoSemanal.findFirst({
    where: { id, clubeId },
    include: { dias: true, epoca: true },
  });
  if (!plano) return erro("Plano semanal não encontrado");

  const perm = await exigirCapacidade("TREINOS_GERIR", plano.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const criadorId = session.user.id;
  const agora = new Date();
  const contadores: ResultadoAtualizacaoPlano = {
    geradas: 0,
    desvinculadas: 0,
    apagadas: 0,
    propagadas: 0,
  };

  await prisma.$transaction(async (tx) => {
    // Metadados do plano (nome/ativo).
    const dataPlano: Prisma.PlanoSemanalUpdateInput = {};
    if (parsed.data.nome !== undefined) dataPlano.nome = parsed.data.nome ?? null;
    if (parsed.data.ativo !== undefined) dataPlano.ativo = parsed.data.ativo;
    if (Object.keys(dataPlano).length > 0)
      await tx.planoSemanal.update({ where: { id }, data: dataPlano });

    if (!parsed.data.dias) return;

    const existentesPorDia = new Map(plano.dias.map((d) => [d.diaSemana, d]));
    const novosPorDia = new Map(parsed.data.dias.map((d) => [d.diaSemana, d]));

    // 1. Remover dias que já não vieram (só afeta sessões futuras).
    for (const [diaSemana, dia] of existentesPorDia) {
      if (novosPorDia.has(diaSemana)) continue;
      const r = await removerFuturasDoDia(tx, dia.id, agora);
      contadores.apagadas += r.apagadas;
      contadores.desvinculadas += r.desvinculadas;
      await tx.planoSemanalDia.delete({ where: { id: dia.id } });
    }

    // 2. Atualizar dias existentes (propaga baseline) e criar novos (gera futuras).
    const podeGerar = epocaTemDatasValidas(plano.epoca);
    for (const [diaSemana, novo] of novosPorDia) {
      const existente = existentesPorDia.get(diaSemana);
      if (existente) {
        await tx.planoSemanalDia.update({
          where: { id: existente.id },
          data: {
            horaInicio: novo.horaInicio,
            horaFim: novo.horaFim,
            local: novo.local ?? null,
            tipoSessao: novo.tipoSessao,
          },
        });
        contadores.propagadas += await propagarBaseline(tx, existente.id, novo, agora);
      } else {
        const criado = await tx.planoSemanalDia.create({
          data: {
            planoSemanalId: id,
            diaSemana: novo.diaSemana,
            horaInicio: novo.horaInicio,
            horaFim: novo.horaFim,
            local: novo.local ?? null,
            tipoSessao: novo.tipoSessao,
          },
        });
        if (podeGerar)
          contadores.geradas += await gerarFuturasDoDia(tx, {
            planoSemanalId: id,
            dia: criado,
            escalaoId: plano.escalaoId,
            epocaId: plano.epocaId,
            dataFim: plano.epoca.dataFim,
            criadorId,
          });
      }
    }
  });

  revalidatePath(PATH);
  revalidatePath(PATH_PLANOS);
  revalidatePath(`${PATH_PLANOS}/${id}`);
  return ok(contadores);
}

/**
 * Propaga o baseline de um dia às sessões FUTURAS não-personalizadas ligadas a
 * esse dia — só campos de agendamento (data/hora, duração, local, tipo). Nunca
 * toca no passado nem no conteúdo. Devolve o nº de sessões atualizadas.
 */
async function propagarBaseline(
  tx: Prisma.TransactionClient,
  planoSemanalDiaId: string,
  dia: PlanoSemanalDiaInput,
  agora: Date,
): Promise<number> {
  const futuras = await tx.sessao.findMany({
    where: { planoSemanalDiaId, personalizada: false, data: { gte: agora } },
    select: { id: true, data: true },
  });
  const duracaoMin = duracaoEntreHoras(dia.horaInicio, dia.horaFim);
  for (const s of futuras) {
    await tx.sessao.update({
      where: { id: s.id },
      data: {
        data: combinarDataHora(s.data, dia.horaInicio),
        duracaoMin,
        local: dia.local ?? null,
        tipoSessao: dia.tipoSessao,
      },
    });
  }
  return futuras.length;
}

/**
 * Apaga as sessões FUTURAS e sem conteúdo (sem exercícios nem presenças) de um
 * dia; desvincula as futuras com conteúdo. Passadas ficam intactas.
 */
async function removerFuturasDoDia(
  tx: Prisma.TransactionClient,
  planoSemanalDiaId: string,
  agora: Date,
): Promise<{ apagadas: number; desvinculadas: number }> {
  const futuras = await tx.sessao.findMany({
    where: { planoSemanalDiaId, data: { gte: agora } },
    select: { id: true, _count: { select: { exercicios: true, presencas: true } } },
  });
  const vazias = futuras
    .filter((s) => s._count.exercicios === 0 && s._count.presencas === 0)
    .map((s) => s.id);
  const comConteudo = futuras
    .filter((s) => s._count.exercicios > 0 || s._count.presencas > 0)
    .map((s) => s.id);

  if (vazias.length > 0) await tx.sessao.deleteMany({ where: { id: { in: vazias } } });
  if (comConteudo.length > 0)
    await tx.sessao.updateMany({
      where: { id: { in: comConteudo } },
      data: { planoSemanalId: null, planoSemanalDiaId: null },
    });

  return { apagadas: vazias.length, desvinculadas: comConteudo.length };
}

/** Gera as sessões futuras (hoje→fim da época) de um novo dia, com deduplicação. */
async function gerarFuturasDoDia(
  tx: Prisma.TransactionClient,
  params: {
    planoSemanalId: string;
    dia: { id: string; diaSemana: number; horaInicio: string; horaFim: string; local: string | null; tipoSessao: TipoSessao };
    escalaoId: string;
    epocaId: string;
    dataFim: Date;
    criadorId: string;
  },
): Promise<number> {
  const { planoSemanalId, dia, escalaoId, epocaId, dataFim, criadorId } = params;
  const datas = gerarDatasDePlano(new Date(), dataFim, [dia.diaSemana]);
  if (datas.length === 0) return 0;

  const ocupados = await diasOcupados(escalaoId, epocaId, new Date(), dataFim, tx);
  const novas = datas
    .filter((d) => !ocupados.has(chaveDia(d)))
    .map((data) => construirSessao({ data, dia, planoSemanalId, escalaoId, epocaId, criadorId }));

  if (novas.length > 0) await tx.sessao.createMany({ data: novas, skipDuplicates: false });
  return novas.length;
}

// ─── apagarPlanoSemanal ──────────────────────────────────────────────────────

export interface ResultadoApagarPlano {
  apagadas: number;
  desvinculadas: number;
}

export async function apagarPlanoSemanal(
  id: string,
  modo: unknown,
): Promise<Resultado<ResultadoApagarPlano>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const modoParsed = modoApagarSchema.safeParse(modo);
  if (!modoParsed.success) return erroDeValidacao(modoParsed.error);

  const plano = await prisma.planoSemanal.findFirst({
    where: { id, clubeId },
    select: { id: true, escalaoId: true },
  });
  if (!plano) return erro("Plano semanal não encontrado");

  const perm = await exigirCapacidade("TREINOS_GERIR", plano.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const contadores: ResultadoApagarPlano = { apagadas: 0, desvinculadas: 0 };

  await prisma.$transaction(async (tx) => {
    if (modoParsed.data === "APAGAR_FUTURAS_VAZIAS") {
      // Apaga só as futuras sem conteúdo; nunca toca em sessões passadas.
      const futuras = await tx.sessao.findMany({
        where: { planoSemanalId: id, data: { gte: new Date() } },
        select: { id: true, _count: { select: { exercicios: true, presencas: true } } },
      });
      const vazias = futuras
        .filter((s) => s._count.exercicios === 0 && s._count.presencas === 0)
        .map((s) => s.id);
      if (vazias.length > 0) {
        await tx.sessao.deleteMany({ where: { id: { in: vazias } } });
        contadores.apagadas = vazias.length;
      }
    }

    // Desvincula as sessões restantes (mantém-nas, sem plano).
    const desvinc = await tx.sessao.updateMany({
      where: { planoSemanalId: id },
      data: { planoSemanalId: null, planoSemanalDiaId: null },
    });
    contadores.desvinculadas = desvinc.count;

    // Apaga o plano (cascade: PlanoSemanalDia).
    await tx.planoSemanal.delete({ where: { id } });
  });

  revalidatePath(PATH);
  revalidatePath(PATH_PLANOS);
  return ok(contadores);
}
