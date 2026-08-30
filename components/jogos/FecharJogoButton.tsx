"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fecharJogo, reabrirJogo } from "@/lib/actions/jogos";

/**
 * Alterna o estado aberto/fechado de um jogo. A ação é reversível, pelo que não
 * há confirmação (AlertDialog) — segue o padrão dos botões de ação simples do
 * detalhe do jogo.
 */
export function FecharJogoButton({
  jogoId,
  fechado,
}: {
  jogoId: string;
  fechado: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleAlternar() {
    startTransition(async () => {
      const res = fechado ? await reabrirJogo(jogoId) : await fecharJogo(jogoId);
      if (res.sucesso) {
        toast.success(fechado ? "Jogo reaberto" : "Jogo fechado");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  return (
    <Button variant="outline" onClick={handleAlternar} disabled={pending}>
      {fechado ? (
        <>
          <LockOpen className="h-4 w-4" />
          Reabrir jogo
        </>
      ) : (
        <>
          <Lock className="h-4 w-4" />
          Fechar jogo
        </>
      )}
    </Button>
  );
}
