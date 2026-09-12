"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apagarAtletaDefinitivamente } from "@/lib/actions/atletas";

/**
 * Hard-delete definitivo do atleta (P1.3 — RGPD, direito ao apagamento).
 * Distinto de "Arquivar" (soft-delete): apaga irreversivelmente todos os dados
 * pessoais. Só deve ser visível a quem tem a capacidade PLANTEL_GERIR.
 */
export function ApagarAtletaDefinitivamenteButton({
  atletaId,
  nomeAtleta,
}: {
  atletaId: string;
  nomeAtleta: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleApagar() {
    startTransition(async () => {
      const res = await apagarAtletaDefinitivamente(atletaId);
      if (res.sucesso) {
        toast.success("Atleta apagado definitivamente");
        router.push("/plantel");
      } else {
        toast.error(res.erro);
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="border-vermelho-600 text-vermelho-600 hover:bg-vermelho-600/10 hover:text-vermelho-600"
          disabled={pending}
        >
          <AlertTriangle className="h-4 w-4" />
          Apagar definitivamente
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar «{nomeAtleta}» definitivamente?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação é irreversível e remove todos os dados pessoais do atleta
            (presenças, convocatórias, participações, etc.). Apenas
            prossegue se tiveres o consentimento do encarregado de educação.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleApagar}
            className="bg-vermelho-600 text-white hover:bg-vermelho-600/90"
          >
            Apagar definitivamente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
