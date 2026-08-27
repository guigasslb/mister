"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botão "Exportar PDF" do detalhe do treino. Abre a página de impressão
 * (`/treinos/[id]/print`) numa nova aba, onde o browser gera o PDF via
 * "Guardar como PDF" no diálogo de impressão (aberto automaticamente).
 */
export function ExportarTreinoPdfBotao({ sessaoId }: { sessaoId: string }) {
  return (
    <Button
      variant="outline"
      onClick={() =>
        window.open(`/treinos/${sessaoId}/print`, "_blank", "noopener,noreferrer")
      }
    >
      <FileDown className="h-4 w-4" />
      Exportar PDF
    </Button>
  );
}
