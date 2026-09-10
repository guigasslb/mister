"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selecionarEpoca } from "@/lib/actions/epocas";
import type { Epoca } from "@prisma/client";

interface Props {
  epocas: Epoca[];
  epocaAtivaId: string | null;
}

export function SeletorEpoca({ epocas, epocaAtivaId }: Props) {
  const [pending, startTransition] = useTransition();

  if (epocas.length === 0) {
    return (
      <span className="text-corpo-sec text-cinza-400 italic">Sem épocas</span>
    );
  }

  return (
    <Select
      value={epocaAtivaId ?? undefined}
      onValueChange={(id) => {
        startTransition(async () => {
          const resultado = await selecionarEpoca(id);
          if (!resultado.sucesso) toast.error(resultado.erro);
        });
      }}
      disabled={pending}
    >
      <SelectTrigger className="h-9 w-auto gap-1 border-border bg-background text-corpo text-foreground focus:ring-primary">
        <span className="mr-1 text-legenda text-cinza-400">Época</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {epocas.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
