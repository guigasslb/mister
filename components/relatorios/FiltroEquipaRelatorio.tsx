"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const TODAS_EQUIPAS = "__todas_equipas__";

/**
 * Filtro «Equipa» do relatório de equipa (§23.11.3 regra 10) — mesmo padrão do
 * filtro dos analíticos: escreve `?equipa=<id>` na URL e a página (Server
 * Component) volta a chamar `obterRelatorioEquipa`. Só é montado com opções.
 */
export function FiltroEquipaRelatorio({
  opcoes,
  equipaCompeticaoId,
}: {
  opcoes: { id: string; rotulo: string }[];
  equipaCompeticaoId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function definir(valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor === TODAS_EQUIPAS) params.delete("equipa");
    else params.set("equipa", valor);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <div className="space-y-1.5">
        <Label htmlFor="filtro-equipa-relatorio">Equipa</Label>
        <Select
          value={equipaCompeticaoId ?? TODAS_EQUIPAS}
          onValueChange={definir}
          disabled={pending}
        >
          <SelectTrigger id="filtro-equipa-relatorio" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS_EQUIPAS}>Todas as equipas</SelectItem>
            {opcoes.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {pending && (
        <p className="pb-3 text-legenda text-cinza-500" role="status">
          A atualizar…
        </p>
      )}
    </div>
  );
}
