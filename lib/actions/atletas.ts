"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import {
  exigirCapacidade,
  exigirCapacidadeEmAlgumEscalao,
  podeLerEscalao,
  podeLerAlgumEscalao,
  escaloesLegiveis,
} from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  criarAtletaSchema,
  atualizarAtletaSchema,
  apagarAtletaDefinitivamenteSchema,
  toggleAtivoAtletaSchema,
  posicoesPorModalidade,
  LABEL_POSICAO,
} from "@/lib/schemas/atleta";
import { agregarEstatisticas, type EstatisticasAgregadas } from "@/lib/estatisticas";
import type {
  Atleta,
  EstadoParticipacao,
  Modalidade,
  Posicao,
  TipoParticipacao,
} from "@prisma/client";

const PATH = "/plantel";
// O dashboard conta atletas por participações ativas (secção 8.16): criar ou
// desativar um atleta muda esse contador, logo invalida também /dashboard.
const PATH_DASHBOARD = "/dashboard";

export type { EstatisticasAgregadas };

// ─── Tipos de leitura (F1 — atleta do clube + participações) ─────────────────

/** Resumo de uma participação (AtletaEscalao) para consumo na UI. */
export interface ParticipacaoResumo {
  id: string;
  escalaoId: string;
  escalaoNome: string;
  /**
   * Modalidade da participação (deriva de escalao.seccao.modalidade — §1.7.1).
   * `null` em escalões ainda sem secção (fase expand, antes do backfill). A UI do
   * plantel usa-a para agrupar/segmentar por modalidade (§8.5).
   */
  modalidade: Modalidade | null;
  tipo: TipoParticipacao;
  estado: EstadoParticipacao;
  numero: number | null;
  dataInicio: Date;
  dataFim: Date | null;
}

