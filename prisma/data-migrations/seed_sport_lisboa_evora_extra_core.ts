// prisma/data-migrations/seed_sport_lisboa_evora_extra_core.ts
// DADOS DE TESTE — anonimizados em 2026-08-12. Não usar em produção com dados reais.
//
// Lógica PARTILHADA do seed suplementar do clube "Sport Lisboa e Évora".
// Usada tanto pela rota temporária (app/api/seed-sle-extra/route.ts) como pelo
// script standalone (seed_sport_lisboa_evora_extra.ts), garantindo que ambos
// produzem exactamente o mesmo resultado.
//
// PRÉ-REQUISITO: o clube base já tem de existir (seed_sport_lisboa_evora).
//   Cria: clube + época 2025/2026 + escalão Traquinas + 21 atletas + sessões + jogos.
//
// Este seed ACRESCENTA:
//   A — 5 subcategorias de exercício
//   B — 20 exercícios de biblioteca
//   C — ligação de 3-5 exercícios a cada sessão de treino existente
//   D — periodização (Planeamento: 3 períodos → 7 mesociclos) + ligação às sessões
//   E — 6 reuniões com atas
//
// NOTA DE MAPEAMENTO (schema): o schema não tem modelos Ciclo/Mesociclo separados
// nem "planeamento anual". A periodização é modelada num único modelo `Planeamento`
// com os campos `periodo` (PeriodoEpoca), `mesociclo` e `microciclo`. Os "ciclos"
// pedidos correspondem aos 3 `periodo`s; os "mesociclos" aos registos numerados.
//
// DETERMINÍSTICO e IDEMPOTENTE: re-executar não duplica dados (guardas por secção
// + skipDuplicates nas relações com chave única).

import {
  PrismaClient,
  CategoriaExercicioPrincipal,
  ParteTreino,
  TipoPlaneamento,
  PeriodoEpoca,
  AmbitoReuniao,
} from "@prisma/client";

const NOME_CLUBE = "Sport Lisboa e Évora";
const NOME_EPOCA = "2025/2026";
const NOME_ESCALAO = "Traquinas";

export type ResultadoSeedExtra = {
  ok: boolean;
  mensagem: string;
  dados?: {
    subcategorias: number;
    exercicios: number;
    sessaoExercicios: number;
    planeamentos: number;
    sessoesLigadas: number;
    reunioes: number;
  };
};

// ─────────────────────────────────────────────
// A — Subcategorias de exercício
// ─────────────────────────────────────────────

type SubcatDef = { nome: string; categoria: CategoriaExercicioPrincipal; ordem: number };

const SUBCATEGORIAS: readonly SubcatDef[] = [
  { nome: "Finalização", categoria: CategoriaExercicioPrincipal.ATAQUE, ordem: 0 },
  { nome: "Passe e Circulação", categoria: CategoriaExercicioPrincipal.ATAQUE, ordem: 1 },
  { nome: "Organização Defensiva", categoria: CategoriaExercicioPrincipal.DEFESA, ordem: 2 },
  { nome: "Guarda-redes", categoria: CategoriaExercicioPrincipal.GUARDA_REDES, ordem: 3 },
  { nome: "Velocidade e Coordenação", categoria: CategoriaExercicioPrincipal.FISICO, ordem: 4 },
] as const;

// ─────────────────────────────────────────────
// B — Biblioteca de exercícios (20)
// ─────────────────────────────────────────────

type ExercicioDef = {
  nome: string;
  descricao: string;
  objetivo: string;
  duracaoMin: number;
  categoria: CategoriaExercicioPrincipal;
  parte: ParteTreino;
  subcat: string | null; // nome da subcategoria (ou null)
};

