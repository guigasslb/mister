// prisma/data-migrations/seed_sport_lisboa_evora_fix_core.ts
// DADOS DE TESTE — anonimizados em 2026-08-12. Não usar em produção com dados reais.
//
// Lógica PARTILHADA da CORRECÇÃO do seed do clube "Sport Lisboa e Évora".
// Usada tanto pela rota temporária (app/api/seed-sle-fix/route.ts) como pelo
// script standalone (seed_sport_lisboa_evora_fix.ts), garantindo que ambos
// produzem exactamente o mesmo resultado.
//
// CONTEXTO: o seed base (seed_sport_lisboa_evora.ts) foi interrompido pelo Vercel
// antes de terminar, deixando a BD num estado incompleto:
//   1. Presenças: apenas alguns atletas ficaram com registos (loop interrompido).
//   2. Jogos: 0 jogos criados para a época "2025/2026" / escalão Traquinas.
//   3. Épocas duplicadas: existe uma época "2025/26" (de outro seed) e a "2025/2026"
//      (a correcta), ambas com `ativa: true` — obterEpocaAtiva() sem orderBy devolve
//      a errada.
//
// Esta correcção:
//   Passo 2 — desactiva todas as épocas do clube excepto a "2025/2026".
//   Passo 3 — completa as presenças em falta (por atleta sem presenças, cria uma
//             presença por sessão existente, determinística segundo a % de assiduidade).
//   Passo 4 — cria os 30 jogos (só se ainda não existirem), com convocatórias e
//             estatísticas de golos (mesma lógica determinística do seed original).
//
// DETERMINÍSTICO: nenhuma aleatoriedade.
// IDEMPOTENTE: re-executar não duplica dados (guardas por secção + skipDuplicates).
//
// ROBUSTEZ DE NOMES: competições e atletas são resolvidos por comparação NORMALIZADA
// (minúsculas + sem acentos + espaços colapsados), pelo que a resolução funciona
// independentemente da capitalização/acentuação exacta com que os nomes foram gravados.

import {
  PrismaClient,
  EstadoPresenca,
  TipoAusencia,
  TipoJogo,
  CasaFora,
  Utilizacao,
} from "@prisma/client";

const NOME_CLUBE = "Sport Lisboa e Évora";
const NOME_EPOCA = "2025/2026";
const NOME_ESCALAO = "Traquinas";
const NUM_JOGOS = 30;

// ─────────────────────────────────────────────
// Dados de referência (copiados EXACTAMENTE do seed original)
// ─────────────────────────────────────────────

type AtletaSeed = {
  nome: string;
  numero: number;
  pct: number; // % de assiduidade
  golos: number; // total de golos na época
};

// Ordem = número da camisola (1..21). Cópia EXACTA da lista ATLETAS do seed original
// (nomes fictícios anonimizados). Tem de coincidir com o seed base, pois os atletas
// são resolvidos por nome normalizado (ver normalizar()).
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

// Distribuição dos 30 jogos pelas competições existentes na BD (buscadas por nome).
// Soma = 12 + 8 + 5 + 2 + 2 + 1 = 30.
type DistCompeticao = { nome: string; jogos: number };

const DISTRIBUICAO_COMPETICOES: readonly DistCompeticao[] = [
  { nome: "Joga à Bola Traquinas", jogos: 12 },
  { nome: "Joga a Bola Futsal (Traquinas)", jogos: 8 },
  { nome: "Liga Kuboo", jogos: 5 },
  { nome: "Évora Kids Cup Futsal Traquinas", jogos: 2 },
  { nome: "Elvas Golden Cup Energy", jogos: 2 },
  { nome: "Beja Cup Sub.9", jogos: 1 },
] as const;

const ADVERSARIOS: readonly string[] = [
  "Académica FC",
  "Lusitano FCV",
  "SC Farense",
  "GD Évora",
  "Portimonense",
  "CF Belenenses",
  "AA Coimbra",
  "SC Beja",
  "UD Oliveirense",
  "Vitória FC",
  "FC Alverca",
  "SC Braga",
  "AD Oeiras",
  "SL Benfica",
  "Sporting CP",
  "FC Porto",
  "CD Tondela",
  "GD Chaves",
  "SC Covilhã",
  "CD Nacional",
] as const;

// ─────────────────────────────────────────────
// Utilitários deterministas
// ─────────────────────────────────────────────

/** Normaliza um nome para comparação tolerante a capitalização/acentuação. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function addDias(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
}

/**
 * Distribui os golos totais de um atleta por índices de jogo (0..NUM_JOGOS-1),
 * de forma determinista, com um máximo de 3 golos por jogo. Cópia EXACTA da
 * função do seed original (preserva o total exacto de golos por atleta).
 */
