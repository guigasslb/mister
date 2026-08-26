"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Sentinel do item «Todos» na URL (não a ausência do param), para que
// «Todos» seja explicitamente alcançável e o estado ativo seja determinístico.
const TODOS = "todos";

/** Tipos de evento com filtro dedicado (alinha com o `TipoEvento` da página). */
type TipoEvento = "TREINO" | "JOGO" | "REUNIAO";

const OPCOES = [
  { valor: TODOS, label: "Todos" },
  { valor: "TREINO", label: "Treinos" },
  { valor: "JOGO", label: "Jogos" },
  { valor: "REUNIAO", label: "Reuniões" },
] as const;

/**
 * Filtro por tipo de evento da agenda unificada (treinos + jogos + reuniões).
 * Escreve `?tipo=<valor>` na URL sem apagar os restantes params (escalaoId,
 * vista, mes) — a página é um Server Component e volta a filtrar a agenda no
 * servidor. Segue o padrão de `FiltroEscalaoAgenda`: client component,
 * `useSearchParams`/`useRouter`/`useTransition`, com estado de carregamento
 * enquanto a página recalcula. Tal como aí, o estado ativo vem do valor já
 * resolvido no servidor (`tipo`) — não da leitura crua da URL — para que o
 * botão realçado bata exatamente com o filtro aplicado (incluindo normalizar
 * ausência/`todos`/valor inválido para «Todos»). O `searchParams` serve apenas
 * para preservar os restantes params (escalaoId, vista, mes) ao escrever.
 */
export function FiltroTipoAgenda({ tipo }: { tipo?: TipoEvento }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const atual = tipo ?? TODOS;

  function definir(valor: string) {
    if (valor === atual) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tipo", valor);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <div className="space-y-1.5">
        <Label id="filtro-tipo-agenda-label">Tipo</Label>
        <div
          role="group"
          aria-labelledby="filtro-tipo-agenda-label"
          className="flex flex-wrap gap-1.5"
        >
          {OPCOES.map(({ valor, label }) => {
            const ativo = valor === atual;
            return (
              <button
                key={valor}
                type="button"
                onClick={() => definir(valor)}
                disabled={pending}
                aria-pressed={ativo}
                className={cn(
                  "inline-flex min-h-[44px] items-center rounded-full border px-4 text-corpo font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60",
                  ativo
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-cinza-200 bg-white text-cinza-600 hover:bg-cinza-50",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {pending && (
        <p className="pb-3 text-legenda text-cinza-500" role="status">
          A atualizar…
        </p>
      )}
    </div>
  );
}
