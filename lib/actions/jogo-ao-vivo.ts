"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { modalidadeEfetiva } from "@/lib/modalidade-escalao";
import { maxTitulares } from "@/lib/estatisticas";
import {
  calcularMinutosDeEventos,
  type EventoAoVivo,
  type MinutosAtleta,
  type TipoEventoJogoAoVivo,
} from "@/lib/minutos-jogo";
import {
  derivarEstatisticas,
  type EventoParaDerivacao,
} from "@/lib/derivar-estatisticas";
import { recalcularResultadoJogo } from "@/lib/placar-jogo";
import {
  parseRelatorio,
  serializarRelatorio,
} from "@/lib/relatorio-jogo";
import {
  iniciarJogoAoVivoSchema,
  substituirEmCampoSchema,
  trocaEmBlocoSchema,
  segundoSchema,
  notaAoVivoSchema,
  sincronizarEventosSchema,
  editarEventosSchema,
} from "@/lib/schemas/jogo-ao-vivo";
import {
  Prisma,
  TipoEventoJogo,
  type Epoca,
  type Posicao,
  type SessaoJogoAoVivo,
} from "@prisma/client";

/**
 * Server Actions do Modo Jogo ao Vivo (§8.25.9 da bíblia `docs/Mister_Spec_v7.md`).
 *
 * Padrão (§7.1, RN-JV-16): `"use server"` → validação Zod → `auth()` + isolamento
 * multi-tenant por **clube** → época ativa → capacidade **`ESTATISTICAS_GERIR`** no
 * escalão do jogo → `Resultado<T>` → `revalidatePath`. As escritas que tocam vários
 * registos correm em **transação**. O cronómetro é **contínuo** (RN-JV-4/5): o
 * `segundoJogo` é sempre o segundo absoluto desde o apito inicial da Parte 1.
 */

// Tipos de evento do Modo Jogo ao Vivo (tipado para as queries/inserts Prisma).
const TIPOS_AO_VIVO: TipoEventoJogo[] = [
  TipoEventoJogo.INICIO_PARTE,
  TipoEventoJogo.FIM_PARTE,
  TipoEventoJogo.ENTRADA,
  TipoEventoJogo.SAIDA,
  TipoEventoJogo.PAUSA,
  TipoEventoJogo.RETOMA,
];

function pathsJogo(jogoId: string): void {
  revalidatePath(`/jogos/${jogoId}`);
  revalidatePath(`/jogos/${jogoId}/ao-vivo`);
}

// ─── Acesso / contexto ─────────────────────────────────────────────────────────

type JogoAoVivo = Prisma.JogoGetPayload<{
  include: {
    escalao: { select: { seccao: { select: { modalidade: true } } } };
    sessaoAoVivo: true;
  };
}>;

type Acesso =
  | { estado: "erro"; erro: string }
  | { estado: "ok"; jogo: JogoAoVivo; epoca: Epoca; clubeId: string };

/**
 * Resolve e autoriza o acesso ao jogo (RN-JV-2/3/16): autenticação + clube do
 * utilizador + época ativa (o jogo tem de lhe pertencer) + capacidade
 * `ESTATISTICAS_GERIR` no escalão do jogo. Devolve o jogo com a modalidade
 * efetiva resolvível e a sessão ao vivo (se existir).
 */
async function aceder(jogoId: string): Promise<Acesso> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return { estado: "erro", erro: "Não autenticado" };

  const epoca = await obterEpocaAtiva();
  if (!epoca) return { estado: "erro", erro: "Nenhuma época ativa" };

  const jogo = await prisma.jogo.findFirst({
    where: { id: jogoId, escalao: { clubeId } },
    include: {
      escalao: { select: { seccao: { select: { modalidade: true } } } },
      sessaoAoVivo: true,
    },
  });
  if (!jogo) return { estado: "erro", erro: "Jogo não encontrado" };

  // RN-JV-3: o Modo Jogo ao Vivo só opera jogos da época ativa.
  if (jogo.epocaId !== epoca.id)
    return { estado: "erro", erro: "O jogo não pertence à época ativa." };

  // RN-JV-16: autorização por ESTATISTICAS_GERIR no escalão do jogo.
  const perm = await exigirCapacidade("ESTATISTICAS_GERIR", jogo.escalaoId);
  if (!perm.ok) return { estado: "erro", erro: perm.erro };

  return { estado: "ok", jogo, epoca, clubeId };
}

/** Tamanho do formato (nº de atletas em campo, RN-JV-1) para este jogo. */
function tamanhoFormato(jogo: JogoAoVivo): number {
  const modalidade = modalidadeEfetiva(
    jogo.modalidadeAtividade,
    jogo.escalao.seccao?.modalidade,
  );
  return maxTitulares(jogo.formato, modalidade);
}

