/**
 * Estado local de um treino suspenso (Melhoria — suspender/retomar sessão).
 *
 * Guarda-se apenas no `localStorage` do treinador (UX de conveniência): permite
 * sair do modo treino sem o terminar e retomar mais tarde no exercício e tempo
 * onde ficou. Não há persistência na base de dados — por isso o estado é
 * intencionalmente por-dispositivo.
 */
export type TreinoSuspenso = {
  /** Índice (0-based) do exercício onde a sessão ficou. */
  exercicioIndex: number;
  /** Segundos decorridos no cronómetro no momento da suspensão. */
  segundos: number;
};

const chave = (sessaoId: string) => `treino-suspenso-${sessaoId}`;

/** Obtém o estado suspenso da sessão, ou `null` se não existir / for inválido. */
export function obterTreinoSuspenso(sessaoId: string): TreinoSuspenso | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(chave(sessaoId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as TreinoSuspenso).exercicioIndex === "number" &&
      typeof (parsed as TreinoSuspenso).segundos === "number"
    ) {
      return parsed as TreinoSuspenso;
    }
    return null;
  } catch {
    return null;
  }
}

/** Guarda (ou substitui) o estado suspenso da sessão. */
export function guardarTreinoSuspenso(
  sessaoId: string,
  index: number,
  segundos: number,
): void {
  if (typeof window === "undefined") return;
  try {
    const estado: TreinoSuspenso = { exercicioIndex: index, segundos };
    window.localStorage.setItem(chave(sessaoId), JSON.stringify(estado));
  } catch {
    // localStorage indisponível (modo privado, quota) — degradação silenciosa.
  }
}

/** Limpa o estado suspenso da sessão (ao terminar definitivamente). */
export function limparTreinoSuspenso(sessaoId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(chave(sessaoId));
  } catch {
    // Degradação silenciosa — ver acima.
  }
}
