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
  atualizarGolosConfrontoSchema,
  definirPlantelEquipaCompeticaoSchema,
  copiarPlanteisCompeticaoSchema,
  editarConfrontoSchema,
  apagarConfrontoSchema,
  apagarCompeticaoSchema,
  reordenarConfrontosSchema,
  type DecisaoConvocatoria,
  type DecisaoJogosComDados,
} from "@/lib/schemas/competicao";
import { calcularClassificacao, type LinhaClassificacao } from "@/lib/classificacao";
import { gerarLiga, gerarBracket, type Equipa } from "@/lib/quadro";
import { ORDER_RESULTADOS } from "@/lib/ordem-confrontos";
import { ERRO_IMPACTO_COMPETICAO, ERRO_IMPACTO_CONFRONTO } from "@/lib/erros-impacto-confronto";
import {
  sincronizarJogoDoConfronto,
  validarLigacaoJogoConfronto,
  obterEquipasProprias,
  ladosProprios,
  jogosQueSaemDoConfronto,
  ladosInvertidos,
  resultadoAposEdicao,
  type LadoProprio,
} from "@/lib/sincronizacao-jogo-confronto";
import {
  SELECT_REMOCAO_JOGO,
  agruparImpacto,
  motivosDados,
  wherePodeApagar,
  type ImpactoRemocaoJogos,
  type JogoParaRemocao,
} from "@/lib/remocao-jogos-competicao";
import {
  ORDEM_EQUIPAS_PROPRIAS,
  corresponderSubequipas,
  adversarioEhOutraSubequipa,
} from "@/lib/subequipas";
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
// §23.6: confrontos da equipa própria refletem-se no Jogo ligado (lista/agenda/detalhe).
const PATH_JOGOS = "/jogos";

/**
 * Revalida /jogos e o detalhe dos jogos sincronizados com um confronto (se houver;
 * dois num confronto interno A vs B — §23.11).
 */
function revalidarJogos(jogoIds: string[]) {
  if (jogoIds.length === 0) return;
  revalidatePath(PATH_JOGOS);
  for (const id of jogoIds) revalidatePath(`${PATH_JOGOS}/${id}`);
}

// ─────────────────────────────────────────────
// Tipos de leitura
// ─────────────────────────────────────────────

const INCLUDE_RESUMO = {
  escalao: { select: { id: true, nome: true } },
  _count: { select: { jogos: true, resultados: true } },
  // §23.11.3 regra 1: SÓ as equipas próprias (subequipas) — alimentam o seletor
  // «Equipa» do formulário de jogo (obrigatório quando há ≥2).
  equipas: {
    where: { tipo: "PROPRIO" },
    select: { id: true, nome: true },
    orderBy: ORDEM_EQUIPAS_PROPRIAS,
  },
} as const;


/** Próxima `ordem` livre da competição (fim da lista; 1 sem confrontos com ordem). */
async function proximaOrdem(
  db: Prisma.TransactionClient | typeof prisma,
  competicaoId: string,
): Promise<number> {
  const agg = await db.resultadoCompeticao.aggregate({
    where: { competicaoId },
    _max: { ordem: true },
  });
  return (agg._max.ordem ?? 0) + 1;
}

// Equipas ordenadas por posição (seed) ascendente, com os sem seed no fim, e o
// nome como desempate. O Postgres ordena NULLS LAST por defeito em ASC.
const ORDER_EQUIPAS: Prisma.EquipaCompeticaoOrderByWithRelationInput[] = [
  { posicao: { sort: "asc", nulls: "last" } },
  { nome: "asc" },
];

