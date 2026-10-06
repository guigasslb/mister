// prisma/data-migrations/seed_sport_lisboa_evora.ts
// DADOS DE TESTE — anonimizados em 2026-08-12. Não usar em produção com dados reais.
// Seed de DEMONSTRAÇÃO/TESTES — clube "Sport Lisboa e Évora",
// época 2025/2026, escalão Traquinas (Sub-8).
// Os nomes dos atletas são FICTÍCIOS (anonimizados para conformidade RGPD, dado
// tratar-se de um escalão de menores). As datas de nascimento são geradas
// (não reais) e os valores de assiduidade/golos são apenas ilustrativos.
//
// Cria: clube + perfil Administrador + treinador (membro) + época ativa +
// escalão + 21 atletas (com AtletaEscalao PRINCIPAL/ATIVO) + 10 competições +
// 80 sessões de treino (com presenças por atleta, segundo as % de assiduidade) +
// 30 jogos representativos (com convocatórias e estatísticas de golos).
//
// DETERMINÍSTICO: nenhuma aleatoriedade. Presenças e golos são distribuídos de
// forma reprodutível (mesma BD limpa → mesmo resultado).
//
// IDEMPOTENTE: se o clube já existir, sai sem duplicar nada.
//
// EXECUÇÃO MANUAL:
//   npm run db:seed:sle
//
// Login gerado: treinador@sle.pt / SLE2026!  (Administrador)

import {
  PrismaClient,
  TipoParticipacao,
  EstadoParticipacao,
  EstadoPresenca,
  TipoAusencia,
  FormatoCompeticao,
  TipoJogo,
  CasaFora,
  Utilizacao,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERFIS_ARRANQUE } from "../../lib/permissoes-catalogo";

const prisma = new PrismaClient();

// Guarda de produção: este seed cria DADOS DE TESTE e NUNCA deve correr em produção.
if (process.env.NODE_ENV === "production") {
  throw new Error(
    "Seed abortado: seed de dados de teste (SLE) não pode correr em produção (NODE_ENV=production).",
  );
}

const BCRYPT_COST = 12;
const NOME_CLUBE = "Sport Lisboa e Évora";
const EMAIL_TREINADOR = "treinador@sle.pt";
const PASS_TREINADOR = "SLE2026!";

// ─────────────────────────────────────────────
// Dados de referência (fictícios, para testes)
// ─────────────────────────────────────────────

type AtletaSeed = {
  nome: string;
  numero: number;
  pct: number; // % de assiduidade
  golos: number; // total de golos na época
};

// Ordem = número da camisola (1..21).
// NOMES ANONIMIZADOS: nomes fictícios, sem relação com pessoas reais (RGPD).
// numero/pct/golos preservados para manter o seed útil em testes.
const ATLETAS: readonly AtletaSeed[] = [
  { nome: "Diogo", numero: 1, pct: 70, golos: 0 },
  { nome: "Miguel", numero: 2, pct: 100, golos: 4 },
  { nome: "Tomás", numero: 3, pct: 0, golos: 12 },
  { nome: "Guilherme", numero: 4, pct: 70, golos: 12 },
  { nome: "Beatriz", numero: 5, pct: 58.75, golos: 4 },
  { nome: "Salvador", numero: 6, pct: 73.75, golos: 30 },
  { nome: "Vasco", numero: 7, pct: 42.5, golos: 0 },
  { nome: "Duarte", numero: 8, pct: 68.75, golos: 2 },
  { nome: "Simão", numero: 9, pct: 7.5, golos: 3 },
  { nome: "Leonardo", numero: 10, pct: 60, golos: 0 },
  { nome: "Bernardo", numero: 11, pct: 41.25, golos: 7 },
  { nome: "Xavier", numero: 12, pct: 15, golos: 1 },
  { nome: "Lourenço", numero: 13, pct: 83.75, golos: 67 },
  { nome: "Gaspar", numero: 14, pct: 87.5, golos: 42 },
  { nome: "Martinho", numero: 15, pct: 92.5, golos: 57 },
  { nome: "Nuno", numero: 16, pct: 26.25, golos: 0 },
  { nome: "Bruno Costa", numero: 17, pct: 73.75, golos: 33 },
  { nome: "Ivan", numero: 18, pct: 76.25, golos: 54 },
  { nome: "Hugo", numero: 19, pct: 38.75, golos: 3 },
  { nome: "Fábio", numero: 20, pct: 42.5, golos: 5 },
  { nome: "Renato", numero: 21, pct: 75, golos: 8 },
] as const;

