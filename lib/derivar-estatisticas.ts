import type { BlocoTempo, FormatoJogo, TipoEventoJogo } from "@prisma/client";
import { blocoParaMinutos } from "@/lib/estatisticas";
import {
  calcularMinutosDeEventos,
  type EventoAoVivo,
  type MinutosAtleta,
  type TipoEventoJogoAoVivo,
} from "@/lib/minutos-jogo";
import type { EstatisticaInput } from "@/lib/schemas/jogo";

/**
 * Motor ÚNICO de derivação `EventoJogo → EstatisticaAtleta` (§10.4 da bíblia
 * `docs/Mister_Spec_v7.md`). Função pura — não depende do Prisma nem faz I/O.
 *
 * Consolida os dois derivadores que antes coexistiam e se ignoravam (o bug P0):
 *  - o motor de **intervalos ao segundo** (cronómetro do Modo Jogo ao Vivo, que
 *    soma os pares `[ENTRADA, SAIDA]` por `segundoJogo`);
 *  - o motor de **blocos** (registo clássico, que deriva minutos de `blocoTempo`).
 *
 * Regra de precedência para os minutos de cada atleta (§10.4):
 *   **intervalos (cronómetro, ao segundo) > blocos (legado) > vazio/null.**
 * A edição manual na grelha de Estatísticas sobrepõe-se sempre (last-write-wins,
 * §13.4) — este motor só preenche o rascunho automático.
 */

/** Tipos de evento cujo tempo se mede por intervalos ao segundo (Modo Jogo ao Vivo). */
const TIPOS_INTERVALO: ReadonlySet<TipoEventoJogo> = new Set<TipoEventoJogo>([
  "INICIO_PARTE",
  "FIM_PARTE",
  "ENTRADA",
  "SAIDA",
  "PAUSA",
  "RETOMA",
]);

/**
 * Evento para derivação — superconjunto que entende os dois registos:
 *  - clássico/legado: `bloco`/`minuto` preenchidos, `segundoJogo` a `null`;
 *  - ao vivo: `segundoJogo` (cronómetro contínuo) preenchido.
 */
export interface EventoParaDerivacao {
  tipo: TipoEventoJogo;
  atletaId: string | null;
  atletaSecundarioId: string | null;
  bloco: BlocoTempo | null;
  minuto: number | null;
  /** Segundo absoluto do cronómetro contínuo (0 = apito inicial da Parte 1). `null` = registo clássico. */
  segundoJogo: number | null;
  /** Parte do evento (1..4). `null` = não especificado. */
  parte: number | null;
}

/** Convocado com a titularidade prevista do plano de dia de jogo. */
export interface ConvocadoParaDerivacao {
  atletaId: string;
  titularPrevisto: boolean;
}

/**
 * Resultado da derivação: estatísticas por atleta (chave = atletaId) e o
 * resultado do jogo (golos marcados/sofridos) contados a partir dos eventos.
 */
export interface ResultadoDerivacao {
  estatisticas: Map<string, EstatisticaInput>;
  golosMarcados: number;
  golosSofridos: number;
}

/**
 * Segundo final do jogo, para fechar intervalos ainda abertos. É o maior segundo
 * de `FIM_PARTE`; se não houver, o maior segundo de qualquer evento (mesma regra
 * usada na edição retroativa — §8.25.6). Função pura.
 */
function calcularSegundoFinal(eventos: readonly EventoAoVivo[]): number {
  const fimParteMax = eventos.reduce(
    (max, e) => (e.tipo === "FIM_PARTE" ? Math.max(max, e.segundoJogo) : max),
    0,
  );
  if (fimParteMax > 0) return fimParteMax;
  return eventos.reduce((max, e) => Math.max(max, e.segundoJogo), 0);
}

/**
 * Atletas titulares "ao vivo": entraram no `INICIO_PARTE` da Parte 1 (mesmo
 * segundo, RN-JV-10). Se não houver `INICIO_PARTE` da Parte 1, assume o segundo 0.
 */
function titularesDoArranque(eventos: readonly EventoAoVivo[]): Set<string> {
  const inicioParte1 = eventos
    .filter((e) => e.tipo === "INICIO_PARTE" && (e.parte ?? 1) === 1)
    .reduce<number | null>(
      (min, e) => (min === null ? e.segundoJogo : Math.min(min, e.segundoJogo)),
      null,
    );
  const segundoTitular = inicioParte1 ?? 0;
  return new Set(
    eventos
      .filter(
        (e) => e.tipo === "ENTRADA" && e.segundoJogo === segundoTitular && e.atletaId,
      )
      .map((e) => e.atletaId as string),
  );
}