const INCLUDE_DETALHE = {
  escalao: { select: { id: true, nome: true } },
  equipas: { orderBy: ORDER_EQUIPAS },
  resultados: {
    orderBy: ORDER_RESULTADOS,
    // §23.11.3 regra 6: jogos ligados ao confronto (dois num A vs B) — a UI deteta
    // a divergência de placar com `placarDivergente` (lib/subequipas.ts).
    include: {
      jogosDetalhados: {
        select: { id: true, equipaCompeticaoId: true, golosMarcados: true, golosSofridos: true },
      },
    },
  },
  jogos: {
    select: {
      id: true,
      data: true,
      adversario: true,
      casaFora: true,
      golosMarcados: true,
      golosSofridos: true,
      // §23.11.3 regra 11: subequipa do jogo (nome em vez do do escalão).
      equipaCompeticao: { select: { id: true, nome: true } },
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

/**
 * Apaga a competição (confrontos, equipas e plantéis em cascata). D2: com
 * `apagarJogos = false` (default) os jogos ficam em /jogos, desligados — o
 * comportamento anterior. Com `apagarJogos = true` apaga também os jogos sem
 * convocatória nem dados (e os só com convocatória, se `jogosComConvocatoria =
 * "APAGAR"`, com JOGOS_GERIR); os restantes ficam desligados (regra R3).
 */
export async function apagarCompeticao(
  id: string,
  opcoes: unknown = {},
): Promise<Resultado<{ jogosApagados: number; jogosMantidos: number }>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = apagarCompeticaoSchema.safeParse(opcoes);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const existe = await prisma.competicao.findFirst({ where: { id, clubeId } });
  if (!existe) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", existe.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  // Desliga os jogos da competição. Também desliga confronto e subequipa (apagados
  // em cascata), sem depender da ordem de aplicação das FKs SET NULL.
  const desligar = () =>
    prisma.jogo.updateMany({
      where: { competicaoId: id },
      data: { competicaoId: null, resultadoCompeticaoId: null, equipaCompeticaoId: null },
    });

  if (!parsed.data.apagarJogos) {
    const [desligados] = await prisma.$transaction([
      desligar(),
      prisma.competicao.delete({ where: { id } }),
    ]);
    revalidatePath(PATH);
    revalidatePath(PATH_JOGOS);
    return ok({ jogosApagados: 0, jogosMantidos: desligados.count });
  }

  const whereJogos = whereJogosDaCompeticao(id, clubeId);
  const jogos = await prisma.jogo.findMany({ where: whereJogos, select: SELECT_REMOCAO_JOGO });
  const impacto = agruparImpacto(jogos);
  const decisao = await validarDecisaoConvocatoria(
    impacto,
    parsed.data.jogosComConvocatoria,
    existe.escalaoId,
  );
  if (!decisao.ok) return decisao.resultado;

  const [apagados, desligados] = await prisma.$transaction([
    prisma.jogo.deleteMany({
      where: { AND: [whereJogos, wherePodeApagar(decisao.apagarConvocatoria)] },
    }),
    desligar(),
    prisma.competicao.delete({ where: { id } }),
  ]);
  revalidatePath(PATH);
  revalidatePath(PATH_JOGOS);
  return ok({ jogosApagados: apagados.count, jogosMantidos: desligados.count });
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

  // §23.6: o confronto da equipa própria com data/hora passa a existir como Jogo em
  // /jogos (na mesma transação). Sem data ou entre terceiros a sincronização não faz
  // nada. R6: vai para o fim da lista (fim da sua jornada).
  const [resultado, jogoIds] = await prisma.$transaction(async (tx) => {
    const r = await tx.resultadoCompeticao.create({
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
        ronda: parsed.data.ronda ?? null,
        dataHora: parsed.data.dataHora ?? null,
        ordem: await proximaOrdem(tx, competicaoId),
      },
    });
    return [r, await sincronizarJogoDoConfronto(tx, r.id, perm.ctx.utilizadorId)] as const;
  });
  revalidatePath(`${PATH}/${competicaoId}`);
  revalidarJogos(jogoIds);
  return ok(resultado);
}

// ─────────────────────────────────────────────
// Calendário editável (2026-10-20) — editar/apagar/reordenar confrontos (§23.6
// regra R3, decisões D1 e D3) e impacto em /jogos
// ─────────────────────────────────────────────

const ERRO_SEM_PERMISSAO_CONVOCATORIA =
  "Não tens permissão para apagar jogos com convocatória neste escalão.";
const ERRO_ALTERAR_RESULTADO =
  "Este confronto já tem resultado: mudar as equipas altera a classificação. Confirma a alteração para continuar.";

const norm = (s: string) => s.trim().toLowerCase();

/** Corrida na gravação: um jogo que devia ficar ligado já não está (reverte a transação). */
class ImpactoDesatualizado extends Error {}

/** Jogos do clube associados à competição (diretamente ou por um confronto dela). */
function whereJogosDaCompeticao(competicaoId: string, clubeId: string): Prisma.JogoWhereInput {
  return {
    escalao: { clubeId },
    OR: [{ competicaoId }, { resultadoCompeticao: { is: { competicaoId } } }],
  };
}

/** D1: o que acontece a um jogo que sobra ao sair de um confronto. */
function dadosDesligarJogo(
  decisao: DecisaoJogosComDados | undefined,
): Prisma.JogoUncheckedUpdateManyInput {
  return decisao === "DESASSOCIAR"
    ? { resultadoCompeticaoId: null, competicaoId: null, equipaCompeticaoId: null }
    : { resultadoCompeticaoId: null };
}

type Recusa = { ok: false; resultado: Resultado<never> };

/**
 * Jogos só com convocatória: a decisão é obrigatória (indefinida ⇒ o impacto mudou
 * desde a pré-visualização); APAGAR exige também JOGOS_GERIR no escalão. Devolve se
 * o `deleteMany` pode incluir jogos com convocatória.
 */
async function validarDecisaoConvocatoria(
  impacto: ImpactoRemocaoJogos,
  decisao: DecisaoConvocatoria | undefined,
  escalaoId: string,
  erroCorrida: string = ERRO_IMPACTO_COMPETICAO,
): Promise<{ ok: true; apagarConvocatoria: boolean } | Recusa> {
  const comConvocatoria = impacto.comConvocatoria.length > 0;
  if (comConvocatoria && !decisao)
    return { ok: false, resultado: erro(erroCorrida, { jogosComConvocatoria: erroCorrida }) };
  const apagarConvocatoria = comConvocatoria && decisao === "APAGAR";
  if (apagarConvocatoria) {
    const permJogos = await exigirCapacidade("JOGOS_GERIR", escalaoId);
    if (!permJogos.ok) return { ok: false, resultado: erro(ERRO_SEM_PERMISSAO_CONVOCATORIA) };
  }
  return { ok: true, apagarConvocatoria };
}

/**
 * Regra R3 para os jogos que deixam um confronto (editado ou apagado): VAZIO
 * apagados; só convocatória conforme `jogosComConvocatoria`; os que sobram (com
 * dados, ou convocatória «MANTER») conforme `jogosComDados` (D1) — obrigatório só
 * se houver sobras. Devolve o predicado de remoção e os dados para desligar.
 */
async function validarDecisoesConfronto(
  impacto: ImpactoRemocaoJogos,
  decisoes: { jogosComConvocatoria?: DecisaoConvocatoria; jogosComDados?: DecisaoJogosComDados },
  escalaoId: string,
): Promise<
  | { ok: true; apagarConvocatoria: boolean; desligar: Prisma.JogoUncheckedUpdateManyInput }
  | Recusa
> {
  const comConvocatoria = impacto.comConvocatoria.length > 0;
  if (comConvocatoria && !decisoes.jogosComConvocatoria)
    return {
      ok: false,
      resultado: erro(ERRO_IMPACTO_CONFRONTO, { jogosComConvocatoria: ERRO_IMPACTO_CONFRONTO }),
    };
  const sobram =
    impacto.comDados.length > 0 || (comConvocatoria && decisoes.jogosComConvocatoria === "MANTER");
  if (sobram && !decisoes.jogosComDados)
    return {
      ok: false,
      resultado: erro(ERRO_IMPACTO_CONFRONTO, { jogosComDados: ERRO_IMPACTO_CONFRONTO }),
    };
  const convocatoria = await validarDecisaoConvocatoria(
    impacto,
    decisoes.jogosComConvocatoria,
    escalaoId,
    ERRO_IMPACTO_CONFRONTO,
  );
  if (!convocatoria.ok) return convocatoria;
  // Sem sobras `jogosComDados` é ignorado; um jogo que ganhe dados entre a leitura e
  // o deleteMany (não apagado pelo predicado) é só desligado do confronto.
  return {
    ok: true,
    apagarConvocatoria: convocatoria.apagarConvocatoria,
    desligar: dadosDesligarJogo(sobram ? decisoes.jogosComDados : undefined),
  };
}

/** Pré-visualização do impacto de `editarConfronto` em /jogos (§23.6). */
export type ImpactoEdicaoConfronto = {
  /** Mensagem se a edição for recusada (D3: mudar equipas com resultado sem confirmação). */
  bloqueio: string | null;
  /** Só inversão casa ↔ visitante. */
  troca: boolean;
  /** Placar após a edição (golos/vencedor de WO por posição); null sem resultado. */
  resultadoFinal: {
    golosCasa: number | null;
    golosFora: number | null;
    walkoverVencedor: CasaFora | null;
  } | null;
  /** Jogos das equipas próprias que deixam o confronto. */
  saem: ImpactoRemocaoJogos;
  /** Jogos que ficam, com os valores NOVOS. */
  atualizados: {
    id: string;
    equipa: string | null;
    adversario: string;
    casaFora: CasaFora;
    temDados: boolean;
  }[];
  /** Nomes das equipas próprias que entram (jogo criado/adotado se houver dataHora). */
  criaJogos: string[];
};

type JogoDoConfronto = JogoParaRemocao & { equipaCompeticaoId: string | null };

type AnaliseEdicao = {
  impacto: ImpactoEdicaoConfronto;
  competicaoId: string;
  escalaoId: string;
  utilizadorId: string;
  /** Dados do `resultadoCompeticao.update` (sem a `ordem`, calculada na transação). */
  dadosConfronto: Prisma.ResultadoCompeticaoUncheckedUpdateInput;
  rondaMuda: boolean;
  saem: string[];
  /** Jogos que ficam ligados, com o adversário/lado (e subequipa) novos. */
  jogosFicam: { id: string; data: Prisma.JogoUncheckedUpdateManyInput }[];
};

/**
 * Passos 1–5 de `editarConfronto` (partilhados com a pré-visualização): lê o
 * confronto do clube, verifica COMPETICOES_GERIR, valida as equipas na competição,
 * deteta troca/mudança de equipas (D3) e calcula os jogos que saem/ficam/entram.
 */
async function analisarEdicaoConfronto(
  clubeId: string,
  dados: {
    resultadoId: string;
    equipaCasaId: string;
    equipaForaId: string;
    ronda: number | null;
    confirmarAlteracaoResultado: boolean;
  },
): Promise<{ ok: true; analise: AnaliseEdicao } | Recusa> {
  const c = await prisma.resultadoCompeticao.findFirst({
    where: { id: dados.resultadoId, competicao: { clubeId } },
    select: {
      id: true,
      competicaoId: true,
      estado: true,
      golosCasa: true,
      golosFora: true,
      walkoverVencedor: true,
      equipaCasa: true,
      equipaFora: true,
      equipaCasaId: true,
      equipaForaId: true,
      ronda: true,
      competicao: { select: { escalaoId: true, escalao: { select: { nome: true } } } },
      jogosDetalhados: {
        select: { ...SELECT_REMOCAO_JOGO, equipaCompeticaoId: true },
        orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!c) return { ok: false, resultado: erro("Confronto não encontrado") };

  const perm = await exigirCapacidade("COMPETICOES_GERIR", c.competicao.escalaoId);
  if (!perm.ok) return { ok: false, resultado: erro(perm.erro) };

  const equipas = await prisma.equipaCompeticao.findMany({
    where: { competicaoId: c.competicaoId },
    select: { id: true, nome: true },
  });
  const casa = equipas.find((e) => e.id === dados.equipaCasaId);
  const fora = equipas.find((e) => e.id === dados.equipaForaId);
  if (!casa || !fora)
    return { ok: false, resultado: erro("A equipa indicada não pertence a esta competição") };

  // Identidade atual de cada lado: FK; senão a equipa com o mesmo nome; senão
  // desconhecida (equipa removida).
  const identidade = (id: string | null, nome: string) =>
    id ?? equipas.find((e) => norm(e.nome) === norm(nome))?.id ?? null;
  const casaAtual = identidade(c.equipaCasaId, c.equipaCasa);
  const foraAtual = identidade(c.equipaForaId, c.equipaFora);
  const troca = foraAtual !== null && casaAtual !== null && casa.id === foraAtual && fora.id === casaAtual;
  const mantem = casa.id === casaAtual && fora.id === foraAtual;
  const mudaEquipas = !mantem && !troca;
  const inverte = ladosInvertidos(
    { casa: casaAtual, fora: foraAtual },
    { casa: casa.id, fora: fora.id },
  );
  const resultadoFinal = resultadoAposEdicao(c, inverte);
  const bloqueio =
    resultadoFinal && mudaEquipas && !dados.confirmarAlteracaoResultado
      ? ERRO_ALTERAR_RESULTADO
      : null;

  const proprias = await obterEquipasProprias(prisma, c.competicaoId, c.competicao.escalao.nome);
  const ladosDepois = ladosProprios(
    { equipaCasa: casa.nome, equipaFora: fora.nome, equipaCasaId: casa.id, equipaForaId: fora.id },
    proprias,
  );
  const { saem, ficam } = jogosQueSaemDoConfronto(c.jogosDetalhados, ladosDepois, proprias);
  const jogosSaem: JogoDoConfronto[] = c.jogosDetalhados.filter((j) => saem.includes(j.id));
  const comSubequipas = proprias.length >= 2;
  const nomeDoLado = (l: LadoProprio) => (l.lado === "CASA" ? casa.nome : fora.nome);

  // Valores NOVOS dos jogos que ficam — os mesmos que são gravados (com ou sem
  // dataHora); com subequipas o jogo fica com a subequipa do seu lado.
  const jogosFicam = ficam.map(({ id, lado }) => ({
    id,
    data: {
      adversario: lado.lado === "CASA" ? fora.nome : casa.nome,
      casaFora: lado.lado,
      ...(comSubequipas ? { equipaCompeticaoId: lado.equipaId } : {}),
    },
  }));
  const atualizados = jogosFicam.flatMap(({ id, data }) => {
    const j = c.jogosDetalhados.find((x) => x.id === id);
    if (!j) return [];
    return [
      {
        id,
        equipa: j.equipaCompeticao?.nome ?? null,
        adversario: data.adversario,
        casaFora: data.casaFora,
        temDados: motivosDados(j).length > 0,
      },
    ];
  });
  const criaJogos = ladosDepois
    .filter((l) => !ficam.some((f) => f.lado.lado === l.lado))
    .map(nomeDoLado);

  return {
    ok: true,
    analise: {
      impacto: {
        bloqueio,
        troca,
        resultadoFinal,
        saem: agruparImpacto(jogosSaem),
        atualizados,
        criaJogos,
      },
      competicaoId: c.competicaoId,
      escalaoId: c.competicao.escalaoId,
      utilizadorId: perm.ctx.utilizadorId,
      dadosConfronto: {
        equipaCasaId: casa.id,
        equipaForaId: fora.id,
        // Texto legado = nomes das equipas (mantém o fallback de apresentação).
        equipaCasa: casa.nome,
        equipaFora: fora.nome,
        ronda: dados.ronda,
        ...(inverte && resultadoFinal ? resultadoFinal : {}),
      },
      rondaMuda: dados.ronda !== c.ronda,
      saem,
      jogosFicam,
    },
  };
}

/** Pré-visualização (só leitura) do impacto de `editarConfronto` em /jogos. */
export async function obterImpactoEditarConfronto(
  dados: unknown,
): Promise<Resultado<ImpactoEdicaoConfronto>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = editarConfrontoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const r = await analisarEdicaoConfronto(clubeId, parsed.data);
  if (!r.ok) return r.resultado;
  return ok(r.analise.impacto);
}

/**
 * Edita casa/visitante e jornada de um confronto (§23.6/§23.7). A troca ⇄ é sempre
 * permitida e inverte golos/walkover (classificação inalterada); mudar as equipas
 * de um confronto REALIZADO/WALKOVER exige `confirmarAlteracaoResultado` (D3) e o
 * resultado passa às equipas novas pela posição. Os jogos das equipas próprias que
 * saem seguem a regra R3 (+ D1); os que ficam/entram são sincronizados. Mudar de
 * jornada envia o confronto para o fim da jornada de destino (R6).
 */
export async function editarConfronto(
  dados: unknown,
): Promise<
  Resultado<{ confronto: ResultadoCompeticao; jogosApagados: number; jogosDesligados: number }>
> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = editarConfrontoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const r = await analisarEdicaoConfronto(clubeId, parsed.data);
  if (!r.ok) return r.resultado;
  const a = r.analise;
  if (a.impacto.bloqueio)
    return erro(a.impacto.bloqueio, { confirmarAlteracaoResultado: a.impacto.bloqueio });

  const decisao = await validarDecisoesConfronto(a.impacto.saem, parsed.data, a.escalaoId);
  if (!decisao.ok) return decisao.resultado;

  const resultadoId = parsed.data.resultadoId;
  let gravado;
  try {
    gravado = await prisma.$transaction(async (tx) => {
      const confronto = await tx.resultadoCompeticao.update({
        where: { id: resultadoId },
        data: {
          ...a.dadosConfronto,
          ...(a.rondaMuda ? { ordem: await proximaOrdem(tx, a.competicaoId) } : {}),
        },
      });
      let apagados = 0;
      let desligados = 0;
      if (a.saem.length > 0) {
        apagados = (
          await tx.jogo.deleteMany({
            where: { id: { in: a.saem }, ...wherePodeApagar(decisao.apagarConvocatoria) },
          })
        ).count;
        desligados = (
          await tx.jogo.updateMany({
            where: { id: { in: a.saem }, resultadoCompeticaoId: resultadoId },
            data: decisao.desligar,
          })
        ).count;
      }
      // Também sem dataHora (a sincronização só atua com data): os jogos que ficam
      // passam a ter o adversário/lado do confronto editado — só se continuarem
      // ligados a ele; senão o impacto mudou entretanto (reverte a transação).
      for (const j of a.jogosFicam) {
        const { count } = await tx.jogo.updateMany({
          where: { id: j.id, resultadoCompeticaoId: resultadoId },
          data: j.data,
        });
        if (count === 0) throw new ImpactoDesatualizado();
      }
      const sincronizados = await sincronizarJogoDoConfronto(tx, resultadoId, a.utilizadorId);
      return { confronto, apagados, desligados, sincronizados };
    });
  } catch (e) {
    if (e instanceof ImpactoDesatualizado) return erro(ERRO_IMPACTO_CONFRONTO);
    throw e;
  }
  const { confronto, apagados, desligados, sincronizados } = gravado;

  revalidatePath(`${PATH}/${a.competicaoId}`);
  revalidarJogos([...a.saem, ...a.jogosFicam.map((j) => j.id), ...sincronizados]);
  return ok({ confronto, jogosApagados: apagados, jogosDesligados: desligados });
}

/** Pré-visualização (só leitura) do impacto de `apagarConfronto` em /jogos. */
export async function obterImpactoApagarConfronto(resultadoId: string): Promise<
  Resultado<{
    confronto: {
      equipaCasa: string;
      equipaFora: string;
      ronda: number | null;
      dataHora: Date | null;
      estado: EstadoResultado;
    };
    jogos: ImpactoRemocaoJogos;
  }>
> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const c = await prisma.resultadoCompeticao.findFirst({
    where: { id: resultadoId, competicao: { clubeId } },
    select: {
      equipaCasa: true,
      equipaFora: true,
      ronda: true,
      dataHora: true,
      estado: true,
      competicao: { select: { escalaoId: true } },
      jogosDetalhados: { select: SELECT_REMOCAO_JOGO, orderBy: [{ criadoEm: "asc" }, { id: "asc" }] },
    },
  });
  if (!c) return erro("Confronto não encontrado");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", c.competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  return ok({
    confronto: {
      equipaCasa: c.equipaCasa,
      equipaFora: c.equipaFora,
      ronda: c.ronda,
      dataHora: c.dataHora,
      estado: c.estado,
    },
    jogos: agruparImpacto(c.jogosDetalhados),
  });
}

