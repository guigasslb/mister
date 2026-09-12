// §8.24.5 — "Desenvolvimento do guarda-redes". Combina duas fontes existentes:
// (1) evolução técnica — média por sessão de cada métrica GR ao longo da época
// (gráfico de linhas por métrica); (2) núcleo de jogo — defesas, golos sofridos
// e defesas/jogo (já agregados no analítico). Presentacional.
"use client";

import { Hand, ShieldAlert, Target } from "lucide-react";
import dynamic from "next/dynamic";
import { formatarDataHoraLisboa } from "@/lib/utils-datas";
import type { MetricaGREvolucao } from "@/lib/actions/analise";

const GraficoLinhas = dynamic(
  () =>
    import("@/components/graficos/GraficoLinhas").then((m) => ({
      default: m.GraficoLinhas,
    })),
  { ssr: false },
);

export interface NucleoJogoGR {
  defesas: number;
  golosSofridos: number;
  /** Defesas por jogo (já formatado) ou null quando não há jogos. */
  defesasPorJogo: string | null;
}

function formatarDataCurta(data: Date): string {
  return formatarDataHoraLisboa(new Date(data), {
    day: "2-digit",
    month: "short",
  }).replace(".", "");
}

export function SeccaoDesenvolvimentoGR({
  metricasGR,
  nucleo,
}: {
  metricasGR: MetricaGREvolucao[];
  nucleo: NucleoJogoGR;
}) {
  const seriesComDados = metricasGR.filter((m) => m.evolucao.length > 0);

  return (
    <section className="space-y-4 rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Hand className="h-4 w-4 text-primary" />
        <h2 className="text-corpo font-semibold text-cinza-900">
          Desenvolvimento do guarda-redes
        </h2>
      </div>

      {/* Núcleo de jogo (§10.4 M1) */}
      <div>
        <p className="mb-2 text-legenda font-medium uppercase tracking-wide text-cinza-400">
          Núcleo de jogo
        </p>
        <div className="grid grid-cols-3 gap-3">
          <TileGR label="defesas" valor={nucleo.defesas} icon={Hand} cor="verde" />
          <TileGR
            label="defesas/jogo"
            valor={nucleo.defesasPorJogo ?? "—"}
            icon={Target}
            cor="verde"
          />
          <TileGR
            label="sofridos"
            valor={nucleo.golosSofridos}
            icon={ShieldAlert}
            cor="vermelho"
          />
        </div>
      </div>

      {/* Evolução técnica — um gráfico de linhas por métrica GR */}
      <div>
        <p className="mb-2 text-legenda font-medium uppercase tracking-wide text-cinza-400">
          Evolução técnica
        </p>
        {seriesComDados.length === 0 ? (
          <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
            Sem sessões com métricas de GR registadas.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {seriesComDados.map((serie) => (
              <div
                key={serie.nome}
                className="rounded-lg border border-cinza-100 p-3"
              >
                <GraficoLinhas
                  titulo={serie.nome}
                  serie1={serie.nome}
                  pontos={serie.evolucao.map((p) => ({
                    label: formatarDataCurta(p.data),
                    valor1: p.valor,
                  }))}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TileGR({
  label,
  valor,
  icon: Icon,
  cor,
}: {
  label: string;
  valor: string | number;
  icon: typeof Hand;
  cor: "verde" | "vermelho";
}) {
  const corTexto = cor === "verde" ? "text-verde-600" : "text-vermelho-600";
  return (
    <div className="rounded-md border border-cinza-100 bg-cinza-50 p-3">
      <div className="flex items-center gap-1.5 text-legenda uppercase tracking-wide text-cinza-500">
        <Icon className={`h-3.5 w-3.5 ${corTexto}`} />
        {label}
      </div>
      <p className={`mt-1 text-titulo-seccao font-bold ${corTexto}`}>{valor}</p>
    </div>
  );
}
