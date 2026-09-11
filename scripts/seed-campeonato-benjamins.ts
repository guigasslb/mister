/**
 * Seed do campeonato de Benjamins. Email do utilizador via env SEED_USER_EMAIL.
 *
 * ESCREVE NA BD. Cria os 20 jogos de campeonato (modelo `Jogo`) do escalão
 * Benjamins do clube do utilizador, na sua época ativa.
 *
 * Resolução do destino (tudo derivado do email, nada hardcoded):
 *   1. Utilizador  ← email
 *   2. Clube       ← MembroClube ATIVO do utilizador
 *   3. Escalão     ← escalão do clube cujo nome COMEÇA por "benjamins"
 *                    (case-insensitive; cobre "Benjamins", "Benjamins A", etc.)
 *   4. Época       ← época ativa do clube
 *
 * IDEMPOTENTE: antes de criar cada jogo verifica se já existe um jogo do mesmo
 * escalão/época, com o mesmo adversário e no mesmo dia. Correr 2x não duplica.
 *
 * Correr a partir de /futsal-manager:
 *   npm run seed:campeonato-benjamins
 */
import "dotenv/config";
import { PrismaClient, CasaFora, TipoJogo, type FormatoJogo } from "@prisma/client";

const prisma = new PrismaClient();

const EMAIL_ALVO = process.env.SEED_USER_EMAIL ?? "";
const HORA_JOGO_UTC = "10:00:00.000Z"; // hora convencional (dados de calendário sem hora)

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

async function main() {
  // 1. Utilizador pelo email.
  const utilizador = await prisma.utilizador.findUnique({
    where: { email: EMAIL_ALVO },
    select: { id: true, nome: true },
  });
  if (!utilizador) {
    throw new Error(`Utilizador não encontrado para o email "${EMAIL_ALVO}".`);
  }

  // 2. Clube via adesão ATIVA (MembroClube). Regra: no máximo uma adesão ATIVA.
  const membro = await prisma.membroClube.findFirst({
    where: { utilizadorId: utilizador.id, estado: "ATIVO" },
    select: { clubeId: true, clube: { select: { nome: true } } },
  });
  if (!membro) {
    throw new Error(
      `Nenhuma adesão de clube ATIVA encontrada para "${EMAIL_ALVO}" (utilizador ${utilizador.id}).`,
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
    const disponiveis = escaloes.map((e) => `"${e.nome}"`).join(", ") || "(nenhum)";
    throw new Error(
      `Escalão "Benjamins" não encontrado no clube "${nomeClube}". Escalões existentes: ${disponiveis}.`,
    );
  }

  // 4. Época ativa do clube.
  const epoca = await prisma.epoca.findFirst({
    where: { clubeId, ativa: true },
    select: { id: true, nome: true },
  });
  if (!epoca) {
    throw new Error(`Nenhuma época ativa encontrada no clube "${nomeClube}".`);
  }

  // Formato do jogo (§3.7): FUTSAL → FUTSAL_5; para futebol não há default único,
  // por isso fica null (campo é opcional no schema; o editor deriva depois).
  const formato: FormatoJogo | null =
    escalao.seccao?.modalidade === "FUTSAL" ? "FUTSAL_5" : null;

  console.log(
    `Destino: utilizador "${utilizador.nome}" · clube "${nomeClube}" · ` +
      `escalão "${escalao.nome}" · época "${epoca.nome}".`,
  );

  // 5. Criar jogos (idempotente: dedupe por escalão/época + adversário + dia).
  let criados = 0;
  let existiam = 0;

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
      existiam++;
      console.log(`  = já existe: ${j.data} vs ${j.adversario} (${j.local})`);
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
    console.log(`  + criado: ${j.data} vs ${j.adversario} (${j.local})`);
  }

  console.log("");
  console.log("✅ Concluído.");
  console.log(`   Jogos criados:    ${criados}`);
  console.log(`   Já existiam:      ${existiam}`);
  console.log(`   Total no plano:   ${jogos.length}`);
}

main()
  .catch((e) => {
    console.error("❌ Erro:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
