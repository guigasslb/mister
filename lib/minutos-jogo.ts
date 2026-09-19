/**
 * Cálculo de minutos de jogo a partir de eventos do Modo Jogo ao Vivo.
 *
 * Função pura (§8.25.5 da bíblia `docs/Mister_Spec_v7.md`): recebe uma lista
 * imutável de eventos + o segundo final do jogo e devolve os minutos por atleta.
 * Não depende do Prisma nem faz I/O — os tipos são definidos localmente para
 * poderem ser reutilizados quando o schema real (§8.25.8) estiver disponível.
 *
 * Regra (RN-JV-6): para cada atleta somam-se todos os intervalos
 * `[ENTRADA, SAIDA]` (em segundos). Quem ainda está em campo no final tem a
 * saída = `segundoFinal`. Minutos = arredondamento inteiro dos segundos / 60.
 */

/** Tipos de evento do Modo Jogo ao Vivo relevantes para o cálculo (§8.25.8). */
export type TipoEventoJogoAoVivo =
  | "INICIO_PARTE"
  | "FIM_PARTE"
  | "ENTRADA"
  | "SAIDA"
  | "PAUSA"
  | "RETOMA";

/**
 * Evento ao vivo. O `segundoJogo` é o segundo absoluto do cronómetro contínuo
 * (0 = apito inicial da Parte 1). O tempo pausado não é incrementado no
 * cronómetro (RN-JV-4), pelo que `PAUSA`/`RETOMA` não afetam o cálculo aqui.
 */
export interface EventoAoVivo {
  tipo: TipoEventoJogoAoVivo;
  /** Segundo absoluto contínuo desde o início do jogo. */
  segundoJogo: number;
  /** Obrigatório para `ENTRADA` e `SAIDA`. */
  atletaId?: string;
  /** Obrigatório para `INICIO_PARTE` e `FIM_PARTE`. */
  parte?: number;
}

/** Minutos e intervalos calculados para um atleta. */
export interface MinutosAtleta {
  atletaId: string;
  /** Minutos inteiros (arredondados). */
  minutos: number;
  /** Intervalos jogados, em segundos. */
  intervalos: Array<{ entrada: number; saida: number }>;
}

/**
 * Calcula os minutos de jogo por atleta a partir dos eventos.
 *
 * Decisões documentadas:
 * - Um atleta que nunca entrou em campo **não aparece** no resultado (a função
 *   só conhece eventos, não a convocatória; a utilização `NAO_UTILIZADO`/0 min
 *   é derivada a jusante cruzando com a convocatória — §8.25.5).
 * - Um atleta pode ter múltiplos intervalos (entra, sai, volta a entrar); todos
 *   são somados.
 * - Se, quando o jogo termina, o atleta ainda estiver em campo (tem `ENTRADA`
 *   sem `SAIDA` correspondente), a saída assume `segundoFinal`.
 * - Os eventos são ordenados por `segundoJogo` antes de processar (a lista de
 *   entrada pode vir fora de ordem cronológica).
 *
 * @param eventos Lista imutável de eventos do jogo.
 * @param segundoFinal Segundo em que o jogo terminou.
 */
export function calcularMinutosDeEventos(
  eventos: readonly EventoAoVivo[],
  segundoFinal: number,
): MinutosAtleta[] {
  // Ordenação estável por segundo (não muta a lista recebida).
  const ordenados = [...eventos].sort((a, b) => a.segundoJogo - b.segundoJogo);

  // Preserva a ordem de primeira aparição de cada atleta no resultado.
  const acumulado = new Map<
    string,
    { intervalos: Array<{ entrada: number; saida: number }>; entradaAberta: number | null }
  >();

  const obter = (atletaId: string) => {
    let registo = acumulado.get(atletaId);
    if (!registo) {
      registo = { intervalos: [], entradaAberta: null };
      acumulado.set(atletaId, registo);
    }
    return registo;
  };

  for (const evento of ordenados) {
    if (evento.tipo === "ENTRADA") {
      if (!evento.atletaId) continue;
      const registo = obter(evento.atletaId);
      // Ignora ENTRADA repetida sem SAIDA no meio (mantém a primeira aberta).
      if (registo.entradaAberta === null) {
        registo.entradaAberta = evento.segundoJogo;
      }
    } else if (evento.tipo === "SAIDA") {
      if (!evento.atletaId) continue;
      const registo = obter(evento.atletaId);
      if (registo.entradaAberta !== null) {
        registo.intervalos.push({
          entrada: registo.entradaAberta,
          saida: evento.segundoJogo,
        });
        registo.entradaAberta = null;
      }
    }
    // INICIO_PARTE / FIM_PARTE / PAUSA / RETOMA não alteram intervalos:
    // o `segundoJogo` já reflete o cronómetro contínuo (RN-JV-4/5).
  }

  const resultado: MinutosAtleta[] = [];
  for (const [atletaId, registo] of acumulado) {
    // Ainda em campo no final → fecha o intervalo em segundoFinal.
    if (registo.entradaAberta !== null) {
      registo.intervalos.push({
        entrada: registo.entradaAberta,
        saida: segundoFinal,
      });
      registo.entradaAberta = null;
    }

    const totalSegundos = registo.intervalos.reduce(
      (soma, intervalo) => soma + (intervalo.saida - intervalo.entrada),
      0,
    );

    resultado.push({
      atletaId,
      minutos: Math.round(totalSegundos / 60),
      intervalos: registo.intervalos,
    });
  }

  return resultado;
}
