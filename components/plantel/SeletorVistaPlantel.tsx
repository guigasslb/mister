"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, ClipboardList } from "lucide-react";

/**
 * Alterna a vista do plantel entre cartões (default) e a lista de inscrições
 * (secção 8 — plantel). O estado vive na URL (`?vista=inscricoes`) para ser lido
 * pelo server component, preservando os restantes filtros (escalão, secção,
 * pesquisa, inativos). Alvos de toque ≥44px.
 */
export function SeletorVistaPlantel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const vista = searchParams.get("vista") === "inscricoes" ? "inscricoes" : "cartoes";

  function mudar(proxima: "cartoes" | "inscricoes") {
    if (proxima === vista) return;
    const params = new URLSearchParams(searchParams.toString());
    if (proxima === "inscricoes") params.set("vista", "inscricoes");
    else params.delete("vista");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  const BTN =
    "inline-flex min-h-[44px] items-center gap-1.5 px-3 py-2 text-corpo-sec transition-colors disabled:opacity-60";
  const ATIVO = "bg-primary/5 text-primary";
  const INATIVO = "text-cinza-600 hover:bg-cinza-50";

  return (
    <div
      className="inline-flex overflow-hidden rounded-lg border border-cinza-200"
      role="group"
      aria-label="Vista do plantel"
    >
      <button
        type="button"
        onClick={() => mudar("cartoes")}
        disabled={pending}
        aria-pressed={vista === "cartoes"}
        className={`${BTN} ${vista === "cartoes" ? ATIVO : INATIVO}`}
      >
        <LayoutGrid className="h-4 w-4" />
        Cartões
      </button>
      <button
        type="button"
        onClick={() => mudar("inscricoes")}
        disabled={pending}
        aria-pressed={vista === "inscricoes"}
        className={`${BTN} border-l border-cinza-200 ${
          vista === "inscricoes" ? ATIVO : INATIVO
        }`}
      >
        <ClipboardList className="h-4 w-4" />
        Inscrições
      </button>
    </div>
  );
}