const EXERCICIOS: readonly ExercicioDef[] = [
  {
    nome: "Ativação com bola",
    descricao: "Corrida ligeira em grupo com condução de bola, mudanças de direção a comando.",
    objetivo: "Elevar a temperatura corporal e introduzir contacto com a bola.",
    duracaoMin: 10,
    categoria: CategoriaExercicioPrincipal.FISICO,
    parte: ParteTreino.AQUECIMENTO,
    subcat: "Velocidade e Coordenação",
  },
  {
    nome: "Mobilidade e coordenação em escada",
    descricao: "Percursos na escada de agilidade seguidos de arranque curto para receber passe.",
    objetivo: "Trabalhar coordenação, ritmo de pés e reação.",
    duracaoMin: 12,
    categoria: CategoriaExercicioPrincipal.FISICO,
    parte: ParteTreino.AQUECIMENTO,
    subcat: "Velocidade e Coordenação",
  },
  {
    nome: "Rondo 4x1",
    descricao: "Quatro jogadores em quadrado mantêm a posse contra um defensor no centro.",
    objetivo: "Manutenção de posse, velocidade de circulação e leitura de linhas de passe.",
    duracaoMin: 12,
    categoria: CategoriaExercicioPrincipal.ATAQUE,
    parte: ParteTreino.AQUECIMENTO,
    subcat: "Passe e Circulação",
  },
  {
    nome: "Rondo 5x2",
    descricao: "Cinco atacantes contra dois defensores; ao recuperar a bola trocam de função.",
    objetivo: "Circulação sob pressão e apoio ao portador.",
    duracaoMin: 15,
    categoria: CategoriaExercicioPrincipal.ATAQUE,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Passe e Circulação",
  },
  {
    nome: "Passe e receção em losango",
    descricao: "Quatro estações em losango; passe, receção orientada e deslocamento para a estação seguinte.",
    objetivo: "Qualidade de passe e primeiro toque orientado.",
    duracaoMin: 15,
    categoria: CategoriaExercicioPrincipal.ATAQUE,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Passe e Circulação",
  },
  {
    nome: "Circulação com apoio do pivô",
    descricao: "Circulação a três com apoio de costas do pivô e devolução para finalização.",
    objetivo: "Jogo de apoio e ligação com o pivô.",
    duracaoMin: 18,
    categoria: CategoriaExercicioPrincipal.ATAQUE,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Passe e Circulação",
  },
  {
    nome: "Finalização após passe do pivô",
    descricao: "Pivô fixa o defensor e liberta para o ala finalizar de zona lateral.",
    objetivo: "Timing de desmarcação e remate após apoio.",
    duracaoMin: 18,
    categoria: CategoriaExercicioPrincipal.ATAQUE,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Finalização",
  },
  {
    nome: "Finalização em 2x1",
    descricao: "Dois atacantes contra um defensor em transição para a baliza.",
    objetivo: "Tomada de decisão em superioridade e finalização.",
    duracaoMin: 15,
    categoria: CategoriaExercicioPrincipal.ATAQUE,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Finalização",
  },
  {
    nome: "Circuito de remate",
    descricao: "Estações de remate de diferentes zonas e ângulos com passe prévio.",
    objetivo: "Volume de remate e precisão.",
    duracaoMin: 15,
    categoria: CategoriaExercicioPrincipal.ATAQUE,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Finalização",
  },
  {
    nome: "Finalização de primeira",
    descricao: "Cruzamento raso ou passe para remate de primeira sem controlo.",
    objetivo: "Remate de primeira e antecipação.",
    duracaoMin: 12,
    categoria: CategoriaExercicioPrincipal.ATAQUE,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Finalização",
  },
  {
    nome: "1x1 ofensivo com finalização",
    descricao: "Duelo individual a partir do meio-campo com finalização após ultrapassar o defensor.",
    objetivo: "Drible em progressão e conclusão.",
    duracaoMin: 15,
    categoria: CategoriaExercicioPrincipal.ATAQUE,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Finalização",
  },
  {
    nome: "Basculação defensiva",
    descricao: "Quatro defensores basculam em bloco em função da posição da bola (sem oposição).",
    objetivo: "Compactação e cobertura defensiva.",
    duracaoMin: 15,
    categoria: CategoriaExercicioPrincipal.DEFESA,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Organização Defensiva",
  },
  {
    nome: "Defesa individual pressionante",
    descricao: "Marcação individual em meio-campo forçando erro e recuperação.",
    objetivo: "Pressão à bola e agressividade defensiva.",
    duracaoMin: 18,
    categoria: CategoriaExercicioPrincipal.DEFESA,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Organização Defensiva",
  },
  {
    nome: "Recuperação defensiva 2x2",
    descricao: "Após perda, dois jogadores recuperam posições e impedem a finalização adversária.",
    objetivo: "Reação à perda e equilíbrio defensivo.",
    duracaoMin: 15,
    categoria: CategoriaExercicioPrincipal.DEFESA,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Organização Defensiva",
  },
  {
    nome: "Temporização e bloco baixo",
    descricao: "Defender em inferioridade temporizando até chegada de apoio.",
    objetivo: "Temporização e gestão de inferioridade.",
    duracaoMin: 15,
    categoria: CategoriaExercicioPrincipal.DEFESA,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Organização Defensiva",
  },
  {
    nome: "Transição rápida 3x2",
    descricao: "Após recuperar a bola, três atacantes exploram o espaço contra dois defensores.",
    objetivo: "Transição ofensiva rápida e ocupação de espaços.",
    duracaoMin: 15,
    categoria: CategoriaExercicioPrincipal.TRANSICAO,
    parte: ParteTreino.PRINCIPAL,
    subcat: null,
  },
  {
    nome: "Contra-ataque após recuperação",
    descricao: "Jogo condicionado que premeia o ataque rápido nos primeiros segundos após recuperar.",
    objetivo: "Velocidade de transição defesa-ataque.",
    duracaoMin: 15,
    categoria: CategoriaExercicioPrincipal.TRANSICAO,
    parte: ParteTreino.JOGO_REDUZIDO,
    subcat: null,
  },
  {
    nome: "Jogo reduzido 3x3 com balizas",
    descricao: "Jogo em espaço reduzido com balizas pequenas e regras de apoio.",
    objetivo: "Tomada de decisão em espaço reduzido.",
    duracaoMin: 18,
    categoria: CategoriaExercicioPrincipal.ATAQUE,
    parte: ParteTreino.JOGO_REDUZIDO,
    subcat: null,
  },
  {
    nome: "Jogo 4x4 em campo inteiro",
    descricao: "Jogo formal 4x4 com guarda-redes, aplicando os princípios treinados.",
    objetivo: "Transferência dos conteúdos para contexto de jogo.",
    duracaoMin: 20,
    categoria: CategoriaExercicioPrincipal.ATAQUE,
    parte: ParteTreino.JOGO_REDUZIDO,
    subcat: null,
  },
  {
    nome: "Trabalho específico de guarda-redes",
    descricao: "Reação a remates de várias distâncias, reposição rápida e comunicação com a defesa.",
    objetivo: "Técnica específica de guarda-redes e início de jogo.",
    duracaoMin: 18,
    categoria: CategoriaExercicioPrincipal.GUARDA_REDES,
    parte: ParteTreino.PRINCIPAL,
    subcat: "Guarda-redes",
  },
] as const;

