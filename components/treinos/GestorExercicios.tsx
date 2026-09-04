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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  LABEL_CATEGORIA,
  diagramaSchema,
  PARTES_TREINO,
  LABEL_PARTE_TREINO,
  type ParteTreinoValor,
} from "@/lib/schemas/exercicio";
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
  // §3.5: fase do treino deste exercício nesta sessão (null = sem fase).
  parteTreino: ParteTreinoValor | null;
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
  // Melhoria 1: diagrama para pré-visualização no seletor.
  diagrama: unknown;
  // §3.5: fase sugerida por defeito ao adicionar (herdada do exercício).
  parteTreino: ParteTreinoValor | null;
  // Detalhe mostrado ao expandir o exercício no seletor (campo maior + descrição).
  descricao: string | null;
  objetivo: string | null;
};

// Sentinela do filtro "todas as fases" no seletor da biblioteca.
const TODAS_FASES = "__todas__" as const;
type FiltroFaseValor = ParteTreinoValor | typeof TODAS_FASES;

// §3.5: ordem canónica das fases + bucket para exercícios sem fase (rows legadas).
const SEM_FASE = "SEM_FASE" as const;
type FaseKey = ParteTreinoValor | typeof SEM_FASE;
const ORDEM_FASES: FaseKey[] = [...PARTES_TREINO, SEM_FASE];
const LABEL_FASE: Record<FaseKey, string> = {
  ...LABEL_PARTE_TREINO,
  [SEM_FASE]: "Sem fase",
};