/**
 * Apaga um confronto (substitui `apagarResultadoExterno` na UI) aplicando a regra R3
 * a todos os jogos ligados: VAZIO apagados (basta COMPETICOES_GERIR); só com
 * convocatória conforme `jogosComConvocatoria` (APAGAR exige JOGOS_GERIR); os que
 * sobram conforme `jogosComDados` (D1). Tudo numa transação.
 */
export async function apagarConfronto(
  dados: unknown,
): Promise<Resultado<{ jogosApagados: number; jogosMantidos: number }>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = apagarConfrontoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const c = await prisma.resultadoCompeticao.findFirst({
    where: { id: parsed.data.resultadoId, competicao: { clubeId } },
    select: {
      id: true,
      competicaoId: true,
      competicao: { select: { escalaoId: true } },
      jogosDetalhados: { select: SELECT_REMOCAO_JOGO },
    },
  });
  if (!c) return erro("Confronto não encontrado");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", c.competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const decisao = await validarDecisoesConfronto(
    agruparImpacto(c.jogosDetalhados),
    parsed.data,
    c.competicao.escalaoId,
  );
  if (!decisao.ok) return decisao.resultado;

  const ids = c.jogosDetalhados.map((j) => j.id);
  const { apagados, mantidos } = await prisma.$transaction(async (tx) => {
    let apagados = 0;
    let mantidos = 0;
    if (ids.length > 0) {
      apagados = (
        await tx.jogo.deleteMany({
          where: { id: { in: ids }, ...wherePodeApagar(decisao.apagarConvocatoria) },
        })
      ).count;
      mantidos = (
        await tx.jogo.updateMany({
          where: { id: { in: ids }, resultadoCompeticaoId: c.id },
          data: decisao.desligar,
        })
      ).count;
    }
    await tx.resultadoCompeticao.delete({ where: { id: c.id } });
    return { apagados, mantidos };
  });

  revalidatePath(`${PATH}/${c.competicaoId}`);
  revalidarJogos(ids);
  return ok({ jogosApagados: apagados, jogosMantidos: mantidos });
}