// ─────────────────────────────────────────────
// D — Periodização (períodos → mesociclos)
// ─────────────────────────────────────────────

type MesocicloDef = { n: number; inicio: string; fim: string; objetivos: string };
type PeriodoDef = { periodo: PeriodoEpoca; mesociclos: readonly MesocicloDef[] };

const PERIODIZACAO: readonly PeriodoDef[] = [
  {
    periodo: PeriodoEpoca.PREPARATORIO,
    mesociclos: [
      {
        n: 1,
        inicio: "2025-09-01",
        fim: "2025-09-30",
        objetivos: "Adaptação ao esforço, técnica individual base e criação de hábitos de treino.",
      },
      {
        n: 2,
        inicio: "2025-10-01",
        fim: "2025-10-31",
        objetivos: "Passe/receção, princípios ofensivos simples e introdução à organização defensiva.",
      },
    ],
  },
  {
    periodo: PeriodoEpoca.COMPETITIVO,
    mesociclos: [
      {
        n: 3,
        inicio: "2025-11-01",
        fim: "2025-12-31",
        objetivos: "Consolidação ofensiva, finalização e manutenção de forma durante a fase competitiva.",
      },
      {
        n: 4,
        inicio: "2026-01-01",
        fim: "2026-02-28",
        objetivos: "Transições rápidas e organização defensiva coletiva sob pressão.",
      },
      {
        n: 5,
        inicio: "2026-03-01",
        fim: "2026-03-31",
        objetivos: "Preparação para torneios: bolas paradas e jogo em espaço reduzido.",
      },
    ],
  },
  {
    periodo: PeriodoEpoca.TRANSICAO,
    mesociclos: [
      {
        n: 6,
        inicio: "2026-04-01",
        fim: "2026-05-15",
        objetivos: "Manutenção competitiva e gestão de carga na reta final da época.",
      },
      {
        n: 7,
        inicio: "2026-05-16",
        fim: "2026-06-30",
        objetivos: "Fecho de época, jogo livre e avaliação individual.",
      },
    ],
  },
] as const;

