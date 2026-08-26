"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { registarResultadoManoMano } from "@/lib/actions/mano-a-mano";
import { LABEL_FORMATO_DUELO } from "@/lib/schemas/mano-a-mano";
import type { FormatoDuelo } from "@prisma/client";

/**
 * Marcador de registo de resultado de um duelo (mobile-first). Dois contadores
 * grandes (≥44px) que se incrementam ao toque, com correção (–) e reposição.
 * A validação final é do servidor (`registarResultadoManoMano`), que conhece o
 * formato e os golos para vencer — aqui apenas damos uma ajuda visual.
 */
export function RegistarResultadoDialog({
  matchId,
  nomeA,
  nomeB,
  formatoDuelo,
  golosParaVencer,
  trigger,
  onSucesso,
}: {
  matchId: string;
  nomeA: string;
  nomeB: string;
  formatoDuelo: FormatoDuelo;
  golosParaVencer: number;
  trigger: React.ReactNode;
  onSucesso?: () => void;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [golosA, setGolosA] = useState(0);
  const [golosB, setGolosB] = useState(0);
  const [pending, startTransition] = useTransition();

  const primeiroA = formatoDuelo === "PRIMEIRO_A_DOIS";

  function repor() {
    setGolosA(0);
    setGolosB(0);
  }

  function guardar() {
    startTransition(async () => {
      const res = await registarResultadoManoMano(matchId, { golosA, golosB });
      if (res.sucesso) {
        toast.success("Resultado registado");
        setAberto(false);
        onSucesso?.();
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) repor();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registar resultado</DialogTitle>
          <DialogDescription>
            {primeiroA
              ? `Primeiro a ${golosParaVencer} golo(s) vence — ${LABEL_FORMATO_DUELO[formatoDuelo]}.`
              : LABEL_FORMATO_DUELO[formatoDuelo]}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2">
          <Contador
            nome={nomeA}
            valor={golosA}
            aoIncrementar={() => setGolosA((v) => Math.min(v + 1, 99))}
            aoDecrementar={() => setGolosA((v) => Math.max(v - 1, 0))}
          />
          <span className="pb-6 text-center text-2xl font-bold text-cinza-400">–</span>
          <Contador
            nome={nomeB}
            valor={golosB}
            aoIncrementar={() => setGolosB((v) => Math.min(v + 1, 99))}
            aoDecrementar={() => setGolosB((v) => Math.max(v - 1, 0))}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={repor}
            disabled={pending}
            className="min-h-[44px]"
          >
            <RotateCcw className="h-4 w-4" />
            Repor
          </Button>
          <Button
            type="button"
            onClick={guardar}
            disabled={pending}
            className="min-h-[44px]"
          >
            <Check className="h-4 w-4" />
            {pending ? "A guardar…" : "Guardar resultado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Contador({
  nome,
  valor,
  aoIncrementar,
  aoDecrementar,
}: {
  nome: string;
  valor: number;
  aoIncrementar: () => void;
  aoDecrementar: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="line-clamp-2 min-h-[2.5rem] text-center text-corpo-sec font-medium text-cinza-900">
        {nome}
      </p>
      {/* Grande zona de toque: incrementa ao clicar no número. */}
      <button
        type="button"
        onClick={aoIncrementar}
        aria-label={`Adicionar golo a ${nome}`}
        className="flex h-24 w-full items-center justify-center rounded-lg border-2 border-cinza-200 bg-cinza-50 text-5xl font-bold tabular-nums text-cinza-900 transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {valor}
      </button>
      <div className="flex w-full items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={aoDecrementar}
          disabled={valor === 0}
          aria-label={`Remover golo a ${nome}`}
          className="h-11 flex-1"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={aoIncrementar}
          aria-label={`Adicionar golo a ${nome}`}
          className="h-11 flex-1"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
