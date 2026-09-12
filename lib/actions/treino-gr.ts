"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerEscalao } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  SessaoExternaGRSchema,
  type SessaoExternaGRFormData,
} from "@/lib/schemas/treino";
import type { TipoMetrica } from "@prisma/client";

const PATH = "/treinos";

// ─────────────────────────────────────────────────────────────────────────────
// §8.24.6 — Sessões de treino externas de Guarda-Redes
//
// Terceiro modo de registo de treino de GR: sessão NÃO gerida pela app (estágio,
// clínica, outro treinador) que fica no histórico de desenvolvimento do atleta.
// Reutiliza `Sessao` (tipoSessao = EXTERNA_GR) + `Presenca` + `ValorMetricaSessao`
// — zero entidades novas. Regras: RN-GR-2 (métrica GR só para GR) e RN-GR-5
// (≥1 participante GR; sem periodização/plano semanal; não conta assiduidade).
// ─────────────────────────────────────────────────────────────────────────────

/** Tipos de retorno (leitura) das sessões externas de GR. */
export interface SessaoExternaGRResumo {
  id: string;
  data: Date;
  duracaoMin: number | null;
  local: string | null;
  entidadeExterna: string | null;
  objetivo: string | null;
  participantes: { atletaId: string; nome: string; numero: number | null }[];
  totalMetricas: number;
}

export interface SessaoExternaGRDetalhe {
  id: string;
  data: Date;
  duracaoMin: number | null;
  local: string | null;
  entidadeExterna: string | null;
  objetivo: string | null;
  notas: string | null;
  escalaoId: string;
  participantes: { atletaId: string; nome: string; numero: number | null }[];
  metricas: {
    metricaId: string;
    atletaId: string;
    valor: number;
    nome: string;
    tipo: TipoMetrica;
  }[];
}

/**
 * Valida que todos os `atletasIds` pertencem ao clube, participam na época ativa e
 * são guarda-redes (`posicoes` inclui `GUARDA_REDES`). Devolve `null` se tudo ok,
 * ou uma mensagem de erro. Validação no servidor — não confia na UI (RN-GR-2/5).
 */
async function validarGuardaRedes(
  clubeId: string,
  epocaId: string,
  atletasIds: string[],
): Promise<string | null> {
  const atletas = await prisma.atleta.findMany({
    where: { id: { in: atletasIds }, clubeId },
    select: {
      id: true,
      posicoes: true,
      participacoes: { where: { epocaId }, select: { id: true } },
    },
  });
  const mapa = new Map(atletas.map((a) => [a.id, a]));

  for (const id of atletasIds) {
    const atleta = mapa.get(id);
    if (!atleta) return "Guarda-redes inválido para este clube.";
    if (atleta.participacoes.length === 0)
      return "O atleta não participa na época ativa.";
    if (!atleta.posicoes.includes("GUARDA_REDES"))
      return "Só guarda-redes podem participar numa sessão externa de GR.";
  }
  return null;
}

/**
 * Valida as métricas de uma sessão externa de GR: cada métrica tem de pertencer ao
 * clube, ser `aplicaSoGuardaRedes=true` e `contexto ∈ {TREINO, AMBOS}` (RN-GR-2), e
 * cada `atletaId` tem de estar entre os participantes. Devolve `null` se ok ou uma
 * mensagem de erro.
 */
async function validarMetricasGR(
  clubeId: string,
  participantes: string[],
  metricas: SessaoExternaGRFormData["metricas"],
): Promise<string | null> {
  if (metricas.length === 0) return null;

  const participantesSet = new Set(participantes);
  const metricaIds = [...new Set(metricas.map((m) => m.metricaId))];
  const configs = await prisma.metricaConfig.findMany({
    where: { id: { in: metricaIds }, clubeId },
    select: { id: true, aplicaSoGuardaRedes: true, contexto: true },
  });
  const mapa = new Map(configs.map((c) => [c.id, c]));

  for (const m of metricas) {
    const config = mapa.get(m.metricaId);
    if (!config) return "Métrica inválida para este clube.";
    if (
      !config.aplicaSoGuardaRedes ||
      !(config.contexto === "TREINO" || config.contexto === "AMBOS")
    )
      return "Só métricas técnicas de GR (treino) podem ser registadas nesta sessão.";
    if (!participantesSet.has(m.atletaId))
      return "A métrica refere um atleta que não participa na sessão.";
  }
  return null;
}