/** Segundos de jogo correntes: consolidado + o troço a correr (§8.25.2). */
function segundosCorrentes(sessao: SessaoJogoAoVivo): number {
  if (!sessao.aCorrerDesde) return sessao.segundosDecorridos;
  const decorrido = Math.floor((Date.now() - sessao.aCorrerDesde.getTime()) / 1000);
  return sessao.segundosDecorridos + Math.max(0, decorrido);
}

type EventoCampo = {
  tipo: TipoEventoJogo;
  atletaId: string | null;
  segundoJogo: number | null;
  criadoEm: Date;
};

/**
 * Conjunto de atletas em campo, derivado da lista imutável de eventos: processa
 * ENTRADA/SAIDA por ordem cronológica (segundo, depois ordem de registo). RN-JV-3.
 */
function emCampoDeEventos(eventos: EventoCampo[]): Set<string> {
  const ordenados = [...eventos].sort(
    (a, b) =>
      (a.segundoJogo ?? 0) - (b.segundoJogo ?? 0) ||
      a.criadoEm.getTime() - b.criadoEm.getTime(),
  );
  const campo = new Set<string>();
  for (const e of ordenados) {
    if (!e.atletaId) continue;
    if (e.tipo === TipoEventoJogo.ENTRADA) campo.add(e.atletaId);
    else if (e.tipo === TipoEventoJogo.SAIDA) campo.delete(e.atletaId);
  }
  return campo;
}

/** Lê os eventos ao vivo do jogo (para derivar em-campo / calcular minutos). */
async function lerEventosAoVivo(jogoId: string): Promise<
  Array<{
    tipo: TipoEventoJogo;
    atletaId: string | null;
    segundoJogo: number | null;
    parte: number;
    criadoEm: Date;
  }>
> {
  return prisma.eventoJogo.findMany({
    where: { jogoId, tipo: { in: TIPOS_AO_VIVO } },
    select: {
      tipo: true,
      atletaId: true,
      segundoJogo: true,
      parte: true,
      criadoEm: true,
    },
    orderBy: [{ segundoJogo: "asc" }, { criadoEm: "asc" }],
  });
}

/** Converte um evento persistido no formato da função pura de cálculo de minutos. */
function paraEventoAoVivo(e: {
  tipo: TipoEventoJogo;
  atletaId: string | null;
  segundoJogo: number | null;
  parte: number | null;
}): EventoAoVivo {
  return {
    tipo: e.tipo as TipoEventoJogoAoVivo,
    segundoJogo: e.segundoJogo ?? 0,
    atletaId: e.atletaId ?? undefined,
    parte: e.parte ?? undefined,
  };
}

/** Converte um evento ao vivo persistido no formato do motor único de derivação. */
function paraEventoDerivacao(e: {
  tipo: TipoEventoJogo;
  atletaId: string | null;
  segundoJogo: number | null;
  parte: number | null;
}): EventoParaDerivacao {
  return {
    tipo: e.tipo,
    atletaId: e.atletaId,
    atletaSecundarioId: null,
    bloco: null,
    minuto: null,
    segundoJogo: e.segundoJogo,
    parte: e.parte,
  };
}

/**
 * Escreve os minutos/utilização em `EstatisticaAtleta` a partir do motor único de
 * derivação (§10.4 — precedência intervalos > blocos > null). Faz **upsert de
 * todos os convocados** (RN-JV-13 alargada, decisão 2026-09-19): não perde os
 * minutos ao vivo quando a grelha de estatísticas nunca chegou a ser aberta.
 *
 * Só escreve `minutos`/`utilizacao` — os contadores da grelha (golos, cartões,
 * métricas…) são **preservados** (last-write-wins da edição manual, §13.4). Corre
 * dentro da transação recebida.
 */
async function persistirMinutos(
  tx: Prisma.TransactionClient,
  jogo: JogoAoVivo,
  eventos: EventoParaDerivacao[],
): Promise<void> {
  const convocados = await tx.convocatoria.findMany({
    where: { jogoId: jogo.id, convocado: true },
    select: { atletaId: true, titularPrevisto: true },
  });

  const eFutebol =
    modalidadeEfetiva(jogo.modalidadeAtividade, jogo.escalao.seccao?.modalidade) ===
    "FUTEBOL";

  const { estatisticas } = derivarEstatisticas(
    eventos,
    convocados,
    eFutebol,
    jogo.formato,
  );

  for (const { atletaId } of convocados) {
    const calc = estatisticas.get(atletaId);
    const minutos = calc?.minutos ?? null;
    const utilizacao = calc?.utilizacao ?? "NAO_UTILIZADO";
    await tx.estatisticaAtleta.upsert({
      where: { jogoId_atletaId: { jogoId: jogo.id, atletaId } },
      create: { jogoId: jogo.id, atletaId, minutos, utilizacao },
      update: { minutos, utilizacao },
    });
  }
}

/**
 * Resolve a `parte` de cada evento (a coluna `EventoJogo.parte` é obrigatória).
 * Caminha os eventos por segundo e usa o último `INICIO_PARTE` como parte corrente;
 * eventos sem `parte` explícita herdam-na (default 1).
 */
