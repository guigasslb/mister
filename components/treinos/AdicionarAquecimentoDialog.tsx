"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adicionarExercicioSessao } from "@/lib/actions/treinos";
import { LABEL_CATEGORIA } from "@/lib/schemas/exercicio";
import {
  filtrarBibliotecaAquecimento,
  type ExercicioBibliotecaAquecimento,
} from "@/lib/treino-aquecimento";

/**
 * Seletor rápido para adicionar um exercício da biblioteca à fase de
 * **aquecimento** sem sair do modo treino (§8.8.2 ponto 3). Reutiliza o padrão
 * do `GestorExercicios` (Dialog + lista + botão "Adicionar"), simplificado para
 * a condução em campo: pesquisa por nome e adição direta à fase AQUECIMENTO.
 *
 * Persiste via a Server Action existente `adicionarExercicioSessao` (§7.3), que
 * valida a fase (`parteTreinoSessaoSchema`), garante isolamento por clube e a
 * capacidade `TREINOS_GERIR`, e revalida `/treinos/[id]` — o novo exercício
 * volta pelas props do modo treino, na ordem canónica das fases (aquecimento
 * primeiro). O diálogo fica aberto após adicionar para permitir juntar vários.
 */
export function AdicionarAquecimentoDialog({
  sessaoId,
  biblioteca,
  aberto,
  onFechar,
}: {
  sessaoId: string;
  biblioteca: ExercicioBibliotecaAquecimento[];
  aberto: boolean;
  onFechar: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [termo, setTermo] = useState("");

  const lista = filtrarBibliotecaAquecimento(biblioteca, termo);

  function adicionar(exercicioId: string) {
    startTransition(async () => {
      const res = await adicionarExercicioSessao(sessaoId, exercicioId, "AQUECIMENTO");
      if (res.sucesso) {
        toast.success("Exercício adicionado ao aquecimento");
      } else {
        toast.error(res.erro);
      }
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o) onFechar();
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-cinza-200 px-6 pb-4 pt-6">
          <DialogTitle>Adicionar ao aquecimento</DialogTitle>
        </DialogHeader>

        {/* Pesquisa fixa — não scrolla com a lista. */}
        <div className="px-6 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cinza-400" />
            <Input
              type="search"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Procurar exercício…"
              className="pl-9"
              aria-label="Procurar exercício na biblioteca"
            />
          </div>
        </div>

        {/* Lista scrollable. */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 [scrollbar-gutter:stable]">
          {biblioteca.length === 0 ? (
            <p className="text-corpo-sec text-cinza-600">
              A biblioteca está vazia. Cria exercícios primeiro.
            </p>
          ) : lista.length === 0 ? (
            <p className="text-corpo-sec text-cinza-600">
              Nenhum exercício corresponde à pesquisa.
            </p>
          ) : (
            <ul className="space-y-2">
              {lista.map((ex) => (
                <li
                  key={ex.id}
                  className="flex items-center gap-2 rounded-md border border-cinza-200 p-2.5"
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => adicionar(ex.id)}
                    className="flex-shrink-0 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