// ─────────────────────────────────────────────
// E — Reuniões
// ─────────────────────────────────────────────

type ReuniaoDef = {
  titulo: string;
  data: string;
  ambito: AmbitoReuniao;
  ordemTrabalhos: string;
  ata: string;
};

const REUNIOES: readonly ReuniaoDef[] = [
  {
    titulo: "Reunião de arranque de época — equipa técnica",
    data: "2025-09-05",
    ambito: AmbitoReuniao.CLUBE,
    ordemTrabalhos: "1. Objetivos da época; 2. Calendário de treinos e jogos; 3. Metodologia de trabalho.",
    ata: "Definidos os objetivos desportivos e pedagógicos da época 2025/2026. Aprovado o calendário de treinos (terças, quintas e sábados) e a metodologia por períodos. Distribuídas responsabilidades pela equipa técnica.",
  },
  {
    titulo: "Reunião com encarregados de educação — Traquinas",
    data: "2025-09-20",
    ambito: AmbitoReuniao.ESCALAO,
    ordemTrabalhos: "1. Apresentação da equipa técnica; 2. Regras e valores; 3. Logística e comunicação.",
    ata: "Apresentada a equipa técnica e os objetivos do escalão. Reforçadas as regras de assiduidade e pontualidade. Combinado o canal de comunicação para convocatórias e avisos.",
  },
  {
    titulo: "Ponto de situação — 1.º período",
    data: "2025-11-15",
    ambito: AmbitoReuniao.ESCALAO,
    ordemTrabalhos: "1. Balanço dos primeiros jogos; 2. Assiduidade; 3. Ajustes ao plano.",
    ata: "Balanço positivo da fase inicial. Identificados casos de baixa assiduidade a acompanhar. Ajustado o plano do período competitivo com mais trabalho de finalização.",
  },
  {
    titulo: "Planeamento da 2.ª metade da época",
    data: "2026-01-10",
    ambito: AmbitoReuniao.CLUBE,
    ordemTrabalhos: "1. Revisão de objetivos; 2. Torneios a inscrever; 3. Gestão de plantel.",
    ata: "Revistos os objetivos face aos resultados. Definida a inscrição nos torneios de primavera. Acordada a gestão de minutos para garantir tempo de jogo equilibrado.",
  },
  {
    titulo: "Reunião com encarregados — preparação de torneios",
    data: "2026-03-21",
    ambito: AmbitoReuniao.ESCALAO,
    ordemTrabalhos: "1. Calendário de torneios; 2. Deslocações; 3. Autorizações.",
    ata: "Apresentado o calendário dos torneios de Évora, Elvas e Beja. Organizadas as deslocações e recolhidas as autorizações necessárias.",
  },
  {
    titulo: "Revisão de época e balanço final",
    data: "2026-06-20",
    ambito: AmbitoReuniao.CLUBE,
    ordemTrabalhos: "1. Balanço desportivo; 2. Evolução individual; 3. Preparação da próxima época.",
    ata: "Balanço global muito positivo da época. Destacada a evolução técnica e a assiduidade do grupo. Traçadas as primeiras linhas para a época seguinte.",
  },
] as const;