/**
 * Pré-visualização (só leitura) do impacto de `apagarCompeticao({ apagarJogos })`:
 * jogos do clube com `competicaoId = id` OU ligados a um confronto da competição.
 */
export async function obterImpactoApagarCompeticao(
  competicaoId: string,
): Promise<Resultado<ImpactoRemocaoJogos & { total: number }>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const competicao = await prisma.competicao.findFirst({
    where: { id: competicaoId, clubeId },
    select: { id: true, escalaoId: true },
  });
  if (!competicao) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const jogos = await prisma.jogo.findMany({
    where: whereJogosDaCompeticao(competicaoId, clubeId),
    select: SELECT_REMOCAO_JOGO,
    orderBy: [{ data: "asc" }, { id: "asc" }],
  });
  return ok({ ...agruparImpacto(jogos), total: jogos.length });
}

/**
 * R6: grava a ordem final COMPLETA dos confrontos de uma jornada (`ronda = null` =
 * «Sem jornada»). Renumera a competição 1..N (normaliza `ordem = null`) e só atualiza
 * as linhas cuja ordem muda. Sem efeito em /jogos (ordenada por data).
 */
export async function reordenarConfrontos(dados: unknown): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = reordenarConfrontosSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);
  const { competicaoId, ronda, ids } = parsed.data;

  const competicao = await prisma.competicao.findFirst({
    where: { id: competicaoId, clubeId },
    select: { id: true, escalaoId: true },
  });
  if (!competicao) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const todos = await prisma.resultadoCompeticao.findMany({
    where: { competicaoId },
    orderBy: ORDER_RESULTADOS,
    select: { id: true, ronda: true, ordem: true },
  });
  const daJornada = new Set(todos.filter((r) => r.ronda === ronda).map((r) => r.id));
  if (daJornada.size !== ids.length || !ids.every((id) => daJornada.has(id)))
    return erro(
      "A lista de confrontos desta jornada está desatualizada. Atualiza a página e tenta de novo.",
    );

  // Lista global atual com a subsequência da jornada substituída por `ids`.
  let proximo = 0;
  const novaLista = todos.map((r) => (daJornada.has(r.id) ? ids[proximo++] : r.id));
  const ordemAtual = new Map(todos.map((r) => [r.id, r.ordem]));
  const alteracoes = novaLista.flatMap((id, i) =>
    ordemAtual.get(id) === i + 1
      ? []
      : [prisma.resultadoCompeticao.update({ where: { id }, data: { ordem: i + 1 } })],
  );
  if (alteracoes.length > 0) await prisma.$transaction(alteracoes);

  revalidatePath(`${PATH}/${competicaoId}`);
  return ok(undefined);
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

  const [atualizado, jogoIds] = await prisma.$transaction(async (tx) => {
    const r = await tx.resultadoCompeticao.update({
      where: { id: resultadoId },
      data: {
        estado: parsed.data.estado,
        walkoverVencedor:
          parsed.data.estado === "WALKOVER" ? parsed.data.walkoverVencedor ?? null : null,
      },
    });
    return [r, await sincronizarJogoDoConfronto(tx, resultadoId, perm.ctx.utilizadorId)] as const;
  });
  revalidatePath(`${PATH}/${resultado.competicaoId}`);
  revalidarJogos(jogoIds);
  return ok(atualizado);
}

