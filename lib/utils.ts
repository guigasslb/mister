import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

/** Merge de classes Tailwind (shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─────────────────────────────────────────────
// Tipo de resultado consistente (secção 10.1)
// ─────────────────────────────────────────────

export type Resultado<T> =
  | { sucesso: true; dados: T }
  | { sucesso: false; erro: string; camposInvalidos?: Record<string, string> };

/** Constrói um resultado de sucesso. */
export function ok<T>(dados: T): Resultado<T> {
  return { sucesso: true, dados };
}

/** Constrói um resultado de erro genérico. */
export function erro<T = never>(
  mensagem: string,
  camposInvalidos?: Record<string, string>,
): Resultado<T> {
  return { sucesso: false, erro: mensagem, camposInvalidos };
}

// ─────────────────────────────────────────────
// Heurísticas de escalão (visibilidade de UI por faixa etária)
// ─────────────────────────────────────────────

/** Extrai o número de "Sub-N" do nome do escalão (ex.: "Sub-12" → 12); null se não houver. */
export function numeroSubEscalao(nome: string): number | null {
  const m = nome.match(/sub[-\s]?(\d+)/i);
  return m ? Number(m[1]) : null;
}

/**
 * RPE (esforço percebido) e ACWR (carga de treino) só fazem sentido em escalões de
 * competição (sénior/júnior). Ocultam-se na formação jovem — escalões "Sub-N" com
 * N ≤ 14 (UX-P3-01). Sem correspondência "Sub-" assume-se sénior → mostra.
 */
export function mostrarCargaTreino(nomeEscalao: string): boolean {
  const n = numeroSubEscalao(nomeEscalao);
  return n === null || n > 14;
}

/**
 * O encarregado de educação só é relevante para atletas menores (formação jovem).
 * Mostra-se apenas em escalões "Sub-N" com N ≤ 16 (UX-P3-08). Sem "Sub-" ou N > 16
 * (sénior/júnior) → oculto por omissão.
 */
export function mostrarEncarregadoEducacao(nomeEscalao: string): boolean {
  const n = numeroSubEscalao(nomeEscalao);
  return n !== null && n <= 16;
}

/**
 * Converte os erros de um ZodError no formato camposInvalidos
 * (campo -> mensagem) usado pelo Resultado<T>.
 */
export function erroDeValidacao<T = never>(
  error: z.ZodError,
  mensagem = "Dados inválidos",
): Resultado<T> {
  const camposInvalidos = Object.fromEntries(
    error.issues.map((i) => [i.path.join("."), i.message]),
  );
  return { sucesso: false, erro: mensagem, camposInvalidos };
}
