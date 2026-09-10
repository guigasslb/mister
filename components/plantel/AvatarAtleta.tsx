"use client";

import { useState } from "react";

const CORES = [
  "bg-primary",
  "bg-azul-900",
  "bg-cinza-600",
  "bg-verde-600",
  "bg-primary/50",
];

function corAvatar(nome: string): string {
  const hash = nome.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return CORES[hash % CORES.length];
}

export function iniciaisNome(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const TAMANHOS = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-2xl",
} as const;

export function AvatarAtleta({
  nome,
  tamanho = "md",
  fotoUrl,
}: {
  nome: string;
  tamanho?: keyof typeof TAMANHOS;
  fotoUrl?: string | null;
}) {
  // Guarda o URL que falhou (em vez de um simples booleano) para que, se o
  // `fotoUrl` mudar para um novo válido, a imagem volte a ser tentada.
  const [urlFalhada, setUrlFalhada] = useState<string | null>(null);

  if (fotoUrl && fotoUrl !== urlFalhada) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fotoUrl}
        alt={nome}
        onError={() => setUrlFalhada(fotoUrl)}
        className={`flex-shrink-0 rounded-full object-cover ${TAMANHOS[tamanho]}`}
      />
    );
  }
  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white select-none ${corAvatar(nome)} ${TAMANHOS[tamanho]}`}
    >
      {iniciaisNome(nome)}
    </div>
  );
}
