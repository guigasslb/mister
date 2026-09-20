// prisma/data-migrations/reparar_estatisticas_jogo_ao_vivo.ts
//
// BUG (já corrigido para NOVAS terminações): `persistirMinutos`
// (lib/actions/jogo-ao-vivo.ts) criava, ao terminar o Modo Jogo ao Vivo, registos
// `EstatisticaAtleta` PARCIAIS (golos=0, `minutosPorParte=[]`, contadores a zero).
// O loader (`combinarEstatisticasIniciais` em lib/derivar-estatisticas.ts) trata o
// registo persistido como um SNAPSHOT COMPLETO que se sobrepõe por inteiro ao
// derivado (last-write-wins, §13.4). Resultado: os defaults do registo parcial
// APAGAVAM os golos/assistências/cartões e os minutos por parte que os eventos
// (fonte de verdade, `EventoJogo`) provam ter acontecido.
//
// FIX já aplicado: o `create` do upsert grava agora o snapshot COMPLETO derivado.
// Este script REPARA os registos JÁ corrompidos por terminações anteriores ao fix.
//
// FONTE DE VERDADE: `EventoJogo` (golos, assistências, cartões, intervalos ao
// segundo). A estatística correta é re-derivada com a MESMA função do runtime —
// `derivarEstatisticas` (lib/derivar-estatisticas.ts) — reutilizada, não
// reimplementada, garantindo paridade total com o loader (§10.4/§8.11).
//
// ÂMBITO: apenas jogos conduzidos/registados pelo Modo Jogo ao Vivo — os que têm
// `SessaoJogoAoVivo` e/ou pelo menos um `EventoJogo` com `segundoJogo` preenchido.
// Jogos registados SÓ manualmente (sem cronómetro) NÃO são tocados.
//
// SEGURANÇA (só repara o que o bug corrompeu): um atleta só é marcado para
// reparação quando EXISTE um registo `EstatisticaAtleta` persistido QUE PERDEU
// informação que os eventos provam (ex.: há eventos GOLO mas `golos` persistido é
// MENOR; há intervalos ENTRADA/SAIDA mas `minutosPorParte` está `[]`/`minutos`
// nulo). Nunca reduz um valor que o treinador tenha editado à mão para além do que
// os eventos mostram — só recupera o que foi apagado.
//
// APLICAÇÃO (modo --apply, a NÃO correr agora): sobrescreve os campos derivados do
// registo `EstatisticaAtleta` do atleta corrompido com o snapshot COMPLETO derivado,
// PRESERVANDO as métricas configuráveis (`ValorMetrica`, linhas próprias nunca
// tocadas). Idempotente: após reparar, uma nova passagem não deteta nada.
//
// EXECUÇÃO:
//   DRY-RUN (default, SÓ LEITURA, não escreve nada):
//     tsx --env-file=.env prisma/data-migrations/reparar_estatisticas_jogo_ao_vivo.ts
//   APLICAÇÃO (só com autorização explícita do supervisor):
//     tsx --env-file=.env prisma/data-migrations/reparar_estatisticas_jogo_ao_vivo.ts --apply
//
// NÃO toca em auth. NÃO altera schema. NÃO faz push.

import { PrismaClient } from "@prisma/client";
import { derivarEstatisticas } from "../../lib/derivar-estatisticas";
import { modalidadeEfetiva } from "../../lib/modalidade-escalao";

const prisma = new PrismaClient();

// --apply escreve na BD; ausente = DRY-RUN (só leitura, default seguro).
const APLICAR = process.argv.includes("--apply");

/** Formata um array de minutos por parte para o relatório (ex.: "[12, 8]"). */
function fmtPartes(partes: number[] | null | undefined): string {
  if (!partes || partes.length === 0) return "[]";
  return `[${partes.join(", ")}]`;
}

/** Formata minutos (null = "—"). */
function fmtMin(m: number | null | undefined): string {
  return m == null ? "—" : String(m);
}

