import type { Metadata } from "next";
import {
  obterAnaliticoClubeEpoca,
  listarRelatoriosPartilhados,
} from "@/lib/actions/analise";
import { PainelClube } from "@/components/analiticos/PainelClube";
import { GerarRelatorioBotao } from "@/components/relatorios/GerarRelatorioBotao";
import { GerirRelatorios } from "@/components/relatorios/GerirRelatorios";
import { EstadoVazio } from "@/components/layout/EstadosUI";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnaliticosClubePage() {
  const [resClube, resRelatorios] = await Promise.all([
    obterAnaliticoClubeEpoca(),
    listarRelatoriosPartilhados(),
  ]);

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
        <GerarRelatorioBotao tipo="EPOCA_CLUBE" />
      </div>

      <PainelClube dados={resClube.dados} linkEscaloes />

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
