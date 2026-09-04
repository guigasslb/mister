"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerEscalao, escaloesLegiveis } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  jogoSchema,
  guardarEstatisticasSchema,
  registarEventoJogoSchema,
  planoTaticoSchema,
  isVideoUrlValido,
  LIMITE_AMARELOS_SUSPENSAO,
  type SuspensaoPendente,
  type EstatisticaInput,
} from "@/lib/schemas/jogo";
import { modalidadeEfetiva, filtroModalidadeJogo } from "@/lib/modalidade-escalao";
import { derivarEstatisticasDeEventos } from "@/lib/eventos-para-estatisticas";
import {
  Prisma,
  type Epoca,
  type FormatoJogo,
  type Jogo,
  type EventoJogo,
  type Modalidade,
} from "@prisma/client";

const PATH = "/jogos";

const INCLUDE_LISTA = {
  escalao: {
    select: { id: true, nome: true, seccao: { select: { modalidade: true } } },
  },
  // Etiqueta discreta de autor nas listagens: quem criou o jogo (§ mostrar criador).
  criador: { select: { id: true, nome: true } },
} as const;

// F5 (M15): eventos ordenados por minuto e depois por ordem de registo.
// Tipado à parte para não colidir com o `as const` do include (tuplo readonly).
const ORDER_EVENTOS: Prisma.EventoJogoOrderByWithRelationInput[] = [
  { minuto: "asc" },
  { criadoEm: "asc" },
];

const INCLUDE_DETALHE = {
  escalao: {
    select: { id: true, nome: true, seccao: { select: { modalidade: true } } },
  },
  convocatorias: {
    include: {
      atleta: { select: { id: true, nome: true, posicoes: true } },
    },
  },
  estatisticas: { include: { valoresMetricas: true } },
  eventos: { orderBy: ORDER_EVENTOS },
  // F5 (M15): scouting contextualizado neste jogo (dia de jogo).
  observacoes: {
    include: { jogadores: true },
    orderBy: { criadoEm: "desc" },
  },
} as const;

export type JogoLista = Prisma.JogoGetPayload<{ include: typeof INCLUDE_LISTA }>;

/**
 * Item da lista de jogos com a modalidade EFETIVA já resolvida (§10.8), para o
 * frontend agrupar/filtrar por modalidade sem recalcular. `formato` (scalar) vem
 * no payload base.
 */
export type JogoListaItem = JogoLista & { modalidade: Modalidade };

/**
 * Detalhe do jogo. O número de camisola já não vive no Atleta (F1) — é resolvido
 * a partir da participação (AtletaEscalao) no escalão/época do jogo. `modalidade`
 * é a modalidade EFETIVA (§10.8) — sinaliza que núcleo estatístico mostrar e se
 * as faltas acumuladas por parte (só futsal) são visíveis.
 */
