"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerEscalao, escaloesLegiveis } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  criarCompeticaoSchema,
  atualizarCompeticaoSchema,
  registarResultadoExternoSchema,
  registarConfrontoSchema,
  definirEstadoConfrontoSchema,
  ligarJogoAConfrontoSchema,
  criarCompeticaoCompletaSchema,
  equipaCompeticaoSchema,
  atualizarAgendamentoSchema,
} from "@/lib/schemas/competicao";
import { calcularClassificacao, type LinhaClassificacao } from "@/lib/classificacao";
import { gerarLiga, gerarBracket, type Equipa } from "@/lib/quadro";
import {
  Prisma,
  type Competicao,
  type ResultadoCompeticao,
  type EquipaCompeticao,
  type EstadoResultado,
  type CasaFora,
  type TipoParticipanteCompeticao,
} from "@prisma/client";

export type { LinhaClassificacao } from "@/lib/classificacao";

const PATH = "/jogos/competicoes";

// ─────────────────────────────────────────────
// Tipos de leitura
// ─────────────────────────────────────────────

const INCLUDE_RESUMO = {
  escalao: { select: { id: true, nome: true } },
  _count: { select: { jogos: true, resultados: true } },
} as const;

const ORDER_RESULTADOS: Prisma.ResultadoCompeticaoOrderByWithRelationInput[] = [
  { data: "asc" },
  { criadoEm: "asc" },
];

const INCLUDE_DETALHE = {
  escalao: { select: { id: true, nome: true } },
  resultados: { orderBy: ORDER_RESULTADOS },
  jogos: {
    select: {
      id: true,
      data: true,
      adversario: true,
      casaFora: true,
      golosMarcados: true,
      golosSofridos: true,
    },
    orderBy: { data: "asc" },
  },
  _count: { select: { jogos: true, resultados: true } },
} as const;

export type CompeticaoResumo = Prisma.CompeticaoGetPayload<{ include: typeof INCLUDE_RESUMO }>;
export type CompeticaoDetalhe = Prisma.CompeticaoGetPayload<{ include: typeof INCLUDE_DETALHE }>;

/** Alias retrocompatível (usado pela UI anterior a F6). */
export type CompeticaoComRelacoes = CompeticaoResumo;

// ─────────────────────────────────────────────
// CRUD de competições
// ─────────────────────────────────────────────

export async function listarCompeticoes(
  escalaoId?: string,
): Promise<Resultado<CompeticaoResumo[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");
  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  const legiveis = await escaloesLegiveis();
  let filtro: Prisma.CompeticaoWhereInput = {};
  if (escalaoId) {
    if (!(await podeLerEscalao(escalaoId))) return ok([]);
    filtro = { escalaoId };
  } else if (legiveis !== "TODOS") {
    filtro = { escalaoId: { in: legiveis } };
  }

  const competicoes = await prisma.competicao.findMany({
    where: { epocaId: epoca.id, clubeId, ...filtro },
    include: INCLUDE_RESUMO,
    orderBy: { criadoEm: "desc" },
  });
  return ok(competicoes);
}

export async function obterCompeticao(id: string): Promise<Resultado<CompeticaoDetalhe>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const competicao = await prisma.competicao.findFirst({
    where: { id, clubeId },
    include: INCLUDE_DETALHE,
  });
  if (!competicao) return erro("Competição não encontrada");
  if (!(await podeLerEscalao(competicao.escalaoId)))
    return erro("Sem permissão neste escalão");

  return ok(competicao);
}

