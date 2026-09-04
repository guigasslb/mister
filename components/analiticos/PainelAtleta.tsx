// Painel de analíticos do atleta (Nível 1 — bíblia §8.15 / §10.1).
// Presentacional: recebe o AnaliticoAtleta já calculado (Server Action) e
// desenha os tiles, a comparação com a equipa, a caderneta e os gráficos.
"use client";

import {
  Hand,
  ShieldAlert,
  Target,
  Handshake,
  Swords,
  Star,
  Percent,
  Clock,
  Crosshair,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  obterResumoAtletaParaComparacao,
  obterAnaliticoTreinoAtleta,
  type AnaliticoAtleta,
  type AnaliticoTreinoAtleta,
  type EpocaResumoAtleta,
} from "@/lib/actions/analise";
import type { EstatisticasAgregadas } from "@/lib/estatisticas";
import { LABEL_POSICAO } from "@/lib/schemas/atleta";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SecaoAnalitico } from "./Kpi";
import { PainelTreinoAtleta } from "./PainelTreinoAtleta";
import { EstadoVazio } from "@/components/layout/EstadosUI";
import dynamic from "next/dynamic";

const GraficoLinhas = dynamic(
  () => import("@/components/graficos/GraficoLinhas").then((m) => ({ default: m.GraficoLinhas })),
  { ssr: false },
);
const GraficoBarrasV = dynamic(
  () => import("@/components/graficos/GraficoBarrasV").then((m) => ({ default: m.GraficoBarrasV })),
  { ssr: false },
);
import { CartaoKpi, corTaxa } from "./CartaoKpi";
import { pct, n1 } from "./Cartao";