/** Dados pessoais do atleta (sem escalão/número — esses vivem na participação). */
export interface AtletaPessoal {
  id: string;
  nome: string;
  dataNascimento: Date | null;
  posicoes: Posicao[];
  observacoes: string | null;
  fotoUrl: string | null;
  ativo: boolean;
  /** Inscrição federativa/no clube (secção 8 — plantel). */
  inscrito: boolean;
  dataIngresso: Date | null;
  encarregadoNome: string | null;
  encarregadoContacto: string | null;
  encarregadoEmail: string | null;
  clubeId: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface AtletaComParticipacao extends AtletaPessoal {
  /** Participações ATIVAS na época em contexto. */
  participacoes: ParticipacaoResumo[];
  /**
   * Participação do escalão em contexto (quando a listagem é filtrada por escalão),
   * ou a PRINCIPAL. É daqui que sai o número de camisola a mostrar.
   */
  participacaoContexto: ParticipacaoResumo | null;
}

export interface AtletaDetalhe extends AtletaComParticipacao {
  epocaId: string;
  epocaNome: string;
}

const SELECT_PESSOAL = {
  id: true,
  nome: true,
  dataNascimento: true,
  posicoes: true,
  observacoes: true,
  fotoUrl: true,
  ativo: true,
  inscrito: true,
  dataIngresso: true,
  encarregadoNome: true,
  encarregadoContacto: true,
  encarregadoEmail: true,
  clubeId: true,
  criadoEm: true,
  atualizadoEm: true,
} as const;

// Inclui a modalidade da secção (§1.7.1) para a UI poder agrupar por modalidade.
const INCLUDE_ESCALAO_NOME = {
  escalao: { select: { nome: true, seccao: { select: { modalidade: true } } } },
} as const;

type ParticipacaoBruta = {
  id: string;
  escalaoId: string;
  tipo: TipoParticipacao;
  estado: EstadoParticipacao;
  numero: number | null;
  dataInicio: Date;
  dataFim: Date | null;
  escalao: { nome: string; seccao: { modalidade: Modalidade } | null };
};

function paraResumo(p: ParticipacaoBruta): ParticipacaoResumo {
  return {
    id: p.id,
    escalaoId: p.escalaoId,
    escalaoNome: p.escalao.nome,
    modalidade: p.escalao.seccao?.modalidade ?? null,
    tipo: p.tipo,
    estado: p.estado,
    numero: p.numero,
    dataInicio: p.dataInicio,
    dataFim: p.dataFim,
  };
}

/** Participação a usar como contexto: a do escalão pedido, a PRINCIPAL, ou a primeira. */
function escolherContexto(
  participacoes: ParticipacaoResumo[],
  escalaoId?: string,
): ParticipacaoResumo | null {
  if (escalaoId) {
    const doEscalao = participacoes.find((p) => p.escalaoId === escalaoId);
    if (doEscalao) return doEscalao;
  }
  return participacoes.find((p) => p.tipo === "PRINCIPAL") ?? participacoes[0] ?? null;
}

/**
 * Um atleta é visível se o membro puder ler algum dos escalões onde participa.
 * Atletas sem qualquer participação só são visíveis com âmbito de todo o clube.
 */
async function podeVerAtleta(escalaoIds: string[]): Promise<boolean> {
  if (escalaoIds.length === 0) return (await escaloesLegiveis()) === "TODOS";
  return podeLerAlgumEscalao(escalaoIds);
}

/** Época em contexto: a indicada (validada contra o clube) ou a ativa. */
async function resolverEpoca(
  clubeId: string,
  epocaId?: string,
): Promise<{ id: string; nome: string } | null> {
  if (epocaId) {
    return prisma.epoca.findFirst({
      where: { id: epocaId, clubeId },
      select: { id: true, nome: true },
    });
  }
  const ativa = await obterEpocaAtiva();
  return ativa ? { id: ativa.id, nome: ativa.nome } : null;
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export async function listarAtletas(
  escalaoId?: string,
  epocaId?: string,
  seccaoId?: string,
  incluirInativos = false,
): Promise<Resultado<AtletaComParticipacao[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  // Por defeito o plantel mostra só atletas ativos; `incluirInativos` inclui os
  // que saíram ou estão em período experimental (ativo=false).
  const filtroAtivo = incluirInativos ? {} : { ativo: true };

  const epoca = await resolverEpoca(clubeId, epocaId);
  if (!epoca) return erro("Nenhuma época ativa");

  // Filtrado por escalão: a listagem é conduzida pelas participações desse escalão.
  if (escalaoId) {
    if (!(await podeLerEscalao(escalaoId))) return ok([]);

    const participacoes = await prisma.atletaEscalao.findMany({
      where: {
        escalaoId,
        epocaId: epoca.id,
        estado: "ATIVO",
        atleta: { ...filtroAtivo, clubeId },
      },
      include: {
        ...INCLUDE_ESCALAO_NOME,
        atleta: {
          select: {
            ...SELECT_PESSOAL,
            participacoes: {
              where: { epocaId: epoca.id, estado: "ATIVO" },
              include: INCLUDE_ESCALAO_NOME,
            },
          },
        },
      },
      orderBy: [{ numero: "asc" }, { atleta: { nome: "asc" } }],
    });

    return ok(
      participacoes.map((p) => {
        const todas = p.atleta.participacoes.map(paraResumo);
        return {
          ...p.atleta,
          participacoes: todas,
          participacaoContexto: escolherContexto(todas, escalaoId),
        };
      }),
    );
  }

  // Sem filtro de escalão: todos os atletas do clube com participação ativa na
  // época, restringido aos escalões legíveis (secção 6.4) e, opcionalmente, à
  // secção (modalidade) indicada — usado pelo plantel quando o clube tem mais do
  // que uma secção (§8.5).
  const legiveis = await escaloesLegiveis();
  const filtroLegiveis =
    legiveis === "TODOS" ? {} : { escalaoId: { in: legiveis } };
  const filtroSeccao = seccaoId ? { escalao: { seccaoId } } : {};

  const atletas = await prisma.atleta.findMany({
    where: {
      clubeId,
      ...filtroAtivo,
      participacoes: {
        some: {
          epocaId: epoca.id,
          estado: "ATIVO",
          ...filtroLegiveis,
          ...filtroSeccao,
        },
      },
    },
    select: {
      ...SELECT_PESSOAL,
      participacoes: {
        where: { epocaId: epoca.id, estado: "ATIVO" },
        include: INCLUDE_ESCALAO_NOME,
      },
    },
    orderBy: { nome: "asc" },
  });

  return ok(
    atletas.map((a) => {
      const todas = a.participacoes.map(paraResumo);
      return {
        ...a,
        participacoes: todas,
        participacaoContexto: escolherContexto(todas),
      };
    }),
  );
}

export async function obterAtleta(
  id: string,
  escalaoId?: string,
): Promise<Resultado<AtletaDetalhe>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const epoca = await resolverEpoca(clubeId, undefined);
  if (!epoca) return erro("Nenhuma época ativa");

  const atleta = await prisma.atleta.findFirst({
    where: { id, clubeId },
    select: {
      ...SELECT_PESSOAL,
      participacoes: {
        where: { epocaId: epoca.id, estado: "ATIVO" },
        include: INCLUDE_ESCALAO_NOME,
      },
    },
  });
  if (!atleta) return erro("Atleta não encontrado");

  const participacoes = atleta.participacoes.map(paraResumo);
  if (!(await podeVerAtleta(participacoes.map((p) => p.escalaoId))))
    return erro("Sem permissão neste escalão");

  return ok({
    ...atleta,
    participacoes,
    participacaoContexto: escolherContexto(participacoes, escalaoId),
    epocaId: epoca.id,
    epocaNome: epoca.nome,
  });
}

// ─── Validação posição↔modalidade (§9) ───────────────────────────────────────

/** Primeira posição fora do conjunto permitido, ou null se todas são válidas. */
function primeiraPosicaoInvalida(
  posicoes: Posicao[],
  permitidas: Iterable<Posicao>,
): Posicao | null {
  const set = new Set(permitidas);
  return posicoes.find((p) => !set.has(p)) ?? null;
}

/** Erro de validação para uma posição que não pertence à(s) modalidade(s). */
function erroPosicaoInvalida(posicao: Posicao): Resultado<never> {
  return erro("Posição inválida para esta modalidade", {
    posicoes: `A posição «${LABEL_POSICAO[posicao]}» não pertence a esta modalidade.`,
  });
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

export async function criarAtleta(dados: unknown): Promise<Resultado<Atleta>> {
  const parsed = criarAtletaSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const { participacaoInicial, ...pessoal } = parsed.data;

  const perm = await exigirCapacidade("PLANTEL_GERIR", participacaoInicial.escalaoId);
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const epoca = await obterEpocaAtiva();
  if (!epoca)
    return erro("Nenhuma época ativa definida. Define uma época ativa antes de criar atletas.");

  const escalao = await prisma.escalao.findFirst({
    where: { id: participacaoInicial.escalaoId, clubeId },
    select: { id: true, seccao: { select: { modalidade: true } } },
  });
  if (!escalao) return erro("O escalão selecionado não existe");

  // Validação posição↔modalidade (§9): as posições declaradas têm de pertencer à
  // modalidade do escalão inicial. Sem secção definida (fase expand), não há
  // modalidade para validar e a verificação é saltada.
  const modalidadeInicial = escalao.seccao?.modalidade ?? null;
  if (modalidadeInicial) {
    const invalida = primeiraPosicaoInvalida(
      pessoal.posicoes,
      posicoesPorModalidade(modalidadeInicial),
    );
    if (invalida) return erroPosicaoInvalida(invalida);
  }

  // Número duplicado é permitido (secção 9 — «dois atletas com o mesmo número:
  // permitido; aviso não-bloqueante por escalão»). O aviso vive na lista do
  // plantel; a action não valida unicidade.
  const numero = participacaoInicial.numero ?? null;

  const dataInicio = pessoal.dataIngresso ?? new Date();

  // O vínculo atleta↔escalão vive exclusivamente em AtletaEscalao (os campos
  // legados escalaoId/epocaId do Atleta foram removidos na fase 25 — contract).
  const atleta = await prisma.$transaction(async (tx) => {
    const criado = await tx.atleta.create({
      data: {
        nome: pessoal.nome,
        clubeId,
        posicoes: pessoal.posicoes,
        dataNascimento: pessoal.dataNascimento ?? null,
        dataIngresso: pessoal.dataIngresso ?? null,
        observacoes: pessoal.observacoes ?? null,
        fotoUrl: pessoal.fotoUrl ? pessoal.fotoUrl : null,
        encarregadoNome: pessoal.encarregadoNome ?? null,
        encarregadoContacto: pessoal.encarregadoContacto ?? null,
        encarregadoEmail: pessoal.encarregadoEmail ? pessoal.encarregadoEmail : null,
        // Default explícito: um atleta nasce ativo salvo indicação em contrário
        // (ex.: criado logo como experimental/inativo).
        ativo: pessoal.ativo ?? true,
        // Inscrição (secção 8): por omissão nasce «por inscrever».
        inscrito: pessoal.inscrito ?? false,
        numero,
      },
    });

    await tx.atletaEscalao.create({
      data: {
        atletaId: criado.id,
        escalaoId: participacaoInicial.escalaoId,
        epocaId: epoca.id,
        tipo: participacaoInicial.tipo,
        estado: "ATIVO",
        numero,
        dataInicio,
      },
    });

    return criado;
  });

  revalidatePath(PATH);
  revalidatePath(PATH_DASHBOARD);
  return ok(atleta);
}

export async function atualizarAtleta(
  id: string,
  dados: unknown,
): Promise<Resultado<Atleta>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const parsed = atualizarAtletaSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const existe = await prisma.atleta.findFirst({
    where: { id, clubeId },
    select: {
      id: true,
      participacoes: {
        where: { estado: "ATIVO" },
        select: {
          escalaoId: true,
          escalao: { select: { seccao: { select: { modalidade: true } } } },
        },
      },
    },
  });
  if (!existe) return erro("Atleta não encontrado");

  const perm = await exigirCapacidadeEmAlgumEscalao(
    "PLANTEL_GERIR",
    existe.participacoes.map((p) => p.escalaoId),
  );
  if (!perm.ok) return erro(perm.erro);

  // Validação posição↔modalidade (§9): um atleta multi-desporto pode ter posições
  // de várias modalidades, mas só das modalidades em que efetivamente participa.
  // O conjunto permitido é a UNIÃO das posições das modalidades das participações
  // ativas. Sem participações com secção determinável, não há contexto e a
  // validação é saltada.
  const modalidades = new Set(
    existe.participacoes
      .map((p) => p.escalao?.seccao?.modalidade)
      .filter((m): m is Modalidade => m != null),
  );
  if (modalidades.size > 0) {
    const permitidas = [...modalidades].flatMap((m) => posicoesPorModalidade(m));
    const invalida = primeiraPosicaoInvalida(parsed.data.posicoes, permitidas);
    if (invalida) return erroPosicaoInvalida(invalida);
  }

  // Campos opcionais: undefined não limpa o valor existente no Prisma — usar null explicitamente.
  const atleta = await prisma.atleta.update({
    where: { id },
    data: {
      nome: parsed.data.nome,
      posicoes: parsed.data.posicoes,
      dataNascimento: parsed.data.dataNascimento ?? null,
      dataIngresso: parsed.data.dataIngresso ?? null,
      observacoes: parsed.data.observacoes ?? null,
      fotoUrl: parsed.data.fotoUrl ? parsed.data.fotoUrl : null,
      encarregadoNome: parsed.data.encarregadoNome ?? null,
      encarregadoContacto: parsed.data.encarregadoContacto ?? null,
      encarregadoEmail: parsed.data.encarregadoEmail ? parsed.data.encarregadoEmail : null,
      // Só escreve `ativo` quando explicitamente fornecido: a edição dos dados
      // pessoais não deve reativar/desativar um atleta de forma implícita
      // (o estado é gerido por `toggleAtivoAtleta`/`apagarAtleta`).
      ...(parsed.data.ativo !== undefined ? { ativo: parsed.data.ativo } : {}),
      // `inscrito` é editável no formulário do atleta (secção 8). Só se escreve
      // quando fornecido, para não repor o valor a partir de callers que o omitam.
      ...(parsed.data.inscrito !== undefined ? { inscrito: parsed.data.inscrito } : {}),
    },
  });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return ok(atleta);
}

export async function apagarAtleta(id: string): Promise<Resultado<void>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const existe = await prisma.atleta.findFirst({
    where: { id, clubeId },
    select: {
      id: true,
      participacoes: { where: { estado: "ATIVO" }, select: { escalaoId: true } },
    },
  });
  if (!existe) return erro("Atleta não encontrado");

