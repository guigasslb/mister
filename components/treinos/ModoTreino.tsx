"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  Pause,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import { LABEL_CATEGORIA, diagramaSchema } from "@/lib/schemas/exercicio";
import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";
import { AdaptarExercicioDialog } from "@/components/treinos/AdaptarExercicioDialog";
import type { CategoriaExercicioPrincipal } from "@prisma/client";

export type ExercicioModo = {
  id: string;
  nome: string;
  categoriaPrincipal: CategoriaExercicioPrincipal | null;
  objetivo: string | null;
  descricao: string | null;
  duracaoMin: number | null;
  diagrama: unknown;
  // Overrides por sessão (Fase 2): adaptações que só valem para esta sessão.
  series: number | null;
  descricaoOverride: string | null;
  notas: string | null;
};

function formatarTempo(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Diagrama grande, ou placeholder cinzento com bola quando não existe (Melhoria 3.5). */
function DiagramaGrande({ diagrama, nome }: { diagrama: unknown; nome: string }) {
  const diag = diagramaSchema.safeParse(diagrama);
  const temDiagrama = diag.success && diag.data.elementos.length > 0;

  if (temDiagrama && diag.success) {
    return (
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-lg border border-cinza-200">
        <MiniaturaCampo diagrama={diag.data} largura={640} className="w-full" />
      </div>
    );
  }
  return (
    <div
      className="mx-auto flex aspect-[2/1] w-full max-w-md items-center justify-center rounded-lg border border-dashed border-cinza-300 bg-cinza-50"
      aria-label={`${nome} sem diagrama`}
    >
      <svg viewBox="0 0 24 24" className="h-16 w-16 text-cinza-300" fill="currentColor">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

/**
 * Modo treino (Melhoria 3) — condução da sessão em campo, ecrã cheio. Mostra o
 * exercício atual em grande, cronómetro ascendente, progresso e navegação.
 */
export function ModoTreino({
  exercicios,
  onFinish,
}: {
  exercicios: ExercicioModo[];
  onFinish: () => void;
}) {
  const [indice, setIndice] = useState(0);
  const [segundos, setSegundos] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [adaptarAberto, setAdaptarAberto] = useState(false);

  // Cronómetro ascendente (tempo total decorrido na sessão). Não incrementa
  // enquanto estiver em pausa.
  useEffect(() => {
    if (pausado) return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pausado]);

  // Bloqueia o scroll do body enquanto o overlay está aberto.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  // Escape termina o treino — exceto quando o diálogo de adaptação está aberto
  // (nesse caso o Escape deve apenas fechar o diálogo, não terminar a sessão).
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape" && !adaptarAberto) onFinish();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish, adaptarAberto]);

  const total = exercicios.length;
  const atual = exercicios[indice];
  const ultimo = indice >= total - 1;

  function anterior() {
    setIndice((i) => Math.max(0, i - 1));
  }

  function proximo() {
    if (ultimo) onFinish();
    else setIndice((i) => Math.min(total - 1, i + 1));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true">
      {/* Topo: progresso + cronómetro + terminar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-cinza-200 px-4 py-3">
        <div className="flex items-center gap-1.5 text-corpo font-semibold text-cinza-900">
          <Clock className="h-5 w-5 text-primary" />
          <span
            className={`tabular-nums transition-opacity ${pausado ? "opacity-60" : ""}`}
            aria-label={pausado ? "Tempo decorrido (em pausa)" : "Tempo decorrido"}
          >
            {formatarTempo(segundos)}
          </span>
          <button
            type="button"
            onClick={() => setPausado((p) => !p)}
            aria-label={pausado ? "Retomar cronómetro" : "Pausar cronómetro"}
            aria-pressed={pausado}
            className="flex h-11 w-11 items-center justify-center rounded-md text-cinza-600 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {pausado ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </button>
        </div>
        <span className="text-corpo-sec font-medium text-cinza-600">
          Exercício {Math.min(indice + 1, total)}/{total}
        </span>
        <button
          type="button"
          onClick={onFinish}
          className="flex h-11 items-center gap-1.5 rounded-md px-3 text-corpo-sec font-medium text-vermelho-600 hover:bg-vermelho-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-5 w-5" />
          Terminar treino
        </button>
      </header>

      {/* Barra de progresso */}
      <div className="h-1.5 w-full shrink-0 bg-cinza-100">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${total > 0 ? ((indice + 1) / total) * 100 : 0}%` }}
        />
      </div>

      {/* Corpo: exercício atual (zona scrollável — min-h-0 é essencial para o
          overflow funcionar dentro do flex-col e não empurrar o footer). */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {atual ? (
          <div className="mx-auto max-w-md space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[24px] font-bold leading-tight text-cinza-900">
                  {atual.nome}
                </h2>
                <p className="mt-1 text-corpo-sec text-cinza-500">
                  {atual.categoriaPrincipal
                    ? LABEL_CATEGORIA[atual.categoriaPrincipal]
                    : "Sem categoria"}
                  {atual.duracaoMin ? ` · ${atual.duracaoMin} min` : ""}
                  {atual.series ? ` · ${atual.series} séries` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdaptarAberto(true)}
                aria-label="Adaptar exercício para esta sessão"
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-cinza-200 px-3 text-corpo-sec font-medium text-cinza-700 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <SlidersHorizontal className="h-5 w-5" />
                <span className="hidden sm:inline">Adaptar</span>
              </button>
            </div>

            <DiagramaGrande diagrama={atual.diagrama} nome={atual.nome} />

            {atual.objetivo && (
              <div>
                <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                  Objetivo
                </p>
                <p className="mt-1 text-corpo text-cinza-900">{atual.objetivo}</p>
              </div>
            )}

            {(() => {
              // Override da sessão substitui a descrição da biblioteca quando presente.
              const descricaoAExibir =
                atual.descricaoOverride && atual.descricaoOverride.trim() !== ""
                  ? atual.descricaoOverride
                  : atual.descricao;
              return descricaoAExibir ? (
                <div>
                  <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                    Descrição / montagem
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-corpo text-cinza-900">
                    {descricaoAExibir}
                  </p>
                </div>
              ) : null;
            })()}

            {atual.notas && atual.notas.trim() !== "" && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                <p className="text-legenda font-medium uppercase tracking-wide text-primary">
                  Notas do treinador
                </p>
                <p className="mt-1 whitespace-pre-wrap text-corpo-sec text-cinza-900">
                  {atual.notas}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-10 text-center text-corpo-sec text-cinza-500">
            Esta sessão não tem exercícios.
          </p>
        )}
      </div>

      {/* Navegação — fixa no fundo. "Anterior" subtil, "Próximo" proeminente. */}
      <footer className="flex shrink-0 items-center gap-3 border-t border-cinza-200 px-4 py-3">
        <button
          type="button"
          onClick={anterior}
          disabled={indice === 0}
          aria-label="Exercício anterior"
          className="flex h-14 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-cinza-200 bg-white px-4 text-corpo font-medium text-cinza-700 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="hidden sm:inline">Anterior</span>
        </button>
        <button
          type="button"
          onClick={proximo}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-lg bg-laranja-600 text-subtitulo font-semibold text-white hover:bg-[#A8370C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {ultimo ? "Terminar treino" : "Próximo exercício"}
          <ChevronRight className="h-5 w-5" />
        </button>
      </footer>

      {/* Adaptar exercício apenas para esta sessão (mesma ação do GestorExercicios). */}
      {atual && (
        <AdaptarExercicioDialog
          sessaoExercicioId={atual.id}
          exercicioNome={atual.nome}
          valorActual={{
            duracaoMin: atual.duracaoMin,
            series: atual.series,
            descricaoOverride: atual.descricaoOverride,
            notas: atual.notas,
          }}
          aberto={adaptarAberto}
          onFechar={() => setAdaptarAberto(false)}
        />
      )}
    </div>
  );
}
