"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
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
import { reiniciarJogoAoVivo } from "@/lib/actions/jogo-ao-vivo";
import { limparEstadoLocal } from "@/lib/jogo-ao-vivo-local";
import { cn } from "@/lib/utils";

/**
 * «Reiniciar jogo» (§8.25.9): repõe o jogo ao estado anterior ao início do Modo
 * Jogo ao Vivo via `reiniciarJogoAoVivo`. Ação destrutiva → confirmação
 * (AlertDialog). Após sucesso limpa SEMPRE o estado local do dispositivo
 * (`limparEstadoLocal`, §8.25.4) — senão o ecrã retomava a sessão do IndexedDB —
 * e faz `router.refresh()`. Quem renderiza garante a visibilidade (sessão ao vivo
 * existente + `ESTATISTICAS_GERIR`).
 *
 * `tema="escuro"` para o ecrã de condução (`bg-ink`); `"claro"` para o detalhe do
 * jogo. Alvo de toque ≥44px.
 */
export function ReiniciarJogoAoVivoButton({
  jogoId,
  tema = "claro",
  onAntes,
  onDepois,
}: {
  jogoId: string;
  tema?: "claro" | "escuro";
  /** Chamado antes do pedido ao servidor (ex.: suspender a sincronização). */
  onAntes?: () => void;
  /**
   * Chamado no fim do pedido (sucesso ou falha). Em sucesso, já depois de limpar
   * o estado local e antes do refresh.
   */
  onDepois?: (sucesso: boolean) => void;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleReiniciar() {
    setAberto(false);
    startTransition(async () => {
      onAntes?.();
      let sucesso = false;
      try {
        const res = await reiniciarJogoAoVivo(jogoId);
        if (!res.sucesso) {
          toast.error(res.erro);
          return;
        }
        await limparEstadoLocal(jogoId);
        sucesso = true;
      } catch {
        toast.error("Não foi possível reiniciar o jogo. Verifica a ligação e tenta novamente.");
        return;
      } finally {
        onDepois?.(sucesso);
      }
      toast.success("Jogo reiniciado");
      router.refresh();
    });
  }

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size={tema === "escuro" ? "sm" : "default"}
          className={cn(
            "min-h-[44px] min-w-[44px]",
            tema === "escuro"
              ? "border-vermelho-600/70 bg-vermelho-600/20 text-white hover:bg-vermelho-600/40 hover:text-white"
              : "text-vermelho-600 hover:text-vermelho-600",
          )}
          disabled={pending}
          aria-label="Reiniciar jogo"
        >
          <RotateCcw className="h-4 w-4" />
          <span className={tema === "escuro" ? "hidden sm:inline" : undefined}>
            Reiniciar jogo
          </span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reiniciar o jogo do zero?</AlertDialogTitle>
          <AlertDialogDescription>
            Perdem-se o cronómetro e todos os eventos do Modo Jogo ao Vivo
            (golos, cartões, substituições), as estatísticas de todos os atletas
            neste jogo e o resultado. Mantêm-se os dados do jogo, a convocatória
            e a votação do capitão. Esta ação é irreversível.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReiniciar}
            className="bg-vermelho-600 hover:bg-vermelho-600/90 text-white"
          >
            Reiniciar jogo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
