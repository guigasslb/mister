"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Clock,
  ListOrdered,
  Check,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  adicionarExercicioSessao,
  removerExercicioSessao,
  reordenarExercicios,
} from "@/lib/actions/treinos";
import { LABEL_CATEGORIA, diagramaSchema } from "@/lib/schemas/exercicio";
import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";
import { ModalDiagramaExercicio } from "@/components/treinos/ModalDiagramaExercicio";
import { AdaptarExercicioDialog } from "@/components/treinos/AdaptarExercicioDialog";
import type { CategoriaExercicioPrincipal } from "@prisma/client";

type ExercicioSessao = {
  id: string;
  ordem: number;
  duracaoMin: number | null;
  // Overrides por sessão (Fase 2) — vivem no SessaoExercicio, não no exercício-base.
  series: number | null;
  descricaoOverride: string | null;
  notas: string | null;
  exercicio: {
    id: string;
    nome: string;
    categoriaPrincipal: CategoriaExercicioPrincipal | null;
    // Já resolvidos (original → snapshot) no servidor (§4.2.1).
    descricao: string | null;
    objetivo: string | null;
    diagrama: unknown;
  };
};

type ExercicioBiblioteca = {
  id: string;
  nome: string;
  categoriaPrincipal: CategoriaExercicioPrincipal | null;
  duracaoMin: number | null;
};

