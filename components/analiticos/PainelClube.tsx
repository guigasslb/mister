// Painel de analíticos do clube (Nível 3 — transversal — bíblia §8.15 / §10.3).
// Presentacional: recebe o AnaliticoClubeEpoca já calculado (Server Action).
// `linkEscaloes` liga cada escalão ao seu analítico (só na app autenticada).
// P2.4: filtro de modalidade client-side (Todos | Futsal | Futebol) sobre a
// lista de escalões já carregada — sem nova Server Action. Os KPIs globais
// recalculam-se a partir do subconjunto filtrado para o painel ficar coerente.
// Redesign 2026-08 (§12): layout "clean/global" (ref. Dossier do Treinador) —
// KPIs de número grande, secções discretas e tabela limpa com destaques na cor
// do clube. Sem alterações à lógica de dados.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Modalidade } from "@prisma/client";
import type {
  AnaliticoClubeEpoca,
  BalancoEpocaClube,
  EscalaoResumoClube,
} from "@/lib/actions/analise";
import { pct } from "./Cartao";
import { Kpi, SecaoAnalitico } from "./Kpi";

type FiltroModalidade = "TODAS" | Modalidade;

const LABEL_MODALIDADE: Record<Modalidade, string> = {
  FUTSAL: "Futsal",
  FUTEBOL: "Futebol",
};

