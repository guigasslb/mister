// prisma/seed-sub11.ts
// Cria 4 exercícios reutilizáveis (biblioteca pessoal) + sessão de treino 2026-08-24.
// Idempotente: re-executável sem duplicados.
// Ligação: usa DIRECT_URL (port 5432) para contornar limitações de rede do pooler.

import { PrismaClient, Prisma } from "@prisma/client";
import type { CategoriaExercicioPrincipal, ParteTreino } from "@prisma/client";
import { construirSnapshotExercicio } from "../lib/snapshot-exercicio";

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL ou DIRECT_URL não definida.");

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const EMAIL_ALVO = process.env.SEED_EMAIL || "goncalo.pereira.1992@gmail.com";
const DATA_SESSAO = new Date("2026-08-24T10:00:00");
const TITULO_SESSAO = "Sub-11 — Condução, jogo reduzido e finalização";
const ESCALAO_ALVO = "Sub-11";

type Elemento = Record<string, unknown>;
const j = (id: string, x: number, y: number, cor: "azul" | "vermelho" | "amarelo" | "verde", n?: number): Elemento =>
  ({ id, tipo: "jogador", x, y, cor, ...(n != null ? { numero: n } : {}) });
const bola = (id: string, x: number, y: number): Elemento => ({ id, tipo: "bola", x, y });
const cone = (id: string, x: number, y: number): Elemento => ({ id, tipo: "cone", x, y });
const baliza = (id: string, x: number, y: number, o: "horizontal" | "vertical"): Elemento =>
  ({ id, tipo: "baliza", x, y, orientacao: o });
const seta = (id: string, estilo: "movimento" | "passe" | "conducao", pontos: { x: number; y: number }[]): Elemento =>
  ({ id, tipo: "seta", estilo, cor: "#1A1D29", pontos });
const texto = (id: string, x: number, y: number, conteudo: string): Elemento =>
  ({ id, tipo: "texto", x, y, conteudo });
const diagrama = (elementos: Elemento[]) => ({ versao: 1 as const, elementos });

function descricao(s: {
  organizacao: string; descricao: string; material: string; grupo: string;
  varianteFacil: string; varianteDificil: string; criterios: string;
  coaching: string; descoberta: string; extra?: string;
}): string {
  return [
    `Organização: ${s.organizacao}`, ``,
    s.descricao, ``,
    `Material: ${s.material}`,
    `Grupo sugerido: ${s.grupo}`, ``,
    `Variante fácil: ${s.varianteFacil}`,
    `Variante difícil: ${s.varianteDificil}`, ``,
    `Critérios de êxito: ${s.criterios}`,
    `Coaching points: ${s.coaching}`,
    `Descoberta guiada: "${s.descoberta}"`,
    ...(s.extra ? [``, s.extra] : []),
  ].join("\n");
}

interface ExDef {
  nome: string;
  categoriaPrincipal: CategoriaExercicioPrincipal;
  parteTreino: ParteTreino;
  duracaoMin: number;
  objetivo: string;
  descricao: string;
  diagrama: ReturnType<typeof diagrama>;
  notaSessao: string;
}

