"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Play, RotateCcw, Eye } from "lucide-react";
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
 *
 * Quando o treino já foi realizado (`concluido`), o botão deixa de ser um
 * arranque ("Iniciar") e passa a "Ver treino" — abre o mesmo overlay de
 * apresentação em ecrã cheio, mas em modo de revisão (sem retomar sessões
 * suspensas, que só fazem sentido durante a condução ao vivo).
 */
export function IniciarTreinoBotao({
  sessaoId,
  exercicios,
  concluido = false,
}: {
  sessaoId: string;
  exercicios: ExercicioModo[];
  /** Treino já realizado (data no passado): muda o CTA para "Ver treino". */
  concluido?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [suspenso, setSuspenso] = useState<TreinoSuspenso | null>(null);
  const semExercicios = exercicios.length === 0;
  const total = exercicios.length;

  // O localStorage só existe no cliente — lê no mount para evitar hydration mismatch.
  // Treinos concluídos são apenas revistos: ignoramos qualquer sessão suspensa.
  useEffect(() => {
    if (!concluido) setSuspenso(obterTreinoSuspenso(sessaoId));
  }, [sessaoId, concluido]);

  // Índice de retoma limitado ao intervalo válido (defensivo contra planos alterados).
  const indiceRetoma = suspenso
    ? Math.min(Math.max(suspenso.exercicioIndex, 0), Math.max(total - 1, 0))
    : 0;
  const podeRetomar = !concluido && suspenso !== null && !semExercicios;

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
    setSuspenso(obterTreinoSuspenso(sessaoId));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={semExercicios}
        className={
          concluido
            ? "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg border border-cinza-300 bg-white text-subtitulo font-semibold text-cinza-700 transition-colors hover:bg-cinza-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-40 sm:w-auto sm:px-8"
            : "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-laranja-600 text-subtitulo font-semibold text-white transition-colors hover:bg-[#A8370C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-40 sm:w-auto sm:px-8"
        }
      >
        {concluido ? (
          <>
            <Eye className="h-5 w-5" />
            {semExercicios ? "Sem exercícios para ver" : "Ver treino"}
          </>
        ) : podeRetomar ? (
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

      {aberto && typeof document !== "undefined"
        ? createPortal(
            <ModoTreino
              exercicios={exercicios}
              sessaoId={sessaoId}
              indiceInicial={suspenso ? indiceRetoma : 0}
              segundosIniciais={suspenso ? suspenso.segundos : 0}
              onFinish={terminar}
              onSuspend={suspender}
            />,
            document.body,
          )
        : null}
    </>
  );
}