/** Percentagem inteira de `parte` sobre `total` (ex.: 6/10 → "60%"). */
function pctDe(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)}%` : "—";
}

/** Recalcula os totais a partir de um subconjunto de escalões (mirror do servidor). */
function calcularTotais(escaloes: EscalaoResumoClube[]) {
  const totais = escaloes.reduce(
    (acc, r) => {
      acc.nAtletas += r.nAtletas;
      acc.jogos += r.jogos;
      acc.vitorias += r.vitorias;
      acc.empates += r.empates;
      acc.derrotas += r.derrotas;
      acc.golosMarcados += r.golosMarcados;
      acc.golosSofridos += r.golosSofridos;
      acc.sessoes += r.sessoes;
      // Snapshots antigos não têm `sessoesExecutadas` — o default (= total) evita
      // NaN e garante zero regressão na vista pública de relatórios.
      acc.sessoesExecutadas += r.sessoesExecutadas ?? r.sessoes;
      return acc;
    },
    {
      nAtletas: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0,
      golosMarcados: 0, golosSofridos: 0, sessoes: 0, sessoesExecutadas: 0,
    },
  );
  // Reconstrói presenças/slots por escalão (taxa = presenças / slots no servidor)
  // para uma média global ponderada coerente com a do painel completo.
  let slotsGlobais = 0;
  let presencasGlobais = 0;
  for (const r of escaloes) {
    // Slots = atletas × sessões EXECUTADAS (fechadas), em simetria com o servidor
    // (obterAnaliticoClubeEpoca). O fallback (`?? r.sessoes`) cobre snapshots
    // antigos sem `sessoesExecutadas`, evitando NaN na vista pública.
    const slots = r.nAtletas * (r.sessoesExecutadas ?? r.sessoes);
    slotsGlobais += slots;
    presencasGlobais += Math.round(r.taxaPresencaMedia * slots);
  }
  return {
    ...totais,
    taxaPresencaMediaGlobal: slotsGlobais > 0 ? presencasGlobais / slotsGlobais : 0,
  };
}

/** Extrai o balanço (V/E/D + golos) de um objeto de totais já calculado. */
function balancoDe(t: {
  vitorias: number;
  empates: number;
  derrotas: number;
  jogos: number;
  golosMarcados: number;
  golosSofridos: number;
}): BalancoEpocaClube {
  return {
    vitorias: t.vitorias,
    empates: t.empates,
    derrotas: t.derrotas,
    jogos: t.jogos,
    golosMarcados: t.golosMarcados,
    golosSofridos: t.golosSofridos,
  };
}

export function PainelClube({
  dados,
  linkEscaloes = false,
}: {
  dados: AnaliticoClubeEpoca;
  linkEscaloes?: boolean;
}) {
  const [filtro, setFiltro] = useState<FiltroModalidade>("TODAS");

  // Modalidades presentes (não-nulas). Só há filtro quando há mistura (≥2).
  const modalidadesPresentes = useMemo(() => {
    const set = new Set<Modalidade>();
    for (const e of dados.escaloes) if (e.modalidade) set.add(e.modalidade);
    return [...set];
  }, [dados.escaloes]);
  const mostrarFiltro = modalidadesPresentes.length >= 2;

  const escaloes = useMemo(
    () =>
      mostrarFiltro && filtro !== "TODAS"
        ? dados.escaloes.filter((e) => e.modalidade === filtro)
        : dados.escaloes,
    [dados.escaloes, filtro, mostrarFiltro],
  );

  // Com filtro ativo os KPIs refletem o subconjunto; sem filtro usa os totais
  // já calculados no servidor (evita divergência por reconstrução).
  const totais =
    mostrarFiltro && filtro !== "TODAS" ? calcularTotais(escaloes) : dados.totais;

  // Sessões executadas do clube (§10.2). Fallback ao total para snapshots antigos.
  const sessoesExecutadasTotais = totais.sessoesExecutadas ?? totais.sessoes;

  // Balanço da época (P2-06): com filtro ativo deriva do subconjunto; sem
  // filtro usa o balanço do servidor (fallback ao totais em snapshots antigos
  // que ainda não têm o campo `balanco`).
  const balanco =
    mostrarFiltro && filtro !== "TODAS"
      ? balancoDe(totais)
      : dados.balanco ?? balancoDe(dados.totais);

  const opcoes: { valor: FiltroModalidade; label: string }[] = [
    { valor: "TODAS", label: "Todos" },
    ...modalidadesPresentes.map((m) => ({ valor: m, label: LABEL_MODALIDADE[m] })),
  ];

  const filtroModalidade = mostrarFiltro ? (
    <div
      className="inline-flex rounded-lg border border-cinza-200 bg-white p-1 print:hidden"
      role="group"
      aria-label="Filtrar escalões por modalidade"
    >
      {opcoes.map((o) => {
        const ativo = filtro === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => setFiltro(o.valor)}
            aria-pressed={ativo}
            className={`min-h-[44px] rounded-md px-4 text-corpo-sec font-medium transition-colors ${
              ativo
                ? "bg-primary text-white"
                : "text-cinza-600 hover:bg-cinza-100"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="space-y-10">
      {/* Geral — visão global do clube na época */}
      <SecaoAnalitico titulo="Geral" acao={filtroModalidade}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi valor={escaloes.length} label="escalões" acento="primary" />
          <Kpi valor={totais.nAtletas} label="atletas" />
          <Kpi valor={totais.jogos} label="jogos" />
          <Kpi
            valor={`${sessoesExecutadasTotais}/${totais.sessoes}`}
            label="sessões"
            nota="realizadas/prog."
          />
          <Kpi valor={totais.golosMarcados} label="golos marcados" acento="verde" />
          <Kpi
            valor={pct(totais.taxaPresencaMediaGlobal)}
            label="presença méd."
            acento="primary"
          />
        </div>
      </SecaoAnalitico>

      {/* Resultados da época — balanço agregado de todos os escalões (P2-06) */}
      <SecaoAnalitico titulo="Resultados da época">
        <div className="grid grid-cols-3 gap-3">
          <Kpi
            valor={balanco.vitorias}
            label="vitórias"
            acento="verde"
            nota={pctDe(balanco.vitorias, balanco.jogos)}
          />
          <Kpi
            valor={balanco.empates}
            label="empates"
            acento="ambar"
            nota={pctDe(balanco.empates, balanco.jogos)}
          />
          <Kpi
            valor={balanco.derrotas}
            label="derrotas"
            acento="vermelho"
            nota={pctDe(balanco.derrotas, balanco.jogos)}
          />
        </div>
        <p className="text-center text-corpo-sec tabular-nums text-cinza-500">
          {balanco.jogos} jogos · {balanco.golosMarcados} golos marcados /{" "}
          {balanco.golosSofridos} sofridos
        </p>
      </SecaoAnalitico>

      {/* Comparação entre escalões — tabela limpa */}
      <SecaoAnalitico titulo="Escalões">
        <div className="overflow-x-auto rounded-lg border border-cinza-200 bg-white">
          <table className="w-full min-w-[640px] text-corpo-sec">
            <thead>
              <tr className="border-b border-cinza-200 text-left text-legenda uppercase tracking-wide text-cinza-500">
                <th className="px-5 py-3 font-medium">Escalão</th>
                <th className="px-3 py-3 text-right font-medium">Atletas</th>
                <th className="px-3 py-3 text-right font-medium">Jogos</th>
                <th className="px-3 py-3 text-center font-medium">V-E-D</th>
                <th className="px-3 py-3 text-right font-medium">Golos M/S</th>
                <th className="px-3 py-3 text-right font-medium">Sessões</th>
                <th className="px-3 py-3 text-right font-medium">Realizadas</th>
                <th className="px-5 py-3 text-right font-medium">Presença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cinza-100">
              {escaloes.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-8 text-center text-corpo-sec text-cinza-500"
                  >
                    Sem escalões nesta modalidade.
                  </td>
                </tr>
              ) : (
                escaloes.map((e) => (
                  <tr
                    key={e.escalaoId}
                    className="text-cinza-900 transition-colors hover:bg-cinza-50"
                  >
                    <td className="px-5 py-3 font-medium">
                      {linkEscaloes ? (
                        <Link
                          href={`/escaloes/${e.escalaoId}/analiticos`}
                          className="inline-flex min-h-[44px] items-center text-primary hover:underline"
                        >
                          {e.nome}
                        </Link>
                      ) : (
                        e.nome
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{e.nAtletas}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{e.jogos}</td>
                    <td className="px-3 py-3 text-center tabular-nums text-cinza-600">
                      {e.vitorias}-{e.empates}-{e.derrotas}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-cinza-600">
                      {e.golosMarcados}/{e.golosSofridos}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{e.sessoes}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-cinza-600">
                      {e.sessoesExecutadas ?? e.sessoes}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-primary">
                      {pct(e.taxaPresencaMedia)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SecaoAnalitico>
    </div>
  );
}
