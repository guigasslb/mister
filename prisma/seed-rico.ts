/**
 * Seed RICO de dados históricos/analíticos (sandbox local).
 *
 * Popula a BD local com dados realistas (atletas, exercícios, sessões, presenças,
 * jogos, convocatórias, estatísticas, habilidades/progressos, competição, métricas
 * e planeamento) para que as personas beta-tester tenham material real para testar
 * analíticos, histórico, estatísticas e todos os flows do Mister.
 *
 * PRÉ-REQUISITO: prisma/seed-teste.ts já executado (clubes, épocas, utilizadores,
 * escalões e alguns atletas já existem).
 *
 * IDEMPOTENTE: cada bloco verifica a existência por chave natural antes de criar.
 * NUNCA apaga dados. Correr N vezes ⇒ mesmo estado final.
 *
 * Correr:
 *   DATABASE_URL="postgresql://mister_local:mister_local_pass@localhost:5432/mister_local" \
 *   DIRECT_URL="postgresql://mister_local:mister_local_pass@localhost:5432/mister_local" \
 *   npx tsx prisma/seed-rico.ts
 *
 * NOTAS DE ADAPTAÇÃO AO SCHEMA REAL (bíblia/schema.prisma):
 *  - As categorias de exercício do pedido (TECNICA_INDIVIDUAL, JOGO_REDUCIDO, …)
 *    não existem no enum. Mapeadas para CategoriaExercicioPrincipal
 *    (ATAQUE|DEFESA|TRANSICAO|BOLAS_PARADAS|FISICO|GUARDA_REDES|OUTRO) + ParteTreino.
 *  - Os escalões chamam-se "Benjamins" / "Seniores" / "Seniores Futsal" /
 *    "Sub-15 Futebol" (resolvidos por clube + modalidade da secção).
 *  - Os "top scorers" nomeados no pedido são honrados como FORMA da distribuição
 *    (2-3 jogadores marcam a maioria), aplicada aos jogadores do plantel por ordem
 *    de peso de finalização — não por nome literal — porque o plantel mistura
 *    atletas já existentes (nomes genéricos do seed-teste) com os novos.
 */
import {
  PrismaClient,
  Posicao,
  Modalidade,
  CategoriaExercicioPrincipal,
  ParteTreino,
  EstadoPresenca,
  MotivoFalta,
  TipoSessao,
  CasaFora,
  TipoJogo,
  FormatoJogo,
  Utilizacao,
  BlocoTempo,
  NivelHabilidade,
  EstadoHabilidade,
  TipoMetrica,
  FormatoCompeticao,
  EstadoResultado,
  TipoPlaneamento,
  PeriodoEpoca,
} from "@prisma/client";

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// RNG determinístico (mulberry32) — mesmo seed ⇒ mesmos dados.
// ─────────────────────────────────────────────────────────────
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFromString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Distribui `total` unidades (golos/assistências) por candidatos, proporcional a
 * `pesos`, com sorteio determinístico. Devolve int[] com sum === total.
 */
function distribuirPorPesos(total: number, pesos: number[], rng: () => number): number[] {
  const n = pesos.length;
  const res = new Array<number>(n).fill(0);
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (n === 0 || soma <= 0 || total <= 0) return res;
  for (let g = 0; g < total; g++) {
    let r = rng() * soma;
    for (let i = 0; i < n; i++) {
      r -= pesos[i];
      if (r <= 0) {
        res[i]++;
        break;
      }
      if (i === n - 1) res[i]++;
    }
  }
  return res;
}

// ─────────────────────────────────────────────────────────────
// Tipos internos
// ─────────────────────────────────────────────────────────────
type AtletaRoster = { id: string; nome: string; posicoes: Posicao[]; numero: number | null };