/**
 * Atualiza os golos de um confronto já existente (§23.7). Não altera o estado —
 * destina-se a corrigir o resultado de um confronto REALIZADO.
 */
export async function atualizarGolosConfronto(
  resultadoId: string,
  golosCasa: number,
  golosFora: number,
): Promise<Resultado<ResultadoCompeticao>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = atualizarGolosConfrontoSchema.safeParse({ resultadoId, golosCasa, golosFora });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const resultado = await prisma.resultadoCompeticao.findFirst({
    where: { id: resultadoId, competicao: { clubeId } },
    select: { id: true, competicaoId: true, competicao: { select: { escalaoId: true } } },
  });
  if (!resultado) return erro("Confronto não encontrado");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", resultado.competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  const [atualizado, jogoIds] = await prisma.$transaction(async (tx) => {
    const r = await tx.resultadoCompeticao.update({
      where: { id: resultadoId },
      data: { golosCasa: parsed.data.golosCasa, golosFora: parsed.data.golosFora },
    });
    return [r, await sincronizarJogoDoConfronto(tx, resultadoId, perm.ctx.utilizadorId)] as const;
  });
  revalidatePath(`${PATH}/${resultado.competicaoId}`);
  revalidarJogos(jogoIds);
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
    select: { id: true, escalaoId: true, epocaId: true, equipaCompeticaoId: true },
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

  // §23.11.3: subequipa do jogo tem de jogar o confronto; no máximo um jogo por
  // subequipa (e um só jogo num confronto que não é interno).
  const invalida = await validarLigacaoJogoConfronto(prisma, {
    jogoId,
    resultadoId,
    competicaoId: resultado.competicaoId,
    equipaCompeticaoId: jogo.equipaCompeticaoId,
  });
  if (invalida) return erro(invalida);

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

  // Jogos próprios com resultado final (ambos os golos preenchidos). Os jogos
  // ligados a um confronto ficam de fora: o resultado já conta via o confronto
  // (fonte de verdade da classificação, §23.6) — evita contar o jogo duas vezes.
  const jogosBrutos = await prisma.jogo.findMany({
    where: {
      competicaoId,
      resultadoCompeticaoId: null,
      golosMarcados: { not: null },
      golosSofridos: { not: null },
    },
    select: {
      adversario: true,
      golosMarcados: true,
      golosSofridos: true,
      equipaCompeticaoId: true,
    },
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

  // Equipas inscritas na competição: usadas para preencher a tabela com todas as
  // equipas (a zero) enquanto ainda não há confrontos REALIZADO/WALKOVER — sem
  // isto a classificação apareceria vazia no arranque da época (§23.5). Ordem
  // estável: a primeira equipa própria é a implícita dos jogos sem subequipa.
  const equipas = await prisma.equipaCompeticao.findMany({
    where: { competicaoId },
    select: { id: true, nome: true, tipo: true },
    orderBy: ORDEM_EQUIPAS_PROPRIAS,
  });

  // §23.11.3 regra 7: todas as equipas próprias (subequipas PROPRIO) são
  // destacadas; sem nenhuma, a equipa própria é o escalão (comportamento de §10.9).
  const proprias = equipas.filter((e) => e.tipo === "PROPRIO");
  const nomeEquipaPropria = proprias[0]?.nome ?? competicao.escalao.nome;
  const nomePorSubequipa = new Map(proprias.map((e) => [e.id, e.nome]));

  // Narrowing por type guard (flatMap): descarta jogos próprios com golos nulos e
  // devolve objetos com golos garantidamente `number` (satisfaz JogoClassificacao).
  // Cada jogo conta para a sua subequipa (ou para a equipa própria implícita).
  // Defensivo (§23.11.3 regra 5): um A vs B não ligado ao confronto (só possível em
  // dados anteriores à validação) não conta — evita contar o confronto a dobrar.
  const jogosProprios = jogosBrutos.flatMap((j) =>
    j.golosMarcados === null ||
    j.golosSofridos === null ||
    adversarioEhOutraSubequipa(j.adversario, j.equipaCompeticaoId, proprias)
      ? []
      : [
          {
            equipa: j.equipaCompeticaoId
              ? nomePorSubequipa.get(j.equipaCompeticaoId)
              : undefined,
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
    nomesEquipasProprias: proprias.map((e) => e.nome),
    formato: competicao.formato,
    jogosProprios,
    resultados,
    // P1.2 (§23.5): pontuação configurável (defaults preservam 3/1/0 para legado).
    pontosVitoria: competicao.pontosVitoria,
    pontosEmpate: competicao.pontosEmpate,
    pontosDerrota: competicao.pontosDerrota,
    golosWalkover: competicao.golosWalkover,
  });

  // Todas as linhas calculadas têm jogos ≥ 1 (só entram equipas com confrontos
  // contados). Acrescenta as equipas inscritas que ainda não aparecem, a zero, no
  // fim e ordenadas por nome; recalcula a posição final (1..N) sobre o conjunto.
  const presentes = new Set(classificacao.map((l) => l.equipa.trim().toLowerCase()));
  const nomeProprioNorm = nomeEquipaPropria.trim().toLowerCase();

  const emFalta: LinhaClassificacao[] = equipas
    .flatMap((e) => {
      const nome = e.nome.trim();
      if (nome === "" || presentes.has(nome.toLowerCase())) return [];
      presentes.add(nome.toLowerCase());
      return [
        {
          equipa: nome,
          ehProprio: e.tipo === "PROPRIO" || nome.toLowerCase() === nomeProprioNorm,
          jogos: 0,
          vitorias: 0,
          empates: 0,
          derrotas: 0,
          golosMarcados: 0,
          golosSofridos: 0,
          pontos: 0,
          posicao: 0,
        },
      ];
    })
    .sort((a, b) => a.equipa.localeCompare(b.equipa, "pt"));

  const completa = [...classificacao, ...emFalta];
  completa.forEach((l, i) => {
    l.posicao = i + 1;
  });

  return ok(completa);
}

// ─────────────────────────────────────────────
// Equipas da competição (quadro competitivo)
// ─────────────────────────────────────────────

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
  dados: { nome: string; posicao?: number; propria?: boolean },
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

  // §23.11: `propria` acrescenta uma subequipa própria (PROPRIO do escalão da
  // competição) a uma competição existente. Sem ela, participante EXTERNO como antes.
  const equipa = await prisma.equipaCompeticao.create({
    data: {
      competicaoId,
      nome,
      posicao: parsed.data.posicao ?? null,
      ...(parsed.data.propria
        ? {
            tipo: "PROPRIO" as const,
            escalaoVinculadoId: competicao.escalaoId,
            clubeVinculadoId: clubeId,
          }
        : {}),
    },
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
      tipo: true,
      competicaoId: true,
      competicao: { select: { escalaoId: true } },
    },
  });
  if (!equipa) return erro("Equipa não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", equipa.competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  // §23.7 / §23.11.4: as equipas próprias (subequipas) não são removíveis.
  if (equipa.tipo === "PROPRIO") return erro("As equipas próprias não podem ser removidas");

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

  // R6: a seguir aos confrontos existentes, pela ordem do gerador.
  const ordemInicial = await proximaOrdem(prisma, competicaoId);
  await prisma.resultadoCompeticao.createMany({
    data: jogos.map((j, i) => ({
      competicaoId,
      equipaCasa: j.equipaCasa,
      equipaFora: j.equipaFora,
      ronda: j.ronda,
      golosCasa: null,
      golosFora: null,
      estado: "AGENDADO" as const,
      ordem: ordemInicial + i,
    })),
  });

  // createMany não devolve os registos: relê o quadro gerado para retornar.
  const criados = await prisma.resultadoCompeticao.findMany({
    where: { competicaoId, estado: "AGENDADO" },
    orderBy: ORDER_RESULTADOS,
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

  // §23.11.3 regra 9: as entradas marcadas como «Equipa própria» (subequipas,
  // âmbitos Própria e Externa) são PROPRIO do escalão da competição.
  const participantes: ParticipanteData[] = parsed.data.equipas.map((e) =>
    e.propria
      ? {
          nome: e.nome.trim(),
          posicao: e.posicao ?? null,
          tipo: "PROPRIO",
          escalaoVinculadoId: escalao.id,
          clubeVinculadoId: clubeId,
        }
      : {
          nome: e.nome.trim(),
          posicao: e.posicao ?? null,
          tipo: e.tipo,
          escalaoVinculadoId: e.escalaoVinculadoId ?? null,
          clubeVinculadoId: e.clubeVinculadoId ?? null,
        },
  );

  // Nenhuma marcada ⇒ junta-se o escalão como equipa própria (comportamento anterior).
  const algumaMarcada = parsed.data.equipas.some((e) => e.propria);
  if (parsed.data.ambito === "PROPRIA" && !algumaMarcada) {
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
        // R6: ordem = posição no array (o wizard envia-o por jornada e, dentro de
        // cada uma, pela ordem do ecrã — `paraPayload` de lib/calendario-wizard).
        data: parsed.data.jogos.map((j, i) => ({
          competicaoId: comp.id,
          equipaCasa: j.equipaCasa.trim(),
          equipaFora: j.equipaFora.trim(),
          ronda: j.ronda ?? null,
          dataHora: j.dataHora ?? null,
          golosCasa: null,
          golosFora: null,
          estado: "AGENDADO" as const,
          ordem: i + 1,
        })),
      });
    }

    return comp;
  });

  // §23.6: os confrontos pré-agendados da equipa própria (com data) passam a
  // existir como Jogo em /jogos. Fora da transação para não a prolongar.
  const agendados = await prisma.resultadoCompeticao.findMany({
    where: { competicaoId: competicao.id, dataHora: { not: null } },
    select: { id: true },
  });
  for (const r of agendados) {
    await sincronizarJogoDoConfronto(prisma, r.id, perm.ctx.utilizadorId);
  }

  revalidatePath(PATH);
  if (agendados.length > 0) revalidatePath(PATH_JOGOS);
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

  const jogoIds = await prisma.$transaction(async (tx) => {
    await tx.resultadoCompeticao.update({
      where: { id: resultadoId },
      data: { dataHora: parsed.data.dataHora ?? null },
    });
    return sincronizarJogoDoConfronto(tx, resultadoId, perm.ctx.utilizadorId);
  });
  revalidatePath(`${PATH}/${resultado.competicaoId}`);
  revalidarJogos(jogoIds);
  return ok(undefined);
}

