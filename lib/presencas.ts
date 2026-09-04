/**
 * Helpers puros das presenças de treino (§8 — marcação de presenças).
 *
 * Sem I/O nem React: partilhados entre o componente de marcação e os testes.
 */
import type { EstadoPresenca, MotivoFalta } from "@prisma/client";

/**
 * Registo de presença em edição no cliente. Um atleta sem registo gravado fica
 * com `estado: null` (por marcar) — não confundir com "presente".
 */
export type RegistoPresenca = {
  estado: EstadoPresenca | null;
  motivo: MotivoFalta | null;
  justificacao: string | null;
};

/** Normaliza a justificação para comparação: null e "" são equivalentes; ignora espaços. */
function justificacaoNormalizada(j: string | null): string {
  return j?.trim() ?? "";
}

/**
 * True se o estado atual das presenças difere do estado inicial carregado do
 * servidor. É a base para habilitar/desabilitar o botão "Guardar": quando o
 * mapa atual é idêntico ao inicial não há nada a guardar.
 *
 * Compara estado, motivo e justificação (esta última normalizada — null/""/espaços
 * são equivalentes) de cada atleta presente em qualquer um dos mapas.
 */
export function presencasAlteradas(
  inicial: Record<string, RegistoPresenca>,
  atual: Record<string, RegistoPresenca>,
): boolean {
  const ids = new Set([...Object.keys(inicial), ...Object.keys(atual)]);
  for (const id of ids) {
    const a = inicial[id];
    const b = atual[id];
    if (!a || !b) return true;
    if (a.estado !== b.estado) return true;
    if ((a.motivo ?? null) !== (b.motivo ?? null)) return true;
    if (justificacaoNormalizada(a.justificacao) !== justificacaoNormalizada(b.justificacao))
      return true;
  }
  return false;
}
