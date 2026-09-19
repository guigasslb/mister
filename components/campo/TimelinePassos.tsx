"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, X, GripVertical } from "lucide-react";
import type { PassoAnimacao } from "@/lib/schemas/exercicio";
import {
  DURACAO_PADRAO,
  moverPasso,
  ajustarKeyframeAposMover,
} from "./animacao";

export interface TimelinePassosProps {
  passos: PassoAnimacao[];
  keyframeActivo: number; // índice (-1 = base / "Início")
  onChange: (passos: PassoAnimacao[]) => void;
  onKeyframeChange: (idx: number) => void;
}

// Reindexa `ordem` sequencialmente (0..N-1) após eliminar.
function reindexar(passos: PassoAnimacao[]): PassoAnimacao[] {
  return passos.map((p, idx) => ({ ...p, ordem: idx }));
}

export function TimelinePassos({
  passos,
  keyframeActivo,
  onChange,
  onKeyframeChange,
}: TimelinePassosProps) {
  const ordenados = [...passos].sort((a, b) => a.ordem - b.ordem);

  // Índice do passo a ser arrastado e do passo sobre o qual paira (para indicador
  // visual de destino). Só usado no arrasto por ponteiro (desktop); os botões de
  // seta cobrem o toque/teclado.
  const [arrastandoIdx, setArrastandoIdx] = useState<number | null>(null);
  const [sobreIdx, setSobreIdx] = useState<number | null>(null);

  function eliminar(idx: number) {
    const novos = reindexar(ordenados.filter((_, i) => i !== idx));
    onChange(novos);
    // Ajusta o keyframe activo à nova lista.
    if (keyframeActivo === idx) onKeyframeChange(idx - 1);
    else if (keyframeActivo > idx) onKeyframeChange(keyframeActivo - 1);
  }

  // Move um passo de `de` para `para` (qualquer posição na sequência) e faz o
  // keyframe activo acompanhar. Usado tanto pelo arrasto como pelos botões ‹/›.
  function mover(de: number, para: number) {
    if (de === para || de < 0 || para < 0 || para >= ordenados.length) return;
    onChange(moverPasso(ordenados, de, para));
    onKeyframeChange(ajustarKeyframeAposMover(keyframeActivo, de, para));
  }

  function largarSobre(idx: number) {
    if (arrastandoIdx !== null && arrastandoIdx !== idx) {
      mover(arrastandoIdx, idx);
    }
    setArrastandoIdx(null);
    setSobreIdx(null);
  }

  function definirDuracao(idx: number, valor: string) {
    const ms = Number(valor);
    const duracaoMs = Number.isFinite(ms)
      ? Math.max(100, Math.min(10000, Math.round(ms)))
      : undefined;
    onChange(ordenados.map((p, i) => (i === idx ? { ...p, duracaoMs } : p)));
  }

  return (
    <div className="space-y-2">
      <div
        className="flex items-stretch gap-2 overflow-x-auto pb-1"
        role="listbox"
        aria-label="Passos da animação"
      >
        {/* Chip "Início" (base, keyframe -1) */}
        <button
          type="button"
          role="option"
          aria-selected={keyframeActivo === -1}
          onClick={() => onKeyframeChange(-1)}
          className={`flex min-h-11 flex-shrink-0 items-center rounded-md border px-3 text-corpo-sec transition-colors ${
            keyframeActivo === -1
              ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/40"
              : "border-cinza-200 text-cinza-700 hover:bg-cinza-50"
          }`}
        >
          Início
        </button>

        {ordenados.map((passo, idx) => {
          const activo = keyframeActivo === idx;
          const aArrastar = arrastandoIdx === idx;
          const alvoDrop = sobreIdx === idx && arrastandoIdx !== idx;
          return (
            <div
              key={passo.id}
              onDragOver={(e) => {
                // Permite o drop e assinala este passo como destino.
                if (arrastandoIdx === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (sobreIdx !== idx) setSobreIdx(idx);
              }}
              onDrop={(e) => {
                e.preventDefault();
                largarSobre(idx);
              }}
              className={`flex min-h-11 flex-shrink-0 flex-col gap-1 rounded-md border p-2 transition-colors ${
                activo
                  ? "border-primary bg-primary/5 ring-2 ring-primary/40"
                  : "border-cinza-200"
              } ${aArrastar ? "opacity-50" : ""} ${
                alvoDrop ? "border-primary ring-2 ring-primary/40" : ""
              }`}
            >
              <div className="flex items-center gap-1">
                {/* Pega de arrasto (drag-and-drop por ponteiro). Só a pega é
                    `draggable` para não interferir com o input numérico nem com
                    os restantes botões do passo. */}
                <span
                  draggable
                  onDragStart={(e) => {
                    setArrastandoIdx(idx);
                    e.dataTransfer.effectAllowed = "move";
                    // Alguns browsers exigem dados para iniciar o arrasto.
                    e.dataTransfer.setData("text/plain", String(idx));
                  }}
                  onDragEnd={() => {
                    setArrastandoIdx(null);
                    setSobreIdx(null);
                  }}
                  role="button"
                  tabIndex={-1}
                  aria-label={`Arrastar passo ${idx + 1} para reordenar`}
                  title="Arrastar para reordenar"
                  className="flex h-6 w-5 cursor-grab items-center justify-center text-cinza-400 hover:text-cinza-600 active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <button
                  type="button"
                  role="option"
                  aria-selected={activo}
                  onClick={() => onKeyframeChange(idx)}
                  className={`rounded px-2 py-1 text-corpo-sec font-medium ${
                    activo ? "text-primary" : "text-cinza-700"
                  }`}
                >
                  Passo {idx + 1}
                </button>
                <button
                  type="button"
                  onClick={() => mover(idx, idx - 1)}
                  disabled={idx === 0}
                  aria-label={`Mover passo ${idx + 1} para trás`}
                  className="flex h-6 w-6 items-center justify-center rounded text-cinza-500 hover:bg-cinza-100 disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => mover(idx, idx + 1)}
                  disabled={idx === ordenados.length - 1}
                  aria-label={`Mover passo ${idx + 1} para a frente`}
                  className="flex h-6 w-6 items-center justify-center rounded text-cinza-500 hover:bg-cinza-100 disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => eliminar(idx)}
                  aria-label={`Eliminar passo ${idx + 1}`}
                  className="flex h-6 w-6 items-center justify-center rounded text-vermelho-600 hover:bg-vermelho-600/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <label className="flex items-center gap-1 text-legenda text-cinza-500">
                <span>ms</span>
                <input
                  type="number"
                  min={100}
                  max={10000}
                  step={100}
                  value={passo.duracaoMs ?? ""}
                  placeholder={String(DURACAO_PADRAO)}
                  onChange={(e) => definirDuracao(idx, e.target.value)}
                  aria-label={`Duração do passo ${idx + 1} em milissegundos`}
                  className="w-20 rounded border border-cinza-200 px-1.5 py-0.5 text-corpo-sec"
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