/**
 * Janelas [início, fim] (em segundos contínuos) de cada parte do jogo, indexadas
 * por posição (0 = Parte 1, ...). Derivadas dos eventos `INICIO_PARTE`/`FIM_PARTE`
 * do Modo Jogo ao Vivo. O número de partes é o maior `parte` observado. Para dados
 * incompletos (falta um limite), assume-se continuidade: o início cai no fim da
 * parte anterior (0 na primeira) e o fim no início da parte seguinte (`segundoFinal`
 * na última). Função pura.
 */
function calcularJanelasDeParte(
  eventos: readonly EventoAoVivo[],
  segundoFinal: number,
): Array<{ inicio: number; fim: number }> {
  const inicioPorParte = new Map<number, number>();
  const fimPorParte = new Map<number, number>();
  let maxParte = 0;
  for (const e of eventos) {
    if (e.parte == null) continue;
    if (e.tipo === "INICIO_PARTE") {
      const atual = inicioPorParte.get(e.parte);
      inicioPorParte.set(
        e.parte,
        atual === undefined ? e.segundoJogo : Math.min(atual, e.segundoJogo),
      );
      maxParte = Math.max(maxParte, e.parte);
    } else if (e.tipo === "FIM_PARTE") {
      const atual = fimPorParte.get(e.parte);
      fimPorParte.set(
        e.parte,
        atual === undefined ? e.segundoJogo : Math.max(atual, e.segundoJogo),
      );
      maxParte = Math.max(maxParte, e.parte);
    }
  }
  if (maxParte === 0) return [];
  const janelas: Array<{ inicio: number; fim: number }> = [];
  for (let p = 1; p <= maxParte; p++) {
    const inicio = inicioPorParte.get(p) ?? (p === 1 ? 0 : janelas[p - 2]?.fim ?? 0);
    const fim = fimPorParte.get(p) ?? inicioPorParte.get(p + 1) ?? segundoFinal;
    janelas.push({ inicio, fim });
  }
  return janelas;
}

/**
 * Distribui `totalMinutos` (o total já arredondado do atleta) pelas partes, a
 * partir dos segundos jogados em cada parte, usando **maior resto** (largest
 * remainder). Garante por construção que `soma(resultado) === totalMinutos` — o
 * total mantém-se byte-idêntico ao motor de minutos e a soma das partes bate
 * sempre certo (§10.4/§8.11). Função pura.
 */
