"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apagarPlanoSemanal } from "@/lib/actions/planoSemanal";
import type { ModoApagar } from "@/lib/schemas/planoSemanal";

export function ApagarPlanoDialog({ planoId }: { planoId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [modo, setModo] = useState<ModoApagar>("DESVINCULAR");

  const opcoes: { valor: ModoApagar; titulo: string; descricao: string }[] = [
    {
      valor: "DESVINCULAR",
      titulo: "Manter as sessões",
      descricao: "Remove apenas o horário. Todas as sessões geradas são preservadas.",
    },
    {
      valor: "APAGAR_FUTURAS_VAZIAS",
      titulo: "Apagar treinos futuros vazios",
      descricao:
        "Apaga as sessões futuras sem conteúdo. As que já têm exercícios ou presenças são preservadas.",
    },
  ];

  function handleApagar() {
    startTransition(async () => {
      const res = await apagarPlanoSemanal(planoId, modo);
      if (res.sucesso) {
        const { apagadas, desvinculadas } = res.dados;
        const partes: string[] = [];
        if (apagadas > 0) partes.push(`${apagadas} apagada(s)`);
        if (desvinculadas > 0) partes.push(`${desvinculadas} preservada(s)`);
        toast.success(
          partes.length > 0 ? `Horário apagado · ${partes.join(" · ")}` : "Horário apagado",
        );
        setAberto(false);
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  return (
    <AlertDialog
      open={aberto}
      onOpenChange={(v) => {
        if (pending) return;
        if (v) setModo("DESVINCULAR");
        setAberto(v);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-vermelho-600 hover:bg-vermelho-600/10 hover:text-vermelho-600"
        >
          <Trash2 className="h-4 w-4" />
          Apagar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar horário de treinos?</AlertDialogTitle>
          <AlertDialogDescription>
            Escolhe o que fazer às sessões geradas por este plano.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-1">
          {opcoes.map((o) => (
            <label
              key={o.valor}
              className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                modo === o.valor
                  ? "border-primary/50 bg-primary/5"
                  : "border-cinza-200 hover:bg-cinza-50"
              }`}
            >
              <input
                type="radio"
                name="modo-apagar"
                value={o.valor}
                checked={modo === o.valor}
                onChange={() => setModo(o.valor)}
                className="mt-0.5 h-5 w-5 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-corpo font-medium text-cinza-900">{o.titulo}</span>
                <span className="block text-legenda text-cinza-500">{o.descricao}</span>
              </span>
            </label>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button
            type="button"
            disabled={pending}
            className="bg-vermelho-600 text-white hover:bg-vermelho-600/90"
            onClick={handleApagar}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Apagar horário
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
