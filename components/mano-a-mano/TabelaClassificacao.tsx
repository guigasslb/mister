import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LinhaClassificacaoManoMano } from "@/lib/actions/mano-a-mano";

/**
 * Classificação de uma competição Mano-a-Mano (calculada no servidor por
 * `obterClassificacaoManoMano`). O 1.º lugar é destacado como líder. A tabela
 * mostra sempre pontos — o cálculo respeita a configuração de pontuação da
 * competição.
 */
export function TabelaClassificacao({
  linhas,
}: {
  linhas: LinhaClassificacaoManoMano[];
}) {
  if (linhas.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
        Sem dados para a classificação. Regista o resultado de pelo menos um duelo.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-cinza-200 bg-white shadow-card">
      <table className="w-full min-w-[560px] text-corpo-sec">
        <caption className="sr-only">Classificação da competição Mano-a-Mano</caption>
        <thead>
          <tr className="border-b border-cinza-200 text-legenda text-cinza-500">
            <th scope="col" className="px-3 py-2 text-left font-semibold">#</th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">Participante</th>
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
              <abbr title="Golos marcados">GM</abbr>
            </th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">
              <abbr title="Golos sofridos">GS</abbr>
            </th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">
              <abbr title="Diferença de golos">DG</abbr>
            </th>
            <th scope="col" className="px-3 py-2 text-center font-semibold">
              <abbr title="Pontos">Pts</abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const lider = l.posicao === 1;
            return (
              <tr
                key={l.participanteId}
                className={cn(
                  "border-b border-cinza-100 last:border-0",
                  lider && "bg-primary/5 font-semibold text-primary",
                )}
              >
                <td className="px-3 py-2 text-cinza-500">{l.posicao}</td>
                <th scope="row" className="px-3 py-2 text-left">
                  <span className="flex items-center gap-1.5">
                    {l.nome}
                    {lider && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-legenda font-semibold text-primary-foreground">
                        <Crown className="h-3 w-3" />
                        Líder
                      </span>
                    )}
                  </span>
                </th>
                <td className="px-2 py-2 text-center tabular-nums">{l.jogos}</td>
                <td className="px-2 py-2 text-center tabular-nums">{l.vitorias}</td>
                <td className="px-2 py-2 text-center tabular-nums">{l.empates}</td>
                <td className="px-2 py-2 text-center tabular-nums">{l.derrotas}</td>
                <td className="px-2 py-2 text-center tabular-nums">{l.golosMarcados}</td>
                <td className="px-2 py-2 text-center tabular-nums">{l.golosSofridos}</td>
                <td className="px-2 py-2 text-center tabular-nums">
                  {l.diferencaGolos > 0 ? `+${l.diferencaGolos}` : l.diferencaGolos}
                </td>
                <td className="px-3 py-2 text-center font-semibold tabular-nums">{l.pontos}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
