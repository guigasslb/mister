"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FormatoJogo } from "@prisma/client";
import { Play, RotateCcw } from "lucide-react";
import { CAMPO_W, CAMPO_H, LinhasCampo, ElementoSVG, rotuloCampo } from "./desenho";
import { CampoAnimado } from "./CampoAnimado";
import { MiniaturaCampo } from "./MiniaturaCampo";
import type { DiagramaCampo } from "@/lib/schemas/exercicio";

// Reprodução do exercício ao ver o diagrama em grande (§11):
//
//   1. Diagrama COM passos/keyframes → reutiliza o motor existente `CampoAnimado`
//      (movimento interpolado dos jogadores/bola, com controlos de play/loop/
//      velocidade). Já testado e usado no Modo Treino.
//   2. Diagrama SEM keyframes mas COM setas/linhas → "desenha" as setas de forma
//      progressiva e sequencial (stroke-dashoffset), com botão play/replay
//      sobreposto. Arranca sozinho ao abrir (quando `autoReproduzir`).
//   3. Sem nada para animar → miniatura estática.

// Atraso entre o início do desenho de cada seta (efeito sequencial) e duração do
// desenho de cada uma. Dentro do intervalo pedido (600–1200ms), com easing suave.
const ATRASO_ENTRE_SETAS = 420;
const DURACAO_DESENHO = 820;

function usaMovimentoReduzido(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function DiagramaReproduzivel({
  diagrama,
  formato,
  className,
  autoReproduzir = false,
}: {
  diagrama: DiagramaCampo;
  formato?: FormatoJogo;
  className?: string;
  // Arranca a reprodução ao montar (ex.: abrir o modal do exercício).
  autoReproduzir?: boolean;
}) {
  const fmt = formato ?? diagrama.campo ?? FormatoJogo.FUTSAL_5;
  const temKeyframes = (diagrama.passos?.length ?? 0) > 0;

  // Ordem (0-based) de cada seta/linha na sequência de desenho — pela ordem no
  // diagrama. Alimenta o atraso incremental (uma seta desenha-se após a anterior).
  const setasOrdem = useMemo(() => {
    const ordem = new Map<string, number>();
    let n = 0;
    for (const el of diagrama.elementos) {
      if (el.tipo === "seta" || el.tipo === "linha") ordem.set(el.id, n++);
    }
    return ordem;
  }, [diagrama.elementos]);
  const temSetas = setasOrdem.size > 0;

  const duracaoTotal = temSetas
    ? (setasOrdem.size - 1) * ATRASO_ENTRE_SETAS + DURACAO_DESENHO
    : 0;

  const [reproId, setReproId] = useState(0);
  const [aDesenhar, setADesenhar] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reproduzir() {
    if (!temSetas || usaMovimentoReduzido()) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Nova `key` nos elementos animados → reinicia a animação CSS de desenho.
    setReproId((n) => n + 1);
    setADesenhar(true);
    timeoutRef.current = setTimeout(() => setADesenhar(false), duracaoTotal + 150);
  }

  // Arranque automático ao montar (abrir o modal), quando pedido e há setas. Os
  // keyframes são tratados pelo `CampoAnimado` (autoPlay), não aqui.
  useEffect(() => {
    if (temKeyframes || !autoReproduzir || !temSetas || usaMovimentoReduzido()) return;
    setReproId((n) => n + 1);
    setADesenhar(true);
    const t = setTimeout(() => setADesenhar(false), duracaoTotal + 150);
    return () => clearTimeout(t);
    // Reavalia se o diagrama mudar (novo exercício) — reinicia a reprodução.
  }, [temKeyframes, autoReproduzir, temSetas, duracaoTotal]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  // 1) Keyframes → motor de animação existente (players/bola em movimento).
  if (temKeyframes) {
    return (
      <CampoAnimado
        diagrama={diagrama}
        formato={formato}
        autoPlay={autoReproduzir}
        className={className}
      />
    );
  }

  // 3) Sem setas nem keyframes → nada para animar; miniatura estática.
  if (!temSetas) {
    return (
      <MiniaturaCampo
        diagrama={diagrama}
        formato={formato}
        largura={500}
        className={className ?? "w-full"}
      />
    );
  }

  // 2) Setas/linhas → desenho progressivo com botão play/replay sobreposto.
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CAMPO_W} ${CAMPO_H}`}
        className={className ?? "h-auto w-full rounded-md"}
        role="img"
        aria-label={`Diagrama de ${rotuloCampo(fmt)}`}
      >
        <LinhasCampo formato={fmt} />
        {diagrama.elementos.map((el) => {
          const ordem = setasOrdem.get(el.id);
          const anima =
            aDesenhar && ordem !== undefined
              ? { atrasoMs: ordem * ATRASO_ENTRE_SETAS, duracaoMs: DURACAO_DESENHO }
              : null;
          return (
            <ElementoSVG
              // Durante o desenho a `key` inclui `reproId` para reiniciar a
              // animação a cada reprodução; em repouso volta a `id` (render estático).
              key={anima ? `${el.id}-${reproId}` : el.id}
              elemento={el}
              animarTrajeto={anima}
            />
          );
        })}
      </svg>

      {/* Toda a imagem é clicável para (re)reproduzir — o pedido é "ao clicar na
          imagem, auto-reproduz". Não bloqueia interação (diagrama é só-leitura). */}
      <button
        type="button"
        onClick={reproduzir}
        aria-label={
          aDesenhar
            ? "A reproduzir a animação do exercício"
            : reproId > 0
              ? "Repetir a animação do exercício"
              : "Reproduzir a animação do exercício"
        }
        className="group absolute inset-0 flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full bg-cinza-900/55 text-white shadow-lg backdrop-blur-sm transition-opacity ${
            aDesenhar ? "opacity-0" : "opacity-90 group-hover:opacity-100"
          }`}
        >
          {reproId > 0 ? (
            <RotateCcw className="h-6 w-6" aria-hidden />
          ) : (
            <Play className="h-6 w-6 translate-x-0.5" aria-hidden />
          )}
        </span>
      </button>
    </div>
  );
}
