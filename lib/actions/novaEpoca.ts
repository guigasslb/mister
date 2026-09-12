"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { obterEpocaAtiva, COOKIE_EPOCA } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { PERFIS_ARRANQUE } from "@/lib/permissoes-catalogo";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import {
  novaEpocaRolloverSchema,
  novoClubeSchema,
  escalaoOrigemPromocaoSchema,
  deveSerPromovido,
  calcularIdade,
} from "@/lib/schemas/novaEpoca";

// Wizard «Nova Época» (secção 8.21). Camada de servidor: pré-validação de
// elegibilidade, rollover no mesmo clube (cenários A/B), criação de novo clube
// individual (cenário C) e sugestão de promoções (cenário B).
//
// Guarda de acesso (secção 8.21): o wizard só está disponível a quem tem a
// capacidade CLUBE_EPOCAS — Administrador ou Treinador Individual (dono do seu
// clube técnico). Os perfis de arranque «Treinador Principal»/«Adjunto» (usados
// pelos treinadores adicionados por um DT) NÃO incluem CLUBE_EPOCAS, pelo que
// ficam automaticamente de fora (cenário D — recebem convite, não criam épocas).

const PATH_DEFINICOES = "/definicoes/epocas";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de leitura (contexto para pré-preencher o wizard)
// ─────────────────────────────────────────────────────────────────────────────

export interface AtletaResumo {
  id: string;
  nome: string;
  numero: number | null;
  escalaoId: string;
  escalaoNome: string;
  dataNascimento: Date | null;
}

export interface EscalaoResumo {
  id: string;
  nome: string;
  ordem: number;
}

export interface ElegibilidadeWizard {
  /** A = mesmo clube/escalão · B = mesmo clube/escalão diferente · C = novo clube individual. */
  cenario: "A" | "B" | "C";
  atletasAtivos: AtletaResumo[];
  escaloes: EscalaoResumo[];
}

