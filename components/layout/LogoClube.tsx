"use client";

import { useState } from "react";
import Image from "next/image";

/** Iniciais do clube (1–2 letras) para o fallback sem logótipo. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * Logótipo do clube (§12.2) — imagem quando existe `logoUrl`, com **fallback
 * para as iniciais** do clube num disco na cor do clube (`--cor-primaria`).
 *
 * O URL do logótipo é inserido pelo utilizador (branding, §8.4) e pode apontar
 * para qualquer host https. Usa-se `unoptimized` para não depender da allowlist
 * de `remotePatterns` do next/image (o proxy de otimização recusaria hosts fora
 * da lista); o `onError` degrada graciosamente para as iniciais se a imagem
 * falhar. A CSP restringe `img-src` a `https:`.
 */
export function LogoClube({
  nome,
  logoUrl,
  size = 32,
  className,
}: {
  nome: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  const mostrarImagem = Boolean(logoUrl) && !falhou;

  if (mostrarImagem) {
    return (
      <Image
        src={logoUrl as string}
        alt={`Logótipo de ${nome}`}
        width={size}
        height={size}
        unoptimized
        onError={() => setFalhou(true)}
        className={`shrink-0 rounded-md object-contain ${className ?? ""}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-label={`Logótipo de ${nome}`}
      role="img"
      className={`flex shrink-0 select-none items-center justify-center rounded-md font-semibold text-white ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        backgroundColor: "var(--cor-primaria, #F0531E)",
      }}
    >
      {iniciais(nome)}
    </span>
  );
}