export type JogoDetalhe = Prisma.JogoGetPayload<{ include: typeof INCLUDE_DETALHE }> & {
  numeroPorAtleta: Record<string, number | null>;
  modalidade: Modalidade;
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

/**
 * Resolve o formato do jogo (§3.7/§10.8, "Derivação do formato" — DEVE):
 * usa o indicado, se houver; senão deriva da modalidade — FUTSAL → `FUTSAL_5`;
 * FUTEBOL não tem default (5 formatos), pelo que devolve `null` para o caller
 * sinalizar erro de validação. Função pura.
 */
function derivarFormato(
  indicado: FormatoJogo | null | undefined,
  modalidade: Modalidade,
): FormatoJogo | null {
  if (indicado) return indicado;
  if (modalidade === "FUTSAL") return "FUTSAL_5";
  return null;
}

const ERRO_FORMATO_FUTEBOL =
  "Indica o formato de jogo (o futebol tem vários formatos).";

export async function listarJogos(
  escalaoId?: string,
  modalidade?: Modalidade,
  estado?: "aberto" | "fechado",
): Promise<Resultado<JogoListaItem[]>> {
  const ctx = await contexto();
  if (ctx.estado === "erro") return erro(ctx.erro);

  const legiveis = await escaloesLegiveis();
  let filtroEscalao: Prisma.JogoWhereInput = {};
  if (escalaoId) {
    if (!(await podeLerEscalao(escalaoId))) return ok([]);
    filtroEscalao = { escalaoId };
  } else if (legiveis !== "TODOS") {
    filtroEscalao = { escalaoId: { in: legiveis } };
  }

  // Filtro opcional por estado de fecho (§ estado aberto/fechado): "aberto" →
  // ainda por fechar; "fechado" → já finalizado pelo treinador.
  const filtroEstado: Prisma.JogoWhereInput =
    estado === "aberto" ? { fechado: false } : estado === "fechado" ? { fechado: true } : {};

  const jogos = await prisma.jogo.findMany({
    where: {
      epocaId: ctx.epoca.id,
      escalao: { clubeId: ctx.clubeId },
      ...filtroEscalao,
      // 🔁 v7 (§10.8): filtro opcional por modalidade efetiva (secção do escalão
      // ou atividade pontual). Alimenta o seletor de secção do frontend (Fase 28).
      ...filtroModalidadeJogo(modalidade),
      ...filtroEstado,
    },
    include: INCLUDE_LISTA,
    orderBy: { data: "desc" },
  });
  return ok(
    jogos.map((j) => ({
      ...j,
      modalidade: modalidadeEfetiva(j.modalidadeAtividade, j.escalao.seccao?.modalidade),
    })),
  );
}

export async function obterJogo(id: string): Promise<Resultado<JogoDetalhe>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const jogo = await prisma.jogo.findFirst({
    where: { id, escalao: { clubeId } },
    include: INCLUDE_DETALHE,
  });
  if (!jogo) return erro("Jogo não encontrado");
  if (!(await podeLerEscalao(jogo.escalaoId))) return erro("Sem permissão neste escalão");

  const numeroPorAtleta = await resolverNumeros(
    jogo.escalaoId,
    jogo.epocaId,
    jogo.convocatorias.map((c) => c.atletaId),
  );
  const modalidade = modalidadeEfetiva(
    jogo.modalidadeAtividade,
    jogo.escalao.seccao?.modalidade,
  );
  return ok({ ...jogo, numeroPorAtleta, modalidade });
}

export async function criarJogo(dados: unknown): Promise<Resultado<Jogo>> {
  const session = await auth();
  if (!session?.user?.id) return erro("Não autenticado");

  const ctx = await contexto();
  if (ctx.estado === "erro") return erro(ctx.erro);

  const parsed = jogoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("JOGOS_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const escalao = await prisma.escalao.findFirst({
    where: { id: parsed.data.escalaoId, clubeId: ctx.clubeId },
    select: { id: true, seccao: { select: { modalidade: true } } },
  });
  if (!escalao) return erro("O escalão selecionado não existe");

  // Derivação do formato (§3.7/§10.8): FUTSAL → FUTSAL_5; FUTEBOL exige indicá-lo.
  const modalidade = modalidadeEfetiva(null, escalao.seccao?.modalidade);
  const formato = derivarFormato(parsed.data.formato, modalidade);
  if (!formato) return erro(ERRO_FORMATO_FUTEBOL);

  // A competição (se indicada) tem de pertencer ao clube e ao escalão do jogo.
  if (parsed.data.competicaoId) {
    const comp = await prisma.competicao.findFirst({
      where: {
        id: parsed.data.competicaoId,
        clubeId: ctx.clubeId,
        escalaoId: parsed.data.escalaoId,
      },
      select: { id: true },
    });
    if (!comp)
      return erro("A competição selecionada não existe ou não pertence a este escalão");
  }

  const jogo = await prisma.jogo.create({
    data: {
      data: parsed.data.data,
      adversario: parsed.data.adversario,
      casaFora: parsed.data.casaFora,
      tipo: parsed.data.tipo,
      escalaoId: parsed.data.escalaoId,
      // `competicao` (texto livre) foi deprecado no formulário (P4.3); usar
      // `competicaoId`. Novos jogos ficam com o campo legado a null.
      competicaoId: parsed.data.competicaoId ?? null,
      formato,
      local: parsed.data.local ?? null,
      golosMarcados: parsed.data.golosMarcados ?? null,
      golosSofridos: parsed.data.golosSofridos ?? null,
      faltas1aParte: parsed.data.faltas1aParte ?? null,
      faltas2aParte: parsed.data.faltas2aParte ?? null,
      videoUrl: parsed.data.videoUrl ? parsed.data.videoUrl : null,
      epocaId: ctx.epoca.id,
      criadorId: session.user.id,
    },
  });
  revalidatePath(PATH);
  return ok(jogo);
}

