// Secção de treino dos analíticos do atleta (bíblia §8.15 / §10.1).
// Presentacional: recebe o AnaliticoTreinoAtleta já calculado (Server Action) e
// desenha os KPIs de assiduidade/RPE e os gráficos de presença mensal, evolução
// de RPE por sessão e exposição a exercícios por categoria.
//
// Nota de arquitectura: é renderizado dentro do `PainelAtleta` (Client Component,
// que faz o fetch da Server Action). Como usa `next/dynamic({ ssr:false })` para
// os gráficos — o mesmo padrão de `PainelAtleta`/`PainelEscalao` — é marcado
// "use client". A lógica de dados vive na Server Action; aqui é 100% apresentação.
"use client";

import dynamic from "next/dynamic";
import type { CategoriaExercicioPrincipal } from "@prisma/client";
import type { AnaliticoTreinoAtleta } from "@/lib/actions/analise";
import { EstadoVazio } from "@/components/layout/EstadosUI";
import { Kpi, type AcentoKpi } from "./Kpi";
import { pct } from "./Cartao";

const GraficoBarrasV = dynamic(
  () => import("@/components/graficos/GraficoBarrasV").then((m) => ({ default: m.GraficoBarrasV })),
  { ssr: false },
);
const GraficoLinhas = dynamic(
  () => import("@/components/graficos/GraficoLinhas").then((m) => ({ default: m.GraficoLinhas })),
  { ssr: false },
);
const GraficoBarrasH = dynamic(
  () => import("@/components/graficos/GraficoBarrasH").then((m) => ({ default: m.GraficoBarrasH })),
  { ssr: false },
);

// Rótulos PT-PT das categorias principais de exercício (§ Grupo D).
const LABEL_CATEGORIA: Record<CategoriaExercicioPrincipal, string> = {
  ATAQUE: "Ataque",
  DEFESA: "Defesa",
  TRANSICAO: "Transição",
  BOLAS_PARADAS: "Bolas Paradas",
  FISICO: "Físico",
  GUARDA_REDES: "Guarda-redes",
  OUTRO: "Outro",
};

/** Acento semântico para uma taxa 0–1 (verde ≥85%, âmbar ≥60%, senão vermelho). */
function acentoTaxa(taxa: number): AcentoKpi {
  if (taxa >= 0.85) return "verde";
  if (taxa >= 0.6) return "ambar";
  return "vermelho";
}

/** Data abreviada dia/mês para o eixo X do gráfico de RPE. */
function dataAbrev(d: Date): string {
  return new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

export function PainelTreinoAtleta({ dados }: { dados: AnaliticoTreinoAtleta }) {
  const semDados =
    dados.totalSessoesNormal === 0 &&
    dados.exerciciosPorCategoria.length === 0 &&
    dados.presencasMensais.length === 0;

  if (semDados) {
    return <EstadoVazio titulo="Sem dados de treino para este atleta." />;
  }

  const pontosPresenca = dados.presencasMensais.map((p) => ({
    label: p.mes,
    valor: p.taxa,
  }));
  const pontosRpe = dados.rpeEvolucao.map((r) => ({
    label: dataAbrev(r.dataHora),
    valor1: r.rpe,
  }));
  const pontosCategoria = dados.exerciciosPorCategoria.map((e) => ({
    label: LABEL_CATEGORIA[e.categoria],
    valor: e.totalExercicios,
  }));

  const temPresencaMensal = pontosPresenca.length >= 2;
  const temRpe = pontosRpe.length >= 3;
  const temCategorias = pontosCategoria.length > 0;

  return (
    <div className="space-y-6">
      {/* KPIs — assiduidade e carga percebida */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Kpi
          valor={pct(dados.taxaPresenca)}
          label="presença"
          nota={`${dados.totalPresencas}/${dados.totalSessoesNormal} sessões`}
          acento={acentoTaxa(dados.taxaPresenca)}
        />
        <Kpi
          valor={dados.rpeMedia !== null ? dados.rpeMedia.toFixed(1) : "—"}
          label="RPE médio"
          nota={`de ${dados.totalSessoesComRpe} sessões`}
          acento="primary"
        />
      </div>

      {/* Presença mensal — mesmo padrão da presença mensal já existente */}
      {temPresencaMensal && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <GraficoBarrasV dados={pontosPresenca} titulo="Taxa de presença por mês" />
        </div>
      )}

      {/* RPE por sessão — só com ≥3 registos para uma tendência legível */}
      {temRpe && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <GraficoLinhas
            pontos={pontosRpe}
            serie1="RPE (1–10)"
            titulo="RPE por sessão"
          />
        </div>
      )}

      {/* Exercícios por categoria — exposição a cada área de treino */}
      {temCategorias && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <GraficoBarrasH
            dados={pontosCategoria}
            titulo="Exercícios por categoria"
            unidade="exercícios"
          />
        </div>
      )}
    </div>
  );
}
