"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  LogOut,
} from "lucide-react";
import {
  LABEL_CATEGORIA,
  diagramaSchema,
  type ParteTreinoValor,
} from "@/lib/schemas/exercicio";
import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";
import { CampoAnimado } from "@/components/campo/CampoAnimado";
import { AdaptarExercicioDialog } from "@/components/treinos/AdaptarExercicioDialog";
import { guardarTreinoSuspenso, limparTreinoSuspenso } from "@/lib/treino-suspenso";
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
  // §3.5: fase do treino deste exercício nesta sessão (null = sem fase).
  parteTreino: ParteTreinoValor | null;
};

function formatarTempo(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Diagrama grande, ou placeholder cinzento com bola quando não existe (Melhoria 3.5). */
function DiagramaGrande({ diagrama, nome }: { diagrama: unknown; nome: string }) {
  // Memoiza o parse: `safeParse` cria um objeto novo a cada render e o
  // `CampoAnimado` depende da identidade do diagrama (useMemo dos keyframes) —
  // sem isto, cada render reinicia a animação (ciclo de renders no autoPlay).
  const diag = useMemo(() => diagramaSchema.safeParse(diagrama), [diagrama]);
  const dados = diag.success ? diag.data : null;
  const temDiagrama = dados !== null && dados.elementos.length > 0;
  // Tem animação quando existe pelo menos um passo (keyframe além da base).
  const temAnimacao = dados !== null && (dados.passos?.length ?? 0) > 0;

  if (dados && temDiagrama && temAnimacao) {
    // Animação arranca sozinha em ciclo assim que o painel do exercício abre.
    return (
      <div className="mx-auto w-full max-w-md">
        <CampoAnimado
          diagrama={dados}
          autoPlay
          className="w-full h-auto rounded-lg border border-cinza-200"
        />
      </div>
    );
  }
  if (dados && temDiagrama) {
    return (
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-lg border border-cinza-200">
        <MiniaturaCampo diagrama={dados} largura={640} className="w-full" />
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
  sessaoId,
  indiceInicial = 0,
  segundosIniciais = 0,
  onFinish,
  onSuspend,
}: {
  exercicios: ExercicioModo[];
  sessaoId: string;
  /** Exercício onde arrancar (0-based) — usado ao retomar uma sessão suspensa. */
  indiceInicial?: number;
  /** Segundos já decorridos — usado ao retomar uma sessão suspensa. */
  segundosIniciais?: number;
  /** Termina definitivamente a sessão. */
  onFinish: () => void;
  /** Sai do modo treino sem terminar, mantendo o estado guardado localmente. */
  onSuspend: () => void;
}) {
  const [indice, setIndice] = useState(indiceInicial);
  const [segundos, setSegundos] = useState(segundosIniciais);
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
      if (ev.key === "Escape" && !adaptarAberto) {
        // Escape termina definitivamente — limpa o estado suspenso, se existir.
        limparTreinoSuspenso(sessaoId);
        onFinish();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish, adaptarAberto, sessaoId]);

  const total = exercicios.length;
  const atual = exercicios[indice];
  const ultimo = indice >= total - 1;

  function terminarDefinitivo() {
    limparTreinoSuspenso(sessaoId);
    onFinish();
  }

  function suspender() {
    guardarTreinoSuspenso(sessaoId, indice, segundos);
    onSuspend();
  }

  function anterior() {
    setIndice((i) => Math.max(0, i - 1));
    setSegundos(0);
  }

  function proximo() {
    if (ultimo) terminarDefinitivo();
    else {
      setIndice((i) => Math.min(total - 1, i + 1));
      setSegundos(0);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-white"
      role="dialog"
      aria-modal="true"
    >
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
          <button
            type="button"
            onClick={() => setSegundos(0)}
            aria-label="Reiniciar cronómetro"
            className="flex h-11 w-11 items-center justify-center rounded-md text-cinza-600 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
        <span className="hidden text-corpo-sec font-medium text-cinza-600 sm:inline">
          Exercício {Math.min(indice + 1, total)}/{total}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={suspender}
            aria-label="Suspender treino"
            className="flex h-11 items-center gap-1.5 rounded-md border border-cinza-200 px-3 text-corpo-sec font-medium text-cinza-700 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogOut className="h-5 w-5" />
            <span className="hidden sm:inline">Suspender</span>
          </button>
          <button
            type="button"
            onClick={terminarDefinitivo}
            aria-label="Terminar treino"
            className="flex h-11 items-center gap-1.5 rounded-md px-3 text-corpo-sec font-medium text-vermelho-600 hover:bg-vermelho-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-5 w-5" />
            <span className="hidden sm:inline">Terminar</span>
          </button>
        </div>
      </header>

      {/* Barra de progresso */}
      <div className="h-1.5 w-full shrink-0 bg-cinza-100">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${total > 0 ? ((indice + 1) / total) * 100 : 0}%` }}
        />
      </div>

      {/* Corpo: exercício atual (zona scrollável — min-h-0 é essencial para o
          overflow funcionar dentro do flex-col e não empurrar o footer; o pb-24
          garante folga para o último parágrafo não ficar atrás do footer). */}
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-24">
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
      </main>

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
            parteTreino: atual.parteTreino,
          }}
          aberto={adaptarAberto}
          onFechar={() => setAdaptarAberto(false)}
        />
      )}
    </div>
  );
}
