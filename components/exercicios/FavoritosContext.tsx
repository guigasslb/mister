"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// Favoritos de exercício (UX-P3-06b). O schema Prisma não tem campo `favorito`
// na entidade Exercicio, pelo que o estado vive no navegador (localStorage),
// por utilizador/dispositivo.
// TODO: migrar para DB quando o schema suportar favoritos.
const CHAVE = "exercicios-favoritos";

type FavoritosCtx = {
  isFavorito: (id: string) => boolean;
  toggleFavorito: (id: string) => void;
  soFavoritos: boolean;
  setSoFavoritos: (v: boolean) => void;
  /** Nº total de favoritos guardados (independente da lista atual). */
  total: number;
  /** `true` depois de o localStorage ter sido lido (evita flashes de UI). */
  pronto: boolean;
};

const Ctx = createContext<FavoritosCtx | null>(null);

function lerFavoritos(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAVE);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function FavoritosProvider({ children }: { children: React.ReactNode }) {
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set());
  const [soFavoritos, setSoFavoritos] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setFavoritos(new Set(lerFavoritos()));
    setPronto(true);
  }, []);

  const persistir = useCallback((set: Set<string>) => {
    try {
      window.localStorage.setItem(CHAVE, JSON.stringify([...set]));
    } catch {
      // Ignora erros de quota/armazenamento indisponível.
    }
  }, []);

  const toggleFavorito = useCallback(
    (id: string) => {
      setFavoritos((atual) => {
        const proximo = new Set(atual);
        if (proximo.has(id)) proximo.delete(id);
        else proximo.add(id);
        persistir(proximo);
        return proximo;
      });
    },
    [persistir],
  );

  const isFavorito = useCallback((id: string) => favoritos.has(id), [favoritos]);

  return (
    <Ctx.Provider
      value={{
        isFavorito,
        toggleFavorito,
        soFavoritos,
        setSoFavoritos,
        total: favoritos.size,
        pronto,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useFavoritos(): FavoritosCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFavoritos deve ser usado dentro de <FavoritosProvider>.");
  return ctx;
}