function distribuirGolos(atleta: AtletaSeed): Map<number, number> {
  const mapa = new Map<number, number>();
  if (atleta.golos <= 0) return mapa;

  const numJogosGolo = Math.min(NUM_JOGOS, Math.ceil(atleta.golos / 3));
  const passo = Math.max(1, Math.floor(NUM_JOGOS / numJogosGolo));
  const base = Math.floor(atleta.golos / numJogosGolo);
  const resto = atleta.golos % numJogosGolo;

  for (let i = 0; i < numJogosGolo; i++) {
    const indice = (i * passo + atleta.numero) % NUM_JOGOS;
    const golos = base + (i < resto ? 1 : 0);
    if (golos > 0) mapa.set(indice, golos);
  }
  return mapa;
}

// ─────────────────────────────────────────────
// Resultado
// ─────────────────────────────────────────────

export type ResultadoSeedFix = {
  ok: boolean;
  mensagem: string;
  epocaCorrigida: boolean;
  presencasAdicionadas: number;
  jogosAdicionados: number;
};

// ─────────────────────────────────────────────
// Correcção principal
// ─────────────────────────────────────────────

export async function seedSleFix(prisma: PrismaClient): Promise<ResultadoSeedFix> {
  // ── Passo 1 — Clube, época correcta e escalão ────────────────────────────
  const clube = await prisma.clube.findFirstOrThrow({ where: { nome: NOME_CLUBE } });
  const epoca = await prisma.epoca.findFirstOrThrow({
    where: { clubeId: clube.id, nome: NOME_EPOCA },
  });
  const escalao = await prisma.escalao.findFirstOrThrow({
    where: { clubeId: clube.id, nome: NOME_ESCALAO },
  });

  // Criador (utilizador) — primeiro membro do clube (para os jogos criados).
  const membro = await prisma.membroClube.findFirstOrThrow({
    where: { clubeId: clube.id },
    include: { utilizador: true },
  });
  const criadorId = membro.utilizador.id;

  // Atletas do escalão/época → mapa por nome normalizado.
  const atletasDb = await prisma.atleta.findMany({
    where: {
      clubeId: clube.id,
      participacoes: { some: { epocaId: epoca.id, escalaoId: escalao.id } },
    },
    select: { id: true, nome: true },
  });
  const atletaIdPorNome = new Map<string, string>();
  for (const a of atletasDb) atletaIdPorNome.set(normalizar(a.nome), a.id);
  const idAtleta = (nome: string): string => {
    const id = atletaIdPorNome.get(normalizar(nome));
    if (!id) {
      throw new Error(`Atleta "${nome}" não encontrado no escalão/época do clube.`);
    }
    return id;
  };

  // Sessões da época/escalão, ordem cronológica.
  const sessoes = await prisma.sessao.findMany({
    where: { epocaId: epoca.id, escalaoId: escalao.id },
    orderBy: { data: "asc" },
    select: { id: true },
  });
  const totalSessoes = sessoes.length;

  // Presenças já existentes, agrupadas por atleta (1 query).
  const atletaIds = atletasDb.map((a) => a.id);
  const gruposPresenca =
    atletaIds.length > 0
      ? await prisma.presenca.groupBy({
          by: ["atletaId"],
          where: { atletaId: { in: atletaIds } },
          _count: true,
        })
      : [];
  const atletasComPresencas = new Set<string>();
  for (const g of gruposPresenca) {
    if (g._count > 0) atletasComPresencas.add(g.atletaId);
  }

  // Jogos já existentes para a época/escalão.
  const nJogos = await prisma.jogo.count({
    where: { escalaoId: escalao.id, epocaId: epoca.id },
  });

  // Resolver competições da época/escalão por nome normalizado.
  const competicoesDb = await prisma.competicao.findMany({
    where: { clubeId: clube.id, escalaoId: escalao.id, epocaId: epoca.id },
    select: { id: true, nome: true },
  });
  const compPorNomeNorm = new Map<string, { id: string; nome: string }>();
  for (const c of competicoesDb) {
    compPorNomeNorm.set(normalizar(c.nome), { id: c.id, nome: c.nome });
  }
  const resolverCompeticao = (nome: string): { id: string; nome: string } => {
    const c = compPorNomeNorm.get(normalizar(nome));
    if (!c) {
      throw new Error(
        `Competição "${nome}" não encontrada na BD para a época/escalão.`,
      );
    }
    return c;
  };

  // Mapa jogo (0..29) → competição, conforme a distribuição pedida.
  const competicaoPorJogo: { id: string; nome: string }[] = [];
  for (const d of DISTRIBUICAO_COMPETICOES) {
    const c = resolverCompeticao(d.nome);
    for (let i = 0; i < d.jogos; i++) competicaoPorJogo.push(c);
  }

  // Pré-cálculo determinista dos golos por jogo/atleta.
  const golosPorJogo = new Map<number, Map<string, number>>();
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

  const baseDataJogos = new Date(2025, 9, 4, 10, 0, 0, 0); // 4 Out 2025

  let epocaCorrigida = false;
  let presencasAdicionadas = 0;
  let jogosAdicionados = 0;

  await prisma.$transaction(
    async (tx) => {
      // ── Passo 2 — Corrigir épocas duplicadas ──────────────────────────────
      const upd = await tx.epoca.updateMany({
        where: { clubeId: clube.id, id: { not: epoca.id } },
        data: { ativa: false },
      });
      epocaCorrigida = upd.count > 0;
      // Garantir que a época correcta fica activa.
      await tx.epoca.update({ where: { id: epoca.id }, data: { ativa: true } });

      // ── Passo 3 — Completar presenças em falta ────────────────────────────
      for (const a of ATLETAS) {
        const aid = idAtleta(a.nome);
        if (atletasComPresencas.has(aid)) continue; // já tem presenças → saltar

        const alvo = Math.round((a.pct / 100) * totalSessoes);
        const data = sessoes.map((s, idx) => ({
          sessaoId: s.id,
          atletaId: aid,
          escalaoId: escalao.id,
          estado: idx < alvo ? EstadoPresenca.PRESENTE : EstadoPresenca.AUSENTE,
          tipoAusencia: idx < alvo ? null : TipoAusencia.SEM_MOTIVO,
        }));
        if (data.length > 0) {
          const r = await tx.presenca.createMany({ data, skipDuplicates: true });
          presencasAdicionadas += r.count;
        }
      }

      // ── Passo 4 — Criar os 30 jogos (se não existirem) ────────────────────
      if (nJogos === 0) {
        for (let g = 0; g < NUM_JOGOS; g++) {
          const comp = competicaoPorJogo[g];
          const marcadores = golosPorJogo.get(g) as Map<string, number>;

          // Convocatória: marcadores + mais assíduos até ao alvo (10..14).
          const alvoConvocatoria = 10 + (g % 5);
          const convocados = new Set<string>(marcadores.keys());
          for (const a of atletasPorAssiduidade) {
            if (convocados.size >= alvoConvocatoria) break;
            convocados.add(a.nome);
          }

          const golosMarcados = [...marcadores.values()].reduce(
            (acc, n) => acc + n,
            0,
          );
          const padrao = g % 3;
          const golosSofridos =
            padrao === 0
              ? Math.max(0, golosMarcados - 3) // vitória
              : padrao === 1
                ? golosMarcados // empate
                : golosMarcados + 2; // derrota

          const jogo = await tx.jogo.create({
            data: {
              data: addDias(baseDataJogos, g * 8),
              adversario: ADVERSARIOS[g % ADVERSARIOS.length],
              casaFora: g % 2 === 0 ? CasaFora.CASA : CasaFora.FORA,
              tipo: TipoJogo.OFICIAL,
              competicao: comp.nome,
              competicaoId: comp.id,
              golosMarcados,
              golosSofridos,
              local: g % 2 === 0 ? "Pavilhão SLE" : "Pavilhão adversário",
              escalaoId: escalao.id,
              epocaId: epoca.id,
              criadorId,
            },
          });

          const listaConvocados = [...convocados];
          await tx.convocatoria.createMany({
            data: listaConvocados.map((nome) => ({
              jogoId: jogo.id,
              atletaId: idAtleta(nome),
              convocado: true,
            })),
            skipDuplicates: true,
          });

          await tx.estatisticaAtleta.createMany({
            data: listaConvocados.map((nome) => {
              const golos = marcadores.get(nome) ?? 0;
              return {
                jogoId: jogo.id,
                atletaId: idAtleta(nome),
                utilizacao: golos > 0 ? Utilizacao.TITULAR : Utilizacao.UTILIZADO,
                golos,
                assistencias: 0,
              };
            }),
            skipDuplicates: true,
          });

          jogosAdicionados += 1;
        }
      }
    },
    { maxWait: 15000, timeout: 55000 },
  );

  return {
    ok: true,
    mensagem: "Correcção do seed SLE concluída.",
    epocaCorrigida,
    presencasAdicionadas,
    jogosAdicionados,
  };
}
