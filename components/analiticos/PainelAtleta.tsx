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
} from "lucide-react";
import type { AnaliticoAtleta } from "@/lib/actions/analise";
import { LABEL_POSICAO } from "@/lib/schemas/atleta";
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

export function PainelAtleta({ dados }: { dados: AnaliticoAtleta }) {
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

  const semDados =
    agregado.jogosConvocado === 0 && agregado.sessoesTotais === 0;

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
              valor={agregado.totalGolosSofridos ?? 0}
              label="sofridos"
              icon={ShieldAlert}
              cor="vermelho"
            />
          </>
        ) : (
          <>
            <CartaoKpi valor={agregado.totalGolos} label="golos" icon={Target} cor="verde" />
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
          valor={pct(agregado.taxaPresenca)}
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
          />
        </div>
      )}

      {/* Presença mensal */}
      {temPresencaMensal && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <GraficoBarrasV dados={pontosPresenca} titulo="Taxa de presença por mês" />
        </div>
      )}
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
