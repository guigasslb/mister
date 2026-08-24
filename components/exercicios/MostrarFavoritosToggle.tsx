"use client";

import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFavoritos } from "./FavoritosContext";

/** Alterna o filtro "só favoritos" sobre a lista de exercícios (UX-P3-06b). */
export function MostrarFavoritosToggle() {
  const { soFavoritos, setSoFavoritos, total, pronto } = useFavoritos();

  return (
    <Button
      type="button"
      variant={soFavoritos ? "default" : "outline"}
      onClick={() => setSoFavoritos(!soFavoritos)}
      className="min-h-[44px]"
      aria-pressed={soFavoritos}
    >
      <Star className={`h-4 w-4 ${soFavoritos ? "fill-current" : ""}`} />
      {soFavoritos ? "A mostrar favoritos" : "Mostrar favoritos"}
      {pronto && total > 0 ? (
        <span className="text-legenda opacity-80">({total})</span>
      ) : null}
    </Button>
  );
}

/**
 * Mensagem apresentada quando o filtro "só favoritos" está ativo mas o
 * utilizador ainda não marcou nenhum exercício como favorito.
 */
export function FavoritosVazio() {
  const { soFavoritos, total, pronto } = useFavoritos();
  if (!pronto || !soFavoritos || total > 0) return null;

  return (
    <p className="text-corpo-sec text-cinza-600">
      Ainda não marcaste exercícios como favoritos. Toca na estrela de um exercício
      para o adicionares.
    </p>
  );
}