  const perm = await exigirCapacidadeEmAlgumEscalao(
    "PLANTEL_GERIR",
    existe.participacoes.map((p) => p.escalaoId),
  );
  if (!perm.ok) return erro(perm.erro);

  await prisma.atleta.update({ where: { id }, data: { ativo: false } });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  revalidatePath(PATH_DASHBOARD);
  return ok(undefined);
}

/**
 * Alterna o estado `ativo` do atleta (secção 8 — plantel).
 *
 * Usado para distinguir atletas do plantel de quem saiu ou ainda está em
 * período experimental. Ao contrário de `apagarAtleta` (que força ativo=false),
 * esta ação faz toggle: reativa um atleta inativo ou desativa um ativo.
 *
 * A verificação de permissão usa TODAS as participações do atleta (não só as
 * ATIVAS): um atleta inativo pode já não ter participações ativas, mas quem gere
 * o plantel desses escalões deve poder reativá-lo.
 */
export async function toggleAtivoAtleta(atletaId: string): Promise<Resultado<void>> {
  const parsed = toggleAtivoAtletaSchema.safeParse({ atletaId });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const existe = await prisma.atleta.findFirst({
    where: { id: parsed.data.atletaId, clubeId },
    select: {
      id: true,
      ativo: true,
      participacoes: { select: { escalaoId: true } },
    },
  });
  if (!existe) return erro("Atleta não encontrado");

  const perm = await exigirCapacidadeEmAlgumEscalao(
    "PLANTEL_GERIR",
    existe.participacoes.map((p) => p.escalaoId),
  );
  if (!perm.ok) return erro(perm.erro);

  await prisma.atleta.update({
    where: { id: parsed.data.atletaId },
    data: { ativo: !existe.ativo },
  });

  revalidatePath(PATH);
  revalidatePath(`${PATH}/${parsed.data.atletaId}`);
  revalidatePath(PATH_DASHBOARD);
  return ok(undefined);
}

