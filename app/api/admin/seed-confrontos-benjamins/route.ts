// Route Handler — faz um RESET COMPLETO do quadro competitivo de uma competição
// (ResultadoCompeticao + EquipaCompeticao) e re-associa apenas os Jogo dos
// adversários que fazem parte do campeonato. Invocável no servidor (Vercel) via
// browser. Email do utilizador via env SEED_USER_EMAIL.
//
// Este handler é DESTRUTIVO e idempotente por reconstrução:
//   PASSO 1 — Reset completo:
//     1a. Desliga TODOS os Jogo que apontem para ResultadoCompeticao desta
//         competição (resultadoCompeticaoId → null).
//     1b. Apaga todos os ResultadoCompeticao desta competição.
//     1c. Apaga todas as EquipaCompeticao desta competição.
//   PASSO 2 — Re-associar apenas os adversários do campeonato:
//     2a. Filtra os Jogo do escalão/época por tipo OFICIAL e adversario ∈
//         ADVERSARIOS_CAMPEONATO.
//     2b. Cria as equipas participantes (EquipaCompeticao): a PRÓPRIA (PROPRIO,
//         derivada do clube) + uma EXTERNO por cada adversário único encontrado
//         (upsert por competicaoId+nome via create + captura de P2002).
//     2c. Para cada Jogo cria um ResultadoCompeticao (AGENDADO, dataHora =
//         Jogo.data) e liga o Jogo a esse resultado.
//     2d. Preenche equipaCasaId/equipaForaId com os IDs das EquipaCompeticao.
//
// O reset corre SEMPRE (sem short-circuit de skipped).
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
  CasaFora,
} from "@prisma/client";
import { prisma } from "@/lib/db";

// Corre no runtime Node (acede a Prisma); sempre dinâmico (lê env + query).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_ALVO = process.env.SEED_USER_EMAIL ?? "";
const COMPETICAO_ID = "cmt1hswod0003qcr57ezf6m4i";

// Adversários que realmente fazem parte deste campeonato. Só os Jogo OFICIAIS
// contra estes adversários são re-associados; quaisquer outros (ex.: de outras
// competições que ficaram marcados como OFICIAL) são ignorados.
const ADVERSARIOS_CAMPEONATO = new Set([
  "TIS",
  "Internacional SC",
  "Fund. Salesianos Col. Évora",
  "Lusitano GC",
  "Mourão FC",
  "NS de Moura",
  "GDC Baronia",
]);

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

    // PASSO 1 — RESET COMPLETO do quadro competitivo desta competição.
    // 1a. Desligar TODOS os Jogo que apontem para um ResultadoCompeticao desta
    //     competição (independentemente de tipo/estado).
    await prisma.jogo.updateMany({
      where: { resultadoCompeticao: { competicaoId: COMPETICAO_ID } },
      data: { resultadoCompeticaoId: null },
    });
    // 1b. Apagar todos os ResultadoCompeticao desta competição.
    await prisma.resultadoCompeticao.deleteMany({
      where: { competicaoId: COMPETICAO_ID },
    });
    // 1c. Apagar todas as EquipaCompeticao desta competição.
    await prisma.equipaCompeticao.deleteMany({
      where: { competicaoId: COMPETICAO_ID },
    });

    // PASSO 2 — Re-associar apenas os Jogo OFICIAIS contra adversários que fazem
    // parte deste campeonato (ADVERSARIOS_CAMPEONATO). Os Jogo já foram todos
    // desligados no reset, por isso partimos de resultadoCompeticaoId == null.
    const jogos = await prisma.jogo.findMany({
      where: {
        escalaoId: competicao.escalaoId,
        epocaId: competicao.epocaId,
        resultadoCompeticaoId: null,
        tipo: "OFICIAL",
        adversario: { in: [...ADVERSARIOS_CAMPEONATO] },
      },
      select: { id: true, adversario: true, casaFora: true, data: true },
      orderBy: { data: "asc" },
    });

    // 5. Criar equipas participantes: a PRÓPRIA (derivada do clube) + uma EXTERNO
    // por cada adversário único encontrado nos jogos. Upsert lógico por
    // competicaoId+nome via create + captura de P2002. Mapa nome → id.
    const adversariosUnicos: string[] = [
      ...new Set(jogos.map((j) => j.adversario)),
    ];
    const equipas: { nome: string; tipo: TipoParticipanteCompeticao }[] = [
      { nome: nomeClube, tipo: TipoParticipanteCompeticao.PROPRIO },
      ...adversariosUnicos.map((nome) => ({
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

    // 6. Para cada Jogo: criar o ResultadoCompeticao (AGENDADO, dataHora = data do
    // jogo) e ligar o Jogo a esse resultado. As equipas casa/fora derivam de
    // casaFora: CASA → casa = clube / fora = adversário; FORA → invertido.
    type ResultadoInfo = { id: string; nomeCasa: string; nomeFora: string };
    const resultados: ResultadoInfo[] = [];
    let jogosAssociados = 0;

    for (const jogo of jogos) {
      const nomeCasa =
        jogo.casaFora === CasaFora.CASA ? nomeClube : jogo.adversario;
      const nomeFora =
        jogo.casaFora === CasaFora.CASA ? jogo.adversario : nomeClube;

      const resultado = await prisma.resultadoCompeticao.create({
        data: {
          competicaoId: competicao.id,
          equipaCasa: nomeCasa,
          equipaFora: nomeFora,
          estado: EstadoResultado.AGENDADO,
          dataHora: jogo.data,
          ronda: null,
        },
        select: { id: true },
      });

      await prisma.jogo.update({
        where: { id: jogo.id },
        data: { resultadoCompeticaoId: resultado.id },
      });
      jogosAssociados++;

      resultados.push({ id: resultado.id, nomeCasa, nomeFora });
    }

    // 7. Depois de criar os ResultadoCompeticao, ligar equipaCasaId/equipaForaId
    // aos IDs das EquipaCompeticao correspondentes.
    for (const r of resultados) {
      await prisma.resultadoCompeticao.update({
        where: { id: r.id },
        data: {
          equipaCasaId: equipaIdPorNome.get(r.nomeCasa) ?? null,
          equipaForaId: equipaIdPorNome.get(r.nomeFora) ?? null,
        },
      });
    }

    return NextResponse.json({
      jogosAssociados,
      equipasCriadas,
      skipped: false,
    });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
