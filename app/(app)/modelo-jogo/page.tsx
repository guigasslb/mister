import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ClipboardList, ListChecks, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listarModelosJogo } from "@/lib/actions/modeloJogo";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";
import { LABEL_MOMENTO, MOMENTOS, lerSubprincipios } from "@/lib/schemas/modeloJogo";
import { diagramaSchema } from "@/lib/schemas/exercicio";
import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";
import { FiltroEscalaoModelo } from "@/components/modelo-jogo/FiltroEscalaoModelo";
import { BibliotecaSituacoes } from "@/components/modelo-jogo/BibliotecaSituacoes";
import type { MomentoJogo } from "@prisma/client";

function hrefMomento(m: MomentoJogo | null, escalaoId?: string): string {
  const params = new URLSearchParams();
  if (escalaoId) params.set("escalaoId", escalaoId);
  if (m) params.set("momento", m);
  const qs = params.toString();
  return qs ? `/modelo-jogo?${qs}` : "/modelo-jogo";
}

export const metadata: Metadata = { title: "Modelo de jogo" };

// §24.6: separadores da página (links). Sem `separador` → «Princípios».
const CLASSE_SEPARADOR =
  "px-4 py-2.5 text-corpo font-medium border-b-2 transition-colors";

function Separadores({ situacoes }: { situacoes: boolean }) {
  return (
    <nav aria-label="Separadores do modelo de jogo" className="-mb-px flex flex-wrap border-b border-cinza-200">
      <Link
        href="/modelo-jogo"
        aria-current={!situacoes ? "page" : undefined}
        className={`${CLASSE_SEPARADOR} ${!situacoes ? "border-primary text-primary" : "border-transparent text-cinza-600 hover:text-cinza-900"}`}
      >
        Princípios
      </Link>
      <Link
        href="/modelo-jogo?separador=situacoes"
        aria-current={situacoes ? "page" : undefined}
        className={`${CLASSE_SEPARADOR} ${situacoes ? "border-primary text-primary" : "border-transparent text-cinza-600 hover:text-cinza-900"}`}
      >
        Situações de jogo
      </Link>
    </nav>
  );
}

export default async function ModeloJogoPage({
  searchParams,
}: {
  searchParams: Promise<{
    momento?: string;
    escalaoId?: string;
    separador?: string;
    categoria?: string;
    q?: string;
  }>;
}) {
  const { momento: momentoParam, escalaoId, separador, categoria, q } = await searchParams;

  if (separador === "situacoes") {
    return (
      <div className="space-y-6">
        <h1>Modelo de jogo</h1>
        <Separadores situacoes />
        <BibliotecaSituacoes escalaoId={escalaoId} categoria={categoria} q={q} />
      </div>
    );
  }

  const momento = MOMENTOS.includes(momentoParam as MomentoJogo)
    ? (momentoParam as MomentoJogo)
    : undefined;

  const [resEscaloes, res] = await Promise.all([
    listarEscaloes(),
    listarModelosJogo(escalaoId, momento),
  ]);

  if (!res.sucesso) return <EstadoErro mensagem={res.erro} />;
  const modelos = res.dados;
  const escaloes = resEscaloes.sucesso ? resEscaloes.dados : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Modelo de jogo</h1>
        <Button asChild>
          <Link href="/modelo-jogo/novo">
            <Plus className="h-4 w-4" />
            Nova representação
          </Link>
        </Button>
      </div>

      <Separadores situacoes={false} />

      {/* Tabs por momento de jogo */}
      <div className="-mb-px flex flex-wrap border-b border-cinza-200">
        <Link
          href={hrefMomento(null, escalaoId)}
          className={`px-4 py-2.5 text-corpo font-medium border-b-2 transition-colors ${!momento ? "border-primary text-primary" : "border-transparent text-cinza-600 hover:text-cinza-900"}`}
        >
          Todos
        </Link>
        {MOMENTOS.map((m) => (
          <Link
            key={m}
            href={hrefMomento(m, escalaoId)}
            className={`whitespace-nowrap px-4 py-2.5 text-corpo font-medium border-b-2 transition-colors ${momento === m ? "border-primary text-primary" : "border-transparent text-cinza-600 hover:text-cinza-900"}`}
          >
            {LABEL_MOMENTO[m]}
          </Link>
        ))}
      </div>

      {escaloes.length > 0 && (
        <div className="space-y-1.5">
          <FiltroEscalaoModelo
            escaloes={escaloes}
            escalaoId={escalaoId}
            momento={momento}
          />
          {escalaoId && (
            <p className="text-legenda text-cinza-500">
              Inclui também a metodologia genérica (sem escalão).
            </p>
          )}
        </div>
      )}

      {modelos.length === 0 ? (
        <EstadoVazio
          titulo="Define o teu modelo de jogo"
          descricao="Cria representações por momento (organização, transições, bolas paradas)."
          acao={
            <Button asChild>
              <Link href="/modelo-jogo/novo">
                <Plus className="h-4 w-4" />
                Criar
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {modelos.map((m) => {
            const diag = diagramaSchema.safeParse(m.diagrama);
            const temDiagrama = diag.success && diag.data.elementos.length > 0;
            const subprincipios = lerSubprincipios(m.subprincipios);
            return (
              <Link
                key={m.id}
                href={`/modelo-jogo/${m.id}`}
                className="flex flex-col gap-3 rounded-lg border border-cinza-200 bg-white p-4 shadow-card transition-all hover:border-azul-300 hover:shadow-md"
              >
                {temDiagrama && diag.success ? (
                  <div className="overflow-hidden rounded">
                    <MiniaturaCampo diagrama={diag.data} largura={400} className="w-full" />
                  </div>
                ) : (
                  <div className="flex h-24 items-center justify-center rounded bg-cinza-50">
                    <ClipboardList className="h-8 w-8 text-cinza-300" />
                  </div>
                )}

                <p className="text-corpo font-semibold text-cinza-900 line-clamp-2">
                  {m.nome}
                </p>

                {m.principios && (
                  <p className="text-corpo-sec text-cinza-600 line-clamp-2">
                    {m.principios}
                  </p>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{LABEL_MOMENTO[m.momento]}</Badge>
                  {m.escalao ? (
                    <Badge variant="outline">{m.escalao.nome}</Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <User className="h-3 w-3" />
                      Metodologia
                    </Badge>
                  )}
                  {m.epoca && <Badge variant="outline">{m.epoca.nome}</Badge>}
                  {subprincipios.length > 0 && (
                    <Badge variant="outline" className="gap-1">
                      <ListChecks className="h-3 w-3" />
                      {subprincipios.length}
                    </Badge>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