function comParteResolvida<
  T extends { tipo: string; segundoJogo: number; parte?: number | null },
>(eventos: T[]): Array<T & { parteResolvida: number }> {
  const ordenados = [...eventos].sort((a, b) => a.segundoJogo - b.segundoJogo);
  let parteCorrente = 1;
  return ordenados.map((e) => {
    if (e.tipo === "INICIO_PARTE" && e.parte) parteCorrente = e.parte;
    return { ...e, parteResolvida: e.parte ?? parteCorrente };
  });
}

// ─── 1. iniciarJogoAoVivo ──────────────────────────────────────────────────────

/**
 * Cria/reinicia a `SessaoJogoAoVivo` (estado `POR_INICIAR`) e regista a ENTRADA dos
 * titulares no segundo 0. Valida RN-JV-1 (nº de titulares = tamanho do formato) e
 * RN-JV-2 (titulares têm de estar na convocatória). O arranque do cronómetro é feito
 * depois por `iniciarParte`.
 */
export async function iniciarJogoAoVivo(
  jogoId: string,
  config: unknown,
): Promise<Resultado<SessaoJogoAoVivo>> {
  const parsed = iniciarJogoAoVivoSchema.safeParse(config);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const acesso = await aceder(jogoId);
  if (acesso.estado === "erro") return erro(acesso.erro);
  const { jogo } = acesso;

  // Pool = convocatória (RN-JV-2/14).
  const convocados = await prisma.convocatoria.findMany({
    where: { jogoId, convocado: true },
    select: { atletaId: true },
  });
  const idsConvocados = new Set(convocados.map((c) => c.atletaId));
  if (idsConvocados.size === 0)
    return erro("A convocatória está vazia. Define a convocatória antes de iniciar o jogo ao vivo.");

  // RN-JV-1: nº exato de titulares = tamanho do formato, sem repetições.
  const tamanho = tamanhoFormato(jogo);
  const idsTitulares = parsed.data.titulares.map((t) => t.atletaId);
  const setTitulares = new Set(idsTitulares);
  if (setTitulares.size !== idsTitulares.length)
    return erro("Há titulares repetidos.");
  if (idsTitulares.length !== tamanho)
    return erro(`O arranque exige exatamente ${tamanho} titulares.`);
  // RN-JV-2: todos os titulares têm de estar na convocatória.
  if (idsTitulares.some((id) => !idsConvocados.has(id)))
    return erro("Todos os titulares têm de estar na convocatória.");

  // §8.25.8: o nº de partes é definido no jogo (Jogo.numeroPartes) e a sessão
  // herda-o ao iniciar — o arranque já não o escolhe. Se o input trouxer um valor
  // (retrocompatibilidade), o do jogo prevalece como fonte de verdade.
  const numeroPartes = jogo.numeroPartes;

  const sessao = await prisma.$transaction(async (tx) => {
    const s = await tx.sessaoJogoAoVivo.upsert({
      where: { jogoId },
      create: {
        jogoId,
        numeroPartes,
        duracaoParteMins: parsed.data.duracaoParteMins ?? 20,
        estado: "POR_INICIAR",
        parteAtual: 0,
        segundosDecorridos: 0,
        aCorrerDesde: null,
      },
      update: {
        numeroPartes,
        duracaoParteMins: parsed.data.duracaoParteMins ?? 20,
        estado: "POR_INICIAR",
        parteAtual: 0,
        segundosDecorridos: 0,
        aCorrerDesde: null,
      },
    });

    // Reinício: limpa eventos ao vivo anteriores e regista os titulares (segundo 0).
    await tx.eventoJogo.deleteMany({ where: { jogoId, tipo: { in: TIPOS_AO_VIVO } } });
    await tx.eventoJogo.createMany({
      data: parsed.data.titulares.map((t) => ({
        jogoId,
        parte: 1,
        tipo: TipoEventoJogo.ENTRADA,
        segundoJogo: 0,
        atletaId: t.atletaId,
        posicao: (t.posicao ?? null) as Posicao | null,
      })),
    });

    return s;
  });

  pathsJogo(jogoId);
  return ok(sessao);
}

// ─── 2. iniciarParte ───────────────────────────────────────────────────────────

/**
 * Arranca/retoma o cronómetro: `POR_INICIAR`→`EM_CURSO` (Parte 1) ou
 * `INTERVALO`→`EM_CURSO` (parte seguinte). Regista `INICIO_PARTE` no segundo
 * acumulado e atualiza `parteAtual`/`aCorrerDesde`. RN-JV-5: não ultrapassa
 * `numeroPartes`.
 */