const EXERCICIOS: ExDef[] = [
  {
    nome: "Condução em superfícies (sola, parte de fora, pé contrário)",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "AQUECIMENTO",
    duracaoMin: 10,
    objetivo: "Máximo de contactos, controlo de superfícies e ambidestria.",
    descricao: descricao({
      organizacao: "Espaço delimitado; todos conduzem livremente ao mesmo tempo.",
      descricao: "Muda-se a superfície de contacto por blocos ao apito — sola (rolar/puxar), parte de fora do pé, pé contrário. Intercalar comandos de 'trava a bola no JÁ'.",
      material: "1 bola por atleta, cones.",
      grupo: "8-14 atletas",
      varianteFacil: "Espaço maior, ritmo lento.",
      varianteDificil: "Travar com a sola do pé contrário; conduzir de cabeça levantada a \"ler\" números do treinador.",
      criterios: "Bola perto do pé; conseguem usar o pé menos hábil.",
      coaching: "Toques suaves e frequentes, cabeça a subir de vez em quando.",
      descoberta: "Porque treinamos logo o pé mais difícil?",
      extra: "Plano B (sem bola para todos): pares — um conduz / um sombra-defensor leve, troca aos 30s.",
    }),
    diagrama: diagrama([
      cone("c1", 40, 30), cone("c2", 360, 30), cone("c3", 40, 170), cone("c4", 360, 170),
      j("a1", 90, 70, "azul", 1), bola("b1", 102, 72),
      j("a2", 180, 120, "azul", 2), bola("b2", 192, 122),
      j("a3", 280, 80, "azul", 3), bola("b3", 292, 82),
      seta("s1", "conducao", [{ x: 102, y: 72 }, { x: 160, y: 60 }, { x: 220, y: 90 }]),
      texto("t1", 85, 15, "Ao apito: sola → parte de fora → pé contrário"),
    ]),
    notaSessao: "Blocos de 60-90s por superfície ao apito; intercalar \"trava no JÁ\".",
  },
  {
    nome: "Jogos reduzidos 2x2 (evolui para 3x3)",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "PRINCIPAL",
    duracaoMin: 12,
    objetivo: "Contacto máximo com bola, atacar/defender, procurar o colega.",
    descricao: descricao({
      organizacao: "Vários campos pequenos consoante o número; rodar atletas entre campos a cada 5-6 min.",
      descricao: "Manter a posse (X passes = ponto) ou marcar em mini-baliza. Começa em 2x2 (envolvimento máximo) e evolui para 3x3 (introduz apoio/terceiro homem).",
      material: "Coletes, cones, mini-balizas (opcional).",
      grupo: "4-6 por campo (multiplicar campos)",
      varianteFacil: "Campo maior, só posse.",
      varianteDificil: "Campo curto, limite de 2 toques.",
      criterios: "Afastam-se para receber; alta frequência de toques.",
      coaching: "Abrir para receber, olhar antes de passar.",
      descoberta: "Colado ao colega, o adversário defende os dois de uma vez?",
    }),
    diagrama: diagrama([
      cone("c1", 80, 50), cone("c2", 280, 50), cone("c3", 80, 150), cone("c4", 280, 150),
      j("a1", 120, 80, "azul", 1), j("a2", 120, 130, "azul", 2),
      j("d1", 240, 80, "vermelho", 1), j("d2", 240, 130, "vermelho", 2),
      bola("b1", 188, 100),
      seta("s1", "passe", [{ x: 188, y: 100 }, { x: 122, y: 128 }]),
      texto("t1", 90, 15, "2x2 → 3x3; X passes = ponto ou mini-baliza"),
    ]),
    notaSessao: "Começar 2x2; evoluir para 3x3 após 5-6 min; rodar entre campos.",
  },
  {
    nome: "Jogo formal em campo inteiro",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "JOGO_REDUZIDO",
    duracaoMin: 12,
    objetivo: "Jogar a sério, transições, ocupação do espaço em contexto real.",
    descricao: descricao({
      organizacao: "5x5 com GR (ou o mais próximo); campo inteiro. Rotação total de posições a cada 3 min, GR incluído.",
      descricao: "Jogo livre. Treinador intervém pouco; manter a jogar. Rotação de posições garante que todos passam pelo GR e por posições de campo.",
      material: "Balizas, coletes por cor.",
      grupo: "~10+ (abaixo disso, preferir jogos reduzidos)",
      varianteFacil: "Menos de 10 atletas → mais jogos reduzidos em vez do campo inteiro.",
      varianteDificil: "Golo após 3 passes vale a dobrar.",
      criterios: "Todos passaram por várias posições; todos tocaram na bola.",
      coaching: "Espalhar pelo campo, procurar o colega livre.",
      descoberta: "Quando estamos todos juntos na bola, sobra espaço para jogar?",
      extra: "Requisito de espaço: precisa de campo inteiro; agendar enquanto o pavilhão todo está disponível.",
    }),
    diagrama: diagrama([
      baliza("g1", 395, 100, "vertical"), j("gr1", 372, 100, "vermelho"),
      baliza("g2", 5, 100, "vertical"), j("gr2", 28, 100, "azul"),
      j("a1", 120, 70, "azul", 1), j("a2", 120, 130, "azul", 2), j("a3", 180, 100, "azul", 3),
      j("d1", 280, 70, "vermelho", 1), j("d2", 280, 130, "vermelho", 2), j("d3", 220, 100, "vermelho", 3),
      bola("b1", 200, 100),
      texto("t1", 110, 15, "5x5 campo inteiro; rodar posições a cada 3 min"),
    ]),
    notaSessao: "Jogo livre; mínima intervenção; rodar GR a cada 3 min.",
  },
  {
    nome: "Penáltis em 2 estações",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "JOGO_REDUZIDO",
    duracaoMin: 7,
    objetivo: "Finalização com intenção e fecho emocional divertido, sem filas paradas.",
    descricao: descricao({
      organizacao: "2 estações a rematar ao mesmo tempo; GR com rotação rápida. Quem espera faz mobilidade leve.",
      descricao: "Remate a partir do ponto de penálti. Manter curto e festivo.",
      material: "2 mini-balizas ou balizas, bolas.",
      grupo: "8-14 atletas",
      varianteFacil: "Rematar de qualquer forma para a baliza.",
      varianteDificil: "Remate de pé contrário vale a dobrar; escolher o canto e avisar o GR.",
      criterios: "Ninguém parado muito tempo; rematam com intenção.",
      coaching: "Pé de apoio ao lado da bola, decidir o canto antes de rematar.",
      descoberta: "Como enganas o guarda-redes sem ser só a força?",
    }),
    diagrama: diagrama([
      baliza("g1", 395, 60, "vertical"), j("gr1", 373, 60, "vermelho"),
      baliza("g2", 395, 150, "vertical"), j("gr2", 373, 150, "vermelho"),
      j("a1", 250, 60, "azul", 1), bola("b1", 261, 62),
      j("a2", 250, 150, "azul", 2), bola("b2", 261, 152),
      seta("s1", "passe", [{ x: 261, y: 62 }, { x: 390, y: 60 }]),
      seta("s2", "passe", [{ x: 261, y: 152 }, { x: 390, y: 150 }]),
      texto("t1", 100, 15, "2 estações em simultâneo; fecho festivo"),
    ]),
    notaSessao: "Fecho da sessão: curto, festivo, remate com intenção.",
  },
];

