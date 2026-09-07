/**
 * Import de exercícios transcritos do dossier de um treinador para a BD.
 *
 * ESCREVE NA BD (autorizado). Importa 47 exercícios (4 batches no scratchpad)
 * para a biblioteca 🎒 PESSOAL do treinador `goncalo.pereira.1992@gmail.com`
 * no clube "Juventude Sport Clube".
 *
 * Propriedades:
 *  - proprietario = TREINADOR, autorId = criadorId = treinador (dual-write legado).
 *  - origemSeed = false. Ver nota abaixo (não é biblioteca curada da app; e evita
 *    partir a idempotência de `instalarBibliotecaArranque`, que conta
 *    `{ clubeId, origemSeed: true }`).
 *  - Idempotente: dedupe por (nome, clubeId) — salta os que já existam.
 *  - Valida cada diagrama com `diagramaSchema` ANTES de gravar; aborta tudo se
 *    algum falhar (não deixa a BD meio-importada).
 *
 * Correr a partir de /futsal-manager:
 *   npx tsx --env-file=.env scripts/import-exercicios-dossier.ts
 */
import { prisma } from "@/lib/db";
import { diagramaSchema } from "@/lib/schemas/exercicio";
import { Prisma } from "@prisma/client";

// Batches transcritos (arrays `ImportExercicio[]`) — caminhos absolutos do scratchpad.
import { batch1 } from "/tmp/claude-0/-futsal-manager/05faac92-2ce0-471e-8ccf-cc4ff7f8527a/scratchpad/exercicios_batch1";
import { batch2 } from "/tmp/claude-0/-futsal-manager/05faac92-2ce0-471e-8ccf-cc4ff7f8527a/scratchpad/exercicios_batch2";
import { batch3 } from "/tmp/claude-0/-futsal-manager/05faac92-2ce0-471e-8ccf-cc4ff7f8527a/scratchpad/exercicios_batch3";
import { batch4 } from "/tmp/claude-0/-futsal-manager/05faac92-2ce0-471e-8ccf-cc4ff7f8527a/scratchpad/exercicios_batch4";

// ─── Destino esperado (confirmado por investigação prévia) ───────────────────
const EMAIL_ALVO = "goncalo.pereira.1992@gmail.com";
const UTILIZADOR_ID_ESPERADO = "cmsdbtmjw0000dkop092ujs6z";
const CLUBE_ID_ESPERADO = "cmsdbu0vt0002dkop22p8n5f2";
const CLUBE_NOME_ESPERADO = "Juventude Sport Clube";

const BATCHES = [
  { nome: "batch1", itens: batch1 },
  { nome: "batch2", itens: batch2 },
  { nome: "batch3", itens: batch3 },
  { nome: "batch4", itens: batch4 },
] as const;

function abortar(msg: string): never {
  console.error(`\n❌ ABORTADO: ${msg}\n`);
  throw new Error(msg);
}