export async function atualizarJogo(id: string, dados: unknown): Promise<Resultado<Jogo>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = jogoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const existe = await prisma.jogo.findFirst({ where: { id, escalao: { clubeId } } });
  if (!existe) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("JOGOS_GERIR", existe.escalaoId);
  if (!perm.ok) return erro(perm.erro);
  if (parsed.data.escalaoId !== existe.escalaoId) {
    const permDestino = await exigirCapacidade("JOGOS_GERIR", parsed.data.escalaoId);
    if (!permDestino.ok) return erro(permDestino.erro);
  }

  // A competição (se indicada) tem de pertencer ao clube e ao escalão do jogo.
  if (parsed.data.competicaoId) {
    const comp = await prisma.competicao.findFirst({
      where: {
        id: parsed.data.competicaoId,
        clubeId,
        escalaoId: parsed.data.escalaoId,
      },
      select: { id: true },
    });
    if (!comp)
      return erro("A competição selecionada não existe ou não pertence a este escalão");
  }

  // Formato (§3.7/§10.8): o indicado prevalece; senão preserva o do jogo; senão
  // deriva da modalidade do escalão de destino (FUTEBOL exige indicá-lo).
  let formato: FormatoJogo | null = parsed.data.formato ?? existe.formato ?? null;
  if (!formato) {
    const escDestino = await prisma.escalao.findFirst({
      where: { id: parsed.data.escalaoId, clubeId },
      select: { seccao: { select: { modalidade: true } } },
    });
    const modalidade = modalidadeEfetiva(
      existe.modalidadeAtividade,
      escDestino?.seccao?.modalidade,
    );
    formato = derivarFormato(null, modalidade);
    if (!formato) return erro(ERRO_FORMATO_FUTEBOL);
  }

  const jogo = await prisma.jogo.update({
    where: { id },
    data: {
      data: parsed.data.data,
      adversario: parsed.data.adversario,
      casaFora: parsed.data.casaFora,
      tipo: parsed.data.tipo,
      escalaoId: parsed.data.escalaoId,
      formato,
      // `competicao` (texto livre) foi deprecado no formulário (P4.3): não é
      // reescrito aqui, preservando eventuais valores legados existentes.
      competicaoId: parsed.data.competicaoId ?? null,
      local: parsed.data.local ?? null,
      golosMarcados: parsed.data.golosMarcados ?? null,
      golosSofridos: parsed.data.golosSofridos ?? null,
      faltas1aParte: parsed.data.faltas1aParte ?? null,
      faltas2aParte: parsed.data.faltas2aParte ?? null,
      videoUrl: parsed.data.videoUrl ? parsed.data.videoUrl : null,
    },
  });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return ok(jogo);
}

