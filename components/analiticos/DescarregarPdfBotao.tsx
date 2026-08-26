"use client";

// Botão de download PDF dos analíticos (Dossier do Treinador).
//
// Faz fetch ao route handler `/api/pdf` (que devolve o PDF já autenticado e com
// scope ao clube/escalão), transforma a resposta num Blob e força o download.
// UX espelha o ExportarCsvBotao (loading + toast). `print:hidden` para não sair
// no próprio PDF/impressão.

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  /** Parâmetros do route handler: escalão (com competição opcional) ou clube. */
  params:
    | { tipo: "escalao"; escalaoId: string; competicaoId?: string }
    | { tipo: "clube" };
  rotulo?: string;
}

function construirUrl(params: Props["params"]): string {
  const sp = new URLSearchParams({ tipo: params.tipo });
  if (params.tipo === "escalao") {
    sp.set("escalaoId", params.escalaoId);
    if (params.competicaoId) sp.set("competicao", params.competicaoId);
  }
  return `/api/pdf?${sp.toString()}`;
}

/** Lê o nome de ficheiro do Content-Disposition (fallback estável). */
function nomeFicheiro(resposta: Response, omissao: string): string {
  const cd = resposta.headers.get("content-disposition") ?? "";
  const m = /filename="?([^"]+)"?/.exec(cd);
  return m?.[1] ?? omissao;
}

export function DescarregarPdfBotao({ params, rotulo = "Download PDF" }: Props) {
  const [aGerar, setAGerar] = useState(false);

  async function descarregar() {
    setAGerar(true);
    let url: string | null = null;
    try {
      const resposta = await fetch(construirUrl(params));
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        toast.error(corpo?.erro ?? "Erro ao gerar o PDF");
        return;
      }

      const blob = await resposta.blob();
      url = URL.createObjectURL(blob);
      const nome = nomeFicheiro(resposta, "estatistica.pdf");
      const ancora = document.createElement("a");
      ancora.href = url;
      ancora.download = nome;
      document.body.appendChild(ancora);
      ancora.click();
      ancora.remove();
      toast.success(`"${nome}" descarregado`);
    } catch {
      toast.error("Erro ao gerar o PDF");
    } finally {
      if (url) URL.revokeObjectURL(url);
      setAGerar(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={descarregar}
      disabled={aGerar}
      className="print:hidden"
    >
      {aGerar ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <FileDown className="h-4 w-4" aria-hidden />
      )}
      {aGerar ? "A gerar…" : rotulo}
    </Button>
  );
}