// Ordem na sessão: ativação → jogos reduzidos → jogo formal → penáltis
const ORDEM_SESSAO = [0, 1, 2, 3];

async function main() {
  console.log(`\n▶ seed-sub11 — alvo: ${EMAIL_ALVO}`);
  console.log(`  ligação: ${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? "?"}`);

  const user = await prisma.utilizador.findUnique({ where: { email: EMAIL_ALVO } });
  if (!user) throw new Error(`Utilizador "${EMAIL_ALVO}" não encontrado.`);

  const membro = await prisma.membroClube.findFirst({
    where: { utilizadorId: user.id, estado: "ATIVO" },
    orderBy: { dataEntrada: "desc" },
  });
  if (!membro) throw new Error(`Utilizador "${EMAIL_ALVO}" sem adesão de clube ATIVA.`);
  const clubeId = membro.clubeId;

  const epoca = await prisma.epoca.findFirst({ where: { clubeId, ativa: true } });
  if (!epoca) throw new Error(`Clube ${clubeId} sem época ativa.`);

  const escaloes = await prisma.escalao.findMany({
    where: { clubeId }, include: { seccao: true }, orderBy: { ordem: "asc" },
  });
  if (escaloes.length === 0) throw new Error(`Clube ${clubeId} sem escalões.`);

  const combina = (nome: string) => /sub[\s-]?11|benjamin|traquina/i.test(nome);
  const escalao =
    escaloes.find((e) => combina(e.nome) && e.seccao?.modalidade === "FUTSAL") ??
    escaloes.find((e) => combina(e.nome)) ??
    escaloes.find((e) => e.seccao?.modalidade === "FUTSAL") ??
    escaloes[0];

  console.log(`  clube: ${clubeId} | época: ${epoca.nome} | escalão: ${escalao.nome}`);

  // Exercícios: upsert manual
  const exercicioIds: string[] = [];
  for (const def of EXERCICIOS) {
    const existente = await prisma.exercicio.findFirst({
      where: { nome: def.nome, clubeId, criadorId: user.id },
      select: { id: true },
    });
    const dados = {
      descricao: def.descricao, objetivo: def.objetivo, duracaoMin: def.duracaoMin,
      categoriaPrincipal: def.categoriaPrincipal, parteTreino: def.parteTreino,
      escalaoAlvo: ESCALAO_ALVO, modalidade: "FUTSAL" as const,
      diagrama: def.diagrama as unknown as Prisma.InputJsonValue,
      proprietario: "TREINADOR" as const, autorId: user.id, clubeProprietarioId: null,
      subcategoriaId: null, clubeId, criadorId: user.id, origemSeed: false,
    };
    if (existente) {
      await prisma.exercicio.update({ where: { id: existente.id }, data: dados });
      exercicioIds.push(existente.id);
    } else {
      const cr = await prisma.exercicio.create({ data: { nome: def.nome, ...dados } });
      exercicioIds.push(cr.id);
    }
    console.log(`  exercício: "${def.nome}" ${existente ? "atualizado" : "criado"}`);
  }

  // Sessão: apagar qualquer sessão de hoje para este escalão+época e recriar
  const dataInicio = new Date("2026-08-24T00:00:00");
  const dataFim = new Date("2026-08-24T23:59:59");

  await prisma.$transaction(async (tx) => {
    const anteriores = await tx.sessao.findMany({
      where: { escalaoId: escalao.id, epocaId: epoca.id, data: { gte: dataInicio, lte: dataFim } },
      select: { id: true },
    });
    if (anteriores.length > 0) {
      await tx.sessao.deleteMany({ where: { id: { in: anteriores.map((s) => s.id) } } });
      console.log(`  sessões anteriores removidas: ${anteriores.length}`);
    }

    const duracaoTotal = ORDEM_SESSAO.reduce((acc, i) => acc + EXERCICIOS[i].duracaoMin, 0);
    const objetivo =
      `${TITULO_SESSAO}\n\nCondução com superfícies variadas (ativação) → jogos reduzidos 2x2/3x3 → ` +
      `jogo formal campo inteiro → penáltis (fecho festivo). Duração total estimada: ${duracaoTotal} min.`;

    const sessao = await tx.sessao.create({
      data: {
        data: DATA_SESSAO, escalaoId: escalao.id, epocaId: epoca.id,
        tipoSessao: "NORMAL", duracaoMin: duracaoTotal, objetivo,
        local: "Pavilhão", criadorId: user.id,
      },
    });

    for (let ordem = 0; ordem < ORDEM_SESSAO.length; ordem++) {
      const def = EXERCICIOS[ORDEM_SESSAO[ordem]];
      const exercicioId = exercicioIds[ORDEM_SESSAO[ordem]];
      const snapshot = construirSnapshotExercicio({
        proprietario: "TREINADOR", nome: def.nome, descricao: def.descricao,
        objetivo: def.objetivo, diagrama: def.diagrama as unknown as Prisma.JsonValue,
      });
      await tx.sessaoExercicio.create({
        data: {
          sessaoId: sessao.id, exercicioId, ordem,
          duracaoMin: def.duracaoMin, notas: def.notaSessao,
          ...(snapshot ?? {}),
        },
      });
    }

    console.log(`  sessão criada: ${sessao.id} com ${ORDEM_SESSAO.length} exercícios (${duracaoTotal} min)`);
  });

  console.log("✔ seed-sub11 concluído.\n");
}

main()
  .catch((e) => {
    console.error("✖ seed-sub11 falhou:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
