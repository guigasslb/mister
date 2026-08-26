"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type AtletaEscalao } from "@prisma/client";
import { prisma } from "@/lib/db";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerAlgumEscalao } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  associarAEscalaoSchema,
  transferirEscalaoSchema,
  terminarParticipacaoSchema,
  editarTipoParticipacaoSchema,
  ficariaSemPrincipal,
  principaisADespromover,
} from "@/lib/schemas/participacao";

const PATH = "/plantel";
// O dashboard conta atletas por participações ativas (secção 8.16) — qualquer
// mutação de participação invalida também esse contador.
const PATH_DASHBOARD = "/dashboard";

/** Invalida as rotas afetadas por uma mutação de participação. */
function revalidarParticipacao(atletaId: string): void {
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${atletaId}`);
  revalidatePath(PATH_DASHBOARD);
}

/** Época a usar: a indicada (validada contra o clube) ou a ativa. */
async function resolverEpocaId(
  clubeId: string,
  epocaId?: string,
): Promise<{ ok: true; epocaId: string } | { ok: false; erro: string }> {
  if (epocaId) {
    const epoca = await prisma.epoca.findFirst({
      where: { id: epocaId, clubeId },
      select: { id: true },
    });
    if (!epoca) return { ok: false, erro: "A época selecionada não existe" };
    return { ok: true, epocaId: epoca.id };
  }

  const ativa = await obterEpocaAtiva();
  if (!ativa)
    return {
      ok: false,
      erro: "Nenhuma época ativa definida. Define uma época ativa antes de gerir participações.",
    };
  return { ok: true, epocaId: ativa.id };
}

// Número de camisola: NÃO é único (secção 9 — «dois atletas com o mesmo número:
// permitido; aviso não-bloqueante por escalão»). O aviso é responsabilidade da
// UI (lista do plantel); as actions gravam o número tal como indicado.

// ─── Associar a escalão ──────────────────────────────────────────────────────

export async function associarAEscalao(
  dados: unknown,
): Promise<Resultado<AtletaEscalao>> {
  const parsed = associarAEscalaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("PLANTEL_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const atleta = await prisma.atleta.findFirst({
    where: { id: parsed.data.atletaId, clubeId },
    select: { id: true },
  });
  if (!atleta) return erro("Atleta não encontrado");

  // A modalidade da participação deriva de escalao.seccao.modalidade (§1.7.1):
  // é ela que ancora o invariante do «principal por modalidade» (B3, §9).
  const escalao = await prisma.escalao.findFirst({
    where: { id: parsed.data.escalaoId, clubeId },
    select: { id: true, seccao: { select: { modalidade: true } } },
  });
  if (!escalao) return erro("O escalão selecionado não existe");

  const epoca = await resolverEpocaId(clubeId, parsed.data.epocaId);
  if (!epoca.ok) return erro(epoca.erro);

  // Número duplicado é permitido (secção 9): sem validação de unicidade.
  const numero = parsed.data.numero ?? null;
  const epocaId = epoca.epocaId;
  // Escalões sem secção (fase expand, antes do backfill) formam o seu próprio
  // "balde" de modalidade (null): assim o invariante continua a valer sem secção.
  const modalidadeDestino = escalao.seccao?.modalidade ?? null;

  try {
    // Leitura + escrita numa única transação Serializable: o invariante do
    // principal por modalidade (B3, §9) é imposto na escrita, evitando que duas
    // associações concorrentes criem dois principais na mesma modalidade.
    const participacao = await prisma.$transaction(
      async (tx) => {
        // Primeiro principal de uma modalidade nova (B3 — Apêndice C, §9): se o
        // atleta ainda não tem PRINCIPAL ativo na modalidade do escalão destino,
        // a participação nasce PRINCIPAL — única exceção à regra «associar nunca
        // força principal». Caso contrário, mantém-se o tipo pedido
        // (SIMULTANEA/OCASIONAL).
        const principaisAtivos = await tx.atletaEscalao.findMany({
          where: {
            atletaId: atleta.id,
            epocaId,
            estado: "ATIVO",
            tipo: "PRINCIPAL",
          },
          select: {
            escalao: { select: { seccao: { select: { modalidade: true } } } },
          },
        });

        const temPrincipalNaModalidade = principaisAtivos.some(
          (p) => (p.escalao?.seccao?.modalidade ?? null) === modalidadeDestino,
        );
        const tipo = temPrincipalNaModalidade ? parsed.data.tipo : "PRINCIPAL";

        return tx.atletaEscalao.create({
          data: {
            atletaId: atleta.id,
            escalaoId: parsed.data.escalaoId,
            epocaId,
            tipo,
            estado: "ATIVO",
            numero,
            dataInicio: new Date(),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    revalidarParticipacao(atleta.id);
    return ok(participacao);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return erro("O atleta já participa neste escalão nesta época.");
    throw e;
  }
}

// ─── Transferir de escalão ───────────────────────────────────────────────────

export async function transferirEscalao(
  dados: unknown,
): Promise<Resultado<AtletaEscalao>> {
  const parsed = transferirEscalaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Exige permissão nos DOIS escalões (origem e destino).
  const permOrigem = await exigirCapacidade("PLANTEL_GERIR", parsed.data.deEscalaoId);
  if (!permOrigem.ok) return erro(permOrigem.erro);
  const permDestino = await exigirCapacidade("PLANTEL_GERIR", parsed.data.paraEscalaoId);
  if (!permDestino.ok) return erro(permDestino.erro);
  const clubeId = permOrigem.ctx.clube.id;

  const atleta = await prisma.atleta.findFirst({
    where: { id: parsed.data.atletaId, clubeId },
    select: { id: true },
  });
  if (!atleta) return erro("Atleta não encontrado");

  const escaloes = await prisma.escalao.findMany({
    where: { id: { in: [parsed.data.deEscalaoId, parsed.data.paraEscalaoId] }, clubeId },
    select: { id: true, seccao: { select: { modalidade: true } } },
  });
  if (escaloes.length !== 2) return erro("Um dos escalões selecionados não existe");

  const epoca = await resolverEpocaId(clubeId, parsed.data.epocaId);
  if (!epoca.ok) return erro(epoca.erro);

  const agora = new Date();
  const destinoRef = {
    escalaoId: parsed.data.paraEscalaoId,
    tipo: parsed.data.tipo,
  };
  // Modalidade do escalão destino (§1.7.1): o invariante do principal é aplicado
  // POR MODALIDADE (§9) — a transferência não pode tocar no principal de outra
  // modalidade em que o atleta também participe.
  const modalidadeDestino =
    escaloes.find((e) => e.id === parsed.data.paraEscalaoId)?.seccao?.modalidade ??
    null;

  // ⚠️ CAMPO LEGADO NÃO SINCRONIZADO: esta transferência opera exclusivamente
  // sobre `AtletaEscalao` (fonte de verdade da fase expand). O campo legado
  // `Atleta.escalaoId` (e `escalaoSecundarioId`) NÃO é atualizado aqui — após
  // uma transferência, o legado diverge intencionalmente da participação real.
  // A fase M4 (contract) deve remover a dependência do campo legado e passar a
  // ler SEMPRE de `AtletaEscalao`, nunca de `Atleta.escalaoId`. Não reintroduzir
  // escrita ao legado aqui: seria mascarar o problema, não resolvê-lo.

  // Tudo — leitura das participações ativas, validação do invariante do
  // principal (secção 9), encerramento da origem, despromoção de um eventual
  // segundo principal e upsert do destino — corre numa única transação
  // Serializable: o invariante é imposto na escrita, não só na leitura (evita
  // TOCTOU entre duas transferências concorrentes do mesmo atleta).
  const resultado = await prisma.$transaction(
    async (tx): Promise<{ erro: string } | { destino: AtletaEscalao }> => {
      const ativas = await tx.atletaEscalao.findMany({
        where: { atletaId: atleta.id, epocaId: epoca.epocaId, estado: "ATIVO" },
        select: {
          id: true,
          escalaoId: true,
          tipo: true,
          numero: true,
          escalao: { select: { seccao: { select: { modalidade: true } } } },
        },
      });

      const origem = ativas.find((p) => p.escalaoId === parsed.data.deEscalaoId);
      if (!origem)
        return { erro: "O atleta não tem uma participação ativa no escalão de origem." };

      // Invariante do principal POR MODALIDADE (§9): só as participações da
      // modalidade de destino entram na verificação e na despromoção. Assim, uma
      // transferência dentro do futsal nunca despromove nem exige o principal do
      // futebol (e vice-versa).
      const naModalidadeDestino = ativas.filter(
        (p) => (p.escalao?.seccao?.modalidade ?? null) === modalidadeDestino,
      );

      // A transferência não pode deixar o atleta sem participação principal na
      // modalidade de destino.
      if (ficariaSemPrincipal(naModalidadeDestino, destinoRef, [parsed.data.deEscalaoId]))
        return {
          erro: "A transferência deixaria o atleta sem participação principal nesta época. Escolhe o tipo «Principal» no escalão de destino.",
        };

      // Número duplicado é permitido (secção 9): sem validação de unicidade.
      const numero = parsed.data.numero ?? origem.numero ?? null;

      await tx.atletaEscalao.update({
        where: { id: origem.id },
        data: { estado: "TRANSICAO_PERMANENTE", dataFim: agora },
      });

      // Um destino PRINCIPAL despromove qualquer outro principal que sobrasse
      // ativo na mesma modalidade, garantindo o principal único por
      // atleta/época/modalidade.
      for (const outro of principaisADespromover(naModalidadeDestino, destinoRef, [
        parsed.data.deEscalaoId,
      ])) {
        await tx.atletaEscalao.update({
          where: { id: outro.id },
          data: { tipo: "SIMULTANEA" },
        });
      }

      const destino = await tx.atletaEscalao.upsert({
        where: {
          atletaId_escalaoId_epocaId: {
            atletaId: atleta.id,
            escalaoId: parsed.data.paraEscalaoId,
            epocaId: epoca.epocaId,
          },
        },
        create: {
          atletaId: atleta.id,
          escalaoId: parsed.data.paraEscalaoId,
          epocaId: epoca.epocaId,
          tipo: parsed.data.tipo,
          estado: "ATIVO",
          numero,
          dataInicio: agora,
        },
        update: {
          tipo: parsed.data.tipo,
          estado: "ATIVO",
          numero,
          // Reentrada num escalão onde já houve participação: a nova etapa
          // começa agora (não herda a dataInicio da participação anterior).
          dataInicio: agora,
          dataFim: null,
        },
      });

      return { destino };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if ("erro" in resultado) return erro(resultado.erro);

  revalidarParticipacao(atleta.id);
  return ok(resultado.destino);
}

// ─── Terminar participação ───────────────────────────────────────────────────

export async function terminarParticipacao(
  dados: unknown,
): Promise<Resultado<AtletaEscalao>> {
  const parsed = terminarParticipacaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // PROMOVER_ATLETAS é uma capacidade de clube (não limitada por escalão).
  const perm = await exigirCapacidade("PROMOVER_ATLETAS");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const atleta = await prisma.atleta.findFirst({
    where: { id: parsed.data.atletaId, clubeId },
    select: { id: true },
  });
  if (!atleta) return erro("Atleta não encontrado");

  const epoca = await resolverEpocaId(clubeId, parsed.data.epocaId);
  if (!epoca.ok) return erro(epoca.erro);

  // ⚠️ CAMPO LEGADO NÃO SINCRONIZADO: o término de participação atua apenas
  // sobre `AtletaEscalao` (fonte de verdade). O campo legado `Atleta.escalaoId`
  // NÃO é atualizado aqui — após terminar uma participação, o legado pode
  // continuar a apontar para um escalão onde o atleta já não participa. A fase
  // M4 (contract) deve usar `AtletaEscalao` como fonte de verdade única, não o
  // campo legado. Não reintroduzir escrita ao legado aqui.

  // Leitura + escrita na mesma transação Serializable: o invariante «o atleta
  // tem sempre uma participação principal» (secção 9) é imposto na escrita.
  const resultado = await prisma.$transaction(
    async (tx): Promise<{ erro: string } | { terminada: AtletaEscalao }> => {
      const participacao = await tx.atletaEscalao.findFirst({
        where: {
          atletaId: atleta.id,
          escalaoId: parsed.data.escalaoId,
          epocaId: epoca.epocaId,
          estado: "ATIVO",
        },
        select: { id: true, tipo: true },
      });
      if (!participacao)
        return { erro: "O atleta não tem uma participação ativa neste escalão." };

      if (participacao.tipo === "PRINCIPAL")
        return {
          erro: "Não é possível terminar a participação principal. Transfira o atleta para outro escalão principal primeiro.",
        };

      const terminada = await tx.atletaEscalao.update({
        where: { id: participacao.id },
        data: { estado: "INATIVO", dataFim: new Date() },
      });
      return { terminada };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if ("erro" in resultado) return erro(resultado.erro);

  revalidarParticipacao(atleta.id);
  return ok(resultado.terminada);
}

// ─── Editar tipo de participação ─────────────────────────────────────────────

export async function editarTipoParticipacao(
  dados: unknown,
): Promise<Resultado<AtletaEscalao>> {
  const parsed = editarTipoParticipacaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Alterar a designação de participação (incl. promover/despromover o principal)
  // é uma capacidade de clube — a mesma que rege terminar/promover atletas.
  const perm = await exigirCapacidade("PROMOVER_ATLETAS");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const atleta = await prisma.atleta.findFirst({
    where: { id: parsed.data.atletaId, clubeId },
    select: { id: true },
  });
  if (!atleta) return erro("Atleta não encontrado");

  // A modalidade da participação deriva de escalao.seccao.modalidade (§1.7.1) e
  // ancora o invariante do «principal por modalidade» (§9).
  const escalao = await prisma.escalao.findFirst({
    where: { id: parsed.data.escalaoId, clubeId },
    select: { id: true, seccao: { select: { modalidade: true } } },
  });
  if (!escalao) return erro("O escalão selecionado não existe");

  const epoca = await resolverEpocaId(clubeId, parsed.data.epocaId);
  if (!epoca.ok) return erro(epoca.erro);

  const modalidadeAlvo = escalao.seccao?.modalidade ?? null;
  const destino = { escalaoId: parsed.data.escalaoId, tipo: parsed.data.tipo };

  // Leitura + escrita numa única transação Serializable: o invariante do
  // principal por modalidade (§9) é imposto na escrita, evitando que duas edições
  // concorrentes criem dois principais na mesma modalidade.
  const resultado = await prisma.$transaction(
    async (tx): Promise<{ erro: string } | { atualizada: AtletaEscalao }> => {
      const ativas = await tx.atletaEscalao.findMany({
        where: { atletaId: atleta.id, epocaId: epoca.epocaId, estado: "ATIVO" },
        select: {
          id: true,
          escalaoId: true,
          tipo: true,
          escalao: { select: { seccao: { select: { modalidade: true } } } },
        },
      });

      const alvo = ativas.find((p) => p.escalaoId === parsed.data.escalaoId);
      if (!alvo)
        return { erro: "O atleta não tem uma participação ativa neste escalão." };

      // Invariante POR MODALIDADE (§9): só as participações da modalidade do
      // escalão editado entram na verificação e na despromoção.
      const naModalidade = ativas.filter(
        (p) => (p.escalao?.seccao?.modalidade ?? null) === modalidadeAlvo,
      );

      // Despromover o único PRINCIPAL da modalidade deixaria o atleta sem
      // participação principal obrigatória (§9): recusado.
      if (ficariaSemPrincipal(naModalidade, destino))
        return {
          erro: "A alteração deixaria o atleta sem participação principal nesta modalidade. Define outro escalão como principal primeiro.",
        };

      // Passar a PRINCIPAL despromove qualquer outro principal ativo da mesma
      // modalidade para SIMULTANEA, garantindo o principal único.
      for (const outro of principaisADespromover(naModalidade, destino)) {
        await tx.atletaEscalao.update({
          where: { id: outro.id },
          data: { tipo: "SIMULTANEA" },
        });
      }

      const atualizada = await tx.atletaEscalao.update({
        where: { id: alvo.id },
        data: { tipo: parsed.data.tipo },
      });
      return { atualizada };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if ("erro" in resultado) return erro(resultado.erro);

  revalidarParticipacao(atleta.id);
  return ok(resultado.atualizada);
}

// ─── Leitura (histórico de participações) ────────────────────────────────────

export interface ParticipacaoHistorico {
  id: string;
  escalaoId: string;
  escalaoNome: string;
  epocaId: string;
  epocaNome: string;
  tipo: AtletaEscalao["tipo"];
  estado: AtletaEscalao["estado"];
  numero: number | null;
  dataInicio: Date;
  dataFim: Date | null;
}

/** Histórico completo de participações de um atleta (todas as épocas). */
export async function listarParticipacoes(
  atletaId: string,
): Promise<Resultado<ParticipacaoHistorico[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const atleta = await prisma.atleta.findFirst({
    where: { id: atletaId, clubeId },
    select: { id: true },
  });
  if (!atleta) return erro("Atleta não encontrado");

  const participacoes = await prisma.atletaEscalao.findMany({
    where: { atletaId, escalao: { clubeId } },
    include: {
      escalao: { select: { nome: true } },
      epoca: { select: { nome: true } },
    },
    orderBy: [{ dataInicio: "desc" }],
  });

  // Âmbito de leitura (secção 6.4): o histórico só é visível a quem possa ler
  // pelo menos um dos escalões onde o atleta participou.
  const escalaoIds = participacoes.map((p) => p.escalaoId);
  if (escalaoIds.length > 0 && !(await podeLerAlgumEscalao(escalaoIds)))
    return erro("Sem permissão para ler estes escalões");

  return ok(
    participacoes.map((p) => ({
      id: p.id,
      escalaoId: p.escalaoId,
      escalaoNome: p.escalao.nome,
      epocaId: p.epocaId,
      epocaNome: p.epoca.nome,
      tipo: p.tipo,
      estado: p.estado,
      numero: p.numero,
      dataInicio: p.dataInicio,
      dataFim: p.dataFim,
    })),
  );
}

// ─── Leitura (carreira / percurso do atleta) ─────────────────────────────────

/**
 * Uma etapa do percurso do atleta (época/escalão), para a aba «Carreira».
 * Vista só-de-leitura: os campos `dataIngresso`/`dataSaida` correspondem ao
 * início e fim da participação (AtletaEscalao.dataInicio/dataFim).
 */
export interface CarreiraEntry {
  id: string;
  epocaNome: string;
  /** A época em contexto é a época ativa do clube (marca a etapa atual). */
  epocaAtiva: boolean;
  escalaoNome: string;
  numero: number | null;
  estado: AtletaEscalao["estado"];
  dataIngresso: Date;
  dataSaida: Date | null;
}

/**
 * Percurso completo do atleta ao longo das épocas (aba «Carreira», secção 8.5).
 * Vista só-de-leitura sobre AtletaEscalao — sem ações de gestão (essas vivem na
 * aba «Participações»). Ordenado da época mais recente para a mais antiga.
 */
export async function obterCarreiraAtleta(
  atletaId: string,
): Promise<Resultado<CarreiraEntry[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const atleta = await prisma.atleta.findFirst({
    where: { id: atletaId, clubeId },
    select: { id: true },
  });
  if (!atleta) return erro("Atleta não encontrado");

  const participacoes = await prisma.atletaEscalao.findMany({
    where: { atletaId, escalao: { clubeId } },
    include: {
      escalao: { select: { nome: true } },
      epoca: { select: { nome: true, ativa: true } },
    },
    // Época mais recente primeiro; dentro da época, a etapa mais recente primeiro.
    orderBy: [{ epoca: { dataInicio: "desc" } }, { dataInicio: "desc" }],
  });

  // Âmbito de leitura (secção 6.4): o percurso só é visível a quem possa ler
  // pelo menos um dos escalões onde o atleta participou.
  const escalaoIds = participacoes.map((p) => p.escalaoId);
  if (escalaoIds.length > 0 && !(await podeLerAlgumEscalao(escalaoIds)))
    return erro("Sem permissão para ler estes escalões");

  return ok(
    participacoes.map((p) => ({
      id: p.id,
      epocaNome: p.epoca.nome,
      epocaAtiva: p.epoca.ativa,
      escalaoNome: p.escalao.nome,
      numero: p.numero,
      estado: p.estado,
      dataIngresso: p.dataInicio,
      dataSaida: p.dataFim,
    })),
  );
}
