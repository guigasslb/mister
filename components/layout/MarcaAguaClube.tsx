"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Marca de água do clube (logótipo) no fundo da área de conteúdo (§12.2).
 *
 * O logótipo é um URL https arbitrário inserido pelo utilizador (branding,
 * §8.4) — validado apenas como http(s) em `brandingSchema`. Por isso usa-se
 * `unoptimized`: o otimizador do next/image só aceita hosts da allowlist
 * `remotePatterns` (next.config.js) e recusaria os restantes com HTTP 400,
 * deixando um quadrado de imagem partida no fundo da página. O `onError`
 * remove a marca de água quando a imagem falha, em vez de mostrar esse
 * quadrado — a identidade visível do clube (com fallback às iniciais) é
 * garantida pelo <LogoClube> na barra de topo. Alinha o comportamento com o
 * <LogoClube>. A CSP restringe `img-src` a `https:`/`data:`.
 */
export function MarcaAguaClube({ logoUrl }: { logoUrl: string }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return null;

  return (
    <Image
      src={logoUrl}
      alt=""
      aria-hidden={true}
      fill
      sizes="100vw"
      unoptimized
      onError={() => setFalhou(true)}
      className="club-watermark"
    />
  );
}
