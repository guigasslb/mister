"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fecharSessao, reabrirSessao } from "@/lib/actions/treinos";

/**
 * Alterna o estado aberto/fechado de uma sessão de treino. A ação é reversível,
 * pelo que não há confirmação (AlertDialog) — segue o padrão dos botões de ação
 * simples do detalhe do treino.
 */
export function FecharSessaoButton({
  sessaoId,
  fechado,
}: {
  sessaoId: string;
  fechado: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleAlternar() {
    startTransition(async () => {
      const res = fechado
        ? await reabrirSessao(sessaoId)
        : await fecharSessao(sessaoId);
      if (res.sucesso) {
        toast.success(fechado ? "Sessão reaberta" : "Sessão fechada");
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
          Reabrir sessão
        </>
      ) : (
        <>
          <Lock className="h-4 w-4" />
          Fechar sessão
        </>
      )}
    </Button>
  );
}