export async function criarCompeticao(dados: unknown): Promise<Resultado<Competicao>> {
  const parsed = criarCompeticaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("COMPETICOES_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const clubeId = perm.ctx.clube.id;

  // Época: a indicada (validada contra o clube) ou a época ativa.
  let epocaId = parsed.data.epocaId ?? null;
  if (epocaId) {
    const epoca = await prisma.epoca.findFirst({ where: { id: epocaId, clubeId } });
    if (!epoca) return erro("A época selecionada não existe");
  } else {
    const epoca = await obterEpocaAtiva();
    if (!epoca) return erro("Nenhuma época ativa");
    epocaId = epoca.id;
  }

  const escalao = await prisma.escalao.findFirst({
    where: { id: parsed.data.escalaoId, clubeId },
  });
  if (!escalao) return erro("O escalão selecionado não existe");

  const competicao = await prisma.competicao.create({
    data: {
      clubeId,
      escalaoId: parsed.data.escalaoId,
      epocaId,
      nome: parsed.data.nome,
      tipo: parsed.data.tipo,
      formato: parsed.data.formato,
      // P1.2 (§23.3): âmbito + pontuação configurável + walkover.
      ambito: parsed.data.ambito,
      pontosVitoria: parsed.data.pontosVitoria,
      pontosEmpate: parsed.data.pontosEmpate,
      pontosDerrota: parsed.data.pontosDerrota,
      golosWalkover: parsed.data.golosWalkover,
    },
  });
  revalidatePath(PATH);
  return ok(competicao);
}

export async function atualizarCompeticao(
  id: string,
  dados: unknown,
): Promise<Resultado<Competicao>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  // O `id` do parâmetro é a autoridade (ignora um eventual id no payload).
  const parsed = atualizarCompeticaoSchema.safeParse({
    ...(typeof dados === "object" && dados !== null ? dados : {}),
    id,
  });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const existe = await prisma.competicao.findFirst({ where: { id, clubeId } });
  if (!existe) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", existe.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  // Mudança de escalão: exige permissão no destino e que pertença ao clube.
  const novoEscalaoId = parsed.data.escalaoId;
  if (novoEscalaoId && novoEscalaoId !== existe.escalaoId) {
    const permDestino = await exigirCapacidade("COMPETICOES_GERIR", novoEscalaoId);
    if (!permDestino.ok) return erro(permDestino.erro);
    const escalao = await prisma.escalao.findFirst({
      where: { id: novoEscalaoId, clubeId },
    });
    if (!escalao) return erro("O escalão selecionado não existe");
  }

  const data: Prisma.CompeticaoUpdateInput = {};
  if (parsed.data.nome !== undefined) data.nome = parsed.data.nome;
  if (parsed.data.tipo !== undefined) data.tipo = parsed.data.tipo;
  if (parsed.data.formato !== undefined) data.formato = parsed.data.formato;
  if (novoEscalaoId !== undefined)
    data.escalao = { connect: { id: novoEscalaoId } };

  const competicao = await prisma.competicao.update({ where: { id }, data });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return ok(competicao);
}

export async function apagarCompeticao(id: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const existe = await prisma.competicao.findFirst({ where: { id, clubeId } });
  if (!existe) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", existe.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  // Desliga os jogos da competição (não os apaga). Os resultados externos são
  // apagados em cascata (FK onDelete: Cascade).
  await prisma.$transaction([
    prisma.jogo.updateMany({ where: { competicaoId: id }, data: { competicaoId: null } }),
    prisma.competicao.delete({ where: { id } }),
  ]);
  revalidatePath(PATH);
  return ok(undefined);
}

// ─────────────────────────────────────────────
// Resultados externos (outras equipas)
// ─────────────────────────────────────────────

export async function registarResultadoExterno(
  dados: unknown,
): Promise<Resultado<ResultadoCompeticao>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = registarResultadoExternoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const competicao = await prisma.competicao.findFirst({
    where: { id: parsed.data.competicaoId, clubeId },
  });
  if (!competicao) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  if (parsed.data.equipaCasa.trim() === parsed.data.equipaFora.trim())
    return erro("As duas equipas têm de ser diferentes");

  // Golos opcionais (schema Prisma nullable): com ambos preenchidos o jogo está
  // REALIZADO; caso contrário fica AGENDADO (sem resultado).
  const golosCasa = parsed.data.golosCasa ?? null;
  const golosFora = parsed.data.golosFora ?? null;
  const realizado = golosCasa !== null && golosFora !== null;

  const resultado = await prisma.resultadoCompeticao.create({
    data: {
      competicaoId: parsed.data.competicaoId,
      equipaCasa: parsed.data.equipaCasa.trim(),
      equipaFora: parsed.data.equipaFora.trim(),
      golosCasa,
      golosFora,
      data: parsed.data.data ?? null,
      estado: realizado ? "REALIZADO" : "AGENDADO",
    },
  });
  revalidatePath(`${PATH}/${parsed.data.competicaoId}`);
  return ok(resultado);
}

