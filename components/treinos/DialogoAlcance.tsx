"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Alcance } from "@/lib/schemas/planoSemanal";

/**
 * §8.8.1 — Diálogo de escolha de alcance ao guardar alterações de agendamento
 * numa sessão ligada a um plano semanal. Controlado pelo componente pai.
 */
export function DialogoAlcance({
  aberto,
  onOpenChange,
  onConfirmar,
  pendente = false,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirmar: (alcance: Alcance) => void;
  pendente?: boolean;
}) {
  const [alcance, setAlcance] = useState<Alcance>("SO_ESTA");

  const opcoes: { valor: Alcance; titulo: string; descricao: string }[] = [
    {
      valor: "SO_ESTA",
      titulo: "Só este treino",
      descricao: "Altera apenas esta sessão. Fica protegida de futuras alterações do plano.",
    },
    {
      valor: "ESTA_E_FUTURAS",
      titulo: "Este e todos os seguintes",
      descricao: "Altera todos os treinos futuros deste dia (exceto os personalizados).",
    },
  ];

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar alterações a…</DialogTitle>
          <DialogDescription>
            Esta sessão faz parte de um horário de treinos. Escolhe o alcance da alteração de
            agendamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          {opcoes.map((o) => (
            <label
              key={o.valor}
              className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                alcance === o.valor
                  ? "border-primary/50 bg-primary/5"
                  : "border-cinza-200 hover:bg-cinza-50"
              }`}
            >
              <input
                type="radio"
                name="alcance"
                value={o.valor}
                checked={alcance === o.valor}
                onChange={() => setAlcance(o.valor)}
                className="mt-0.5 h-5 w-5 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-corpo font-medium text-cinza-900">{o.titulo}</span>
                <span className="block text-legenda text-cinza-500">{o.descricao}</span>
              </span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pendente}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={pendente} onClick={() => onConfirmar(alcance)}>
            {pendente && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
