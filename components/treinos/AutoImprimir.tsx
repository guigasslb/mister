"use client";

import { useEffect } from "react";

/**
 * Dispara o diálogo de impressão automaticamente ao abrir a página de impressão
 * do treino. Um pequeno atraso garante que as fontes e o diagrama SVG já estão
 * pintados antes de o browser gerar a pré-visualização. Não renderiza nada.
 */
export function AutoImprimir({ atrasoMs = 350 }: { atrasoMs?: number }) {
  useEffect(() => {
    const t = window.setTimeout(() => window.print(), atrasoMs);
    return () => window.clearTimeout(t);
  }, [atrasoMs]);

  return null;
}
