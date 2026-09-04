import type { Metadata } from "next";
import {
  obterAnaliticoEscalao,
  obterAnaliticoTreinoEscalao,
  obterCompeticoesEscalao,
  exportarAnaliticoEscalaoCsv,
} from "@/lib/actions/analise";
import { obterCargaSemanal, obterCargaAtletas } from "@/lib/actions/cargaTreino";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PainelEscalao } from "@/components/analiticos/PainelEscalao";
import { PainelTreinoEscalao } from "@/components/analiticos/PainelTreinoEscalao";
import { ExportarCsvBotao } from "@/components/analiticos/ExportarCsvBotao";
import { DescarregarPdfBotao } from "@/components/analiticos/DescarregarPdfBotao";
import { TabelaAcwrAtletas } from "@/components/analiticos/TabelaAcwrAtletas";
import { CurvaCargaSemanal } from "@/components/graficos/CurvaCargaSemanalLazy";
import { GerarRelatorioBotao } from "@/components/relatorios/GerarRelatorioBotao";
import { BotaoPartilhaRanking } from "@/components/social/BotaoPartilhaRanking";
import { EstadoVazio } from "@/components/layout/EstadosUI";
import { eEscalaoFormacaoJovem } from "@/lib/schemas/social";
import { urlCard } from "@/lib/social/token";

export const metadata: Metadata = { title: "Analytics do escalão" };

export default async function AnaliticosEscalaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ competicao?: string }>;
}) {
  const { id } = await params;
  const { competicao } = await searchParams;
  // P2.5: filtro opcional por competição (campeonato / taça / particulares).
  const [res, resTreino, resCompeticoes, resCarga, resCargaAtletas] = await Promise.all([
    obterAnaliticoEscalao(id, undefined, competicao || undefined),
    obterAnaliticoTreinoEscalao(id),
    obterCompeticoesEscalao(id),
    obterCargaSemanal(id),
    obterCargaAtletas({ escalaoId: id }),
  ]);
  const competicoes = resCompeticoes.sucesso ? resCompeticoes.dados : [];
  // P4.8 (§8.20): só mostra a secção de carga se houver RPE registado.
  const carga = resCarga.sucesso && resCarga.dados.temDados ? resCarga.dados : null;
  // F2.2 (§8.20): ACWR individual — só aparece se ≥1 atleta reportou RPE na janela.
  const cargaAtletas = resCargaAtletas.sucesso ? resCargaAtletas.dados.atletas : [];
  const temRpeIndividual = cargaAtletas.some((a) => a.zona !== null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Breadcrumbs
          items={[
            { label: "Analytics", href: "/analiticos" },
            { label: res.sucesso ? res.dados.escalao.nome : "Escalão" },
          ]}
        />
        {res.sucesso && (
          <div className="flex flex-wrap gap-2">
            {/* P4.7: card social do top 5 marcadores. Bloqueado para formação jovem (RGPD). */}
            {!eEscalaoFormacaoJovem(res.dados.escalao.nome) && (
              <BotaoPartilhaRanking
                url={urlCard("ranking", {
                  escalaoId: id,
                  epocaId: res.dados.epoca.id,
                })}
              />
            )}
            <ExportarCsvBotao
              acao={exportarAnaliticoEscalaoCsv.bind(null, {
                escalaoId: id,
                competicaoId: competicao || undefined,
              })}
            />
            <DescarregarPdfBotao
              params={{
                tipo: "escalao",
                escalaoId: id,
                competicaoId: competicao || undefined,
              }}
            />
            <GerarRelatorioBotao tipo="EPOCA_EQUIPA" escalaoId={id} />
          </div>
        )}
      </div>

      {res.sucesso ? (
        <>
          <div>
            <h1>{res.dados.escalao.nome}</h1>
            <p className="mt-1 text-corpo-sec text-cinza-500">
              Analytics da equipa · {res.dados.epoca.nome}
            </p>
          </div>
          <PainelEscalao
            dados={res.dados}
            competicoes={competicoes}
            competicaoId={competicao || undefined}
          />
          {/* P4.8 (§8.20): carga de treino (RPE/ACWR) — só quando há RPE registado. */}
          {carga && (
            <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
              <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-400">
                Carga de treino
              </p>
              <CurvaCargaSemanal dados={carga.semanas} />
            </div>
          )}
          {/* F2.2 (§8.20): ACWR individual por atleta, ordenado por risco. */}
          {temRpeIndividual && (
            <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
              <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-400">
                Carga individual (ACWR)
              </p>
              <TabelaAcwrAtletas atletas={cargaAtletas} />
            </div>
          )}
          {/* Analíticos de treino do escalão (§8.15 / §10.2): volume, composição
              da biblioteca, evolução mensal e assiduidade. */}
          {resTreino.sucesso && (
            <div className="border-t border-cinza-200 pt-8">
              <h2 className="mb-6 text-subtitulo text-cinza-900">Treino</h2>
              <PainelTreinoEscalao dados={resTreino.dados} />
            </div>
          )}
        </>
      ) : res.erro === "Sem permissão" ? (
        <EstadoVazio
          titulo="Sem acesso a este escalão"
          descricao="Não tens permissão para ver os analíticos deste escalão."
        />
      ) : (
        <EstadoVazio titulo="Analytics indisponíveis" descricao={res.erro} />
      )}
    </div>
  );
}