// ─────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────

function inicioDoDia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function fimDoDia(iso: string): Date {
  return new Date(`${iso}T23:59:59.999Z`);
}

// ─────────────────────────────────────────────
// Seed principal
// ─────────────────────────────────────────────

export async function seedSleExtra(prisma: PrismaClient): Promise<ResultadoSeedExtra> {
  // Pré-requisitos: clube, época e escalão têm de existir.
  const clube = await prisma.clube.findFirst({ where: { nome: NOME_CLUBE } });
  if (!clube) {
    return {
      ok: false,
      mensagem: `Clube "${NOME_CLUBE}" não existe. Corre primeiro o seed base (db:seed:sle).`,
    };
  }

  const epoca = await prisma.epoca.findFirst({
    where: { clubeId: clube.id, nome: NOME_EPOCA },
  });
  if (!epoca) {
    return { ok: false, mensagem: `Época "${NOME_EPOCA}" não encontrada para o clube.` };
  }

  const escalao = await prisma.escalao.findFirst({
    where: { clubeId: clube.id, nome: NOME_ESCALAO },
  });
  if (!escalao) {
    return { ok: false, mensagem: `Escalão "${NOME_ESCALAO}" não encontrado para o clube.` };
  }

  // Criador (utilizador) — primeiro membro do clube.
  const membros = await prisma.membroClube.findMany({
    where: { clubeId: clube.id },
    include: { utilizador: true },
  });
  const criador = membros[0]?.utilizador;
  if (!criador) {
    return { ok: false, mensagem: "Nenhum membro/utilizador encontrado para o clube." };
  }
  const criadorId = criador.id;
  const nomesMembros = membros.map((m) => m.utilizador.nome);

  // ── A — Subcategorias ──────────────────────────
  const subJaExiste = await prisma.subcategoriaExercicio.findFirst({
    where: { clubeId: clube.id, nome: SUBCATEGORIAS[0].nome },
  });
  if (!subJaExiste) {
    await prisma.subcategoriaExercicio.createMany({
      data: SUBCATEGORIAS.map((s) => ({
        clubeId: clube.id,
        nome: s.nome,
        categoria: s.categoria,
        ordem: s.ordem,
        sistema: true,
      })),
      skipDuplicates: true,
    });
  }
  const subcats = await prisma.subcategoriaExercicio.findMany({ where: { clubeId: clube.id } });
  const subMap = new Map<string, string>(subcats.map((s) => [s.nome, s.id]));

  // ── B — Exercícios ─────────────────────────────
  const exJaExiste = await prisma.exercicio.findFirst({
    where: { clubeId: clube.id, nome: EXERCICIOS[0].nome, origemSeed: true },
  });
  if (!exJaExiste) {
    await prisma.exercicio.createMany({
      data: EXERCICIOS.map((e) => ({
        nome: e.nome,
        descricao: e.descricao,
        objetivo: e.objetivo,
        duracaoMin: e.duracaoMin,
        categoriaPrincipal: e.categoria,
        subcategoriaId: e.subcat ? subMap.get(e.subcat) ?? null : null,
        parteTreino: e.parte,
        clubeId: clube.id,
        criadorId,
        proprietario: "CLUBE",
        origemSeed: true,
      })),
      skipDuplicates: true,
    });
  }
  const exercicios = await prisma.exercicio.findMany({
    where: { clubeId: clube.id, origemSeed: true },
  });
  const exByName = new Map(exercicios.map((e) => [e.nome, e]));
  const exOrdenados = EXERCICIOS.map((d) => exByName.get(d.nome)).filter(
    (x): x is NonNullable<typeof x> => Boolean(x),
  );

  // ── C — Ligar exercícios às sessões ────────────
  const sessoes = await prisma.sessao.findMany({
    where: { epocaId: epoca.id, escalaoId: escalao.id },
    orderBy: { data: "asc" },
  });
  let sessaoExerciciosCriados = 0;
  if (sessoes.length > 0 && exOrdenados.length > 0) {
    const primeira = sessoes[0];
    const jaLigada = await prisma.sessaoExercicio.findFirst({ where: { sessaoId: primeira.id } });
    if (!jaLigada) {
      for (let i = 0; i < sessoes.length; i++) {
        const n = 3 + (i % 3); // 3, 4 ou 5 exercícios
        const data = [];
        for (let k = 0; k < n; k++) {
          const ex = exOrdenados[(i * 5 + k) % exOrdenados.length];
          data.push({
            sessaoId: sessoes[i].id,
            exercicioId: ex.id,
            ordem: k,
            duracaoMin: 10 + ((i + k) % 3) * 5, // 10, 15 ou 20 min
          });
        }
        const r = await prisma.sessaoExercicio.createMany({ data, skipDuplicates: true });
        sessaoExerciciosCriados += r.count;
      }
    }
  }

  // ── D — Periodização + ligação às sessões ──────
  let planeamentosCriados = 0;
  let sessoesLigadas = 0;
  const planJaExiste = await prisma.planeamento.findFirst({
    where: { epocaId: epoca.id, escalaoId: escalao.id },
  });
  if (!planJaExiste) {
    for (const periodo of PERIODIZACAO) {
      for (const m of periodo.mesociclos) {
        const p = await prisma.planeamento.create({
          data: {
            clubeId: clube.id,
            escalaoId: escalao.id,
            epocaId: epoca.id,
            tipo: TipoPlaneamento.MENSAL,
            periodo: periodo.periodo,
            mesociclo: m.n,
            microciclo: 1,
            dataInicio: inicioDoDia(m.inicio),
            dataFim: fimDoDia(m.fim),
            objetivos: m.objetivos,
          },
        });
        planeamentosCriados++;
        const r = await prisma.sessao.updateMany({
          where: {
            epocaId: epoca.id,
            escalaoId: escalao.id,
            planeamentoId: null,
            data: { gte: inicioDoDia(m.inicio), lte: fimDoDia(m.fim) },
          },
          data: { planeamentoId: p.id },
        });
        sessoesLigadas += r.count;
      }
    }
  }

  // ── E — Reuniões ───────────────────────────────
  let reunioesCriadas = 0;
  const reuniaoJaExiste = await prisma.reuniao.findFirst({ where: { clubeId: clube.id } });
  if (!reuniaoJaExiste) {
    // Participantes: membros reais do clube (+ contexto para reuniões de escalão).
    const participantesBase = nomesMembros.join(", ");
    for (const r of REUNIOES) {
      const participantes =
        r.ambito === AmbitoReuniao.ESCALAO
          ? `${participantesBase}, Encarregados de educação (Traquinas)`
          : participantesBase;
      await prisma.reuniao.create({
        data: {
          clubeId: clube.id,
          ambito: r.ambito,
          escalaoId: r.ambito === AmbitoReuniao.ESCALAO ? escalao.id : null,
          titulo: r.titulo,
          data: inicioDoDia(r.data),
          participantes,
          ordemTrabalhos: r.ordemTrabalhos,
          ata: r.ata,
          criadorId,
        },
      });
      reunioesCriadas++;
    }
  }

  return {
    ok: true,
    mensagem: "Seed suplementar SLE concluído.",
    dados: {
      subcategorias: subcats.length,
      exercicios: exercicios.length,
      sessaoExercicios: sessaoExerciciosCriados,
      planeamentos: planeamentosCriados,
      sessoesLigadas,
      reunioes: reunioesCriadas,
    },
  };
}