/**
 * Cria uma sessão externa de GR (§8.24.6). Impõe: `tipoSessao = EXTERNA_GR`,
 * `planeamentoId`/`planoSemanalId`/`planoSemanalDiaId`/`rpeSessao` nulos (RN-GR-5),
 * ≥1 participante GR, e métricas restritas a GR (RN-GR-2). Tudo em transação.
 */
export async function criarSessaoExternaGR(
  dados: SessaoExternaGRFormData,
): Promise<Resultado<{ id: string }>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = SessaoExternaGRSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  const perm = await exigirCapacidade("TREINOS_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const escalao = await prisma.escalao.findFirst({
    where: { id: parsed.data.escalaoId, clubeId },
    select: { id: true },
  });
  if (!escalao) return erro("O escalão selecionado não existe");

  const erroGR = await validarGuardaRedes(clubeId, epoca.id, parsed.data.atletasIds);
  if (erroGR) return erro(erroGR);

  const erroMetricas = await validarMetricasGR(
    clubeId,
    parsed.data.atletasIds,
    parsed.data.metricas,
  );
  if (erroMetricas) return erro(erroMetricas);

  const sessao = await prisma.$transaction(async (tx) => {
    const nova = await tx.sessao.create({
      data: {
        data: parsed.data.data,
        escalaoId: parsed.data.escalaoId,
        epocaId: epoca.id,
        tipoSessao: "EXTERNA_GR",
        // RN-GR-5: sem ligação a periodização/plano semanal; sem RPE.
        planeamentoId: null,
        planoSemanalId: null,
        planoSemanalDiaId: null,
        rpeSessao: null,
        duracaoMin: parsed.data.duracaoMin ?? null,
        local: parsed.data.local ?? null,
        entidadeExterna: parsed.data.entidadeExterna ?? null,
        objetivo: parsed.data.objetivo ?? null,
        notas: parsed.data.notas ?? null,
        criadorId: perm.ctx.utilizadorId,
      },
      select: { id: true },
    });

    await tx.presenca.createMany({
      data: parsed.data.atletasIds.map((atletaId) => ({
        sessaoId: nova.id,
        atletaId,
        escalaoId: parsed.data.escalaoId,
        estado: "PRESENTE" as const,
        marcadoPorId: perm.ctx.membroId,
      })),
    });

    if (parsed.data.metricas.length > 0) {
      await tx.valorMetricaSessao.createMany({
        data: parsed.data.metricas.map((m) => ({
          sessaoId: nova.id,
          metricaId: m.metricaId,
          atletaId: m.atletaId,
          valor: m.valor,
        })),
      });
    }

    return nova;
  });

  revalidatePath(PATH);
  return ok({ id: sessao.id });
}

/**
 * Lista as sessões externas de GR de um escalão na época ativa (mais recentes
 * primeiro). Inclui participantes (nome/número) e a contagem de métricas
 * registadas. Auth + multi-tenant + leitura do escalão.
 */
export async function listarSessoesExternasGR(
  escalaoId: string,
): Promise<Resultado<SessaoExternaGRResumo[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  const escalao = await prisma.escalao.findFirst({
    where: { id: escalaoId, clubeId },
    select: { id: true },
  });
  if (!escalao) return erro("Escalão não encontrado");
  if (!(await podeLerEscalao(escalaoId))) return erro("Sem permissão neste escalão");

  const sessoes = await prisma.sessao.findMany({
    where: {
      escalaoId,
      epocaId: epoca.id,
      tipoSessao: "EXTERNA_GR",
      escalao: { clubeId },
    },
    select: {
      id: true,
      data: true,
      duracaoMin: true,
      local: true,
      entidadeExterna: true,
      objetivo: true,
      presencas: {
        select: { atletaId: true, atleta: { select: { nome: true, numero: true } } },
      },
      _count: { select: { valoresMetricas: true } },
    },
    orderBy: { data: "desc" },
  });

  return ok(
    sessoes.map((s) => ({
      id: s.id,
      data: s.data,
      duracaoMin: s.duracaoMin,
      local: s.local,
      entidadeExterna: s.entidadeExterna,
      objetivo: s.objetivo,
      participantes: s.presencas.map((p) => ({
        atletaId: p.atletaId,
        nome: p.atleta.nome,
        numero: p.atleta.numero,
      })),
      totalMetricas: s._count.valoresMetricas,
    })),
  );
}