export function PainelAtleta({
  dados,
  atletasEscalao,
  evolucaoEpocas,
}: {
  dados: AnaliticoAtleta;
  /** Colegas do mesmo escalão/época para comparação directa (M4). Opcional. */
  atletasEscalao?: { id: string; nome: string }[];
  /** Resumo do atleta por época para a evolução multi-época (M5). Opcional. */
  evolucaoEpocas?: EpocaResumoAtleta[];
}) {
  const {
    atleta,
    agregado,
    caderneta,
    comparacaoEquipa,
    evolucaoJogos,
    presencasMensais,
    escalaoContexto,
    // Snapshots de relatórios antigos (pré-agregação de métricas) não têm o
    // campo — o default garante zero regressão na vista pública.
    metricas = [],
    // Cartões acumulados (disciplina — §3.7); default para snapshots antigos.
    cartoes = { amarelos: 0, vermelhos: 0 },
  } = dados;
  const eGR = atleta.eGR;

  // M4 — Comparação directa com um colega do mesmo escalão/época. Só é possível
  // dentro do contexto de um escalão (precisa do escalaoId para bater números).
  const escalaoIdComparacao = escalaoContexto?.id ?? null;
  const [atletaComparacaoId, setAtletaComparacaoId] = useState<string | null>(
    null,
  );
  const [dadosComparacao, setDadosComparacao] = useState<{
    nome: string;
    eGR: boolean;
    agregado: EstatisticasAgregadas;
  } | null>(null);
  const [loadingComparacao, setLoadingComparacao] = useState(false);

  // Secção «Treino» (§8.15 / §10.1). O painel do atleta é um Client Component;
  // o analítico de treino é obtido via Server Action no cliente (mesmo padrão da
  // comparação directa acima). Filtra pelo escalão de contexto e época atual.
  const atletaId = atleta.id;
  const escalaoTreinoId = escalaoContexto?.id;
  const epocaTreinoId = dados.epoca.id;
  const [treino, setTreino] = useState<AnaliticoTreinoAtleta | null>(null);
  const [treinoLoading, setTreinoLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    setTreinoLoading(true);
    obterAnaliticoTreinoAtleta(atletaId, escalaoTreinoId, epocaTreinoId).then(
      (res) => {
        if (!ativo) return;
        setTreino(res.sucesso ? res.dados : null);
        setTreinoLoading(false);
      },
    );
    return () => {
      ativo = false;
    };
  }, [atletaId, escalaoTreinoId, epocaTreinoId]);

  async function selecionarComparacao(outroId: string) {
    setAtletaComparacaoId(outroId);
    if (!escalaoIdComparacao) return;
    setLoadingComparacao(true);
    const res = await obterResumoAtletaParaComparacao(
      outroId,
      escalaoIdComparacao,
      dados.epoca.id,
    );
    setDadosComparacao(res.sucesso ? res.dados : null);
    setLoadingComparacao(false);
  }

  function limparComparacao() {
    setAtletaComparacaoId(null);
    setDadosComparacao(null);
  }

  const podeComparar =
    !!escalaoIdComparacao && !!atletasEscalao && atletasEscalao.length > 0;

  const semDados =
    agregado.jogosConvocado === 0 && agregado.sessoesTotais === 0;

  // M1 — Rácios de eficácia ofensiva (cálculo puro sobre o agregado já recebido).
  const golosPorJogo =
    agregado.jogosUtilizados > 0
      ? (agregado.totalGolos / agregado.jogosUtilizados).toFixed(2)
      : null;
  const golosPorConvocatoria =
    agregado.jogosConvocado > 0
      ? (agregado.totalGolos / agregado.jogosConvocado).toFixed(2)
      : null;
  const defesasPorJogo =
    eGR && agregado.jogosUtilizados > 0
      ? ((agregado.totalDefesas ?? 0) / agregado.jogosUtilizados).toFixed(2)
      : null;

  // M3 — Tendência de desempenho (forma recente vs. média da época, em golos).
  const jogosUsados = evolucaoJogos.filter((j) => j.utilizado);
  const mediaEpoca =
    jogosUsados.length > 0
      ? jogosUsados.reduce((s, j) => s + (j.golos ?? 0), 0) / jogosUsados.length
      : 0;
  const ultimos5 = jogosUsados.slice(-5);
  const mediaRecente =
    ultimos5.length >= 3 // mínimo 3 jogos para mostrar tendência
      ? ultimos5.reduce((s, j) => s + (j.golos ?? 0), 0) / ultimos5.length
      : null;
  const tendencia: "up" | "flat" | "down" | null =
    mediaRecente !== null
      ? mediaRecente > mediaEpoca + 0.1
        ? "up"
        : mediaRecente < mediaEpoca - 0.1
          ? "down"
          : "flat"
      : null;
  // Tendência baseada em golos: só faz sentido para jogadores de campo.
  const mostrarTendencia = !eGR && tendencia !== null;
  const TREND = {
    up: { icon: TrendingUp, cor: "verde" as const },
    flat: { icon: Minus, cor: "cinza" as const },
    down: { icon: TrendingDown, cor: "vermelho" as const },
  };

  const pontosJogos = evolucaoJogos
    .filter((j) => j.utilizado)
    .map((j) =>
      eGR
        ? { label: j.adversario, valor1: j.defesas ?? 0 }
        : { label: j.adversario, valor1: j.golos, valor2: j.assistencias },
    );
  const pontosPresenca = presencasMensais.map((p) => ({
    label: p.mes,
    valor: p.taxa,
  }));

  const temEvolucaoJogos = pontosJogos.length >= 2;
  const temPresencaMensal = pontosPresenca.length >= 2;

  const contexto = [
    atleta.posicoes.map((p) => LABEL_POSICAO[p]).join(", ") || null,
    escalaoContexto?.nome ?? "Todos os escalões",
  ]
    .filter((v): v is string => !!v)
    .join(" · ");

  if (semDados) {
    return (
      <div className="space-y-3">
        {contexto && <p className="text-corpo-sec text-cinza-500">{contexto}</p>}
        <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
          Sem jogos ou sessões registados nesta época.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {contexto && <p className="text-corpo-sec text-cinza-500">{contexto}</p>}

      {/* Tiles de estatística */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {eGR ? (
          <>
            <CartaoKpi valor={agregado.totalDefesas ?? 0} label="defesas" icon={Hand} cor="verde" />
            <CartaoKpi
              valor={defesasPorJogo ?? "—"}
              label="defesas/jogo"
              icon={Target}
              cor="verde"
            />
            <CartaoKpi
              valor={agregado.totalGolosSofridos ?? 0}
              label="sofridos"
              icon={ShieldAlert}
              cor="vermelho"
            />
          </>
        ) : (
          <>
            <CartaoKpi valor={agregado.totalGolos} label="golos" icon={Target} cor="verde" />
            {mostrarTendencia && tendencia && (
              <CartaoKpi
                valor={`${mediaRecente!.toFixed(1)}/jogo`}
                label="forma (últ. 5)"
                icon={TREND[tendencia].icon}
                cor={TREND[tendencia].cor}
              />
            )}
            <CartaoKpi
              valor={golosPorJogo ?? "—"}
              label="golos/jogo"
              icon={Target}
              cor="primary"
            />
            <CartaoKpi
              valor={golosPorConvocatoria ?? "—"}
              label="golos/conv."
              icon={Crosshair}
              cor="primary"
            />
            <CartaoKpi
              valor={agregado.totalAssistencias}
              label="assist."
              icon={Handshake}
              cor="primary"
            />
          </>
        )}
        <CartaoKpi valor={agregado.jogosUtilizados} label="jogos" icon={Swords} cor="primary" />
        <CartaoKpi valor={agregado.titularidades} label="titular" icon={Star} cor="ambar" />
        <CartaoKpi
          valor={
            <>
              {pct(agregado.taxaPresenca)}{" "}
              <span className="text-base font-semibold text-cinza-400">
                ({agregado.presencas}/{agregado.sessoesTotais})
              </span>
            </>
          }
          label="presenças"
          icon={Percent}
          cor={corTaxa(agregado.taxaPresenca)}
        />
        <CartaoKpi valor={agregado.tempoJogoAcumulado} label="min" icon={Clock} cor="cinza" />
      </div>

      {/* Disciplina — só se houver cartões (§3.7) */}
      {(cartoes.amarelos > 0 || cartoes.vermelhos > 0) && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-corpo-sec text-cinza-600">
          {cartoes.amarelos > 0 && (
            <span>🟨 {cartoes.amarelos} {cartoes.amarelos === 1 ? "amarelo" : "amarelos"}</span>
          )}
          {cartoes.vermelhos > 0 && (
            <span>🟥 {cartoes.vermelhos} {cartoes.vermelhos === 1 ? "vermelho" : "vermelhos"}</span>
          )}
        </p>
      )}

      {/* Comparação directa com um colega de equipa (M4 — §10.1) */}
      {podeComparar && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-legenda font-medium uppercase tracking-wide text-cinza-400">
              Comparação directa
            </p>
            <div className="flex items-center gap-3">
              <Select
                value={atletaComparacaoId ?? undefined}
                onValueChange={selecionarComparacao}
                disabled={loadingComparacao}
              >
                <SelectTrigger className="w-56" aria-label="Comparar com atleta">
                  <SelectValue placeholder="Comparar com..." />
                </SelectTrigger>
                <SelectContent>
                  {atletasEscalao!.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dadosComparacao && (
                <button
                  type="button"
                  onClick={limparComparacao}
                  className="text-corpo-sec text-cinza-500 underline-offset-2 hover:text-cinza-900 hover:underline"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {loadingComparacao ? (
            <p className="text-corpo-sec text-cinza-500">
              A carregar comparação…
            </p>
          ) : dadosComparacao ? (
            <ComparacaoDirecta
              atletaA={{ nome: atleta.nome, agregado }}
              atletaB={{
                nome: dadosComparacao.nome,
                agregado: dadosComparacao.agregado,
              }}
            />
          ) : (
            <p className="text-corpo-sec text-cinza-500">
              Seleciona um colega de equipa para comparar lado a lado.
            </p>
          )}
        </div>
      )}

      {/* Comparação com a média da equipa */}
      {comparacaoEquipa && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-400">
            Comparação com a média da equipa
          </p>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Comparacao
              label={eGR ? "Golos sofridos" : "Golos"}
              atleta={eGR ? agregado.totalGolosSofridos ?? 0 : agregado.totalGolos}
              equipa={comparacaoEquipa.golosMediaEquipa}
            />
            <Comparacao
              label="Presenças"
              atleta={agregado.taxaPresenca}
              equipa={comparacaoEquipa.taxaPresencaMediaEquipa}
              percentagem
            />
            <Comparacao
              label="Tempo de jogo"
              atleta={agregado.tempoJogoAcumulado}
              equipa={comparacaoEquipa.tempoJogoMedioEquipa}
              unidade="min"
            />
          </dl>
        </div>
      )}

      {/* Caderneta */}
      <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
        <p className="mb-1 text-legenda font-medium uppercase tracking-wide text-cinza-400">
          Caderneta
        </p>
        <p className="text-corpo text-cinza-900">
          <span className="font-semibold text-primary">{caderneta.desbloqueadas}</span>{" "}
          de {caderneta.total} habilidades desbloqueadas
          {caderneta.emProgresso > 0 && (
            <span className="text-cinza-500"> · {caderneta.emProgresso} em progresso</span>
          )}
          .
        </p>
      </div>

      {/* Métricas personalizadas (§8.14 / §10.1) — configuráveis pelo clube. */}
      <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
        <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-400">
          Métricas personalizadas
        </p>
        {metricas.length === 0 ? (
          <p className="text-corpo-sec text-cinza-500">
            Nenhuma métrica personalizada registada.
          </p>
        ) : (
          <ul className="divide-y divide-cinza-100">
            {metricas.map((m) => (
              <li
                key={m.nome}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="min-w-0 truncate text-corpo text-cinza-900">
                  {m.nome}
                </span>
                <div className="flex items-baseline gap-3">
                  <span className="text-titulo-seccao font-bold text-primary">
                    {n1(m.total)}
                  </span>
                  <span className="text-legenda text-cinza-500">
                    média {n1(m.media)}/jogo
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Evolução por jogo */}
      {temEvolucaoJogos && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <GraficoLinhas
            pontos={pontosJogos}
            serie1={eGR ? "Defesas" : "Golos"}
            serie2={eGR ? undefined : "Assistências"}
            titulo={eGR ? "Defesas por jogo" : "Golos e assistências por jogo"}
            mediaReferencia={eGR ? undefined : mediaEpoca}
          />
        </div>
      )}

      {/* Presença mensal */}
      {temPresencaMensal && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <GraficoBarrasV dados={pontosPresenca} titulo="Taxa de presença por mês" />
        </div>
      )}

      {/* Evolução por época (M5 — §10.1). Só com histórico (≥ 2 épocas). */}
      {evolucaoEpocas && evolucaoEpocas.length >= 2 && (
        <SecaoAnalitico titulo="Evolução por época">
          <TabelaEvolucaoAtleta
            epocas={evolucaoEpocas}
            epocaAtualId={dados.epoca.id}
          />
        </SecaoAnalitico>
      )}

      {/* Treino (§8.15 / §10.1) — assiduidade, RPE e exposição a exercícios. */}
      <div className="border-t border-cinza-200 pt-6">
        <SecaoAnalitico titulo="Treino">
          {treinoLoading ? (
            <p className="text-corpo-sec text-cinza-500">
              A carregar dados de treino…
            </p>
          ) : treino ? (
            <PainelTreinoAtleta dados={treino} />
          ) : (
            <EstadoVazio titulo="Sem dados de treino para este atleta." />
          )}
        </SecaoAnalitico>
      </div>
    </div>
  );
}

function Comparacao({
  label,
  atleta,
  equipa,
  percentagem = false,
  unidade,
}: {
  label: string;
  atleta: number;
  equipa: number;
  percentagem?: boolean;
  unidade?: string;
}) {
  const fmt = (v: number) =>
    percentagem ? pct(v) : unidade ? `${n1(v)} ${unidade}` : n1(v);
  return (
    <div className="rounded-md border border-cinza-100 bg-cinza-50 p-3">
      <dt className="text-legenda uppercase tracking-wide text-cinza-500">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-2">
        <span className="text-titulo-seccao font-bold text-cinza-900">{fmt(atleta)}</span>
        <span className="text-corpo-sec text-cinza-500">
          média {fmt(equipa)}
        </span>
      </dd>
    </div>
  );
}

// M4 — Vista lado-a-lado de dois atletas (§10.1). Métricas ofensivas comuns a
// todas as posições (o GR aparece com os seus números de campo, tipicamente 0).
function ComparacaoDirecta({
  atletaA,
  atletaB,
}: {
  atletaA: { nome: string; agregado: EstatisticasAgregadas };
  atletaB: { nome: string; agregado: EstatisticasAgregadas };
}) {
  const golosJogo = (ag: EstatisticasAgregadas) =>
    ag.jogosUtilizados > 0
      ? (ag.totalGolos / ag.jogosUtilizados).toFixed(2)
      : "—";
  const linhas: { label: string; a: string | number; b: string | number }[] = [
    { label: "Golos", a: atletaA.agregado.totalGolos, b: atletaB.agregado.totalGolos },
    { label: "Jogos", a: atletaA.agregado.jogosUtilizados, b: atletaB.agregado.jogosUtilizados },
    {
      label: "Presenças",
      a: pct(atletaA.agregado.taxaPresenca),
      b: pct(atletaB.agregado.taxaPresenca),
    },
    { label: "Golos/jogo", a: golosJogo(atletaA.agregado), b: golosJogo(atletaB.agregado) },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-corpo-sec">
        <thead>
          <tr className="border-b border-cinza-200 text-left text-legenda uppercase tracking-wide text-cinza-500">
            <th className="py-2 pr-3 font-medium">Métrica</th>
            <th className="px-3 py-2 text-right font-medium text-primary">{atletaA.nome}</th>
            <th className="py-2 pl-3 text-right font-medium">{atletaB.nome}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cinza-100">
          {linhas.map((l) => (
            <tr key={l.label} className="text-cinza-900">
              <td className="py-2.5 pr-3">{l.label}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-primary">
                {l.a}
              </td>
              <td className="py-2.5 pl-3 text-right tabular-nums">{l.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// M5 — Tabela de evolução do atleta ao longo das épocas (§10.1). Uma linha por
// época (mais antigas primeiro, ordenadas na origem). Época atual destacada.
function TabelaEvolucaoAtleta({
  epocas,
  epocaAtualId,
}: {
  epocas: EpocaResumoAtleta[];
  epocaAtualId: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cinza-200 bg-white">
      <table className="w-full min-w-[560px] text-corpo-sec">
        <thead>
          <tr className="border-b border-cinza-200 text-left text-legenda uppercase tracking-wide text-cinza-500">
            <th className="px-5 py-3 font-medium">Época</th>
            <th className="px-3 py-3 font-medium">Escalão</th>
            <th className="px-3 py-3 text-right font-medium">Golos</th>
            <th className="px-3 py-3 text-right font-medium">Jogos</th>
            <th className="px-3 py-3 text-right font-medium">Presenças</th>
            <th className="px-5 py-3 text-right font-medium">Habilidades</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cinza-100">
          {epocas.map((e) => {
            const ativa = e.epocaId === epocaAtualId;
            return (
              <tr
                key={e.epocaId}
                className={
                  ativa
                    ? "bg-primary/5 text-cinza-900"
                    : "text-cinza-900 transition-colors hover:bg-cinza-50"
                }
              >
                <td
                  className={`px-5 py-3 ${
                    ativa ? "font-bold text-primary" : "font-medium"
                  }`}
                >
                  {e.epocaNome}
                  {ativa && (
                    <span className="ml-2 text-legenda font-medium uppercase tracking-wide text-primary">
                      Atual
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">{e.escalaoNome ?? "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums">{e.totalGolos}</td>
                <td className="px-3 py-3 text-right tabular-nums">{e.jogosUtilizados}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {pct(e.taxaPresenca)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {e.habilidades.desbloqueadas}/{e.habilidades.total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
