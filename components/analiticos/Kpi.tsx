// Blocos presentacionais partilhados pelos painéis de analíticos redesenhados.
// Estilo "clean/global" (ref. Dossier do Treinador): números grandes, rótulos
// discretos, bordas subtis e sem sombras pesadas. Os destaques usam a cor do
// clube (via `text-primary`/`bg-primary`, alimentados por `--cor-primaria`).
// Presentacional puro (server-safe): app autenticada e vista pública.

import type { ReactNode } from "react";

export type AcentoKpi = "primary" | "verde" | "ambar" | "vermelho" | "neutro";

const ACENTO_TEXTO: Record<AcentoKpi, string> = {
  primary: "text-primary",
  verde: "text-verde-600",
  ambar: "text-ambar-600",
  vermelho: "text-vermelho-600",
  neutro: "text-cinza-900",
};

/** Título de secção discreto (uppercase + tracking) — estilo dossier. */
export function SecaoAnalitico({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  /** Conteúdo opcional alinhado à direita do título (ex.: filtro). */
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-legenda font-semibold uppercase tracking-[0.12em] text-cinza-400">
          {titulo}
        </h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** KPI grande: número em destaque + rótulo por baixo (+ nota opcional). */
export function Kpi({
  valor,
  label,
  nota,
  acento = "neutro",
}: {
  valor: string | number;
  label: string;
  /** Linha secundária discreta (ex.: percentagem, "M/jogo", um link). */
  nota?: ReactNode;
  acento?: AcentoKpi;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-cinza-200 bg-white px-3 py-5 text-center">
      <span
        className={`text-3xl font-bold leading-none tabular-nums ${ACENTO_TEXTO[acento]}`}
      >
        {valor}
      </span>
      <span className="mt-2 text-legenda font-medium uppercase tracking-wide text-cinza-500">
        {label}
      </span>
      {nota && (
        <span className="mt-1 text-legenda tabular-nums text-cinza-400">{nota}</span>
      )}
    </div>
  );
}

/** Grelha mensal (estilo dossier): um bloco compacto por mês. */
export function GrelhaMeses({
  meses,
}: {
  meses: { mes: string; valor: string | number; destaque?: boolean }[];
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-9 xl:grid-cols-12">
      {meses.map((m) => (
        <div
          key={m.mes}
          className="rounded-md border border-cinza-200 bg-white px-2 py-3 text-center"
        >
          <span className="block text-legenda font-medium uppercase tracking-wide text-cinza-400">
            {m.mes}
          </span>
          <span
            className={`mt-1 block text-lg font-bold tabular-nums ${
              m.destaque ? "text-ambar-600" : "text-cinza-900"
            }`}
          >
            {m.valor}
          </span>
        </div>
      ))}
    </div>
  );
}