/** Miniatura do diagrama, ou placeholder cinzento se o exercício não tiver campo. */
function DiagramaCartao({
  diagrama,
  nome,
  largura = 112,
  className = "w-24 sm:w-28",
}: {
  diagrama: unknown;
  nome: string;
  largura?: number;
  className?: string;
}) {
  const diag = diagramaSchema.safeParse(diagrama);
  const temDiagrama = diag.success && diag.data.elementos.length > 0;

  if (temDiagrama && diag.success) {
    return (
      <div
        className={`flex-shrink-0 overflow-hidden rounded border border-cinza-200 ${className}`}
      >
        <MiniaturaCampo diagrama={diag.data} largura={largura} className="w-full" />
      </div>
    );
  }
  return (
    <div
      className={`flex h-16 flex-shrink-0 items-center justify-center rounded border border-dashed border-cinza-300 bg-cinza-50 ${className}`}
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
  // Bug 1: exercício da biblioteca expandido no seletor (campo maior + descrição).
  const [bibExpandido, setBibExpandido] = useState<string | null>(null);
  // Bug 2: filtro por fase de treino aplicado à lista da biblioteca no seletor.
  const [filtroFase, setFiltroFase] = useState<FiltroFaseValor>(TODAS_FASES);
  // §3.5: fase escolhida no formulário de adição (aplica-se ao exercício adicionado).
  const [faseAdicionar, setFaseAdicionar] = useState<ParteTreinoValor>("PRINCIPAL");
  const [exercicioModal, setExercicioModal] = useState<
    ExercicioSessao["exercicio"] | null
  >(null);
  const [exercicioAdaptar, setExercicioAdaptar] = useState<ExercicioSessao | null>(null);

  const total = exercicios.reduce((acc, e) => acc + (e.duracaoMin ?? 0), 0);
  const jaAdicionados = new Set(exercicios.map((e) => e.exercicio.id));

  // Bug 2: aplicar o filtro por fase à biblioteca mostrada no seletor. Filtra pela
  // fase sugerida do exercício (`parteTreino`); "todas as fases" mostra tudo.
  const bibliotecaFiltrada =
    filtroFase === TODAS_FASES
      ? biblioteca
      : biblioteca.filter((ex) => ex.parteTreino === filtroFase);

  // §3.5: agrupamento por fase, preservando a ordem (exercícios já vêm ordenados
  // por `ordem`). Só se renderizam grupos com exercícios.
  const grupos: Record<FaseKey, ExercicioSessao[]> = {
    AQUECIMENTO: [],
    PRINCIPAL: [],
    JOGO_REDUZIDO: [],
    RETORNO_CALMA: [],
    [SEM_FASE]: [],
  };
  for (const e of exercicios) grupos[e.parteTreino ?? SEM_FASE].push(e);

  // Numeração global na ordem de visualização (fase a fase).
  const numeroDe: Record<string, number> = {};
  let contador = 0;
  for (const fase of ORDEM_FASES)
    for (const e of grupos[fase]) numeroDe[e.id] = ++contador;

  function adicionar(exercicioId: string) {
    startTransition(async () => {
      const res = await adicionarExercicioSessao(sessaoId, exercicioId, faseAdicionar);
      if (res.sucesso) {
        toast.success(`Exercício adicionado a "${LABEL_PARTE_TREINO[faseAdicionar]}"`);
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

  // §3.5: reordenar DENTRO de uma fase. Reatribui `ordem` global (fase a fase)
  // para manter a sequência coerente com a visualização e evitar colisões no
  // unique [sessaoId, ordem].
  function mover(fase: FaseKey, indexNoGrupo: number, direcao: -1 | 1) {
    const grupo = grupos[fase];
    const alvo = indexNoGrupo + direcao;
    if (alvo < 0 || alvo >= grupo.length) return;

    const novoGrupo = [...grupo];
    [novoGrupo[indexNoGrupo], novoGrupo[alvo]] = [novoGrupo[alvo], novoGrupo[indexNoGrupo]];

    const flat: ExercicioSessao[] = [];
    for (const f of ORDEM_FASES) flat.push(...(f === fase ? novoGrupo : grupos[f]));
    const ordens = flat.map((e, i) => ({ id: e.id, ordem: i }));

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
          {exercicios.length > 0 && (
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
                  {/* Um único exercício não se reordena, mas tem de poder remover-se
                      (§8.8.2 — sessões, incl. concluídas, são editáveis). */}
                  {exercicios.length > 1 ? "Editar ordem" : "Editar"}
                </>
              )}
            </Button>
          )}
          <Dialog
            open={dialogAberto}
            onOpenChange={(aberto) => {
              setDialogAberto(aberto);
              if (!aberto) setBibExpandido(null);
            }}
          >
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

              {/* §3.5: escolher a fase do treino a que o exercício será adicionado. */}
              <div className="space-y-1.5">
                <Label htmlFor="fase-adicionar">Fase do treino</Label>
                <Select
                  value={faseAdicionar}
                  onValueChange={(v) => setFaseAdicionar(v as ParteTreinoValor)}
                >
                  <SelectTrigger id="fase-adicionar">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTES_TREINO.map((p) => (
                      <SelectItem key={p} value={p}>
                        {LABEL_PARTE_TREINO[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bug 2: filtro por fase — restringe a biblioteca à fase sugerida. */}
              <div className="space-y-1.5">
                <Label htmlFor="filtro-fase">Filtrar por fase</Label>
                <Select
                  value={filtroFase}
                  onValueChange={(v) => {
                    setFiltroFase(v as FiltroFaseValor);
                    setBibExpandido(null);
                  }}
                >
                  <SelectTrigger id="filtro-fase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODAS_FASES}>Todas as fases</SelectItem>
                    {PARTES_TREINO.map((p) => (
                      <SelectItem key={p} value={p}>
                        {LABEL_PARTE_TREINO[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {biblioteca.length === 0 ? (
                <p className="text-corpo-sec text-cinza-600">
                  A biblioteca está vazia. Cria exercícios primeiro.
                </p>
              ) : bibliotecaFiltrada.length === 0 ? (
                <p className="text-corpo-sec text-cinza-600">
                  Nenhum exercício na fase &ldquo;{LABEL_PARTE_TREINO[filtroFase as ParteTreinoValor]}&rdquo;.
                </p>
              ) : (
                <ul className="space-y-2">
                  {bibliotecaFiltrada.map((ex) => {
                    // Bug 1: clicar no exercício expande (campo maior + descrição).
                    const aberto = bibExpandido === ex.id;
                    const temDetalhe = Boolean(ex.descricao || ex.objetivo);
                    return (
                      <li
                        key={ex.id}
                        className="overflow-hidden rounded-md border border-cinza-200"
                      >
                        <div className="flex items-center gap-3 p-3">
                          {/* Melhoria 1: pré-visualização do diagrama no seletor. */}
                          <DiagramaCartao
                            diagrama={ex.diagrama}
                            nome={ex.nome}
                            largura={80}
                            className="w-20"
                          />
                          <button
                            type="button"
                            onClick={() => setBibExpandido(aberto ? null : ex.id)}
                            aria-expanded={aberto}
                            className="flex min-w-0 flex-1 items-start gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-corpo font-medium text-cinza-900">
                                {ex.nome}
                              </span>
                              <span className="block text-legenda text-cinza-500">
                                {ex.categoriaPrincipal
                                  ? LABEL_CATEGORIA[ex.categoriaPrincipal]
                                  : "Sem categoria"}
                                {ex.duracaoMin ? ` · ${ex.duracaoMin} min` : ""}
                              </span>
                            </span>
                            <ChevronRight
                              className={`mt-0.5 h-4 w-4 flex-shrink-0 text-cinza-400 transition-transform ${
                                aberto ? "rotate-90" : ""
                              }`}
                            />
                          </button>
                          <Button
                            size="sm"
                            variant={jaAdicionados.has(ex.id) ? "ghost" : "outline"}
                            disabled={pending}
                            onClick={() => adicionar(ex.id)}
                          >
                            {jaAdicionados.has(ex.id) ? "Adicionar +1" : "Adicionar"}
                          </Button>
                        </div>

                        {aberto && (
                          <div className="flex flex-col gap-3 border-t border-cinza-100 bg-cinza-50 p-3 sm:flex-row">
                            {/* Campo maior no estado expandido. */}
                            <DiagramaCartao
                              diagrama={ex.diagrama}
                              nome={ex.nome}
                              largura={220}
                              className="w-full sm:w-56"
                            />
                            <div className="min-w-0 flex-1 space-y-2">
                              {ex.objetivo && (
                                <div>
                                  <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                                    Objetivo
                                  </p>
                                  <p className="mt-0.5 whitespace-pre-wrap text-corpo-sec text-cinza-900">
                                    {ex.objetivo}
                                  </p>
                                </div>
                              )}
                              {ex.descricao && (
                                <div>
                                  <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                                    Descrição / montagem
                                  </p>
                                  <p className="mt-0.5 whitespace-pre-wrap text-corpo-sec text-cinza-900">
                                    {ex.descricao}
                                  </p>
                                </div>
                              )}
                              {!temDetalhe && (
                                <p className="text-corpo-sec text-cinza-500">
                                  Sem descrição para este exercício.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {exercicios.length === 0 ? (
        // §8.8.2: sessões (incl. concluídas) são sempre editáveis. O empty state
        // é acionável — nunca um dead-end — para permitir adicionar exercícios
        // retroativamente a treinos já realizados.
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-cinza-300 p-6 text-center">
          <p className="text-corpo-sec text-cinza-500">
            Sem exercícios. Adiciona exercícios da biblioteca.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDialogAberto(true)}
          >
            <Plus className="h-4 w-4" />
            Adicionar exercício
          </Button>
        </div>
      ) : (
        <>
          {ORDEM_FASES.filter((fase) => grupos[fase].length > 0).map((fase) => (
            <div key={fase} className="space-y-2">
              {/* §3.5: separador/header da fase. */}
              <div className="flex items-center gap-2 pt-1">
                <h3 className="text-corpo font-semibold uppercase tracking-wide text-cinza-700">
                  {LABEL_FASE[fase]}
                </h3>
                <span className="rounded-full bg-cinza-100 px-2 py-0.5 text-legenda text-cinza-500">
                  {grupos[fase].length}
                </span>
                <span className="h-px flex-1 bg-cinza-100" aria-hidden />
              </div>

              <ol className="space-y-2">
                {grupos[fase].map((e, i) => {
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
                              onClick={() => mover(fase, i, -1)}
                              disabled={i === 0 || pending}
                              className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                              aria-label={`Subir ${e.exercicio.nome}`}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => mover(fase, i, 1)}
                              disabled={i === grupos[fase].length - 1 || pending}
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
                          <DiagramaCartao
                            diagrama={e.exercicio.diagrama}
                            nome={e.exercicio.nome}
                          />
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
                            {numeroDe[e.id]}.
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
            </div>
          ))}
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
            parteTreino: exercicioAdaptar.parteTreino ?? null,
          }}
          aberto={true}
          onFechar={() => setExercicioAdaptar(null)}
        />
      )}
    </section>
  );
}