async function main() {
  const total = BATCHES.reduce((n, b) => n + b.itens.length, 0);
  console.log("═".repeat(70));
  console.log(`Import de exercícios do dossier — ${total} candidatos`);
  BATCHES.forEach((b) => console.log(`  • ${b.nome}: ${b.itens.length}`));
  console.log("═".repeat(70));

  if (total !== 47) {
    abortar(`Esperados 47 exercícios nos batches, encontrados ${total}.`);
  }

  // ── 1. Resolver e VALIDAR utilizador ──────────────────────────────────────
  const utilizador = await prisma.utilizador.findUnique({
    where: { email: EMAIL_ALVO },
    select: { id: true, nome: true, email: true },
  });
  if (!utilizador) abortar(`Utilizador não encontrado por email: ${EMAIL_ALVO}`);
  if (utilizador.id !== UTILIZADOR_ID_ESPERADO) {
    abortar(
      `ID do utilizador não bate. Esperado ${UTILIZADOR_ID_ESPERADO}, obtido ${utilizador.id}.`,
    );
  }
  console.log(`✔ Utilizador: ${utilizador.nome} <${utilizador.email}> (${utilizador.id})`);

  // ── 2. Resolver e VALIDAR clube (via adesão ATIVA) ────────────────────────
  const membro = await prisma.membroClube.findFirst({
    where: { utilizadorId: utilizador.id, estado: "ATIVO" },
    select: { clube: { select: { id: true, nome: true } } },
  });
  if (!membro) abortar(`Sem adesão ATIVA a nenhum clube para ${EMAIL_ALVO}.`);
  const clube = membro.clube;
  if (clube.id !== CLUBE_ID_ESPERADO) {
    abortar(
      `ID do clube não bate. Esperado ${CLUBE_ID_ESPERADO}, obtido ${clube.id} ("${clube.nome}").`,
    );
  }
  if (clube.nome !== CLUBE_NOME_ESPERADO) {
    console.warn(
      `⚠ Nome do clube difere do esperado: "${clube.nome}" (esperado "${CLUBE_NOME_ESPERADO}"). ID bate — prossigo.`,
    );
  }
  const clubeId = clube.id;
  console.log(`✔ Clube: "${clube.nome}" (${clubeId})`);

  // ── 3. Validar TODOS os diagramas ANTES de gravar seja o que for ──────────
  const falhasValidacao: string[] = [];
  let idx = 0;
  for (const b of BATCHES) {
    for (const ex of b.itens) {
      idx += 1;
      const r = diagramaSchema.safeParse(ex.diagrama);
      if (!r.success) {
        const detalhe = r.error.issues
          .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
          .join(" | ");
        falhasValidacao.push(`[${b.nome} #${idx}] "${ex.nome}" → ${detalhe}`);
      }
    }
  }
  if (falhasValidacao.length > 0) {
    console.error(`\n❌ Validação Zod falhou em ${falhasValidacao.length} diagrama(s):`);
    falhasValidacao.forEach((f) => console.error(`   • ${f}`));
    abortar("Diagramas inválidos — nada foi gravado.");
  }
  console.log(`✔ Validação Zod: ${total}/${total} diagramas OK`);

  // ── 4. Contagem ANTES ─────────────────────────────────────────────────────
  const totalAntes = await prisma.exercicio.count({ where: { clubeId } });
  console.log(`ℹ Exercícios no clube ANTES: ${totalAntes}`);

  // ── 5. Inserir (dedupe por nome+clubeId) numa transação ───────────────────
  const inseridos: { batch: string; nome: string }[] = [];
  const saltados: { batch: string; nome: string }[] = [];

  await prisma.$transaction(
    async (tx) => {
    for (const b of BATCHES) {
      for (const ex of b.itens) {
        // Nunca gravar campos internos (_duvida, _ficheiro).
        const {
          _duvida: _omitDuvida,
          _ficheiro: _omitFicheiro,
          diagrama,
          ...campos
        } = ex as typeof ex & { _duvida?: string; _ficheiro?: string };
        void _omitDuvida;
        void _omitFicheiro;

        const jaExiste = await tx.exercicio.findFirst({
          where: { nome: campos.nome, clubeId },
          select: { id: true },
        });
        if (jaExiste) {
          saltados.push({ batch: b.nome, nome: campos.nome });
          continue;
        }

        await tx.exercicio.create({
          data: {
            nome: campos.nome,
            // Opcionais: só gravar quando presentes (undefined → não gravar).
            ...(campos.descricao !== undefined && { descricao: campos.descricao }),
            ...(campos.objetivo !== undefined && { objetivo: campos.objetivo }),
            ...(campos.duracaoMin !== undefined && { duracaoMin: campos.duracaoMin }),
            ...(campos.numeroJogadores !== undefined && {
              numeroJogadores: campos.numeroJogadores,
            }),
            ...(campos.espaco !== undefined && { espaco: campos.espaco }),
            ...(campos.categoriaPrincipal !== undefined && {
              categoriaPrincipal: campos.categoriaPrincipal,
            }),
            ...(campos.parteTreino !== undefined && { parteTreino: campos.parteTreino }),
            ...(campos.modalidade !== undefined && { modalidade: campos.modalidade }),
            diagrama: diagrama as unknown as Prisma.InputJsonValue,
            // Biblioteca pessoal do treinador (dual-write legado + semântico).
            proprietario: "TREINADOR",
            clubeId,
            criadorId: utilizador.id,
            autorId: utilizador.id,
            // Ver nota no topo: false para não partir a idempotência de
            // `instalarBibliotecaArranque` nem marcar como "Curado" indevidamente.
            origemSeed: false,
          },
        });
        inseridos.push({ batch: b.nome, nome: campos.nome });
      }
    }
    },
    // 47 ops sequenciais sobre o pooler do Supabase (connection_limit=1):
    // subir o timeout do default (5s) para não estourar a transação (P2028).
    { timeout: 120_000, maxWait: 20_000 },
  );

  // ── 6. Contagem DEPOIS + relatório ────────────────────────────────────────
  const totalDepois = await prisma.exercicio.count({ where: { clubeId } });

  console.log("\n" + "═".repeat(70));
  console.log("RELATÓRIO");
  console.log("═".repeat(70));
  console.log(`Considerados: ${inseridos.length + saltados.length} (inseridos + saltados)`);
  console.log(`  • Inseridos: ${inseridos.length}`);
  console.log(`  • Saltados : ${saltados.length}`);

  for (const b of BATCHES) {
    const ins = inseridos.filter((x) => x.batch === b.nome).map((x) => x.nome);
    const sal = saltados.filter((x) => x.batch === b.nome).map((x) => x.nome);
    console.log(`\n[${b.nome}] inseridos ${ins.length} / saltados ${sal.length}`);
    ins.forEach((n) => console.log(`   ✔ ${n}`));
    sal.forEach((n) => console.log(`   ↷ (saltado) ${n}`));
  }

  console.log("\n" + "─".repeat(70));
  console.log(`Exercícios no clube: ANTES=${totalAntes}  →  DEPOIS=${totalDepois}  (Δ +${totalDepois - totalAntes})`);
  console.log("─".repeat(70));

  // ── Lista de _duvida (para revisão manual 1 a 1) ──────────────────────────
  const duvidas: { batch: string; nome: string; ficheiro?: string; motivo: string }[] = [];
  for (const b of BATCHES) {
    for (const ex of b.itens) {
      const e = ex as typeof ex & { _duvida?: string; _ficheiro?: string };
      if (e._duvida) {
        duvidas.push({ batch: b.nome, nome: e.nome, ficheiro: e._ficheiro, motivo: e._duvida });
      }
    }
  }
  console.log(`\n⚠ Exercícios com _duvida (rever 1 a 1): ${duvidas.length}`);
  duvidas.forEach((d, i) =>
    console.log(`   ${i + 1}. [${d.batch}] "${d.nome}"${d.ficheiro ? ` (${d.ficheiro})` : ""}\n        → ${d.motivo}`),
  );

  // ── Verificações finais ───────────────────────────────────────────────────
  const considerados = inseridos.length + saltados.length;
  console.log("\n" + "═".repeat(70));
  if (considerados !== 47) {
    abortar(`Esperados 47 considerados, obtidos ${considerados}.`);
  }
  console.log(`✅ 47/47 considerados · Zod ${total}/${total} OK · 0 erros de inserção`);
  console.log("═".repeat(70));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
