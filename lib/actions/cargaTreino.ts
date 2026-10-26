"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import {
  exigirCapacidade,
  podeLerEscalao,
  obterMembroAtual,
} from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  registarRpeSchema,
  registarRpeSessaoSchema,
  obterCargaAtletasSchema,
  SEMANAS_CARGA_DEFAULT,
  SEMANAS_CARGA_ATLETA_DEFAULT,
} from "@/lib/schemas/cargaTreino";
// Funções puras de cálculo (§8.20) vivem fora deste módulo: um ficheiro com
// `"use server"` só pode exportar funções async.
import {
  calcularCargaSemanal,
  inicioSemana,
  recuarSemanas,
  type DadosCargaSemanal,
  type SessaoCarga,
  type ZonaCarga,
} from "@/lib/utils/cargaTreino";

const PATH = "/treinos";

// ─────────────────────────────────────────────────────────────────────────────
// Server Actions — escrita
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RPE da sessão atribuído pelo treinador (1-10). Exige TREINOS_GERIR no escalão da
 * sessão. Atualiza o campo `rpeSessao` do `Sessao` (bíblia §8.20).
 */
export async function registarRpeSessao(
  sessaoId: string,
  rpeSessao: number,
): Promise<Resultado<void>> {
  const parsed = registarRpeSessaoSchema.safeParse({ sessaoId, rpeSessao });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({
    where: { id: parsed.data.sessaoId, escalao: { clubeId } },
    select: { id: true, escalaoId: true },
  });
  if (!sessao) return erro("Sessão não encontrada");

  const perm = await exigirCapacidade("TREINOS_GERIR", sessao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.sessao.update({
    where: { id: sessao.id },
    data: { rpeSessao: parsed.data.rpeSessao },
  });

  revalidatePath(PATH);
  revalidatePath(`${PATH}/${sessao.id}`);
  return ok(undefined);
}

/**
 * RPE individual reportado por um atleta para uma sessão (1-10). Upsert em
 * `RpeAtleta`. Exige autenticação; a sessão e o atleta têm de pertencer ao clube
 * do utilizador (bíblia §8.20).
 */
export async function registarRpeAtleta(
  sessaoId: string,
  atletaId: string,
  rpe: number,
): Promise<Resultado<void>> {
  const parsed = registarRpeSchema.safeParse({ sessaoId, rpe });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const session = await auth();
  if (!session?.user?.id) return erro("Não autenticado");

  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const sessao = await prisma.sessao.findFirst({
    where: { id: parsed.data.sessaoId, escalao: { clubeId } },
    select: { id: true, escalaoId: true },
  });
  if (!sessao) return erro("Sessão não encontrada");
  if (!(await podeLerEscalao(sessao.escalaoId)))
    return erro("Sem permissão neste escalão");

  const atleta = await prisma.atleta.findFirst({
    where: { id: atletaId, clubeId },
    select: { id: true },
  });
  if (!atleta) return erro("Atleta não encontrado");

  await prisma.rpeAtleta.upsert({
    where: { sessaoId_atletaId: { sessaoId: sessao.id, atletaId: atleta.id } },
    create: { sessaoId: sessao.id, atletaId: atleta.id, rpe: parsed.data.rpe },
    update: { rpe: parsed.data.rpe },
  });

  revalidatePath(PATH);
  revalidatePath(`${PATH}/${sessao.id}`);
  return ok(undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Action — leitura
// ─────────────────────────────────────────────────────────────────────────────

export interface CargaSemanalEscalao {
  escalaoId: string;
  semanas: DadosCargaSemanal[];
  /** Verdadeiro se existe pelo menos uma sessão com RPE na janela. */
  temDados: boolean;
}

/**
 * Curva de carga das últimas `semanas` (default 8) de um escalão. Devolve, por
 * semana, a carga acumulada, o RPE médio e o ACWR (bíblia §8.20). Exige
 * RELATORIOS_VER e leitura do escalão.
 */
export async function obterCargaSemanal(
  escalaoId: string,
  semanas: number = SEMANAS_CARGA_DEFAULT,
): Promise<Resultado<CargaSemanalEscalao>> {
  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Não autenticado");
  if (!ctx.capacidades.includes("RELATORIOS_VER")) return erro("Sem permissão");

  const escalao = await prisma.escalao.findFirst({
    where: { id: escalaoId, clubeId: ctx.clube.id },
    select: { id: true },
  });
  if (!escalao) return erro("Escalão não encontrado");
  if (!(await podeLerEscalao(escalaoId))) return erro("Sem permissão neste escalão");

  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  const n = Math.min(Math.max(Math.trunc(semanas), 1), 52);
  const agora = new Date();
  const janelaInicio = recuarSemanas(inicioSemana(agora), n - 1);

  const sessoes = await prisma.sessao.findMany({
    where: {
      epocaId: epoca.id,
      escalaoId,
      data: { gte: janelaInicio },
    },
    select: { data: true, duracaoMin: true, rpeSessao: true },
  });

  const dados = calcularCargaSemanal(sessoes, n, agora);
  return ok({
    escalaoId,
    semanas: dados,
    temDados: dados.some((d) => d.nSessoes > 0),
  });
}

/** Carga/ACWR da semana corrente de um atleta (F2.1, §8.20). */
export interface CargaAtleta {
  atletaId: string;
  nome: string;
  /** ACWR da semana atual; null quando não há histórico com carga (ou sem RPE). */
  acwrAtual: number | null;
  /** Zona derivada do ACWR; null quando o atleta não reportou RPE na janela. */
  zona: ZonaCarga | null;
  /** Carga acumulada da semana atual: Σ(duracaoMin × rpeIndividual). */
  cargaSemanaAtual: number;
}

// Prioridade de ordenação por risco: RISCO no topo, sem dados no fim (F2.1).
const PRIORIDADE_ZONA: Record<ZonaCarga, number> = {
  RISCO: 3,
  SUBCARGA: 2,
  IDEAL: 1,
};

/**
 * ACWR individual por atleta de um escalão (F2.1, bíblia §8.20). Para cada atleta
 * ativo do escalão na época ativa, constrói a série de carga percebida a partir do
 * RPE individual (`RpeAtleta.rpe × Sessao.duracaoMin`) e devolve o ACWR + zona da
 * semana corrente. Atletas sem RPE reportado na janela surgem com `acwrAtual`/`zona`
 * a null (não são excluídos silenciosamente). Reutiliza a função pura
 * `calcularCargaSemanal`. Exige RELATORIOS_VER e leitura do escalão.
 *
 * Ordenação: zona de risco descendente (RISCO primeiro), depois carga descendente.
 */
export async function obterCargaAtletas(input: {
  escalaoId: string;
  semanas?: number;
}): Promise<Resultado<{ atletas: CargaAtleta[] }>> {
  const parsed = obterCargaAtletasSchema.safeParse(input);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Não autenticado");
  if (!ctx.capacidades.includes("RELATORIOS_VER")) return erro("Sem permissão");

  const { escalaoId } = parsed.data;

  const escalao = await prisma.escalao.findFirst({
    where: { id: escalaoId, clubeId: ctx.clube.id },
    select: { id: true },
  });
  if (!escalao) return erro("Escalão não encontrado");
  if (!(await podeLerEscalao(escalaoId))) return erro("Sem permissão neste escalão");

  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  const n = parsed.data.semanas ?? SEMANAS_CARGA_ATLETA_DEFAULT;
  const agora = new Date();
  const janelaInicio = recuarSemanas(inicioSemana(agora), n - 1);

  // Plantel ativo do escalão na época (fonte da lista — inclui quem nunca reportou RPE).
  const participacoes = await prisma.atletaEscalao.findMany({
    where: { epocaId: epoca.id, escalaoId, estado: "ATIVO", atleta: { ativo: true } },
    select: { atletaId: true, atleta: { select: { nome: true } } },
  });

  // Uma query aos RPE individuais da janela, agregada em memória por atletaId.
  const rpes = await prisma.rpeAtleta.findMany({
    where: {
      sessao: { epocaId: epoca.id, escalaoId, data: { gte: janelaInicio } },
    },
    select: {
      atletaId: true,
      rpe: true,
      sessao: { select: { data: true, duracaoMin: true } },
    },
  });

  const porAtleta = new Map<string, SessaoCarga[]>();
  for (const r of rpes) {
    const serie = porAtleta.get(r.atletaId) ?? [];
    // sRPE individual: rpeSessao := RPE do atleta; duracaoMin := duração da sessão.
    serie.push({ data: r.sessao.data, duracaoMin: r.sessao.duracaoMin, rpeSessao: r.rpe });
    porAtleta.set(r.atletaId, serie);
  }

  const atletas: CargaAtleta[] = participacoes.map((p) => {
    const serie = porAtleta.get(p.atletaId);
    if (!serie || serie.length === 0) {
      return {
        atletaId: p.atletaId,
        nome: p.atleta.nome,
        acwrAtual: null,
        zona: null,
        cargaSemanaAtual: 0,
      };
    }
    const semanas = calcularCargaSemanal(serie, n, agora);
    const atual = semanas[semanas.length - 1];
    return {
      atletaId: p.atletaId,
      nome: p.atleta.nome,
      acwrAtual: atual.acwr,
      zona: atual.zona,
      cargaSemanaAtual: atual.cargaAcumulada,
    };
  });

  atletas.sort((a, b) => {
    const pz = (a.zona ? PRIORIDADE_ZONA[a.zona] : 0);
    const qz = (b.zona ? PRIORIDADE_ZONA[b.zona] : 0);
    if (pz !== qz) return qz - pz; // zona de risco descendente
    return b.cargaSemanaAtual - a.cargaSemanaAtual; // depois carga descendente
  });

  return ok({ atletas });
}
