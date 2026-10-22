import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EstadoVazio } from "@/components/layout/EstadosUI";
import { SituacaoJogoForm } from "@/components/modelo-jogo/SituacaoJogoForm";
import { listarCategoriasSituacao, listarEscaloesSituacoes } from "@/lib/actions/situacoesJogo";
import { obterSeccoes } from "@/lib/actions/seccoes";
import { escaloesComModalidade } from "@/lib/modalidade-escalao";

export const metadata: Metadata = { title: "Nova situação de jogo" };

export default async function NovaSituacaoJogoPage({
  searchParams,
}: {
  searchParams: Promise<{ escalaoId?: string }>;
}) {
  const { escalaoId: escalaoParam } = await searchParams;
  const [resAcessiveis, resSeccoes] = await Promise.all([
    listarEscaloesSituacoes(),
    obterSeccoes(),
  ]);
  const escaloes = escaloesComModalidade(
    resAcessiveis.sucesso ? resAcessiveis.dados : [],
    resSeccoes.sucesso ? resSeccoes.dados : [],
  );

  // Escalão inicial: o do link (se acessível) ou o único acessível.
  const escalaoInicialId =
    escaloes.find((e) => e.id === escalaoParam)?.id ??
    (escaloes.length === 1 ? escaloes[0].id : null);
  const resCategorias = escalaoInicialId
    ? await listarCategoriasSituacao(escalaoInicialId)
    : null;
  const categorias = resCategorias?.sucesso
    ? resCategorias.dados.map((c) => ({ id: c.id, nome: c.nome }))
    : [];

  return (
    <div className="space-y-6">
      <Link
        href="/modelo-jogo?separador=situacoes"
        className="flex w-fit items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Modelo de jogo
      </Link>
      <h1>Nova situação</h1>
      {escaloes.length === 0 ? (
        <EstadoVazio
          titulo="Sem acesso às situações de jogo"
          descricao="As situações de jogo são da equipa técnica de cada escalão."
        />
      ) : (
        <SituacaoJogoForm
          escaloes={escaloes}
          escalaoInicialId={escalaoInicialId}
          categoriasIniciais={categorias}
        />
      )}
    </div>
  );
}