// ─────────────────────────────────────────────
// §23.11 — Plantéis das subequipas por competição
// ─────────────────────────────────────────────

/**
 * Atleta do plantel de uma subequipa. `tambemEm` = nomes das OUTRAS subequipas
 * próprias da mesma competição em cujo plantel o atleta também está (aviso, não
 * bloqueio — §23.11.3 regra 2).
 */
export type AtletaPlantelSubequipa = { atletaId: string; nome: string; tambemEm: string[] };

/** Resultado de «Copiar plantéis da competição X» (§23.11.3 regra 3). */
export type ResultadoCopiaPlanteis = {
  /** Subequipas do destino com correspondência (por nome) na origem. */
  subequipas: number;
  /** Linhas de plantel criadas (as já existentes não contam — idempotente). */
  atletasCopiados: number;
  /** Atletas da origem sem participação ativa no escalão/época do destino. */
  atletasIgnorados: number;
};

/**
 * Atletas (dos indicados) que estão também no plantel de OUTRAS subequipas próprias
 * da mesma competição, com os nomes dessas subequipas. Ordenado por nome do atleta.
 */
async function atletasNoutrasSubequipas(
  competicaoId: string,
  equipaCompeticaoId: string,
  atletaIds: string[],
): Promise<Map<string, AtletaPlantelSubequipa>> {
  const mapa = new Map<string, AtletaPlantelSubequipa>();
  if (atletaIds.length === 0) return mapa;
  const linhas = await prisma.equipaCompeticaoAtleta.findMany({
    where: {
      atletaId: { in: atletaIds },
      equipaCompeticao: { competicaoId, tipo: "PROPRIO", id: { not: equipaCompeticaoId } },
    },
    select: {
      atletaId: true,
      atleta: { select: { nome: true } },
      equipaCompeticao: { select: { nome: true } },
    },
    orderBy: [{ atleta: { nome: "asc" } }, { equipaCompeticao: { nome: "asc" } }],
  });
  for (const l of linhas) {
    const a = mapa.get(l.atletaId) ?? { atletaId: l.atletaId, nome: l.atleta.nome, tambemEm: [] };
    a.tambemEm.push(l.equipaCompeticao.nome);
    mapa.set(l.atletaId, a);
  }
  return mapa;
}

