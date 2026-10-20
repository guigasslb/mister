import type { Metadata } from "next";
import Link from "next/link";
import { listarEscaloesLegiveis } from "@/lib/actions/escaloes";
import { listarAtletas } from "@/lib/actions/atletas";
import { obterRelatorioEquipa } from "@/lib/actions/relatorios";
import { obterCompeticoesEscalao } from "@/lib/actions/analise";
import { opcoesEquipaRelatorio } from "@/lib/subequipas-ui";
import { FiltroEquipaRelatorio } from "@/components/relatorios/FiltroEquipaRelatorio";
import { BotaoImprimir } from "@/components/relatorios/BotaoImprimir";
import { EstadoErro } from "@/components/layout/EstadosUI";
import { GraficoBarrasH } from "@/components/graficos/GraficoBarrasHLazy";

function Cartao({ valor, label }: { valor: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-cinza-200 bg-white p-4">
      <span className="text-titulo-pagina font-bold text-primary">{valor}</span>
      <span className="text-legenda text-cinza-500">{label}</span>
    </div>
  );
}

export const metadata: Metadata = { title: "Relatórios" };

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ escalaoId?: string; equipa?: string }>;
}) {
  const { escalaoId, equipa } = await searchParams;
  const resEsc = await listarEscaloesLegiveis();
  if (!resEsc.sucesso) return <EstadoErro mensagem={resEsc.erro} />;
  const escaloes = resEsc.dados;
  const selecionado = escalaoId ?? escaloes[0]?.id;

  // §23.11.3 regra 10: filtro opcional «Equipa» — subequipas das competições do
  // escalão com ≥2 (mesmas opções dos analíticos); `?equipa=` só é aplicado se
  // for uma dessas opções. Sem subequipas o filtro não aparece.
  const resComp = selecionado ? await obterCompeticoesEscalao(selecionado) : null;
  const opcoesEquipa = resComp?.sucesso ? opcoesEquipaRelatorio(resComp.dados) : [];
  const equipaCompeticaoId =
    equipa && opcoesEquipa.some((o) => o.id === equipa) ? equipa : undefined;

  const [resRel, resAtletas] = selecionado
    ? await Promise.all([
        obterRelatorioEquipa(selecionado, equipaCompeticaoId),
        listarAtletas(selecionado),
      ])
    : [null, null];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h1>Relatórios</h1>
        <BotaoImprimir />
      </div>

      {escaloes.length > 0 && (
        <div className="-mb-px flex flex-wrap border-b border-cinza-200 print:hidden">
          {escaloes.map((e) => (
            <Link
              key={e.id}
              href={`/relatorios?escalaoId=${e.id}`}
              className={`px-4 py-2.5 text-corpo font-medium border-b-2 transition-colors ${
                selecionado === e.id
                  ? "border-primary text-primary"
                  : "border-transparent text-cinza-600 hover:text-cinza-900"
              }`}
            >
              {e.nome}
            </Link>
          ))}
        </div>
      )}

      {resRel && resRel.sucesso ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-titulo-seccao text-cinza-900">
              {resRel.dados.escalaoNome} — {resRel.dados.epocaNome}
            </h2>
            <p className="text-corpo-sec text-cinza-500">Relatório de equipa</p>
          </div>

          {opcoesEquipa.length > 0 && (
            <FiltroEquipaRelatorio opcoes={opcoesEquipa} equipaCompeticaoId={equipaCompeticaoId} />
          )}

          {/* Result stats */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Cartao valor={resRel.dados.jogos} label="jogos" />
            <Cartao valor={resRel.dados.vitorias} label="vitórias" />
            <Cartao valor={resRel.dados.empates} label="empates" />
            <Cartao valor={resRel.dados.derrotas} label="derrotas" />
            <Cartao valor={resRel.dados.golosMarcados} label="golos M" />
            <Cartao valor={resRel.dados.golosSofridos} label="golos S" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Cartao valor={resRel.dados.nAtletas} label="atletas" />
            <Cartao valor={resRel.dados.sessoes} label="sessões" />
          </div>

          {/* Rankings charts */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
              {resRel.dados.marcadores.length === 0 ? (
                <>
                  <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-400">
                    Melhores marcadores
                  </p>
                  <p className="text-corpo-sec text-cinza-500">Sem golos registados.</p>
                </>
              ) : (
                <GraficoBarrasH
                  dados={resRel.dados.marcadores.map((m) => ({ label: m.nome, valor: m.golos }))}
                  titulo="Melhores marcadores"
                  unidade="golos"
                  unidadeSingular="golo"
                />
              )}
            </div>

            <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
              {resRel.dados.assistentes.length === 0 ? (
                <>
                  <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-400">
                    Melhores assistentes
                  </p>
                  <p className="text-corpo-sec text-cinza-500">Sem assistências registadas.</p>
                </>
              ) : (
                <GraficoBarrasH
                  dados={resRel.dados.assistentes.map((m) => ({
                    label: m.nome,
                    valor: m.assistencias,
                  }))}
                  titulo="Melhores assistentes"
                  unidade="assist."
                />
              )}
            </div>
          </div>

          {resAtletas && resAtletas.sucesso && resAtletas.dados.length > 0 && (
            <div className="print:hidden">
              <h3 className="mb-2 text-subtitulo text-cinza-900">Relatórios individuais</h3>
              <div className="flex flex-wrap gap-2">
                {resAtletas.dados.map((a) => (
                  <Link
                    key={a.id}
                    href={`/plantel/${a.id}/relatorio`}
                    className="rounded-full border border-cinza-200 px-3 py-1 text-legenda text-cinza-700 hover:bg-cinza-50"
                  >
                    {a.nome}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-corpo-sec text-cinza-500">Seleciona um escalão para ver o relatório.</p>
      )}
    </div>
  );
}