export async function iniciarParte(
  jogoId: string,
): Promise<Resultado<SessaoJogoAoVivo>> {
  const acesso = await aceder(jogoId);
  if (acesso.estado === "erro") return erro(acesso.erro);
  const sessao = acesso.jogo.sessaoAoVivo;
  if (!sessao) return erro("O jogo ao vivo ainda não foi iniciado.");

  if (sessao.estado !== "POR_INICIAR" && sessao.estado !== "INTERVALO")
    return erro("Só é possível iniciar uma parte a partir do arranque ou de um intervalo.");

  const novaParte = sessao.parteAtual + 1;
  // RN-JV-5: 2..numeroPartes; não ultrapassa o total de partes configurado.
  if (novaParte > sessao.numeroPartes)
    return erro("Já foram jogadas todas as partes.");

  const segundo = sessao.segundosDecorridos; // cronómetro contínuo entre partes

  const atualizada = await prisma.$transaction(async (tx) => {
    await tx.eventoJogo.create({
      data: {
        jogoId,
        parte: novaParte,
        tipo: TipoEventoJogo.INICIO_PARTE,
        segundoJogo: segundo,
      },
    });
    return tx.sessaoJogoAoVivo.update({
      where: { jogoId },
      data: { estado: "EM_CURSO", parteAtual: novaParte, aCorrerDesde: new Date() },
    });
  });

  pathsJogo(jogoId);
  return ok(atualizada);
}

// ─── 3. terminarParte ──────────────────────────────────────────────────────────

/**
 * Fim de parte: `EM_CURSO`→`INTERVALO`. Regista `FIM_PARTE`, consolida o tempo
 * corrido em `segundosDecorridos` e limpa `aCorrerDesde` (o cronómetro pausa no
 * intervalo, RN-JV-4).
 */
export async function terminarParte(
  jogoId: string,
): Promise<Resultado<SessaoJogoAoVivo>> {
  const acesso = await aceder(jogoId);
  if (acesso.estado === "erro") return erro(acesso.erro);
  const sessao = acesso.jogo.sessaoAoVivo;
  if (!sessao) return erro("O jogo ao vivo ainda não foi iniciado.");

  if (sessao.estado !== "EM_CURSO")
    return erro("Só é possível terminar a parte com o jogo em curso.");

  const segundo = segundosCorrentes(sessao);

  const atualizada = await prisma.$transaction(async (tx) => {
    await tx.eventoJogo.create({
      data: {
        jogoId,
        parte: sessao.parteAtual,
        tipo: TipoEventoJogo.FIM_PARTE,
        segundoJogo: segundo,
      },
    });
    return tx.sessaoJogoAoVivo.update({
      where: { jogoId },
      data: { estado: "INTERVALO", segundosDecorridos: segundo, aCorrerDesde: null },
    });
  });

  pathsJogo(jogoId);
  return ok(atualizada);
}

// ─── 4. substituirEmCampo ──────────────────────────────────────────────────────

/**
 * Substituição durante a parte: regista `SAIDA(sai)` + `ENTRADA(entra)` no mesmo
 * segundo (RN-JV-3). Valida que quem sai está em campo (RN-JV-9), quem entra está
 * na convocatória e não está em campo (RN-JV-10/12) e que não se ultrapassa o
 * tamanho do formato (RN-JV-11).
 */
export async function substituirEmCampo(
  jogoId: string,
  atletaIdSai: string,
  atletaIdEntra: string,
  segundoJogo: number,
  posicao?: Posicao | null,
): Promise<Resultado<void>> {
  const parsed = substituirEmCampoSchema.safeParse({
    sai: atletaIdSai,
    entra: atletaIdEntra,
    segundoJogo,
    posicao: posicao ?? null,
  });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const acesso = await aceder(jogoId);
  if (acesso.estado === "erro") return erro(acesso.erro);
  const sessao = acesso.jogo.sessaoAoVivo;
  if (!sessao) return erro("O jogo ao vivo ainda não foi iniciado.");
  if (sessao.estado !== "EM_CURSO")
    return erro("Só é possível substituir com o jogo em curso.");

  if (parsed.data.sai === parsed.data.entra)
    return erro("O atleta que sai e o que entra têm de ser diferentes.");

  const eventos = await lerEventosAoVivo(jogoId);
  const campo = emCampoDeEventos(eventos);

  // RN-JV-9: quem sai tem de estar em campo.
  if (!campo.has(parsed.data.sai))
    return erro("O atleta que sai não está em campo.");
  // RN-JV-12: quem entra não pode já estar em campo (dois ENTRADA sem SAIDA).
  if (campo.has(parsed.data.entra))
    return erro("O atleta que entra já está em campo.");

  // RN-JV-10: quem entra tem de estar na convocatória.
  const convocado = await prisma.convocatoria.count({
    where: { jogoId, atletaId: parsed.data.entra, convocado: true },
  });
  if (convocado === 0)
    return erro("O atleta que entra não está na convocatória.");

  // RN-JV-11: máximo de atletas em campo = tamanho do formato (sai 1, entra 1 → mantém).
  if (campo.size - 1 + 1 > tamanhoFormato(acesso.jogo))
    return erro("Excede o número máximo de atletas em campo.");

  await prisma.$transaction([
    prisma.eventoJogo.create({
      data: {
        jogoId,
        parte: sessao.parteAtual,
        tipo: TipoEventoJogo.SAIDA,
        segundoJogo: parsed.data.segundoJogo,
        atletaId: parsed.data.sai,
      },
    }),
    prisma.eventoJogo.create({
      data: {
        jogoId,
        parte: sessao.parteAtual,
        tipo: TipoEventoJogo.ENTRADA,
        segundoJogo: parsed.data.segundoJogo,
        atletaId: parsed.data.entra,
        posicao: (parsed.data.posicao ?? null) as Posicao | null,
      },
    }),
  ]);

  pathsJogo(jogoId);
  return ok(undefined);
}