/**
 * Obtém uma sessão externa de GR (detalhe). Garante isolamento multi-tenant (a
 * sessão tem de pertencer ao clube e ser `EXTERNA_GR`) e leitura do escalão.
 */
export async function obterSessaoExternaGR(
  sessaoId: string,
): Promise<Resultado<SessaoExternaGRDetalhe>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({
    where: { id: sessaoId, tipoSessao: "EXTERNA_GR", escalao: { clubeId } },
    select: {
      id: true,
      data: true,
      duracaoMin: true,
      local: true,
      entidadeExterna: true,
      objetivo: true,
      notas: true,
      escalaoId: true,
      presencas: {
        select: { atletaId: true, atleta: { select: { nome: true, numero: true } } },
      },
      valoresMetricas: {
        select: {
          metricaId: true,
          atletaId: true,
          valor: true,
          metrica: { select: { nome: true, tipo: true } },
        },
      },
    },
  });
  if (!sessao) return erro("Sessão não encontrada");
  if (!(await podeLerEscalao(sessao.escalaoId)))
    return erro("Sem permissão neste escalão");

  return ok({
    id: sessao.id,
    data: sessao.data,
    duracaoMin: sessao.duracaoMin,
    local: sessao.local,
    entidadeExterna: sessao.entidadeExterna,
    objetivo: sessao.objetivo,
    notas: sessao.notas,
    escalaoId: sessao.escalaoId,
    participantes: sessao.presencas.map((p) => ({
      atletaId: p.atletaId,
      nome: p.atleta.nome,
      numero: p.atleta.numero,
    })),
    metricas: sessao.valoresMetricas.map((v) => ({
      metricaId: v.metricaId,
      atletaId: v.atletaId,
      valor: v.valor,
      nome: v.metrica.nome,
      tipo: v.metrica.tipo,
    })),
  });
}

/**
 * Atualiza uma sessão externa de GR: metadados e, opcionalmente, participantes e
 * métricas. Mantém as mesmas validações de GR (RN-GR-2/5). Participantes: diff
 * (upsert/delete) — remover um participante também apaga as suas métricas na
 * sessão. Métricas: upsert/delete por `(sessaoId, metricaId, atletaId)`.
 */
