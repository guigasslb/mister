import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DiagramaReproduzivel } from "@/components/campo/DiagramaReproduzivel";
import { ApagarSituacaoButton } from "@/components/modelo-jogo/ApagarSituacaoButton";
import { obterSituacaoJogo } from "@/lib/actions/situacoesJogo";
import { diagramaSchema } from "@/lib/schemas/exercicio";
import { formatarDataHoraLisboa } from "@/lib/utils-datas";

export const metadata: Metadata = { title: "Situação de jogo" };

export default async function DetalheSituacaoJogoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obterSituacaoJogo(id);
  if (!res.sucesso) notFound();
  const s = res.dados;

  const diag = diagramaSchema.safeParse(s.diagrama);
  const diagrama = diag.success ? diag.data : null;
  const animada = (diagrama?.passos?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/modelo-jogo?separador=situacoes"
          className="flex items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Modelo de jogo
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/modelo-jogo/situacoes/${s.id}/editar`}>
              <Pencil className="h-4 w-4" />
              Editar
            </Link>
          </Button>
          <ApagarSituacaoButton id={s.id} nome={s.nome} />
        </div>
      </div>

      <div className="space-y-2">
        <h1>{s.nome}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {s.categoria && <Badge variant="secondary">{s.categoria.nome}</Badge>}
          <Badge variant="outline">{s.escalao.nome}</Badge>
          {animada && <Badge variant="outline">Animada</Badge>}
        </div>
      </div>

      {diagrama && (
        <section className="max-w-2xl rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <DiagramaReproduzivel diagrama={diagrama} formato={diagrama.campo} />
        </section>
      )}

      {s.descricao && (
        <section className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <h2 className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
            Descrição
          </h2>
          <p className="mt-1 text-corpo text-cinza-900 whitespace-pre-wrap">{s.descricao}</p>
        </section>
      )}

      <p className="text-legenda text-cinza-500">
        Atualizada em{" "}
        {formatarDataHoraLisboa(s.atualizadoEm, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </p>
    </div>
  );
}
