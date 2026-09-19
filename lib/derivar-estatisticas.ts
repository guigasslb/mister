import type { BlocoTempo, FormatoJogo, TipoEventoJogo } from "@prisma/client";
import { blocoParaMinutos } from "@/lib/estatisticas";
import {
  calcularMinutosDeEventos,
  type EventoAoVivo,
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
  const minutosPorIntervalo = new Map(
    calcularMinutosDeEventos(eventosAoVivo, segundoFinal).map((m) => [
      m.atletaId,
      m.minutos,
    ]),
  );
  const titularesAoVivo = titularesDoArranque(eventosAoVivo);

  // ── 3) Precedência: intervalos > blocos > null ───────────────────────────────
  for (const s of estatisticas.values()) {
    if (minutosPorIntervalo.has(s.atletaId)) {
      // Cronómetro ao segundo prevalece — nunca sobrescrito por blocos/null.
      s.minutos = minutosPorIntervalo.get(s.atletaId) ?? 0;
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