/**
 * Plantel de uma subequipa própria nesta competição, com o aviso de atletas que
 * estão também noutra subequipa da mesma competição. Ordenado por nome.
 */
export async function obterPlantelEquipaCompeticao(
  equipaCompeticaoId: string,
): Promise<Resultado<AtletaPlantelSubequipa[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const equipa = await prisma.equipaCompeticao.findFirst({
    where: { id: equipaCompeticaoId, competicao: { clubeId } },
    select: {
      id: true,
      competicaoId: true,
      competicao: { select: { escalaoId: true } },
      atletas: {
        select: { atletaId: true, atleta: { select: { nome: true } } },
        orderBy: { atleta: { nome: "asc" } },
      },
    },
  });
  if (!equipa) return erro("Equipa não encontrada");
  if (!(await podeLerEscalao(equipa.competicao.escalaoId)))
    return erro("Sem permissão neste escalão");

  const outras = await atletasNoutrasSubequipas(
    equipa.competicaoId,
    equipa.id,
    equipa.atletas.map((a) => a.atletaId),
  );
  return ok(
    equipa.atletas.map((a) => ({
      atletaId: a.atletaId,
      nome: a.atleta.nome,
      tambemEm: outras.get(a.atletaId)?.tambemEm ?? [],
    })),
  );
}