type CompeticaoSeed = { nome: string; formato: FormatoCompeticao };

const COMPETICOES: readonly CompeticaoSeed[] = [
  { nome: "Beja cup sub.9", formato: FormatoCompeticao.TORNEIO },
  { nome: "Elvas golden cup energy", formato: FormatoCompeticao.TORNEIO },
  { nome: "Evora kids cup Futsal PETIZES", formato: FormatoCompeticao.TORNEIO },
  { nome: "Evora kids cup Futsal TRAQUINAS", formato: FormatoCompeticao.TORNEIO },
  { nome: "joga a bola futsal (petizes)", formato: FormatoCompeticao.TORNEIO },
  { nome: "joga a bola futsal (traquinas)", formato: FormatoCompeticao.LIGA },
  { nome: "joga a bola petizes", formato: FormatoCompeticao.TORNEIO },
  { nome: "Joga á bola traquinas", formato: FormatoCompeticao.LIGA },
  { nome: "Liga kuboo", formato: FormatoCompeticao.LIGA },
  { nome: "macdonalds cup salesianos de Évora", formato: FormatoCompeticao.TORNEIO },
] as const;

// Distribuição de sessões por mês (total = 80).
type MesSeed = { ano: number; mes: number; n: number }; // mes: 0 = janeiro
const SESSOES_POR_MES: readonly MesSeed[] = [
  { ano: 2025, mes: 8, n: 9 }, // Setembro
  { ano: 2025, mes: 9, n: 9 }, // Outubro
  { ano: 2025, mes: 10, n: 8 }, // Novembro
  { ano: 2025, mes: 11, n: 7 }, // Dezembro
  { ano: 2026, mes: 0, n: 8 }, // Janeiro
  { ano: 2026, mes: 1, n: 8 }, // Fevereiro
  { ano: 2026, mes: 2, n: 9 }, // Março
  { ano: 2026, mes: 3, n: 9 }, // Abril
  { ano: 2026, mes: 4, n: 7 }, // Maio
  { ano: 2026, mes: 5, n: 6 }, // Junho
] as const;

const NUM_JOGOS = 30;

const ADVERSARIOS: readonly string[] = [
  "Académica de Évora",
  "Lusitano GC",
  "GD Évora",
  "Juventude SC",
  "Benfica de Évora",
  "Redondo FC",
  "Vendas Novas",
  "Reguengos",
  "Montemor FC",
  "Estrela de Portel",
  "Vila Viçosa AD",
  "Borba FC",
] as const;

// ─────────────────────────────────────────────
// Utilitários deterministas
// ─────────────────────────────────────────────

function addDias(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
}

/**
 * Distribui os golos totais de um atleta por índices de jogo (0..NUM_JOGOS-1),
 * de forma determinista, com um máximo de 3 golos por jogo. Os índices são
 * espaçados ao longo da época e deslocados pelo número da camisola para
 * descorrelacionar atletas. Preserva o total exacto.
 */
function distribuirGolos(atleta: AtletaSeed): Map<number, number> {
  const mapa = new Map<number, number>();
  if (atleta.golos <= 0) return mapa;

  const numJogosGolo = Math.min(NUM_JOGOS, Math.ceil(atleta.golos / 3));
  const passo = Math.max(1, Math.floor(NUM_JOGOS / numJogosGolo));
  const base = Math.floor(atleta.golos / numJogosGolo);
  const resto = atleta.golos % numJogosGolo;

  for (let i = 0; i < numJogosGolo; i++) {
    // (i*passo) são distintos e < NUM_JOGOS; somar a mesma constante mod NUM_JOGOS
    // preserva a distinção → sem colisões de índice para o mesmo atleta.
    const indice = (i * passo + atleta.numero) % NUM_JOGOS;
    const golos = base + (i < resto ? 1 : 0);
    if (golos > 0) mapa.set(indice, golos);
  }
  return mapa;
}

// ─────────────────────────────────────────────
// Seed principal
// ─────────────────────────────────────────────

