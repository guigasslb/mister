import { cn } from "@/lib/utils";
import type { LinhaClassificacao } from "@/lib/actions/competicoes";
import type { FormatoCompeticao } from "@prisma/client";

/**
 * Tabela de classificação de uma competição (F6). A classificação é calculada
 * no servidor (`obterClassificacao`). Só o formato LIGA tem pontos — TORNEIO e
 * TACA ordenam pela diferença de golos e não mostram a coluna «Pts».
 */
export function TabelaClassificacao({
  linhas,
  formato,
}: {
  linhas: LinhaClassificacao[];
  formato: FormatoCompeticao;
}) {
  const mostrarPontos = formato === "LIGA";

  if (linhas.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
        Sem dados para a classificação. Regista resultados ou jogos com resultado final.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-cinza-200 bg-white shadow-card">
      <table className="w-full min-w-[520px] text-corpo-sec">
        <caption className="sr-only">Classificação da competição</caption>
        <thead>
          <tr className="border-b border-cinza-200 text-legenda text-cinza-500">
            <th scope="col" className="px-3 py-2 text-left font-semibold">#</th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">Equipa</th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">
              <abbr title="Jogos">J</abbr>
            </th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">
              <abbr title="Vitórias">V</abbr>
            </th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">
              <abbr title="Empates">E</abbr>
            </th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">
              <abbr title="Derrotas">D</abbr>
            </th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">
              <abbr title="Golos Marcados">GM</abbr>
            </th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">
              <abbr title="Golos Sofridos">GS</abbr>
            </th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">
              <abbr title="Diferença de Golos">DG</abbr>
            </th>
            {mostrarPontos && (
              <th scope="col" className="px-3 py-2 text-center font-semibold">
                <abbr title="Pontos">Pts</abbr>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const dg = l.golosMarcados - l.golosSofridos;
            return (
              <tr
                key={l.equipa}
                className={cn(
                  "border-b border-cinza-100 last:border-0",
                  l.ehProprio && "bg-primary/5 font-semibold text-primary",
                )}
              >
                <td className="px-3 py-2 text-cinza-500">{l.posicao}</td>
                <th scope="row" className="px-3 py-2 text-left">{l.equipa}</th>
                <td className="px-2 py-2 text-center">{l.jogos}</td>
                <td className="px-2 py-2 text-center">{l.vitorias}</td>
                <td className="px-2 py-2 text-center">{l.empates}</td>
                <td className="px-2 py-2 text-center">{l.derrotas}</td>
                <td className="px-2 py-2 text-center">{l.golosMarcados}</td>
                <td className="px-2 py-2 text-center">{l.golosSofridos}</td>
                <td className="px-2 py-2 text-center">
                  {dg > 0 ? `+${dg}` : dg}
                </td>
                {mostrarPontos && (
                  <td className="px-3 py-2 text-center font-semibold">{l.pontos}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
