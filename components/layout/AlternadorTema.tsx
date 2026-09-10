"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/**
 * Alternador de tema claro/escuro (F14 — §12.0).
 *
 * O tema escuro é a base; este botão permite alternar para o claro. A
 * preferência é persistida pelo `next-themes` (ver `ThemeProvider`).
 * Antes da montagem no cliente renderiza um marcador neutro (evita
 * discrepância de hidratação, já que o tema real só é conhecido no browser).
 */
export function AlternadorTema() {
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  const escuro = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(escuro ? "light" : "dark")}
      aria-label={escuro ? "Ativar tema claro" : "Ativar tema escuro"}
      title={escuro ? "Tema claro" : "Tema escuro"}
      className="flex h-11 w-11 items-center justify-center rounded-full text-cinza-500 transition-colors hover:bg-cinza-100 hover:text-cinza-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
    >
      {/* Antes de montar, mostra a lua (coerente com o default escuro). */}
      {!montado || escuro ? (
        <Sun className="h-[18px] w-[18px]" aria-hidden />
      ) : (
        <Moon className="h-[18px] w-[18px]" aria-hidden />
      )}
    </button>
  );
}