/**
 * Hard-delete definitivo do atleta (P1.3 — RGPD, direito ao apagamento de menores).
 *
 * Ao contrário de `apagarAtleta` (soft-delete: ativo=false), esta ação remove
 * IRREVERSIVELMENTE o atleta e todos os dados pessoais associados. As FK com
 * onDelete: Cascade (presenças, convocatórias, participações, caderneta, eventos
 * de jogo, consentimentos e — transitivamente — valores de métricas) garantem a
 * limpeza em cadeia.
 *
 * Guarda de segurança: recusa apagar atletas com estatísticas de jogo registadas,
 * para que o clube possa exportar/preservar os dados desportivos antes do apagamento.
 */
export async function apagarAtletaDefinitivamente(
  atletaId: string,
): Promise<Resultado<void>> {
  const parsed = apagarAtletaDefinitivamenteSchema.safeParse({ atletaId });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const existe = await prisma.atleta.findFirst({
    where: { id: parsed.data.atletaId, clubeId },
    select: {
      id: true,
      participacoes: { select: { escalaoId: true } },
      _count: { select: { estatisticas: true } },
    },
  });
  if (!existe) return erro("Atleta não encontrado");

  const perm = await exigirCapacidadeEmAlgumEscalao(
    "PLANTEL_GERIR",
    existe.participacoes.map((p) => p.escalaoId),
  );
  if (!perm.ok) return erro(perm.erro);

  if (existe._count.estatisticas > 0) {
    return erro(
      "Atleta com estatísticas registadas — exportar dados antes de apagar",
    );
  }

  // Os cascades do schema removem os dados relacionados (P1.3).
  await prisma.atleta.delete({ where: { id: parsed.data.atletaId } });

  revalidatePath(PATH);
  revalidatePath(`${PATH}/${atletaId}`);
  revalidatePath(PATH_DASHBOARD);
  return ok(undefined);
}

