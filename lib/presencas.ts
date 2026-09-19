/**
 * Helpers puros das presenças de treino (§8 — marcação de presenças).
 *
 * Sem I/O nem React: partilhados entre o componente de marcação e os testes.
 */
import type { EstadoPresenca, MotivoFalta, TipoAusencia } from "@prisma/client";

/**
 * Registo de presença em edição no cliente. Um atleta sem registo gravado fica
 * com `estado: null` (por marcar) — não confundir com "presente".
 *
 * `tipoAusencia`/`notaAusencia` (§8.8.2) só fazem sentido em estados de ausência
 * e são opcionais no tipo para retrocompatibilidade com registos/fixtures antigos
 * (o servidor limpa-os sempre que o estado não é de ausência).
 */
export type RegistoPresenca = {
  estado: EstadoPresenca | null;
  motivo: MotivoFalta | null;
  justificacao: string | null;
  tipoAusencia?: TipoAusencia | null;
  notaAusencia?: string | null;
};

/** Normaliza texto livre para comparação: null e "" são equivalentes; ignora espaços. */
function textoNormalizado(t: string | null | undefined): string {
  return t?.trim() ?? "";
}

/**
 * True se o estado atual das presenças difere do estado inicial carregado do
 * servidor. É a base para habilitar/desabilitar o botão "Guardar": quando o
 * mapa atual é idêntico ao inicial não há nada a guardar.
 *
 * Compara estado, motivo, justificação, tipo de ausência e nota de ausência (os
 * dois campos de texto normalizados — null/""/espaços são equivalentes) de cada
 * atleta presente em qualquer um dos mapas.
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
    if (textoNormalizado(a.justificacao) !== textoNormalizado(b.justificacao)) return true;
    if ((a.tipoAusencia ?? null) !== (b.tipoAusencia ?? null)) return true;
    if (textoNormalizado(a.notaAusencia) !== textoNormalizado(b.notaAusencia)) return true;
  }
  return false;
}
