"use client";

import { useEffect } from "react";

/**
 * Propaga a cor do clube para o elemento raiz (`<html>`).
 *
 * O layout aplica `--cor-primaria`/`--cor-secundaria` num `<div>` interno, mas os
 * portais do Radix (Dialog, Select, DropdownMenu) montam em `document.body` —
 * FORA desse `<div>`. Sem propagação, o conteúdo dentro de diálogos (incluindo as
 * miniaturas/campos SVG, cujo fundo usa `var(--cor-primaria, #F0531E)`) herda o
 * fallback laranja da marca em vez de seguir a cor do clube (§11.5 / §12).
 *
 * Espelha as CSS custom properties da cor do clube no `:root` para que os portais
 * as herdem. Puramente visual — não altera lógica de negócio. Não toca em
 * `--primary`/`--ring` (tema shadcn), apenas nos acentos do clube.
 */
export function TemaClubeGlobal({
  corPrimaria,
  corSecundaria,
}: {
  corPrimaria: string;
  corSecundaria: string;
}) {
  useEffect(() => {
    const raiz = document.documentElement;
    const anteriorPrim = raiz.style.getPropertyValue("--cor-primaria");
    const anteriorSec = raiz.style.getPropertyValue("--cor-secundaria");

    raiz.style.setProperty("--cor-primaria", corPrimaria);
    raiz.style.setProperty("--cor-secundaria", corSecundaria);

    return () => {
      // Restaura o estado anterior ao desmontar (ex.: troca de layout/logout).
      if (anteriorPrim) raiz.style.setProperty("--cor-primaria", anteriorPrim);
      else raiz.style.removeProperty("--cor-primaria");
      if (anteriorSec) raiz.style.setProperty("--cor-secundaria", anteriorSec);
      else raiz.style.removeProperty("--cor-secundaria");
    };
  }, [corPrimaria, corSecundaria]);

  return null;
}
