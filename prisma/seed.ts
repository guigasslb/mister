import { PrismaClient, TipoMetrica, NivelHabilidade, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERFIS_ARRANQUE } from "../lib/permissoes-catalogo";
import { BIBLIOTECA_ARRANQUE } from "../lib/biblioteca-arranque";
import { SUBCATEGORIAS_ARRANQUE } from "../lib/subcategorias-arranque";
import { instalarConteudoArranqueFutebol } from "../lib/biblioteca-arranque-futebol";

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

async function main() {
  // Utilizador admin de plataforma (backoffice /admin via allowlist ADMIN_EMAILS,
  // independente de qualquer papel de clube). Upsert idempotente: corre sempre,
  // mesmo quando o restante seed do clube já foi aplicado.
  await prisma.utilizador.upsert({
    where: { email: "admin@mister.app" },
    update: {},
    create: {
      nome: "Admin",
      email: "admin@mister.app",
      passwordHash: await bcrypt.hash(PASS_ADMIN, BCRYPT_COST),
    },
  });
  console.log("Admin de plataforma pronto: admin@mister.app");

  const jaExiste = await prisma.clube.findFirst({
    where: { nome: "Juventude Sport Clube" },
  });
  if (jaExiste) {
    console.log("Seed já aplicado (clube existente). A sair.");
    return;
  }

  // 1. Clube
  const clube = await prisma.clube.create({
    data: {
      nome: "Juventude Sport Clube",
      corPrimaria: "#1A2FD4",
      corSecundaria: "#FFD700",
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

  // 6. Métricas configuráveis exemplo
  await prisma.metricaConfig.createMany({
    data: [
      { nome: "Dribles completados", tipo: TipoMetrica.NUMERO, ordem: 0, clubeId: clube.id },
      { nome: "1x1 ganhos", tipo: TipoMetrica.NUMERO, ordem: 1, clubeId: clube.id },
      { nome: "Atitude", tipo: TipoMetrica.ESCALA, ordem: 2, clubeId: clube.id },
    ],
  });

  // 7. Habilidades exemplo por nível
  await prisma.habilidade.createMany({
    data: [
      { nome: "Rolo", nivel: NivelHabilidade.BASICO, ordem: 0, clubeId: clube.id },
      { nome: "Corta", nivel: NivelHabilidade.BASICO, ordem: 1, clubeId: clube.id },
      { nome: "Vírgula", nivel: NivelHabilidade.INTERMEDIO, ordem: 0, clubeId: clube.id },
      { nome: "Flip-flap", nivel: NivelHabilidade.INTERMEDIO, ordem: 1, clubeId: clube.id },
      { nome: "Elástico", nivel: NivelHabilidade.AVANCADO, ordem: 0, clubeId: clube.id },
      { nome: "Chapéu", nivel: NivelHabilidade.AVANCADO, ordem: 1, clubeId: clube.id },
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
  // futebol (subcategorias, exercícios, templates e habilidades), para que a
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

  console.log("Seed concluído.");
  console.log(
    `Futebol instalado: ${resumoFutebol.subcategorias} subcategorias, ${resumoFutebol.exercicios} exercícios, ${resumoFutebol.templates} templates, ${resumoFutebol.habilidades} habilidades.`,
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