// ─── 5. trocaEmBloco ───────────────────────────────────────────────────────────

/**
 * Várias substituições atómicas (tipicamente no intervalo). Valida **todas** contra
 * o estado em campo simulado antes de aplicar qualquer uma (RN-JV-3/10/11/12); em
 * caso de erro nada é gravado. Todas as trocas ficam no segundo corrente.
 */
export async function trocaEmBloco(
  jogoId: string,
  trocas: unknown,
): Promise<Resultado<void>> {
  const parsed = trocaEmBlocoSchema.safeParse(trocas);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const acesso = await aceder(jogoId);
  if (acesso.estado === "erro") return erro(acesso.erro);
  const sessao = acesso.jogo.sessaoAoVivo;
  if (!sessao) return erro("O jogo ao vivo ainda não foi iniciado.");
  if (sessao.estado !== "EM_CURSO" && sessao.estado !== "INTERVALO")
    return erro("Só é possível trocar em bloco durante a parte ou no intervalo.");

  const eventos = await lerEventosAoVivo(jogoId);
  const campo = emCampoDeEventos(eventos);
  const tamanho = tamanhoFormato(acesso.jogo);

  const convocadosBanco = await prisma.convocatoria.findMany({
    where: { jogoId, convocado: true },
    select: { atletaId: true },
  });
  const idsConvocados = new Set(convocadosBanco.map((c) => c.atletaId));

  // Validação atómica: simula o estado em campo aplicando cada troca por ordem.
  for (const t of parsed.data) {
    if (t.sai === t.entra)
      return erro("Em cada troca, quem sai e quem entra têm de ser diferentes.");
    if (!campo.has(t.sai))
      return erro("Uma das trocas indica um atleta que não está em campo.");
    if (campo.has(t.entra))
      return erro("Uma das trocas faz entrar um atleta que já está em campo.");
    if (!idsConvocados.has(t.entra))
      return erro("Uma das trocas faz entrar um atleta fora da convocatória.");
    campo.delete(t.sai);
    campo.add(t.entra);
    if (campo.size > tamanho)
      return erro("Excede o número máximo de atletas em campo.");
  }

  const segundo = segundosCorrentes(sessao);

  await prisma.$transaction(
    parsed.data.flatMap((t) => [
      prisma.eventoJogo.create({
        data: {
          jogoId,
          parte: sessao.parteAtual,
          tipo: TipoEventoJogo.SAIDA,
          segundoJogo: segundo,
          atletaId: t.sai,
        },
      }),
      prisma.eventoJogo.create({
        data: {
          jogoId,
          parte: sessao.parteAtual,
          tipo: TipoEventoJogo.ENTRADA,
          segundoJogo: segundo,
          atletaId: t.entra,
          posicao: (t.posicao ?? null) as Posicao | null,
        },
      }),
    ]),
  );

  pathsJogo(jogoId);
  return ok(undefined);
}

// ─── 6. pausarJogoAoVivo ───────────────────────────────────────────────────────

/**
 * Pausa manual: `EM_CURSO`→`PAUSADO`. Regista `PAUSA` e consolida o tempo corrido
 * até ao segundo indicado (o tempo pausado não conta como tempo de jogo, RN-JV-4).
 */
export async function pausarJogoAoVivo(
  jogoId: string,
  segundoJogo: number,
): Promise<Resultado<SessaoJogoAoVivo>> {
  const parsed = segundoSchema.safeParse(segundoJogo);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const acesso = await aceder(jogoId);
  if (acesso.estado === "erro") return erro(acesso.erro);
  const sessao = acesso.jogo.sessaoAoVivo;
  if (!sessao) return erro("O jogo ao vivo ainda não foi iniciado.");
  if (sessao.estado !== "EM_CURSO")
    return erro("Só é possível pausar com o jogo em curso.");

  // Não recua o cronómetro: consolida pelo maior entre o segundo indicado e o já corrido.
  const segundo = Math.max(parsed.data, sessao.segundosDecorridos);

  const atualizada = await prisma.$transaction(async (tx) => {
    await tx.eventoJogo.create({
      data: {
        jogoId,
        parte: sessao.parteAtual,
        tipo: TipoEventoJogo.PAUSA,
        segundoJogo: segundo,
      },
    });
    return tx.sessaoJogoAoVivo.update({
      where: { jogoId },
      data: { estado: "PAUSADO", segundosDecorridos: segundo, aCorrerDesde: null },
    });
  });

  pathsJogo(jogoId);
  return ok(atualizada);
}

