"use client";

import { useEffect, useState } from "react";
import { Pause, Play, Square, StickyNote, Timer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EstadoJogoAoVivo } from "@/lib/jogo-ao-vivo-local";

/**
 * Barra de controlo do Modo Jogo ao Vivo (§8.25.3). Mostra apenas os botões
 * relevantes para o estado atual (`EstadoJogoAoVivo`) e um botão de notas que
 * abre um *bottom sheet* — as notas ficam sempre acessíveis sem interromper o
 * jogo (guardadas em `Jogo.relatorio`, chave `notasAoVivo`).
 */
export function BarraControloJogo({
  estado,
  parteAtual,
  numeroPartes,
  ocupado,
  notas,
  onIniciarParte,
  onTerminarParte,
  onPausar,
  onRetomar,
  onTerminarJogo,
  onGuardarNotas,
}: {
  estado: EstadoJogoAoVivo;
  parteAtual: number;
  numeroPartes: number;
  /** Desativa os botões enquanto uma operação corre. */
  ocupado: boolean;
  notas: string;
  onIniciarParte: () => void;
  onTerminarParte: () => void;
  onPausar: () => void;
  onRetomar: () => void;
  onTerminarJogo: () => void;
  onGuardarNotas: (texto: string) => void;
}) {
  const [notasAberto, setNotasAberto] = useState(false);
  const [rascunho, setRascunho] = useState(notas);

  // Mantém o rascunho em sincronia quando as notas mudam por fora (ex.: hidratação).
  useEffect(() => setRascunho(notas), [notas]);

  const ultimaParte = parteAtual >= numeroPartes;

  function guardarNotas() {
    onGuardarNotas(rascunho);
    setNotasAberto(false);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {estado === "EM_CURSO" && (
          <>
            {!ultimaParte && (
              <Button
                onClick={onTerminarParte}
                disabled={ocupado}
                variant="outline"
                className="min-h-[48px] border-white/25 bg-white/10 text-white hover:bg-white/20"
              >
                <Timer className="h-4 w-4" />
                Intervalo / Fim da Parte {parteAtual}
              </Button>
            )}
            <Button
              onClick={onPausar}
              disabled={ocupado}
              variant="outline"
              className="min-h-[48px] border-white/25 bg-white/10 text-white hover:bg-white/20"
            >
              <Pause className="h-4 w-4" />
              Pausar
            </Button>
            <Button
              onClick={onTerminarJogo}
              disabled={ocupado}
              variant="destructive"
              className="min-h-[48px]"
            >
              <Square className="h-4 w-4" />
              Terminar jogo
            </Button>
          </>
        )}

        {estado === "INTERVALO" && (
          <>
            <Button
              onClick={onIniciarParte}
              disabled={ocupado}
              className="min-h-[48px]"
            >
              <Play className="h-4 w-4" />
              Iniciar Parte {Math.min(parteAtual + 1, numeroPartes)}
            </Button>
            <Button
              onClick={onTerminarJogo}
              disabled={ocupado}
              variant="destructive"
              className="min-h-[48px]"
            >
              <Square className="h-4 w-4" />
              Terminar jogo
            </Button>
          </>
        )}

        {estado === "PAUSADO" && (
          <>
            <Button onClick={onRetomar} disabled={ocupado} className="min-h-[48px]">
              <Play className="h-4 w-4" />
              Retomar
            </Button>
            <Button
              onClick={onTerminarJogo}
              disabled={ocupado}
              variant="destructive"
              className="min-h-[48px]"
            >
              <Square className="h-4 w-4" />
              Terminar jogo
            </Button>
          </>
        )}

        {/* Notas — sempre acessível (exceto quando o jogo terminou). */}
        {estado !== "TERMINADO" && (
          <Button
            onClick={() => setNotasAberto(true)}
            variant="outline"
            size="icon"
            className="min-h-[48px] min-w-[48px] border-white/25 bg-white/10 text-white hover:bg-white/20"
            aria-label="Notas do jogo"
          >
            <StickyNote className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Bottom sheet de notas. */}
      <Dialog open={notasAberto} onOpenChange={setNotasAberto}>
        <DialogContent className="left-0 right-0 top-auto bottom-0 max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl border-x-0 border-b-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:left-[50%] sm:right-auto sm:top-auto sm:bottom-6 sm:max-w-lg sm:translate-x-[-50%] sm:rounded-2xl sm:border">
          <DialogHeader>
            <DialogTitle>Notas do jogo</DialogTitle>
            <DialogDescription>
              Fica disponível na análise do jogo. Guarda quando quiseres.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            rows={5}
            maxLength={3000}
            placeholder="Observações rápidas durante o jogo…"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNotasAberto(false)}>
              Fechar
            </Button>
            <Button onClick={guardarNotas}>Guardar notas</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
