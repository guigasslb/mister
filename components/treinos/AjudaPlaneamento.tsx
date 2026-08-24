import { HelpCircle } from "lucide-react";

/**
 * Ajuda contextual que explica a diferença entre «Plano semanal» e
 * «Periodização» (UX-P3-05). Tooltip puramente em CSS (group-hover +
 * focus-within), sem JS nem dependências — funciona em rato, teclado e toque.
 */
export function AjudaPlaneamento() {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="O que é isto? Diferença entre plano semanal e periodização"
        className="flex h-9 w-9 items-center justify-center rounded-md text-cinza-500 transition-colors hover:bg-cinza-50 hover:text-cinza-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-cinza-200 bg-white p-3 text-legenda text-cinza-700 opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <span className="mb-1 block font-semibold text-cinza-900">
          Plano semanal vs. Periodização
        </span>
        <span className="mb-1 block">
          <strong className="text-cinza-900">Plano semanal:</strong> distribui os
          treinos da semana por dias e objetivos.
        </span>
        <span className="block">
          <strong className="text-cinza-900">Periodização:</strong> organiza a
          época em mesociclos e microciclos de treino.
        </span>
      </span>
    </span>
  );
}
