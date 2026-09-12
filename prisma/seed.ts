import { PrismaClient, TipoMetrica, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERFIS_ARRANQUE } from "../lib/permissoes-catalogo";
import { BIBLIOTECA_ARRANQUE } from "../lib/biblioteca-arranque";
import { SUBCATEGORIAS_ARRANQUE } from "../lib/subcategorias-arranque";
import { instalarConteudoArranqueFutebol } from "../lib/biblioteca-arranque-futebol";
import { instalarConteudoArranqueGR } from "../lib/biblioteca-arranque-gr";

const prisma = new PrismaClient();

// Em produção o seed NÃO usa password default — falha se não for fornecida,
// para nunca criar contas com credencial pública num ambiente real.
if (process.env.NODE_ENV === "production" && (!process.env.SEED_PASS_GONCALO || !process.env.SEED_PASS_ADJUNTO)) {
  throw new Error(
    "Seed abortado: define SEED_PASS_GONCALO e SEED_PASS_ADJUNTO em produção (sem password default).",
  );
}

// O admin de plataforma NUNCA tem password default (é conta privilegiada de backoffice):
// exige-se SEED_PASS_ADMIN em qualquer ambiente, para nunca criar credencial pública.
if (!process.env.SEED_PASS_ADMIN) {
  throw new Error(
    "Seed abortado: define SEED_PASS_ADMIN (sem password default para o admin de plataforma).",
  );
}

const PASS_GONCALO = process.env.SEED_PASS_GONCALO || "futsal2026";
const PASS_ADJUNTO = process.env.SEED_PASS_ADJUNTO || "futsal2026";
const PASS_ADMIN = process.env.SEED_PASS_ADMIN;
const BCRYPT_COST = 12;

/**
 * Garante — de forma idempotente e APENAS em desenvolvimento — que o clube de
 * demonstração tem uma licença ATIVA (com `dataFim` a 1 ano) e uma carteira
 * associada ao administrador. Sem isto, a guarda de licença (§3.11 / §17) atira
 * o clube semeado para o paywall (/sem-licenca) e trava o desenvolvimento e os
 * testes (chicken-and-egg: não há UI de billing para ativar em local).
 *
 * 🔒 Nunca em produção real: uma licença ATIVA "de borla" só pode existir num
 * ambiente de desenvolvimento. O billing real (Paddle) é a única via legítima de
 * ativar licenças em produção (§17.1/§17.2). Por isso guardamos atrás de
 * NODE_ENV !== "production", à semelhança da proteção de passwords deste seed.
 *
 * Idempotente: usa `upsert` pela chave única do titular (`clubeId` na licença,
 * `utilizadorId` na carteira), pelo que pode correr múltiplas vezes sem duplicar
 * nem falhar — e reativa licenças de bases semeadas antes desta funcionalidade.
 */
async function garantirLicencaDemo(
  clubeId: string,
  adminUtilizadorId: string | null,
): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.log(
      "Licença de demo NÃO semeada (NODE_ENV=production). Ativação apenas via billing real.",
    );
    return;
  }

  // Validade a 1 ano a contar de agora (trial/renovação válidos — ver lib/licenca.ts).
  const dataFim = new Date();
  dataFim.setFullYear(dataFim.getFullYear() + 1);

  await prisma.licenca.upsert({
    where: { clubeId },
    update: { estado: "ATIVA", dataFim },
    create: {
      tipo: "CLUBE",
      tier: "MEDIO",
      estado: "ATIVA",
      ciclo: "MENSAL",
      clubeId,
      dataFim,
    },
  });

  // Carteira (wallet) do administrador do clube-demo. Modelada por utilizador, não
  // por clube; só a criamos se o admin existir. Saldo zero (sem crédito de arranque).
  if (adminUtilizadorId) {
    await prisma.carteira.upsert({
      where: { utilizadorId: adminUtilizadorId },
      update: {},
      create: { utilizadorId: adminUtilizadorId, saldoCentimos: 0 },
    });
  }

  console.log("Licença de demonstração ATIVA garantida (dev-only) + carteira do admin.");
}

