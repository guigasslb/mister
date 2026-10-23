import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SituacaoJogoForm } from "@/components/modelo-jogo/SituacaoJogoForm";
import { listarCategoriasSituacao, obterSituacaoJogo } from "@/lib/actions/situacoesJogo";

export const metadata: Metadata = { title: "Editar situação de jogo" };

export default async function EditarSituacaoJogoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obterSituacaoJogo(id);
  if (!res.sucesso) notFound();
  const s = res.dados;

  // Escalão imutável: as categorias são sempre as do escalão da situação.
  const resCategorias = await listarCategoriasSituacao(s.escalaoId);
  const categorias = resCategorias.sucesso
    ? resCategorias.dados.map((c) => ({ id: c.id, nome: c.nome }))
    : [];

  return (
    <div className="space-y-6">
      <Link
        href={`/modelo-jogo/situacoes/${s.id}`}
        className="flex w-fit items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        {s.nome}
      </Link>
      <h1>Editar situação</h1>
      <SituacaoJogoForm
        situacao={{
          id: s.id,
          nome: s.nome,
          descricao: s.descricao,
          categoriaId: s.categoriaId,
          escalao: s.escalao,
          diagrama: s.diagrama,
        }}
        escaloes={[]}
        categoriasIniciais={categorias}
      />
    </div>
  );
}