export async function apagarJogo(id: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const existe = await prisma.jogo.findFirst({ where: { id, escalao: { clubeId } } });
  if (!existe) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("JOGOS_GERIR", existe.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.jogo.delete({ where: { id } });
  revalidatePath(PATH);
  return ok(undefined);
}

/**
 * Fecha o jogo (`fechado = true`). Um jogo fechado é considerado finalizado pelo
 * treinador. Segue o padrão das restantes actions: clube do utilizador +
 * capacidade JOGOS_GERIR no escalão do jogo.
 */
export async function fecharJogo(jogoId: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const jogo = await prisma.jogo.findFirst({ where: { id: jogoId, escalao: { clubeId } } });
  if (!jogo) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("JOGOS_GERIR", jogo.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.jogo.update({ where: { id: jogoId }, data: { fechado: true } });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${jogoId}`);
  return ok(undefined);
}

/**
 * Reabre o jogo (`fechado = false`). Reverte o fecho, permitindo voltar a editar.
 * Segue o padrão das restantes actions: clube do utilizador + capacidade
 * JOGOS_GERIR no escalão do jogo.
 */
export async function reabrirJogo(jogoId: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const jogo = await prisma.jogo.findFirst({ where: { id: jogoId, escalao: { clubeId } } });
  if (!jogo) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("JOGOS_GERIR", jogo.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.jogo.update({ where: { id: jogoId }, data: { fechado: false } });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${jogoId}`);
  return ok(undefined);
}

// ─── Convocatória ────────────────────────────────────────────────────────────

export async function definirConvocatoria(
  jogoId: string,
  atletaIds: string[],
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const jogo = await prisma.jogo.findFirst({ where: { id: jogoId, escalao: { clubeId } } });
  if (!jogo) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("CONVOCATORIA_GERIR", jogo.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  // Validação (F1): convocável = atleta do clube com participação ATIVA no escalão
  // do jogo, na época do jogo. Impede convocar atletas alheios via id forjado.
  const idsPedidos = [...new Set(atletaIds)];
  if (idsPedidos.length > 0) {
    const validos = await prisma.atletaEscalao.count({
      where: {
        atletaId: { in: idsPedidos },
        escalaoId: jogo.escalaoId,
        epocaId: jogo.epocaId,
        estado: "ATIVO",
        atleta: { clubeId, ativo: true },
      },
    });
    if (validos !== idsPedidos.length)
      return erro("Um ou mais atletas não pertencem a este escalão/época.");
  }

  const convocadosAtuais = await prisma.convocatoria.findMany({
    where: { jogoId },
    select: { atletaId: true },
  });
  const idsAtuais = new Set(convocadosAtuais.map((c) => c.atletaId));
  const idsNovos = new Set(atletaIds);

  const aRemover = [...idsAtuais].filter((id) => !idsNovos.has(id));
  const aAdicionar = atletaIds.filter((id) => !idsAtuais.has(id));

  await prisma.$transaction([
    // Remover convocatória e estatísticas dos removidos (secção 22.4)
    prisma.estatisticaAtleta.deleteMany({
      where: { jogoId, atletaId: { in: aRemover } },
    }),
    prisma.convocatoria.deleteMany({
      where: { jogoId, atletaId: { in: aRemover } },
    }),
    ...aAdicionar.map((atletaId) =>
      prisma.convocatoria.create({ data: { jogoId, atletaId, convocado: true } }),
    ),
  ]);
  revalidatePath(`${PATH}/${jogoId}`);
  return ok(undefined);
}

// ─── Estatísticas (Passo 10) ─────────────────────────────────────────────────

export async function guardarEstatisticas(
  jogoId: string,
  estatisticas: unknown,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const jogo = await prisma.jogo.findFirst({
    where: { id: jogoId, escalao: { clubeId } },
    include: { escalao: { select: { seccao: { select: { modalidade: true } } } } },
  });
  if (!jogo) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("ESTATISTICAS_GERIR", jogo.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const parsed = guardarEstatisticasSchema.safeParse(estatisticas);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Modalidade efetiva do jogo (§10.8): decide se o núcleo de futebol é gravado.
  // Em futsal os campos de futebol são forçados a `null` (não são núcleo — §10.8).
  const eFutebol =
    modalidadeEfetiva(jogo.modalidadeAtividade, jogo.escalao?.seccao?.modalidade) ===
    "FUTEBOL";

  // Só atletas convocados podem ter estatísticas (secção 12.5)
  const convocados = await prisma.convocatoria.findMany({
    where: { jogoId, convocado: true },
    select: { atletaId: true },
  });
  const idsConvocados = new Set(convocados.map((c) => c.atletaId));

  const validos = parsed.data.filter((e) => idsConvocados.has(e.atletaId));

  // Métricas ativas do clube (para validar os metricaId recebidos)
  const metricasAtivas = await prisma.metricaConfig.findMany({
    where: { clubeId },
    select: { id: true },
  });
  const idsMetricasValidas = new Set(metricasAtivas.map((m) => m.id));

  await prisma.$transaction(async (tx) => {
    for (const e of validos) {
      const dados = {
        utilizacao: e.utilizacao,
        blocoTempo: e.blocoTempo ?? null,
        minutos: e.minutos ?? null,
        golos: e.golos,
        assistencias: e.assistencias,
        defesas: e.defesas ?? null,
        golosSofridosGR: e.golosSofridosGR ?? null,
        faltasCometidas: e.faltasCometidas ?? null,
        // Disciplina (§3.7): gravados sempre, independentemente da modalidade.
        cartaoAmarelo: e.cartaoAmarelo,
        cartaoVermelho: e.cartaoVermelho,
        // Núcleo estatístico de FUTEBOL (§10.8): só gravado em jogos de futebol.
        // Em futsal fica sempre a `null` (a grelha nem os mostra — 10.8).
        remates: eFutebol ? (e.remates ?? null) : null,
        cantos: eFutebol ? (e.cantos ?? null) : null,
        forasDeJogo: eFutebol ? (e.forasDeJogo ?? null) : null,
        desarmes: eFutebol ? (e.desarmes ?? null) : null,
      };
      const estat = await tx.estatisticaAtleta.upsert({
        where: { jogoId_atletaId: { jogoId, atletaId: e.atletaId } },
        create: { jogoId, atletaId: e.atletaId, ...dados },
        update: dados,
      });

      // Valores de métricas configuráveis (upsert por métrica)
      const valores = (e.valoresMetricas ?? []).filter((v) =>
        idsMetricasValidas.has(v.metricaId),
      );
      for (const v of valores) {
        await tx.valorMetrica.upsert({
          where: {
            metricaId_estatisticaId: {
              metricaId: v.metricaId,
              estatisticaId: estat.id,
            },
          },
          create: { metricaId: v.metricaId, estatisticaId: estat.id, valor: v.valor },
          update: { valor: v.valor },
        });
      }
    }
  });
  revalidatePath(`${PATH}/${jogoId}`);
  return ok(undefined);
}

export async function guardarRelatorio(
  jogoId: string,
  relatorio: string,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const jogo = await prisma.jogo.findFirst({ where: { id: jogoId, escalao: { clubeId } } });
  if (!jogo) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("JOGOS_GERIR", jogo.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.jogo.update({
    where: { id: jogoId },
    data: { relatorio: relatorio.trim() || null },
  });
  revalidatePath(`${PATH}/${jogoId}`);
  return ok(undefined);
}

export async function definirVideo(jogoId: string, videoUrl: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const jogo = await prisma.jogo.findFirst({ where: { id: jogoId, escalao: { clubeId } } });
  if (!jogo) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("JOGOS_GERIR", jogo.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const url = videoUrl.trim();
  if (!isVideoUrlValido(url)) return erro("Indica um link válido do YouTube (https)");

  await prisma.jogo.update({ where: { id: jogoId }, data: { videoUrl: url || null } });
  revalidatePath(`${PATH}/${jogoId}`);
  return ok(undefined);
}

// ─── Plano de dia de jogo (F5 — M15) ─────────────────────────────────────────

/**
 * Define o plano tático de dia de jogo: posição e titularidade previstas por
 * convocado. Faz upsert em lote na tabela `Convocatoria` (chave [jogoId,
 * atletaId]). Só aceita atletas com participação ATIVA no escalão/época do jogo
 * (evita forjar ids). Guardado sob `CONVOCATORIA_GERIR` — a mesma capacidade que
 * gere as linhas de convocatória que este plano altera.
 */
export async function definirPlanoTatico(
  jogoId: string,
  plano: unknown[],
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const jogo = await prisma.jogo.findFirst({ where: { id: jogoId, escalao: { clubeId } } });
  if (!jogo) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("CONVOCATORIA_GERIR", jogo.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const parsed = planoTaticoSchema.safeParse(plano);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Deduplica por convocado (última entrada prevalece).
  const porAtleta = new Map<string, (typeof parsed.data)[number]>();
  for (const entrada of parsed.data) porAtleta.set(entrada.convocadoId, entrada);
  const entradas = [...porAtleta.values()];
  if (entradas.length === 0) return ok(undefined);

  const idsPedidos = [...porAtleta.keys()];
  const validos = await prisma.atletaEscalao.count({
    where: {
      atletaId: { in: idsPedidos },
      escalaoId: jogo.escalaoId,
      epocaId: jogo.epocaId,
      estado: "ATIVO",
      atleta: { clubeId, ativo: true },
    },
  });
  if (validos !== idsPedidos.length)
    return erro("Um ou mais atletas não pertencem a este escalão/época.");

  await prisma.$transaction(
    entradas.map((e) => {
      const posicaoPrevista = e.posicaoPrevista ?? null;
      const titularPrevisto = e.titularPrevisto ?? false;
      return prisma.convocatoria.upsert({
        where: { jogoId_atletaId: { jogoId, atletaId: e.convocadoId } },
        create: {
          jogoId,
          atletaId: e.convocadoId,
          convocado: true,
          posicaoPrevista,
          titularPrevisto,
        },
        update: { posicaoPrevista, titularPrevisto },
      });
    }),
  );
  revalidatePath(`${PATH}/${jogoId}`);
  return ok(undefined);
}

// ─── Modo ao vivo (registo de eventos) ───────────────────────────────────────

/**
 * Recalcula o resultado do jogo (`golosMarcados`/`golosSofridos`) a partir da
 * contagem de eventos `GOLO`/`GOLO_SOFRIDO`. Mantém o placar sincronizado com o
 * registo ao vivo. Corre dentro de uma transação (recebe o `tx`).
 */
async function recalcularResultadoJogo(
  tx: Prisma.TransactionClient,
  jogoId: string,
): Promise<void> {
  const [golosMarcados, golosSofridos] = await Promise.all([
    tx.eventoJogo.count({ where: { jogoId, tipo: "GOLO" } }),
    tx.eventoJogo.count({ where: { jogoId, tipo: "GOLO_SOFRIDO" } }),
  ]);
  await tx.jogo.update({
    where: { id: jogoId },
    data: { golosMarcados, golosSofridos },
  });
}

/**
 * Regista um evento ao vivo (golo, cartão, substituição com bloco, timeout…).
 * O `jogoId` vem no próprio payload (`registarEventoJogoSchema`).
 */
export async function registarEventoJogo(
  dados: unknown,
): Promise<Resultado<EventoJogo>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = registarEventoJogoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const jogo = await prisma.jogo.findFirst({
    where: { id: parsed.data.jogoId, escalao: { clubeId } },
  });
  if (!jogo) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("ESTATISTICAS_GERIR", jogo.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  // Valida que cada atleta referido pertence a este jogo: ou está na
  // convocatória, ou tem participação ATIVA no escalão/época do jogo.
  const pertenceAoJogo = async (atletaId: string): Promise<boolean> => {
    const convocado = await prisma.convocatoria.findFirst({
      where: { jogoId: jogo.id, atletaId },
    });
    if (convocado) return true;
    const participacaoAtiva = await prisma.atletaEscalao.count({
      where: {
        atletaId,
        escalaoId: jogo.escalaoId,
        epocaId: jogo.epocaId,
        estado: "ATIVO",
        atleta: { clubeId, ativo: true },
      },
    });
    return participacaoAtiva > 0;
  };

  if (parsed.data.atletaId && !(await pertenceAoJogo(parsed.data.atletaId)))
    return erro("O atleta não pertence à convocatória deste jogo.");

  if (
    parsed.data.atletaSecundarioId &&
    !(await pertenceAoJogo(parsed.data.atletaSecundarioId))
  )
    return erro("O atleta secundário não pertence à convocatória deste jogo.");

  const evento = await prisma.$transaction(async (tx) => {
    const criado = await tx.eventoJogo.create({
      data: {
        jogoId: parsed.data.jogoId,
        parte: parsed.data.parte,
        minuto: parsed.data.minuto ?? null,
        tipo: parsed.data.tipo,
        bloco: parsed.data.bloco ?? null,
        atletaId: parsed.data.atletaId ?? null,
        atletaSecundarioId: parsed.data.atletaSecundarioId ?? null,
      },
    });
    // Sincroniza o resultado quando o evento afeta o placar (golo marcado/sofrido).
    if (parsed.data.tipo === "GOLO" || parsed.data.tipo === "GOLO_SOFRIDO") {
      await recalcularResultadoJogo(tx, parsed.data.jogoId);
    }
    return criado;
  });
  revalidatePath(`${PATH}/${parsed.data.jogoId}`);
  return ok(evento);
}

export async function removerEventoJogo(eventoId: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const evento = await prisma.eventoJogo.findFirst({
    where: { id: eventoId, jogo: { escalao: { clubeId } } },
    select: { id: true, jogoId: true, tipo: true, jogo: { select: { escalaoId: true } } },
  });
  if (!evento) return erro("Evento não encontrado");

  const perm = await exigirCapacidade("ESTATISTICAS_GERIR", evento.jogo.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.$transaction(async (tx) => {
    await tx.eventoJogo.delete({ where: { id: eventoId } });
    // Recalcula o placar após remover um evento que o afetava.
    if (evento.tipo === "GOLO" || evento.tipo === "GOLO_SOFRIDO") {
      await recalcularResultadoJogo(tx, evento.jogoId);
    }
  });
  revalidatePath(`${PATH}/${evento.jogoId}`);
  return ok(undefined);
}

/** Eventos de um jogo, ordenados por minuto e depois por ordem de registo. */
export async function listarEventosJogo(jogoId: string): Promise<Resultado<EventoJogo[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const jogo = await prisma.jogo.findFirst({ where: { id: jogoId, escalao: { clubeId } } });
  if (!jogo) return erro("Jogo não encontrado");
  if (!(await podeLerEscalao(jogo.escalaoId))) return erro("Sem permissão neste escalão");

  const eventos = await prisma.eventoJogo.findMany({
    where: { jogoId },
    orderBy: ORDER_EVENTOS,
  });
  return ok(eventos);
}

/**
 * Pré-visualiza as estatísticas derivadas dos eventos ao vivo, SEM persistir.
 * Permite ao treinador rever o que os eventos produzem antes de guardar as
 * estatísticas do jogo. Segue o padrão de `guardarEstatisticas`: clube do
 * utilizador + capacidade `ESTATISTICAS_GERIR` + modalidade efetiva (§10.8).
 */
export async function previewEstatisticasDeEventos(
  jogoId: string,
): Promise<Resultado<EstatisticaInput[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const jogo = await prisma.jogo.findFirst({
    where: { id: jogoId, escalao: { clubeId } },
    include: { escalao: { select: { seccao: { select: { modalidade: true } } } } },
  });
  if (!jogo) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("ESTATISTICAS_GERIR", jogo.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  // Modalidade efetiva do jogo (§10.8): decide se o núcleo de futebol é contado.
  const eFutebol =
    modalidadeEfetiva(jogo.modalidadeAtividade, jogo.escalao?.seccao?.modalidade) ===
    "FUTEBOL";

  const eventos = await prisma.eventoJogo.findMany({
    where: { jogoId },
    orderBy: ORDER_EVENTOS,
    select: {
      tipo: true,
      atletaId: true,
      atletaSecundarioId: true,
      bloco: true,
      minuto: true,
    },
  });

  const convocados = await prisma.convocatoria.findMany({
    where: { jogoId, convocado: true },
    select: { atletaId: true, titularPrevisto: true },
  });

  const { estatisticas } = derivarEstatisticasDeEventos(
    eventos,
    convocados,
    eFutebol,
    jogo.formato,
  );

  return ok([...estatisticas.values()]);
}

// ─── Disciplina / suspensões (BUG-P1-04) ─────────────────────────────────────

/**
 * Suspensões pendentes para o PRÓXIMO jogo do escalão (na época ativa), a partir
 * dos cartões registados por jogo (`EstatisticaAtleta`).
 *
 * Para cada atleta convocado ao próximo jogo, na época:
 *  - Cartão vermelho: recebeu vermelho no ÚLTIMO jogo jogado → suspenso.
 *  - Acumulação de amarelos: ≥ LIMITE_AMARELOS_SUSPENSAO amarelos na época
 *    (simplificação: contam-se todos os amarelos da época, sem "purga" por jornada).
 *
 * Devolve apenas os atletas com suspensão pendente. Se não houver próximo jogo (ou
 * sem convocados), devolve lista vazia. O vermelho tem prioridade sobre os amarelos.
 */
export async function obterSuspensoesPendentes(
  escalaoId: string,
): Promise<Resultado<SuspensaoPendente[]>> {
  const ctx = await contexto();
  if (ctx.estado === "erro") return erro(ctx.erro);

  // 1. Isolamento multi-tenant + permissão de leitura do escalão.
  const escalao = await prisma.escalao.findFirst({
    where: { id: escalaoId, clubeId: ctx.clubeId },
    select: { id: true },
  });
  if (!escalao) return erro("Escalão não encontrado");
  if (!(await podeLerEscalao(escalaoId))) return erro("Sem permissão neste escalão");

  const agora = new Date();

  // 2. Próximo jogo do escalão (futuro, época ativa) + convocados.
  const proximoJogo = await prisma.jogo.findFirst({
    where: { escalaoId, epocaId: ctx.epoca.id, data: { gt: agora } },
    orderBy: { data: "asc" },
    select: {
      id: true,
      convocatorias: {
        where: { convocado: true },
        select: { atletaId: true, atleta: { select: { nome: true } } },
      },
    },
  });
  if (!proximoJogo || proximoJogo.convocatorias.length === 0) return ok([]);

  const atletaIds = proximoJogo.convocatorias.map((c) => c.atletaId);
  const nomePorAtleta = new Map(
    proximoJogo.convocatorias.map((c) => [c.atletaId, c.atleta.nome]),
  );

  // 3. Cartões dos convocados em jogos JÁ jogados (data < agora) do escalão/época.
  const estatisticas = await prisma.estatisticaAtleta.findMany({
    where: {
      atletaId: { in: atletaIds },
      jogo: { escalaoId, epocaId: ctx.epoca.id, data: { lt: agora } },
    },
    select: {
      atletaId: true,
      cartaoAmarelo: true,
      cartaoVermelho: true,
      jogoId: true,
      jogo: { select: { data: true } },
    },
  });

  const suspensoes: SuspensaoPendente[] = [];

  for (const atletaId of atletaIds) {
    const stats = estatisticas.filter((e) => e.atletaId === atletaId);
    if (stats.length === 0) continue;

    const nome = nomePorAtleta.get(atletaId) ?? "Atleta";

    // Cartão vermelho no último jogo jogado (o mais recente por data) → prioritário.
    const ultimo = [...stats].sort(
      (a, b) => b.jogo.data.getTime() - a.jogo.data.getTime(),
    )[0];
    if (ultimo && ultimo.cartaoVermelho > 0) {
      suspensoes.push({
        atletaId,
        nome,
        motivo: "CARTAO_VERMELHO",
        cartaoVermelhoNoJogoId: ultimo.jogoId,
      });
      continue;
    }

    // Acumulação de amarelos na época (simplificação: todos os amarelos).
    const amarelos = stats.reduce((acc, e) => acc + e.cartaoAmarelo, 0);
    if (amarelos >= LIMITE_AMARELOS_SUSPENSAO) {
      suspensoes.push({
        atletaId,
        nome,
        motivo: "ACUMULACAO_AMARELOS",
        amarelosAcumulados: amarelos,
      });
    }
  }

  return ok(suspensoes);
}
