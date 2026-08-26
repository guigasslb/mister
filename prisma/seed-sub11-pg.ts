// prisma/seed-sub11-pg.ts
// Seed usando node-postgres (pg) para contornar limitação do engine Rust do Prisma em WSL.
// Cria 4 exercícios + sessão de treino 2026-08-24 para goncalo.pereira.1992@gmail.com.

import { Client } from "pg";
import { randomUUID } from "crypto";

const EMAIL_ALVO = process.env.SEED_EMAIL || "goncalo.pereira.1992@gmail.com";
const DATA_SESSAO = "2026-08-24T10:00:00";
const TITULO_SESSAO = "Sub-11 — Condução, jogo reduzido e finalização";
const ESCALAO_ALVO = "Sub-11";

// ── Diagrama helpers ─────────────────────────────────────────────────────────
type Cor = "azul" | "vermelho" | "amarelo" | "verde";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = Record<string, any>;

const j = (id: string, x: number, y: number, cor: Cor, n?: number): El =>
  ({ id, tipo: "jogador", x, y, cor, ...(n != null ? { numero: n } : {}) });
const bola = (id: string, x: number, y: number): El => ({ id, tipo: "bola", x, y });
const cone = (id: string, x: number, y: number): El => ({ id, tipo: "cone", x, y });
const baliza = (id: string, x: number, y: number, o: "horizontal" | "vertical"): El =>
  ({ id, tipo: "baliza", x, y, orientacao: o });
const seta = (id: string, estilo: "movimento" | "passe" | "conducao", pontos: { x: number; y: number }[]): El =>
  ({ id, tipo: "seta", estilo, cor: "#1A1D29", pontos });
const texto = (id: string, x: number, y: number, conteudo: string): El =>
  ({ id, tipo: "texto", x, y, conteudo });
const diagrama = (elementos: El[]) => JSON.stringify({ versao: 1, elementos });

