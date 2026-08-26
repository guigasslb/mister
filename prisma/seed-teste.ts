/**
 * Seed de TESTE de personas em runtime (sandbox local).
 *
 * Cria 5 contas prontas a usar, cada clube com uma licença ATIVA (não PENDENTE),
 * para que o paywall (/sem-licenca) não bloqueie o acesso durante os testes.
 *
 * NÃO substitui o seed principal (prisma/seed.ts). É idempotente: se já existir
 * a conta-marcador (solo.miudos@teste.pt), sai sem alterar nada.
 *
 * Correr:  npx tsx prisma/seed-teste.ts
 * (usa DATABASE_URL/DIRECT_URL do ambiente — no sandbox, a BD local.)
 */
import { PrismaClient, Posicao, Modalidade } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERFIS_ARRANQUE } from "../lib/permissoes-catalogo";

const prisma = new PrismaClient();

const PASSWORD = "Mister#2026!";
const BCRYPT_COST = 12;

/** Cria os perfis de arranque de um clube; devolve mapa nome→id. */
async function criarPerfis(clubeId: string): Promise<Record<string, string>> {
  const perfis: Record<string, string> = {};
  for (const p of PERFIS_ARRANQUE) {
    const criado = await prisma.perfil.create({
      data: {
        clubeId,
        nome: p.nome,
        descricao: p.descricao,
        ambito: p.ambito,
        capacidades: p.capacidades,
        sistema: true,
      },
    });
    perfis[p.nome] = criado.id;
  }
  return perfis;
}

/** Licença ATIVA a 365 dias, presa ao clube (o guard resolve por clubeId). */
async function criarLicencaAtiva(
  clubeId: string,
  tipo: "INDIVIDUAL" | "CLUBE",
  tier: "PEQUENO" | "MEDIO" | "GRANDE" | null,
  modalidade: Modalidade | null,
) {
  const agora = new Date();
  const dataFim = new Date(agora.getTime() + 365 * 24 * 60 * 60 * 1000);
  await prisma.licenca.create({
    data: {
      tipo,
      tier: tipo === "CLUBE" ? tier : null,
      estado: "ATIVA",
      ciclo: "MENSAL",
      modalidade: tipo === "INDIVIDUAL" ? modalidade : null,
      clubeId,
      dataInicio: agora,
      dataFim,
    },
  });
}

/** Época ativa 2025/26 para um clube. */
async function criarEpoca(clubeId: string) {
  return prisma.epoca.create({
    data: {
      clubeId,
      nome: "2025/26",
      dataInicio: new Date("2025-09-01"),
      dataFim: new Date("2026-06-30"),
      ativa: true,
    },
  });
}

const NOMES_ATLETAS = [
  "Rui Almeida",
  "Tiago Sousa",
  "Diogo Martins",
  "André Ferreira",
  "Miguel Costa",
  "João Rocha",
  "Pedro Nunes",
  "Bruno Carvalho",
];

/** Cria N atletas realistas no clube e devolve os ids. */
async function criarAtletas(clubeId: string, n: number, anoBase: number): Promise<string[]> {
  const posicoesPool: Posicao[][] = [
    [Posicao.GUARDA_REDES],
    [Posicao.FIXO],
    [Posicao.ALA],
    [Posicao.ALA, Posicao.PIVO],
    [Posicao.PIVO],
    [Posicao.UNIVERSAL],
    [Posicao.FIXO, Posicao.ALA],
    [Posicao.ALA],
  ];
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = await prisma.atleta.create({
      data: {
        nome: NOMES_ATLETAS[i % NOMES_ATLETAS.length],
        clubeId,
        numero: i + 1,
        posicoes: posicoesPool[i % posicoesPool.length],
        dataNascimento: new Date(anoBase - i, (i * 3) % 12, ((i * 7) % 27) + 1),
        dataIngresso: new Date("2025-09-01"),
        ativo: true,
      },
    });
    ids.push(a.id);
  }
  return ids;
}

/** Liga atletas a um escalão numa época (participações). */
async function ligarAtletasAoEscalao(
  atletaIds: string[],
  escalaoId: string,
  epocaId: string,
) {
  for (let i = 0; i < atletaIds.length; i++) {
    await prisma.atletaEscalao.create({
      data: {
        atletaId: atletaIds[i],
        escalaoId,
        epocaId,
        tipo: "PRINCIPAL",
        estado: "ATIVO",
        numero: i + 1,
      },
    });
  }
}

