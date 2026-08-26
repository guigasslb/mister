import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  obterCompeticaoManoMano,
  obterClassificacaoManoMano,
} from "@/lib/actions/mano-a-mano";
import { TabelaClassificacao } from "@/components/mano-a-mano/TabelaClassificacao";

export const metadata: Metadata = { title: "Classificação · Mano-a-Mano" };

export default async function ClassificacaoManoManoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [resComp, resClass] = await Promise.all([
    obterCompeticaoManoMano(id),
    obterClassificacaoManoMano(id),
  ]);

  if (!resComp.sucesso) notFound();

  const competicao = resComp.dados;
  const classificacao = resClass.sucesso ? resClass.dados : [];

  return (
    <div className="space-y-6">
      <Link
        href={`/mano-a-mano/${id}`}
        className="flex w-fit items-center gap-1 text-corpo-sec text-cinza-600 transition-colors hover:text-cinza-900"
      >
        <ChevronLeft className="h-4 w-4" />
        {competicao.nome}
      </Link>

      <div>
        <h1>Classificação</h1>
        <p className="mt-1 text-corpo-sec text-cinza-600">
          {competicao.nome}
          {competicao.escalao ? ` · ${competicao.escalao.nome}` : ""}
        </p>
      </div>

      <TabelaClassificacao linhas={classificacao} />
    </div>
  );
}