export async function apagarResultadoExterno(id: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const resultado = await prisma.resultadoCompeticao.findFirst({
    where: { id, competicao: { clubeId } },
    select: { id: true, competicaoId: true, competicao: { select: { escalaoId: true } } },
  });
  if (!resultado) return erro("Resultado não encontrado");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", resultado.competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.resultadoCompeticao.delete({ where: { id } });
  revalidatePath(`${PATH}/${resultado.competicaoId}`);
  return ok(undefined);
}

// ─────────────────────────────────────────────
// P1.2 (§23) — Confrontos: registo, estado e ligação a jogo detalhado
// ─────────────────────────────────────────────

type ParticipanteResolvido =
  | { ok: true; id: string; nome: string }
  | { ok: false; erro: string };

/**
 * Resolve um participante de um confronto: por FK (`id`, validado contra a
 * competição) ou por nome (autocompletar). Se o nome não existir, cria um
 * participante EXTERNO on-the-fly (§23.7); tolera corridas (P2002) relendo.
 */
async function resolverParticipante(
  competicaoId: string,
  id: string | undefined,
  nome: string | undefined,
): Promise<ParticipanteResolvido> {
  if (id) {
    const eq = await prisma.equipaCompeticao.findFirst({
      where: { id, competicaoId },
      select: { id: true, nome: true },
    });
    if (!eq) return { ok: false, erro: "A equipa indicada não pertence a esta competição" };
    return { ok: true, id: eq.id, nome: eq.nome };
  }

  const nomeTrim = nome?.trim();
  if (!nomeTrim) return { ok: false, erro: "Indica as equipas do confronto" };

  const existente = await prisma.equipaCompeticao.findFirst({
    where: { competicaoId, nome: { equals: nomeTrim, mode: "insensitive" } },
    select: { id: true, nome: true },
  });
  if (existente) return { ok: true, id: existente.id, nome: existente.nome };

  try {
    const criada = await prisma.equipaCompeticao.create({
      data: { competicaoId, nome: nomeTrim, tipo: "EXTERNO" },
      select: { id: true, nome: true },
    });
    return { ok: true, id: criada.id, nome: criada.nome };
  } catch (e) {
    // Corrida: outro pedido criou a mesma equipa (viola @@unique). Relê.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const relida = await prisma.equipaCompeticao.findFirst({
        where: { competicaoId, nome: { equals: nomeTrim, mode: "insensitive" } },
        select: { id: true, nome: true },
      });
      if (relida) return { ok: true, id: relida.id, nome: relida.nome };
    }
    throw e;
  }
}

/**
 * Regista um confronto entre dois participantes (§23.8, evolução de
 * `registarResultadoExterno`). As equipas identificam-se por FK ou por nome (criado
 * on-the-fly). Persiste as FKs novas E os campos de texto legados (fallback de
 * apresentação/retrocompatibilidade). WALKOVER ignora os golos inseridos (§23.7).
 */
