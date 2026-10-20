import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  listarCompeticoes,
  obterCompeticao,
  obterClassificacao,
  obterPlantelEquipaCompeticao,
  type CompeticaoDetalhe as CompeticaoDetalheTipo,
  type LinhaClassificacao,
} from "@/lib/actions/competicoes";
import { listarAtletas } from "@/lib/actions/atletas";
import type {
  AtletaEscalaoPlantel,
  PlantelAtual,
} from "@/components/competicoes/PlanteisSubequipas";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { listarEpocas } from "@/lib/actions/epocas";
import { CompeticaoDetalhe } from "@/components/competicoes/CompeticaoDetalhe";

export const metadata: Metadata = { title: "Detalhe da competição" };

/**
 * §23.11: dados da gestão de plantéis — só com ≥2 equipas próprias (com 0/1 a
 * tab «Equipas» mantém-se como antes e não há leituras adicionais).
 */
async function carregarPlanteis(competicao: CompeticaoDetalheTipo): Promise<{
  planteis: PlantelAtual[];
  atletasEscalao: AtletaEscalaoPlantel[];
  competicoesOrigem: { id: string; nome: string }[];
}> {
  const proprias = competicao.equipas.filter((e) => e.tipo === "PROPRIO");
  if (proprias.length < 2) return { planteis: [], atletasEscalao: [], competicoesOrigem: [] };

  const [resPlanteis, resAtletas, resComps] = await Promise.all([
    Promise.all(proprias.map((e) => obterPlantelEquipaCompeticao(e.id))),
    listarAtletas(competicao.escalaoId, competicao.epocaId),
    listarCompeticoes(competicao.escalaoId),
  ]);
  return {
    planteis: proprias.map((e, i) => {
      const r = resPlanteis[i];
      return {
        id: e.id,
        nome: e.nome,
        atletas: r.sucesso ? r.dados.map((a) => ({ atletaId: a.atletaId, nome: a.nome })) : [],
      };
    }),
    atletasEscalao: resAtletas.sucesso
      ? resAtletas.dados.map((a) => ({
          id: a.id,
          nome: a.nome,
          numero: a.participacaoContexto?.numero ?? null,
        }))
      : [],
    competicoesOrigem: resComps.sucesso
      ? resComps.dados
          .filter((c) => c.id !== competicao.id && c.equipas.length > 0)
          .map((c) => ({ id: c.id, nome: c.nome }))
      : [],
  };
}

export default async function CompeticaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [resComp, resClass, resEsc, resEpocas] = await Promise.all([
    obterCompeticao(id),
    obterClassificacao(id),
    listarEscaloes(),
    listarEpocas(),
  ]);

  if (!resComp.sucesso) notFound();
  const { planteis, atletasEscalao, competicoesOrigem } = await carregarPlanteis(resComp.dados);

  const classificacao: LinhaClassificacao[] = resClass.sucesso ? resClass.dados : [];
  const escaloes = resEsc.sucesso
    ? resEsc.dados.map((e) => ({ id: e.id, nome: e.nome }))
    : [];
  const epocas = resEpocas.sucesso
    ? resEpocas.dados.map((ep) => ({ id: ep.id, nome: ep.nome, ativa: ep.ativa }))
    : [];

  return (
    <div className="space-y-6">
      <Link
        href="/jogos/competicoes"
        className="flex w-fit items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Competições
      </Link>

      <CompeticaoDetalhe
        competicao={resComp.dados}
        classificacao={classificacao}
        escaloes={escaloes}
        epocas={epocas}
        planteis={planteis}
        atletasEscalao={atletasEscalao}
        competicoesOrigem={competicoesOrigem}
      />
    </div>
  );
}