export async function atualizarSessaoExternaGR(
  sessaoId: string,
  dados: Partial<SessaoExternaGRFormData>,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({
    where: { id: sessaoId, tipoSessao: "EXTERNA_GR", escalao: { clubeId } },
    select: {
      id: true,
      escalaoId: true,
      presencas: { select: { atletaId: true } },
    },
  });
  if (!sessao) return erro("Sessão não encontrada");

  const perm = await exigirCapacidade("TREINOS_GERIR", sessao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const parsed = SessaoExternaGRSchema.partial().safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  // Participantes efetivos após a edição: os novos (se enviados) ou os atuais.
  const participantesAtuais = sessao.presencas.map((p) => p.atletaId);
  const participantesEfetivos = parsed.data.atletasIds ?? participantesAtuais;

  if (parsed.data.atletasIds !== undefined) {
    const erroGR = await validarGuardaRedes(clubeId, epoca.id, parsed.data.atletasIds);
    if (erroGR) return erro(erroGR);
  }

  if (parsed.data.metricas !== undefined) {
    const erroMetricas = await validarMetricasGR(
      clubeId,
      participantesEfetivos,
      parsed.data.metricas,
    );
    if (erroMetricas) return erro(erroMetricas);
  }

  await prisma.$transaction(async (tx) => {
    // Metadados (só os campos enviados).
    await tx.sessao.update({
      where: { id: sessaoId },
      data: {
        ...(parsed.data.data !== undefined ? { data: parsed.data.data } : {}),
        ...(parsed.data.duracaoMin !== undefined
          ? { duracaoMin: parsed.data.duracaoMin }
          : {}),
        ...(parsed.data.local !== undefined ? { local: parsed.data.local } : {}),
        ...(parsed.data.entidadeExterna !== undefined
          ? { entidadeExterna: parsed.data.entidadeExterna }
          : {}),
        ...(parsed.data.objetivo !== undefined
          ? { objetivo: parsed.data.objetivo }
          : {}),
        ...(parsed.data.notas !== undefined ? { notas: parsed.data.notas } : {}),
      },
    });

    // Participantes: diff (upsert/delete).
    if (parsed.data.atletasIds !== undefined) {
      const atuaisSet = new Set(participantesAtuais);
      const novosSet = new Set(parsed.data.atletasIds);
      const aRemover = participantesAtuais.filter((id) => !novosSet.has(id));
      const aAdicionar = parsed.data.atletasIds.filter((id) => !atuaisSet.has(id));

      if (aRemover.length > 0) {
        await tx.presenca.deleteMany({
          where: { sessaoId, atletaId: { in: aRemover } },
        });
        // Remover também as métricas dos participantes retirados (não ficam órfãs).
        await tx.valorMetricaSessao.deleteMany({
          where: { sessaoId, atletaId: { in: aRemover } },
        });
      }
      if (aAdicionar.length > 0) {
        await tx.presenca.createMany({
          data: aAdicionar.map((atletaId) => ({
            sessaoId,
            atletaId,
            escalaoId: sessao.escalaoId,
            estado: "PRESENTE" as const,
            marcadoPorId: perm.ctx.membroId,
          })),
        });
      }
    }

    // Métricas: upsert dos enviados; delete dos que deixaram de existir.
    if (parsed.data.metricas !== undefined) {
      const desejados = parsed.data.metricas;
      const chaves = new Set(desejados.map((m) => `${m.metricaId}::${m.atletaId}`));
      const existentes = await tx.valorMetricaSessao.findMany({
        where: { sessaoId },
        select: { metricaId: true, atletaId: true },
      });
      const aApagar = existentes.filter(
        (e) => !chaves.has(`${e.metricaId}::${e.atletaId}`),
      );
      for (const e of aApagar) {
        await tx.valorMetricaSessao.delete({
          where: {
            metricaId_sessaoId_atletaId: {
              metricaId: e.metricaId,
              sessaoId,
              atletaId: e.atletaId,
            },
          },
        });
      }
      for (const m of desejados) {
        await tx.valorMetricaSessao.upsert({
          where: {
            metricaId_sessaoId_atletaId: {
              metricaId: m.metricaId,
              sessaoId,
              atletaId: m.atletaId,
            },
          },
          create: {
            sessaoId,
            metricaId: m.metricaId,
            atletaId: m.atletaId,
            valor: m.valor,
          },
          update: { valor: m.valor },
        });
      }
    }
  });

  revalidatePath(PATH);
  revalidatePath(`${PATH}/${sessaoId}`);
  return ok(undefined);
}

/**
 * Apaga uma sessão externa de GR. As presenças e as métricas da sessão são
 * removidas em cascata (relações `onDelete: Cascade` no schema).
 */
export async function apagarSessaoExternaGR(
  sessaoId: string,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({
    where: { id: sessaoId, tipoSessao: "EXTERNA_GR", escalao: { clubeId } },
    select: { id: true, escalaoId: true },
  });
  if (!sessao) return erro("Sessão não encontrada");

  const perm = await exigirCapacidade("TREINOS_GERIR", sessao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.sessao.delete({ where: { id: sessaoId } });

  revalidatePath(PATH);
  return ok(undefined);
}
