import Link from "next/link";
import { Plus, ClipboardList, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";
import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";
import { GerirCategoriasSituacaoDialog } from "@/components/modelo-jogo/GerirCategoriasSituacaoDialog";
import {
  listarCategoriasSituacao,
  listarEscaloesSituacoes,
  listarSituacoesJogo,
} from "@/lib/actions/situacoesJogo";
import { obterEscalaoDoUtilizador } from "@/lib/permissoes";
import { diagramaSchema } from "@/lib/schemas/exercicio";

/** Valor explícito de «Todos» (sem ele, a ausência de `escalaoId` aplica o default). */
const ESCALAO_TODOS = "todos";

function hrefSituacoes(f: { escalaoId?: string; categoria?: string; q?: string }): string {
  const params = new URLSearchParams({ separador: "situacoes" });
  if (f.escalaoId) params.set("escalaoId", f.escalaoId);
  if (f.categoria) params.set("categoria", f.categoria);
  if (f.q) params.set("q", f.q);
  return `/modelo-jogo?${params.toString()}`;
}

const CLASSE_FILTRO =
  "inline-flex min-h-11 items-center rounded-full border px-4 text-corpo-sec font-medium transition-colors";
const CLASSE_FILTRO_ATIVO = "border-primary bg-primary/5 text-primary";
const CLASSE_FILTRO_INATIVO = "border-cinza-200 bg-white text-cinza-600 hover:bg-cinza-50";

/**
 * Separador «Situações de jogo» de `/modelo-jogo` (bíblia §24.6). Filtros na URL
 * (`escalaoId`, `categoria`, `q`) aplicados em `listarSituacoesJogo`.
 */
export async function BibliotecaSituacoes({
  escalaoId: escalaoParam,
  categoria: categoriaParam,
  q: qParam,
}: {
  escalaoId?: string;
  categoria?: string;
  q?: string;
}) {
  const r = await listarEscaloesSituacoes();
  const escaloes = r.sucesso ? r.dados : [];
  if (escaloes.length === 0) {
    return (
      <EstadoVazio
        titulo="Sem acesso às situações de jogo"
        descricao="As situações de jogo são da equipa técnica de cada escalão."
      />
    );
  }

  // Escalão: só os acessíveis (RN-SJ-2); default = escalão do utilizador, senão «Todos».
  const idsAcessiveis = new Set(escaloes.map((e) => e.id));
  let escalaoId: string | undefined;
  if (escalaoParam === ESCALAO_TODOS) escalaoId = undefined;
  else if (escalaoParam && idsAcessiveis.has(escalaoParam)) escalaoId = escalaoParam;
  else {
    const doUtilizador = await obterEscalaoDoUtilizador();
    escalaoId = doUtilizador && idsAcessiveis.has(doUtilizador) ? doUtilizador : undefined;
  }
  const escalao = escaloes.find((e) => e.id === escalaoId);

  // Categoria: só com um escalão selecionado.
  const resCategorias = escalaoId ? await listarCategoriasSituacao(escalaoId) : null;
  const categorias = resCategorias?.sucesso ? resCategorias.dados : [];
  const categoriaId = categorias.some((c) => c.id === categoriaParam)
    ? categoriaParam
    : undefined;
  const q = qParam?.trim() ? qParam.trim().slice(0, 100) : undefined;

  const res = await listarSituacoesJogo({ escalaoId, categoriaId, q });
  if (!res.sucesso) return <EstadoErro mensagem={res.erro} />;
  const situacoes = res.dados;

  // Mantém «Todos» explícito nos links/pesquisa quando nenhum escalão está escolhido.
  const escalaoUrl = escalaoId ?? ESCALAO_TODOS;
  const hrefNova = escalaoId
    ? `/modelo-jogo/situacoes/nova?escalaoId=${escalaoId}`
    : "/modelo-jogo/situacoes/nova";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {escalao && (
          <GerirCategoriasSituacaoDialog
            escalaoId={escalao.id}
            escalaoNome={escalao.nome}
            categorias={categorias.map((c) => ({ id: c.id, nome: c.nome, ordem: c.ordem }))}
          />
        )}
        <Button asChild>
          <Link href={hrefNova}>
            <Plus className="h-4 w-4" />
            Nova situação
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        <nav aria-label="Filtrar por escalão" className="flex flex-wrap gap-2">
          <Link
            href={hrefSituacoes({ escalaoId: ESCALAO_TODOS, q })}
            aria-current={!escalaoId ? "page" : undefined}
            className={`${CLASSE_FILTRO} ${!escalaoId ? CLASSE_FILTRO_ATIVO : CLASSE_FILTRO_INATIVO}`}
          >
            Todos
          </Link>
          {escaloes.map((e) => (
            // Mudar de escalão limpa a categoria (§24.6).
            <Link
              key={e.id}
              href={hrefSituacoes({ escalaoId: e.id, q })}
              aria-current={escalaoId === e.id ? "page" : undefined}
              className={`${CLASSE_FILTRO} ${escalaoId === e.id ? CLASSE_FILTRO_ATIVO : CLASSE_FILTRO_INATIVO}`}
            >
              {e.nome}
            </Link>
          ))}
        </nav>

        {escalaoId && categorias.length > 0 && (
          <nav aria-label="Filtrar por categoria" className="flex flex-wrap gap-2">
            <Link
              href={hrefSituacoes({ escalaoId, q })}
              aria-current={!categoriaId ? "page" : undefined}
              className={`${CLASSE_FILTRO} ${!categoriaId ? CLASSE_FILTRO_ATIVO : CLASSE_FILTRO_INATIVO}`}
            >
              Todas as categorias
            </Link>
            {categorias.map((c) => (
              <Link
                key={c.id}
                href={hrefSituacoes({ escalaoId, categoria: c.id, q })}
                aria-current={categoriaId === c.id ? "page" : undefined}
                className={`${CLASSE_FILTRO} ${categoriaId === c.id ? CLASSE_FILTRO_ATIVO : CLASSE_FILTRO_INATIVO}`}
              >
                {c.nome}
              </Link>
            ))}
          </nav>
        )}

        <form action="/modelo-jogo" method="get" role="search" className="flex max-w-md gap-2">
          <input type="hidden" name="separador" value="situacoes" />
          <input type="hidden" name="escalaoId" value={escalaoUrl} />
          {categoriaId && <input type="hidden" name="categoria" value={categoriaId} />}
          <Input
            name="q"
            type="search"
            defaultValue={q ?? ""}
            maxLength={100}
            placeholder="Pesquisar por nome"
            aria-label="Pesquisar situações por nome"
          />
          <Button type="submit" variant="outline" size="icon" aria-label="Pesquisar">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {situacoes.length === 0 && (categoriaId || q) ? (
        <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
          Nenhuma situação corresponde aos filtros.
        </p>
      ) : situacoes.length === 0 ? (
        <EstadoVazio
          titulo="Ainda não há situações de jogo"
          descricao="Cria situações como «Saída de jogo 1» ou «Livre lateral 3» para as importares nos jogos."
          acao={
            <Button asChild>
              <Link href={hrefNova}>
                <Plus className="h-4 w-4" />
                Nova situação
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {situacoes.map((s) => {
            const diag = diagramaSchema.safeParse(s.diagrama);
            const animada = diag.success && (diag.data.passos?.length ?? 0) > 0;
            return (
              <Link
                key={s.id}
                href={`/modelo-jogo/situacoes/${s.id}`}
                className="flex flex-col gap-3 rounded-lg border border-cinza-200 bg-white p-4 shadow-card transition-all hover:border-azul-300 hover:shadow-md"
              >
                {diag.success ? (
                  <div className="overflow-hidden rounded">
                    <MiniaturaCampo
                      diagrama={diag.data}
                      formato={diag.data.campo}
                      largura={400}
                      className="w-full"
                    />
                  </div>
                ) : (
                  <div className="flex h-24 items-center justify-center rounded bg-cinza-50">
                    <ClipboardList className="h-8 w-8 text-cinza-300" />
                  </div>
                )}

                <p className="text-corpo font-semibold text-cinza-900 line-clamp-2">
                  {s.nome}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  {s.categoria && <Badge variant="secondary">{s.categoria.nome}</Badge>}
                  <Badge variant="outline">{s.escalao.nome}</Badge>
                  {animada && <Badge variant="outline">Animada</Badge>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
