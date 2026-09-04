// Painel de analíticos de treino do escalão (§8.15 / §10.2).
// Presentacional: recebe o AnaliticoTreinoEscalao já calculado (Server Action).
// Mesmo estilo "clean/global" do PainelEscalao — KPIs de número grande, gráficos
// SVG próprios (barras) com destaques na cor do clube (--cor-primaria). Sem
// alterações à lógica de dados. É Client Component porque os gráficos são
// carregados com next/dynamic({ ssr: false }), tal como no PainelEscalao.
"use client";

import type { TipoSessao } from "@prisma/client";
import type { AnaliticoTreinoEscalao } from "@/lib/actions/analise";
import dynamic from "next/dynamic";
import { LABEL_CATEGORIA_PRINCIPAL } from "@/lib/schemas/subcategoria";
import { EstadoVazio } from "@/components/layout/EstadosUI";
import { SecaoAnalitico, Kpi, type AcentoKpi } from "./Kpi";
import { pct, n1 } from "./Cartao";

const GraficoBarrasH = dynamic(
  () => import("@/components/graficos/GraficoBarrasH").then((m) => ({ default: m.GraficoBarrasH })),
  { ssr: false },
);
const GraficoBarrasV = dynamic(
  () => import("@/components/graficos/GraficoBarrasV").then((m) => ({ default: m.GraficoBarrasV })),
  { ssr: false },
);

const LABEL_TIPO_SESSAO: Record<TipoSessao, string> = {
  NORMAL: "Normal",
  ABERTO: "Aberto",
  CAPTACAO: "Captação",
  EVENTO: "Evento",
};

// Ordem fixa dos tipos de sessão na distribuição.
const ORDEM_TIPO_SESSAO: TipoSessao[] = ["NORMAL", "ABERTO", "CAPTACAO", "EVENTO"];

/** Acento semântico para uma taxa 0–1 (verde ≥85%, âmbar ≥60%, senão vermelho). */
function acentoTaxa(taxa: number): AcentoKpi {
  if (taxa >= 0.85) return "verde";
  if (taxa >= 0.6) return "ambar";
  return "vermelho";
}

/** Cartão que envolve um gráfico (borda subtil + fundo branco). */
function CartaoGrafico({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-cinza-200 bg-white p-5">{children}</div>
  );
}

export function PainelTreinoEscalao({ dados }: { dados: AnaliticoTreinoEscalao }) {
  // Estado vazio: nenhuma sessão programada/registada na época.
  if (dados.totalSessoes === 0) {
    return (
      <EstadoVazio
        titulo="Sem treinos registados nesta época."
        descricao="Assim que registares sessões de treino, os analíticos aparecem aqui."
      />
    );
  }

  // Distribuição por tipo de sessão — só os tipos com pelo menos uma sessão.
  const barrasTipoSessao = ORDEM_TIPO_SESSAO.map((tipo) => ({
    label: LABEL_TIPO_SESSAO[tipo],
    valor: dados.distribuicaoTipoSessao[tipo] ?? 0,
  })).filter((b) => b.valor > 0);

  // Top 10 exercícios mais usados.
  const barrasExercicios = dados.topExercicios.map((e) => ({
    label: e.nome,
    valor: e.totalUsos,
  }));

  // Distribuição por categoria principal.
  const barrasCategoria = dados.distribuicaoCategoria.map((c) => ({
    label: LABEL_CATEGORIA_PRINCIPAL[c.categoria],
    valor: c.totalUsos,
  }));

  // Evolução mensal (nº de sessões). O GraficoBarrasV escala 0–1, por isso
  // normalizamos pelo máximo e mostramos o valor real (contagem) via `format`.
  const maxSessoesMes = Math.max(...dados.evolucaoMensal.map((m) => m.totalSessoes), 1);
  const barrasEvolucao = dados.evolucaoMensal.map((m) => ({
    label: m.mes,
    valor: maxSessoesMes > 0 ? m.totalSessoes / maxSessoesMes : 0,
    format: () => String(m.totalSessoes),
  }));

  // Assiduidade mensal (taxa 0–1 — formato % por defeito no GraficoBarrasV).
  const barrasPresenca = dados.presencasMensais.map((p) => ({
    label: p.mes,
    valor: p.taxa,
  }));

  return (
    <div className="space-y-10">
      {/* Volume e presença — KPIs */}
      <SecaoAnalitico titulo="Volume de treino">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            valor={`${dados.sessoesExecutadas}/${dados.totalSessoes}`}
            label="sessões"
            nota="realizadas/prog."
            acento="primary"
          />
          <Kpi valor={n1(dados.totalHoras)} label="horas de treino" />
          <Kpi
            valor={dados.duracaoMedia === null ? "—" : Math.round(dados.duracaoMedia)}
            label="duração média"
            nota={dados.duracaoMedia === null ? undefined : "min"}
          />
          <Kpi
            valor={pct(dados.taxaPresencaMedia)}
            label="presença média"
            acento={acentoTaxa(dados.taxaPresencaMedia)}
          />
        </div>
      </SecaoAnalitico>

      {/* Distribuição por tipo de sessão */}
      {barrasTipoSessao.length > 0 && (
        <SecaoAnalitico titulo="Tipos de sessão">
          <CartaoGrafico>
            <GraficoBarrasH
              dados={barrasTipoSessao}
              titulo="Distribuição por tipo de sessão"
              unidade="sessões"
              maxRows={barrasTipoSessao.length}
            />
          </CartaoGrafico>
        </SecaoAnalitico>
      )}

      {/* Top 10 exercícios mais usados */}
      {barrasExercicios.length > 0 && (
        <SecaoAnalitico titulo="Exercícios mais usados">
          <CartaoGrafico>
            <GraficoBarrasH
              dados={barrasExercicios}
              titulo="Top 10 exercícios"
              unidade="utilizações"
              maxRows={10}
            />
          </CartaoGrafico>
        </SecaoAnalitico>
      )}

      {/* Distribuição por categoria de exercício */}
      {barrasCategoria.length > 0 && (
        <SecaoAnalitico titulo="Distribuição por categoria">
          <CartaoGrafico>
            <GraficoBarrasH
              dados={barrasCategoria}
              titulo="Utilização por categoria"
              unidade="utilizações"
              maxRows={barrasCategoria.length}
            />
          </CartaoGrafico>
        </SecaoAnalitico>
      )}

      {/* Evolução mensal (nº de sessões) e assiduidade mensal (taxa %) */}
      {(barrasEvolucao.length > 0 || barrasPresenca.length > 0) && (
        <SecaoAnalitico titulo="Evolução mensal">
          <div className="grid gap-6 lg:grid-cols-2">
            {barrasEvolucao.length > 0 && (
              <CartaoGrafico>
                <GraficoBarrasV dados={barrasEvolucao} titulo="Sessões por mês" />
              </CartaoGrafico>
            )}
            {barrasPresenca.length > 0 && (
              <CartaoGrafico>
                <GraficoBarrasV dados={barrasPresenca} titulo="Assiduidade por mês" />
              </CartaoGrafico>
            )}
          </div>
        </SecaoAnalitico>
      )}
    </div>
  );
}
