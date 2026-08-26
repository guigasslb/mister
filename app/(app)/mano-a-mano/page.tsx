import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Swords, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listarCompeticoesManoMano,
  type CompeticaoManoManoResumo,
} from "@/lib/actions/mano-a-mano";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { EstadoErro } from "@/components/layout/EstadosUI";
import { CartaoCompeticao } from "@/components/mano-a-mano/CartaoCompeticao";

export const metadata: Metadata = { title: "Mano-a-Mano" };

function GrupoCompeticoes({
  titulo,
  icone: Icone,
  competicoes,
}: {
  titulo: string;
  icone: typeof Swords;
  competicoes: CompeticaoManoManoResumo[];
}) {
  if (competicoes.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-cinza-900">
        <Icone className="h-5 w-5 text-primary" />
        <h2 className="text-subtitulo">{titulo}</h2>
        <span className="text-corpo-sec text-cinza-500">({competicoes.length})</span>
      </div>
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {competicoes.map((c) => (
          <li key={c.id}>
            <CartaoCompeticao competicao={c} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function ManoManoPage({
  searchParams,
}: {
  searchParams: Promise<{ escalaoId?: string }>;
}) {
  const { escalaoId } = await searchParams;

  const [resComp, resEsc] = await Promise.all([
    listarCompeticoesManoMano(escalaoId ? { escalaoId } : undefined),
    listarEscaloes(),
  ]);

  if (!resComp.sucesso) return <EstadoErro mensagem={resComp.erro} />;

  const competicoes = resComp.dados;
  const escaloes = resEsc.sucesso ? resEsc.dados : [];

  const ligas = competicoes.filter((c) => c.tipo === "LIGA_ANUAL");
  const torneios = competicoes.filter((c) => c.tipo === "TORNEIO");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Mano-a-Mano</h1>
          <p className="mt-1 text-corpo-sec text-cinza-600">
            Ligas e torneios de duelos 1×1 entre atletas.
          </p>
        </div>
        <Button asChild>
          <Link href="/mano-a-mano/novo">
            <Plus className="h-4 w-4" />
            Nova competição
          </Link>
        </Button>
      </div>

      {escaloes.length > 0 && (
        <div className="-mb-px flex flex-wrap border-b border-cinza-200">
          <Link
            href="/mano-a-mano"
            className={`px-4 py-2.5 text-corpo font-medium border-b-2 transition-colors ${
              !escalaoId
                ? "border-primary text-primary"
                : "border-transparent text-cinza-600 hover:text-cinza-900"
            }`}
          >
            Todos
          </Link>
          {escaloes.map((e) => (
            <Link
              key={e.id}
              href={`/mano-a-mano?escalaoId=${e.id}`}
              className={`px-4 py-2.5 text-corpo font-medium border-b-2 transition-colors ${
                escalaoId === e.id
                  ? "border-primary text-primary"
                  : "border-transparent text-cinza-600 hover:text-cinza-900"
              }`}
            >
              {e.nome}
            </Link>
          ))}
        </div>
      )}

      {competicoes.length === 0 ? (
        <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
          {escalaoId
            ? "Sem competições Mano-a-Mano neste escalão."
            : "Ainda sem competições Mano-a-Mano nesta época. Cria a primeira para começar."}
        </p>
      ) : (
        <div className="space-y-8">
          <GrupoCompeticoes titulo="Ligas" icone={Swords} competicoes={ligas} />
          <GrupoCompeticoes titulo="Torneios" icone={Trophy} competicoes={torneios} />
        </div>
      )}
    </div>
  );
}