interface ExDef {
  nome: string;
  categoria: CategoriaExercicioPrincipal;
  parte: ParteTreino;
  duracaoMin: number;
  objetivo: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers de domínio
// ─────────────────────────────────────────────────────────────

function isGR(a: AtletaRoster): boolean {
  return a.posicoes.includes(Posicao.GUARDA_REDES);
}

/** Garante que o escalão tem `target` atletas ligados (época). Cria os que faltam. */
async function ensureAtletas(opts: {
  clubeId: string;
  escalaoId: string;
  epocaId: string;
  target: number;
  nomePool: string[];
  posPoolNovos: Posicao[][];
  anoBase: number; // ano de nascimento do 1.º novo atleta (decresce)
  encarregadoParaNovos: number; // nº de novos atletas com encarregado preenchido
}): Promise<AtletaRoster[]> {
  const { clubeId, escalaoId, epocaId, target, nomePool, posPoolNovos, anoBase, encarregadoParaNovos } = opts;

  // Atletas já ligados a este escalão/época.
  const ligados = await prisma.atletaEscalao.findMany({
    where: { escalaoId, epocaId },
    include: { atleta: true },
    orderBy: { numero: "asc" },
  });
  const roster: AtletaRoster[] = ligados.map((l) => ({
    id: l.atletaId,
    nome: l.atleta.nome,
    posicoes: l.atleta.posicoes,
    numero: l.numero ?? l.atleta.numero,
  }));

  if (roster.length >= target) return roster;

  // Nomes já usados no clube (para não repetir).
  const usados = new Set(
    (await prisma.atleta.findMany({ where: { clubeId }, select: { nome: true } })).map((a) => a.nome),
  );
  const disponiveis = nomePool.filter((n) => !usados.has(n));

  const numerosUsados = new Set(roster.map((r) => r.numero ?? 0));
  let proxNumero = 1;
  const nextNumero = () => {
    while (numerosUsados.has(proxNumero)) proxNumero++;
    numerosUsados.add(proxNumero);
    return proxNumero;
  };

  const aCriar = target - roster.length;
  for (let i = 0; i < aCriar; i++) {
    const nome = disponiveis[i] ?? `Atleta ${roster.length + i + 1}`;
    const posicoes = posPoolNovos[i % posPoolNovos.length];
    const numero = nextNumero();
    const comEncarregado = i < encarregadoParaNovos;
    const primeiroNome = nome.split(" ")[0];
    const atleta = await prisma.atleta.create({
      data: {
        nome,
        clubeId,
        numero,
        posicoes,
        dataNascimento: new Date(anoBase - i, (i * 3) % 12, ((i * 7) % 27) + 1),
        dataIngresso: new Date("2025-09-01"),
        ativo: true,
        ...(comEncarregado
          ? {
              encarregadoNome: `Encarregado de ${primeiroNome}`,
              encarregadoContacto: `9${String(10000000 + i * 137).slice(0, 8)}`,
              encarregadoEmail: `ee.${primeiroNome.toLowerCase()}@exemplo.pt`,
            }
          : {}),
      },
    });
    await prisma.atletaEscalao.create({
      data: { atletaId: atleta.id, escalaoId, epocaId, tipo: "PRINCIPAL", estado: "ATIVO", numero },
    });
    roster.push({ id: atleta.id, nome, posicoes, numero });
  }
  return roster;
}

/** Garante os exercícios do clube (por nome). Devolve lista ordenada de ids. */
async function ensureExercicios(
  clubeId: string,
  criadorId: string,
  modalidade: Modalidade,
  defs: ExDef[],
  contador?: { criados: number },
): Promise<string[]> {
  const ids: string[] = [];
  for (const d of defs) {
    const existente = await prisma.exercicio.findFirst({ where: { clubeId, nome: d.nome } });
    if (existente) {
      ids.push(existente.id);
      continue;
    }
    if (contador) contador.criados++;
    const criado = await prisma.exercicio.create({
      data: {
        nome: d.nome,
        clubeId,
        criadorId,
        autorId: criadorId,
        categoriaPrincipal: d.categoria,
        parteTreino: d.parte,
        duracaoMin: d.duracaoMin,
        objetivo: d.objetivo,
        descricao: d.objetivo,
        modalidade,
        proprietario: "CLUBE",
        clubeProprietarioId: clubeId,
      },
    });
    ids.push(criado.id);
  }
  return ids;
}

/** Gera `count` datas a partir de `start`, nos dias-da-semana indicados, à `hora`. */
function gerarDatasSessao(start: Date, count: number, weekdays: number[], hora: number): Date[] {
  const datas: Date[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (datas.length < count && guard < 2000) {
    if (weekdays.includes(cursor.getDay())) {
      const d = new Date(cursor);
      d.setHours(hora, 0, 0, 0);
      datas.push(d);
    }
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return datas;
}

/** Cria sessões (idempotente por escalaoId+data) com exercícios e presenças. */
async function ensureSessoes(opts: {
  escalaoId: string;
  epocaId: string;
  criadorId: string;
  roster: AtletaRoster[];
  datas: Date[];
  duracaoMin: number;
  local: string;
  exercicioIds: string[];
  tipoPorIndice: (i: number) => TipoSessao;
  objetivoPorIndice: (i: number) => string;
  taxaPresenca: number; // prob. de PRESENTE (0..1)
  rng: () => number;
}): Promise<number> {
  const {
    escalaoId,
    epocaId,
    criadorId,
    roster,
    datas,
    duracaoMin,
    local,
    exercicioIds,
    tipoPorIndice,
    objetivoPorIndice,
    taxaPresenca,
    rng,
  } = opts;

  let criadas = 0;
  for (let i = 0; i < datas.length; i++) {
    const data = datas[i];
    const existente = await prisma.sessao.findFirst({ where: { escalaoId, data } });
    if (existente) continue;

    const sessao = await prisma.sessao.create({
      data: {
        data,
        duracaoMin,
        rpeSessao: randInt(rng, 5, 9),
        objetivo: objetivoPorIndice(i),
        local,
        escalaoId,
        epocaId,
        criadorId,
        tipoSessao: tipoPorIndice(i),
      },
    });
    criadas++;

    // 3-4 exercícios por sessão (janela rotativa determinística).
    const nEx = 3 + (i % 2); // 3 ou 4
    const inicio = exercicioIds.length ? i % exercicioIds.length : 0;
    const exData = [];
    for (let k = 0; k < nEx && exercicioIds.length > 0; k++) {
      const exId = exercicioIds[(inicio + k) % exercicioIds.length];
      exData.push({
        sessaoId: sessao.id,
        exercicioId: exId,
        ordem: k,
        duracaoMin: randInt(rng, 10, 20),
      });
    }
    if (exData.length) await prisma.sessaoExercicio.createMany({ data: exData, skipDuplicates: true });

    // Presenças para todo o plantel.
    const presData = roster.map((a) => {
      const r = rng();
      let estado: EstadoPresenca = EstadoPresenca.PRESENTE;
      let motivo: MotivoFalta | null = null;
      if (r >= taxaPresenca) {
        const resto = (r - taxaPresenca) / (1 - taxaPresenca); // 0..1
        if (resto < 0.55) {
          estado = EstadoPresenca.FALTA;
          motivo = MotivoFalta.SEM_JUSTIFICACAO;
        } else if (resto < 0.8) {
          estado = EstadoPresenca.FALTA_JUSTIFICADA;
          motivo = MotivoFalta.DOENCA;
        } else if (resto < 0.95) {
          estado = EstadoPresenca.LESIONADO;
          motivo = MotivoFalta.LESAO;
        } else {
          estado = EstadoPresenca.ATRASADO;
        }
      }
      return {
        sessaoId: sessao.id,
        atletaId: a.id,
        escalaoId,
        estado,
        motivo,
      };
    });
    await prisma.presenca.createMany({ data: presData, skipDuplicates: true });
  }
  return criadas;
}

interface JogoPlan {
  adversario: string;
  gf: number;
  ga: number;
  casaFora: CasaFora;
  competicao: string;
  data: Date;
}

/** Cria jogos (idempotente por escalaoId+adversario+data) + convocatória + estatísticas. */
async function ensureJogos(opts: {
  escalaoId: string;
  epocaId: string;
  criadorId: string;
  roster: AtletaRoster[];
  jogos: JogoPlan[];
  formato: FormatoJogo;
  modalidade: Modalidade;
  local: string;
  rng: () => number;
}): Promise<{ criados: number; jogoIds: string[] }> {
  const { escalaoId, epocaId, criadorId, roster, jogos, formato, modalidade, local, rng } = opts;

  const grs = roster.filter(isGR);
  const fields = roster.filter((a) => !isGR(a));
  // Peso de finalização fixo por jogador de campo (front-loaded: 2-3 marcam a maioria).
  const templatePesos = [14, 10, 8, 6, 5, 4, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1];
  const pesoFinalizacao = new Map<string, number>();
  fields.forEach((a, i) => pesoFinalizacao.set(a.id, templatePesos[i] ?? 1));
  // Peso de assistência: ligeiramente rodado (meias/alas criam mais).
  const pesoAssist = new Map<string, number>();
  fields.forEach((a, i) => pesoAssist.set(a.id, templatePesos[(i + 2) % templatePesos.length] ?? 1));

  const futebol = modalidade === Modalidade.FUTEBOL;
  const nTitulares = futebol ? 11 : 5;
  const jogoIds: string[] = [];
  let criados = 0;

  for (let gi = 0; gi < jogos.length; gi++) {
    const jp = jogos[gi];

    let jogo = await prisma.jogo.findFirst({
      where: { escalaoId, adversario: jp.adversario, data: jp.data },
    });
    if (!jogo) {
      jogo = await prisma.jogo.create({
        data: {
          data: jp.data,
          adversario: jp.adversario,
          casaFora: jp.casaFora,
          tipo: TipoJogo.OFICIAL,
          competicao: jp.competicao,
          golosMarcados: jp.gf,
          golosSofridos: jp.ga,
          faltas1aParte: modalidade === Modalidade.FUTSAL ? randInt(rng, 0, 5) : null,
          faltas2aParte: modalidade === Modalidade.FUTSAL ? randInt(rng, 0, 5) : null,
          local,
          formato,
          escalaoId,
          epocaId,
          criadorId,
          relatorio:
            jp.gf > jp.ga
              ? `Vitória ${jp.gf}-${jp.ga} frente ao ${jp.adversario}. Boa reação da equipa.`
              : jp.gf === jp.ga
                ? `Empate ${jp.gf}-${jp.ga} com o ${jp.adversario}. Faltou eficácia.`
                : `Derrota ${jp.gf}-${jp.ga} frente ao ${jp.adversario}. A corrigir na próxima.`,
        },
      });
      criados++;
    }
    jogoIds.push(jogo.id);

    // ── Convocatória: 1 GR + janela rotativa de jogadores de campo ──
    const grConvocado = grs.length ? grs[gi % grs.length] : undefined;
    const convFields = Math.min(fields.length, futebol ? 14 : 9);
    // top 6 sempre; resto por janela rotativa
    const topN = Math.min(6, fields.length);
    const selecionados: AtletaRoster[] = fields.slice(0, topN);
    const restantes = fields.slice(topN);
    for (let k = 0; k < convFields - topN && restantes.length > 0; k++) {
      selecionados.push(restantes[(gi + k) % restantes.length]);
    }
    const convocados: AtletaRoster[] = [];
    if (grConvocado) convocados.push(grConvocado);
    // 2.º GR ocasionalmente (futebol/seniores)
    if (grs.length > 1 && gi % 3 === 0) convocados.push(grs[(gi + 1) % grs.length]);
    for (const f of selecionados) if (!convocados.find((c) => c.id === f.id)) convocados.push(f);

    const convData = convocados.map((a, idx) => ({
      jogoId: jogo!.id,
      atletaId: a.id,
      convocado: true,
      titularPrevisto: idx < nTitulares,
    }));
    await prisma.convocatoria.createMany({ data: convData, skipDuplicates: true });

    // ── Estatísticas ──
    // Golos/assistências só entre jogadores de campo convocados.
    const camposConvocados = convocados.filter((a) => !isGR(a));
    const pesosGolo = camposConvocados.map((a) => pesoFinalizacao.get(a.id) ?? 1);
    const pesosAss = camposConvocados.map((a) => pesoAssist.get(a.id) ?? 1);
    const golosArr = distribuirPorPesos(jp.gf, pesosGolo, rng);
    const totalAssist = Math.round(jp.gf * 0.6);
    const assistArr = distribuirPorPesos(totalAssist, pesosAss, rng);

    const golosDe = new Map<string, number>();
    const assistDe = new Map<string, number>();
    camposConvocados.forEach((a, i) => {
      golosDe.set(a.id, golosArr[i]);
      assistDe.set(a.id, assistArr[i]);
    });

    const estatData = convocados.map((a, idx) => {
      const titular = idx < nTitulares;
      const gr = isGR(a);
      // O 1.º GR convocado é o titular que "leva" os golos sofridos.
      const grTitular = gr && a.id === (grConvocado?.id ?? "");
      let utilizacao: Utilizacao = titular ? Utilizacao.TITULAR : Utilizacao.UTILIZADO;
      // Um ou dois convocados não chegam a jogar.
      if (!titular && idx >= convocados.length - (gi % 2 === 0 ? 1 : 2)) {
        utilizacao = Utilizacao.NAO_UTILIZADO;
      }
      const jogou = utilizacao !== Utilizacao.NAO_UTILIZADO;

      const minutos = !jogou
        ? null
        : titular
          ? futebol
            ? randInt(rng, 60, 90)
            : 40
          : futebol
            ? randInt(rng, 10, 45)
            : randInt(rng, 5, 30);

      const bloco: BlocoTempo = !jogou
        ? BlocoTempo.NAO_JOGOU
        : titular
          ? BlocoTempo.JOGO_COMPLETO
          : BlocoTempo.BLOCO_10MIN;

      return {
        jogoId: jogo!.id,
        atletaId: a.id,
        utilizacao,
        blocoTempo: bloco,
        minutos,
        golos: gr ? 0 : (golosDe.get(a.id) ?? 0),
        assistencias: gr ? 0 : (assistDe.get(a.id) ?? 0),
        faltasCometidas: jogou ? randInt(rng, 0, 3) : 0,
        defesas: gr && jogou ? randInt(rng, 3, 10) : gr ? 0 : null,
        golosSofridosGR: grTitular ? jp.ga : gr ? 0 : null,
        // Núcleo de futebol (só preenchido em jogos de futebol)
        remates: futebol && jogou && !gr ? randInt(rng, 0, 4) : null,
        cantos: futebol && jogou && !gr ? randInt(rng, 0, 2) : null,
        forasDeJogo: futebol && jogou && !gr ? randInt(rng, 0, 2) : null,
        desarmes: futebol && jogou && !gr ? randInt(rng, 0, 5) : null,
      };
    });
    await prisma.estatisticaAtleta.createMany({ data: estatData, skipDuplicates: true });
  }
  return { criados, jogoIds };
}

/** Cria habilidades (por nome) + progressos para os primeiros `nAtletas` do plantel. */
async function ensureHabilidadesEProgressos(opts: {
  clubeId: string;
  epocaId: string;
  roster: AtletaRoster[];
  nAtletas: number;
  rng: () => number;
}): Promise<{ habilidades: number; progressos: number }> {
  const { clubeId, epocaId, roster, nAtletas, rng } = opts;
  const defs: { nome: string; nivel: NivelHabilidade }[] = [
    { nome: "Passe de Interior", nivel: NivelHabilidade.BASICO },
    { nome: "Receção Orientada", nivel: NivelHabilidade.BASICO },
    { nome: "Condução de Bola", nivel: NivelHabilidade.BASICO },
    { nome: "Vírgula", nivel: NivelHabilidade.INTERMEDIO },
    { nome: "Meia-Lua", nivel: NivelHabilidade.INTERMEDIO },
    { nome: "Rolinho", nivel: NivelHabilidade.INTERMEDIO },
    { nome: "Elástico", nivel: NivelHabilidade.AVANCADO },
    { nome: "Chapéu", nivel: NivelHabilidade.AVANCADO },
    { nome: "Flip-Flap", nivel: NivelHabilidade.AVANCADO },
  ];
  const habIds: string[] = [];
  let habCriadas = 0;
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    let h = await prisma.habilidade.findFirst({ where: { clubeId, nome: d.nome } });
    if (!h) {
      h = await prisma.habilidade.create({
        data: { clubeId, nome: d.nome, nivel: d.nivel, ordem: i, modalidade: Modalidade.FUTSAL },
      });
      habCriadas++;
    }
    habIds.push(h.id);
  }

  const alvo = roster.slice(0, nAtletas);
  const progData: {
    atletaId: string;
    habilidadeId: string;
    epocaId: string;
    estado: EstadoHabilidade;
    dataDesbloqueio: Date | null;
  }[] = [];
  for (const a of alvo) {
    for (const hId of habIds) {
      const r = rng();
      let estado: EstadoHabilidade = EstadoHabilidade.NAO_INICIADO;
      let dataDesbloqueio: Date | null = null;
      if (r < 0.4) {
        estado = EstadoHabilidade.DESBLOQUEADO;
        dataDesbloqueio = new Date(2025, 9 + randInt(rng, 0, 3), randInt(rng, 1, 27));
      } else if (r < 0.75) {
        estado = EstadoHabilidade.EM_PROGRESSO;
      }
      progData.push({ atletaId: a.id, habilidadeId: hId, epocaId, estado, dataDesbloqueio });
    }
  }
  const res = await prisma.progressoHabilidade.createMany({ data: progData, skipDuplicates: true });
  return { habilidades: habCriadas, progressos: res.count };
}

// ─────────────────────────────────────────────────────────────
// Definições de exercícios
// ─────────────────────────────────────────────────────────────
const EX_MIUDOS: ExDef[] = [
  { nome: "Roda de Passe", categoria: CategoriaExercicioPrincipal.ATAQUE, parte: ParteTreino.AQUECIMENTO, duracaoMin: 10, objetivo: "Aquecimento com bola: qualidade de passe e receção." },
  { nome: "1x1 no Corredor", categoria: CategoriaExercicioPrincipal.ATAQUE, parte: ParteTreino.PRINCIPAL, duracaoMin: 15, objetivo: "Duelos individuais ofensivos no corredor." },
  { nome: "Jogo Reduzido 3x3", categoria: CategoriaExercicioPrincipal.TRANSICAO, parte: ParteTreino.JOGO_REDUZIDO, duracaoMin: 20, objetivo: "Tomada de decisão em espaço reduzido." },
  { nome: "Condução em Slalom", categoria: CategoriaExercicioPrincipal.ATAQUE, parte: ParteTreino.PRINCIPAL, duracaoMin: 10, objetivo: "Condução de bola com mudanças de direção." },
  { nome: "GR vs Atacante", categoria: CategoriaExercicioPrincipal.GUARDA_REDES, parte: ParteTreino.PRINCIPAL, duracaoMin: 15, objetivo: "Finalização isolada e resposta do guarda-redes." },
  { nome: "Passe e Vai", categoria: CategoriaExercicioPrincipal.ATAQUE, parte: ParteTreino.PRINCIPAL, duracaoMin: 15, objetivo: "Combinações de passe e movimento." },
  { nome: "Saída de Bola Simples", categoria: CategoriaExercicioPrincipal.ATAQUE, parte: ParteTreino.PRINCIPAL, duracaoMin: 10, objetivo: "Primeira fase de construção a partir do GR." },
  { nome: "Jogo Livre", categoria: CategoriaExercicioPrincipal.TRANSICAO, parte: ParteTreino.JOGO_REDUZIDO, duracaoMin: 30, objetivo: "Jogo formal para aplicação dos conteúdos." },
];

const EX_SENIORES: ExDef[] = [
  { nome: "Pressão Alta 4-0", categoria: CategoriaExercicioPrincipal.DEFESA, parte: ParteTreino.PRINCIPAL, duracaoMin: 20, objetivo: "Organização defensiva em pressão alta." },
  { nome: "Saída de Pressão 3+1", categoria: CategoriaExercicioPrincipal.ATAQUE, parte: ParteTreino.PRINCIPAL, duracaoMin: 20, objetivo: "Construção sob pressão adversária." },
  { nome: "Transição Ofensiva 3x2", categoria: CategoriaExercicioPrincipal.TRANSICAO, parte: ParteTreino.PRINCIPAL, duracaoMin: 15, objetivo: "Ataque rápido em superioridade." },
  { nome: "Manutenção 4x4+2", categoria: CategoriaExercicioPrincipal.ATAQUE, parte: ParteTreino.PRINCIPAL, duracaoMin: 20, objetivo: "Manutenção de posse com apoios." },
  { nome: "GR + 3 vs 2 Pivot", categoria: CategoriaExercicioPrincipal.ATAQUE, parte: ParteTreino.PRINCIPAL, duracaoMin: 20, objetivo: "Finalização com jogo de pivot." },
  { nome: "Esquema de Canto", categoria: CategoriaExercicioPrincipal.BOLAS_PARADAS, parte: ParteTreino.PRINCIPAL, duracaoMin: 15, objetivo: "Rotinas de bola parada ofensiva." },
  { nome: "Velocidade de Decisão", categoria: CategoriaExercicioPrincipal.ATAQUE, parte: ParteTreino.PRINCIPAL, duracaoMin: 15, objetivo: "Decisão rápida em posse." },
  { nome: "Jogo 5x5 Condicionado", categoria: CategoriaExercicioPrincipal.TRANSICAO, parte: ParteTreino.JOGO_REDUZIDO, duracaoMin: 30, objetivo: "Jogo formal com condicionantes táticas." },
  { nome: "Técnica de GR: Reflexos", categoria: CategoriaExercicioPrincipal.GUARDA_REDES, parte: ParteTreino.PRINCIPAL, duracaoMin: 15, objetivo: "Reflexos e posicionamento do guarda-redes." },
  { nome: "Aquecimento com Bola", categoria: CategoriaExercicioPrincipal.FISICO, parte: ParteTreino.AQUECIMENTO, duracaoMin: 15, objetivo: "Ativação físico-técnica com bola." },
];

// ─────────────────────────────────────────────────────────────
// Pools de nomes
// ─────────────────────────────────────────────────────────────
const NOMES_MIUDOS = ["Afonso", "Bernardo", "Carlos", "David", "Eduardo", "Fábio", "Gonçalo", "Hugo", "Ivo", "João", "Luís", "Miguel"];
const NOMES_SENIORES = ["António", "Bruno", "Carlos", "Dinis", "Eduardo", "Filipe", "Gonçalo", "Hélder", "Ivan", "João", "Kiko", "Luís", "Marco", "Nuno", "Orlando", "Pedro"];
const NOMES_ESTRELA_FUTSAL = ["Sérgio", "Tomás", "Vasco", "Xavier", "Rafael", "Simão", "Duarte", "Martim", "Rúben", "Tiago", "Diogo", "Guilherme", "Rodrigo", "Samuel", "Vítor", "Alexandre"];
const NOMES_ESTRELA_FUTEBOL = ["Salvador", "Santiago", "Lourenço", "Vicente", "Gabriel", "Gustavo", "Leonardo", "Henrique", "Afonso F.", "Bernardo F.", "Dinis F.", "Rafael F.", "Tomás F.", "Duarte F.", "Martim F.", "Rúben F."];

// Position pools para novos atletas
const POS_MIUDOS: Posicao[][] = [
  [Posicao.GUARDA_REDES],
  [Posicao.ALA],
  [Posicao.PIVO],
  [Posicao.FIXO],
  [Posicao.ALA],
  [Posicao.PIVO],
  [Posicao.UNIVERSAL],
  [Posicao.ALA],
  [Posicao.PIVO],
  [Posicao.FIXO],
  [Posicao.ALA],
  [Posicao.PIVO],
];
const POS_FUTSAL_SR: Posicao[][] = [
  [Posicao.GUARDA_REDES],
  [Posicao.GUARDA_REDES],
  [Posicao.ALA],
  [Posicao.ALA],
  [Posicao.PIVO],
  [Posicao.FIXO],
  [Posicao.ALA],
  [Posicao.ALA],
  [Posicao.PIVO],
  [Posicao.FIXO],
  [Posicao.ALA],
  [Posicao.PIVO],
  [Posicao.ALA],
  [Posicao.PIVO],
  [Posicao.ALA],
  [Posicao.UNIVERSAL],
];
const POS_FUTEBOL: Posicao[][] = [
  [Posicao.GUARDA_REDES],
  [Posicao.GUARDA_REDES],
  [Posicao.DEFESA_CENTRAL],
  [Posicao.DEFESA_CENTRAL],
  [Posicao.LATERAL_DIREITO],
  [Posicao.LATERAL_ESQUERDO],
  [Posicao.MEDIO_DEFENSIVO],
  [Posicao.MEDIO_CENTRO],
  [Posicao.MEDIO_CENTRO],
  [Posicao.MEDIO_OFENSIVO],
  [Posicao.EXTREMO_DIREITO],
  [Posicao.EXTREMO_ESQUERDO],
  [Posicao.AVANCADO],
  [Posicao.AVANCADO],
  [Posicao.MEDIO_CENTRO],
  [Posicao.DEFESA_CENTRAL],
];

// ─────────────────────────────────────────────────────────────
// Planos de jogos (scorelines pré-desenhadas ⇒ W/D/L realistas)
// ─────────────────────────────────────────────────────────────
const ADV_MIUDOS = ["CD Modelo", "GD Esperança", "SC Vitória", "FC Amigos", "AD Sporting", "GD União", "CD Atlético", "FC Local"];
const SCORE_MIUDOS: [number, number][] = [[4, 1], [3, 2], [5, 2], [2, 0], [3, 1], [2, 2], [1, 3], [2, 4]]; // 5V 1E 2D

const SCORE_FCI: [number, number][] = [
  [3, 1], [2, 0], [2, 1], [3, 2], [4, 3], [2, 1], [3, 1], [2, 0], [2, 1], // 9V
  [2, 2], [1, 1], [2, 2], [1, 1], // 4E
  [1, 2], [0, 1], [1, 3], [1, 2], [1, 3], // 5D
]; // GF=33 GA=27

const SCORE_ESTRELA_FUTSAL: [number, number][] = [
  [4, 2], [3, 1], [2, 0], [3, 2], [5, 3], [2, 1], [4, 1], [3, 0], // 8V
  [2, 2], [1, 1], [3, 3], [2, 2], // 4E
  [1, 2], [2, 3], [0, 1], // 3D
];
const SCORE_ESTRELA_FUTEBOL: [number, number][] = [
  [3, 1], [2, 0], [4, 2], [2, 1], [3, 0], [1, 0], // 6V
  [1, 1], [2, 2], [0, 0], // 3E
  [0, 2], [1, 3], [1, 2], // 3D
];

const ADV_POOL = [
  "GD Esperança", "SC Vitória", "FC Amigos", "AD Sporting", "GD União", "CD Atlético", "FC Local",
  "CS Marítimo B", "AD Ovarense", "GRECAS", "Nun'Álvares", "Modicus", "Eléctrico", "Sporting Ideal",
  "AR Freixieiro", "Vialonga", "Quinta dos Lombos", "Fundão", "Belenenses", "Portimonense",
];

function planoJogos(scores: [number, number][], competicaoDe: (i: number) => string, start: Date, gapDias: number): JogoPlan[] {
  return scores.map(([gf, ga], i) => {
    const data = new Date(start);
    data.setDate(data.getDate() + i * gapDias);
    data.setHours(gf > ga ? 17 : 18, 0, 0, 0);
    return {
      adversario: i === 0 && competicaoDe(i).includes("Taça") ? "GD Taça FC" : ADV_POOL[i % ADV_POOL.length] + (i >= ADV_POOL.length ? " II" : ""),
      gf,
      ga,
      casaFora: i % 2 === 0 ? CasaFora.CASA : CasaFora.FORA,
      competicao: competicaoDe(i),
      data,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Competição (SC Estrela) — round-robin duplo de 8 equipas (14 jornadas)
// ─────────────────────────────────────────────────────────────
async function ensureCompeticao(opts: {
  clubeId: string;
  escalaoId: string;
  epocaId: string;
  rng: () => number;
}): Promise<{ criada: boolean; equipas: number; resultados: number }> {
  const { clubeId, escalaoId, epocaId, rng } = opts;
  const nome = "Liga Regional 2025/26";
  const existente = await prisma.competicao.findFirst({ where: { clubeId, nome } });
  if (existente) return { criada: false, equipas: 0, resultados: 0 };

  const comp = await prisma.competicao.create({
    data: {
      clubeId,
      escalaoId,
      epocaId,
      nome,
      tipo: TipoJogo.OFICIAL,
      formato: FormatoCompeticao.LIGA,
      formatoJogo: FormatoJogo.FUTSAL_5,
    },
  });

  const equipas = [
    "SC Estrela", "CD Modelo", "GD Esperança", "SC Vitória",
    "FC Amigos", "AD Sporting", "GD União", "CD Atlético",
  ];
  await prisma.equipaCompeticao.createMany({
    data: equipas.map((n, i) => ({ competicaoId: comp.id, nome: n, posicao: i + 1 })),
    skipDuplicates: true,
  });

  // Circle method (8 equipas ⇒ 7 rondas). Duplicado ⇒ 14 jornadas.
  const n = equipas.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  const rondasBase: [number, number][][] = [];
  const arr = idx.slice();
  for (let r = 0; r < n - 1; r++) {
    const jogos: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      jogos.push([a, b]);
    }
    rondasBase.push(jogos);
    // rotaciona mantendo o 1.º fixo
    const fixo = arr[0];
    const resto = arr.slice(1);
    resto.unshift(resto.pop() as number);
    arr.splice(0, arr.length, fixo, ...resto);
  }

  const inicio = new Date("2025-09-14T18:00:00");
  const resultadosData: {
    competicaoId: string;
    equipaCasa: string;
    equipaFora: string;
    golosCasa: number | null;
    golosFora: number | null;
    ronda: number;
    dataHora: Date;
    data: Date;
    estado: EstadoResultado;
  }[] = [];

  for (let jornada = 1; jornada <= 14; jornada++) {
    const base = rondasBase[(jornada - 1) % (n - 1)];
    const segundaVolta = jornada > n - 1;
    const dataHora = new Date(inicio);
    dataHora.setDate(dataHora.getDate() + (jornada - 1) * 7);
    const realizada = jornada <= 6;
    for (const [a, b] of base) {
      const casaIdx = segundaVolta ? b : a;
      const foraIdx = segundaVolta ? a : b;
      resultadosData.push({
        competicaoId: comp.id,
        equipaCasa: equipas[casaIdx],
        equipaFora: equipas[foraIdx],
        golosCasa: realizada ? randInt(rng, 0, 5) : null,
        golosFora: realizada ? randInt(rng, 0, 4) : null,
        ronda: jornada,
        dataHora,
        data: dataHora,
        estado: realizada ? EstadoResultado.REALIZADO : EstadoResultado.AGENDADO,
      });
    }
  }
  const res = await prisma.resultadoCompeticao.createMany({ data: resultadosData, skipDuplicates: true });
  return { criada: true, equipas: equipas.length, resultados: res.count };
}

// ─────────────────────────────────────────────────────────────
// Métricas configuráveis (SC Estrela) + valores nos últimos 5 jogos futsal
// ─────────────────────────────────────────────────────────────
async function ensureMetricas(opts: {
  clubeId: string;
  jogoIdsFutsal: string[];
  rng: () => number;
}): Promise<{ metricas: number; valores: number }> {
  const { clubeId, jogoIdsFutsal, rng } = opts;

  async function ensureMetrica(nome: string, tipo: TipoMetrica, ordem: number) {
    let m = await prisma.metricaConfig.findFirst({ where: { clubeId, nome } });
    if (!m) {
      m = await prisma.metricaConfig.create({ data: { clubeId, nome, tipo, ordem, ativa: true } });
      return { id: m.id, criada: true };
    }
    return { id: m.id, criada: false };
  }

  const remates = await ensureMetrica("Remates à baliza", TipoMetrica.NUMERO, 0);
  const nota = await ensureMetrica("Nota de desempenho", TipoMetrica.ESCALA, 1);
  const metricasCriadas = (remates.criada ? 1 : 0) + (nota.criada ? 1 : 0);

  const ultimos5 = jogoIdsFutsal.slice(-5);
  let valores = 0;
  for (const jogoId of ultimos5) {
    const estats = await prisma.estatisticaAtleta.findMany({ where: { jogoId }, select: { id: true } });
    const data = estats.flatMap((e) => [
      { metricaId: remates.id, estatisticaId: e.id, valor: randInt(rng, 0, 6) },
      { metricaId: nota.id, estatisticaId: e.id, valor: randInt(rng, 4, 10) },
    ]);
    if (data.length) {
      const r = await prisma.valorMetrica.createMany({ data, skipDuplicates: true });
      valores += r.count;
    }
  }
  return { metricas: metricasCriadas, valores };
}

// ─────────────────────────────────────────────────────────────
// Planeamento / periodização (FC Independente)
// ─────────────────────────────────────────────────────────────
async function ensurePlaneamento(opts: {
  clubeId: string;
  escalaoId: string;
  epocaId: string;
}): Promise<number> {
  const { clubeId, escalaoId, epocaId } = opts;
  const existentes = await prisma.planeamento.count({ where: { escalaoId, epocaId } });
  if (existentes > 0) return 0;

  let criados = 0;
  // 3 macro-períodos (MENSAL, com periodo).
  const periodos: { periodo: PeriodoEpoca; nome: string; inicio: string; fim: string; obj: string }[] = [
    { periodo: PeriodoEpoca.PREPARATORIO, nome: "Período Preparatório", inicio: "2025-09-01", fim: "2025-10-31", obj: "Base física e assimilação de princípios de jogo." },
    { periodo: PeriodoEpoca.COMPETITIVO, nome: "Período Competitivo", inicio: "2025-11-01", fim: "2026-05-31", obj: "Manutenção de forma e foco na competição." },
    { periodo: PeriodoEpoca.TRANSICAO, nome: "Período de Transição", inicio: "2026-06-01", fim: "2026-06-30", obj: "Recuperação ativa e avaliação da época." },
  ];
  for (const p of periodos) {
    await prisma.planeamento.create({
      data: {
        clubeId,
        escalaoId,
        epocaId,
        tipo: TipoPlaneamento.MENSAL,
        periodo: p.periodo,
        nome: p.nome,
        dataInicio: new Date(p.inicio),
        dataFim: new Date(p.fim),
        objetivos: p.obj,
      },
    });
    criados++;
  }

  // 8 microciclos semanais no período competitivo.
  const primeiraSemana = new Date("2025-11-03"); // segunda-feira
  for (let s = 0; s < 8; s++) {
    const inicio = new Date(primeiraSemana);
    inicio.setDate(inicio.getDate() + s * 7);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 6);
    await prisma.planeamento.create({
      data: {
        clubeId,
        escalaoId,
        epocaId,
        tipo: TipoPlaneamento.SEMANAL,
        periodo: PeriodoEpoca.COMPETITIVO,
        microciclo: s + 1,
        nome: `Semana ${s + 1}`,
        dataInicio: inicio,
        dataFim: fim,
        objetivos: s % 2 === 0 ? "Microciclo de carga (foco defensivo)." : "Microciclo de ajuste (foco ofensivo / bolas paradas).",
      },
    });
    criados++;
  }
  return criados;
}

// ─────────────────────────────────────────────────────────────
// Resolução de contexto (clubes/épocas/escalões/utilizadores)
// ─────────────────────────────────────────────────────────────
async function contexto() {
  const nomes = ["Atlético dos Miúdos", "FC Independente", "SC Estrela"];
  const ctx: Record<string, any> = {};
  for (const nome of nomes) {
    const clube = await prisma.clube.findFirst({ where: { nome } });
    if (!clube) return null;
    const epoca = await prisma.epoca.findFirst({ where: { clubeId: clube.id, ativa: true } });
    if (!epoca) return null;
    const escaloes = await prisma.escalao.findMany({ where: { clubeId: clube.id }, include: { seccao: true } });
    ctx[nome] = { clube, epoca, escaloes };
  }
  const userBy = async (email: string) => {
    const u = await prisma.utilizador.findUnique({ where: { email } });
    return u?.id ?? null;
  };
  ctx.users = {
    miudos: await userBy("solo.miudos@teste.pt"),
    seniores: await userBy("solo.seniores@teste.pt"),
    estrelaAdmin: await userBy("clube.seniores@teste.pt"),
    estrelaDiretor: await userBy("diretor@estrela.pt"),
  };
  return ctx;
}

function escalaoPorModalidade(escaloes: any[], modalidade: Modalidade) {
  return escaloes.find((e) => e.seccao?.modalidade === modalidade) ?? escaloes[0];
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  const ctx = await contexto();
  if (!ctx) {
    console.log("❌ Estrutura base em falta. Corre primeiro `npx tsx prisma/seed-teste.ts`. A abortar.");
    return;
  }

  const totais = {
    atletasCriados: 0,
    exercicios: 0,
    sessoes: 0,
    jogos: 0,
    habilidades: 0,
    progressos: 0,
    competicaoEquipas: 0,
    competicaoResultados: 0,
    metricas: 0,
    valoresMetrica: 0,
    planeamentos: 0,
  };

  // ═══════════════════════════════════════════════════════════
  // 1) Atlético dos Miúdos — Benjamins (futsal, formação)
  // ═══════════════════════════════════════════════════════════
  {
    const { clube, epoca, escaloes } = ctx["Atlético dos Miúdos"];
    const escalao = escalaoPorModalidade(escaloes, Modalidade.FUTSAL);
    const criadorId = ctx.users.miudos;
    const rng = makeRng(seedFromString("miudos"));

    const rosterAntes = await prisma.atletaEscalao.count({ where: { escalaoId: escalao.id, epocaId: epoca.id } });
    const roster = await ensureAtletas({
      clubeId: clube.id,
      escalaoId: escalao.id,
      epocaId: epoca.id,
      target: 12,
      nomePool: NOMES_MIUDOS,
      posPoolNovos: POS_MIUDOS,
      anoBase: 2016,
      encarregadoParaNovos: 2,
    });
    totais.atletasCriados += Math.max(0, roster.length - rosterAntes);

    const cEx = { criados: 0 };
    const exIds = await ensureExercicios(clube.id, criadorId, Modalidade.FUTSAL, EX_MIUDOS, cEx);
    totais.exercicios += cEx.criados;

    const datas = gerarDatasSessao(new Date("2025-09-01"), 20, [1, 3], 18); // seg+qua 18h
    const criadas = await ensureSessoes({
      escalaoId: escalao.id,
      epocaId: epoca.id,
      criadorId,
      roster,
      datas,
      duracaoMin: 90,
      local: "Pavilhão Municipal",
      exercicioIds: exIds,
      tipoPorIndice: (i) => (i === 18 ? TipoSessao.CAPTACAO : i === 19 ? TipoSessao.EVENTO : TipoSessao.NORMAL),
      objetivoPorIndice: (i) => (i % 2 === 0 ? "Técnica individual e jogo reduzido." : "Finalização e transições."),
      taxaPresenca: 0.88,
      rng,
    });
    totais.sessoes += criadas;

    const jogos = ADV_MIUDOS.map((adv, i): JogoPlan => {
      const data = new Date("2025-10-04T00:00:00");
      data.setDate(data.getDate() + i * 21); // ~1/mês
      const [gf, ga] = SCORE_MIUDOS[i];
      data.setHours(gf > ga ? 10 : 11, 0, 0, 0);
      return { adversario: adv, gf, ga, casaFora: i % 2 === 0 ? CasaFora.CASA : CasaFora.FORA, competicao: "Convívio Distrital", data };
    });
    const { criados } = await ensureJogos({
      escalaoId: escalao.id,
      epocaId: epoca.id,
      criadorId,
      roster,
      jogos,
      formato: FormatoJogo.FUTSAL_5,
      modalidade: Modalidade.FUTSAL,
      local: "Pavilhão Municipal",
      rng,
    });
    totais.jogos += criados;

    const hp = await ensureHabilidadesEProgressos({ clubeId: clube.id, epocaId: epoca.id, roster, nAtletas: 6, rng });
    totais.habilidades += hp.habilidades;
    totais.progressos += hp.progressos;
  }

  // ═══════════════════════════════════════════════════════════
  // 2) FC Independente — Seniores (futsal)
  // ═══════════════════════════════════════════════════════════
  {
    const { clube, epoca, escaloes } = ctx["FC Independente"];
    const escalao = escalaoPorModalidade(escaloes, Modalidade.FUTSAL);
    const criadorId = ctx.users.seniores;
    const rng = makeRng(seedFromString("fci"));

    const rosterAntes = await prisma.atletaEscalao.count({ where: { escalaoId: escalao.id, epocaId: epoca.id } });
    const roster = await ensureAtletas({
      clubeId: clube.id,
      escalaoId: escalao.id,
      epocaId: epoca.id,
      target: 16,
      nomePool: NOMES_SENIORES,
      posPoolNovos: POS_FUTSAL_SR,
      anoBase: 2000,
      encarregadoParaNovos: 0,
    });
    totais.atletasCriados += Math.max(0, roster.length - rosterAntes);

    const cEx = { criados: 0 };
    const exIds = await ensureExercicios(clube.id, criadorId, Modalidade.FUTSAL, EX_SENIORES, cEx);
    totais.exercicios += cEx.criados;

    const datas = gerarDatasSessao(new Date("2025-09-01"), 25, [1, 3, 5], 20); // seg/qua/sex ~20h
    const criadas = await ensureSessoes({
      escalaoId: escalao.id,
      epocaId: epoca.id,
      criadorId,
      roster,
      datas,
      duracaoMin: 105,
      local: "Pavilhão FC Independente",
      exercicioIds: exIds,
      tipoPorIndice: () => TipoSessao.NORMAL,
      objetivoPorIndice: (i) => (i % 3 === 0 ? "Organização defensiva." : i % 3 === 1 ? "Saída de pressão e transição." : "Finalização e bolas paradas."),
      taxaPresenca: 0.78,
      rng,
    });
    totais.sessoes += criadas;

    const jogos = planoJogos(
      SCORE_FCI,
      (i) => (i >= 14 ? "Taça Nacional" : "Campeonato Nacional"),
      new Date("2025-09-20T00:00:00"),
      10,
    );
    const { criados } = await ensureJogos({
      escalaoId: escalao.id,
      epocaId: epoca.id,
      criadorId,
      roster,
      jogos,
      formato: FormatoJogo.FUTSAL_5,
      modalidade: Modalidade.FUTSAL,
      local: "Pavilhão FC Independente",
      rng,
    });
    totais.jogos += criados;

    const hp = await ensureHabilidadesEProgressos({ clubeId: clube.id, epocaId: epoca.id, roster, nAtletas: 6, rng });
    totais.habilidades += hp.habilidades;
    totais.progressos += hp.progressos;

    totais.planeamentos += await ensurePlaneamento({ clubeId: clube.id, escalaoId: escalao.id, epocaId: epoca.id });
  }

  // ═══════════════════════════════════════════════════════════
  // 3) SC Estrela — Seniores Futsal + Sub-15 Futebol (+ competição + métricas)
  // ═══════════════════════════════════════════════════════════
  {
    const { clube, epoca, escaloes } = ctx["SC Estrela"];
    const escalaoFutsal = escalaoPorModalidade(escaloes, Modalidade.FUTSAL);
    const escalaoFutebol = escalaoPorModalidade(escaloes, Modalidade.FUTEBOL);
    const adminId = ctx.users.estrelaAdmin;
    const diretorId = ctx.users.estrelaDiretor ?? adminId;

    // ── Futsal ──
    {
      const rng = makeRng(seedFromString("estrela-futsal"));
      const rosterAntes = await prisma.atletaEscalao.count({ where: { escalaoId: escalaoFutsal.id, epocaId: epoca.id } });
      const roster = await ensureAtletas({
        clubeId: clube.id,
        escalaoId: escalaoFutsal.id,
        epocaId: epoca.id,
        target: 16,
        nomePool: NOMES_ESTRELA_FUTSAL,
        posPoolNovos: POS_FUTSAL_SR,
        anoBase: 2000,
        encarregadoParaNovos: 0,
      });
      totais.atletasCriados += Math.max(0, roster.length - rosterAntes);

      const cEx = { criados: 0 };
      const exIds = await ensureExercicios(clube.id, adminId, Modalidade.FUTSAL, EX_SENIORES, cEx);
      totais.exercicios += cEx.criados;

      const datas = gerarDatasSessao(new Date("2025-09-01"), 20, [2, 4], 20); // ter+qui
      const criadas = await ensureSessoes({
        escalaoId: escalaoFutsal.id,
        epocaId: epoca.id,
        criadorId: adminId,
        roster,
        datas,
        duracaoMin: 100,
        local: "Pavilhão SC Estrela",
        exercicioIds: exIds,
        tipoPorIndice: () => TipoSessao.NORMAL,
        objetivoPorIndice: (i) => (i % 2 === 0 ? "Bloco tático coletivo." : "Situações de finalização."),
        taxaPresenca: 0.8,
        rng,
      });
      totais.sessoes += criadas;

      const jogos = planoJogos(SCORE_ESTRELA_FUTSAL, () => "Liga Regional 2025/26", new Date("2025-09-14T00:00:00"), 12);
      const { criados, jogoIds } = await ensureJogos({
        escalaoId: escalaoFutsal.id,
        epocaId: epoca.id,
        criadorId: adminId,
        roster,
        jogos,
        formato: FormatoJogo.FUTSAL_5,
        modalidade: Modalidade.FUTSAL,
        local: "Pavilhão SC Estrela",
        rng,
      });
      totais.jogos += criados;

      const hp = await ensureHabilidadesEProgressos({ clubeId: clube.id, epocaId: epoca.id, roster, nAtletas: 6, rng });
      totais.habilidades += hp.habilidades;
      totais.progressos += hp.progressos;

      // Competição + métricas (usam os jogos de futsal).
      const comp = await ensureCompeticao({ clubeId: clube.id, escalaoId: escalaoFutsal.id, epocaId: epoca.id, rng });
      totais.competicaoEquipas += comp.equipas;
      totais.competicaoResultados += comp.resultados;

      const met = await ensureMetricas({ clubeId: clube.id, jogoIdsFutsal: jogoIds, rng });
      totais.metricas += met.metricas;
      totais.valoresMetrica += met.valores;
    }

    // ── Futebol Sub-15 ──
    {
      const rng = makeRng(seedFromString("estrela-futebol"));
      const rosterAntes = await prisma.atletaEscalao.count({ where: { escalaoId: escalaoFutebol.id, epocaId: epoca.id } });
      const roster = await ensureAtletas({
        clubeId: clube.id,
        escalaoId: escalaoFutebol.id,
        epocaId: epoca.id,
        target: 16,
        nomePool: NOMES_ESTRELA_FUTEBOL,
        posPoolNovos: POS_FUTEBOL,
        anoBase: 2011,
        encarregadoParaNovos: 4,
      });
      totais.atletasCriados += Math.max(0, roster.length - rosterAntes);

      const cEx = { criados: 0 };
      const exIds = await ensureExercicios(clube.id, diretorId, Modalidade.FUTEBOL, EX_SENIORES, cEx);
      totais.exercicios += cEx.criados;

      const datas = gerarDatasSessao(new Date("2025-09-01"), 18, [2, 5], 18); // ter+sex
      const criadas = await ensureSessoes({
        escalaoId: escalaoFutebol.id,
        epocaId: epoca.id,
        criadorId: diretorId,
        roster,
        datas,
        duracaoMin: 90,
        local: "Campo SC Estrela",
        exercicioIds: exIds,
        tipoPorIndice: () => TipoSessao.NORMAL,
        objetivoPorIndice: (i) => (i % 2 === 0 ? "Organização em 4-3-3." : "Transições e finalização."),
        taxaPresenca: 0.82,
        rng,
      });
      totais.sessoes += criadas;

      const jogos = planoJogos(SCORE_ESTRELA_FUTEBOL, () => "Campeonato Distrital Sub-15", new Date("2025-09-21T00:00:00"), 14);
      const { criados } = await ensureJogos({
        escalaoId: escalaoFutebol.id,
        epocaId: epoca.id,
        criadorId: diretorId,
        roster,
        jogos,
        formato: FormatoJogo.FUTEBOL_11,
        modalidade: Modalidade.FUTEBOL,
        local: "Campo SC Estrela",
        rng,
      });
      totais.jogos += criados;
    }
  }

  // Contagem final de exercícios criados (todos os clubes).
  console.log("\n══════════════════════════════════════════════");
  console.log("✅ Seed rico concluído. Registos CRIADOS nesta execução:");
  console.log(`   Atletas novos ............ ${totais.atletasCriados}`);
  console.log(`   Exercícios ............... ${totais.exercicios}`);
  console.log(`   Sessões .................. ${totais.sessoes}`);
  console.log(`   Jogos .................... ${totais.jogos}`);
  console.log(`   Habilidades .............. ${totais.habilidades}`);
  console.log(`   Progressos ............... ${totais.progressos}`);
  console.log(`   Competição (equipas) ..... ${totais.competicaoEquipas}`);
  console.log(`   Competição (resultados) .. ${totais.competicaoResultados}`);
  console.log(`   Métricas ................. ${totais.metricas}`);
  console.log(`   Valores de métrica ....... ${totais.valoresMetrica}`);
  console.log(`   Planeamentos ............. ${totais.planeamentos}`);
  console.log("══════════════════════════════════════════════\n");

  // Totais globais na BD (para verificação).
  const globais = {
    atletas: await prisma.atleta.count(),
    sessoes: await prisma.sessao.count(),
    jogos: await prisma.jogo.count(),
    presencas: await prisma.presenca.count(),
    estatisticas: await prisma.estatisticaAtleta.count(),
    exercicios: await prisma.exercicio.count(),
    convocatorias: await prisma.convocatoria.count(),
    habilidades: await prisma.habilidade.count(),
    progressos: await prisma.progressoHabilidade.count(),
    competicoes: await prisma.competicao.count(),
    resultadosCompeticao: await prisma.resultadoCompeticao.count(),
    metricas: await prisma.metricaConfig.count(),
    valoresMetrica: await prisma.valorMetrica.count(),
    planeamentos: await prisma.planeamento.count(),
  };
  console.log("📊 Totais globais na BD:", JSON.stringify(globais, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