export async function registarConfronto(
  competicaoId: string,
  dados: unknown,
): Promise<Resultado<ResultadoCompeticao>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = registarConfrontoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const competicao = await prisma.competicao.findFirst({
    where: { id: competicaoId, clubeId },
    select: { id: true, escalaoId: true },
  });
  if (!competicao) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const casa = await resolverParticipante(
    competicaoId,
    parsed.data.equipaCasaId,
    parsed.data.equipaCasaNome,
  );
  if (!casa.ok) return erro(casa.erro);

  const fora = await resolverParticipante(
    competicaoId,
    parsed.data.equipaForaId,
    parsed.data.equipaForaNome,
  );
  if (!fora.ok) return erro(fora.erro);

  if (casa.id === fora.id || casa.nome.trim().toLowerCase() === fora.nome.trim().toLowerCase())
    return erro("As duas equipas têm de ser diferentes");

  // WALKOVER conta pelo resultado regulamentar (§23.7): os golos inseridos são
  // ignorados/limpos. REALIZADO/AGENDADO usam os golos fornecidos (se existirem).
  const walkover = parsed.data.estado === "WALKOVER";
  const golosCasa = walkover ? null : parsed.data.golosCasa ?? null;
  const golosFora = walkover ? null : parsed.data.golosFora ?? null;

  const resultado = await prisma.resultadoCompeticao.create({
    data: {
      competicaoId,
      equipaCasaId: casa.id,
      equipaForaId: fora.id,
      // Texto legado + fallback de apresentação (§23.3 notas de integridade).
      equipaCasa: casa.nome,
      equipaFora: fora.nome,
      golosCasa,
      golosFora,
      estado: parsed.data.estado,
      walkoverVencedor: walkover ? parsed.data.walkoverVencedor ?? null : null,
    },
  });
  revalidatePath(`${PATH}/${competicaoId}`);
  return ok(resultado);
}

/**
 * Define o estado de um confronto (AGENDADO | REALIZADO | CANCELADO | WALKOVER).
 * WALKOVER exige `walkoverVencedor`; noutros estados o vencedor de WO é limpo (§23.7).
 */
export async function definirEstadoConfronto(
  resultadoId: string,
  estado: EstadoResultado,
  walkoverVencedor?: CasaFora,
): Promise<Resultado<ResultadoCompeticao>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = definirEstadoConfrontoSchema.safeParse({ resultadoId, estado, walkoverVencedor });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const resultado = await prisma.resultadoCompeticao.findFirst({
    where: { id: resultadoId, competicao: { clubeId } },
    select: { id: true, competicaoId: true, competicao: { select: { escalaoId: true } } },
  });
  if (!resultado) return erro("Confronto não encontrado");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", resultado.competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const atualizado = await prisma.resultadoCompeticao.update({
    where: { id: resultadoId },
    data: {
      estado: parsed.data.estado,
      walkoverVencedor:
        parsed.data.estado === "WALKOVER" ? parsed.data.walkoverVencedor ?? null : null,
    },
  });
  revalidatePath(`${PATH}/${resultado.competicaoId}`);
  return ok(atualizado);
}

/**
 * Liga um jogo detalhado (convocatória/estatísticas) a um confronto (§23.8).
 * O jogo e o confronto têm de pertencer ao mesmo clube, escalão e época.
 */
export async function ligarJogoAConfronto(
  jogoId: string,
  resultadoId: string,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = ligarJogoAConfrontoSchema.safeParse({ jogoId, resultadoId });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const jogo = await prisma.jogo.findFirst({
    where: { id: jogoId, escalao: { clubeId } },
    select: { id: true, escalaoId: true, epocaId: true },
  });
  if (!jogo) return erro("Jogo não encontrado");

  const resultado = await prisma.resultadoCompeticao.findFirst({
    where: { id: resultadoId, competicao: { clubeId } },
    select: {
      id: true,
      competicaoId: true,
      competicao: { select: { escalaoId: true, epocaId: true } },
    },
  });
  if (!resultado) return erro("Confronto não encontrado");

  if (
    jogo.escalaoId !== resultado.competicao.escalaoId ||
    jogo.epocaId !== resultado.competicao.epocaId
  )
    return erro("O jogo e o confronto têm de ser do mesmo escalão e época");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", resultado.competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.jogo.update({
    where: { id: jogoId },
    data: { resultadoCompeticaoId: resultadoId },
  });
  revalidatePath(`${PATH}/${resultado.competicaoId}`);
  return ok(undefined);
}

