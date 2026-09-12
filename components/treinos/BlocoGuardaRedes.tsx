import { Clock } from "lucide-react";
import { LABEL_PARTE_TREINO, type ParteTreinoValor } from "@/lib/schemas/exercicio";

type ExercicioGR = {
  id: string;
  nome: string;
  duracaoMin: number | null;
  parteTreino: ParteTreinoValor | null;
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
 */
export function BlocoGuardaRedes({
  exercicios,
  guardaRedes,
}: {
  exercicios: ExercicioGR[];
  guardaRedes: GuardaRedes[];
}) {
  if (exercicios.length === 0) return null;

  return (
    <section className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg leading-none">
          🧤
        </span>
        <h2 className="text-corpo font-semibold text-cinza-900">
          Bloco de Guarda-redes
        </h2>
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

      {/* Exercícios de GR da sessão */}
      <div className="mt-4">
        <p className="text-legenda font-medium uppercase tracking-wide text-cinza-400">
          Exercícios de guarda-redes
        </p>
        <ul className="mt-2 divide-y divide-cinza-100">
          {exercicios.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <span className="min-w-0 text-corpo text-cinza-900">{e.nome}</span>
              <span className="flex flex-shrink-0 items-center gap-3 text-legenda text-cinza-500">
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
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