/**
 * Define o plantel de uma subequipa própria nesta competição (substitui o
 * conjunto). Só atletas com participação ATIVA no escalão/época da competição
 * podem ENTRAR; os que já lá estavam mantêm-se se reenviados (histórico — §23.11.4).
 * Um atleta pode estar em várias subequipas: devolve os avisos (não bloqueia).
 */
export async function definirPlantelEquipaCompeticao(
  equipaCompeticaoId: string,
  atletaIds: string[],
): Promise<Resultado<AtletaPlantelSubequipa[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = definirPlantelEquipaCompeticaoSchema.safeParse({
    equipaCompeticaoId,
    atletaIds,
  });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const equipa = await prisma.equipaCompeticao.findFirst({
    where: { id: equipaCompeticaoId, competicao: { clubeId } },
    select: {
      id: true,
      tipo: true,
      competicaoId: true,
      competicao: { select: { escalaoId: true, epocaId: true } },
      atletas: { select: { atletaId: true } },
    },
  });
  if (!equipa) return erro("Equipa não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", equipa.competicao.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  if (equipa.tipo !== "PROPRIO") return erro("Só as equipas próprias têm plantel");

  const pedidos = [...new Set(parsed.data.atletaIds)];
  const setPedidos = new Set(pedidos);
  const atuais = new Set(equipa.atletas.map((a) => a.atletaId));
  const aAdicionar = pedidos.filter((id) => !atuais.has(id));
  const aRemover = [...atuais].filter((id) => !setPedidos.has(id));

  if (aAdicionar.length > 0) {
    const validos = await prisma.atletaEscalao.count({
      where: {
        atletaId: { in: aAdicionar },
        escalaoId: equipa.competicao.escalaoId,
        epocaId: equipa.competicao.epocaId,
        estado: "ATIVO",
        atleta: { clubeId, ativo: true },
      },
    });
    if (validos !== aAdicionar.length)
      return erro("Um ou mais atletas não pertencem a este escalão/época.");
  }

  await prisma.$transaction([
    prisma.equipaCompeticaoAtleta.deleteMany({
      where: { equipaCompeticaoId, atletaId: { in: aRemover } },
    }),
    prisma.equipaCompeticaoAtleta.createMany({
      data: aAdicionar.map((atletaId) => ({ equipaCompeticaoId, atletaId })),
      skipDuplicates: true,
    }),
  ]);

  const avisos = await atletasNoutrasSubequipas(equipa.competicaoId, equipa.id, pedidos);
  revalidatePath(`${PATH}/${equipa.competicaoId}`);
  return ok([...avisos.values()]);
}

/**
 * «Copiar plantéis da competição X» (§23.11.3 regra 3): copia os plantéis das
 * subequipas próprias de outra competição do mesmo clube e escalão, com
 * correspondência por nome (case-insensitive, trim). Subequipas sem
 * correspondência ficam inalteradas; atletas sem participação ativa no
 * escalão/época do destino são ignorados (contados). Idempotente e aditivo.
 */
export async function copiarPlanteisCompeticao(
  competicaoDestinoId: string,
  competicaoOrigemId: string,
): Promise<Resultado<ResultadoCopiaPlanteis>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = copiarPlanteisCompeticaoSchema.safeParse({
    competicaoDestinoId,
    competicaoOrigemId,
  });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const [destino, origem] = await Promise.all([
    prisma.competicao.findFirst({
      where: { id: competicaoDestinoId, clubeId },
      select: {
        escalaoId: true,
        epocaId: true,
        equipas: { where: { tipo: "PROPRIO" }, select: { id: true, nome: true } },
      },
    }),
    prisma.competicao.findFirst({
      where: { id: competicaoOrigemId, clubeId },
      select: {
        escalaoId: true,
        equipas: {
          where: { tipo: "PROPRIO" },
          select: { id: true, nome: true, atletas: { select: { atletaId: true } } },
        },
      },
    }),
  ]);
  if (!destino || !origem) return erro("Competição não encontrada");

  const perm = await exigirCapacidade("COMPETICOES_GERIR", destino.escalaoId);
  if (!perm.ok) return erro(perm.erro);

  if (origem.escalaoId !== destino.escalaoId)
    return erro("A competição de origem tem de ser do mesmo escalão");

  const pares = corresponderSubequipas(destino.equipas, origem.equipas);
  const atletasOrigem = new Map(
    origem.equipas.map((e) => [e.id, e.atletas.map((a) => a.atletaId)]),
  );
  const candidatos = pares.flatMap((p) =>
    (atletasOrigem.get(p.origemId) ?? []).map((atletaId) => ({
      equipaCompeticaoId: p.destinoId,
      atletaId,
    })),
  );

  const ativos =
    candidatos.length === 0
      ? new Set<string>()
      : new Set(
          (
            await prisma.atletaEscalao.findMany({
              where: {
                atletaId: { in: [...new Set(candidatos.map((c) => c.atletaId))] },
                escalaoId: destino.escalaoId,
                epocaId: destino.epocaId,
                estado: "ATIVO",
                atleta: { clubeId, ativo: true },
              },
              select: { atletaId: true },
            })
          ).map((p) => p.atletaId),
        );
  const aCopiar = candidatos.filter((c) => ativos.has(c.atletaId));

  const criados =
    aCopiar.length === 0
      ? 0
      : (await prisma.equipaCompeticaoAtleta.createMany({ data: aCopiar, skipDuplicates: true }))
          .count;

  revalidatePath(`${PATH}/${competicaoDestinoId}`);
  return ok({
    subequipas: pares.length,
    atletasCopiados: criados,
    atletasIgnorados: candidatos.length - aCopiar.length,
  });
}