// ─── Estatísticas agregadas (secção 15) ──────────────────────────────────────

export async function obterEstatisticasAtleta(
  id: string,
  escalaoId?: string,
): Promise<Resultado<EstatisticasAgregadas>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const epoca = await obterEpocaAtiva();
  if (!epoca) return erro("Nenhuma época ativa");

  const atleta = await prisma.atleta.findFirst({
    where: { id, clubeId },
    select: {
      id: true,
      posicoes: true,
      criadoEm: true,
      dataIngresso: true,
      participacoes: {
        where: { epocaId: epoca.id, estado: "ATIVO" },
        select: { escalaoId: true, tipo: true },
      },
    },
  });
  if (!atleta) return erro("Atleta não encontrado");

  const escaloesAtivos = atleta.participacoes.map((p) => p.escalaoId);
  if (!(await podeVerAtleta(escaloesAtivos))) return erro("Sem permissão neste escalão");

  // Escalão de contexto: o pedido (tem de ser um onde o atleta participa) ou o principal.
  let escalaoCtx: string | null = null;
  if (escalaoId) {
    if (!escaloesAtivos.includes(escalaoId))
      return erro("O atleta não participa neste escalão nesta época");
    if (!(await podeLerEscalao(escalaoId))) return erro("Sem permissão neste escalão");
    escalaoCtx = escalaoId;
  } else {
    const principal = atleta.participacoes.find((p) => p.tipo === "PRINCIPAL");
    escalaoCtx = principal?.escalaoId ?? escaloesAtivos[0] ?? null;
  }

  const eGR = atleta.posicoes.includes("GUARDA_REDES");
  // Divisor da taxa de presença: sessões desde o ingresso (secção 22.3).
  const ingresso = atleta.dataIngresso ?? atleta.criadoEm;

  const [jogosConvocado, estatisticas, sessoesTotais, presencas] = await Promise.all([
    prisma.convocatoria.count({
      where: {
        convocado: true,
        atletaId: id,
        jogo: {
          epocaId: epoca.id,
          ...(escalaoCtx ? { escalaoId: escalaoCtx } : {}),
        },
      },
    }),
    prisma.estatisticaAtleta.findMany({
      where: {
        atletaId: id,
        jogo: {
          epocaId: epoca.id,
          ...(escalaoCtx ? { escalaoId: escalaoCtx } : {}),
        },
      },
    }),
    // Sessões do escalão de contexto na época, a partir do ingresso (secção 22.3).
    // Só sessões NORMAL contam para assiduidade — CAPTACAO/EVENTO/ABERTO não
    // são treino regular e não devem inflar o denominador (BUG-P1-07).
    escalaoCtx
      ? prisma.sessao.count({
          where: {
            epocaId: epoca.id,
            escalaoId: escalaoCtx,
            data: { gte: ingresso },
            tipoSessao: "NORMAL",
          },
        })
      : Promise.resolve(0),
    // Presenças do atleta nesse escalão (F1 — Presenca.escalaoId).
    prisma.presenca.count({
      where: {
        atletaId: id,
        estado: { in: ["PRESENTE", "ATRASADO"] },
        // Simetria com o denominador (sessoesTotais): só presenças desde o
        // ingresso e só em sessões NORMAL (secção 22.3 / BUG-P1-07).
        sessao: { epocaId: epoca.id, data: { gte: ingresso }, tipoSessao: "NORMAL" },
        ...(escalaoCtx ? { escalaoId: escalaoCtx } : {}),
      },
    }),
  ]);

  return ok(
    agregarEstatisticas({
      eGR,
      jogosConvocado,
      sessoesTotais,
      presencas,
      estatisticas,
    }),
  );
}

