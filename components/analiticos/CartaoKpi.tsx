// KPI com ícone + cor de destaque — bloco de estatística dos painéis de
// analytics. Presentacional puro (server-safe): usado na app autenticada e na
// vista pública de relatórios. Substitui os quadrados uniformes por cartões com
// hierarquia visual (ícone colorido + valor + rótulo).

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type CorKpi = "primary" | "verde" | "ambar" | "vermelho" | "laranja" | "cinza";

const CORES: Record<CorKpi, { badge: string; icone: string }> = {
  primary: { badge: "bg-primary/10", icone: "text-primary" },
  verde: { badge: "bg-verde-600/10", icone: "text-verde-600" },
  ambar: { badge: "bg-ambar-600/10", icone: "text-ambar-600" },
  vermelho: { badge: "bg-vermelho-600/10", icone: "text-vermelho-600" },
  laranja: { badge: "bg-laranja-500/10", icone: "text-laranja-500" },
  cinza: { badge: "bg-cinza-100", icone: "text-cinza-500" },
};

export function CartaoKpi({
  valor,
  label,
  icon: Icon,
  cor = "primary",
}: {
  valor: ReactNode;
  label: string;
  icon: LucideIcon;
  cor?: CorKpi;
}) {
  const c = CORES[cor];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-cinza-200 bg-white p-4 shadow-card transition-shadow hover:shadow-md">
      <span
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${c.badge}`}
      >
        <Icon className={`h-5 w-5 ${c.icone}`} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-tight text-cinza-900">{valor}</p>
        <p className="truncate text-legenda text-cinza-500">{label}</p>
      </div>
    </div>
  );
}

/** Cor semântica para uma taxa 0–1 (verde ≥85%, âmbar ≥60%, senão vermelho). */
export function corTaxa(taxa: number): CorKpi {
  if (taxa >= 0.85) return "verde";
  if (taxa >= 0.6) return "ambar";
  return "vermelho";
}