/** Cria 2 treinos + 1 jogo para um escalão/época, autor = criadorId. */
async function criarAtividades(
  escalaoId: string,
  epocaId: string,
  criadorId: string,
  adversario: string,
) {
  await prisma.sessao.create({
    data: {
      data: new Date("2026-08-24T19:00:00"),
      duracaoMin: 90,
      objetivo: "Posse de bola e transições rápidas.",
      local: "Pavilhão Municipal",
      escalaoId,
      epocaId,
      criadorId,
      tipoSessao: "NORMAL",
    },
  });
  await prisma.sessao.create({
    data: {
      data: new Date("2026-08-26T19:00:00"),
      duracaoMin: 90,
      objetivo: "Finalização e bolas paradas.",
      local: "Pavilhão Municipal",
      escalaoId,
      epocaId,
      criadorId,
      tipoSessao: "NORMAL",
    },
  });
  await prisma.jogo.create({
    data: {
      data: new Date("2026-08-30T17:00:00"),
      adversario,
      casaFora: "CASA",
      tipo: "OFICIAL",
      local: "Pavilhão Municipal",
      escalaoId,
      epocaId,
      criadorId,
    },
  });
}

async function main() {
  const marcador = await prisma.utilizador.findUnique({
    where: { email: "solo.miudos@teste.pt" },
  });
  if (marcador) {
    console.log("Seed de teste já aplicado (solo.miudos@teste.pt existe). A sair.");
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, BCRYPT_COST);

  // ───────────────────────────────────────────────────────────
  // 1) solo.miudos@teste.pt — Atlético dos Miúdos (futsal, formação) — INDIVIDUAL
  // ───────────────────────────────────────────────────────────
  {
    const clube = await prisma.clube.create({
      data: { nome: "Atlético dos Miúdos", corPrimaria: "#2E7D32", corSecundaria: "#FFD700", onboardingConcluido: true },
    });
    const perfis = await criarPerfis(clube.id);
    const epoca = await criarEpoca(clube.id);
    const seccao = await prisma.seccao.create({
      data: { clubeId: clube.id, modalidade: "FUTSAL", nome: "Futsal" },
    });
    const escalao = await prisma.escalao.create({
      data: { clubeId: clube.id, seccaoId: seccao.id, nome: "Benjamins", idadeMin: 9, idadeMax: 10, ordem: 0 },
    });
    const user = await prisma.utilizador.create({
      data: { nome: "Sofia (Treinadora Solo)", email: "solo.miudos@teste.pt", passwordHash: hash },
    });
    await prisma.membroClube.create({
      data: { utilizadorId: user.id, clubeId: clube.id, perfilId: perfis["Administrador"], estado: "ATIVO" },
    });
    const atletas = await criarAtletas(clube.id, 6, 2016);
    await ligarAtletasAoEscalao(atletas, escalao.id, epoca.id);
    await criarAtividades(escalao.id, epoca.id, user.id, "Escolinha do Bairro");
    await criarLicencaAtiva(clube.id, "INDIVIDUAL", null, "FUTSAL");
  }

  // ───────────────────────────────────────────────────────────
  // 2) solo.seniores@teste.pt — FC Independente (futsal seniores) — INDIVIDUAL
  // ───────────────────────────────────────────────────────────
  {
    const clube = await prisma.clube.create({
      data: { nome: "FC Independente", corPrimaria: "#0D47A1", corSecundaria: "#FFFFFF", onboardingConcluido: true },
    });
    const perfis = await criarPerfis(clube.id);
    const epoca = await criarEpoca(clube.id);
    const seccao = await prisma.seccao.create({
      data: { clubeId: clube.id, modalidade: "FUTSAL", nome: "Futsal" },
    });
    const escalao = await prisma.escalao.create({
      data: { clubeId: clube.id, seccaoId: seccao.id, nome: "Seniores", ordem: 0 },
    });
    const user = await prisma.utilizador.create({
      data: { nome: "Ricardo (Treinador Solo)", email: "solo.seniores@teste.pt", passwordHash: hash },
    });
    await prisma.membroClube.create({
      data: { utilizadorId: user.id, clubeId: clube.id, perfilId: perfis["Administrador"], estado: "ATIVO" },
    });
    const atletas = await criarAtletas(clube.id, 7, 1998);
    await ligarAtletasAoEscalao(atletas, escalao.id, epoca.id);
    await criarAtividades(escalao.id, epoca.id, user.id, "GD Vizinhança");
    await criarLicencaAtiva(clube.id, "INDIVIDUAL", null, "FUTSAL");
  }

  // ───────────────────────────────────────────────────────────
  // 3-5) SC Estrela (futsal + futebol) — CLUBE, 3 membros
  //   clube.seniores@teste.pt  → Administrador (treinador)
  //   diretor@estrela.pt       → Diretor Técnico (treinador)
  //   presidente@estrela.pt    → Presidente (visualização, só RELATORIOS_VER)
  // ───────────────────────────────────────────────────────────
  {
    const clube = await prisma.clube.create({
      data: { nome: "SC Estrela", corPrimaria: "#B71C1C", corSecundaria: "#FFC107", onboardingConcluido: true },
    });
    const perfis = await criarPerfis(clube.id);
    // Perfil de visualização (não existe nos perfis de arranque): só ver relatórios.
    const perfilPresidente = await prisma.perfil.create({
      data: {
        clubeId: clube.id,
        nome: "Presidente (Visualização)",
        descricao: "Acesso de leitura: consulta de relatórios do clube.",
        ambito: "TODO_CLUBE",
        capacidades: ["RELATORIOS_VER"],
        sistema: false,
      },
    });
    const epoca = await criarEpoca(clube.id);

    // Secção de FUTSAL + escalão
    const seccaoFutsal = await prisma.seccao.create({
      data: { clubeId: clube.id, modalidade: "FUTSAL", nome: "Futsal" },
    });
    const escalaoFutsal = await prisma.escalao.create({
      data: { clubeId: clube.id, seccaoId: seccaoFutsal.id, nome: "Seniores Futsal", ordem: 0 },
    });
    // Secção de FUTEBOL + escalão
    const seccaoFutebol = await prisma.seccao.create({
      data: { clubeId: clube.id, modalidade: "FUTEBOL", nome: "Futebol" },
    });
    const escalaoFutebol = await prisma.escalao.create({
      data: { clubeId: clube.id, seccaoId: seccaoFutebol.id, nome: "Sub-15 Futebol", idadeMin: 13, idadeMax: 15, ordem: 1 },
    });

    // Membros
    const admin = await prisma.utilizador.create({
      data: { nome: "Carlos (Treinador Principal)", email: "clube.seniores@teste.pt", passwordHash: hash },
    });
    const diretor = await prisma.utilizador.create({
      data: { nome: "Helena (Diretora Técnica)", email: "diretor@estrela.pt", passwordHash: hash },
    });
    const presidente = await prisma.utilizador.create({
      data: { nome: "Manuel (Presidente)", email: "presidente@estrela.pt", passwordHash: hash },
    });

    await prisma.membroClube.create({
      data: { utilizadorId: admin.id, clubeId: clube.id, perfilId: perfis["Administrador"], estado: "ATIVO" },
    });
    await prisma.membroClube.create({
      data: { utilizadorId: diretor.id, clubeId: clube.id, perfilId: perfis["Diretor Técnico"], estado: "ATIVO" },
    });
    await prisma.membroClube.create({
      data: { utilizadorId: presidente.id, clubeId: clube.id, perfilId: perfilPresidente.id, estado: "ATIVO" },
    });

    // Dados de futsal
    const atletasFutsal = await criarAtletas(clube.id, 8, 2001);
    await ligarAtletasAoEscalao(atletasFutsal, escalaoFutsal.id, epoca.id);
    await criarAtividades(escalaoFutsal.id, epoca.id, admin.id, "AD Rival Futsal");

    // Dados de futebol (menos atletas, um jovem escalão)
    const atletasFutebol = await criarAtletas(clube.id, 5, 2011);
    await ligarAtletasAoEscalao(atletasFutebol, escalaoFutebol.id, epoca.id);
    await criarAtividades(escalaoFutebol.id, epoca.id, diretor.id, "Academia Rival FC");

    await criarLicencaAtiva(clube.id, "CLUBE", "MEDIO", null);
  }

  console.log("Seed de teste concluído. Contas (password para todas: " + PASSWORD + "):");
  console.log("  solo.miudos@teste.pt      — Atlético dos Miúdos (INDIVIDUAL, futsal) — Admin");
  console.log("  solo.seniores@teste.pt    — FC Independente (INDIVIDUAL, futsal) — Admin");
  console.log("  clube.seniores@teste.pt   — SC Estrela (CLUBE, futsal+futebol) — Admin");
  console.log("  diretor@estrela.pt        — SC Estrela — Diretor Técnico");
  console.log("  presidente@estrela.pt     — SC Estrela — Presidente (visualização)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
