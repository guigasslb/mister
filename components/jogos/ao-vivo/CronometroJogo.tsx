"use client";

import { useEffect, useState } from "react";

/**
 * Cronómetro contínuo do Modo Jogo ao Vivo (§8.25.2). Mostra o tempo corrido em
 * `MM:SS` e a parte atual. Calcula o tempo **localmente** (sem chamar o servidor):
 *
 *   segundos = segundosBase + (aCorrerDesde ? (agora − aCorrerDesde) : 0)
 *
 * `aCorrerDesde` é um *timestamp* local em ms (null quando pausado/intervalo). O
 * relógio atualiza a cada segundo com `setInterval` só quando está a correr.
 */
export function CronometroJogo({
  segundosBase,
  aCorrerDesde,
  parteAtual,
  numeroPartes,
}: {
  /** Tempo de jogo já consolidado (segundos). */
  segundosBase: number;
  /** Instante do arranque do cronómetro (epoch ms), ou null se parado. */
  aCorrerDesde: number | null;
  parteAtual: number;
  numeroPartes: number;
}) {
  const calcular = () =>
    segundosBase +
    (aCorrerDesde ? Math.max(0, Math.floor((Date.now() - aCorrerDesde) / 1000)) : 0);

  const [segundos, setSegundos] = useState(calcular);

  useEffect(() => {
    // Recalcula imediatamente quando as props mudam (pausa/retoma/consolidação).
    setSegundos(calcular());
    if (aCorrerDesde == null) return;
    const id = setInterval(() => setSegundos(calcular()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segundosBase, aCorrerDesde]);

  const mm = String(Math.floor(segundos / 60)).padStart(2, "0");
  const ss = String(segundos % 60).padStart(2, "0");
  const aCorrer = aCorrerDesde != null;

  return (
    <div className="flex flex-col items-center">
      <div
        className="font-display text-6xl font-bold tabular-nums leading-none text-white sm:text-7xl"
        aria-live="off"
        role="timer"
      >
        {mm}:{ss}
      </div>
      <div className="mt-2 flex items-center gap-2 text-corpo-sec font-medium uppercase tracking-wide text-white/70">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            aCorrer ? "animate-pulse bg-verde-600" : "bg-white/40"
          }`}
          aria-hidden
        />
        Parte {parteAtual} / {numeroPartes}
      </div>
    </div>
  );
}
