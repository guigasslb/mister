// Route Handler — seed do campeonato de Benjamins (época 2025/2026) do treinador
// `goncalo.pereira.1992@gmail.com`, invocável no servidor (Vercel) via browser.
//
// Réplica fiel da lógica de `scripts/seed-campeonato-benjamins.ts` (que NÃO é
// alterado): resolve utilizador → clube (adesão ATIVA) → escalão "benjamins" →
// época ativa e cria os 20 jogos de campeonato de forma IDEMPOTENTE (dedupe por
// escalão/época + adversário + dia). Correr 2x não duplica.
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

const EMAIL_ALVO = "goncalo.pereira.1992@gmail.com";
const HORA_JOGO_UTC = "10:00:00.000Z"; // hora convencional (calendário sem hora)

type LocalJogo = "CASA" | "FORA";
type JogoSeed = { data: string; adversario: string; local: LocalJogo };

// Plano anual de época 2025-2026 — campeonato de Benjamins.
const jogos: JogoSeed[] = [
  { data: "2025-10-26", adversario: "GDC Baronia", local: "CASA" },
  { data: "2025-11-02", adversario: "TIS", local: "CASA" },
  { data: "2025-11-09", adversario: "Internacional SC", local: "FORA" },
  { data: "2025-11-16", adversario: "Fund. Salesianos Col. Évora", local: "CASA" },
  { data: "2025-11-23", adversario: "Lusitano GC", local: "FORA" },
  { data: "2025-11-30", adversario: "Mourão FC", local: "CASA" },
  { data: "2025-12-07", adversario: "NS de Moura", local: "FORA" },
  { data: "2025-12-14", adversario: "NS de Moura", local: "CASA" },
  { data: "2026-01-11", adversario: "GDC Baronia", local: "FORA" },
  { data: "2026-01-17", adversario: "TIS", local: "FORA" },
  { data: "2026-02-03", adversario: "Internacional SC", local: "CASA" },
  { data: "2026-02-14", adversario: "GDC Baronia", local: "FORA" },
  { data: "2026-02-22", adversario: "Lusitano GC", local: "CASA" },
  { data: "2026-02-24", adversario: "Fund. Salesianos Col. Évora", local: "FORA" },
  { data: "2026-03-01", adversario: "Mourão FC", local: "FORA" },
  { data: "2026-03-21", adversario: "Fund. Salesianos Col. Évora", local: "CASA" },
  { data: "2026-03-29", adversario: "GDC Baronia", local: "FORA" },
  { data: "2026-04-11", adversario: "NS de Moura", local: "FORA" },
  { data: "2026-04-14", adversario: "Internacional SC", local: "CASA" },
  { data: "2026-05-26", adversario: "Lusitano GC", local: "FORA" },
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

    // 5. Criar jogos (idempotente: dedupe por escalão/época + adversário + dia).
    let criados = 0;
    let existentes = 0;

    for (const j of jogos) {
      const dataJogo = new Date(`${j.data}T${HORA_JOGO_UTC}`);
      const inicioDia = new Date(`${j.data}T00:00:00.000Z`);
      const fimDia = new Date(`${j.data}T23:59:59.999Z`);

      const existente = await prisma.jogo.findFirst({
        where: {
          escalaoId: escalao.id,
          epocaId: epoca.id,
          adversario: j.adversario,
          data: { gte: inicioDia, lte: fimDia },
        },
        select: { id: true },
      });

      if (existente) {
        existentes++;
        continue;
      }

      await prisma.jogo.create({
        data: {
          data: dataJogo,
          adversario: j.adversario,
          casaFora: j.local === "CASA" ? CasaFora.CASA : CasaFora.FORA,
          tipo: TipoJogo.OFICIAL,
          formato,
          escalaoId: escalao.id,
          epocaId: epoca.id,
          criadorId: utilizador.id,
        },
      });
      criados++;
    }

    return NextResponse.json({
      criados,
      existentes,
      total: jogos.length,
    });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
