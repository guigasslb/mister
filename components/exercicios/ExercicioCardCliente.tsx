"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Star, MoreVertical, Pencil, Copy } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { duplicarExercicio } from "@/lib/actions/exercicios";
import { useFavoritos } from "./FavoritosContext";

/**
 * Envolve o cartão de exercício (renderizado no servidor) para adicionar as
 * ações do cliente: toggle de favorito (⭐, UX-P3-06b) e menu de ações com
 * "Editar" e "Duplicar" (UX-P3-06). Também aplica o filtro "só favoritos":
 * quando ativo, os cartões não favoritos deixam de ser renderizados.
 */
export function ExercicioCardCliente({
  exercicioId,
  podeEditar,
  podeDuplicar,
  children,
}: {
  exercicioId: string;
  podeEditar: boolean;
  podeDuplicar: boolean;
  children: React.ReactNode;
}) {
  const { isFavorito, toggleFavorito, soFavoritos, pronto } = useFavoritos();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const favorito = isFavorito(exercicioId);

  // Só filtramos depois de o localStorage estar lido — evita esconder tudo
  // durante o primeiro render no cliente (flash de lista vazia).
  if (pronto && soFavoritos && !favorito) return null;

  function duplicar() {
    startTransition(async () => {
      const res = await duplicarExercicio(exercicioId);
      if (res.sucesso) {
        toast.success("Exercício duplicado para a tua biblioteca pessoal");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  const temMenu = podeEditar || podeDuplicar;

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        <button
          type="button"
          onClick={() => toggleFavorito(exercicioId)}
          aria-label={favorito ? "Remover dos favoritos" : "Marcar como favorito"}
          aria-pressed={favorito}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-cinza-500 shadow-card backdrop-blur-sm transition-colors hover:text-ambar-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Star
            className={`h-5 w-5 ${favorito ? "fill-ambar-500 text-ambar-600" : ""}`}
          />
        </button>

        {temMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Ações do exercício"
                disabled={pending}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-cinza-600 shadow-card backdrop-blur-sm transition-colors hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar && (
                <DropdownMenuItem asChild>
                  <Link href={`/exercicios/${exercicioId}/editar`}>
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Link>
                </DropdownMenuItem>
              )}
              {podeDuplicar && (
                <DropdownMenuItem
                  disabled={pending}
                  onSelect={(e) => {
                    // Impede o fecho imediato antes de arrancar a transição.
                    e.preventDefault();
                    duplicar();
                  }}
                >
                  <Copy className="h-4 w-4" />
                  {pending ? "A duplicar…" : "Duplicar"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {children}
    </div>
  );
}