async function main() {
  const jaExiste = await prisma.clube.findFirst({ where: { nome: NOME_CLUBE } });
  if (jaExiste) {
    console.log(`Seed SLE já aplicado (clube "${NOME_CLUBE}" existe). A sair.`);
    return;
  }

  console.log(`A criar dados do "${NOME_CLUBE}"...`);

  // 1. Clube
  const clube = await prisma.clube.create({
    data: {
      nome: NOME_CLUBE,
      corPrimaria: "#CC0000",
      corSecundaria: "#FFFFFF",
      onboardingConcluido: true,
    },
  });

  // 2. Perfis de arranque (precisamos do Administrador para o membro)
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

  // 3. Utilizador treinador (upsert por email — email é único global)
  const treinador = await prisma.utilizador.upsert({
    where: { email: EMAIL_TREINADOR },
    update: {},
    create: {
      nome: "Treinador SLE",
      email: EMAIL_TREINADOR,
      passwordHash: await bcrypt.hash(PASS_TREINADOR, BCRYPT_COST),
    },
  });

  // 4. Adesão do treinador como Administrador
  await prisma.membroClube.create({
    data: {
      utilizadorId: treinador.id,
      clubeId: clube.id,
      perfilId: perfis["Administrador"],
      estado: "ATIVO",
    },
  });

  // 5. Época ativa 2025/2026
  const epoca = await prisma.epoca.create({
    data: {
      nome: "2025/2026",
      dataInicio: new Date("2025-09-01"),
      dataFim: new Date("2026-06-30"),
      ativa: true,
      clubeId: clube.id,
    },
  });

  // 6. Escalão Traquinas
  const traquinas = await prisma.escalao.create({
    data: {
      nome: "Traquinas",
      idadeMin: 6,
      idadeMax: 8,
      ordem: 0,
      clubeId: clube.id,
    },
  });

  // 7. Atletas (com AtletaEscalao PRINCIPAL/ATIVO)
  const atletaIdPorNome = new Map<string, string>();
  for (let i = 0; i < ATLETAS.length; i++) {
    const a = ATLETAS[i];
    // Datas de nascimento plausíveis para Sub-8 (nascidos 2017/2018).
    const ano = i % 2 === 0 ? 2017 : 2018;
    const mes = (i % 12) + 1;
    const dia = ((i * 2) % 27) + 1;
    const dataNascimento = new Date(
      `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}T00:00:00.000Z`,
    );

    const criado = await prisma.atleta.create({
      data: {
        nome: a.nome,
        numero: a.numero,
        dataNascimento,
        ativo: true,
        dataIngresso: epoca.dataInicio,
        clubeId: clube.id,
        participacoes: {
          create: {
            escalaoId: traquinas.id,
            epocaId: epoca.id,
            tipo: TipoParticipacao.PRINCIPAL,
            estado: EstadoParticipacao.ATIVO,
            numero: a.numero,
            dataInicio: epoca.dataInicio,
          },
        },
      },
    });
    atletaIdPorNome.set(a.nome, criado.id);
  }

  // 8. Competições
  const competicaoIds: string[] = [];
  for (const c of COMPETICOES) {
    const criada = await prisma.competicao.create({
      data: {
        clubeId: clube.id,
        escalaoId: traquinas.id,
        epocaId: epoca.id,
        nome: c.nome,
        tipo: TipoJogo.OFICIAL,
        formato: c.formato,
      },
    });
    competicaoIds.push(criada.id);
  }

  // 9. Sessões de treino (ordem cronológica global) + presenças
  const datasSessoes: Date[] = [];
  for (const m of SESSOES_POR_MES) {
    for (let j = 0; j < m.n; j++) {
      const dia = 2 + j * 3; // dias distintos dentro do mês (máx. 2 + 8*3 = 26)
      const d = new Date(m.ano, m.mes, dia, 18, 30, 0, 0);
      datasSessoes.push(d);
    }
  }
  const totalSessoes = datasSessoes.length; // 80

  // Nº de presenças-alvo por atleta (arredondado) sobre o total de sessões.
  const presencasAlvo = new Map<string, number>();
  for (const a of ATLETAS) {
    presencasAlvo.set(a.nome, Math.round((a.pct / 100) * totalSessoes));
  }

  for (let s = 0; s < totalSessoes; s++) {
    const sessao = await prisma.sessao.create({
      data: {
        data: datasSessoes[s],
        duracaoMin: 75,
        local: "Pavilhão SLE",
        objetivo: "Treino de desenvolvimento — Traquinas",
        escalaoId: traquinas.id,
        epocaId: epoca.id,
        criadorId: treinador.id,
      },
    });

    // Determinista: presente nos primeiros N treinos (ordem cronológica).
    const presencas = ATLETAS.map((a) => {
      const alvo = presencasAlvo.get(a.nome) ?? 0;
      const presente = s < alvo;
      return {
        sessaoId: sessao.id,
        atletaId: atletaIdPorNome.get(a.nome) as string,
        escalaoId: traquinas.id,
        estado: presente ? EstadoPresenca.PRESENTE : EstadoPresenca.AUSENTE,
        tipoAusencia: presente ? null : TipoAusencia.SEM_MOTIVO,
      };
    });
    await prisma.presenca.createMany({ data: presencas });
  }

  // 10. Golos por jogo/atleta (pré-cálculo determinista)
  const golosPorJogo: Map<number, Map<string, number>> = new Map();
  for (let g = 0; g < NUM_JOGOS; g++) golosPorJogo.set(g, new Map());
  for (const a of ATLETAS) {
    const dist = distribuirGolos(a);
    for (const [indiceJogo, golos] of dist) {
      golosPorJogo.get(indiceJogo)?.set(a.nome, golos);
    }
  }

  // Atletas ordenados por assiduidade (para preencher convocatórias).
  const atletasPorAssiduidade = [...ATLETAS].sort(
    (x, y) => y.pct - x.pct || x.numero - y.numero,
  );

  // 11. Jogos + convocatórias + estatísticas
  const baseDataJogos = new Date(2025, 9, 4, 10, 0, 0, 0); // 4 Out 2025
  for (let g = 0; g < NUM_JOGOS; g++) {
    const compIndex = Math.floor(g / (NUM_JOGOS / COMPETICOES.length)); // 3 jogos por competição
    const comp = COMPETICOES[compIndex];
    const marcadores = golosPorJogo.get(g) as Map<string, number>;

    // Convocatória: marcadores (obrigatórios) + mais assíduos até ao alvo (10..14).
    const alvoConvocatoria = 10 + (g % 5);
    const convocados = new Set<string>(marcadores.keys());
    for (const a of atletasPorAssiduidade) {
      if (convocados.size >= alvoConvocatoria) break;
      convocados.add(a.nome);
    }

    const golosMarcados = [...marcadores.values()].reduce((acc, n) => acc + n, 0);
    // Resultado determinista com mistura V/E/D.
    const padrao = g % 3;
    const golosSofridos =
      padrao === 0
        ? Math.max(0, golosMarcados - 3) // vitória
        : padrao === 1
          ? golosMarcados // empate
          : golosMarcados + 2; // derrota

    const jogo = await prisma.jogo.create({
      data: {
        data: addDias(baseDataJogos, g * 8),
        adversario: ADVERSARIOS[g % ADVERSARIOS.length],
        casaFora: g % 2 === 0 ? CasaFora.CASA : CasaFora.FORA,
        tipo: TipoJogo.OFICIAL,
        competicao: comp.nome,
        competicaoId: competicaoIds[compIndex],
        golosMarcados,
        golosSofridos,
        local: g % 2 === 0 ? "Pavilhão SLE" : "Pavilhão adversário",
        escalaoId: traquinas.id,
        epocaId: epoca.id,
        criadorId: treinador.id,
      },
    });

    const listaConvocados = [...convocados];
    await prisma.convocatoria.createMany({
      data: listaConvocados.map((nome) => ({
        jogoId: jogo.id,
        atletaId: atletaIdPorNome.get(nome) as string,
        convocado: true,
      })),
    });

    await prisma.estatisticaAtleta.createMany({
      data: listaConvocados.map((nome) => {
        const golos = marcadores.get(nome) ?? 0;
        return {
          jogoId: jogo.id,
          atletaId: atletaIdPorNome.get(nome) as string,
          utilizacao: golos > 0 ? Utilizacao.TITULAR : Utilizacao.UTILIZADO,
          golos,
          assistencias: 0,
        };
      }),
    });
  }

  console.log("✅ Seed SLE concluído.");
  console.log(`  Clube: ${NOME_CLUBE} (${clube.id})`);
  console.log(`  Época: 2025/2026 · Escalão: Traquinas`);
  console.log(`  Atletas: ${ATLETAS.length} · Competições: ${COMPETICOES.length}`);
  console.log(`  Sessões: ${totalSessoes} · Jogos: ${NUM_JOGOS}`);
  console.log(`  Login: ${EMAIL_TREINADOR} / ${PASS_TREINADOR} (Administrador)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
