import { cn } from "@/lib/utils";

/**
 * Etiqueta do estado de inscrição do atleta (secção 8 — plantel).
 *
 * Componente puro (sem estado) — utilizável em Server e Client Components.
 * Informação secundária: mantém-se pequena para não dominar visualmente.
 *   • Inscrito      → verde (estado concluído).
 *   • Por inscrever → âmbar suave (chama a atenção para uma ação pendente).
 */

const BASE =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-legenda font-medium leading-tight";

export function BadgeInscricao({
  inscrito,
  className,
}: {
  inscrito: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        BASE,
        inscrito
          ? "border-verde-600/30 bg-verde-600/10 text-verde-600"
          : "border-ambar-500/40 bg-ambar-500/10 text-ambar-600",
        className,
      )}
    >
      {inscrito ? "Inscrito" : "Por inscrever"}
    </span>
  );
}
