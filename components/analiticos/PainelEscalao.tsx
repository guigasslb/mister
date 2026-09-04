// Painel de analíticos da equipa/escalão (Nível 2 — bíblia §8.15 / §10.2).
// Presentacional: recebe o AnaliticoEscalao já calculado (Server Action).
// Redesign 2026-08 (§12): layout "clean/global" (ref. Dossier do Treinador) —
// KPIs de número grande, grelha mensal de treinos, rankings e tabelas limpas,
// com destaques na cor do clube. Sem alterações à lógica de dados.
"use client";

import type { CasaFora, TipoSessao, TipoEventoJogo } from "@prisma/client";
import type {
  AnaliticoEscalao,
  CompeticaoOpcao,
  RecordCasaFora,
} from "@/lib/actions/analise";
import dynamic from "next/dynamic";

const GraficoBarrasH = dynamic(
  () => import("@/components/graficos/GraficoBarrasH").then((m) => ({ default: m.GraficoBarrasH })),
  { ssr: false },
);
import { FiltroCompeticao } from "./FiltroCompeticao";
import { RankingsMetricas } from "./RankingsMetricas";
import { RankingAssiduidade } from "./RankingAssiduidade";
import { Kpi, SecaoAnalitico, GrelhaMeses, type AcentoKpi } from "./Kpi";
import { pct, n1 } from "./Cartao";

const LABEL_TIPO_SESSAO: Record<TipoSessao, string> = {
  NORMAL: "Normal",
  ABERTO: "Aberto",
  CAPTACAO: "Captação",
  EVENTO: "Evento",
};

// Análise por período (M6, §8.15): tipos de evento relevantes para a leitura
// 1ª vs 2ª parte, com rótulos no plural para os cabeçalhos da tabela. Remates e
// Cantos só surgem no futebol — a filtragem por valor>0 garante que só aparecem
// as colunas com registos.
const EVENTOS_POR_PERIODO: { tipo: TipoEventoJogo; label: string }[] = [
  { tipo: "GOLO", label: "Golos" },
  { tipo: "ASSISTENCIA", label: "Assistências" },
  { tipo: "FALTA", label: "Faltas" },
  { tipo: "REMATE", label: "Remates" },
  { tipo: "CANTO", label: "Cantos" },
];

