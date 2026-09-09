import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, LayoutGrid, ChevronRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { obterModeloJogo } from "@/lib/actions/modeloJogo";
import { listarJogos } from "@/lib/actions/jogos";
import { LABEL_MOMENTO } from "@/lib/schemas/modeloJogo";
import { diagramaSchema } from "@/lib/schemas/exercicio";
import { DiagramaModeloJogo } from "@/components/modelo-jogo/DiagramaModeloJogo";
import { ApagarModeloJogoButton } from "@/components/modelo-jogo/ApagarModeloJogoButton";
import { formatarDataHoraLisboa } from "@/lib/utils-datas";

function formatarData(data: Date): string {
  return formatarDataHoraLisboa(data, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const metadata: Metadata = { title: "Detalhe do modelo de jogo" };

export default async function DetalheModeloJogoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obterModeloJogo(id);
  if (!res.sucesso) notFound();
  const m = res.dados;

  const diag = diagramaSchema.safeParse(m.diagrama);
  const diagrama = diag.success ? diag.data : null;

  // Os quadros táticos pertencem a um Jogo (bíblia §3.6), não ao modelo. No
  // documento vivo mostramos o caminho para os jogos do escalão.
  const resJogos = m.escalaoId ? await listarJogos(m.escalaoId) : null;
  const jogos = resJogos?.sucesso ? resJogos.dados.slice(0, 5) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/modelo-jogo"
          className="flex items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Modelo de jogo
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/modelo-jogo/${m.id}/editar`}>
              <Pencil className="h-4 w-4" />
              Editar
            </Link>
          </Button>
          <ApagarModeloJogoButton id={m.id} nome={m.nome} />
        </div>
      </div>

      <div className="space-y-2">
        <h1>{m.nome}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{LABEL_MOMENTO[m.momento]}</Badge>
          {m.escalao ? (
            <Badge variant="outline">{m.escalao.nome}</Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <User className="h-3 w-3" />
              Metodologia portátil
            </Badge>
          )}
          {m.epoca && <Badge variant="outline">{m.epoca.nome}</Badge>}
        </div>
      </div>

      {m.principios && (
        <section className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <h2 className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
            Princípios
          </h2>
          <p className="mt-1 text-corpo text-cinza-900 whitespace-pre-wrap">
            {m.principios}
          </p>
        </section>
      )}

      <section className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
        <h2 className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
          Subprincípios
        </h2>
        {m.subprincipiosLista.length === 0 ? (
          <p className="mt-1 text-corpo-sec text-cinza-500">
            Sem subprincípios. Edita o modelo para os acrescentar.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {m.subprincipiosLista.map((s, i) => (
              <li key={`${s}-${i}`} className="flex gap-2 text-corpo text-cinza-900">
                <span aria-hidden className="text-primary">
                  •
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DiagramaModeloJogo
        modelo={{
          id: m.id,
          nome: m.nome,
          momento: m.momento,
          principios: m.principios,
          proprietario: m.proprietario,
          escalaoId: m.escalaoId,
          epocaId: m.epocaId,
          subprincipiosLista: m.subprincipiosLista,
        }}
        diagramaInicial={diagrama}
      />

      <section className="space-y-3 rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-subtitulo text-cinza-900">
          <LayoutGrid className="h-4 w-4 text-cinza-500" />
          Quadros táticos
        </h2>
        <p className="text-corpo-sec text-cinza-600">
          Os quadros táticos (gerais e de bola parada) são criados no contexto de um
          jogo específico e vivem no detalhe desse jogo.
        </p>

        {jogos.length > 0 ? (
          <ul className="divide-y divide-cinza-200 rounded-md border border-cinza-200">
            {jogos.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/jogos/${j.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-cinza-50"
                >
                  <span className="text-corpo-sec text-cinza-900">
                    {j.adversario}
                    <span className="ml-2 text-legenda text-cinza-500">
                      {formatarData(j.data)} · {j.casaFora === "CASA" ? "Casa" : "Fora"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-cinza-400" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-legenda text-cinza-500">
            {m.escalaoId
              ? "Sem jogos nesta época para este escalão."
              : "Este documento não está associado a um escalão."}
          </p>
        )}

        <Button asChild variant="outline" size="sm">
          <Link href={m.escalaoId ? `/jogos?escalaoId=${m.escalaoId}` : "/jogos"}>
            Ver jogos
          </Link>
        </Button>
      </section>
    </div>
  );
}