export interface AtletaParaPromocao {
  atletaId: string;
  nome: string;
  dataNascimento: Date | null;
  idade: number | null;
  numeroAtual: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pré-validar elegibilidade e devolver contexto do wizard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica se o utilizador pode abrir o wizard e devolve o contexto para o
 * pré-preencher. Requer a capacidade CLUBE_EPOCAS (Admin ou Treinador
 * Individual dono do clube). Deteta o cenário por defeito a partir do tipo de
 * licença: licença INDIVIDUAL sugere o fluxo «novo clube» (C); caso contrário o
 * rollover no mesmo clube (A), com a promoção entre escalões (B) disponível como
 * variante no próprio wizard.
 */
export async function verificarElegibilidadeWizard(): Promise<
  Resultado<ElegibilidadeWizard>
> {
  const perm = await exigirCapacidade("CLUBE_EPOCAS");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const epocaAtiva = await obterEpocaAtiva();

  const [escaloes, licenca] = await Promise.all([
    prisma.escalao.findMany({
      where: { clubeId },
      select: { id: true, nome: true, ordem: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    }),
    prisma.licenca.findFirst({
      where: { clubeId, estado: "ATIVA" },
      select: { tipo: true },
    }),
  ]);

  // Atletas com participação principal ativa na época atual (base do plantel a
  // transitar). Sem época ativa, o plantel de arranque é vazio.
  const atletasAtivos: AtletaResumo[] = [];
  if (epocaAtiva) {
    const participacoes = await prisma.atletaEscalao.findMany({
      where: {
        epocaId: epocaAtiva.id,
        estado: "ATIVO",
        tipo: "PRINCIPAL",
        atleta: { ativo: true, clubeId },
        escalao: { clubeId },
      },
      include: {
        atleta: { select: { id: true, nome: true, dataNascimento: true } },
        escalao: { select: { id: true, nome: true } },
      },
      orderBy: [{ escalao: { ordem: "asc" } }, { numero: "asc" }],
    });

    for (const p of participacoes) {
      atletasAtivos.push({
        id: p.atleta.id,
        nome: p.atleta.nome,
        numero: p.numero,
        escalaoId: p.escalao.id,
        escalaoNome: p.escalao.nome,
        dataNascimento: p.atleta.dataNascimento,
      });
    }
  }

  const cenario: ElegibilidadeWizard["cenario"] =
    licenca?.tipo === "INDIVIDUAL" ? "C" : "A";

  return ok({ cenario, atletasAtivos, escaloes });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cenário A/B — rollover no mesmo clube
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria a nova época e transita o plantel escolhido, no mesmo clube.
 *
 * Herda automaticamente (sem cópia): exercícios portáteis (do treinador),
 * métricas e modo de semana — nenhum destes é filtrado por época,
 * pelo que já fica disponível na nova época. Zera automaticamente (por omissão):
 * estatísticas, presenças, jogos, convocatórias e planeamentos — nada disso é
 * copiado. A numeração de semanas recomeça em 1 (não há planeamentos herdados).
 *
 * As promoções (cenário B) sobrepõem-se às transições regulares: um atleta
 * promovido é colocado no escalão de destino. Cada atleta transita com UMA
 * participação PRINCIPAL na nova época (invariante da secção 9).
 */
export async function criarEpocaRollover(
  dados: unknown,
): Promise<Resultado<{ epocaId: string }>> {
  const parsed = novaEpocaRolloverSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("CLUBE_EPOCAS");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const { nome, dataInicio, dataFim, escalaoIds, atletas, promocoes, seccaoId } =
    parsed.data;

  // 🔁 v7 (§8.21): transição por secção. Quando `seccaoId` é fornecido, valida
  // que a secção pertence ao clube — os escalões referenciados têm depois de
  // pertencer a essa secção (filtro `seccaoId` na query de validação abaixo).
  if (seccaoId) {
    const seccao = await prisma.seccao.findFirst({
      where: { id: seccaoId, clubeId },
      select: { id: true },
    });
    if (!seccao) return erro("A secção selecionada não pertence a este clube.");
  }

  // Todos os escalões referenciados têm de pertencer ao clube (e à secção, se dada).
  const escaloesReferenciados = new Set<string>(escalaoIds);
  for (const p of promocoes) {
    escaloesReferenciados.add(p.escalaoOrigemId);
    escaloesReferenciados.add(p.escalaoDestinoId);
  }
  const escaloesDoClube = await prisma.escalao.findMany({
    where: {
      id: { in: [...escaloesReferenciados] },
      clubeId,
      ...(seccaoId ? { seccaoId } : {}),
    },
    select: { id: true },
  });
  if (escaloesDoClube.length !== escaloesReferenciados.size)
    return erro(
      seccaoId
        ? "Um dos escalões selecionados não pertence a esta secção."
        : "Um dos escalões selecionados não pertence a este clube.",
    );

  const escalaoIdsSet = new Set(escalaoIds);

  // Época anterior (para herdar o escalão principal de cada atleta a transitar).
  const epocaAnterior = await obterEpocaAtiva();

  const resultado = await prisma.$transaction(
    async (tx): Promise<{ erro: string } | { epocaId: string }> => {
      // Participações principais ativas da época anterior, para resolver o
      // escalão de origem de cada atleta.
      const principalPorAtleta = new Map<
        string,
        { escalaoId: string; numero: number | null }
      >();
      if (epocaAnterior) {
        const anteriores = await tx.atletaEscalao.findMany({
          where: {
            epocaId: epocaAnterior.id,
            estado: "ATIVO",
            tipo: "PRINCIPAL",
            // 🔁 v7 (§8.21): snapshot por secção quando `seccaoId` é fornecido.
            escalao: { clubeId, ...(seccaoId ? { seccaoId } : {}) },
          },
          select: { atletaId: true, escalaoId: true, numero: true },
        });
        for (const a of anteriores)
          principalPorAtleta.set(a.atletaId, {
            escalaoId: a.escalaoId,
            numero: a.numero,
          });
      }

      // Alvo por atleta (escalão + número na nova época). As promoções aplicam-se
      // por último para se sobreporem às transições regulares.
      const alvo = new Map<string, { escalaoId: string; numero: number | null }>();

      for (const a of atletas) {
        if (!a.transitaParaNova) continue;
        const anterior = principalPorAtleta.get(a.atletaId);
        if (!anterior) continue; // sem principal anterior → nada a herdar
        if (!escalaoIdsSet.has(anterior.escalaoId)) continue; // escalão não continua
        alvo.set(a.atletaId, {
          escalaoId: anterior.escalaoId,
          numero: a.novoNumero ?? anterior.numero ?? null,
        });
      }

      for (const p of promocoes) {
        for (const a of p.atletasParaPromover) {
          if (!a.transitaParaNova) continue;
          alvo.set(a.atletaId, {
            escalaoId: p.escalaoDestinoId,
            numero: a.novoNumero ?? null,
          });
        }
      }

      // Os atletas alvo têm de pertencer ao clube (evita transitar ids alheios).
      const atletaIds = [...alvo.keys()];
      if (atletaIds.length > 0) {
        const validos = await tx.atleta.findMany({
          where: { id: { in: atletaIds }, clubeId },
          select: { id: true },
        });
        if (validos.length !== atletaIds.length)
          return { erro: "Um dos atletas selecionados não pertence a este clube." };
      }

      // Nova época ativa: desmarca as restantes e cria/reutiliza a época-alvo
      // como ativa (recalcula o seletor de época). A época é de nível clube:
      // numa transição multi-secção (com `seccaoId`), se uma secção anterior já
      // criou a época com este nome, reutiliza-a em vez de duplicar (as duas
      // secções partilham a mesma época — §8.21).
      await tx.epoca.updateMany({ where: { clubeId }, data: { ativa: false } });
      let novaEpoca: { id: string };
      const existente = seccaoId
        ? await tx.epoca.findFirst({ where: { clubeId, nome }, select: { id: true } })
        : null;
      if (existente) {
        novaEpoca = await tx.epoca.update({
          where: { id: existente.id },
          data: { dataInicio, dataFim, ativa: true },
          select: { id: true },
        });
      } else {
        novaEpoca = await tx.epoca.create({
          data: { clubeId, nome, dataInicio, dataFim, ativa: true },
          select: { id: true },
        });
      }

      // Uma participação PRINCIPAL por atleta na nova época (invariante secção 9).
      if (atletaIds.length > 0) {
        await tx.atletaEscalao.createMany({
          data: atletaIds.map((atletaId) => {
            const t = alvo.get(atletaId)!;
            return {
              atletaId,
              escalaoId: t.escalaoId,
              epocaId: novaEpoca.id,
              tipo: "PRINCIPAL" as const,
              estado: "ATIVO" as const,
              numero: t.numero,
              dataInicio,
            };
          }),
        });
      }

      return { epocaId: novaEpoca.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if ("erro" in resultado) return erro(resultado.erro);

  // Ativa a nova época também no cookie do seletor.
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_EPOCA, resultado.epocaId, {
    path: "/",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
  revalidatePath(PATH_DEFINICOES);
  revalidatePath("/plantel");
  revalidatePath("/dashboard");
  return ok({ epocaId: resultado.epocaId });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Cenário C — novo clube (licença individual)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deriva o nome/datas da época desportiva corrente (arranca em setembro).
 * Reproduz a convenção usada no onboarding (`criarClube`).
 */
function epocaCorrente(agora = new Date()): {
  nome: string;
  dataInicio: Date;
  dataFim: Date;
} {
  const mes = agora.getMonth(); // 0 = janeiro, 7 = agosto
  const anoInicio = mes >= 7 ? agora.getFullYear() : agora.getFullYear() - 1;
  const anoFim = anoInicio + 1;
  return {
    nome: `${anoInicio}/${anoFim}`,
    dataInicio: new Date(anoInicio, 8, 1), // 1 de setembro
    dataFim: new Date(anoFim, 5, 30), // 30 de junho
  };
}

/**
 * Cria um novo clube (fluxo individual) e torna o utilizador Administrador.
 *
 * Transporta, conforme as flags, o conteúdo do clube anterior:
 * - exercícios e modelos táticos do próprio treinador (autoria dele);
 * - métricas configuradas do clube anterior.
 * Cada adesão ativa é única por utilizador (secção 5.4): a adesão anterior é
 * encerrada (INATIVO) na mesma transação. Recusa se o clube anterior tiver
 * outros membros ativos (não deixar um clube partilhado sem quem o gere).
 */
export async function criarNovoClube(
  dados: unknown,
): Promise<Resultado<{ clubeId: string; epocaId: string }>> {
  const session = await auth();
  if (!session?.user?.id) return erro("Não autenticado");
  const utilizadorId = session.user.id;

  const parsed = novoClubeSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // A sessão pode referenciar um utilizador que já não existe (BD reseeded).
  const utilizador = await prisma.utilizador.findUnique({
    where: { id: utilizadorId },
    select: { id: true },
  });
  if (!utilizador)
    return erro("A tua sessão é inválida ou expirou. Termina sessão e volta a entrar.");

  const {
    nomeClube,
    corClube,
    escalaoNome,
    importarExercicios,
    importarModelosTaticos,
    importarMetricas,
  } = parsed.data;

  // Adesão ativa anterior (clube de origem para importar e para encerrar).
  const membroAtual = await prisma.membroClube.findFirst({
    where: { utilizadorId, estado: "ATIVO" },
    select: { id: true, clubeId: true },
  });

  if (membroAtual) {
    // Guarda de acesso (§8.21): quem já pertence a um clube só pode criar um novo
    // clube (e sair do atual) se tiver a capacidade de gerir épocas nesse clube —
    // Administrador/dono. Os treinadores adicionados por um DT (perfis «Treinador
    // Principal»/«Adjunto», sem CLUBE_EPOCAS) não abandonam o clube por este fluxo.
    const perm = await exigirCapacidade("CLUBE_EPOCAS");
    if (!perm.ok) return erro(perm.erro);

    // Só é permitido sair automaticamente de um clube de que se é o único
    // membro ativo (clube técnico individual). Um clube partilhado nunca deve
    // ficar sem membros por este fluxo (secção 9 — «nunca deixar clube sem admin»).
    const outrosAtivos = await prisma.membroClube.count({
      where: {
        clubeId: membroAtual.clubeId,
        estado: "ATIVO",
        utilizadorId: { not: utilizadorId },
      },
    });
    if (outrosAtivos > 0)
      return erro(
        "O teu clube atual tem outros membros. Sai do clube pela gestão de utilizadores antes de criar um novo clube.",
      );
  }

  const clubeAnteriorId = membroAtual?.clubeId ?? null;
  const epoca = epocaCorrente();

  const resultado = await prisma.$transaction(async (tx) => {
    // Encerra a adesão anterior (única adesão ativa por utilizador).
    if (membroAtual) {
      await tx.membroClube.update({
        where: { id: membroAtual.id },
        data: { estado: "INATIVO", dataSaida: new Date() },
      });
    }

    const clube = await tx.clube.create({
      data: { nome: nomeClube, corPrimaria: corClube },
    });

    const novaEpoca = await tx.epoca.create({
      data: {
        clubeId: clube.id,
        nome: epoca.nome,
        dataInicio: epoca.dataInicio,
        dataFim: epoca.dataFim,
        ativa: true,
      },
    });

    await tx.escalao.create({
      data: {
        clubeId: clube.id,
        nome: escalaoNome,
        ordem: 1,
        visivelOutrosTreinadores: true,
      },
    });

    // Perfis de arranque editáveis (secção 6.5) + membro Administrador.
    let perfilAdminId = "";
    for (const p of PERFIS_ARRANQUE) {
      const perfil = await tx.perfil.create({
        data: {
          clubeId: clube.id,
          nome: p.nome,
          descricao: p.descricao,
          ambito: p.ambito,
          capacidades: p.capacidades,
          sistema: true,
        },
      });
      if (p.nome === "Administrador") perfilAdminId = perfil.id;
    }

    await tx.membroClube.create({
      data: {
        utilizadorId,
        clubeId: clube.id,
        perfilId: perfilAdminId,
        estado: "ATIVO",
      },
    });

    // ── Transporte do conteúdo do clube anterior ─────────────────────────────
    if (clubeAnteriorId) {
      if (importarMetricas) {
        const metricas = await tx.metricaConfig.findMany({
          where: { clubeId: clubeAnteriorId },
          select: { nome: true, tipo: true, ativa: true, ordem: true },
        });
        if (metricas.length > 0)
          await tx.metricaConfig.createMany({
            data: metricas.map((m) => ({ ...m, clubeId: clube.id })),
          });
      }

      if (importarExercicios) {
        // Exercícios da autoria do treinador (portáteis, viajam com ele).
        const exercicios = await tx.exercicio.findMany({
          where: {
            clubeId: clubeAnteriorId,
            OR: [{ autorId: utilizadorId }, { criadorId: utilizadorId }],
          },
          select: {
            nome: true,
            descricao: true,
            objetivo: true,
            duracaoMin: true,
            categoriaPrincipal: true,
            diagrama: true,
            parteTreino: true,
            escalaoAlvo: true,
            proprietario: true,
          },
        });
        if (exercicios.length > 0)
          await tx.exercicio.createMany({
            data: exercicios.map((e) => ({
              nome: e.nome,
              descricao: e.descricao,
              objetivo: e.objetivo,
              duracaoMin: e.duracaoMin,
              categoriaPrincipal: e.categoriaPrincipal,
              diagrama: e.diagrama ?? Prisma.JsonNull,
              parteTreino: e.parteTreino,
              escalaoAlvo: e.escalaoAlvo,
              proprietario: e.proprietario,
              // Subcategoria é do clube anterior — não a arrasta (evita FK órfã).
              subcategoriaId: null,
              clubeId: clube.id,
              clubeProprietarioId: clube.id,
              autorId: utilizadorId,
              criadorId: utilizadorId,
              origemSeed: false,
            })),
          });
      }

      if (importarModelosTaticos) {
        // Modelos de jogo da autoria do treinador (metodologia portátil).
        const modelos = await tx.modeloJogo.findMany({
          where: { autorId: utilizadorId, clubeProprietarioId: clubeAnteriorId },
          select: {
            nome: true,
            momento: true,
            principios: true,
            diagrama: true,
            subprincipios: true,
            proprietario: true,
          },
        });
        if (modelos.length > 0)
          await tx.modeloJogo.createMany({
            data: modelos.map((m) => ({
              nome: m.nome,
              momento: m.momento,
              principios: m.principios,
              diagrama: m.diagrama ?? Prisma.JsonNull,
              subprincipios: m.subprincipios ?? Prisma.JsonNull,
              proprietario: m.proprietario,
              autorId: utilizadorId,
              clubeProprietarioId: clube.id,
              // Metodologia genérica: sem escalão/época concretos.
              escalaoId: null,
              epocaId: null,
            })),
          });
      }
    }

    return { clubeId: clube.id, epocaId: novaEpoca.id };
  });

  // Aponta o cookie de época para a nova época ativa do novo clube.
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_EPOCA, resultado.epocaId, {
    path: "/",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  return ok(resultado);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Cenário B — sugestão de promoções
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sugere os atletas de um escalão que, por idade, transitariam para o nível
 * seguinte na nova época. É apenas uma sugestão: a promoção é sempre de
 * confirmação individual (secção 8.21 — nunca automática). A referência de
 * idade é o início da nova época (aprox. o início da época desportiva corrente).
 */
export async function sugerirPromocoes(
  escalaoOrigemId: unknown,
): Promise<Resultado<{ atletas: AtletaParaPromocao[] }>> {
  const parsed = escalaoOrigemPromocaoSchema.safeParse(escalaoOrigemId);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("CLUBE_EPOCAS");
  if (!perm.ok) return erro(perm.erro);
  const clubeId = perm.ctx.clube.id;

  const escalao = await prisma.escalao.findFirst({
    where: { id: parsed.data, clubeId },
    select: { id: true, idadeMax: true },
  });
  if (!escalao) return erro("O escalão selecionado não existe");

  const epocaAtiva = await obterEpocaAtiva();
  if (!epocaAtiva)
    return erro("Nenhuma época ativa definida. Define uma época ativa antes de gerir promoções.");

  const referencia = epocaCorrente().dataInicio;

  const participacoes = await prisma.atletaEscalao.findMany({
    where: {
      escalaoId: escalao.id,
      epocaId: epocaAtiva.id,
      estado: "ATIVO",
      tipo: "PRINCIPAL",
      atleta: { ativo: true, clubeId },
    },
    include: {
      atleta: { select: { id: true, nome: true, dataNascimento: true } },
    },
    orderBy: [{ numero: "asc" }],
  });

  const atletas: AtletaParaPromocao[] = participacoes
    .filter((p) =>
      deveSerPromovido(p.atleta.dataNascimento, escalao.idadeMax, referencia),
    )
    .map((p) => ({
      atletaId: p.atleta.id,
      nome: p.atleta.nome,
      dataNascimento: p.atleta.dataNascimento,
      idade: p.atleta.dataNascimento
        ? calcularIdade(p.atleta.dataNascimento, referencia)
        : null,
      numeroAtual: p.numero,
    }));

  return ok({ atletas });
}
