import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const EMAIL_ALVO = "goncalo.pereira.1992@gmail.com";

// ─────────────────────────────────────────────────────────────────────────────
// Diagramas (secção 11 da bíblia): campo 400×200, x→direita, y→baixo, centro (200,100).
// Versão 2 = base (elementos) + passos de animação.
// ─────────────────────────────────────────────────────────────────────────────

// Exercício 1 — slalom com cones + passe (dois setups lado a lado).
const diagrama1: Prisma.InputJsonValue = {
  versao: 2,
  campo: "FUTSAL_5",
  elementos: [
    // ── Lado esquerdo: jogo de cones (arcos) ──
    // Grupo 1 (perto da linha de fundo esq)
    { id: "e1-c-g1-1", tipo: "cone", x: 40, y: 60, cor: "amarelo" },
    { id: "e1-c-g1-2", tipo: "cone", x: 40, y: 80, cor: "amarelo" },
    { id: "e1-c-g1-3", tipo: "cone", x: 40, y: 100, cor: "amarelo" },
    { id: "e1-c-g1-4", tipo: "cone", x: 40, y: 120, cor: "amarelo" },
    { id: "e1-c-g1-5", tipo: "cone", x: 40, y: 140, cor: "amarelo" },
    // Grupo 2 (meio-campo)
    { id: "e1-c-g2-1", tipo: "cone", x: 160, y: 60, cor: "amarelo" },
    { id: "e1-c-g2-2", tipo: "cone", x: 160, y: 80, cor: "amarelo" },
    { id: "e1-c-g2-3", tipo: "cone", x: 160, y: 100, cor: "amarelo" },
    { id: "e1-c-g2-4", tipo: "cone", x: 160, y: 120, cor: "amarelo" },
    { id: "e1-c-g2-5", tipo: "cone", x: 160, y: 140, cor: "amarelo" },
    // 3 jogadores alinhados
    { id: "e1-j1", tipo: "jogador", x: 30, y: 70, numero: 1, cor: "azul", equipa: "propria" },
    { id: "e1-j2", tipo: "jogador", x: 30, y: 100, numero: 2, cor: "azul", equipa: "propria" },
    { id: "e1-j3", tipo: "jogador", x: 30, y: 130, numero: 3, cor: "azul", equipa: "propria" },
    // Setas ida/volta do jogo de cones
    { id: "e1-s-ida", tipo: "seta", estilo: "conducao", cor: "#1A1D29", pontos: [{ x: 40, y: 70 }, { x: 160, y: 70 }] },
    { id: "e1-s-volta", tipo: "seta", estilo: "movimento", cor: "#1A1D29", pontos: [{ x: 160, y: 70 }, { x: 40, y: 70 }] },

    // ── Lado direito: controlo de bola com sola + passe (slalom) ──
    // Linha de cones 1
    { id: "e1-sl1-1", tipo: "cone", x: 240, y: 40, cor: "laranja" },
    { id: "e1-sl1-2", tipo: "cone", x: 240, y: 60, cor: "laranja" },
    { id: "e1-sl1-3", tipo: "cone", x: 240, y: 80, cor: "laranja" },
    { id: "e1-sl1-4", tipo: "cone", x: 240, y: 100, cor: "laranja" },
    { id: "e1-sl1-5", tipo: "cone", x: 240, y: 120, cor: "laranja" },
    { id: "e1-sl1-6", tipo: "cone", x: 240, y: 140, cor: "laranja" },
    { id: "e1-sl1-7", tipo: "cone", x: 240, y: 160, cor: "laranja" },
    // Linha de cones 2
    { id: "e1-sl2-1", tipo: "cone", x: 320, y: 40, cor: "laranja" },
    { id: "e1-sl2-2", tipo: "cone", x: 320, y: 60, cor: "laranja" },
    { id: "e1-sl2-3", tipo: "cone", x: 320, y: 80, cor: "laranja" },
    { id: "e1-sl2-4", tipo: "cone", x: 320, y: 100, cor: "laranja" },
    { id: "e1-sl2-5", tipo: "cone", x: 320, y: 120, cor: "laranja" },
    { id: "e1-sl2-6", tipo: "cone", x: 320, y: 140, cor: "laranja" },
    { id: "e1-sl2-7", tipo: "cone", x: 320, y: 160, cor: "laranja" },
    // Jogadores A (início slalom) e B (receção)
    { id: "e1-jA", tipo: "jogador", x: 240, y: 185, numero: 4, cor: "azul", equipa: "propria" },
    { id: "e1-jB", tipo: "jogador", x: 360, y: 185, numero: 5, cor: "azul", equipa: "propria" },
    // Bola no início do slalom
    { id: "e1-bola", tipo: "bola", x: 240, y: 175 },
    // Seta condução sinuosa através dos cones
    {
      id: "e1-s-slalom",
      tipo: "seta",
      estilo: "conducao",
      cor: "#1A1D29",
      pontos: [
        { x: 240, y: 175 },
        { x: 250, y: 50 },
        { x: 270, y: 130 },
        { x: 290, y: 50 },
        { x: 310, y: 130 },
        { x: 320, y: 50 },
      ],
    },
    // Seta passe longo para o colega
    { id: "e1-s-passe", tipo: "seta", estilo: "passe", cor: "#1A1D29", pontos: [{ x: 320, y: 50 }, { x: 360, y: 185 }] },
  ],
  passos: [
    // Passo 0: jogador 1 avança do 1º arco ao 2º arco
    { id: "e1-p0", ordem: 0, duracaoMs: 1500, posicoes: [{ elementoId: "e1-j1", x: 160, y: 70 }] },
    // Passo 1: jogador 1 regressa ao 1º arco
    { id: "e1-p1", ordem: 1, duracaoMs: 1500, posicoes: [{ elementoId: "e1-j1", x: 40, y: 70 }] },
  ],
};

