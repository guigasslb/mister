"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FormatoJogo } from "@prisma/client";
import { CAMPO_W, CAMPO_H, LinhasCampo, ElementoSVG, rotuloCampo } from "./desenho";
import { ControlosPlayback } from "./ControlosPlayback";
import {
  construirKeyframes,
  ease,
  DURACAO_PADRAO,
  type Pos,
} from "./animacao";
import type { DiagramaCampo, ElementoCampo, PassoAnimacao } from "@/lib/schemas/exercicio";

// Duração entre passos quando prefers-reduced-motion (avanço instantâneo, sem tween).
const DURACAO_REDUZIDA = 700;

function usaMovimentoReduzido(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CampoAnimado({
  diagrama,
  formato,
  className,
  autoPlay = false,
}: {
  diagrama: DiagramaCampo;
  formato?: FormatoJogo;
  className?: string;
  // Quando `true` e o diagrama tem passos, a animação arranca sozinha em ciclo
  // assim que o componente monta (ou quando o diagrama muda) — sem clicar em play.
  // Usado no Modo Treino (§3/§11): abrir o exercício reproduz logo a animação.
  autoPlay?: boolean;
}) {
  const fmt = formato ?? diagrama.campo ?? FormatoJogo.FUTSAL_5;
  const keyframes = useMemo(() => construirKeyframes(diagrama), [diagrama]);
  const passos = useMemo(
    () => [...(diagrama.passos ?? [])].sort((a, b) => a.ordem - b.ordem),
    [diagrama.passos],
  );
  const temAnimacao = keyframes.length > 1;

  const [posicoes, setPosicoes] = useState<Map<string, Pos>>(keyframes[0]);
  const [aPlay, setAPlay] = useState(false);
  // Em autoPlay o ciclo começa ativo (a animação repete-se enquanto o painel
  // estiver aberto); o utilizador pode desligá-lo pelos controlos.
  const [loop, setLoop] = useState(autoPlay);
  const [velocidade, setVelocidade] = useState<0.5 | 1 | 2>(1);
  const [movimentoReduzido, setMovimentoReduzido] = useState(false);

  // Refs para o loop de animação (corrige B6: sem closures obsoletas no RAF).
  const keyframesRef = useRef(keyframes);
  const passosRef = useRef<PassoAnimacao[]>(passos);
  const velocidadeRef = useRef(velocidade);
  const loopRef = useRef(loop);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    keyframesRef.current = keyframes;
    passosRef.current = passos;
  }, [keyframes, passos]);
  useEffect(() => {
    velocidadeRef.current = velocidade;
  }, [velocidade]);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  // Detecta prefers-reduced-motion e reage a mudanças.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMovimentoReduzido(mq.matches);
    const ouvir = () => setMovimentoReduzido(mq.matches);
    mq.addEventListener("change", ouvir);
    return () => mq.removeEventListener("change", ouvir);
  }, []);

  // Repõe o frame base quando o diagrama muda. Com `autoPlay` e havendo animação
  // (mais do que um keyframe), arranca automaticamente — assim, ao abrir o
  // exercício no Modo Treino, a animação começa logo em ciclo, sem clicar em play.
  useEffect(() => {
    setPosicoes(keyframes[0]);
    setAPlay(autoPlay && keyframes.length > 1);
  }, [keyframes, autoPlay]);

  // Loop de playback.
  useEffect(() => {
    if (!aPlay) return;

    const reduzido = usaMovimentoReduzido();

    // ── Movimento reduzido: avança passo-a-passo, sem interpolação ──
    if (reduzido) {
      let segmento = 0;
      setPosicoes(keyframesRef.current[0]);
      function avancar() {
        segmento++;
        const kfs = keyframesRef.current;
        if (segmento >= kfs.length) {
          if (loopRef.current) {
            segmento = 0;
            setPosicoes(kfs[0]);
          } else {
            setAPlay(false);
            return;
          }
        } else {
          setPosicoes(kfs[segmento]);
        }
        timeoutRef.current = setTimeout(avancar, DURACAO_REDUZIDA);
      }
      timeoutRef.current = setTimeout(avancar, DURACAO_REDUZIDA);
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }

    // ── Playback normal: interpolação suave com requestAnimationFrame ──
    let segmento = 0;
    let inicio = performance.now();

    function frame(agora: number) {
      const kfs = keyframesRef.current;
      const de = kfs[segmento];
      const para = kfs[segmento + 1];
      if (!de || !para) {
        setAPlay(false);
        return;
      }
      const durBase = passosRef.current[segmento]?.duracaoMs ?? DURACAO_PADRAO;
      const dur = durBase / velocidadeRef.current;
      const t = Math.min(1, (agora - inicio) / dur);
      const te = ease(t);

      const interp = new Map<string, Pos>();
      for (const [id, p] of para) {
        const p0 = de.get(id) ?? p;
        interp.set(id, {
          x: p0.x + (p.x - p0.x) * te,
          y: p0.y + (p.y - p0.y) * te,
        });
      }
      setPosicoes(interp);

      if (t >= 1) {
        segmento++;
        if (segmento >= kfs.length - 1) {
          if (loopRef.current) {
            segmento = 0;
            inicio = agora;
          } else {
            setPosicoes(kfs[kfs.length - 1]);
            setAPlay(false);
            return;
          }
        } else {
          inicio = agora;
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [aPlay]);

  function reproduzir() {
    setPosicoes(keyframes[0]);
    setAPlay(true);
  }
  function pausar() {
    setAPlay(false);
  }
  function reiniciar() {
    setAPlay(false);
    setPosicoes(keyframes[0]);
  }

  // Aplica as posições animadas aos elementos-ponto.
  const elementos: ElementoCampo[] = diagrama.elementos.map((el) => {
    if ("x" in el && "y" in el) {
      const p = posicoes.get(el.id);
      return p ? { ...el, x: p.x, y: p.y } : el;
    }
    return el;
  });

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${CAMPO_W} ${CAMPO_H}`}
        className={className ?? "w-full h-auto rounded-md"}
        role="img"
        aria-label={`Diagrama animado de ${rotuloCampo(fmt)}`}
      >
        <LinhasCampo formato={fmt} />
        {elementos.map((el) => (
          <ElementoSVG key={el.id} elemento={el} />
        ))}
      </svg>

      {temAnimacao && (
        <div className="flex flex-wrap items-center gap-3">
          <ControlosPlayback
            aPlay={aPlay}
            loop={loop}
            velocidade={velocidade}
            onPlay={reproduzir}
            onPause={pausar}
            onReiniciar={reiniciar}
            onVelocidade={setVelocidade}
            onToggleLoop={() => setLoop((v) => !v)}
          />
          <span className="text-legenda text-cinza-500">
            {keyframes.length - 1} passo(s)
            {movimentoReduzido && " · movimento reduzido"}
          </span>
        </div>
      )}
    </div>
  );
}