/** Desliga o jogo detalhado do confronto a que estava associado (§23.8). */
export async function desligarJogoDeConfronto(jogoId: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const jogo = await prisma.jogo.findFirst({
    where: { id: jogoId, escalao: { clubeId } },
    select: {
      id: true,
      escalaoId: true,
      resultadoCompeticao: { select: { competicaoId: true } },
    },
  });
  if (!jogo) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", jogo.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.jogo.update({
    where: { id: jogoId },
    data: { resultadoCompeticaoId: null },
  });
  if (jogo.resultadoCompeticao?.competicaoId)
    revalidatePath(`${PATH}/${jogo.resultadoCompeticao.competicaoId}`);
  revalidatePath(PATH);
  return ok(undefined);
}

// ─────────────────────────────────────────────
// Classificação (calculada)
// ─────────────────────────────────────────────

/**
 * Tabela de classificação de uma competição, combinando os jogos da própria
 * equipa (com resultado final) e os resultados externos inseridos manualmente.
 * A tabela é CALCULADA (não armazenada) — bíblia §3.7.
 */
export async function obterClassificacao(
  competicaoId: string,
): Promise<Resultado<LinhaClassificacao[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const competicao = await prisma.competicao.findFirst({
    where: { id: competicaoId, clubeId },
    // P1.2 (§23.5): campos de pontuação configurável + walkover para o cálculo.
    include: { escalao: { select: { nome: true } } },
  });
  if (!competicao) return erro("Competição não encontrada");
  if (!(await podeLerEscalao(competicao.escalaoId)))
    return erro("Sem permissão neste escalão");

  // P1.2 (§23.5): nome da equipa própria vem do participante PROPRIO (se existir);
  // fallback = nome do escalão (comportamento de §10.9). Alimenta o `ehProprio`.
  const participanteProprio = await prisma.equipaCompeticao.findFirst({
    where: { competicaoId, tipo: "PROPRIO" },
    select: { nome: true },
  });
  const nomeEquipaPropria = participanteProprio?.nome ?? competicao.escalao.nome;

  // Jogos próprios com resultado final (ambos os golos preenchidos).
  const jogosBrutos = await prisma.jogo.findMany({
    where: {
      competicaoId,
      golosMarcados: { not: null },
      golosSofridos: { not: null },
    },
    select: { adversario: true, golosMarcados: true, golosSofridos: true },
  });

  // P1.2 (§23.5): só contam confrontos REALIZADO e WALKOVER (AGENDADO/CANCELADO
  // ignorados). Inclui `estado` e `walkoverVencedor` para o cálculo do WO.
  // `golosCasa`/`golosFora` são `Int?` (number | null) — o cálculo puro descarta os
  // REALIZADO sem golos.
  const resultadosBrutos = await prisma.resultadoCompeticao.findMany({
    where: { competicaoId, estado: { in: ["REALIZADO", "WALKOVER"] } },
    select: {
      equipaCasa: true,
      equipaFora: true,
      golosCasa: true,
      golosFora: true,
      estado: true,
      walkoverVencedor: true,
    },
  });

  // Narrowing por type guard (flatMap): descarta jogos próprios com golos nulos e
  // devolve objetos com golos garantidamente `number` (satisfaz JogoClassificacao).
  const jogosProprios = jogosBrutos.flatMap((j) =>
    j.golosMarcados === null || j.golosSofridos === null
      ? []
      : [
          {
            adversario: j.adversario,
            golosMarcados: j.golosMarcados,
            golosSofridos: j.golosSofridos,
          },
        ],
  );

  const resultados = resultadosBrutos.map((r) => ({
    equipaCasa: r.equipaCasa,
    equipaFora: r.equipaFora,
    golosCasa: r.golosCasa,
    golosFora: r.golosFora,
    estado: r.estado,
    walkoverVencedor: r.walkoverVencedor,
  }));

  const classificacao = calcularClassificacao({
    nomeEquipaPropria,
    formato: competicao.formato,
    jogosProprios,
    resultados,
    // P1.2 (§23.5): pontuação configurável (defaults preservam 3/1/0 para legado).
    pontosVitoria: competicao.pontosVitoria,
    pontosEmpate: competicao.pontosEmpate,
    pontosDerrota: competicao.pontosDerrota,
    golosWalkover: competicao.golosWalkover,
  });

  return ok(classificacao);
}