async function main() {
  // Utilizador admin de plataforma (backoffice /admin via `Utilizador.isAdmin`
  // na BD, independente de qualquer papel de clube). Upsert idempotente: corre
  // sempre, mesmo quando o restante seed do clube já foi aplicado — e garante o
  // flag `isAdmin` mesmo em bases já semeadas antes deste campo existir.
  await prisma.utilizador.upsert({
    where: { email: "admin@mister.app" },
    update: { isAdmin: true },
    create: {
      nome: "Admin",
      email: "admin@mister.app",
      passwordHash: await bcrypt.hash(PASS_ADMIN, BCRYPT_COST),
      isAdmin: true,
    },
  });
  console.log("Admin de plataforma pronto: admin@mister.app");

  const jaExiste = await prisma.clube.findFirst({
    where: { nome: "Juventude Sport Clube" },
  });
  if (jaExiste) {
    // Mesmo com o clube já semeado, garante (dev-only, idempotente) a licença
    // ATIVA + carteira de demonstração. Desbloqueia bases semeadas ANTES desta
    // funcionalidade existir, que de outro modo ficariam presas no paywall.
    const goncaloExistente = await prisma.utilizador.findUnique({
      where: { email: "goncalo@jsc.pt" },
      select: { id: true },
    });
    await garantirLicencaDemo(jaExiste.id, goncaloExistente?.id ?? null);

    // §8.24 — conteúdo de arranque de GR. Instalado também no caminho de
    // re-run (clube já semeado) para que bases criadas antes desta funcionalidade
    // recebam as subcategorias/métricas/templates de guarda-redes.
    const gr = await instalarConteudoArranqueGR(jaExiste.id, prisma);
    console.log(
      `GR (§8.24): ${gr.subcategorias} subcategorias, ${gr.metricas} métricas, ${gr.templates} templates.`,
    );

    console.log("Seed já aplicado (clube existente). A sair.");
    return;
  }

  // 1. Clube
  const clube = await prisma.clube.create({
    data: {
      nome: "Juventude Sport Clube",
      corPrimaria: "#1A2FD4",
      corSecundaria: "#FFD700",
      // Clube-demo é um clube estabelecido (já tem época/plantel): salta o
      // assistente de onboarding (F10). Sem isto, a guarda de licença atira-o
      // para /onboarding em loop. Alinha com seed-teste.ts e seeds de dados.
      onboardingConcluido: true,
    },
  });

  // 2. Perfis de arranque (editáveis) — secção 6.5
  const perfis: Record<string, string> = {};
  for (const p of PERFIS_ARRANQUE) {
    const criado = await prisma.perfil.create({
      data: {
        clubeId: clube.id,
        nome: p.nome,
        descricao: p.descricao,
        ambito: p.ambito,
        capacidades: p.capacidades,
        sistema: true,
      },
    });
    perfis[p.nome] = criado.id;
  }

  // 3. Época ativa
  await prisma.epoca.create({
    data: {
      nome: "2025/26",
      dataInicio: new Date("2025-09-01"),
      dataFim: new Date("2026-06-30"),
      ativa: true,
      clubeId: clube.id,
    },
  });

  // 4. Escalões
  const traquinas = await prisma.escalao.create({
    data: { nome: "Traquinas", idadeMin: 6, idadeMax: 8, ordem: 0, clubeId: clube.id },
  });
  const benjamins = await prisma.escalao.create({
    data: { nome: "Benjamins", idadeMin: 9, idadeMax: 10, ordem: 1, clubeId: clube.id },
  });

  // 5. Utilizadores + adesões (membros)
  const goncalo = await prisma.utilizador.create({
    data: {
      nome: "Gonçalo Pereira",
      email: "goncalo@jsc.pt",
      passwordHash: await bcrypt.hash(PASS_GONCALO, BCRYPT_COST),
    },
  });
  const adjunto = await prisma.utilizador.create({
    data: {
      nome: "Treinador Adjunto",
      email: "adjunto@jsc.pt",
      passwordHash: await bcrypt.hash(PASS_ADJUNTO, BCRYPT_COST),
    },
  });

  // Gonçalo = Administrador (âmbito todo o clube)
  await prisma.membroClube.create({
    data: {
      utilizadorId: goncalo.id,
      clubeId: clube.id,
      perfilId: perfis["Administrador"],
      estado: "ATIVO",
    },
  });
  // Adjunto = perfil Adjunto, atribuído aos Benjamins
  await prisma.membroClube.create({
    data: {
      utilizadorId: adjunto.id,
      clubeId: clube.id,
      perfilId: perfis["Adjunto"],
      estado: "ATIVO",
      atribuicoes: { create: [{ escalaoId: benjamins.id }] },
    },
  });

  // 5.1 Licença ATIVA de demonstração + carteira (dev-only, idempotente).
  // Necessária para o clube-demo passar a guarda de licença (§3.11/§17) e entrar
  // na app sem cair no paywall. Nunca é semeada em produção (ver garantirLicencaDemo).
  await garantirLicencaDemo(clube.id, goncalo.id);

  // 6. Métricas configuráveis exemplo
  await prisma.metricaConfig.createMany({
    data: [
      { nome: "Dribles completados", tipo: TipoMetrica.NUMERO, ordem: 0, clubeId: clube.id },
      { nome: "1x1 ganhos", tipo: TipoMetrica.NUMERO, ordem: 1, clubeId: clube.id },
      { nome: "Atitude", tipo: TipoMetrica.ESCALA, ordem: 2, clubeId: clube.id },
    ],
  });

  // Silenciar "declarado mas não usado" (traquinas fica disponível para futuros dados)
  void traquinas;

  // 8. Subcategorias de exercícios (predefinições do sistema)
  await prisma.subcategoriaExercicio.createMany({
    data: SUBCATEGORIAS_ARRANQUE.map((s) => ({
      nome: s.nome,
      categoria: s.categoria,
      ordem: s.ordem,
      clubeId: clube.id,
      sistema: true,
    })),
  });

  // 9. Biblioteca de exercícios curada de arranque (Fase 9)
  await prisma.exercicio.createMany({
    data: BIBLIOTECA_ARRANQUE.map((e) => ({
      nome: e.nome,
      descricao: e.descricao,
      objetivo: e.objetivo,
      duracaoMin: e.duracaoMin,
      categoriaPrincipal: e.categoriaPrincipal,
      diagrama: e.diagrama as unknown as Prisma.InputJsonValue,
      clubeId: clube.id,
      criadorId: goncalo.id,
      proprietario: "CLUBE",
      origemSeed: true,
    })),
  });

  // 10. Secção de FUTEBOL de demonstração (Fase 29) — conteúdo curado instalado.
  // Cria uma secção FUTEBOL com um escalão e instala a biblioteca curada de
  // futebol (subcategorias, exercícios e templates), para que a
  // secção de futebol nunca comece vazia (§16 Fase 29, Apêndice B).
  const seccaoFutebol = await prisma.seccao.create({
    data: { clubeId: clube.id, modalidade: "FUTEBOL", nome: "Futebol" },
  });
  await prisma.escalao.create({
    data: {
      nome: "Sub-15 (Futebol)",
      idadeMin: 13,
      idadeMax: 15,
      ordem: 2,
      clubeId: clube.id,
      seccaoId: seccaoFutebol.id,
    },
  });
  const resumoFutebol = await instalarConteudoArranqueFutebol(clube.id, prisma);

  // 11. Conteúdo de arranque de Guarda-Redes (§8.24) — subcategorias de exercício,
  // métricas técnicas (escala 1–5, contexto TREINO) e templates de sessão de GR.
  // Idempotente (só cria o que falta).
  const resumoGR = await instalarConteudoArranqueGR(clube.id, prisma);

  console.log("Seed concluído.");
  console.log(
    `Futebol instalado: ${resumoFutebol.subcategorias} subcategorias, ${resumoFutebol.exercicios} exercícios, ${resumoFutebol.templates} templates.`,
  );
  console.log(
    `GR (§8.24) instalado: ${resumoGR.subcategorias} subcategorias, ${resumoGR.metricas} métricas, ${resumoGR.templates} templates.`,
  );
  console.log("Login inicial:");
  console.log(`  goncalo@jsc.pt / ${PASS_GONCALO}  (Administrador)`);
  console.log(`  adjunto@jsc.pt / ${PASS_ADJUNTO}  (Adjunto — Benjamins)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
