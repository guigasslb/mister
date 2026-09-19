"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ABREV_POSICAO } from "@/lib/schemas/atleta";
import type { AtletaAoVivo } from "@/components/jogos/ao-vivo/CampoAoVivo";

/**
 * Modal de substituição (§8.25.3). Abre quando o treinador toca num jogador em
 * campo. Mostra quem vai **sair** e a lista de disponíveis no **banco**; um toque
 * no jogador do banco confirma a troca (`SAIDA` + `ENTRADA` no mesmo segundo —
 * RN-JV-3). O que entra herda a posição do que sai.
 */
export function ModalSubstituicao({
  jogadorSai,
  banco,
  onConfirmar,
  onCancelar,
}: {
  /** Jogador em campo a substituir; null → modal fechado. */
  jogadorSai: AtletaAoVivo | null;
  banco: AtletaAoVivo[];
  onConfirmar: (entraId: string) => void;
  onCancelar: () => void;
}) {
  const aberto = jogadorSai !== null;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onCancelar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Substituição</DialogTitle>
          <DialogDescription>Escolhe quem entra do banco.</DialogDescription>
        </DialogHeader>

        {jogadorSai && (
          <div className="flex items-center gap-2 rounded-lg border border-vermelho-600/20 bg-vermelho-600/5 px-3 py-2.5">
            <ArrowDown className="h-4 w-4 flex-shrink-0 text-vermelho-600" aria-hidden />
            <span className="text-corpo text-cinza-900">
              Sai{" "}
              <span className="font-semibold">
                {jogadorSai.numero != null && (
                  <span className="text-cinza-400">#{jogadorSai.numero} </span>
                )}
                {jogadorSai.nome}
              </span>
              {jogadorSai.posicao && (
                <span className="ml-1 text-legenda text-cinza-500">
                  ({ABREV_POSICAO[jogadorSai.posicao]})
                </span>
              )}
            </span>
          </div>
        )}

        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-corpo-sec font-medium text-cinza-600">
            <ArrowUp className="h-4 w-4 text-verde-600" aria-hidden />
            Entra do banco
          </p>
          {banco.length === 0 ? (
            <p className="rounded-md border border-dashed border-cinza-300 p-3 text-center text-corpo-sec text-cinza-500">
              Não há jogadores no banco.
            </p>
          ) : (
            <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto pr-1">
              {banco.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onConfirmar(a.id)}
                    className="flex min-h-[52px] w-full items-center gap-3 rounded-lg border border-cinza-200 bg-white p-2.5 text-left transition hover:border-primary hover:bg-primary/5 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-cinza-100 text-corpo-sec font-bold text-cinza-700 tabular-nums">
                      {a.numero ?? "–"}
                    </span>
                    <span className="flex-1 truncate text-corpo font-medium text-cinza-900">
                      {a.nome}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