// ─── 7. retomarJogoAoVivo ──────────────────────────────────────────────────────

/**
 * Retoma de pausa: `PAUSADO`→`EM_CURSO`. Regista `RETOMA` e reinicia o troço do
 * cronómetro (`aCorrerDesde`); `segundosDecorridos` já foi consolidado na pausa.
 */
export async function retomarJogoAoVivo(
  jogoId: string,
  segundoJogo: number,
): Promise<Resultado<SessaoJogoAoVivo>> {
  const parsed = segundoSchema.safeParse(segundoJogo);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const acesso = await aceder(jogoId);
  if (acesso.estado === "erro") return erro(acesso.erro);
  const sessao = acesso.jogo.sessaoAoVivo;
  if (!sessao) return erro("O jogo ao vivo ainda não foi iniciado.");
  if (sessao.estado !== "PAUSADO")
    return erro("Só é possível retomar um jogo em pausa.");

  const atualizada = await prisma.$transaction(async (tx) => {
    await tx.eventoJogo.create({
      data: {
        jogoId,
        parte: sessao.parteAtual,
        tipo: TipoEventoJogo.RETOMA,
        segundoJogo: parsed.data,
      },
    });
    return tx.sessaoJogoAoVivo.update({
      where: { jogoId },
      data: { estado: "EM_CURSO", aCorrerDesde: new Date() },
    });
  });

  pathsJogo(jogoId);
  return ok(atualizada);
}

// ─── 8. terminarJogoAoVivo ─────────────────────────────────────────────────────

/**
 * Termina o jogo (`→TERMINADO`): regista `SAIDA` no segundo final para quem ainda
 * está em campo e um `FIM_PARTE` final; calcula os minutos (§8.25.5) e persiste
 * minutos/utilização em `EstatisticaAtleta` (só nos registos existentes, RN-JV-13).
 */
export async function terminarJogoAoVivo(
  jogoId: string,
  segundoFinal: number,
): Promise<Resultado<SessaoJogoAoVivo>> {
  const parsed = segundoSchema.safeParse(segundoFinal);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const acesso = await aceder(jogoId);
  if (acesso.estado === "erro") return erro(acesso.erro);
  const sessao = acesso.jogo.sessaoAoVivo;
  if (!sessao) return erro("O jogo ao vivo ainda não foi iniciado.");
  if (sessao.estado === "TERMINADO")
    return erro("O jogo ao vivo já está terminado.");
  if (sessao.estado === "POR_INICIAR")
    return erro("O jogo ao vivo ainda não começou.");

  const eventosDb = await lerEventosAoVivo(jogoId);
  // Não recua o cronómetro em relação ao já consolidado.
  const segundo = Math.max(parsed.data, sessao.segundosDecorridos);
  const emCampo = emCampoDeEventos(eventosDb);

  const atualizada = await prisma.$transaction(async (tx) => {
    // SAIDA automática no segundo final para quem está em campo (§8.25.11).
    if (emCampo.size > 0) {
      await tx.eventoJogo.createMany({
        data: [...emCampo].map((atletaId) => ({
          jogoId,
          parte: sessao.parteAtual,
          tipo: TipoEventoJogo.SAIDA,
          segundoJogo: segundo,
          atletaId,
        })),
      });
    }
    // FIM_PARTE final.
    await tx.eventoJogo.create({
      data: {
        jogoId,
        parte: sessao.parteAtual,
        tipo: TipoEventoJogo.FIM_PARTE,
        segundoJogo: segundo,
      },
    });

    // Recalcula minutos com o registo completo e persiste (RN-JV-6/13, §10.4).
    const eventosFinais = await tx.eventoJogo.findMany({
      where: { jogoId, tipo: { in: TIPOS_AO_VIVO } },
      select: { tipo: true, atletaId: true, segundoJogo: true, parte: true },
    });
    await persistirMinutos(tx, acesso.jogo, eventosFinais.map(paraEventoDerivacao));

    return tx.sessaoJogoAoVivo.update({
      where: { jogoId },
      data: { estado: "TERMINADO", segundosDecorridos: segundo, aCorrerDesde: null },
    });
  });

  pathsJogo(jogoId);
  return ok(atualizada);
}

// ─── 9. guardarNotaJogoAoVivo ──────────────────────────────────────────────────

/**
 * Guarda a nota de beira-campo na chave `notasAoVivo` de `Jogo.relatorio` (merge
 * com o relatório existente, sem perder as restantes secções, §8.25.8).
 */
export async function guardarNotaJogoAoVivo(
  jogoId: string,
  nota: string,
): Promise<Resultado<void>> {
  const parsed = notaAoVivoSchema.safeParse(nota);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const acesso = await aceder(jogoId);
  if (acesso.estado === "erro") return erro(acesso.erro);

  const relatorio = parseRelatorio(acesso.jogo.relatorio);
  relatorio.notasAoVivo = parsed.data;
  const serializado = serializarRelatorio(relatorio);

  await prisma.jogo.update({
    where: { id: jogoId },
    data: { relatorio: serializado || null },
  });

  pathsJogo(jogoId);
  return ok(undefined);
}