// ─── Aniversários próximos (dashboard) ───────────────────────────────────────

/** Atleta cujo aniversário cai nos próximos 7 dias (hoje incluído). */
export interface AtletaAniversario {
  id: string;
  nome: string;
  dataNascimento: Date;
  fotoUrl: string | null;
  /** `true` se faz anos hoje (mesmo dia e mês). */
  eHoje: boolean;
  /** Dias inteiros até ao próximo aniversário (0 = hoje). */
  diasAte: number;
  /** Idade que o atleta vai completar neste aniversário. */
  idadeCompleta: number;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Atletas do clube cujo aniversário cai nos próximos 7 dias (hoje incluído).
 *
 * Atemporal por natureza: NÃO filtra por época. O cálculo do próximo aniversário
 * e do número de dias é feito em JS (não em SQL) sobre datas normalizadas à
 * meia-noite UTC, comparando apenas dia e mês (a hora de `dataNascimento` é
 * irrelevante).
 */
export async function obterAniversariosProximos(): Promise<
  Resultado<AtletaAniversario[]>
> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const atletas = await prisma.atleta.findMany({
    where: { clubeId, ativo: true, dataNascimento: { not: null } },
    select: { id: true, nome: true, dataNascimento: true, fotoUrl: true },
  });

  // Hoje à meia-noite UTC — base comum para comparar só a componente de data.
  const agora = new Date();
  const hoje = Date.UTC(
    agora.getUTCFullYear(),
    agora.getUTCMonth(),
    agora.getUTCDate(),
  );
  const anoAtual = agora.getUTCFullYear();