// ─────────────────────────────────────────────
// Equipas da competição (quadro competitivo)
// ─────────────────────────────────────────────

// Equipas ordenadas por posição (seed) ascendente, com os sem seed no fim, e o
// nome como desempate. O Postgres ordena NULLS LAST por defeito em ASC.
const ORDER_EQUIPAS: Prisma.EquipaCompeticaoOrderByWithRelationInput[] = [
  { posicao: { sort: "asc", nulls: "last" } },
  { nome: "asc" },
];

export async function obterEquipasCompeticao(
  competicaoId: string,
): Promise<Resultado<EquipaCompeticao[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const competicao = await prisma.competicao.findFirst({
    where: { id: competicaoId, clubeId },
    select: { id: true, escalaoId: true },
  });
  if (!competicao) return erro("Competição não encontrada");
  if (!(await podeLerEscalao(competicao.escalaoId)))
    return erro("Sem permissão neste escalão");

  const equipas = await prisma.equipaCompeticao.findMany({
    where: { competicaoId },
    orderBy: ORDER_EQUIPAS,
  });
  return ok(equipas);
}

export async function adicionarEquipaCompeticao(
  competicaoId: string,
  dados: { nome: string; posicao?: number },
): Promise<Resultado<EquipaCompeticao>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = equipaCompeticaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const competicao = await prisma.competicao.findFirst({
    where: { id: competicaoId, clubeId },
    select: { id: true, escalaoId: true },
  });
  if (!competicao) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const nome = parsed.data.nome.trim();

  // Unicidade case-insensitive dentro da competição.
  const duplicada = await prisma.equipaCompeticao.findFirst({
    where: { competicaoId, nome: { equals: nome, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicada) return erro("Já existe uma equipa com esse nome nesta competição");

  const equipa = await prisma.equipaCompeticao.create({
    data: { competicaoId, nome, posicao: parsed.data.posicao ?? null },
  });
  revalidatePath(`${PATH}/${competicaoId}`);
  return ok(equipa);
}

export async function removerEquipaCompeticao(equipaId: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const equipa = await prisma.equipaCompeticao.findFirst({
    where: { id: equipaId, competicao: { clubeId } },
    select: {
      id: true,
      nome: true,
      competicaoId: true,
      competicao: { select: { escalaoId: true } },
    },
  });
  if (!equipa) return erro("Equipa não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", equipa.competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  // Impede a remoção se a equipa já tem confrontos REALIZADO ou WALKOVER (casa ou
  // fora): apagá-la deixaria a classificação inconsistente (§23.7). Confrontos por
  // FK (equipaCasaId/equipaForaId) ou por nome legado são ambos considerados.
  const comResultado = await prisma.resultadoCompeticao.findFirst({
    where: {
      competicaoId: equipa.competicaoId,
      estado: { in: ["REALIZADO", "WALKOVER"] },
      OR: [
        { equipaCasa: equipa.nome },
        { equipaFora: equipa.nome },
        { equipaCasaId: equipa.id },
        { equipaForaId: equipa.id },
      ],
    },
    select: { id: true },
  });
  if (comResultado)
    return erro("Não é possível remover: a equipa já tem jogos realizados nesta competição");

  await prisma.equipaCompeticao.delete({ where: { id: equipaId } });
  revalidatePath(`${PATH}/${equipa.competicaoId}`);
  return ok(undefined);
}

// ─────────────────────────────────────────────
// Geração do quadro competitivo (calendário)
// ─────────────────────────────────────────────

export async function gerarQuadroCompeticao(
  competicaoId: string,
  opcoes: { duasMaos?: boolean } = {},
): Promise<Resultado<ResultadoCompeticao[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const competicao = await prisma.competicao.findFirst({
    where: { id: competicaoId, clubeId },
    include: { equipas: { orderBy: ORDER_EQUIPAS } },
  });
  if (!competicao) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  if (competicao.equipas.length < 2)
    return erro("Adiciona pelo menos 2 equipas antes de gerar o quadro");

  // Não regenerar por cima de um quadro já agendado (evita duplicar jogos).
  const jaAgendado = await prisma.resultadoCompeticao.findFirst({
    where: { competicaoId, estado: "AGENDADO" },
    select: { id: true },
  });
  if (jaAgendado)
    return erro("Quadro já gerado. Apaga os jogos agendados antes de regenerar.");

  const equipas: Equipa[] = competicao.equipas.map((e) => ({
    nome: e.nome,
    posicao: e.posicao,
  }));

  const jogos =
    competicao.formato === "LIGA"
      ? gerarLiga(equipas, opcoes.duasMaos ?? false)
      : gerarBracket(equipas);

  if (jogos.length === 0) return erro("Não foi possível gerar jogos para este quadro");

  await prisma.resultadoCompeticao.createMany({
    data: jogos.map((j) => ({
      competicaoId,
      equipaCasa: j.equipaCasa,
      equipaFora: j.equipaFora,
      ronda: j.ronda,
      golosCasa: null,
      golosFora: null,
      estado: "AGENDADO" as const,
    })),
  });

  // createMany não devolve os registos: relê o quadro gerado para retornar.
  const criados = await prisma.resultadoCompeticao.findMany({
    where: { competicaoId, estado: "AGENDADO" },
    orderBy: [{ ronda: "asc" }, { criadoEm: "asc" }],
  });
  revalidatePath(`${PATH}/${competicaoId}`);
  return ok(criados);
}

// ─────────────────────────────────────────────
// Criação completa (wizard) — base + equipas + jogos pré-agendados
// ─────────────────────────────────────────────

export async function criarCompeticaoCompleta(dados: unknown): Promise<Resultado<Competicao>> {
  const parsed = criarCompeticaoCompletaSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("COMPETICOES_GERIR", parsed.data.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const clubeId = perm.ctx.clube.id;

  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  const escalao = await prisma.escalao.findFirst({
    where: { id: parsed.data.escalaoId, clubeId },
  });
  if (!escalao) return erro("O escalão selecionado não existe");

  // Nomes de equipa únicos (case-insensitive) dentro da competição.
  const nomes = parsed.data.equipas.map((e) => e.nome.trim());
  const vistos = new Set<string>();
  for (const n of nomes) {
    const chave = n.toLowerCase();
    if (vistos.has(chave)) return erro(`Equipa duplicada: "${n}"`);
    vistos.add(chave);
  }

  // Jogos pré-agendados só podem referir equipas declaradas.
  const nomesValidos = new Set(nomes.map((n) => n.toLowerCase()));
  for (const j of parsed.data.jogos) {
    const casa = j.equipaCasa.trim();
    const fora = j.equipaFora.trim();
    if (casa.toLowerCase() === fora.toLowerCase())
      return erro("Um jogo não pode ter a mesma equipa em casa e fora");
    if (!nomesValidos.has(casa.toLowerCase()) || !nomesValidos.has(fora.toLowerCase()))
      return erro("Um jogo agendado refere uma equipa que não está na lista");
  }

  // P1.2 (§23.4 Fluxo D): em competições PRÓPRIAS, a equipa do próprio escalão é o
  // primeiro participante e fica marcada como PROPRIO (com escalaoVinculadoId). Se já
  // constar da lista do wizard (por nome, case-insensitive), promove-se essa entrada
  // em vez de duplicar (respeita @@unique([competicaoId, nome])).
  type ParticipanteData = {
    nome: string;
    posicao: number | null;
    tipo: TipoParticipanteCompeticao;
    escalaoVinculadoId: string | null;
    clubeVinculadoId: string | null;
  };

  const participantes: ParticipanteData[] = parsed.data.equipas.map((e) => ({
    nome: e.nome.trim(),
    posicao: e.posicao ?? null,
    tipo: e.tipo,
    escalaoVinculadoId: e.escalaoVinculadoId ?? null,
    clubeVinculadoId: e.clubeVinculadoId ?? null,
  }));

  if (parsed.data.ambito === "PROPRIA") {
    const nomeProprio = escalao.nome.trim();
    const existente = participantes.find(
      (p) => p.nome.toLowerCase() === nomeProprio.toLowerCase(),
    );
    if (existente) {
      existente.tipo = "PROPRIO";
      existente.escalaoVinculadoId = escalao.id;
      existente.clubeVinculadoId = clubeId;
    } else {
      participantes.unshift({
        nome: nomeProprio,
        posicao: null,
        tipo: "PROPRIO",
        escalaoVinculadoId: escalao.id,
        clubeVinculadoId: clubeId,
      });
    }
  }

  const competicao = await prisma.$transaction(async (tx) => {
    const comp = await tx.competicao.create({
      data: {
        clubeId,
        escalaoId: parsed.data.escalaoId,
        epocaId: epoca.id,
        nome: parsed.data.nome,
        tipo: parsed.data.tipo,
        formato: parsed.data.formato,
        formatoJogo: parsed.data.formatoJogo ?? null,
        // P1.2 (§23.3): âmbito + pontuação configurável + walkover.
        ambito: parsed.data.ambito,
        pontosVitoria: parsed.data.pontosVitoria,
        pontosEmpate: parsed.data.pontosEmpate,
        pontosDerrota: parsed.data.pontosDerrota,
        golosWalkover: parsed.data.golosWalkover,
      },
    });

    await tx.equipaCompeticao.createMany({
      data: participantes.map((p) => ({
        competicaoId: comp.id,
        nome: p.nome,
        posicao: p.posicao,
        tipo: p.tipo,
        escalaoVinculadoId: p.escalaoVinculadoId,
        clubeVinculadoId: p.clubeVinculadoId,
      })),
    });

    if (parsed.data.jogos.length > 0) {
      await tx.resultadoCompeticao.createMany({
        data: parsed.data.jogos.map((j) => ({
          competicaoId: comp.id,
          equipaCasa: j.equipaCasa.trim(),
          equipaFora: j.equipaFora.trim(),
          ronda: j.ronda ?? null,
          dataHora: j.dataHora ?? null,
          golosCasa: null,
          golosFora: null,
          estado: "AGENDADO" as const,
        })),
      });
    }

    return comp;
  });

  revalidatePath(PATH);
  return ok(competicao);
}

// ─────────────────────────────────────────────
// Agendamento de um jogo do quadro
// ─────────────────────────────────────────────

export async function atualizarAgendamentoJogo(
  resultadoId: string,
  dataHora: Date | null,
): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = atualizarAgendamentoSchema.safeParse({ resultadoId, dataHora });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const resultado = await prisma.resultadoCompeticao.findFirst({
    where: { id: resultadoId, competicao: { clubeId } },
    select: {
      id: true,
      competicaoId: true,
      competicao: { select: { escalaoId: true } },
    },
  });
  if (!resultado) return erro("Jogo não encontrado");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", resultado.competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  await prisma.resultadoCompeticao.update({
    where: { id: resultadoId },
    data: { dataHora: parsed.data.dataHora ?? null },
  });
  revalidatePath(`${PATH}/${resultado.competicaoId}`);
  return ok(undefined);
}
