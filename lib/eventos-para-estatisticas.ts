import type { BlocoTempo, FormatoJogo, TipoEventoJogo } from "@prisma/client";
import { blocoParaMinutos } from "@/lib/estatisticas";
import type { EstatisticaInput } from "@/lib/schemas/jogo";

/**
 * Evento ao vivo (subconjunto do modelo `EventoJogo`, §3.7) necessário para
 * derivar estatísticas. Função pura — não depende do Prisma nem da BD.
 */
export interface EventoParaEstatisticas {
  tipo: TipoEventoJogo;
  atletaId: string | null;
  atletaSecundarioId: string | null;
  bloco: BlocoTempo | null;
  minuto: number | null;
}

/** Convocado com a titularidade prevista do plano de dia de jogo. */
export interface ConvocadoParaEstatisticas {
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
 * Deriva as estatísticas por atleta e o resultado do jogo a partir dos eventos
 * ao vivo (secção 10 da bíblia — sincronização eventos → estatísticas).
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
 *    um titular) e regista o `bloco` de tempo, se presente. `atletaSecundarioId`
 *    (o que sai) não é alterado.
 *  - `minutos` deriva de `blocoTempo` via `blocoParaMinutos` (§10.1/§10.8);
 *    sem bloco registado fica `null` (não registado, distinto de zero).
 *
 * Função pura — toda a lógica é testável sem BD.
 */
export function derivarEstatisticasDeEventos(
  eventos: EventoParaEstatisticas[],
  convocados: ConvocadoParaEstatisticas[],
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
      // TIMEOUT (e quaisquer eventos sem impacto individual): ignorados.
      default:
        break;
    }
  }

  // Deriva os minutos a partir do bloco de tempo registado (§10.1/§10.8).
  for (const s of estatisticas.values()) {
    s.minutos = s.blocoTempo != null ? blocoParaMinutos(s.blocoTempo, formato) : null;
  }

  return { estatisticas, golosMarcados, golosSofridos };
}
