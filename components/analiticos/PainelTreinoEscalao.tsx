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
import Link from "next/link";
import { LABEL_CATEGORIA_PRINCIPAL } from "@/lib/schemas/subcategoria";
import { EstadoVazio } from "@/components/layout/EstadosUI";
import { SecaoAnalitico, Kpi, GrelhaMeses, type AcentoKpi } from "./Kpi";
import { pct, n1 } from "./Cartao";

const GraficoBarrasH = dynamic(
  () => import("@/components/graficos/GraficoBarrasH").then((m) => ({ default: m.GraficoBarrasH })),
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

  // Evolução mensal (nº de sessões) — grelha mensal de contagens reais, tal como
  // o `PainelEscalao` (secção "Treinos"). Sem normalização: o valor é a contagem.
  const sessoesPorMes = dados.evolucaoMensal.map((m) => ({
    mes: m.mes,
    valor: m.totalSessoes,
  }));

  // Assiduidade mensal — grelha de percentagens (destaque abaixo do alvo), tal
  // como o `PainelEscalao` (secção "Assiduidade mensal").
  const presencaPorMes = dados.presencasMensais.map((p) => ({
    mes: p.mes,
    valor: pct(p.taxa),
    destaque: p.taxa < 0.6,
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

      {/* Composição dos treinos — tipos de sessão + categorias lado a lado, na
          mesma densidade 2-up do PainelEscalao ("Rankings ofensivos"). */}
      {(barrasTipoSessao.length > 0 || barrasCategoria.length > 0) && (
        <SecaoAnalitico titulo="Composição dos treinos">
          <div className="grid gap-6 sm:grid-cols-2">
            {barrasTipoSessao.length > 0 && (
              <CartaoGrafico>
                <GraficoBarrasH
                  dados={barrasTipoSessao}
                  titulo="Por tipo de sessão"
                  unidade="sessões"
                  maxRows={barrasTipoSessao.length}
                />
              </CartaoGrafico>
            )}
            {barrasCategoria.length > 0 && (
              <CartaoGrafico>
                <GraficoBarrasH
                  dados={barrasCategoria}
                  titulo="Por categoria"
                  unidade="utilizações"
                  maxRows={barrasCategoria.length}
                />
              </CartaoGrafico>
            )}
          </div>
        </SecaoAnalitico>
      )}

      {/* Top 10 exercícios mais usados — largura total (até 10 linhas). */}
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
          <p className="mt-2 text-right text-legenda">
            <Link
              href="/exercicios/analiticos"
              className="text-cinza-400 hover:text-primary underline-offset-2 hover:underline"
            >
              Ver ranking completo →
            </Link>
          </p>
        </SecaoAnalitico>
      )}

      {/* Sessões por mês — grelha mensal de contagens reais (estilo dossier). */}
      {sessoesPorMes.length > 0 && (
        <SecaoAnalitico titulo="Sessões por mês">
          <GrelhaMeses meses={sessoesPorMes} />
        </SecaoAnalitico>
      )}

      {/* Assiduidade mensal — grelha de percentagens (destaque abaixo do alvo). */}
      {presencaPorMes.length >= 2 && (
        <SecaoAnalitico titulo="Assiduidade mensal">
          <GrelhaMeses meses={presencaPorMes} />
        </SecaoAnalitico>
      )}
    </div>
  );
}
