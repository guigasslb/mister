import { diagramaSchema } from "@/lib/schemas/exercicio";
import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";

/**
 * Miniatura do diagrama de um exercício, ou placeholder cinzento quando o
 * exercício não tem campo desenhado. Partilhada entre o gestor de exercícios
 * da sessão (§4.4) e o Bloco de Guarda-redes (§8.24.2) para garantir aspeto
 * visual idêntico em ambas as listagens.
 */
export function DiagramaCartao({
  diagrama,
  nome,
  largura = 112,
  className = "w-24 sm:w-28",
}: {
  diagrama: unknown;
  nome: string;
  largura?: number;
  className?: string;
}) {
  const diag = diagramaSchema.safeParse(diagrama);
  const temDiagrama = diag.success && diag.data.elementos.length > 0;

  if (temDiagrama && diag.success) {
    return (
      <div
        className={`flex-shrink-0 overflow-hidden rounded border border-cinza-200 ${className}`}
      >
        <MiniaturaCampo diagrama={diag.data} largura={largura} className="w-full" />
      </div>
    );
  }
  return (
    <div
      className={`flex h-16 flex-shrink-0 items-center justify-center rounded border border-dashed border-cinza-300 bg-cinza-50 ${className}`}
      aria-label={`${nome} sem diagrama`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-cinza-300" fill="currentColor">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