  const resultado: AtletaAniversario[] = [];

  for (const atleta of atletas) {
    // O filtro `dataNascimento: { not: null }` garante o valor; o narrowing
    // explícito evita o non-null assertion (TypeScript strict).
    const nascimento = atleta.dataNascimento;
    if (nascimento === null) continue;

    const mes = nascimento.getUTCMonth();
    const dia = nascimento.getUTCDate();

    // Próximo aniversário no ano corrente; se já passou (comparando só a data),
    // usa o ano seguinte.
    let anoProximo = anoAtual;
    let proximo = Date.UTC(anoProximo, mes, dia);
    if (proximo < hoje) {
      anoProximo = anoAtual + 1;
      proximo = Date.UTC(anoProximo, mes, dia);
    }

    const diasAte = Math.round((proximo - hoje) / MS_POR_DIA);
    if (diasAte > 7) continue;

    resultado.push({
      id: atleta.id,
      nome: atleta.nome,
      dataNascimento: nascimento,
      fotoUrl: atleta.fotoUrl,
      eHoje: diasAte === 0,
      diasAte,
      idadeCompleta: anoProximo - nascimento.getUTCFullYear(),
    });
  }

  resultado.sort((a, b) => a.diasAte - b.diasAte || a.nome.localeCompare(b.nome));

  return ok(resultado);
}