// ─── 10. sincronizarJogoAoVivo ─────────────────────────────────────────────────

/** Linha de `EventoJogo` a inserir no *sync* (formato uniforme para `createMany`). */
type LinhaEventoSync = {
  jogoId: string;
  parte: number;
  tipo: TipoEventoJogo;
  segundoJogo: number;
  atletaId: string | null;
  atletaSecundarioId: string | null;
  posicao: Posicao | null;
  clientEventoId: string;
};

/**
 * Sincroniza a *outbox* offline (§8.25.4): faz *upsert* idempotente dos eventos por
 * `clientEventoId` (`createMany` + `skipDuplicates`, RN-JV-8/11) e reconcilia o
 * estado da `SessaoJogoAoVivo` derivado dos eventos (*last-write-wins*).
 *
 * 🔁 v7 Fase B (§8.25.3): além do cronómetro/quintetos, persiste a **captura ao
 * vivo** de golos/assistências/disciplina. Um `GOLO` com `atletaSecundarioId`
 * (assistente) materializa também um evento `ASSISTENCIA` autónomo — é assim que
 * o motor único o contabiliza (§10.4; só conta `ASSISTENCIA` autónomas e ignora
 * `atletaSecundarioId`, pelo que não há dupla contagem), coerente com o registo
 * clássico. Quando o lote inclui `GOLO`/`GOLO_SOFRIDO`, o placar do jogo é
 * recalculado a partir da contagem de eventos (`recalcularResultadoJogo`).
 *
 * Devolve o estado atual da sessão.
 */
export async function sincronizarJogoAoVivo(
  jogoId: string,
  eventos: unknown,
): Promise<Resultado<SessaoJogoAoVivo>> {
  const parsed = sincronizarEventosSchema.safeParse(eventos);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const acesso = await aceder(jogoId);
  if (acesso.estado === "erro") return erro(acesso.erro);
  const sessao = acesso.jogo.sessaoAoVivo;
  if (!sessao) return erro("O jogo ao vivo ainda não foi iniciado.");

  const comParte = comParteResolvida(parsed.data);

  // Linhas a inserir: um evento por entrada + a ASSISTÊNCIA derivada do golo.
  const linhas: LinhaEventoSync[] = comParte.flatMap((e) => {
    const linha: LinhaEventoSync = {
      jogoId,
      parte: e.parteResolvida,
      tipo: e.tipo as TipoEventoJogo,
      segundoJogo: e.segundoJogo,
      atletaId: e.atletaId ?? null,
      // O assistente fica no golo (rasto do par); a contagem faz-se no evento
      // ASSISTENCIA autónomo abaixo (o motor único ignora `atletaSecundarioId`).
      atletaSecundarioId:
        e.tipo === "GOLO" ? e.atletaSecundarioId ?? null : null,
      posicao: (e.posicao ?? null) as Posicao | null,
      clientEventoId: e.clientEventoId,
    };
    if (e.tipo === "GOLO" && e.atletaSecundarioId) {
      return [
        linha,
        {
          jogoId,
          parte: e.parteResolvida,
          tipo: TipoEventoJogo.ASSISTENCIA,
          segundoJogo: e.segundoJogo,
          atletaId: e.atletaSecundarioId,
          atletaSecundarioId: null,
          posicao: null,
          // Idempotência estável: derivada do `clientEventoId` do golo.
          clientEventoId: `${e.clientEventoId}::assist`,
        } satisfies LinhaEventoSync,
      ];
    }
    return [linha];
  });

  const temGolos = comParte.some(
    (e) => e.tipo === "GOLO" || e.tipo === "GOLO_SOFRIDO",
  );

  const atualizada = await prisma.$transaction(async (tx) => {
    if (linhas.length > 0) {
      await tx.eventoJogo.createMany({
        data: linhas,
        skipDuplicates: true, // idempotência por @@unique([jogoId, clientEventoId])
      });
    }

    // Placar coerente com a contagem de eventos (§10.4). Idempotente: re-sync não
    // duplica eventos (skipDuplicates) logo não altera o placar.
    if (temGolos) await recalcularResultadoJogo(tx, jogoId);

    // Reconciliação do estado a partir dos eventos de cronómetro persistidos.
    const todos = await tx.eventoJogo.findMany({
      where: { jogoId, tipo: { in: TIPOS_AO_VIVO } },
      select: { tipo: true, segundoJogo: true, parte: true, criadoEm: true },
      orderBy: [{ segundoJogo: "asc" }, { criadoEm: "asc" }],
    });

    return tx.sessaoJogoAoVivo.update({
      where: { jogoId },
      data: reconciliarEstado(todos, sessao),
    });
  });

  pathsJogo(jogoId);
  return ok(atualizada);
}

