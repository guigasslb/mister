// Gráfico do ranking de uso da biblioteca de exercícios (§8.15 / §10.2).
// Fronteira de cliente: o gráfico SVG (`--cor-primaria`) é carregado com
// `next/dynamic({ ssr: false })`, seguindo o padrão dos restantes painéis.
"use client";

import dynamic from "next/dynamic";

const GraficoBarrasH = dynamic(
  () => import("@/components/graficos/GraficoBarrasH").then((m) => ({ default: m.GraficoBarrasH })),
  { ssr: false },
);

export function RankingUsoExerciciosGrafico({
  dados,
}: {
  dados: { label: string; valor: number }[];
}) {
  return (
    <GraficoBarrasH
      dados={dados}
      titulo="Exercícios mais usados"
      unidade="utilizações"
      maxRows={dados.length}
    />
  );
}
