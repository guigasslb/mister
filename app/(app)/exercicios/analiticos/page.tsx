import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { obterRankingUsoExercicios } from "@/lib/actions/analise";
import { obterEpocaAtiva } from "@/lib/epoca-context";
import { EstadoVazio } from "@/components/layout/EstadosUI";
import { Badge } from "@/components/ui/badge";
import { LABEL_CATEGORIA } from "@/lib/schemas/exercicio";
import { SecaoAnalitico } from "@/components/analiticos/Kpi";
import { RankingUsoExerciciosGrafico } from "@/components/analiticos/RankingUsoExerciciosGrafico";

export const metadata: Metadata = { title: "Ranking de exercícios" };

/** Data PT-PT completa (ex.: "04/09/2026") ou travessão. */
function formatarData(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function RankingExerciciosPage() {
  const [res, epoca] = await Promise.all([
    obterRankingUsoExercicios({}),
    obterEpocaAtiva(),
  ]);

  const nomeEpoca = epoca?.nome ?? "época ativa";

  return (
    <div className="space-y-8">
      {/* Navegação */}
      <div>
        <Link
          href="/exercicios"
          className="flex items-center gap-1 py-3 -my-3 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Exercícios
        </Link>
      </div>

      <h1 className="leading-tight">Ranking de exercícios — {nomeEpoca}</h1>

      {!res.sucesso ? (
        res.erro === "Sem permissão" ? (
          <EstadoVazio
            titulo="Não tens permissão para ver o ranking de exercícios"
            descricao="O ranking de uso exige a permissão «Ver relatórios». Pede ao administrador do clube para a atribuir."
          />
        ) : (
          <EstadoVazio titulo="Ranking indisponível" descricao={res.erro} />
        )
      ) : res.dados.length === 0 ? (
        <EstadoVazio titulo="Sem exercícios registados nesta época." />
      ) : (
        <>
          {/* Top 20 mais usados — gráfico de barras */}
          {res.dados.some((e) => e.totalUsos > 0) && (() => {
            const usados = res.dados.filter((e) => e.totalUsos > 0);
            return (
              <SecaoAnalitico
                titulo="Mais usados"
                acao={
                  <span className="text-legenda tabular-nums text-cinza-400">
                    Top {Math.min(20, usados.length)} de {usados.length} exercícios
                  </span>
                }
              >
                <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
                  <RankingUsoExerciciosGrafico
                    dados={usados
                      .slice(0, 20)
                      .map((e) => ({ label: e.nome, valor: e.totalUsos }))}
                  />
                </div>
              </SecaoAnalitico>
            );
          })()}

          {/* Tabela completa — inclui os nunca usados */}
          <SecaoAnalitico titulo="Todos os exercícios">
            <div className="overflow-x-auto rounded-lg border border-cinza-200 bg-white shadow-card">
              <table className="w-full text-corpo-sec">
                <thead>
                  <tr className="border-b border-cinza-200 text-left text-legenda uppercase tracking-wide text-cinza-500">
                    <th scope="col" className="px-5 py-3 font-medium">Exercício</th>
                    <th scope="col" className="px-3 py-3 font-medium">Categoria</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Utilizações</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Última vez</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cinza-100">
                  {res.dados.map((e) => {
                    const nuncaUsado = e.totalUsos === 0;
                    return (
                      <tr
                        key={e.exercicioId}
                        className="text-cinza-900 transition-colors hover:bg-cinza-50"
                      >
                        <td className="px-5 py-3 font-medium">
                          <Link
                            href={`/exercicios/${e.exercicioId}`}
                            className="rounded underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {e.nome}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="secondary">
                            {LABEL_CATEGORIA[e.categoriaPrincipal]}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {nuncaUsado ? (
                            <span className="text-cinza-400">Nunca usado</span>
                          ) : (
                            e.totalUsos
                          )}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-cinza-500">
                          {formatarData(e.ultimaVez)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SecaoAnalitico>
        </>
      )}
    </div>
  );
}
