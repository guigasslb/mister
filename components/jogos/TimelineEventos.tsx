import type { BlocoTempo, TipoEventoJogo } from "@prisma/client";
import { LABEL_BLOCO_TEMPO, LABEL_TIPO_EVENTO } from "@/lib/schemas/jogo";

/** Emoji por tipo de evento — alinhado com os botões de registo rápido. */
export const EMOJI_EVENTO: Record<TipoEventoJogo, string> = {
  GOLO: "⚽",
  ASSISTENCIA: "🅰️",
  FALTA: "⚠️",
  CARTAO_AMARELO: "🟨",
  CARTAO_VERMELHO: "🟥",
  SUBSTITUICAO: "🔄",
  DEFESA: "🧤",
  GOLO_SOFRIDO: "🥅",
  TIMEOUT: "⏱️",
  // Futebol (§3.7)
  REMATE: "🎯",
  CANTO: "🚩",
  FORA_DE_JOGO: "🚫",
  DESARME: "🛡️",
  // Modo Jogo ao Vivo (§8.25.8)
  INICIO_PARTE: "▶️",
  FIM_PARTE: "⏹️",
  ENTRADA: "🟢",
  SAIDA: "🔴",
  PAUSA: "⏸️",
  RETOMA: "⏯️",
};

export type EventoTimeline = {
  id: string;
  parte: number;
  minuto: number | null;
  tipo: TipoEventoJogo;
  bloco: BlocoTempo | null;
  atletaId: string | null;
  atletaSecundarioId: string | null;
};

type Atleta = { id: string; nome: string; numero: number | null };

/**
 * Cronologia dos eventos de um jogo (ordenados por minuto pelo servidor).
 * Componente presentacional puro — usado no resumo/relatório.
 */
export function TimelineEventos({
  eventos,
  atletas,
}: {
  eventos: EventoTimeline[];
  atletas: Atleta[];
}) {
  const nomeAtleta = (id: string | null): string | null => {
    if (!id) return null;
    const a = atletas.find((x) => x.id === id);
    if (!a) return null;
    return `${a.numero != null ? `#${a.numero} ` : ""}${a.nome}`;
  };

  if (eventos.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
        Ainda não há eventos registados neste jogo.
      </p>
    );
  }

  return (
    <ol className="space-y-1.5">
      {eventos.map((e) => {
        const principal = nomeAtleta(e.atletaId);
        const secundario = nomeAtleta(e.atletaSecundarioId);
        return (
          <li
            key={e.id}
            className="flex items-center gap-3 rounded-md border border-cinza-100 bg-white px-3 py-2 text-corpo-sec"
          >
            <span className="w-16 flex-shrink-0 text-cinza-500">
              {e.parte}ª{e.minuto != null ? ` · ${e.minuto}'` : ""}
            </span>
            <span className="text-lg" aria-hidden>
              {EMOJI_EVENTO[e.tipo]}
            </span>
            <div className="min-w-0 flex-1">
              <span className="font-medium text-cinza-900">
                {LABEL_TIPO_EVENTO[e.tipo]}
              </span>
              {principal && <span className="text-cinza-600"> — {principal}</span>}
              {e.tipo === "SUBSTITUICAO" && secundario && (
                <span className="text-cinza-500"> (sai {secundario})</span>
              )}
              {e.bloco && (
                <span className="ml-1 text-legenda text-cinza-400">
                  · {LABEL_BLOCO_TEMPO[e.bloco]}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
