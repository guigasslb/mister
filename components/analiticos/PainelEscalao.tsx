// Painel de analíticos da equipa/escalão (Nível 2 — bíblia §8.15 / §10.2).
// Presentacional: recebe o AnaliticoEscalao já calculado (Server Action).
"use client";

import type { TipoSessao } from "@prisma/client";
import {
  Swords,
  Trophy,
  Equal,
  TrendingDown,
  Target,
  ShieldAlert,
  Shield,
  Users,
  CalendarCheck,
  Percent,
  Square,
} from "lucide-react";
import type { AnaliticoEscalao, CompeticaoOpcao } from "@/lib/actions/analise";
import dynamic from "next/dynamic";

const GraficoBarrasH = dynamic(
  () => import("@/components/graficos/GraficoBarrasH").then((m) => ({ default: m.GraficoBarrasH })),
  { ssr: false },
);
const GraficoBarrasV = dynamic(
  () => import("@/components/graficos/GraficoBarrasV").then((m) => ({ default: m.GraficoBarrasV })),
  { ssr: false },
);
import { FiltroCompeticao } from "./FiltroCompeticao";
import { RankingsMetricas } from "./RankingsMetricas";
import { RankingAssiduidade } from "./RankingAssiduidade";
import { CartaoKpi, corTaxa } from "./CartaoKpi";
import { pct, n1 } from "./Cartao";

const LABEL_TIPO_SESSAO: Record<TipoSessao, string> = {
  NORMAL: "Normal",
  ABERTO: "Aberto",
  CAPTACAO: "Captação",
  EVENTO: "Evento",
};

