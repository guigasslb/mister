// Route Handler — seed dos confrontos do quadro competitivo de Benjamins (época
// 2026/2027) para uma competição já existente. Invocável no servidor (Vercel) via
// browser. Email do utilizador via env SEED_USER_EMAIL.
//
// Popula a Competicao `cmt1hswod0003qcr57ezf6m4i` com:
//   1. As equipas participantes (EquipaCompeticao) — 1 PRÓPRIA + adversários EXTERNO.
//   2. Os 23 confrontos do calendário (ResultadoCompeticao, estado AGENDADO).
//   3. A ligação Jogo ↔ ResultadoCompeticao dos jogos já criados pelo seed anterior.
//
// IDEMPOTÊNCIA: se a competição já tiver 23 confrontos, devolve { skipped: true }
// sem alterar nada. As equipas usam create + captura de P2002 (unique
// competicaoId+nome), pelo que reexecutar após criar equipas mas antes dos
// confrontos não duplica participantes.
//
// PROTEÇÃO: só responde se o query param `secret` for igual à env `SEED_SECRET`;
// caso contrário devolve 401. Usa o Prisma client partilhado da app (@/lib/db).
//
// Uso: GET /api/admin/seed-confrontos-benjamins?secret=<SEED_SECRET>

import { NextResponse, type NextRequest } from "next/server";
import {
  Prisma,
  TipoParticipanteCompeticao,
  EstadoResultado,
} from "@prisma/client";
import { prisma } from "@/lib/db";

// Corre no runtime Node (acede a Prisma); sempre dinâmico (lê env + query).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_ALVO = process.env.SEED_USER_EMAIL ?? "";
const COMPETICAO_ID = "cmt1hswod0003qcr57ezf6m4i";
const HORA_JOGO_UTC = "10:00:00.000Z"; // hora convencional (calendário sem hora)

// Adversários EXTERNO do quadro competitivo (a equipa PRÓPRIA é derivada do clube).
const ADVERSARIOS_EXTERNO: string[] = [
  "TIS",
  "Internacional SC",
  "Fund. Salesianos Col. Évora",
  "Lusitano GC",
  "Mourão FC",
  "NS de Moura",
  "GDC Baronia",
  "SLE",
  "Juventude SC (Infantis)",
  "Torneio de Páscoa",
];

type LocalJogo = "CASA" | "FORA";
type Confronto = { data: string; adversario: string; local: LocalJogo };

// Calendário 2026-2027 — 20 jogos de campeonato + 3 amigáveis/torneio.
const confrontos: Confronto[] = [
  // CAMPEONATO
  { data: "2026-10-26", adversario: "GDC Baronia", local: "CASA" },
  { data: "2026-11-02", adversario: "TIS", local: "CASA" },
  { data: "2026-11-09", adversario: "Internacional SC", local: "FORA" },
  { data: "2026-11-16", adversario: "Fund. Salesianos Col. Évora", local: "CASA" },
  { data: "2026-11-23", adversario: "Lusitano GC", local: "FORA" },
  { data: "2026-11-30", adversario: "Mourão FC", local: "CASA" },
  { data: "2026-12-07", adversario: "NS de Moura", local: "FORA" },
  { data: "2026-12-14", adversario: "NS de Moura", local: "CASA" },
  { data: "2027-01-11", adversario: "GDC Baronia", local: "FORA" },
  { data: "2027-01-17", adversario: "TIS", local: "FORA" },
  { data: "2027-02-03", adversario: "Internacional SC", local: "CASA" },
  { data: "2027-02-14", adversario: "GDC Baronia", local: "FORA" },
  { data: "2027-02-22", adversario: "Lusitano GC", local: "CASA" },
  { data: "2027-02-24", adversario: "Fund. Salesianos Col. Évora", local: "FORA" },
  { data: "2027-03-01", adversario: "Mourão FC", local: "FORA" },
  { data: "2027-03-21", adversario: "Fund. Salesianos Col. Évora", local: "CASA" },
  { data: "2027-03-29", adversario: "GDC Baronia", local: "FORA" },
  { data: "2027-04-11", adversario: "NS de Moura", local: "FORA" },
  { data: "2027-04-14", adversario: "Internacional SC", local: "CASA" },
  { data: "2027-05-26", adversario: "Lusitano GC", local: "FORA" },
  // AMIGÁVEIS / TORNEIOS
  { data: "2027-04-03", adversario: "Torneio de Páscoa", local: "FORA" },
  { data: "2027-05-08", adversario: "SLE", local: "CASA" },
  { data: "2027-06-03", adversario: "Juventude SC (Infantis)", local: "FORA" },
];

