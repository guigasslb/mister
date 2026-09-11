// Route Handler — seed do campeonato de Benjamins (época 2026/2027), invocável
// no servidor (Vercel) via browser. Email do utilizador via env SEED_USER_EMAIL.
//
// Operação de RESET: resolve utilizador → clube (adesão ATIVA) → escalão
// "benjamins" → época ativa, APAGA os jogos previamente criados (por escalão/época
// + adversário na lista abaixo) via `deleteMany` e RECRIA os 23 jogos (20 OFICIAIS
// de campeonato + 3 AMIGÁVEIS/torneio) com as datas corrigidas (época 2026/2027).
// Não é idempotente: cada execução apaga e recria.
//
// PROTEÇÃO: só responde se o query param `secret` for igual à env `SEED_SECRET`;
// caso contrário devolve 401. Usa o Prisma client partilhado da app (@/lib/db),
// que aplica limites de pool adequados ao pooler do Supabase em serverless.
//
// Uso: GET /api/admin/seed-campeonato?secret=<SEED_SECRET>

import { NextResponse, type NextRequest } from "next/server";
import { CasaFora, TipoJogo, type FormatoJogo } from "@prisma/client";
import { prisma } from "@/lib/db";

// Corre no runtime Node (acede a Prisma); sempre dinâmico (lê env + query).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_ALVO = process.env.SEED_USER_EMAIL ?? "";
const HORA_JOGO_UTC = "10:00:00.000Z"; // hora convencional (calendário sem hora)

type LocalJogo = "CASA" | "FORA";
type JogoBase = { data: string; adversario: string; local: LocalJogo };
type JogoSeed = JogoBase & { tipo: TipoJogo };

// Plano anual de época 2026-2027 — campeonato de Benjamins (jogos OFICIAIS).
const jogosCampeonato: JogoBase[] = [
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
];

// Jogos amigáveis / torneio (JT) — tipo AMIGAVEL. O "Torneio de Páscoa" não tem
// campo casa/fora definido (local neutro), pelo que usa FORA como default.
const jogosJT: JogoBase[] = [
  { data: "2027-04-03", adversario: "Torneio de Páscoa", local: "FORA" },
  { data: "2027-05-08", adversario: "SLE", local: "CASA" },
  { data: "2027-06-03", adversario: "Juventude SC (Infantis)", local: "FORA" },
];

// Lista combinada com o tipo atribuído a cada jogo.
const jogos: JogoSeed[] = [
  ...jogosCampeonato.map((j) => ({ ...j, tipo: TipoJogo.OFICIAL })),
  ...jogosJT.map((j) => ({ ...j, tipo: TipoJogo.AMIGAVEL })),
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
      select: { id: true, nome: true },
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

    // 3. Escalão cujo nome começa por "benjamins" (case-insensitive).
    const escaloes = await prisma.escalao.findMany({
      where: { clubeId },
      select: { id: true, nome: true, seccao: { select: { modalidade: true } } },
    });
    const escalao = escaloes.find((e) =>
      e.nome.trim().toLowerCase().startsWith("benjamins"),
    );
    if (!escalao) {
      const disponiveis =
        escaloes.map((e) => `"${e.nome}"`).join(", ") || "(nenhum)";
      return NextResponse.json(
        {
          error: `Escalão "Benjamins" não encontrado no clube "${nomeClube}". Escalões existentes: ${disponiveis}.`,
        },
        { status: 404 },
      );
    }

    // 4. Época ativa do clube.
    const epoca = await prisma.epoca.findFirst({
      where: { clubeId, ativa: true },
      select: { id: true, nome: true },
    });
    if (!epoca) {
      return NextResponse.json(
        { error: `Nenhuma época ativa encontrada no clube "${nomeClube}".` },
        { status: 404 },
      );
    }

    // Formato do jogo (§3.7): FUTSAL → FUTSAL_5; futebol não tem default único
    // (fica null; o editor deriva depois).
    const formato: FormatoJogo | null =
      escalao.seccao?.modalidade === "FUTSAL" ? "FUTSAL_5" : null;

    // 5. RESET: apagar os jogos previamente criados (escalão/época + adversário
    // na lista, incluindo os amigáveis/torneio) e recriar os 23 com as datas
    // corrigidas.
    const adversarios = Array.from(new Set(jogos.map((j) => j.adversario)));

    const { count: apagados } = await prisma.jogo.deleteMany({
      where: {
        escalaoId: escalao.id,
        epocaId: epoca.id,
        adversario: { in: adversarios },
      },
    });

    let criados = 0;

    for (const j of jogos) {
      const dataJogo = new Date(`${j.data}T${HORA_JOGO_UTC}`);

      await prisma.jogo.create({
        data: {
          data: dataJogo,
          adversario: j.adversario,
          casaFora: j.local === "CASA" ? CasaFora.CASA : CasaFora.FORA,
          tipo: j.tipo,
          formato,
          escalaoId: escalao.id,
          epocaId: epoca.id,
          criadorId: utilizador.id,
        },
      });
      criados++;
    }

    return NextResponse.json({
      apagados,
      criados,
    });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
