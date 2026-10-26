// Funções puras de carga de treino — sRPE / ACWR (bíblia §8.20).
//
// Vive fora de `lib/actions/` porque um módulo com `"use server"` só pode exportar
// funções `async` (Server Actions). Estes helpers são síncronos e sem I/O, para
// serem diretamente testáveis e reutilizáveis em componentes.

/** Zona de carga derivada do ACWR (bíblia §8.20). */
export type ZonaCarga = "SUBCARGA" | "IDEAL" | "RISCO";

export const LABEL_ZONA_CARGA: Record<ZonaCarga, string> = {
  SUBCARGA: "Subcarga",
  IDEAL: "Zona ideal",
  RISCO: "Risco de sobrecarga",
};

export interface DadosCargaSemanal {
  /** Rótulo curto da semana (início — "DD/MM"). */
  semana: string;
  /** Início da semana (segunda-feira) em ISO "YYYY-MM-DD". */
  inicioSemana: string;
  /** Carga acumulada da semana: Σ(duracaoMin × rpeSessao). */
  cargaAcumulada: number;
  /** RPE médio das sessões da semana (0 quando não há RPE registado). */
  rpeMedia: number;
  /** Nº de sessões da semana com RPE registado. */
  nSessoes: number;
  /** ACWR = carga da semana / média das 4 semanas anteriores; null sem histórico. */
  acwr: number | null;
  /** Zona derivada do ACWR; null quando o ACWR é null. */
  zona: ZonaCarga | null;
}

/** Sessão reduzida ao necessário para o cálculo de carga (pura, testável). */
export interface SessaoCarga {
  data: Date;
  duracaoMin: number | null;
  rpeSessao: number | null;
}

/**
 * Início da semana (segunda-feira, 00:00 local) da data dada.
 * ISO 8601: a semana começa à segunda-feira.
 */
export function inicioSemana(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diaSemana = r.getDay(); // 0=Dom … 6=Sáb
  const desvio = (diaSemana + 6) % 7; // dias desde a última segunda-feira
  r.setDate(r.getDate() - desvio);
  r.setHours(0, 0, 0, 0);
  return r;
}

/**
 * Recua `semanas` semanas de calendário (local) a partir de `d`, preservando a hora
 * local. Usa `setDate` em vez de subtrair 7×24h fixas: numa semana com mudança de
 * hora (ex.: 29-03 e 25-10 em Europe/Lisbon) a semana tem 167h ou 169h, e a
 * subtração em milissegundos desalinhava o início da semana em ±1h.
 */
export function recuarSemanas(d: Date, semanas: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() - semanas * 7);
  return r;
}

/**
 * Classifica o ACWR numa zona de carga (bíblia §8.20):
 * `< 0.8` → subcarga · `0.8–1.3` → ideal · `> 1.3` → risco de sobrecarga.
 */
export function classificarAcwr(acwr: number | null): ZonaCarga | null {
  if (acwr === null) return null;
  if (acwr < 0.8) return "SUBCARGA";
  if (acwr > 1.3) return "RISCO";
  return "IDEAL";
}

function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function rotuloSemana(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Constrói a série de carga das últimas `semanas` semanas terminando na semana de
 * `agora`. Para cada semana: carga acumulada (Σ duracaoMin × rpeSessao), RPE médio,
 * e ACWR (rácio entre a carga da semana e a média das até 4 semanas anteriores).
 *
 * Função pura — não toca em I/O — para ser diretamente testável (bíblia §8.20).
 */
export function calcularCargaSemanal(
  sessoes: SessaoCarga[],
  semanas: number,
  agora: Date,
): DadosCargaSemanal[] {
  const semanaAtual = inicioSemana(agora);

  // Buckets ordenados (mais antigo → mais recente); index `semanas-1` = semana atual.
  interface Bucket {
    inicio: Date;
    carga: number;
    rpeSoma: number;
    rpeCount: number;
    nSessoes: number;
  }
  const buckets: Bucket[] = [];
  const porInicio = new Map<number, Bucket>();
  for (let i = 0; i < semanas; i++) {
    const inicio = recuarSemanas(semanaAtual, semanas - 1 - i);
    const b: Bucket = { inicio, carga: 0, rpeSoma: 0, rpeCount: 0, nSessoes: 0 };
    buckets.push(b);
    porInicio.set(inicio.getTime(), b);
  }

  for (const s of sessoes) {
    if (s.rpeSessao == null) continue; // sem RPE não há carga percebida
    const chave = inicioSemana(s.data).getTime();
    const b = porInicio.get(chave);
    if (!b) continue; // fora da janela
    if (s.duracaoMin != null) b.carga += s.duracaoMin * s.rpeSessao;
    b.rpeSoma += s.rpeSessao;
    b.rpeCount += 1;
    b.nSessoes += 1;
  }

  return buckets.map((b, i) => {
    // Crónica: média das cargas das até 4 semanas anteriores existentes na janela.
    const inicioPrev = Math.max(0, i - 4);
    const anteriores = buckets.slice(inicioPrev, i);
    const cargaCronica =
      anteriores.length > 0
        ? anteriores.reduce((acc, x) => acc + x.carga, 0) / anteriores.length
        : 0;
    const acwr = cargaCronica > 0 ? b.carga / cargaCronica : null;
    return {
      semana: rotuloSemana(b.inicio),
      inicioSemana: isoDia(b.inicio),
      cargaAcumulada: b.carga,
      rpeMedia: b.rpeCount > 0 ? b.rpeSoma / b.rpeCount : 0,
      nSessoes: b.nSessoes,
      acwr,
      zona: classificarAcwr(acwr),
    };
  });
}