export async function GET(req: NextRequest) {
  // Proteção: secret tem de bater com a env. Constante ausente/errada → 401.
  const secretEsperado = process.env.SEED_SECRET;
  const secretRecebido = req.nextUrl.searchParams.get("secret");
  if (!secretEsperado || secretRecebido !== secretEsperado) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    // 1. Utilizador pelo email.
    const utilizador = await prisma.utilizador.findUnique({
      where: { email: EMAIL_ALVO },
      select: { id: true },
    });
    if (!utilizador) {
      return NextResponse.json(
        { error: `Utilizador não encontrado para o email "${EMAIL_ALVO}".` },
        { status: 404 },
      );
    }

    // 2. Clube via adesão ATIVA (MembroClube). Regra: no máximo uma adesão ATIVA.
    const membro = await prisma.membroClube.findFirst({
      where: { utilizadorId: utilizador.id, estado: "ATIVO" },
      select: { clubeId: true, clube: { select: { nome: true } } },
    });
    if (!membro) {
      return NextResponse.json(
        {
          error: `Nenhuma adesão de clube ATIVA encontrada para "${EMAIL_ALVO}" (utilizador ${utilizador.id}).`,
        },
        { status: 404 },
      );
    }
    const clubeId = membro.clubeId;
    const nomeClube = membro.clube.nome;

    // 3. Competição por id, com o escalão (para validar o clube via escalao.clubeId).
    const competicao = await prisma.competicao.findUnique({
      where: { id: COMPETICAO_ID },
      select: {
        id: true,
        escalaoId: true,
        epocaId: true,
        escalao: { select: { clubeId: true } },
      },
    });
    if (!competicao) {
      return NextResponse.json(
        { error: `Competição "${COMPETICAO_ID}" não encontrada.` },
        { status: 404 },
      );
    }
    if (competicao.escalao.clubeId !== clubeId) {
      return NextResponse.json(
        {
          error: `A competição "${COMPETICAO_ID}" não pertence ao clube "${nomeClube}".`,
        },
        { status: 403 },
      );
    }

    // 4. Idempotência: se já existirem os 23 confrontos, não faz nada.
    const confrontosExistentes = await prisma.resultadoCompeticao.count({
      where: { competicaoId: competicao.id },
    });
    if (confrontosExistentes >= confrontos.length) {
      return NextResponse.json({ skipped: true });
    }

    // 5. Criar equipas participantes (upsert lógico por competicaoId+nome via
    // create + captura de P2002). Mapa nome → id para ligar aos confrontos.
    const equipas: { nome: string; tipo: TipoParticipanteCompeticao }[] = [
      { nome: nomeClube, tipo: TipoParticipanteCompeticao.PROPRIO },
      ...ADVERSARIOS_EXTERNO.map((nome) => ({
        nome,
        tipo: TipoParticipanteCompeticao.EXTERNO,
      })),
    ];

    const equipaIdPorNome = new Map<string, string>();
    let equipasCriadas = 0;

    for (const eq of equipas) {
      try {
        const criada = await prisma.equipaCompeticao.create({
          data: {
            competicaoId: competicao.id,
            nome: eq.nome,
            tipo: eq.tipo,
            escalaoVinculadoId:
              eq.tipo === TipoParticipanteCompeticao.PROPRIO
                ? competicao.escalaoId
                : null,
          },
          select: { id: true, nome: true },
        });
        equipaIdPorNome.set(criada.nome, criada.id);
        equipasCriadas++;
      } catch (e) {
        // P2002 = unique constraint (competicaoId, nome): equipa já existe.
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          const existente = await prisma.equipaCompeticao.findUnique({
            where: {
              competicaoId_nome: { competicaoId: competicao.id, nome: eq.nome },
            },
            select: { id: true, nome: true },
          });
          if (existente) equipaIdPorNome.set(existente.nome, existente.id);
        } else {
          throw e;
        }
      }
    }

    // 6. Criar confrontos + ligar aos jogos existentes.
    let confrontosCriados = 0;
    let jogosLigados = 0;

    for (const c of confrontos) {
      const dataHora = new Date(`${c.data}T${HORA_JOGO_UTC}`);

      // A equipa própria joga CASA → casa = clube / fora = adversário; e vice-versa.
      const nomeCasa = c.local === "CASA" ? nomeClube : c.adversario;
      const nomeFora = c.local === "CASA" ? c.adversario : nomeClube;

      const confronto = await prisma.resultadoCompeticao.create({
        data: {
          competicaoId: competicao.id,
          equipaCasa: nomeCasa,
          equipaFora: nomeFora,
          equipaCasaId: equipaIdPorNome.get(nomeCasa) ?? null,
          equipaForaId: equipaIdPorNome.get(nomeFora) ?? null,
          estado: EstadoResultado.AGENDADO,
          dataHora,
          ronda: null,
        },
        select: { id: true },
      });
      confrontosCriados++;

      // Ligar ao Jogo correspondente: mesmo escalão/época, adversário
      // (case-insensitive) e data no mesmo dia. Não bloqueante se não existir.
      const inicioDia = new Date(`${c.data}T00:00:00.000Z`);
      const fimDia = new Date(`${c.data}T23:59:59.999Z`);

      const jogo = await prisma.jogo.findFirst({
        where: {
          escalaoId: competicao.escalaoId,
          epocaId: competicao.epocaId,
          adversario: { equals: c.adversario, mode: "insensitive" },
          data: { gte: inicioDia, lte: fimDia },
        },
        select: { id: true },
      });

      if (jogo) {
        await prisma.jogo.update({
          where: { id: jogo.id },
          data: { resultadoCompeticaoId: confronto.id },
        });
        jogosLigados++;
      }
    }

    return NextResponse.json({
      equipasCriadas,
      confrontosCriados,
      jogosLigados,
      skipped: false,
    });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