// Exercício 2 — 4Ax0D+GR, ataque posicional pelas alas.
const diagrama2: Prisma.InputJsonValue = {
  versao: 2,
  campo: "FUTSAL_5",
  elementos: [
    // GR e balizas
    { id: "e2-gr", tipo: "jogador", x: 10, y: 100, cor: "azul", posicao: "GR", equipa: "propria" },
    { id: "e2-baliza-propria", tipo: "baliza", x: 5, y: 100, orientacao: "vertical" },
    { id: "e2-baliza-adv", tipo: "baliza", x: 390, y: 100, orientacao: "vertical" },
    // Jogadores de campo
    { id: "e2-fixo", tipo: "jogador", x: 150, y: 100, numero: 5, cor: "azul", posicao: "fixo", equipa: "propria" },
    { id: "e2-pivo", tipo: "jogador", x: 300, y: 100, numero: 9, cor: "azul", posicao: "pivo", equipa: "propria" },
    { id: "e2-ala-dir", tipo: "jogador", x: 250, y: 30, numero: 11, cor: "azul", posicao: "ala", equipa: "propria" },
    { id: "e2-ala-esq", tipo: "jogador", x: 250, y: 170, numero: 7, cor: "azul", posicao: "ala", equipa: "propria" },
    // Bola no fixo
    { id: "e2-bola", tipo: "bola", x: 150, y: 100 },
    // Setas
    { id: "e2-s-passe-pivo", tipo: "seta", estilo: "passe", cor: "#1A1D29", pontos: [{ x: 155, y: 100 }, { x: 295, y: 100 }] },
    { id: "e2-s-dev-ala", tipo: "seta", estilo: "passe", cor: "#1A1D29", pontos: [{ x: 300, y: 98 }, { x: 255, y: 35 }] },
    { id: "e2-s-ala-linha", tipo: "seta", estilo: "conducao", cor: "#1A1D29", pontos: [{ x: 252, y: 32 }, { x: 252, y: 15 }, { x: 370, y: 15 }] },
    { id: "e2-s-cruzamento", tipo: "seta", estilo: "passe", cor: "#1A1D29", pontos: [{ x: 370, y: 15 }, { x: 370, y: 100 }] },
    { id: "e2-s-finalizacao", tipo: "seta", estilo: "movimento", cor: "#1A1D29", pontos: [{ x: 300, y: 100 }, { x: 370, y: 95 }] },
  ],
  passos: [
    // Passo 0: passe fixo → pivô
    { id: "e2-p0", ordem: 0, duracaoMs: 1200, posicoes: [{ elementoId: "e2-bola", x: 300, y: 100 }] },
    // Passo 1: devolução para ala direita + ala sobe pela linha
    {
      id: "e2-p1",
      ordem: 1,
      duracaoMs: 1000,
      posicoes: [
        { elementoId: "e2-bola", x: 252, y: 32 },
        { elementoId: "e2-ala-dir", x: 370, y: 15 },
      ],
    },
    // Passo 2: cruzamento para 2º poste + pivô a finalizar
    {
      id: "e2-p2",
      ordem: 2,
      duracaoMs: 1200,
      posicoes: [
        { elementoId: "e2-bola", x: 370, y: 100 },
        { elementoId: "e2-pivo", x: 365, y: 95 },
      ],
    },
  ],
};