// ── Descrição rica ───────────────────────────────────────────────────────────
function desc(s: {
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

// ── Exercícios ───────────────────────────────────────────────────────────────
interface ExDef {
  nome: string;
  categoriaPrincipal: string;
  parteTreino: string;
  duracaoMin: number;
  objetivo: string;
  descricao: string;
  diagrama: string;
  notaSessao: string;
}

const EXERCICIOS: ExDef[] = [
  {
    nome: "Condução em superfícies (sola, parte de fora, pé contrário)",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "AQUECIMENTO",
    duracaoMin: 10,
    objetivo: "Máximo de contactos, controlo de superfícies e ambidestria.",
    descricao: desc({
      organizacao: "Espaço delimitado; todos conduzem livremente ao mesmo tempo.",
      descricao: "Muda-se a superfície de contacto por blocos ao apito — sola (rolar/puxar), parte de fora do pé, pé contrário. Intercalar comandos de 'trava a bola no JA'.",
      material: "1 bola por atleta, cones.",
      grupo: "8-14 atletas",
      varianteFacil: "Espaço maior, ritmo lento.",
      varianteDificil: "Travar com a sola do pé contrário; conduzir de cabeça levantada a 'ler' números do treinador.",
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
      texto("t1", 85, 15, "Ao apito: sola -> parte de fora -> pe contrario"),
    ]),
    notaSessao: "Blocos de 60-90s por superfície ao apito; intercalar 'trava no JA'.",
  },
  {
    nome: "Jogos reduzidos 2x2 (evolui para 3x3)",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "PRINCIPAL",
    duracaoMin: 12,
    objetivo: "Contacto máximo com bola, atacar/defender, procurar o colega.",
    descricao: desc({
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
      texto("t1", 90, 15, "2x2 -> 3x3; X passes = ponto ou mini-baliza"),
    ]),
    notaSessao: "Começar 2x2; evoluir para 3x3 após 5-6 min; rodar entre campos.",
  },
  {
    nome: "Jogo formal em campo inteiro",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "JOGO_REDUZIDO",
    duracaoMin: 12,
    objetivo: "Jogar a sério, transições, ocupação do espaço em contexto real.",
    descricao: desc({
      organizacao: "5x5 com GR (ou o mais próximo); campo inteiro. Rotação total de posições a cada 3 min, GR incluído.",
      descricao: "Jogo livre. Treinador intervém pouco; manter a jogar. Rotação de posições garante que todos passam pelo GR e por posições de campo.",
      material: "Balizas, coletes por cor.",
      grupo: "~10+ (abaixo disso, preferir jogos reduzidos)",
      varianteFacil: "Menos de 10 atletas: mais jogos reduzidos em vez do campo inteiro.",
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
      texto("t1", 110, 15, "5x5 campo inteiro; rodar posicoes a cada 3 min"),
    ]),
    notaSessao: "Jogo livre; mínima intervenção; rodar GR a cada 3 min.",
  },
  {
    nome: "Penáltis em 2 estações",
    categoriaPrincipal: "ATAQUE",
    parteTreino: "JOGO_REDUZIDO",
    duracaoMin: 7,
    objetivo: "Finalização com intenção e fecho emocional divertido, sem filas paradas.",
    descricao: desc({
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
      texto("t1", 100, 15, "2 estacoes em simultaneo; fecho festivo"),
    ]),
    notaSessao: "Fecho da sessão: curto, festivo, remate com intenção.",
  },
];

const ORDEM_SESSAO = [0, 1, 2, 3];

async function main() {
  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL ou DIRECT_URL não definida.");

  console.log(`\n▶ seed-sub11-pg — alvo: ${EMAIL_ALVO}`);
  const host = dbUrl.split("@")[1]?.split("/")[0];
  console.log(`  ligação (pg): ${host}`);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // 1. Utilizador
    const userRes = await client.query(
      `SELECT id FROM "Utilizador" WHERE email = $1`,
      [EMAIL_ALVO],
    );
    if (userRes.rowCount === 0) throw new Error(`Utilizador "${EMAIL_ALVO}" não encontrado.`);
    const userId: string = userRes.rows[0].id;

    // 2. Clube (MembroClube ATIVO mais recente)
    const membroRes = await client.query(
      `SELECT "clubeId" FROM "MembroClube" WHERE "utilizadorId" = $1 AND estado = 'ATIVO' ORDER BY "dataEntrada" DESC LIMIT 1`,
      [userId],
    );
    if (membroRes.rowCount === 0) throw new Error(`Utilizador sem adesão de clube ATIVA.`);
    const clubeId: string = membroRes.rows[0].clubeId;

    // 3. Época ativa
    const epocaRes = await client.query(
      `SELECT id, nome FROM "Epoca" WHERE "clubeId" = $1 AND ativa = true LIMIT 1`,
      [clubeId],
    );
    if (epocaRes.rowCount === 0) throw new Error(`Clube ${clubeId} sem época ativa.`);
    const epocaId: string = epocaRes.rows[0].id;
    const epocaNome: string = epocaRes.rows[0].nome;

    // 4. Escalão (Sub-11/Benjamins/Traquinas + FUTSAL; fallback: primeiro por ordem)
    const escaloesRes = await client.query(
      `SELECT e.id, e.nome, s.modalidade
       FROM "Escalao" e
       LEFT JOIN "Seccao" s ON s.id = e."seccaoId"
       WHERE e."clubeId" = $1
       ORDER BY e.ordem ASC`,
      [clubeId],
    );
    if (escaloesRes.rowCount === 0) throw new Error(`Clube ${clubeId} sem escalões.`);

    const rows = escaloesRes.rows as { id: string; nome: string; modalidade: string | null }[];
    const combina = (nome: string) => /sub[\s-]?11|benjamin|traquina/i.test(nome);
    const escalao =
      rows.find((e) => combina(e.nome) && e.modalidade === "FUTSAL") ??
      rows.find((e) => combina(e.nome)) ??
      rows.find((e) => e.modalidade === "FUTSAL") ??
      rows[0];

    console.log(`  clube: ${clubeId} | época: ${epocaNome} | escalão: ${escalao.nome}`);

    // 5. Exercícios (upsert manual: findFirst por nome+clube+criador → update / insert)
    const exercicioIds: string[] = [];
    for (const ex of EXERCICIOS) {
      const existRes = await client.query(
        `SELECT id FROM "Exercicio" WHERE nome = $1 AND "clubeId" = $2 AND "criadorId" = $3 LIMIT 1`,
        [ex.nome, clubeId, userId],
      );

      const now = new Date().toISOString();

      if (existRes.rowCount && existRes.rowCount > 0) {
        const exId: string = existRes.rows[0].id;
        await client.query(
          `UPDATE "Exercicio" SET
            descricao = $1, objetivo = $2, "duracaoMin" = $3,
            "categoriaPrincipal" = $4, "parteTreino" = $5,
            "escalaoAlvo" = $6, modalidade = 'FUTSAL',
            diagrama = $7, proprietario = 'TREINADOR',
            "autorId" = $8, "clubeProprietarioId" = NULL,
            "subcategoriaId" = NULL, "origemSeed" = false,
            "atualizadoEm" = $9
           WHERE id = $10`,
          [ex.descricao, ex.objetivo, ex.duracaoMin, ex.categoriaPrincipal, ex.parteTreino,
           ESCALAO_ALVO, ex.diagrama, userId, now, exId],
        );
        exercicioIds.push(exId);
        console.log(`  exercício atualizado: "${ex.nome}"`);
      } else {
        const newId = randomUUID();
        await client.query(
          `INSERT INTO "Exercicio"
            (id, nome, descricao, objetivo, "duracaoMin", "categoriaPrincipal", "parteTreino",
             "escalaoAlvo", modalidade, diagrama, proprietario, "autorId", "clubeProprietarioId",
             "subcategoriaId", "origemSeed", "clubeId", "criadorId", "criadoEm", "atualizadoEm")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'FUTSAL',$9,'TREINADOR',$10,NULL,NULL,false,$11,$12,$13,$14)`,
          [newId, ex.nome, ex.descricao, ex.objetivo, ex.duracaoMin,
           ex.categoriaPrincipal, ex.parteTreino, ESCALAO_ALVO, ex.diagrama,
           userId, clubeId, userId, now, now],
        );
        exercicioIds.push(newId);
        console.log(`  exercício criado: "${ex.nome}"`);
      }
    }

    // 6. Sessão: apagar sessões existentes para hoje + escalão + época e recriar
    await client.query(
      `DELETE FROM "Sessao"
       WHERE "escalaoId" = $1 AND "epocaId" = $2
         AND data >= '2026-08-24T00:00:00' AND data <= '2026-08-24T23:59:59'`,
      [escalao.id, epocaId],
    );

    const duracaoTotal = ORDEM_SESSAO.reduce((acc, i) => acc + EXERCICIOS[i].duracaoMin, 0);
    const objetivo =
      `${TITULO_SESSAO}\n\nCondução com superfícies variadas (ativação) → jogos reduzidos 2x2/3x3 → ` +
      `jogo formal campo inteiro → penáltis (fecho festivo). Duração total estimada: ${duracaoTotal} min.`;

    const sessaoId = randomUUID();
    const now = new Date().toISOString();
    await client.query(
      `INSERT INTO "Sessao"
        (id, data, "duracaoMin", objetivo, local, "escalaoId", "epocaId",
         "tipoSessao", "criadorId", "criadoEm", "atualizadoEm")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'NORMAL',$8,$9,$10)`,
      [sessaoId, DATA_SESSAO, duracaoTotal, objetivo, "Pavilhão",
       escalao.id, epocaId, userId, now, now],
    );

    // 7. SessaoExercicio
    for (let ordem = 0; ordem < ORDEM_SESSAO.length; ordem++) {
      const def = EXERCICIOS[ORDEM_SESSAO[ordem]];
      const exercicioId = exercicioIds[ORDEM_SESSAO[ordem]];
      const seId = randomUUID();
      await client.query(
        `INSERT INTO "SessaoExercicio"
          (id, "sessaoId", "exercicioId", ordem, "duracaoMin", notas,
           "snapNome", "snapDescricao", "snapObjetivo", "snapDiagrama", "snapCriadoEm")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [seId, sessaoId, exercicioId, ordem, def.duracaoMin, def.notaSessao,
         def.nome, def.descricao, def.objetivo, def.diagrama, now],
      );
    }

    console.log(`  sessão criada: ${sessaoId} com ${ORDEM_SESSAO.length} exercícios (${duracaoTotal} min)`);
    console.log("✔ seed-sub11-pg concluído.\n");

  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("✖ falhou:", e instanceof Error ? e.message : e);
  process.exit(1);
});
