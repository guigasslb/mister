"use client";

import { useEffect, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { ModoTreino, type ExercicioModo } from "@/components/treinos/ModoTreino";
import {
  obterTreinoSuspenso,
  limparTreinoSuspenso,
  type TreinoSuspenso,
} from "@/lib/treino-suspenso";

/**
 * Botão de arranque do modo treino (Melhoria 3/4.2). Abre o overlay de condução
 * em ecrã cheio e, ao terminar, leva o treinador ao bloco de RPE para registar a
 * carga da sessão (foco automático — §8.20).
 *
 * Suporta suspender/retomar: se houver uma sessão suspensa guardada localmente
 * (localStorage), o botão passa a "Retomar" e a condução arranca no exercício e
 * tempo onde ficou.
 */
export function IniciarTreinoBotao({
  sessaoId,
  exercicios,
}: {
  sessaoId: string;
  exercicios: ExercicioModo[];
}) {
  const [aberto, setAberto] = useState(false);
  const [suspenso, setSuspenso] = useState<TreinoSuspenso | null>(null);
  const semExercicios = exercicios.length === 0;
  const total = exercicios.length;

  // O localStorage só existe no cliente — lê no mount para evitar hydration mismatch.
  useEffect(() => {
    setSuspenso(lerTreinoSuspenso(sessaoId));
  }, [sessaoId]);

  // Índice de retoma limitado ao intervalo válido (defensivo contra planos alterados).
  const indiceRetoma = suspenso
    ? Math.min(Math.max(suspenso.exercicioIndex, 0), Math.max(total - 1, 0))
    : 0;
  const podeRetomar = suspenso !== null && !semExercicios;

  function terminar() {
    setAberto(false);
    limparTreinoSuspenso(sessaoId);
    setSuspenso(null);
    // Foca o bloco de carga (RPE) para registar o esforço percebido logo a seguir.
    requestAnimationFrame(() => {
      const alvo = document.getElementById("carga-sessao");
      if (!alvo) return;
      alvo.scrollIntoView({ behavior: "smooth", block: "center" });
      const primeiro = alvo.querySelector<HTMLButtonElement>("button");
      primeiro?.focus();
    });
  }

  function suspender() {
    setAberto(false);
    // Relê o estado guardado pelo ModoTreino para atualizar o rótulo do botão.
    setSuspenso(lerTreinoSuspenso(sessaoId));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={semExercicios}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-laranja-600 text-subtitulo font-semibold text-white transition-colors hover:bg-[#A8370C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-40 sm:w-auto sm:px-8"
      >
        {podeRetomar ? (
          <>
            <RotateCcw className="h-5 w-5" />
            {`Retomar — exercício ${indiceRetoma + 1}/${total}`}
          </>
        ) : (
          <>
            <Play className="h-5 w-5" fill="currentColor" />
            {semExercicios ? "Sem exercícios para conduzir" : "Iniciar treino"}
          </>
        )}
      </button>

      {aberto && (
        <ModoTreino
          exercicios={exercicios}
          sessaoId={sessaoId}
          indiceInicial={suspenso ? indiceRetoma : 0}
          segundosIniciais={suspenso ? suspenso.segundos : 0}
          onFinish={terminar}
          onSuspend={suspender}
        />
      )}
    </>
  );
}
