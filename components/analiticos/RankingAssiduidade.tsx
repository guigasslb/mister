// Ranking de assiduidade da equipa (todos os atletas por taxa de presença).
// Presentacional puro: recebe o ranking já calculado em obterAnaliticoEscalao.
// Barra de progresso horizontal com cor semântica (verde/âmbar/vermelho).

import type { RankingAssiduidade as RankingAssiduidadeItem } from "@/lib/actions/analise";
import { pct } from "./Cartao";

function coresTaxa(taxa: number): { barra: string; texto: string } {
  if (taxa >= 0.85) return { barra: "bg-verde-600", texto: "text-verde-600" };
  if (taxa >= 0.6) return { barra: "bg-ambar-600", texto: "text-ambar-600" };
  return { barra: "bg-vermelho-600", texto: "text-vermelho-600" };
}

export function RankingAssiduidade({
  atletas,
}: {
  atletas: RankingAssiduidadeItem[];
}) {
  return (
    <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
      <p className="mb-4 text-legenda font-medium uppercase tracking-wide text-cinza-400">
        Ranking de assiduidade
      </p>
      <ol className="space-y-3.5">
        {atletas.map((a, i) => {
          const c = coresTaxa(a.taxa);
          const largura = `${Math.round(a.taxa * 100)}%`;
          return (
            <li key={a.atletaId} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-legenda font-bold ${
                  i === 0
                    ? "bg-laranja-500/15 text-laranja-600"
                    : "bg-cinza-100 text-cinza-600"
                }`}
                aria-hidden
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-corpo text-cinza-900">{a.nome}</span>
                  <span className={`flex-shrink-0 text-corpo-sec font-bold ${c.texto}`}>
                    {pct(a.taxa)}
                  </span>
                </div>
                <div
                  className="mt-1 h-2 w-full overflow-hidden rounded-full bg-cinza-100"
                  role="progressbar"
                  aria-valuenow={Math.round(a.taxa * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Taxa de presença de ${a.nome}`}
                >
                  <div
                    className={`h-full rounded-full ${c.barra}`}
                    style={{ width: largura }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
