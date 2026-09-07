"use client";

import { useEffect } from "react";

/**
 * Força o **modo claro** enquanto a página de impressão do treino está montada,
 * mesmo que o utilizador tenha o tema escuro ativo (base do produto — §12.0).
 *
 * A pré-visualização no ecrã da página imprimível deve sair sempre em fundo
 * branco/texto escuro, para coincidir com o que é impresso em papel (o bloco
 * `@media print` do `globals.css` já força claro na impressão). Sem isto, o
 * ecrã mostrava a página escura (fundo preto/texto branco), confundindo o
 * utilizador antes de imprimir.
 *
 * Manipula diretamente a classe do `<html>` (onde o `next-themes` coloca
 * `dark`/`light`) SEM tocar no `localStorage`, para NÃO alterar a preferência
 * de tema do utilizador: ao sair da página, o estado original é reposto.
 */
export function ForcarModoClaroImpressao() {
  useEffect(() => {
    const raiz = document.documentElement;
    const tinhaDark = raiz.classList.contains("dark");
    const tinhaLight = raiz.classList.contains("light");

    raiz.classList.remove("dark");
    raiz.classList.add("light");

    return () => {
      if (tinhaDark) raiz.classList.add("dark");
      if (!tinhaLight) raiz.classList.remove("light");
    };
  }, []);

  return null;
}
