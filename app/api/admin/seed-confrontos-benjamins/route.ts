// Route Handler — associa os Jogo já existentes de uma competição ao seu quadro
// competitivo (ResultadoCompeticao + EquipaCompeticao). Invocável no servidor
// (Vercel) via browser. Email do utilizador via env SEED_USER_EMAIL.
//
// Ao contrário da versão anterior (que criava confrontos a partir de uma lista
// hardcoded), este handler PARTE DOS Jogo já existentes na BD:
//   1. Para cada Jogo do escalão/época da competição ainda não associado
//      (resultadoCompeticaoId == null), cria um ResultadoCompeticao (AGENDADO,
//      dataHora = Jogo.data) e liga o Jogo a esse resultado.
//   2. Cria as equipas participantes (EquipaCompeticao): a PRÓPRIA (PROPRIO,
//      derivada do clube) + uma EXTERNO por cada adversário único encontrado
//      nos Jogos (upsert por competicaoId+nome via create + captura de P2002).
//   3. Preenche equipaCasaId/equipaForaId dos ResultadoCompeticao criados com os
//      IDs das EquipaCompeticao correspondentes.
//
// IDEMPOTÊNCIA: se todos os Jogo do escalão/época já tiverem resultadoCompeticaoId
// (ou não existirem Jogo por associar), devolve { skipped: true } sem alterar nada.
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

    // 3b. Limpar amigáveis que possam ter sido associados por engano: desligar
    // os Jogo AMIGAVEL que apontem para ResultadoCompeticao desta competição.
    const jogosAmigaveisAssociados = await prisma.jogo.findMany({
      where: {
        escalaoId: competicao.escalaoId,
        epocaId: competicao.epocaId,
        tipo: "AMIGAVEL",
        resultadoCompeticaoId: { not: null },
        resultadoCompeticao: { competicaoId: COMPETICAO_ID },
      },
      select: { id: true, resultadoCompeticaoId: true },
    });
    for (const j of jogosAmigaveisAssociados) {
      await prisma.jogo.update({ where: { id: j.id }, data: { resultadoCompeticaoId: null } });
      if (j.resultadoCompeticaoId) {
        await prisma.resultadoCompeticao.delete({ where: { id: j.resultadoCompeticaoId } });
      }
    }

    // 4. Jogos OFICIAIS do escalão/época da competição ainda NÃO associados a
    // nenhuma competição (resultadoCompeticaoId == null). Exclui amigáveis.
    const jogos = await prisma.jogo.findMany({
      where: {
        escalaoId: competicao.escalaoId,
        epocaId: competicao.epocaId,
        resultadoCompeticaoId: null,
        tipo: "OFICIAL",
      },
      select: { id: true, adversario: true, casaFora: true, data: true },
      orderBy: { data: "asc" },
    });

    // Idempotência: se já não há jogos por associar, não há nada a fazer.
    if (jogos.length === 0) {
      return NextResponse.json({ skipped: true });
    }

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