interface AtletaAfetado {
  atletaId: string;
  nome: string;
  antes: { golos: number; minutos: number | null; minutosPorParte: number[] };
  depois: { golos: number; minutos: number | null; minutosPorParte: number[] };
  motivos: string[];
}

interface JogoAfetado {
  jogoId: string;
  descricao: string;
  atletas: AtletaAfetado[];
}

async function main() {
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(
    `  Reparação de EstatisticaAtleta corrompidas pelo Modo Jogo ao Vivo`,
  );
  console.log(
    `  MODO: ${APLICAR ? "⚠️  APLICAÇÃO (escreve na BD)" : "DRY-RUN (só leitura, nada é escrito)"}`,
  );
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  // 1) Candidatos: jogos com sessão ao vivo OU com eventos de cronómetro.
  const [comSessao, comSegundo] = await Promise.all([
    prisma.sessaoJogoAoVivo.findMany({ select: { jogoId: true } }),
    prisma.eventoJogo.findMany({
      where: { segundoJogo: { not: null } },
      select: { jogoId: true },
      distinct: ["jogoId"],
    }),
  ]);

  const candidatos = new Set<string>([
    ...comSessao.map((s) => s.jogoId),
    ...comSegundo.map((e) => e.jogoId),
  ]);

  console.log(`Jogos candidatos (com Modo Jogo ao Vivo): ${candidatos.size}`);
  console.log(
    `  · com SessaoJogoAoVivo: ${comSessao.length}  · com eventos ao segundo: ${comSegundo.length}`,
  );
  console.log("");

  const afetados: JogoAfetado[] = [];
  let totalAtletasAfetados = 0;

  for (const jogoId of candidatos) {
    const jogo = await prisma.jogo.findUnique({
      where: { id: jogoId },
      select: {
        id: true,
        data: true,
        adversario: true,
        formato: true,
        numeroPartes: true,
        modalidadeAtividade: true,
        escalao: {
          select: {
            nome: true,
            seccao: { select: { modalidade: true } },
          },
        },
      },
    });
    if (!jogo) continue;

    const convocados = await prisma.convocatoria.findMany({
      where: { jogoId, convocado: true },
      select: {
        atletaId: true,
        titularPrevisto: true,
        atleta: { select: { nome: true } },
      },
    });
    if (convocados.length === 0) continue;

    const eventos = await prisma.eventoJogo.findMany({
      where: { jogoId },
      select: {
        tipo: true,
        atletaId: true,
        atletaSecundarioId: true,
        bloco: true,
        minuto: true,
        segundoJogo: true,
        parte: true,
      },
    });

    const persistidas = await prisma.estatisticaAtleta.findMany({
      where: { jogoId },
      select: {
        atletaId: true,
        golos: true,
        assistencias: true,
        cartaoAmarelo: true,
        cartaoVermelho: true,
        golosSofridosGR: true,
        minutos: true,
        minutosPorParte: true,
      },
    });
    const persistidaPorAtleta = new Map(persistidas.map((p) => [p.atletaId, p]));

    const eFutebol =
      modalidadeEfetiva(
        jogo.modalidadeAtividade,
        jogo.escalao.seccao?.modalidade,
      ) === "FUTEBOL";

    // Re-derivação com o MOTOR ÚNICO do runtime (paridade total com o loader).
    const { estatisticas } = derivarEstatisticas(
      eventos.map((e) => ({
        tipo: e.tipo,
        atletaId: e.atletaId,
        atletaSecundarioId: e.atletaSecundarioId,
        bloco: e.bloco,
        minuto: e.minuto,
        segundoJogo: e.segundoJogo,
        parte: e.parte,
      })),
      convocados.map((c) => ({
        atletaId: c.atletaId,
        titularPrevisto: c.titularPrevisto,
      })),
      eFutebol,
      jogo.formato,
    );

    const atletasAfetados: AtletaAfetado[] = [];

    for (const c of convocados) {
      const persistida = persistidaPorAtleta.get(c.atletaId);
      // Só há corrupção a reparar quando EXISTE registo persistido (o bug criava um
      // registo parcial). Sem registo, o loader deriva corretamente dos eventos.
      if (!persistida) continue;

      const derivada = estatisticas.get(c.atletaId);
      if (!derivada) continue;

      const dGolos = derivada.golos ?? 0;
      const dAssist = derivada.assistencias ?? 0;
      const dAmarelos = derivada.cartaoAmarelo ?? 0;
      const dVermelhos = derivada.cartaoVermelho ?? 0;
      const dGR = derivada.golosSofridosGR ?? 0;
      const dMinutos = derivada.minutos ?? null;
      const dPartes = derivada.minutosPorParte ?? [];

      const motivos: string[] = [];
      // "Perda" = os eventos provam MAIS do que o persistido guardou (assinatura do
      // bug: defaults a zero/vazio que apagaram dados derivados). Nunca reduz valores.
      if (dGolos > (persistida.golos ?? 0)) motivos.push(`golos ${persistida.golos} → ${dGolos}`);
      if (dAssist > (persistida.assistencias ?? 0))
        motivos.push(`assistências ${persistida.assistencias} → ${dAssist}`);
      if (dAmarelos > (persistida.cartaoAmarelo ?? 0))
        motivos.push(`amarelos ${persistida.cartaoAmarelo} → ${dAmarelos}`);
      if (dVermelhos > (persistida.cartaoVermelho ?? 0))
        motivos.push(`vermelhos ${persistida.cartaoVermelho} → ${dVermelhos}`);
      if (dGR > (persistida.golosSofridosGR ?? 0))
        motivos.push(`golos sofridos GR ${persistida.golosSofridosGR ?? 0} → ${dGR}`);
      if (dMinutos != null && persistida.minutos == null)
        motivos.push(`minutos — → ${dMinutos}`);
      if (dPartes.length > 0 && persistida.minutosPorParte.length === 0)
        motivos.push(`minutosPorParte [] → ${fmtPartes(dPartes)}`);

      if (motivos.length === 0) continue;

      atletasAfetados.push({
        atletaId: c.atletaId,
        nome: c.atleta?.nome ?? c.atletaId,
        antes: {
          golos: persistida.golos,
          minutos: persistida.minutos,
          minutosPorParte: persistida.minutosPorParte,
        },
        depois: {
          golos: dGolos,
          minutos: dMinutos,
          minutosPorParte: dPartes,
        },
        motivos,
      });
    }

    if (atletasAfetados.length === 0) continue;

    const dataStr = jogo.data.toISOString().slice(0, 10);
    afetados.push({
      jogoId,
      descricao: `${dataStr} · ${jogo.escalao.nome} vs ${jogo.adversario}`,
      atletas: atletasAfetados,
    });
    totalAtletasAfetados += atletasAfetados.length;
  }

  // 2) Relatório detalhado (antes → depois).
  console.log("─── Impacto detetado ──────────────────────────────────────────");
  if (afetados.length === 0) {
    console.log("  ✅ Nenhum registo corrompido. Nada a reparar.");
  } else {
    for (const j of afetados) {
      console.log("");
      console.log(`  ▸ Jogo ${j.jogoId}`);
      console.log(`    ${j.descricao}`);
      console.log(`    Atletas afetados: ${j.atletas.length}`);
      for (const a of j.atletas) {
        console.log(`      • ${a.nome} (${a.atletaId})`);
        console.log(
          `          golos:            ${a.antes.golos} → ${a.depois.golos}`,
        );
        console.log(
          `          minutos:          ${fmtMin(a.antes.minutos)} → ${fmtMin(a.depois.minutos)}`,
        );
        console.log(
          `          minutosPorParte:  ${fmtPartes(a.antes.minutosPorParte)} → ${fmtPartes(a.depois.minutosPorParte)}`,
        );
        console.log(`          motivos: ${a.motivos.join("; ")}`);
      }
    }
  }
  console.log("");

  // 3) Aplicação (SÓ com --apply). Em dry-run, esta secção não escreve nada.
  if (APLICAR && afetados.length > 0) {
    console.log("─── Aplicação ─────────────────────────────────────────────────");
    let atletasEscritos = 0;
    for (const j of afetados) {
      // Re-lê e re-deriva DENTRO da transação para gravar o snapshot COMPLETO,
      // preservando ValorMetrica (linhas próprias, nunca tocadas).
      await prisma.$transaction(async (tx) => {
        const jogo = await tx.jogo.findUnique({
          where: { id: j.jogoId },
          select: {
            formato: true,
            modalidadeAtividade: true,
            escalao: { select: { seccao: { select: { modalidade: true } } } },
          },
        });
        if (!jogo) return;

        const convocados = await tx.convocatoria.findMany({
          where: { jogoId: j.jogoId, convocado: true },
          select: { atletaId: true, titularPrevisto: true },
        });
        const eventos = await tx.eventoJogo.findMany({
          where: { jogoId: j.jogoId },
          select: {
            tipo: true,
            atletaId: true,
            atletaSecundarioId: true,
            bloco: true,
            minuto: true,
            segundoJogo: true,
            parte: true,
          },
        });
        const eFutebol =
          modalidadeEfetiva(
            jogo.modalidadeAtividade,
            jogo.escalao.seccao?.modalidade,
          ) === "FUTEBOL";
        const { estatisticas } = derivarEstatisticas(
          eventos.map((e) => ({
            tipo: e.tipo,
            atletaId: e.atletaId,
            atletaSecundarioId: e.atletaSecundarioId,
            bloco: e.bloco,
            minuto: e.minuto,
            segundoJogo: e.segundoJogo,
            parte: e.parte,
          })),
          convocados.map((c) => ({
            atletaId: c.atletaId,
            titularPrevisto: c.titularPrevisto,
          })),
          eFutebol,
          jogo.formato,
        );

        for (const a of j.atletas) {
          const d = estatisticas.get(a.atletaId);
          if (!d) continue;
          await tx.estatisticaAtleta.update({
            where: {
              jogoId_atletaId: { jogoId: j.jogoId, atletaId: a.atletaId },
            },
            // Snapshot COMPLETO derivado. ValorMetrica (linhas próprias) intacto.
            data: {
              utilizacao: d.utilizacao,
              blocoTempo: d.blocoTempo ?? null,
              minutos: d.minutos ?? null,
              minutosPorParte: d.minutosPorParte ?? [],
              golos: d.golos ?? 0,
              assistencias: d.assistencias ?? 0,
              defesas: d.defesas ?? null,
              golosSofridosGR: d.golosSofridosGR ?? null,
              faltasCometidas: d.faltasCometidas ?? null,
              cartaoAmarelo: d.cartaoAmarelo ?? 0,
              cartaoVermelho: d.cartaoVermelho ?? 0,
              remates: d.remates ?? null,
              cantos: d.cantos ?? null,
              forasDeJogo: d.forasDeJogo ?? null,
              desarmes: d.desarmes ?? null,
            },
          });
          atletasEscritos++;
        }
      });
      console.log(`  ✎ Jogo ${j.jogoId}: ${j.atletas.length} atleta(s) reparado(s).`);
    }
    console.log("");
    console.log(`  ✅ Aplicação concluída: ${atletasEscritos} registo(s) atualizado(s).`);
    console.log("");
  }

  // 4) Resumo final.
  console.log("─── Resumo ────────────────────────────────────────────────────");
  console.log(`  Jogos candidatos (Modo ao Vivo):  ${candidatos.size}`);
  console.log(`  Jogos afetados (a reparar):        ${afetados.length}`);
  console.log(`  Atletas afetados (a reparar):      ${totalAtletasAfetados}`);
  if (!APLICAR) {
    console.log("");
    console.log("  ℹ️  DRY-RUN: NADA foi escrito na base de dados.");
    console.log("     Para aplicar (com autorização explícita): adicionar --apply.");
  }
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
