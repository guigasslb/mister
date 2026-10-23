"use client";

// Botão de exportação PDF dos analíticos (Dossier do Treinador).
//
// Abre o route handler `/api/pdf` (que devolve um relatório HTML imprimível já
// autenticado e com scope ao clube/escalão) num novo separador; o documento
// abre o diálogo de impressão automaticamente, onde o utilizador escolhe
// "Guardar como PDF". Abordagem serverless-safe (sem motor nativo/WASM).
// `print:hidden` para não sair no próprio relatório/impressão.

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  construirUrlPdfAnaliticos,
  type ParamsPdfAnaliticos,
} from "@/lib/pdf-analiticos-url";

interface Props {
  /** Parâmetros do route handler: escalão (com competição/equipa opcionais) ou clube. */
  params: ParamsPdfAnaliticos;
  rotulo?: string;
}

export function DescarregarPdfBotao({ params, rotulo = "Guardar PDF" }: Props) {
  const [aAbrir, setAAbrir] = useState(false);

  function abrir() {
    setAAbrir(true);
    try {
      const janela = window.open(construirUrlPdfAnaliticos(params), "_blank", "noopener,noreferrer");
      if (!janela) {
        toast.error("Permite janelas de pop-up para gerar o PDF.");
      }
    } catch {
      toast.error("Não foi possível abrir o relatório.");
    } finally {
      // O documento abre noutro separador; libertamos o estado de imediato.
      setAAbrir(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={abrir}
      disabled={aAbrir}
      className="print:hidden"
    >
      {aAbrir ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <FileDown className="h-4 w-4" aria-hidden />
      )}
      {rotulo}
    </Button>
  );
}
