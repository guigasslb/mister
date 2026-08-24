"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Dumbbell,
  Trophy,
  Settings,
  Users2,
  MessageSquare,
  BarChart3,
  CalendarRange,
  MoreHorizontal,
  Rocket,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Chave de persistência da preferência manual de colapso da sidebar.
const CHAVE_COLAPSO = "mister:sidebar-colapsada";
// Acima deste limite consideramos "desktop" → sidebar expandida por defeito.
// Abaixo (tablet, incl. iPad em paisagem a 1024/1194px) → colapsada por defeito.
const MQ_DESKTOP = "(min-width: 1280px)";

const ITEM_COMECAR = { href: "/vitoria-rapida", label: "Começar", icon: Rocket };
// Agenda agregada de todos os escalões — visível a todos os treinadores; o
// scoping pelos escalões legíveis é feito em obterAgendaClube (§6.4, F P2.2).
const ITEM_AGENDA = { href: "/agenda", label: "Agenda", icon: CalendarRange };

// Ordem pensada para a bottom-nav (móvel): os 4 primeiros são fixos. Jogos vem
// antes de Exercícios porque, no dia-a-dia do treinador, é mais crítico.
const ITENS_BASE = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/plantel", label: "Plantel", icon: Users },
  { href: "/treinos", label: "Treinos", icon: CalendarCheck },
  { href: "/jogos", label: "Jogos", icon: Trophy },
  { href: "/exercicios", label: "Exercícios", icon: Dumbbell },
  { href: "/analiticos", label: "Analytics", icon: BarChart3 },
  { href: "/comunicacoes", label: "Comunicações", icon: MessageSquare },
  { href: "/reunioes", label: "Reuniões", icon: Users2 },
  { href: "/definicoes", label: "Definições", icon: Settings },
];

/**
 * @param mostrarComecar Mostra o atalho "Começar" (vitória rápida) — só quando
 * o plantel está vazio (F10 / §8.1).
 * @param mostrarAgenda Mostra o item "Agenda" (vista agregada de todos os
 * escalões) — disponível a todos os treinadores; obterAgendaClube faz o
 * scoping pelos escalões legíveis de cada membro (P2.2 / §8.x, §6.4).
 */
