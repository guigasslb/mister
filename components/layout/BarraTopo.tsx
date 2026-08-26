"use client";

import { useTransition } from "react";
import Link from "next/link";
import { LogOut, KeyRound, Bell, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { terminarSessao } from "@/lib/actions/auth-actions";
import { SeletorEpoca } from "@/components/layout/SeletorEpoca";
import { SeletorSeccao, type SeccaoOpcao } from "@/components/layout/SeletorSeccao";
import { AlternadorTema } from "@/components/layout/AlternadorTema";
import { Logo } from "@/components/layout/Logo";
import { LogoClube } from "@/components/layout/LogoClube";
import type { Epoca } from "@prisma/client";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

interface Props {
  nomeUtilizador: string;
  /** Nome do clube — mostrado junto ao logótipo na barra de topo (§12.2). */
  nomeClube: string;
  /** URL do logótipo do clube (branding, §8.4); null → fallback às iniciais. */
  logoClube?: string | null;
  epocas: Epoca[];
  epocaAtivaId: string | null;
  /** Secções do clube (§8.1.1) — o seletor só aparece com 2+ secções. */
  seccoes?: SeccaoOpcao[];
  /** Secção ativa (cookie de UI) — contexto transversal (§8.1.1). */
  seccaoAtivaId?: string | null;
  /** Há treino ou jogo hoje (F14 / §8.16) — mostra o indicador no cabeçalho. */
  eventoHoje?: boolean;
}

export function BarraTopo({
  nomeUtilizador,
  nomeClube,
  logoClube = null,
  epocas,
  epocaAtivaId,
  seccoes = [],
  seccaoAtivaId = null,
  eventoHoje = false,
}: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <header className="topbar-glass sticky top-0 z-30 flex h-16 items-center justify-between border-b border-cinza-200/60 px-4 gap-3 print:hidden md:px-6">
      {/* Marca Mister (logótipo do produto — §12.2) + identidade do clube */}
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/dashboard" className="flex items-center shrink-0 transition-transform hover:scale-[1.02]">
          {/* "auto": ícone invertido (laranja) + texto adaptável ao tema (topbar-glass
              é claro em light mode e escuro em dark mode). */}
          <Logo size={20} variant="auto" />
        </Link>

        {/* Logótipo do clube (§12.2) + nome — dá vida à barra e reforça a
            identidade do clube ativo. Fallback às iniciais quando não há logo. */}
        <span
          aria-hidden
          className="hidden h-6 w-px shrink-0 bg-cinza-200/70 sm:block"
        />
        <div className="flex min-w-0 items-center gap-2">
          <LogoClube nome={nomeClube} logoUrl={logoClube} size={32} />
          <span className="hidden min-w-0 truncate text-corpo-sec font-semibold text-cinza-900 sm:block">
            {nomeClube}
          </span>
        </div>
      </div>

      {/* Seletor de época + ações + menu do utilizador */}
      <div className="flex items-center gap-2 ml-auto sm:gap-3">
        <SeletorSeccao seccoes={seccoes} seccaoAtivaId={seccaoAtivaId} />
        <SeletorEpoca epocas={epocas} epocaAtivaId={epocaAtivaId} />

        {/* Indicador de evento hoje (treino/jogo) → dashboard */}
        <Link
          href="/dashboard"
          aria-label={
            eventoHoje ? "Tens um evento hoje — ver dashboard" : "Ir para o dashboard"
          }
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-cinza-500 transition-colors hover:bg-cinza-100 hover:text-cinza-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden />
          {eventoHoje && (
            <span className="absolute right-2 top-2 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-vermelho-600 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-vermelho-600" />
            </span>
          )}
        </Link>

        {/* Alternador de tema claro/escuro */}
        <AlternadorTema />

        {/* Menu utilizador */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-11 w-11 items-center justify-center rounded-full text-white text-legenda font-semibold select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{ backgroundColor: "var(--cor-primaria, #F0531E)" }}
              aria-label={`Menu de ${nomeUtilizador}`}
            >
              {iniciais(nomeUtilizador)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-3 py-2">
              <p className="text-corpo font-medium text-cinza-900 truncate">
                {nomeUtilizador}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/perfil" className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-cinza-400" />
                Perfil e carreira
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/definicoes/utilizadores" className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-cinza-400" />
                Alterar password
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={pending}
              onSelect={() => {
                startTransition(() => terminarSessao());
              }}
              className="flex items-center gap-2 text-vermelho-600 focus:text-vermelho-600"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