/** Miniatura do diagrama, ou placeholder cinzento se o exercício não tiver campo. */
function DiagramaCartao({ diagrama, nome }: { diagrama: unknown; nome: string }) {
  const diag = diagramaSchema.safeParse(diagrama);
  const temDiagrama = diag.success && diag.data.elementos.length > 0;

  if (temDiagrama && diag.success) {
    return (
      <div className="w-24 flex-shrink-0 overflow-hidden rounded border border-cinza-200 sm:w-28">
        <MiniaturaCampo
          diagrama={diag.data}
          largura={112}
          className="w-full"
        />
      </div>
    );
  }
  return (
    <div
      className="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded border border-dashed border-cinza-300 bg-cinza-50 sm:w-28"
      aria-label={`${nome} sem diagrama`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-cinza-300" fill="currentColor">
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

export function GestorExercicios({
  sessaoId,
  exercicios,
  biblioteca,
}: {
  sessaoId: string;
  exercicios: ExercicioSessao[];
  biblioteca: ExercicioBiblioteca[];
}) {
  const [pending, startTransition] = useTransition();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [exercicioModal, setExercicioModal] = useState<
    ExercicioSessao["exercicio"] | null
  >(null);
  const [exercicioAdaptar, setExercicioAdaptar] = useState<
    (typeof exercicios)[0] | null
  >(null);

  const total = exercicios.reduce((acc, e) => acc + (e.duracaoMin ?? 0), 0);
  const jaAdicionados = new Set(exercicios.map((e) => e.exercicio.id));

  function adicionar(exercicioId: string) {
    startTransition(async () => {
      const res = await adicionarExercicioSessao(sessaoId, exercicioId);
      if (res.sucesso) {
        toast.success("Exercício adicionado");
        setDialogAberto(false);
      } else {
        toast.error(res.erro);
      }
    });
  }

  function remover(sessaoExercicioId: string) {
    startTransition(async () => {
      const res = await removerExercicioSessao(sessaoExercicioId);
      if (!res.sucesso) toast.error(res.erro);
    });
  }

  function mover(index: number, direcao: -1 | 1) {
    const novo = index + direcao;
    if (novo < 0 || novo >= exercicios.length) return;
    const reordenado = [...exercicios];
    [reordenado[index], reordenado[novo]] = [reordenado[novo], reordenado[index]];
    const ordens = reordenado.map((e, i) => ({ id: e.id, ordem: i }));
    startTransition(async () => {
      const res = await reordenarExercicios(sessaoId, ordens);
      if (!res.sucesso) toast.error(res.erro);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-subtitulo text-cinza-900">Exercícios</h2>
        <div className="flex items-center gap-2">
          {exercicios.length > 1 && (
            <Button
              type="button"
              variant={modoEdicao ? "default" : "outline"}
              size="sm"
              onClick={() => setModoEdicao((v) => !v)}
            >
              {modoEdicao ? (
                <>
                  <Check className="h-4 w-4" />
                  Concluir
                </>
              ) : (
                <>
                  <ListOrdered className="h-4 w-4" />
                  Editar ordem
                </>
              )}
            </Button>
          )}
          <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Adicionar exercício da biblioteca</DialogTitle>
              </DialogHeader>
              {biblioteca.length === 0 ? (
                <p className="text-corpo-sec text-cinza-600">
                  A biblioteca está vazia. Cria exercícios primeiro.
                </p>
              ) : (
                <ul className="space-y-2">
                  {biblioteca.map((ex) => (
                    <li
                      key={ex.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-cinza-200 p-3"
                    >
                      <div>
                        <p className="text-corpo font-medium text-cinza-900">{ex.nome}</p>
                        <p className="text-legenda text-cinza-500">
                          {ex.categoriaPrincipal
                            ? LABEL_CATEGORIA[ex.categoriaPrincipal]
                            : "Sem categoria"}
                          {ex.duracaoMin ? ` · ${ex.duracaoMin} min` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={jaAdicionados.has(ex.id) ? "ghost" : "outline"}
                        disabled={pending}
                        onClick={() => adicionar(ex.id)}
                      >
                        {jaAdicionados.has(ex.id) ? "Adicionar +1" : "Adicionar"}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {exercicios.length === 0 ? (
        <p className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
          Sem exercícios. Adiciona exercícios da biblioteca.
        </p>
      ) : (
        <>
          <ol className="space-y-2">
            {exercicios.map((e, i) => {
              const aberto = expandido === e.id;
              const temDetalhe = Boolean(e.exercicio.descricao);
              return (
                <li
                  key={e.id}
                  className="overflow-hidden rounded-md border border-cinza-200 bg-white shadow-card"
                >
                  <div className="flex items-stretch gap-2 p-2.5">
                    {modoEdicao && (
                      <div className="flex flex-col justify-center">
                        <button
                          type="button"
                          onClick={() => mover(i, -1)}
                          disabled={i === 0 || pending}
                          className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                          aria-label={`Subir ${e.exercicio.nome}`}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => mover(i, 1)}
                          disabled={i === exercicios.length - 1 || pending}
                          className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                          aria-label={`Descer ${e.exercicio.nome}`}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setExercicioModal(e.exercicio)}
                      title="Ver diagrama em grande"
                      aria-label="Ver diagrama em grande"
                      className="flex-shrink-0 cursor-pointer rounded transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <DiagramaCartao diagrama={e.exercicio.diagrama} nome={e.exercicio.nome} />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        temDetalhe ? setExpandido(aberto ? null : e.id) : undefined
                      }
                      aria-expanded={temDetalhe ? aberto : undefined}
                      className="flex min-w-0 flex-1 items-start gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="mt-0.5 text-corpo font-semibold text-cinza-400">
                        {i + 1}.
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-corpo font-medium text-cinza-900">
                          {e.exercicio.nome}
                        </span>
                        <span className="block text-legenda text-cinza-500">
                          {e.exercicio.categoriaPrincipal
                            ? LABEL_CATEGORIA[e.exercicio.categoriaPrincipal]
                            : "Sem categoria"}
                          {e.duracaoMin ? ` · ${e.duracaoMin} min` : ""}
                        </span>
                        {e.exercicio.objetivo && (
                          <span className="mt-0.5 block line-clamp-2 text-legenda text-cinza-600">
                            {e.exercicio.objetivo}
                          </span>
                        )}
                      </span>
                      {temDetalhe && (
                        <ChevronRight
                          className={`mt-1 h-4 w-4 flex-shrink-0 text-cinza-400 transition-transform ${
                            aberto ? "rotate-90" : ""
                          }`}
                        />
                      )}
                    </button>

                    {!modoEdicao && (
                      <button
                        type="button"
                        onClick={() => setExercicioAdaptar(e)}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-cinza-400 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label="Adaptar para esta sessão"
                        title="Adaptar para esta sessão"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </button>
                    )}

                    {modoEdicao && (
                      <button
                        type="button"
                        onClick={() => remover(e.id)}
                        disabled={pending}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-vermelho-600 hover:bg-vermelho-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                        aria-label={`Remover ${e.exercicio.nome}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {aberto && temDetalhe && (
                    <div className="border-t border-cinza-100 bg-cinza-50 px-3 py-3">
                      <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                        Descrição / montagem
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-corpo-sec text-cinza-900">
                        {e.exercicio.descricao}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {total > 0 && (
            <p className="flex items-center gap-1 text-corpo-sec text-cinza-600">
              <Clock className="h-4 w-4" />
              Total: {total} min
            </p>
          )}
        </>
      )}

      <ModalDiagramaExercicio
        aberto={exercicioModal !== null}
        onFechar={() => setExercicioModal(null)}
        exercicio={
          exercicioModal ?? {
            nome: "",
            diagrama: null,
            objetivo: null,
            descricao: null,
          }
        }
      />

      {exercicioAdaptar && (
        <AdaptarExercicioDialog
          sessaoExercicioId={exercicioAdaptar.id}
          exercicioNome={exercicioAdaptar.exercicio.nome}
          valorActual={{
            duracaoMin: exercicioAdaptar.duracaoMin ?? null,
            series: exercicioAdaptar.series ?? null,
            descricaoOverride: exercicioAdaptar.descricaoOverride ?? null,
            notas: exercicioAdaptar.notas ?? null,
          }}
          aberto={true}
          onFechar={() => setExercicioAdaptar(null)}
        />
      )}
    </section>
  );
}
