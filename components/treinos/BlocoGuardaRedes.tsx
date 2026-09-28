"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Clock, ChevronRight, Trash2, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removerExercicioSessao } from "@/lib/actions/treinos";
import {
  LABEL_CATEGORIA,
  LABEL_PARTE_TREINO,
  type ParteTreinoValor,
} from "@/lib/schemas/exercicio";
import { DiagramaCartao } from "@/components/campo/DiagramaCartao";
import type { CategoriaExercicioPrincipal } from "@prisma/client";

type ExercicioGR = {
  id: string;
  // Id do exercício original (link para o detalhe); null quando só há snapshot
  // histórico (§4.2.1) — nesse caso o card não é clicável.
  exercicioId: string | null;
  nome: string;
  duracaoMin: number | null;
  parteTreino: ParteTreinoValor | null;
  categoriaPrincipal: CategoriaExercicioPrincipal | null;
  diagrama: unknown;
};

type GuardaRedes = {
  id: string;
  nome: string;
  numero: number | null;
};

/**
 * §8.24.2 — "Bloco de Guarda-redes" no detalhe da sessão. Agrupa visualmente os
 * exercícios de `categoriaPrincipal=GUARDA_REDES` da sessão e lista os guarda-redes
 * presentes (PRESENTE/ATRASADO com posição GR). Derivado da categoria — sem flag
 * nova em SessaoExercicio (RN-GR-3): se não houver exercícios GR, não é renderizado.
 *
 * Os exercícios usam o mesmo cartão visual da lista principal (§4.4): miniatura de
 * campo + nome + categoria + fase + duração, clicáveis para o detalhe do exercício.
 *
 * Como os exercícios de GR estão excluídos da lista principal numerada
 * (`GestorExercicios`, RN-GR-3), a remoção tem de existir aqui — segue o mesmo
 * padrão da lista principal: toggle "Editar"/"Concluir" + botão de remover por
 * cartão, sobre a MESMA Server Action `removerExercicioSessao` (que valida clube
 * do utilizador e capacidade TREINOS_GERIR no escalão da sessão).
 */
export function BlocoGuardaRedes({
  exercicios,
  guardaRedes,
}: {
  exercicios: ExercicioGR[];
  guardaRedes: GuardaRedes[];
}) {
  const [modoEdicao, setModoEdicao] = useState(false);
  const [pending, startTransition] = useTransition();

  function remover(sessaoExercicioId: string) {
    startTransition(async () => {
      const res = await removerExercicioSessao(sessaoExercicioId);
      if (!res.sucesso) toast.error(res.erro);
    });
  }

  if (exercicios.length === 0) return null;

  return (
    <section className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-lg leading-none">
            🧤
          </span>
          <h2 className="text-corpo font-semibold text-cinza-900">
            Bloco de Guarda-redes
          </h2>
        </div>
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
              <Pencil className="h-4 w-4" />
              Editar
            </>
          )}
        </Button>
      </div>

      {/* Guarda-redes presentes na sessão */}
      {guardaRedes.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
          Sem guarda-redes presentes nesta sessão.
        </p>
      ) : (
        <div className="mt-3">
          <p className="text-legenda font-medium uppercase tracking-wide text-cinza-400">
            Guarda-redes presentes
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {guardaRedes.map((gr) => (
              <li
                key={gr.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-3 py-1 text-corpo-sec text-primary"
              >
                {gr.numero != null && (
                  <span className="text-cinza-400">#{gr.numero}</span>
                )}
                {gr.nome}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Exercícios de GR da sessão — mesmo cartão da lista principal (§4.4). */}
      <div className="mt-4">
        <p className="text-legenda font-medium uppercase tracking-wide text-cinza-400">
          Exercícios de guarda-redes
        </p>
        <ul className="mt-2 space-y-2">
          {exercicios.map((e) => {
            const meta = (
              <>
                <DiagramaCartao diagrama={e.diagrama} nome={e.nome} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-corpo font-medium text-cinza-900">
                    {e.nome}
                  </span>
                  <span className="block text-legenda text-cinza-500">
                    {e.categoriaPrincipal
                      ? LABEL_CATEGORIA[e.categoriaPrincipal]
                      : "Sem categoria"}
                    {e.duracaoMin ? ` · ${e.duracaoMin} min` : ""}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-legenda text-cinza-500">
                    {e.parteTreino && (
                      <span className="rounded bg-cinza-100 px-1.5 py-0.5 text-cinza-600">
                        {LABEL_PARTE_TREINO[e.parteTreino]}
                      </span>
                    )}
                    {e.duracaoMin != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {e.duracaoMin} min
                      </span>
                    )}
                  </span>
                </span>
              </>
            );

            return (
              <li
                key={e.id}
                className="flex items-center overflow-hidden rounded-md border border-cinza-200 bg-white shadow-card"
              >
                {e.exercicioId ? (
                  <Link
                    href={`/exercicios/${e.exercicioId}`}
                    className="flex min-w-0 flex-1 items-center gap-2 p-2.5 transition-colors hover:bg-cinza-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {meta}
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-cinza-400" />
                  </Link>
                ) : (
                  // Só snapshot histórico (§4.2.1): sem exercício original para linkar.
                  <div className="flex min-w-0 flex-1 items-center gap-2 p-2.5">
                    {meta}
                  </div>
                )}

                {modoEdicao && (
                  <button
                    type="button"
                    onClick={() => remover(e.id)}
                    disabled={pending}
                    className="mr-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-vermelho-600 hover:bg-vermelho-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                    aria-label={`Remover ${e.nome}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
