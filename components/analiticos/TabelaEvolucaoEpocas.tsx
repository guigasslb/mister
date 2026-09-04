// Tabela de evolução multi-época do clube (DT3 — §10.3).
// Presentacional puro: recebe as linhas já calculadas (LinhaEvolucaoEpoca[]).
// Uma linha por época com os grandes números (atletas, escalões, jogos, sessões,
// assiduidade média). A época ativa fica destacada. Estilo "clean/global"
// consistente com PainelClube (tabela limpa, destaques na cor do clube).

import type { LinhaEvolucaoEpoca } from "@/lib/actions/analise";
import { pct } from "./Cartao";

export function TabelaEvolucaoEpocas({
  linhas,
}: {
  linhas: LinhaEvolucaoEpoca[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cinza-200 bg-white">
      <table className="w-full min-w-[560px] text-corpo-sec">
        <thead>
          <tr className="border-b border-cinza-200 text-left text-legenda uppercase tracking-wide text-cinza-500">
            <th className="px-5 py-3 font-medium">Época</th>
            <th className="px-3 py-3 text-right font-medium">Atletas</th>
            <th className="px-3 py-3 text-right font-medium">Escalões</th>
            <th className="px-3 py-3 text-right font-medium">Jogos</th>
            <th className="px-3 py-3 text-right font-medium">Sessões</th>
            <th className="px-5 py-3 text-right font-medium">Presença méd.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cinza-100">
          {linhas.map((l) => (
            <tr
              key={l.epocaId}
              className={
                l.ativa
                  ? "bg-primary/5 text-cinza-900"
                  : "text-cinza-900 transition-colors hover:bg-cinza-50"
              }
            >
              <td
                className={`px-5 py-3 ${
                  l.ativa ? "font-bold text-primary" : "font-medium"
                }`}
              >
                {l.nome}
                {l.ativa && (
                  <span className="ml-2 text-legenda font-medium uppercase tracking-wide text-primary">
                    Ativa
                  </span>
                )}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{l.nAtletas}</td>
              <td className="px-3 py-3 text-right tabular-nums">{l.nEscaloes}</td>
              <td className="px-3 py-3 text-right tabular-nums">{l.nJogos}</td>
              <td className="px-3 py-3 text-right tabular-nums">{l.nSessoes}</td>
              <td className="px-5 py-3 text-right tabular-nums font-semibold text-primary">
                {pct(l.taxaPresencaMedia)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
