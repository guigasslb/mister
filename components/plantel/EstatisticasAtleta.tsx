"use client";

import dynamic from "next/dynamic";
import type { EstatisticasAgregadas } from "@/lib/actions/atletas";
import type { JogoDadosAtleta, PresencaMensal } from "@/lib/actions/analise";

const GraficoLinhas = dynamic(
  () => import("@/components/graficos/GraficoLinhas").then((m) => ({ default: m.GraficoLinhas })),
  { ssr: false },
);
const GraficoBarrasV = dynamic(
  () => import("@/components/graficos/GraficoBarrasV").then((m) => ({ default: m.GraficoBarrasV })),
  { ssr: false },
);

function Cartao({ valor, label }: { valor: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-cinza-200 bg-white p-4 shadow-card">
      <span className="text-titulo-pagina font-bold text-primary">{valor}</span>
      <span className="text-legenda text-cinza-500">{label}</span>
    </div>
  );
}

export function EstatisticasAtleta({
  stats,
  eGR,
  evolucao,
  presencas,
  mostrarPresencaMensal = true,
  mostrarGolosAssistencias = true,
}: {
  stats: EstatisticasAgregadas;
  eGR: boolean;
  evolucao?: JogoDadosAtleta[];
  presencas?: PresencaMensal[];
  /**
   * Controla a renderização do gráfico «Taxa de presença por mês». No perfil do
   * atleta, quando os analíticos avançados (PainelAtleta) estão visíveis, esse
   * painel já apresenta o mesmo gráfico — a base deve escondê-lo para não
   * duplicar. Sem permissão de relatórios o painel avançado não aparece, pelo
   * que a base mantém o gráfico (default true).
   */
  mostrarPresencaMensal?: boolean;
  /**
   * Controla a renderização do gráfico «Golos e assistências por jogo» (ou
   * «Defesas por jogo» para guarda-redes). Tal como a presença mensal, o painel
   * avançado (PainelAtleta) já apresenta este gráfico — a base deve escondê-lo
   * quando o painel está visível para não duplicar. Sem permissão de relatórios
   * o painel avançado não aparece, pelo que a base mantém o gráfico (default
   * true).
   */
  mostrarGolosAssistencias?: boolean;
}) {
  const semDados = stats.jogosConvocado === 0 && stats.sessoesTotais === 0;

  if (semDados) {
    return (
      <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
        Sem jogos ou sessões registados nesta época.
      </p>
    );
  }

  const taxa = `${Math.round(stats.taxaPresenca * 100)}%`;

  // Prepare line chart data: only games where the player was utilized
  const pontosJogos = (evolucao ?? [])
    .filter((j) => j.utilizado)
    .map((j) =>
      eGR
        ? { label: j.adversario, valor1: j.defesas ?? 0 }
        : { label: j.adversario, valor1: j.golos, valor2: j.assistencias },
    );

  // Prepare monthly presence bar data
  const pontosPresenca = (presencas ?? []).map((p) => ({
    label: p.mes,
    valor: p.taxa,
  }));

  const temEvolucaoJogos = mostrarGolosAssistencias && pontosJogos.length >= 2;
  const temPresencaMensal = mostrarPresencaMensal && pontosPresenca.length >= 2;

  return (
    <div className="space-y-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {eGR ? (
          <>
            <Cartao valor={stats.totalDefesas ?? 0} label="defesas" />
            <Cartao valor={stats.totalGolosSofridos ?? 0} label="sofridos" />
          </>
        ) : (
          <>
            <Cartao valor={stats.totalGolos} label="golos" />
            <Cartao valor={stats.totalAssistencias} label="assist." />
          </>
        )}
        <Cartao valor={stats.jogosUtilizados} label="jogos" />
        <Cartao valor={stats.titularidades} label="titular" />
        <Cartao valor={taxa} label="presenças" />
      </div>

      {/* Evolution chart: golos + assistências por jogo */}
      {temEvolucaoJogos && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <GraficoLinhas
            pontos={pontosJogos}
            serie1={eGR ? "Defesas" : "Golos"}
            serie2={eGR ? undefined : "Assistências"}
            titulo={eGR ? "Defesas por jogo" : "Golos e assistências por jogo"}
          />
        </div>
      )}

      {/* Monthly presence bar chart */}
      {temPresencaMensal && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <GraficoBarrasV
            dados={pontosPresenca}
            titulo="Taxa de presença por mês"
          />
        </div>
      )}
    </div>
  );
}
