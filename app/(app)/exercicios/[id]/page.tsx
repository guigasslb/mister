import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { obterExercicio } from "@/lib/actions/exercicios";
import { LABEL_CATEGORIA, diagramaSchema } from "@/lib/schemas/exercicio";
import { CampoFutsal } from "@/components/campo/CampoFutsal";
import { CampoAnimado } from "@/components/campo/CampoAnimado";
import { UsoExercicioCard } from "@/components/analiticos/UsoExercicioCard";

export const metadata: Metadata = { title: "Detalhe do exercício" };

export default async function DetalheExercicioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obterExercicio(id);
  if (!res.sucesso) notFound();

  const e = res.dados;
  const diagramaParsed = diagramaSchema.safeParse(e.diagrama);
  const diagrama = diagramaParsed.success ? diagramaParsed.data : null;

  return (
    <div className="space-y-8">
      {/* Navegação */}
      <div className="flex items-center justify-between">
        <Link
          href="/exercicios"
          className="flex items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Exercícios
        </Link>
        <Button asChild variant="outline">
          <Link href={`/exercicios/${e.id}/editar`}>
            <Pencil className="h-4 w-4" />
            Editar
          </Link>
        </Button>
      </div>

      {/* Cabeçalho */}
      <div className="space-y-3">
        <h1 className="leading-tight">{e.nome}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {e.categoriaPrincipal && (
            <Badge variant="secondary">{LABEL_CATEGORIA[e.categoriaPrincipal]}</Badge>
          )}
          {e.duracaoMin && (
            <span className="flex items-center gap-1.5 text-corpo-sec text-cinza-600">
              <Clock className="h-4 w-4" />
              {e.duracaoMin} minutos
            </span>
          )}
        </div>
      </div>

      {/* Objetivo */}
      {e.objetivo && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
            Objetivo
          </p>
          <p className="mt-1 text-corpo text-cinza-900">{e.objetivo}</p>
        </div>
      )}

      {/* Descrição */}
      {e.descricao && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
            Descrição
          </p>
          <p className="mt-1 text-corpo text-cinza-900 whitespace-pre-wrap">{e.descricao}</p>
        </div>
      )}

      {/* Diagrama de campo */}
      {diagrama && diagrama.elementos.length > 0 && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-500">
            Diagrama
          </p>
          <div className="max-w-2xl">
            {diagrama.passos && diagrama.passos.length > 0 ? (
              <CampoAnimado diagrama={diagrama} />
            ) : (
              <CampoFutsal diagrama={diagrama} />
            )}
          </div>
        </div>
      )}

      {/* Uso na época (§8.15 / §10.2) */}
      <UsoExercicioCard exercicioId={id} />
    </div>
  );
}