export function Navegacao({
  mostrarComecar = false,
  mostrarAgenda = false,
}: {
  mostrarComecar?: boolean;
  mostrarAgenda?: boolean;
}) {
  const pathname = usePathname();
  const [maisAberto, setMaisAberto] = useState(false);

  // Estado de colapso da sidebar (só tablet/PC; a bottom-nav móvel não é afetada).
  //  - `override === null`  → segue o comportamento responsivo por defeito
  //    (colapsada em tablet md–xl, expandida em desktop ≥xl) via classes CSS.
  //    É este o estado renderizado no servidor e na 1.ª pintura → sem flash nem
  //    divergência de hidratação.
  //  - `override === true/false` → preferência manual do utilizador (persistida),
  //    que vence em todos os tamanhos ≥ md.
  const [override, setOverride] = useState<boolean | null>(null);
  const [ehDesktop, setEhDesktop] = useState(false);

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CHAVE_COLAPSO);
      if (guardado === "1") setOverride(true);
      else if (guardado === "0") setOverride(false);
    } catch {
      /* localStorage indisponível — mantém o default responsivo */
    }
    const mq = window.matchMedia(MQ_DESKTOP);
    setEhDesktop(mq.matches);
    const aoMudar = (e: MediaQueryListEvent) => setEhDesktop(e.matches);
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, []);

  // Estado efetivo (resolvido) — usado só para o ícone do botão de alternância.
  const colapsadaEfetiva = override === null ? !ehDesktop : override;

  const alternarColapso = () => {
    const nova = !colapsadaEfetiva;
    setOverride(nova);
    try {
      window.localStorage.setItem(CHAVE_COLAPSO, nova ? "1" : "0");
    } catch {
      /* ignora falhas de persistência */
    }
  };

  // Classes derivadas do estado de colapso. Quando não há preferência manual
  // (override === null) usamos utilitários responsivos: colapsada em md–xl,
  // expandida a partir de xl.
  const larguraNav =
    override === null ? "w-16 xl:w-[224px]" : override ? "w-16" : "w-[224px]";
  const labelCls =
    override === null ? "hidden xl:inline" : override ? "hidden" : "inline";
  const itemAlinhamento =
    override === null
      ? "justify-center xl:justify-start"
      : override
        ? "justify-center"
        : "justify-start";
  const cabecalhoCls =
    override === null ? "hidden xl:block" : override ? "hidden" : "block";
  const botaoAlinhamento =
    override === null
      ? "justify-center xl:justify-end"
      : override
        ? "justify-center"
        : "justify-end";

  // Base + "Agenda" (Admin/DT): a Agenda entra a seguir a Jogos, junto às vistas
  // transversais do clube (Analíticos, Comunicações…).
  const ITENS_COM_AGENDA = mostrarAgenda
    ? [
        ...ITENS_BASE.slice(0, 5), // Início, Plantel, Treinos, Jogos, Exercícios
        ITEM_AGENDA,
        ...ITENS_BASE.slice(5),
      ]
    : ITENS_BASE;

  // "Começar" entra logo a seguir ao Início, para ficar visível na bottom-nav.
  const ITENS = mostrarComecar
    ? [ITENS_COM_AGENDA[0], ITEM_COMECAR, ...ITENS_COM_AGENDA.slice(1)]
    : ITENS_COM_AGENDA;
  const ITENS_BOTTOM = ITENS.slice(0, 4);
  const ITENS_MAIS = ITENS.slice(4);

  const ativo = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* ── Sidebar (tablet / PC) ──
          Colapsada (só ícones) por defeito em tablet (md–xl); expandida em
          desktop (≥xl). O utilizador pode alternar e a preferência é guardada. */}
      <nav
        className={cn(
          "hidden md:flex flex-shrink-0 flex-col border-r border-cinza-200/70 bg-white/60 transition-[width] duration-200 ease-out print:hidden",
          larguraNav,
        )}
      >
        <div className={cn("flex items-center px-3 pt-4 pb-2", botaoAlinhamento)}>
          <p
            className={cn(
              "flex-1 px-2 text-legenda font-semibold uppercase tracking-wider text-cinza-400",
              cabecalhoCls,
            )}
          >
            Menu
          </p>
          <button
            type="button"
            onClick={alternarColapso}
            aria-label={colapsadaEfetiva ? "Expandir menu" : "Minimizar menu"}
            aria-pressed={colapsadaEfetiva}
            title={colapsadaEfetiva ? "Expandir menu" : "Minimizar menu"}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-cinza-400 transition-colors hover:bg-cinza-100 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {colapsadaEfetiva ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        </div>
        <ul className="flex flex-col gap-1 px-3">
          {ITENS.map(({ href, label, icon: Icon }) => {
            const on = ativo(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={on ? "page" : undefined}
                  aria-label={label}
                  title={label}
                  className={cn("nav-item", itemAlinhamento, on && "nav-item-active")}
                >
                  <Icon
                    className={cn("h-5 w-5 flex-shrink-0", !on && "text-cinza-400")}
                    style={on ? { color: "var(--cor-primaria, #1A2FD4)" } : undefined}
                  />
                  <span className={labelCls}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Bottom nav (móvel) ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-cinza-200 bg-white md:hidden print:hidden">
        {/* Menu "Mais" expandido */}
        {maisAberto && (
          <>
            {/* overlay para fechar ao clicar fora */}
            <div
              className="fixed inset-0 z-30"
              onClick={() => setMaisAberto(false)}
            />
            <div className="absolute bottom-full left-0 right-0 z-40 border-t border-cinza-200 bg-white shadow-md">
              {ITENS_MAIS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMaisAberto(false)}
                  className={cn(
                    "flex min-h-[44px] items-center gap-3 px-6 py-2 text-corpo font-medium",
                    ativo(href)
                      ? "bg-primary/10 text-primary"
                      : "text-cinza-600 active:bg-primary/5",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="flex h-16 items-stretch">
          {ITENS_BOTTOM.map(({ href, label, icon: Icon }) => {
            const on = ativo(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className="flex flex-1 flex-col items-center justify-center gap-1 text-legenda font-medium text-cinza-400"
                style={on ? { color: "var(--cor-primaria, #1A2FD4)" } : undefined}
              >
                <span
                  className="flex h-7 w-12 items-center justify-center rounded-full transition-colors"
                  style={on ? { backgroundColor: "color-mix(in srgb, var(--cor-primaria, #1A2FD4) 14%, white)" } : undefined}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span>{label}</span>
              </Link>
            );
          })}
          {(() => {
            const on = maisAberto || ITENS_MAIS.some(({ href }) => ativo(href));
            return (
              <button
                onClick={() => setMaisAberto((v) => !v)}
                className="flex flex-1 flex-col items-center justify-center gap-1 text-legenda font-medium text-cinza-400"
                style={on ? { color: "var(--cor-primaria, #1A2FD4)" } : undefined}
                aria-label="Mais opções"
              >
                <span
                  className="flex h-7 w-12 items-center justify-center rounded-full transition-colors"
                  style={on ? { backgroundColor: "color-mix(in srgb, var(--cor-primaria, #1A2FD4) 14%, white)" } : undefined}
                >
                  <MoreHorizontal className="h-5 w-5" />
                </span>
                <span>Mais</span>
              </button>
            );
          })()}
        </div>
      </nav>
    </>
  );
}
