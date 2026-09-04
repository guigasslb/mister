// Painel da equipa técnica (DT1 — §10 · gestão do Diretor Técnico).
// Vista transversal de produtividade dos treinadores do clube: sessões e jogos
// criados, presenças marcadas e assiduidade média dos escalões que gerem.
// Server component: faz o fetch internamente via `obterAnaliticoEquipaTecnica`
// (que já exige RELATORIOS_VER + âmbito TODO_CLUBE). Estilo "clean/global"
// consistente com PainelClube (tabela limpa, destaques na cor do clube).

import { obterAnaliticoEquipaTecnica } from "@/lib/actions/analise";
import { EstadoVazio } from "@/components/layout/EstadosUI";
import { pct } from "./Cartao";

export async function PainelEquipaTecnica() {
  const res = await obterAnaliticoEquipaTecnica();

  if (!res.sucesso) {
    return (
      <EstadoVazio
        titulo="Equipa técnica indisponível"
        descricao={res.erro}
      />
    );
  }

  const treinadores = res.dados;

  if (treinadores.length === 0) {
    return (
      <EstadoVazio
        titulo="Sem treinadores com escalões atribuídos"
        descricao="Atribui escalões aos membros da equipa técnica para acompanhar a sua atividade."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-cinza-200 bg-white">
      <table className="w-full min-w-[720px] text-corpo-sec">
        <thead>
          <tr className="border-b border-cinza-200 text-left text-legenda uppercase tracking-wide text-cinza-500">
            <th className="px-5 py-3 font-medium">Treinador</th>
            <th className="px-3 py-3 font-medium">Perfil</th>
            <th className="px-3 py-3 font-medium">Escalões</th>
            <th className="px-3 py-3 text-right font-medium">Sessões</th>
            <th className="px-3 py-3 text-right font-medium">Jogos</th>
            <th className="px-3 py-3 text-right font-medium">Presenças</th>
            <th className="px-5 py-3 text-right font-medium">Presença méd.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cinza-100">
          {treinadores.map((t) => (
            <tr
              key={t.membroId}
              className="text-cinza-900 transition-colors hover:bg-cinza-50"
            >
              <td className="px-5 py-3 font-medium">{t.nome}</td>
              <td className="px-3 py-3 text-cinza-600">{t.perfilNome}</td>
              <td className="px-3 py-3 text-cinza-600">
                {t.escaloes.length > 0
                  ? t.escaloes.map((e) => e.nome).join(", ")
                  : "—"}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{t.sessoesCount}</td>
              <td className="px-3 py-3 text-right tabular-nums">{t.jogosCount}</td>
              <td className="px-3 py-3 text-right tabular-nums">
                {t.presencasMarcadasCount}
              </td>
              <td className="px-5 py-3 text-right tabular-nums font-semibold text-primary">
                {pct(t.taxaPresencaMediaEscaloes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