/**
 * Deriva o estado da sessão a partir da lista (ordenada) de eventos ao vivo. Não
 * transiciona para `TERMINADO` (isso é explícito via `terminarJogoAoVivo`). Se não
 * houver eventos, preserva o estado atual da sessão.
 */
function reconciliarEstado(
  eventos: Array<{ tipo: TipoEventoJogo; segundoJogo: number | null; parte: number }>,
  sessao: SessaoJogoAoVivo,
): Prisma.SessaoJogoAoVivoUpdateInput {
  if (eventos.length === 0) return {};

  const ultimo = eventos[eventos.length - 1];
  const parteAtual = eventos
    .filter((e) => e.tipo === TipoEventoJogo.INICIO_PARTE)
    .reduce((max, e) => Math.max(max, e.parte), sessao.parteAtual);
  const segundos = eventos.reduce(
    (max, e) => Math.max(max, e.segundoJogo ?? 0),
    sessao.segundosDecorridos,
  );

  let estado = sessao.estado;
  switch (ultimo.tipo) {
    case TipoEventoJogo.PAUSA:
      estado = "PAUSADO";
      break;
    case TipoEventoJogo.FIM_PARTE:
      estado = "INTERVALO";
      break;
    case TipoEventoJogo.INICIO_PARTE:
    case TipoEventoJogo.RETOMA:
    case TipoEventoJogo.ENTRADA:
    case TipoEventoJogo.SAIDA:
      if (estado !== "TERMINADO") estado = "EM_CURSO";
      break;
    default:
      break;
  }

  // Estado consolidado (last-write-wins): o cliente continua a conduzir o cronómetro.
  return { estado, parteAtual, segundosDecorridos: segundos, aCorrerDesde: null };
}

// ─── 11. editarEventosJogoAoVivo ───────────────────────────────────────────────

/**
 * Edição manual/retroativa (§8.25.6/RN-JV-15): substitui **todos** os eventos ao
 * vivo do jogo por uma nova lista e recalcula os minutos/utilização em
 * `EstatisticaAtleta` (RN-JV-14; só atualiza registos existentes, RN-JV-13). Os
 * eventos clássicos (golos, cartões, …) não são tocados.
 */
export async function editarEventosJogoAoVivo(
  jogoId: string,
  eventos: unknown,
): Promise<Resultado<void>> {
  const parsed = editarEventosSchema.safeParse(eventos);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const acesso = await aceder(jogoId);
  if (acesso.estado === "erro") return erro(acesso.erro);

  const comParte = comParteResolvida(parsed.data);

  await prisma.$transaction(async (tx) => {
    await tx.eventoJogo.deleteMany({ where: { jogoId, tipo: { in: TIPOS_AO_VIVO } } });
    if (comParte.length > 0) {
      await tx.eventoJogo.createMany({
        data: comParte.map((e) => ({
          jogoId,
          parte: e.parteResolvida,
          tipo: e.tipo as TipoEventoJogo,
          segundoJogo: e.segundoJogo,
          atletaId: e.atletaId ?? null,
          posicao: (e.posicao ?? null) as Posicao | null,
          clientEventoId: e.clientEventoId ?? null,
        })),
      });
    }

    // O motor único (§10.4) deriva o segundo final internamente (maior FIM_PARTE,
    // senão maior segundo) — mesma regra de antes, sem duplicar o cálculo aqui.
    const eventosFinais = await tx.eventoJogo.findMany({
      where: { jogoId, tipo: { in: TIPOS_AO_VIVO } },
      select: { tipo: true, atletaId: true, segundoJogo: true, parte: true },
    });
    await persistirMinutos(tx, acesso.jogo, eventosFinais.map(paraEventoDerivacao));
  });

  pathsJogo(jogoId);
  return ok(undefined);
}

// ─── 12. previewMinutosJogo ────────────────────────────────────────────────────

/**
 * Pré-visualiza os minutos por atleta (§8.25.5) **sem persistir** (à imagem de
 * `previewEstatisticasDeEventos`, §10.4). Usa o segundo final = tempo corrente do
 * cronómetro (ou o maior segundo registado), para revisão antes de terminar.
 */
export async function previewMinutosJogo(
  jogoId: string,
): Promise<Resultado<MinutosAtleta[]>> {
  const acesso = await aceder(jogoId);
  if (acesso.estado === "erro") return erro(acesso.erro);

  const eventosDb = await lerEventosAoVivo(jogoId);
  const eventos = eventosDb.map(paraEventoAoVivo);

  const maxSegundoEvento = eventosDb.reduce(
    (max, e) => Math.max(max, e.segundoJogo ?? 0),
    0,
  );
  const sessao = acesso.jogo.sessaoAoVivo;
  const segundoFinal = sessao
    ? Math.max(segundosCorrentes(sessao), maxSegundoEvento)
    : maxSegundoEvento;

  return ok(calcularMinutosDeEventos(eventos, segundoFinal));
}
