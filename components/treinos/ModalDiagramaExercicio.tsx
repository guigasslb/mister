"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { diagramaSchema } from "@/lib/schemas/exercicio";
import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  exercicio: {
    nome: string;
    // Diagrama do campo (Json do Prisma, já resolvido do snapshot no servidor).
    diagrama: unknown;
    objetivo: string | null;
    descricao: string | null;
  };
}

/**
 * Modal com o diagrama do exercício ampliado (Melhoria — ver diagrama em grande
 * a partir do plano de exercícios da sessão). Mostra o campo, objetivo e
 * descrição/montagem.
 */
export function ModalDiagramaExercicio({ aberto, onFechar, exercicio }: Props) {
  const diag = diagramaSchema.safeParse(exercicio.diagrama);
  const temDiagrama = diag.success && diag.data.elementos.length > 0;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(estado) => {
        if (!estado) onFechar();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{exercicio.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {temDiagrama && diag.success ? (
            <div className="mx-auto w-full overflow-hidden rounded-lg border border-cinza-200">
              <MiniaturaCampo diagrama={diag.data} largura={500} className="w-full" />
            </div>
          ) : (
            <div
              className="mx-auto flex aspect-[2/1] w-full items-center justify-center rounded-lg border border-dashed border-cinza-300 bg-cinza-50"
              aria-label={`${exercicio.nome} sem diagrama`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-16 w-16 text-cinza-300"
                fill="currentColor"
              >
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            </div>
          )}

          {exercicio.objetivo && (
            <div>
              <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                Objetivo
              </p>
              <p className="mt-1 text-corpo text-cinza-900">{exercicio.objetivo}</p>
            </div>
          )}

          {exercicio.descricao && (
            <div>
              <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                Descrição / montagem
              </p>
              <p className="mt-1 whitespace-pre-wrap text-corpo text-cinza-900">
                {exercicio.descricao}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