function distribuirMinutos(segundosPorParte: number[], totalMinutos: number): number[] {
  if (segundosPorParte.length === 0) return [];
  const base = segundosPorParte.map((s) => Math.floor(s / 60));
  const resultado = [...base];
  let restante = totalMinutos - base.reduce((a, b) => a + b, 0);
  // Ordena os índices por maior resto fracionário (desempate: índice mais baixo).
  const porResto = segundosPorParte
    .map((s, i) => ({ i, resto: s / 60 - base[i] }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  let k = 0;
  while (restante > 0 && porResto.length > 0) {
    resultado[porResto[k % porResto.length].i] += 1;
    restante -= 1;
    k += 1;
  }
  return resultado;
}

/**
 * Minutos por parte de cada atleta (chave = atletaId), a partir dos intervalos
 * `[ENTRADA, SAIDA]` ao segundo cruzados com as janelas de cada parte. Só produz
 * resultado quando há informação de partes (eventos `INICIO_PARTE`/`FIM_PARTE`);
 * caso contrário devolve mapa vazio (jogos legados → `minutosPorParte = []`).
 * Função pura.
 */
function calcularMinutosPorParte(
  eventos: readonly EventoAoVivo[],
  minutosCalculados: readonly MinutosAtleta[],
  segundoFinal: number,
): Map<string, number[]> {
  const mapa = new Map<string, number[]>();
  const janelas = calcularJanelasDeParte(eventos, segundoFinal);
  if (janelas.length === 0) return mapa;
  for (const m of minutosCalculados) {
    const segundosPorParte = janelas.map((j) =>
      m.intervalos.reduce(
        (soma, it) =>
          soma + Math.max(0, Math.min(it.saida, j.fim) - Math.max(it.entrada, j.inicio)),
        0,
      ),
    );
    mapa.set(m.atletaId, distribuirMinutos(segundosPorParte, m.minutos));
  }
  return mapa;
}

/**
 * Deriva as estatísticas por atleta e o resultado do jogo a partir dos eventos,
 * entendendo intervalos (cronómetro) E blocos (legado) num só motor.
 *
 * Regras:
 *  - Cada convocado começa em `NAO_UTILIZADO` com contadores a zero; se tiver
 *    `titularPrevisto` fica `TITULAR`.
 *  - `GOLO`/`GOLO_SOFRIDO` contam sempre para o resultado do jogo
 *    (`golosMarcados`/`golosSofridos`); com `atletaId` incrementam também o
 *    respetivo atleta (`golos` / `golosSofridosGR`).
 *  - Núcleo de futebol (`REMATE`, `CANTO`, `FORA_DE_JOGO`, `DESARME`) só conta
 *    quando `eFutebol=true`; em futsal fica a `null` e é ignorado (§10.8).
 *  - `SUBSTITUICAO` marca o atleta que entra como `UTILIZADO` (sem despromover
 *    um titular) e regista o `bloco` de tempo, se presente.
 *  - **Minutos e utilização (precedência intervalos > blocos > null):**
 *      · se o atleta tem intervalos ao vivo (`ENTRADA`/`SAIDA` com `segundoJogo`),
 *        os minutos vêm dos intervalos e a utilização é `TITULAR` (entrou no
 *        arranque) ou `UTILIZADO` (entrou depois) — o cronómetro prevalece;
 *      · senão, se há `blocoTempo` registado, os minutos derivam do bloco
 *        (`blocoParaMinutos`, §10.1/§10.8) e a utilização vem dos eventos;
 *      · senão, `minutos` fica `null` (não registado, distinto de zero).
 *
 * Função pura — toda a lógica é testável sem BD.
 */
export function derivarEstatisticas(
  eventos: EventoParaDerivacao[],
  convocados: ConvocadoParaDerivacao[],
  eFutebol: boolean,
  formato: FormatoJogo | null,
): ResultadoDerivacao {
  const estatisticas = new Map<string, EstatisticaInput>();

  for (const c of convocados) {
    estatisticas.set(c.atletaId, {
      atletaId: c.atletaId,
      utilizacao: c.titularPrevisto ? "TITULAR" : "NAO_UTILIZADO",
      blocoTempo: null,
      minutos: null,
      // Editor de tempo por parte (vem a seguir): sem registo inicial.
      minutosPorParte: [],
      golos: 0,
      assistencias: 0,
      defesas: 0,
      golosSofridosGR: 0,
      faltasCometidas: 0,
      cartaoAmarelo: 0,
      cartaoVermelho: 0,
      // Núcleo de futebol: null em futsal (não é núcleo — §10.8).
      remates: eFutebol ? 0 : null,
      cantos: eFutebol ? 0 : null,
      forasDeJogo: eFutebol ? 0 : null,
      desarmes: eFutebol ? 0 : null,
    });
  }

  let golosMarcados = 0;
  let golosSofridos = 0;

  const statDe = (atletaId: string | null): EstatisticaInput | null =>
    atletaId ? estatisticas.get(atletaId) ?? null : null;

  // ── 1) Contadores (golos/assistências/cartões/núcleo/substituições) ──────────
  for (const ev of eventos) {
    const s = statDe(ev.atletaId);
    switch (ev.tipo) {
      case "GOLO":
        golosMarcados += 1;
        if (s) s.golos += 1;
        break;
      case "GOLO_SOFRIDO":
        golosSofridos += 1;
        if (s) s.golosSofridosGR = (s.golosSofridosGR ?? 0) + 1;
        break;
      case "ASSISTENCIA":
        if (s) s.assistencias += 1;
        break;
      case "FALTA":
        if (s) s.faltasCometidas = (s.faltasCometidas ?? 0) + 1;
        break;
      case "CARTAO_AMARELO":
        if (s) s.cartaoAmarelo += 1;
        break;
      case "CARTAO_VERMELHO":
        if (s) s.cartaoVermelho += 1;
        break;
      case "DEFESA":
        if (s) s.defesas = (s.defesas ?? 0) + 1;
        break;
      case "REMATE":
        if (eFutebol && s) s.remates = (s.remates ?? 0) + 1;
        break;
      case "CANTO":
        if (eFutebol && s) s.cantos = (s.cantos ?? 0) + 1;
        break;
      case "FORA_DE_JOGO":
        if (eFutebol && s) s.forasDeJogo = (s.forasDeJogo ?? 0) + 1;
        break;
      case "DESARME":
        if (eFutebol && s) s.desarmes = (s.desarmes ?? 0) + 1;
        break;
      case "SUBSTITUICAO":
        if (s) {
          if (s.utilizacao !== "TITULAR") s.utilizacao = "UTILIZADO";
          if (ev.bloco) s.blocoTempo = ev.bloco;
        }
        break;
      // INICIO_PARTE/FIM_PARTE/ENTRADA/SAIDA/PAUSA/RETOMA/TIMEOUT: sem impacto
      // nos contadores individuais (os minutos ao vivo derivam-se na fase 2).
      default:
        break;
    }
  }

  // ── 2) Intervalos ao segundo (cronómetro do Modo Jogo ao Vivo) ───────────────
  const eventosAoVivo: EventoAoVivo[] = eventos
    .filter((e) => e.segundoJogo != null && TIPOS_INTERVALO.has(e.tipo))
    .map((e) => ({
      tipo: e.tipo as TipoEventoJogoAoVivo,
      segundoJogo: e.segundoJogo as number,
      atletaId: e.atletaId ?? undefined,
      parte: e.parte ?? undefined,
    }));

  const segundoFinal = calcularSegundoFinal(eventosAoVivo);
  const minutosCalculados = calcularMinutosDeEventos(eventosAoVivo, segundoFinal);
  const minutosPorIntervalo = new Map(
    minutosCalculados.map((m) => [m.atletaId, m.minutos]),
  );
  // Minutos por parte (índice 0 = Parte 1, ...). Só há valores quando o jogo foi
  // conduzido ao vivo com limites de parte; a soma bate sempre com `minutos`.
  const minutosPorParteMap = calcularMinutosPorParte(
    eventosAoVivo,
    minutosCalculados,
    segundoFinal,
  );
  const titularesAoVivo = titularesDoArranque(eventosAoVivo);

  // ── 3) Precedência: intervalos > blocos > null ───────────────────────────────
  for (const s of estatisticas.values()) {
    if (minutosPorIntervalo.has(s.atletaId)) {
      // Cronómetro ao segundo prevalece — nunca sobrescrito por blocos/null.
      s.minutos = minutosPorIntervalo.get(s.atletaId) ?? 0;
      // Minutos por parte derivados (soma === total); [] se não houver partes.
      s.minutosPorParte = minutosPorParteMap.get(s.atletaId) ?? [];
      s.utilizacao = titularesAoVivo.has(s.atletaId) ? "TITULAR" : "UTILIZADO";
    } else if (s.blocoTempo != null) {
      // Fallback legado: minutos derivados do bloco de tempo.
      s.minutos = blocoParaMinutos(s.blocoTempo, formato);
    } else {
      // Sem cronómetro nem bloco: não registado.
      s.minutos = null;
    }
  }

  return { estatisticas, golosMarcados, golosSofridos };
}

/**
 * Valores iniciais da grelha de Estatísticas (§8.11 — vista consolidada única).
 *
 * Combina, por atleta:
 *  1. o **rascunho derivado dos eventos** (`derivarEstatisticas` — minutos, golos,
 *     assistências, cartões e secundários), calculado ao carregar a vista, e
 *  2. a **edição manual persistida** em `EstatisticaAtleta` (a verdade final).
 *
 * A edição manual **sobrepõe-se sempre** ao derivado, por atleta (last-write-wins,
 * §13.4): se existir um registo persistido para o atleta, esse registo prevalece
 * na íntegra (inclui `valoresMetricas`, que a derivação não produz). Os atletas
 * sem registo persistido ficam com o rascunho derivado dos eventos — é isto que
 * substitui o antigo botão "Preencher do registo ao vivo": os valores já vêm
 * derivados, sem ação manual.
 *
 * Função pura — sem I/O, testável sem BD.
 */
export function combinarEstatisticasIniciais(
  eventos: EventoParaDerivacao[],
  convocados: ConvocadoParaDerivacao[],
  persistidas: EstatisticaInput[],
  eFutebol: boolean,
  formato: FormatoJogo | null,
): Map<string, EstatisticaInput> {
  const { estatisticas } = derivarEstatisticas(eventos, convocados, eFutebol, formato);
  // A edição manual persistida é a verdade final e prevalece sobre o derivado,
  // por atleta (§13.4). Substituição integral: preserva `valoresMetricas` e
  // eventuais campos que o treinador editou à mão.
  for (const p of persistidas) {
    estatisticas.set(p.atletaId, { ...p });
  }
  return estatisticas;
}
