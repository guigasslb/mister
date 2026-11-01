"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Fullscreen API com prefixo WebKit (Safari/iPadOS < 16.4) — não consta dos tipos DOM.
type DocumentoWebkit = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type ElementoWebkit = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function elementoEmEcraInteiro(): Element | null {
  const doc = document as DocumentoWebkit;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/**
 * Ecrã inteiro de um campo (leitura ou editor) para mostrar aos jogadores no
 * tablet (§8.10). Fora do ecrã inteiro mostra o botão «Ecrã inteiro» por cima do
 * conteúdo; ao ativar, o conteúdo passa para um overlay `fixed inset-0` portado
 * para o <body> — fora do `.app-content`, cujo `transform` seria o bloco de
 * contenção do `fixed` (ver JogoAoVivo). Onde há Fullscreen API pede-se também o
 * ecrã inteiro do documento (esconde a barra do browser); pedi-lo no documento e
 * não no contentor mantém visíveis os diálogos e toasts, também portados para o
 * <body>. Sem API (iPhone Safari) fica só o overlay, que preenche o viewport.
 *
 * `children(ativo)` permite ao chamador adaptar o layout dentro do overlay.
 * `cabecalho` (opcional) fica à esquerda do botão, na mesma linha — para o botão
 * ficar junto ao título do bloco e visível mesmo com o editor aberto.
 */
export function EcraInteiroCampo({
  titulo,
  cabecalho,
  children,
}: {
  titulo: string;
  cabecalho?: ReactNode;
  children: (ativo: boolean) => ReactNode;
}) {
  const [ativo, setAtivo] = useState(false);

  function entrar() {
    setAtivo(true);
    const raiz = document.documentElement as ElementoWebkit;
    try {
      const pedido = raiz.requestFullscreen
        ? raiz.requestFullscreen()
        : raiz.webkitRequestFullscreen?.();
      // Recusa (ex.: permissões do browser) → mantém-se o overlay.
      if (pedido) pedido.catch(() => {});
    } catch {
      // Browser sem suporte efetivo → mantém-se o overlay.
    }
  }

  useEffect(() => {
    if (!ativo) return;
    // Saída pelo browser (Esc, gesto, botão do sistema) → fecha o overlay.
    function aoMudarEcraInteiro() {
      if (!elementoEmEcraInteiro()) setAtivo(false);
    }
    // Esc no overlay (necessário sem Fullscreen API). Não interfere com o Esc do
    // próprio editor (campo/legenda) nem com diálogos abertos por cima do overlay.
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const alvo = e.target;
      if (
        alvo instanceof Element &&
        alvo.closest("input, textarea, svg, [role='alertdialog'], [role='dialog']:not([data-ecra-inteiro])")
      ) {
        return;
      }
      setAtivo(false);
    }
    document.addEventListener("fullscreenchange", aoMudarEcraInteiro);
    document.addEventListener("webkitfullscreenchange", aoMudarEcraInteiro);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("fullscreenchange", aoMudarEcraInteiro);
      document.removeEventListener("webkitfullscreenchange", aoMudarEcraInteiro);
      document.removeEventListener("keydown", aoTeclar);
      // Ao sair do overlay (botão, Esc) ou ao desmontar (mudar de separador/página),
      // não deixa o documento em ecrã inteiro.
      if (!elementoEmEcraInteiro()) return;
      const doc = document as DocumentoWebkit;
      const saida = doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.();
      if (saida) saida.catch(() => {});
    };
  }, [ativo]);

  if (!ativo) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {cabecalho ?? <span />}
          <Button variant="outline" size="sm" onClick={entrar}>
            <Maximize2 className="h-4 w-4" />
            Ecrã inteiro
          </Button>
        </div>
        {children(false)}
      </div>
    );
  }

  // z-[45]: cobre a barra de topo (z-30) e a navegação inferior (z-40), mas fica
  // abaixo dos diálogos/menus (z-50) do editor — mesmo critério do JogoAoVivo.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${titulo} em ecrã inteiro`}
      data-ecra-inteiro
      className="fixed inset-0 z-[45] flex flex-col bg-white pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-cinza-200 px-4 py-2">
        <p className="truncate text-legenda font-medium uppercase tracking-wide text-cinza-500">
          {titulo}
        </p>
        <Button variant="outline" size="sm" onClick={() => setAtivo(false)}>
          <Minimize2 className="h-4 w-4" />
          Sair do ecrã inteiro
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">{children(true)}</div>
    </div>,
    document.body,
  );
}
