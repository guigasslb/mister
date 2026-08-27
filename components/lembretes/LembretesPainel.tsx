"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Check, Trash2, CalendarClock, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  atualizarLembrete,
  marcarVisto,
  eliminarLembrete,
  type LembreteComEstado,
} from "@/lib/actions/lembretes";
import { CriarLembreteForm, type MembroBasico } from "./CriarLembreteForm";

function dataCurta(d: Date): string {
  return new Date(d).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function atrasado(d: Date | null): boolean {
  return !!d && new Date(d).getTime() < Date.now();
}

/**
 * Painel de lembretes pendentes do utilizador (P2.1 — §3.15/§8.19).
 * - Badge "novo" quando o utilizador é destinatário e ainda não viu.
 * - "Marcar como feito": o criador conclui o lembrete; um destinatário
 *   confirma-o (marca visto).
 * - "Novo lembrete" disponível a quem tem a capacidade LEMBRETES_EQUIPA_GERIR.
 */
export function LembretesPainel({
  lembretes,
  membros,
  podeGerir,
}: {
  lembretes: LembreteComEstado[];
  membros: MembroBasico[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [criar, setCriar] = useState(false);
  const [pending, startTransition] = useTransition();

  function marcarFeito(l: LembreteComEstado) {
    startTransition(async () => {
      const res = l.souCriador
        ? await atualizarLembrete({ id: l.id, concluido: true })
        : await marcarVisto(l.id);
      if (res.sucesso) {
        toast.success(l.souCriador ? "Lembrete concluído" : "Lembrete confirmado");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  function eliminar(id: string) {
    startTransition(async () => {
      const res = await eliminarLembrete(id);
      if (res.sucesso) {
        toast.success("Lembrete eliminado");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  // Destaque visual (cor da marca — laranja #F0531E) só quando há lembretes
  // pendentes; sem pendentes, o painel colapsa numa linha discreta para não
  // pesar no topo do dashboard.
  const destaque = lembretes.length > 0;

  // Diálogo de criação (partilhado pelos dois estados). Só é montado o ramo
  // ativo, pelo que manter duas instâncias não duplica estado nem DOM.
  const dialogNovo = podeGerir && (
    <Dialog open={criar} onOpenChange={setCriar}>
      <DialogTrigger asChild>
        {destaque ? (
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4" /> Novo lembrete
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-legenda text-cinza-500 hover:text-cinza-900"
          >
            <Plus className="h-3.5 w-3.5" /> Novo lembrete
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo lembrete</DialogTitle>
        </DialogHeader>
        <CriarLembreteForm membros={membros} onDone={() => setCriar(false)} />
      </DialogContent>
    </Dialog>
  );

  // Estado vazio: indicador discreto de uma só linha, altura mínima.
  if (!destaque) {
    return (
      <div className="flex min-h-[28px] items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-legenda text-cinza-400">
          <Bell className="h-3.5 w-3.5" />
          Sem lembretes
        </p>
        {dialogNovo}
      </div>
    );
  }

  // Estado com lembretes: painel compacto e destacado.
  return (
    <div
      className="animar-entrada space-y-2.5 rounded-xl border border-laranja-500/45 bg-laranja-50 p-3 shadow-card sm:p-4"
      role="region"
      aria-label="Lembretes pendentes"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-laranja-500/15 text-laranja-600">
            <Bell className="h-4 w-4" />
          </span>
          <p className="text-corpo-sec font-bold uppercase tracking-wide text-laranja-600">
            Lembretes
          </p>
          <span className="rounded-full bg-laranja-500/15 px-2 py-0.5 text-legenda font-semibold tabular-nums text-laranja-600">
            {lembretes.length}
          </span>
        </div>
        {dialogNovo}
      </div>

      <ul className="animar-cascata space-y-1.5">
        {lembretes.map((l) => {
          const novo = l.souDestinatario && !l.visto;
          return (
            <li key={l.id} className="card-base flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-corpo-sec font-semibold text-cinza-900">{l.titulo}</p>
                  {novo && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-legenda font-semibold uppercase tracking-wide text-primary">
                      Novo
                    </span>
                  )}
                </div>
                {l.descricao && (
                  <p className="mt-0.5 text-corpo-sec text-cinza-600">{l.descricao}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-legenda text-cinza-500">
                  {l.dataLimite && (
                    <span
                      className={
                        atrasado(l.dataLimite)
                          ? "inline-flex items-center gap-1 font-medium text-vermelho-600"
                          : "inline-flex items-center gap-1"
                      }
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                      {dataCurta(l.dataLimite)}
                    </span>
                  )}
                  <span>{l.souCriador ? "Criado por ti" : `De ${l.criadoPorNome}`}</span>
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => marcarFeito(l)}
                >
                  <Check className="h-4 w-4" /> Feito
                </Button>
                {l.souCriador && podeGerir && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    aria-label="Eliminar lembrete"
                    onClick={() => eliminar(l.id)}
                  >
                    <Trash2 className="h-4 w-4 text-cinza-500" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