function formatarData(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

export function PainelEscalao({
  dados,
  competicoes,
  competicaoId,
}: {
  dados: AnaliticoEscalao;
  /** Competições com jogos no escalão/época; quando presentes, mostra o filtro (P2.5). */
  competicoes?: CompeticaoOpcao[];
  /** Competição atualmente selecionada (undefined = «Todas»). */
  competicaoId?: string;
}) {
  const pontosMarcadores = dados.marcadores.map((m) => ({
    label: m.nome,
    valor: m.valor,
  }));
  const pontosAssistentes = dados.assistentes.map((m) => ({
    label: m.nome,
    valor: m.valor,
  }));
  const pontosUtilizados = dados.maisUtilizados.map((u) => ({
    label: u.nome,
    valor: u.tempoJogoAcumulado,
  }));
  const pontosPresenca = dados.presencaMensal.map((p) => ({
    label: p.mes,
    valor: p.taxa,
  }));

  const tiposTreino = (Object.keys(dados.distribuicaoTipoTreino) as TipoSessao[])
    .map((t) => ({ tipo: t, n: dados.distribuicaoTipoTreino[t] }))
    .filter((x) => x.n > 0);

  // Snapshots de relatórios antigos (pré-agregação de métricas) não têm o
  // campo — o default garante zero regressão na vista pública.
  const rankingsMetricas = dados.rankingsMetricas ?? [];
  const assiduidade = dados.rankingAssiduidade ?? [];

  // Disciplina (§3.7): totais + top indisciplinados. Snapshots antigos não têm
  // os campos — os defaults garantem zero regressão na vista pública.
  const cartoes = dados.cartoes ?? { amarelos: 0, vermelhos: 0 };
  const rankingDisciplina = (dados.rankingDisciplina ?? []).slice(0, 5);
  const temDisciplina =
    cartoes.amarelos > 0 || cartoes.vermelhos > 0 || rankingDisciplina.length > 0;

  const semJogos = dados.jogos === 0;

  // Sessões executadas (§10.2): já realizadas (`data < agora`), subconjunto das
  // programadas. Snapshots antigos não têm o campo — o default (= total) garante
  // zero regressão na vista pública de relatórios.
  const sessoesExecutadas = dados.sessoesExecutadas ?? dados.sessoes;

  return (
    <div className="space-y-8">
      {/* Filtro por competição (P2.5) — só quando há competições com jogos. */}
      {competicoes && competicoes.length > 0 && (
        <FiltroCompeticao competicoes={competicoes} competicaoId={competicaoId} />
      )}

      {/* Balanço da época — KPIs de resultados */}
      <section className="space-y-3">
        <h2 className="text-titulo-seccao text-cinza-900">Balanço da época</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <CartaoKpi valor={dados.jogos} label="jogos" icon={Swords} cor="primary" />
          <CartaoKpi valor={dados.vitorias} label="vitórias" icon={Trophy} cor="verde" />
          <CartaoKpi valor={dados.empates} label="empates" icon={Equal} cor="ambar" />
          <CartaoKpi valor={dados.derrotas} label="derrotas" icon={TrendingDown} cor="vermelho" />
          <CartaoKpi valor={dados.golosMarcados} label="golos marcados" icon={Target} cor="verde" />
          <CartaoKpi valor={dados.golosSofridos} label="golos sofridos" icon={ShieldAlert} cor="vermelho" />
        </div>
      </section>

      {/* Plantel e assiduidade — KPIs */}
      <section className="space-y-3">
        <h2 className="text-titulo-seccao text-cinza-900">Plantel e médias</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <CartaoKpi valor={dados.nAtletas} label="atletas" icon={Users} cor="primary" />
          <CartaoKpi
            valor={`${sessoesExecutadas}/${dados.sessoes}`}
            label="sessões realizadas"
            icon={CalendarCheck}
            cor="primary"
          />
          <CartaoKpi
            valor={pct(dados.taxaPresencaMedia)}
            label="presença média"
            icon={Percent}
            cor={corTaxa(dados.taxaPresencaMedia)}
          />
          <CartaoKpi valor={n1(dados.golosMarcadosMedia)} label="golos M/jogo" icon={Target} cor="verde" />
          <CartaoKpi valor={n1(dados.golosSofridosMedia)} label="golos S/jogo" icon={Shield} cor="vermelho" />
        </div>
      </section>

      {/* Distribuição de tipos de treino */}
      {tiposTreino.length > 0 && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-400">
            Tipos de treino
          </p>
          <ul className="flex flex-wrap gap-2">
            {tiposTreino.map(({ tipo, n }) => (
              <li
                key={tipo}
                className="rounded-full border border-cinza-200 px-3 py-1 text-legenda text-cinza-700"
              >
                {LABEL_TIPO_SESSAO[tipo]}
                <span className="ml-1.5 font-semibold text-primary">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rankings */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          {pontosMarcadores.length === 0 ? (
            <>
              <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-400">
                Melhores marcadores
              </p>
              <p className="text-corpo-sec text-cinza-500">Sem golos registados.</p>
            </>
          ) : (
            <GraficoBarrasH
              dados={pontosMarcadores}
              titulo="Melhores marcadores"
              unidade="golos"
            />
          )}
        </div>

        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          {pontosAssistentes.length === 0 ? (
            <>
              <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-400">
                Melhores assistentes
              </p>
              <p className="text-corpo-sec text-cinza-500">
                Sem assistências registadas.
              </p>
            </>
          ) : (
            <GraficoBarrasH
              dados={pontosAssistentes}
              titulo="Melhores assistentes"
              unidade="assist."
            />
          )}
        </div>
      </div>

      {/* Jogadores mais utilizados + ranking de assiduidade */}
      <div className="grid gap-6 lg:grid-cols-2">
        {pontosUtilizados.length > 0 && (
          <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
            <GraficoBarrasH
              dados={pontosUtilizados}
              titulo="Jogadores mais utilizados"
              unidade="min"
            />
          </div>
        )}
        {assiduidade.length > 0 && <RankingAssiduidade atletas={assiduidade} />}
      </div>

      {/* Ranking por métrica configurável (§10.2) — só com métricas do clube. */}
      {rankingsMetricas.length > 0 && (
        <RankingsMetricas rankings={rankingsMetricas} />
      )}

      {/* Disciplina (§3.7) — totais de cartões + top 5 indisciplinados. */}
      {temDisciplina && (
        <section className="space-y-3">
          <h2 className="text-titulo-seccao text-cinza-900">Disciplina</h2>
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <CartaoKpi valor={cartoes.amarelos} label="amarelos" icon={Square} cor="ambar" />
            <CartaoKpi valor={cartoes.vermelhos} label="vermelhos" icon={Square} cor="vermelho" />
          </div>

          {rankingDisciplina.length > 0 && (
            <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
              <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-400">
                Mais indisciplinados
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-corpo-sec">
                  <thead>
                    <tr className="text-left text-legenda uppercase tracking-wide text-cinza-500">
                      <th className="py-2.5 pr-3 font-medium">Atleta</th>
                      <th className="px-3 py-2.5 text-right font-medium">🟨 Amarelos</th>
                      <th className="py-2.5 pl-3 text-right font-medium">🟥 Vermelhos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cinza-100">
                    {rankingDisciplina.map((a) => (
                      <tr key={a.atletaId} className="text-cinza-900">
                        <td className="py-3 pr-3 font-medium">{a.nome}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-ambar-600">
                          {a.amarelos}
                        </td>
                        <td className="py-3 pl-3 text-right tabular-nums font-semibold text-vermelho-600">
                          {a.vermelhos}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Assiduidade mensal */}
      {pontosPresenca.length >= 2 && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <GraficoBarrasV dados={pontosPresenca} titulo="Assiduidade mensal" />
        </div>
      )}

      {/* Resultados jogo a jogo */}
      <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
        <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-400">
          Resultados
        </p>
        {semJogos ? (
          <p className="text-corpo-sec text-cinza-500">Sem jogos registados.</p>
        ) : (
          <ul className="divide-y divide-cinza-100">
            {dados.resultados.map((r) => (
              <li
                key={r.jogoId}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-corpo text-cinza-900">{r.adversario}</p>
                  <p className="text-legenda text-cinza-500">{formatarData(r.data)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-corpo font-semibold text-cinza-900">
                    {r.golosMarcados ?? "—"}–{r.golosSofridos ?? "—"}
                  </span>
                  <ResultadoBadge resultado={r.resultado} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ResultadoBadge({ resultado }: { resultado: "V" | "E" | "D" | null }) {
  if (!resultado) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cinza-100 text-legenda font-bold text-cinza-400">
        –
      </span>
    );
  }
  const estilo =
    resultado === "V"
      ? "bg-verde-600/10 text-verde-600"
      : resultado === "E"
        ? "bg-ambar-600/10 text-ambar-600"
        : "bg-vermelho-600/10 text-vermelho-600";
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-legenda font-bold ${estilo}`}
    >
      {resultado}
    </span>
  );
}