/** Percentagem inteira de `parte` sobre `total` (ex.: 6/10 → "60%"). */
function pctDe(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)}%` : "—";
}

/** Acento semântico para uma taxa 0–1 (verde ≥85%, âmbar ≥60%, senão vermelho). */
function acentoTaxa(taxa: number): AcentoKpi {
  if (taxa >= 0.85) return "verde";
  if (taxa >= 0.6) return "ambar";
  return "vermelho";
}

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

  // Rendimento casa/fora (§10.2). Snapshots de relatórios antigos não têm os
  // campos — os defaults garantem zero regressão na vista pública.
  const recordCasa = dados.recordCasa ?? RECORD_VAZIO;
  const recordFora = dados.recordFora ?? RECORD_VAZIO;
  const temRendimentoLocal = recordCasa.jogos > 0 || recordFora.jogos > 0;

  const semJogos = dados.jogos === 0;

  // Análise por período (M6, §8.15): só há dados quando o treinador usa o registo
  // ao vivo (EventoJogo). Jogos sem registo — ou snapshots antigos — têm as partes
  // vazias, pelo que a secção fica oculta. A condição usa a 2ª parte como sinal de
  // que houve registo temporal (jogos só com 1ª parte são residuais/incompletos).
  const eventosParte1 = dados.eventosPorParte?.parte1 ?? {};
  const eventosParte2 = dados.eventosPorParte?.parte2 ?? {};
  const temDadosPorParte = Object.values(eventosParte2).some((v) => v > 0);
  const colunasPorParte = EVENTOS_POR_PERIODO.filter(
    ({ tipo }) => (eventosParte1[tipo] ?? 0) > 0 || (eventosParte2[tipo] ?? 0) > 0,
  );

  // Sessões executadas (§10.2): já realizadas (`data < agora`), subconjunto das
  // programadas. Snapshots antigos não têm o campo — o default (= total) garante
  // zero regressão na vista pública de relatórios.
  const sessoesExecutadas = dados.sessoesExecutadas ?? dados.sessoes;

  // Grelha mensal de treinos (ref. dossier): nº de sessões por mês, derivado da
  // assiduidade mensal já calculada (`total = sessões × nAtletas`). Puramente
  // presentacional — sem nova Server Action nem alteração à lógica de dados.
  const treinosPorMes = dados.presencaMensal.map((p) => ({
    mes: p.mes,
    valor: dados.nAtletas > 0 ? Math.round(p.total / dados.nAtletas) : 0,
  }));
  // Assiduidade mensal como grelha de percentagens (destaque abaixo do alvo).
  const presencaPorMes = dados.presencaMensal.map((p) => ({
    mes: p.mes,
    valor: pct(p.taxa),
    destaque: p.taxa < 0.6,
  }));

  return (
    <div className="space-y-10">
      {/* Filtro por competição (P2.5) — só quando há competições com jogos. */}
      {competicoes && competicoes.length > 0 && (
        <FiltroCompeticao competicoes={competicoes} competicaoId={competicaoId} />
      )}

      {/* Balanço da época — KPIs de resultados */}
      <SecaoAnalitico titulo="Balanço da época">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi valor={dados.jogos} label="jogos" acento="primary" />
          <Kpi
            valor={dados.vitorias}
            label="vitórias"
            acento="verde"
            nota={pctDe(dados.vitorias, dados.jogos)}
          />
          <Kpi
            valor={dados.empates}
            label="empates"
            acento="ambar"
            nota={pctDe(dados.empates, dados.jogos)}
          />
          <Kpi
            valor={dados.derrotas}
            label="derrotas"
            acento="vermelho"
            nota={pctDe(dados.derrotas, dados.jogos)}
          />
          <Kpi valor={dados.golosMarcados} label="golos marcados" acento="verde" />
          <Kpi valor={dados.golosSofridos} label="golos sofridos" acento="vermelho" />
        </div>
      </SecaoAnalitico>

      {/* Plantel e médias — KPIs */}
      <SecaoAnalitico titulo="Plantel e médias">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi valor={dados.nAtletas} label="atletas" acento="primary" />
          <Kpi
            valor={`${sessoesExecutadas}/${dados.sessoes}`}
            label="sessões"
            nota="realizadas/prog."
          />
          <Kpi
            valor={pct(dados.taxaPresencaMedia)}
            label="presença média"
            acento={acentoTaxa(dados.taxaPresencaMedia)}
          />
          <Kpi valor={n1(dados.golosMarcadosMedia)} label="golos M/jogo" acento="verde" />
          <Kpi valor={n1(dados.golosSofridosMedia)} label="golos S/jogo" acento="vermelho" />
        </div>
      </SecaoAnalitico>

      {/* Treinos — grelha mensal de sessões + tipos de treino */}
      {(treinosPorMes.length > 0 || tiposTreino.length > 0) && (
        <SecaoAnalitico titulo="Treinos">
          {treinosPorMes.length > 0 && <GrelhaMeses meses={treinosPorMes} />}
          {tiposTreino.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {tiposTreino.map(({ tipo, n }) => (
                <li
                  key={tipo}
                  className="rounded-full border border-cinza-200 bg-white px-3 py-1 text-legenda text-cinza-700"
                >
                  {LABEL_TIPO_SESSAO[tipo]}
                  <span className="ml-1.5 font-semibold text-primary">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </SecaoAnalitico>
      )}

      {/* Assiduidade mensal — grelha de percentagens (estilo dossier) */}
      {presencaPorMes.length >= 2 && (
        <SecaoAnalitico titulo="Assiduidade mensal">
          <GrelhaMeses meses={presencaPorMes} />
        </SecaoAnalitico>
      )}

      {/* Rankings de golos e assistências */}
      <SecaoAnalitico titulo="Rankings ofensivos">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-lg border border-cinza-200 bg-white p-5">
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

          <div className="rounded-lg border border-cinza-200 bg-white p-5">
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
      </SecaoAnalitico>

      {/* Análise por período (M6, §8.15) — 1ª vs 2ª parte, só com registo ao vivo.
          Colunas restritas aos eventos com pelo menos um registo nalguma parte. */}
      {temDadosPorParte && colunasPorParte.length > 0 && (
        <SecaoAnalitico titulo="Análise por período">
          <div className="overflow-x-auto rounded-lg border border-cinza-200 bg-white">
            <table className="w-full text-corpo-sec">
              <thead>
                <tr className="border-b border-cinza-200 text-left text-legenda uppercase tracking-wide text-cinza-500">
                  <th className="px-5 py-3 font-medium">Período</th>
                  {colunasPorParte.map(({ tipo, label }) => (
                    <th key={tipo} className="px-3 py-3 text-right font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cinza-100">
                <tr className="text-cinza-900 transition-colors hover:bg-cinza-50">
                  <td className="px-5 py-3 font-medium">1ª Parte</td>
                  {colunasPorParte.map(({ tipo }) => (
                    <td key={tipo} className="px-3 py-3 text-right tabular-nums">
                      {eventosParte1[tipo] ?? 0}
                    </td>
                  ))}
                </tr>
                <tr className="text-cinza-900 transition-colors hover:bg-cinza-50">
                  <td className="px-5 py-3 font-medium">2ª Parte</td>
                  {colunasPorParte.map(({ tipo }) => (
                    <td key={tipo} className="px-3 py-3 text-right tabular-nums">
                      {eventosParte2[tipo] ?? 0}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </SecaoAnalitico>
      )}

      {/* Utilização e assiduidade por atleta */}
      {(pontosUtilizados.length > 0 || assiduidade.length > 0) && (
        <SecaoAnalitico titulo="Utilização e assiduidade">
          <div className="grid gap-6 lg:grid-cols-2">
            {pontosUtilizados.length > 0 && (
              <div className="rounded-lg border border-cinza-200 bg-white p-5">
                <GraficoBarrasH
                  dados={pontosUtilizados}
                  titulo="Jogadores mais utilizados"
                  unidade="min"
                  maxRows={pontosUtilizados.length}
                />
              </div>
            )}
            {assiduidade.length > 0 && <RankingAssiduidade atletas={assiduidade} />}
          </div>
        </SecaoAnalitico>
      )}

      {/* Ranking por métrica configurável (§10.2) — só com métricas do clube. */}
      {rankingsMetricas.length > 0 && (
        <RankingsMetricas rankings={rankingsMetricas} />
      )}

      {/* Disciplina (§3.7) — totais de cartões + top 5 indisciplinados. */}
      {temDisciplina && (
        <SecaoAnalitico titulo="Disciplina">
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <Kpi valor={cartoes.amarelos} label="amarelos" acento="ambar" />
            <Kpi valor={cartoes.vermelhos} label="vermelhos" acento="vermelho" />
          </div>

          {rankingDisciplina.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-cinza-200 bg-white">
              <table className="w-full text-corpo-sec">
                <thead>
                  <tr className="border-b border-cinza-200 text-left text-legenda uppercase tracking-wide text-cinza-500">
                    <th className="px-5 py-3 font-medium">Atleta</th>
                    <th className="px-3 py-3 text-right font-medium">Amarelos</th>
                    <th className="px-5 py-3 text-right font-medium">Vermelhos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cinza-100">
                  {rankingDisciplina.map((a) => (
                    <tr
                      key={a.atletaId}
                      className="text-cinza-900 transition-colors hover:bg-cinza-50"
                    >
                      <td className="px-5 py-3 font-medium">{a.nome}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-ambar-600">
                        {a.amarelos}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-vermelho-600">
                        {a.vermelhos}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SecaoAnalitico>
      )}

      {/* Rendimento casa/fora (§10.2) — mini-cards V-E-D por local; cada card só
          aparece se houver pelo menos um jogo com resultado nesse local. */}
      {temRendimentoLocal && (
        <SecaoAnalitico titulo="Rendimento casa/fora">
          <div className="grid grid-cols-1 gap-3 sm:max-w-xl sm:grid-cols-2">
            {recordCasa.jogos > 0 && <CartaoLocal titulo="Casa" record={recordCasa} />}
            {recordFora.jogos > 0 && <CartaoLocal titulo="Fora" record={recordFora} />}
          </div>
        </SecaoAnalitico>
      )}

      {/* Resultados jogo a jogo */}
      <SecaoAnalitico titulo="Resultados">
        <div className="rounded-lg border border-cinza-200 bg-white p-5">
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
                    <div className="flex items-center gap-2">
                      <p className="truncate text-corpo text-cinza-900">{r.adversario}</p>
                      <LocalBadge casaFora={r.casaFora} />
                    </div>
                    <p className="text-legenda text-cinza-500">{formatarData(r.data)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-corpo font-semibold tabular-nums text-cinza-900">
                      {r.golosMarcados ?? "—"}–{r.golosSofridos ?? "—"}
                    </span>
                    <ResultadoBadge resultado={r.resultado} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SecaoAnalitico>
    </div>
  );
}

const RECORD_VAZIO: RecordCasaFora = { vitorias: 0, empates: 0, derrotas: 0, jogos: 0 };

/** Etiqueta discreta do local do jogo (Casa/Fora). Nada quando desconhecido. */
function LocalBadge({ casaFora }: { casaFora: CasaFora | null }) {
  if (!casaFora) return null;
  const emCasa = casaFora === "CASA";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-legenda font-medium ${
        emCasa
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-cinza-200 bg-cinza-50 text-cinza-600"
      }`}
    >
      {emCasa ? "Casa" : "Fora"}
    </span>
  );
}

/** Mini-card de balanço V-E-D para um local (casa ou fora). */
function CartaoLocal({ titulo, record }: { titulo: string; record: RecordCasaFora }) {
  return (
    <div className="rounded-lg border border-cinza-200 bg-white p-5">
      <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-400">
        {titulo}
        <span className="ml-1.5 normal-case tracking-normal text-cinza-500">
          · {record.jogos} {record.jogos === 1 ? "jogo" : "jogos"}
        </span>
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-2xl font-bold leading-none tabular-nums text-verde-600">
            {record.vitorias}
          </p>
          <p className="mt-1.5 text-legenda uppercase tracking-wide text-cinza-500">V</p>
        </div>
        <div>
          <p className="text-2xl font-bold leading-none tabular-nums text-ambar-600">
            {record.empates}
          </p>
          <p className="mt-1.5 text-legenda uppercase tracking-wide text-cinza-500">E</p>
        </div>
        <div>
          <p className="text-2xl font-bold leading-none tabular-nums text-vermelho-600">
            {record.derrotas}
          </p>
          <p className="mt-1.5 text-legenda uppercase tracking-wide text-cinza-500">D</p>
        </div>
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
