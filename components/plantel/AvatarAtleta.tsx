"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  ampliar = false,
}: {
  nome: string;
  tamanho?: keyof typeof TAMANHOS;
  fotoUrl?: string | null;
  /**
   * Quando `true` e existe uma foto válida, clicar na foto abre um modal
   * (lightbox) com a imagem ampliada. Sem efeito quando o atleta não tem foto.
   */
  ampliar?: boolean;
}) {
  // Guarda o URL que falhou (em vez de um simples booleano) para que, se o
  // `fotoUrl` mudar para um novo válido, a imagem volte a ser tentada.
  const [urlFalhada, setUrlFalhada] = useState<string | null>(null);

  const temFoto = Boolean(fotoUrl && fotoUrl !== urlFalhada);

  // Sem foto válida: mostra as iniciais (nunca ampliável).
  if (!temFoto || !fotoUrl) {
    return (
      <div
        className={`flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white select-none ${corAvatar(nome)} ${TAMANHOS[tamanho]}`}
      >
        {iniciaisNome(nome)}
      </div>
    );
  }

  const imagem = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fotoUrl}
      alt={nome}
      onError={() => setUrlFalhada(fotoUrl)}
      className={`flex-shrink-0 rounded-full object-cover ${ampliar ? "cursor-pointer" : ""} ${TAMANHOS[tamanho]}`}
    />
  );

  if (!ampliar) {
    return imagem;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Ampliar foto de ${nome}`}
          className="flex-shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {imagem}
        </button>
      </DialogTrigger>
      <DialogContent className="flex w-auto max-w-[90vw] flex-col items-center gap-3 p-4 pt-11">
        <DialogTitle className="sr-only">Foto de {nome}</DialogTitle>
        <DialogDescription className="sr-only">
          Fotografia ampliada de {nome}
        </DialogDescription>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fotoUrl}
          alt={nome}
          className="max-h-[70vh] w-auto max-w-sm rounded-lg object-cover"
        />
        <p className="text-center text-corpo font-semibold text-cinza-900">
          {nome}
        </p>
      </DialogContent>
    </Dialog>
  );
}
