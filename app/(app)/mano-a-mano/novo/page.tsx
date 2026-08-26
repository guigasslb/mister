import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { listarEpocas } from "@/lib/actions/epocas";
import { listarAtletas } from "@/lib/actions/atletas";
import { listarClubesExternos } from "@/lib/actions/mano-a-mano";
import { WizardManoMano } from "@/components/mano-a-mano/WizardManoMano";
import { EstadoErro } from "@/components/layout/EstadosUI";

export const metadata: Metadata = { title: "Mano-a-Mano · Nova competição" };

export default async function NovaCompeticaoManoManoPage() {
  const [resEsc, resEpocas, resAtletas, resClubes] = await Promise.all([
    listarEscaloes(),
    listarEpocas(),
    listarAtletas(),
    listarClubesExternos(),
  ]);

  if (!resEsc.sucesso) return <EstadoErro mensagem={resEsc.erro} />;
  if (!resEpocas.sucesso) return <EstadoErro mensagem={resEpocas.erro} />;

  const escaloes = resEsc.dados.map((e) => ({ id: e.id, nome: e.nome }));
  const epocas = resEpocas.dados.map((ep) => ({ id: ep.id, nome: ep.nome, ativa: ep.ativa }));
  const atletas = (resAtletas.sucesso ? resAtletas.dados : []).map((a) => ({
    id: a.id,
    nome: a.nome,
    escalaoIds: a.participacoes.map((p) => p.escalaoId),
  }));
  const clubesExternos = (resClubes.sucesso ? resClubes.dados : []).map((c) => ({
    id: c.id,
    nome: c.nome,
  }));

  return (
    <div className="space-y-6">
      <Link
        href="/mano-a-mano"
        className="flex w-fit items-center gap-1 text-corpo-sec text-cinza-600 transition-colors hover:text-cinza-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Mano-a-Mano
      </Link>
      <WizardManoMano
        escaloes={escaloes}
        epocas={epocas}
        atletas={atletas}
        clubesExternos={clubesExternos}
      />
    </div>
  );
}