// Exercício 3 — Saída de GR pelas alas (4Ax0D+GR): movimentação de bola e
// trocas de posição. Ataque da esquerda (GR) para a direita (finalização).
const diagrama3: Prisma.InputJsonValue = {
  versao: 2,
  campo: "FUTSAL_5",
  elementos: [
    // GR e balizas
    { id: "e3-gr", tipo: "jogador", x: 18, y: 100, cor: "azul", posicao: "GR", equipa: "propria" },
    { id: "e3-baliza-propria", tipo: "baliza", x: 5, y: 100, orientacao: "vertical" },
    { id: "e3-baliza-adv", tipo: "baliza", x: 390, y: 100, orientacao: "vertical" },
    // Jogadores de campo (posições iniciais)
    { id: "e3-fixo", tipo: "jogador", x: 95, y: 100, numero: 5, cor: "azul", posicao: "fixo", equipa: "propria" },
    { id: "e3-ala-dir", tipo: "jogador", x: 150, y: 40, numero: 7, cor: "azul", posicao: "ala", equipa: "propria" },
    { id: "e3-ala-esq", tipo: "jogador", x: 150, y: 160, numero: 11, cor: "azul", posicao: "ala", equipa: "propria" },
    { id: "e3-pivo", tipo: "jogador", x: 270, y: 55, numero: 9, cor: "azul", posicao: "pivo", equipa: "propria" },
    // Bola no GR
    { id: "e3-bola", tipo: "bola", x: 28, y: 100 },
    // Setas — trajeto completo da jogada
    // 1) GR passa para o fixo, que troca com a ala e desce à ala para receber
    { id: "e3-s-gr-fixo", tipo: "seta", estilo: "passe", cor: "#1A1D29", pontos: [{ x: 34, y: 100 }, { x: 150, y: 52 }] },
    // 2) Fixo procura o pivot na ala
    { id: "e3-s-fixo-pivo", tipo: "seta", estilo: "passe", cor: "#1A1D29", pontos: [{ x: 150, y: 52 }, { x: 268, y: 57 }] },
    // 3) Pivot devolve para a ala contrária que já vem a entrar (com curva)
    { id: "e3-s-pivo-ala", tipo: "seta", estilo: "passe", cor: "#1A1D29", pontos: [{ x: 270, y: 60 }, { x: 305, y: 110 }, { x: 315, y: 140 }] },
    // 4) Movimento: fixo troca com a ala (sai para a ala direita)
    { id: "e3-s-mov-fixo", tipo: "seta", estilo: "movimento", cor: "#1A1D29", pontos: [{ x: 95, y: 100 }, { x: 148, y: 55 }] },
    // 5) Movimento: ala contrária entra para a finalização
    { id: "e3-s-mov-ala", tipo: "seta", estilo: "movimento", cor: "#1A1D29", pontos: [{ x: 150, y: 160 }, { x: 315, y: 143 }] },
  ],
  passos: [
    // Passo 0: fixo troca para a ala e recebe do GR; ala direita entra por dentro
    {
      id: "e3-p0",
      ordem: 0,
      duracaoMs: 1400,
      posicoes: [
        { elementoId: "e3-fixo", x: 150, y: 52 },
        { elementoId: "e3-ala-dir", x: 110, y: 95 },
        { elementoId: "e3-bola", x: 150, y: 54 },
      ],
    },
    // Passo 1: fixo procura pivot na ala; ala ocupa o lugar do pivot; ala contrária começa a entrar
    {
      id: "e3-p1",
      ordem: 1,
      duracaoMs: 1200,
      posicoes: [
        { elementoId: "e3-bola", x: 268, y: 57 },
        { elementoId: "e3-ala-dir", x: 250, y: 78 },
        { elementoId: "e3-ala-esq", x: 240, y: 150 },
      ],
    },
    // Passo 2: pivot devolve para a ala contrária a entrar; pivot dá apoio na finalização
    {
      id: "e3-p2",
      ordem: 2,
      duracaoMs: 1400,
      posicoes: [
        { elementoId: "e3-bola", x: 315, y: 140 },
        { elementoId: "e3-ala-esq", x: 315, y: 142 },
        { elementoId: "e3-pivo", x: 330, y: 108 },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Definição dos exercícios a inserir.
// ─────────────────────────────────────────────────────────────────────────────

const EXERCICIOS = [
  {
    nome: "AQUECIMENTO+JOGO+CONTROLO DE BOLA",
    duracaoMin: 15,
    numeroJogadores: "Todos",
    espaco: "Campo inteiro",
    parteTreino: "AQUECIMENTO" as const,
    categoriaPrincipal: "FISICO" as const,
    modalidade: "FUTSAL" as const,
    emailAlvo: EMAIL_ALVO,
    objetivo: ["1º 3 voltas ao campo", "2º jogo lúdico 5m", "3º controlo de bola 7m"].join("\n"),
    descricao: [
      "1º - 3 voltas ao campo",
      "",
      "2º - 1º atleta apanha o cone e entrega ao 2º atleta que vai colocar no 2º arco, na volta apanha do 1º arco outro cone e entrega ao 3º atleta, ganha quem colocar em 1º lugar todos os cones no último arco",
      "",
      "3º - bola controlada com sola do pé, contorna cones, vai até ao último, contorna e faz o passe longo para o colega que recebe com sola do pé.",
    ].join("\n"),
    diagrama: diagrama1,
  },
  {
    nome: "Jogo pelas alas e finalização",
    duracaoMin: 10,
    numeroJogadores: "4+GR",
    espaco: "Campo inteiro",
    parteTreino: "PRINCIPAL" as const,
    categoriaPrincipal: "ATAQUE" as const,
    modalidade: "FUTSAL" as const,
    emailAlvo: EMAIL_ALVO,
    objetivo: "Procurar pivô, jogar com alas e finalização.",
    descricao: [
      "4Ax0D+GR",
      "",
      "Fixo procura pivô, segura e devolve numa das alas, ala sobe na linha e cruza para segundo poste. Pivô ou 2ª ala a finalizar.",
    ].join("\n"),
    diagrama: diagrama2,
  },
  {
    nome: "Saída de GR pelas alas",
    duracaoMin: 12,
    numeroJogadores: "4+GR",
    espaco: "3/4 campo",
    parteTreino: "PRINCIPAL" as const,
    categoriaPrincipal: "ATAQUE" as const,
    modalidade: "FUTSAL" as const,
    emailAlvo: "goncalo.pereira.1992@gmail.com",
    objetivo: "Movimentação de bola e trocas de posição.",
    descricao: [
      "4Ax0D+GR",
      "",
      "GR com bola, fixo troca rapidamente com ala para receber bola de GR.",
      "Fixo procura pivot na ala e o ala ocupa o lugar do pivot.",
      "Pivot recebe na ala e devolve para o ala contrário que já vem a entrar.",
      "Pivot, se possível, a dar apoio na finalização.",
      "Executar para os dois lados.",
      "Todos os atletas a passar pelas posições.",
    ].join("\n"),
    diagrama: diagrama3,
  },
];

interface AlvoClube {
  utilizadorId: string;
  clubeId: string;
  nome: string;
}

/** Resolve utilizador (por email) → clube da adesão ATIVA. */
async function resolverAlvo(email: string): Promise<AlvoClube> {
  const utilizador = await prisma.utilizador.findUnique({
    where: { email },
  });
  if (!utilizador) {
    throw new Error(`Utilizador não encontrado: ${email}`);
  }

  const membro = await prisma.membroClube.findFirst({
    where: { utilizadorId: utilizador.id, estado: "ATIVO" },
  });
  if (!membro) {
    throw new Error(`Sem adesão ATIVA a nenhum clube para ${email}`);
  }

  return { utilizadorId: utilizador.id, clubeId: membro.clubeId, nome: utilizador.nome };
}

async function main() {
  // Cache de resolução por email (cada exercício define o seu `emailAlvo`).
  const cache = new Map<string, AlvoClube>();

  // Inserir cada exercício de forma idempotente (dual-write clubeId/criadorId/autorId)
  for (const ex of EXERCICIOS) {
    let alvo = cache.get(ex.emailAlvo);
    if (!alvo) {
      alvo = await resolverAlvo(ex.emailAlvo);
      cache.set(ex.emailAlvo, alvo);
      console.log(`Utilizador ${alvo.nome} (${ex.emailAlvo}) → clube ${alvo.clubeId}`);
    }

    const jaExiste = await prisma.exercicio.findFirst({
      where: { nome: ex.nome, clubeId: alvo.clubeId },
    });
    if (jaExiste) {
      console.log(`↷ Já existe, ignorado: "${ex.nome}" (id ${jaExiste.id})`);
      continue;
    }

    const criado = await prisma.exercicio.create({
      data: {
        nome: ex.nome,
        descricao: ex.descricao,
        objetivo: ex.objetivo,
        duracaoMin: ex.duracaoMin,
        numeroJogadores: ex.numeroJogadores,
        espaco: ex.espaco,
        categoriaPrincipal: ex.categoriaPrincipal,
        parteTreino: ex.parteTreino,
        modalidade: ex.modalidade,
        diagrama: ex.diagrama,
        // Dual-write: legado (clubeId/criadorId) + semântico (autorId).
        clubeId: alvo.clubeId,
        criadorId: alvo.utilizadorId,
        autorId: alvo.utilizadorId,
        proprietario: "TREINADOR",
      },
    });
    console.log(`✔ Criado: "${criado.nome}" (id ${criado.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
