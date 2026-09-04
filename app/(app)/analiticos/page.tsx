import type { Metadata } from "next";
import {
  obterAnaliticoClubeEpoca,
  listarRelatoriosPartilhados,
  obterEvolucaoMultiepocaClube,
} from "@/lib/actions/analise";
import { obterMembroAtual } from "@/lib/permissoes";
import { PainelClube } from "@/components/analiticos/PainelClube";
import { PainelEquipaTecnica } from "@/components/analiticos/PainelEquipaTecnica";
import { TabelaEvolucaoEpocas } from "@/components/analiticos/TabelaEvolucaoEpocas";
import { DescarregarPdfBotao } from "@/components/analiticos/DescarregarPdfBotao";
import { GerarRelatorioBotao } from "@/components/relatorios/GerarRelatorioBotao";
import { GerirRelatorios } from "@/components/relatorios/GerirRelatorios";
import { EstadoVazio } from "@/components/layout/EstadosUI";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnaliticosClubePage() {
  const [resClube, resRelatorios, membro] = await Promise.all([
    obterAnaliticoClubeEpoca(),
    listarRelatoriosPartilhados(),
    obterMembroAtual(),
  ]);

  // Vistas de gestão do clube (DT / Presidente):
  //  - Equipa Técnica: só âmbito TODO_CLUBE (DT/Admin — gestão de pessoas).
  //  - Evolução do clube: quem tem RELATORIOS_VER (inclui Presidente), e só
  //    quando há ≥2 épocas para comparar.
  const eTodoClube = membro?.ambito === "TODO_CLUBE";
  const podeVerRelatorios = membro?.capacidades.includes("RELATORIOS_VER") ?? false;
  const resEvolucao = podeVerRelatorios
    ? await obterEvolucaoMultiepocaClube()
    : null;
  const evolucaoEpocas =
    resEvolucao && resEvolucao.sucesso ? resEvolucao.dados : [];

  if (!resClube.sucesso) {
    return (
      <div className="space-y-6">
        <h1>Analytics</h1>
        {resClube.erro === "Sem permissão" ? (
          <EstadoVazio
            titulo="Não tens permissão para ver os analíticos do clube"
            descricao="Os analytics do clube exigem a permissão «Ver relatórios». Pede ao administrador do clube para a atribuir."
          />
        ) : (
          <EstadoVazio titulo="Analytics indisponíveis" descricao={resClube.erro} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1>Analytics do clube</h1>
          <p className="mt-1 text-corpo-sec text-cinza-500">
            {resClube.dados.clube.nome} · {resClube.dados.epoca.nome}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DescarregarPdfBotao params={{ tipo: "clube" }} />
          <GerarRelatorioBotao tipo="EPOCA_CLUBE" />
        </div>
      </div>

      <PainelClube dados={resClube.dados} linkEscaloes />

      {/* Evolução do clube (DT3 — §10.3): só com RELATORIOS_VER e ≥2 épocas. */}
      {podeVerRelatorios && evolucaoEpocas.length >= 2 && (
        <section className="space-y-3">
          <h2 className="text-titulo-seccao text-cinza-900">Evolução do clube</h2>
          <TabelaEvolucaoEpocas linhas={evolucaoEpocas} />
        </section>
      )}

      {/* Equipa técnica (DT1 — §10): só para âmbito TODO_CLUBE (DT/Admin). */}
      {eTodoClube && (
        <section className="space-y-3">
          <h2 className="text-titulo-seccao text-cinza-900">Equipa técnica</h2>
          <PainelEquipaTecnica />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-titulo-seccao text-cinza-900">Relatórios partilhados</h2>
        {resRelatorios.sucesso ? (
          <GerirRelatorios relatorios={resRelatorios.dados} />
        ) : (
          <EstadoVazio titulo="Relatórios indisponíveis" descricao={resRelatorios.erro} />
        )}
      </section>
    </div>
  );
}
