import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Clock, Backpack, Landmark, Sparkles, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listarExercicios } from "@/lib/actions/exercicios";
import { obterMembroAtual } from "@/lib/permissoes";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";
import { CampoPesquisa } from "@/components/layout/CampoPesquisa";
import {
  LABEL_CATEGORIA,
  CATEGORIAS,
  PARTES_TREINO,
  LABEL_PARTE_TREINO,
  diagramaSchema,
  type ParteTreinoValor,
} from "@/lib/schemas/exercicio";
import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";
import { InstalarBibliotecaButton } from "@/components/exercicios/InstalarBibliotecaButton";
import { FiltrosBiblioteca } from "@/components/exercicios/FiltrosBiblioteca";
import { PartilhaExercicioButton } from "@/components/exercicios/PartilhaExercicioButton";
import { FavoritosProvider } from "@/components/exercicios/FavoritosContext";
import {
  MostrarFavoritosToggle,
  FavoritosVazio,
} from "@/components/exercicios/MostrarFavoritosToggle";
import { ExercicioCardCliente } from "@/components/exercicios/ExercicioCardCliente";
import type { ExercicioBiblioteca } from "@/lib/actions/exercicios";
import type { CategoriaExercicioPrincipal } from "@prisma/client";

type Aba = "pessoal" | "clube";

/** Reconstrói a query string preservando os filtros ao mudar de aba. */
function href(aba: Aba, filtros: { parte?: string; categoria?: string; q?: string }): string {
  const params = new URLSearchParams();
  if (aba === "clube") params.set("bib", "clube");
  if (filtros.parte) params.set("parte", filtros.parte);
  if (filtros.categoria) params.set("categoria", filtros.categoria);
  if (filtros.q) params.set("q", filtros.q);
  const qs = params.toString();
  return qs ? `/exercicios?${qs}` : "/exercicios";
}

function CartaoExercicio({
  exercicio,
  acao,
}: {
  exercicio: ExercicioBiblioteca;
  acao?: React.ReactNode;
}) {
  const diag = diagramaSchema.safeParse(exercicio.diagrama);
  const temDiagrama = diag.success && diag.data.elementos.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-cinza-200 bg-white p-4 shadow-card transition-all hover:border-azul-300 hover:shadow-md">
      <Link
        href={`/exercicios/${exercicio.id}`}
        className="flex flex-1 flex-col gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {temDiagrama && diag.success && (
          <div className="overflow-hidden rounded">
            <MiniaturaCampo diagrama={diag.data} largura={400} className="w-full" />
          </div>
        )}
        <div className="flex items-start justify-between gap-2 pr-24">
          <p className="line-clamp-2 flex-1 text-corpo font-semibold text-cinza-900">
            {exercicio.nome}
          </p>
          {exercicio.duracaoMin && (
            <span className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-legenda text-cinza-500">
              <Clock className="h-3.5 w-3.5" />
              {exercicio.duracaoMin} min
            </span>
          )}
        </div>
        {exercicio.objetivo && (
          <p className="line-clamp-2 text-corpo-sec text-cinza-600">{exercicio.objetivo}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          {exercicio.categoriaPrincipal ? (
            <Badge variant="secondary">{LABEL_CATEGORIA[exercicio.categoriaPrincipal]}</Badge>
          ) : (
            <Badge variant="outline" className="text-cinza-400">
              Sem categoria
            </Badge>
          )}
          {exercicio.parteTreino && (
            <Badge variant="outline">{LABEL_PARTE_TREINO[exercicio.parteTreino]}</Badge>
          )}
          {exercicio.origem === "PESSOAL" && exercicio.naBibliotecaDoClube && (
            <Badge variant="outline" className="gap-1 text-cinza-500">
              <Landmark className="h-3 w-3" />
              No clube
            </Badge>
          )}
          {exercicio.origemSeed && (
            <Badge variant="outline" className="gap-1 text-cinza-500">
              <Sparkles className="h-3 w-3" />
              Curado
            </Badge>
          )}
        </div>
        {exercicio.criador && (
          <p className="text-right text-[10px] text-cinza-400">
            Criado por {exercicio.criador.nome}
          </p>
        )}
      </Link>
      {acao && <div className="flex flex-wrap gap-2 border-t border-cinza-200 pt-3">{acao}</div>}
    </div>
  );
}

export const metadata: Metadata = { title: "Exercícios" };

export default async function ExerciciosPage({
  searchParams,
}: {
  searchParams: Promise<{ bib?: string; parte?: string; categoria?: string; q?: string }>;
}) {
  const {
    bib,
    parte: parteParam,
    categoria: categoriaParam,
    q,
  } = await searchParams;

  const aba: Aba = bib === "clube" ? "clube" : "pessoal";
  const parteTreino = PARTES_TREINO.includes(parteParam as ParteTreinoValor)
    ? (parteParam as ParteTreinoValor)
    : undefined;
  const categoria = CATEGORIAS.includes(categoriaParam as CategoriaExercicioPrincipal)
    ? (categoriaParam as CategoriaExercicioPrincipal)
    : undefined;

  // F3: a biblioteca visível é 🎒 pessoal ∪ 🏛️ clube; filtros e pesquisa no servidor.
  const [res, membro] = await Promise.all([
    listarExercicios(parteTreino, categoria, q),
    obterMembroAtual(),
  ]);
  if (!res.sucesso) return <EstadoErro mensagem={res.erro} />;

  const utilizadorId = membro?.utilizadorId ?? null;
  const podeGerirBibliotecaClube = membro?.capacidades.includes("EXERCICIOS_GERIR") ?? false;

  // 🎒 Pessoal: exercícios do próprio (portáteis). 🏛️ Clube: tudo o que está na
  // biblioteca do clube ativo — inclui os pessoais que o próprio partilhou lá.
  const pessoais = res.dados.filter((e) => e.origem === "PESSOAL");
  const doClube = res.dados.filter((e) => e.naBibliotecaDoClube);
  const lista = aba === "pessoal" ? pessoais : doClube;

  const filtros = { parte: parteTreino, categoria, q };
  const temFiltros = Boolean(parteTreino || categoria || q);

  const abas: { chave: Aba; label: string; icone: typeof Backpack; total: number }[] = [
    { chave: "pessoal", label: "Pessoal", icone: Backpack, total: pessoais.length },
    { chave: "clube", label: "Clube", icone: Landmark, total: doClube.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Exercícios</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/treinos/templates">
              <LayoutTemplate className="h-4 w-4" />
              Templates de sessão
            </Link>
          </Button>
          <Button asChild>
            <Link href="/exercicios/novo">
              <Plus className="h-4 w-4" />
              Novo exercício
            </Link>
          </Button>
        </div>
      </div>

      {/* Abas: 🎒 biblioteca pessoal · 🏛️ biblioteca do clube */}
      <div
        role="tablist"
        aria-label="Bibliotecas de exercícios"
        className="-mb-px flex overflow-x-auto border-b border-cinza-200"
      >
        {abas.map(({ chave, label, icone: Icone, total }) => {
          const ativa = aba === chave;
          return (
            <Link
              key={chave}
              href={href(chave, filtros)}
              role="tab"
              aria-selected={ativa}
              className={`flex min-h-[44px] items-center gap-2 whitespace-nowrap px-4 py-2.5 text-corpo font-medium border-b-2 transition-colors ${
                ativa
                  ? "border-primary text-primary"
                  : "border-transparent text-cinza-600 hover:text-cinza-900"
              }`}
            >
              <Icone className="h-4 w-4" />
              {label}
              <span className="text-legenda text-cinza-400">({total})</span>
            </Link>
          );
        })}
      </div>

      <p className="text-corpo-sec text-cinza-600">
        {aba === "pessoal"
          ? "🎒 A tua biblioteca pessoal. Leva-la contigo se mudares de clube."
          : "🏛️ Biblioteca do clube, partilhada com toda a equipa técnica."}
      </p>

      <FavoritosProvider>
        <div className="flex flex-wrap items-end gap-4">
          <FiltrosBiblioteca parteTreino={parteTreino} categoria={categoria} />
          <div className="space-y-1.5">
            <CampoPesquisa placeholder="Pesquisar exercício por nome…" />
          </div>
          <MostrarFavoritosToggle />
        </div>

        {lista.length === 0 ? (
          <EstadoVazio
            titulo={
              temFiltros
                ? "Nenhum exercício corresponde aos filtros"
                : aba === "pessoal"
                  ? "A tua biblioteca pessoal está vazia"
                  : "A biblioteca do clube está vazia"
            }
            descricao={
              temFiltros
                ? "Ajusta os filtros ou a pesquisa para veres mais resultados."
                : aba === "pessoal"
                  ? "Cria o primeiro exercício para começares a construir a tua biblioteca portátil."
                  : "Instala a biblioteca curada de arranque ou partilha exercícios pessoais no clube."
            }
            acao={
              temFiltros ? (
                <Button asChild variant="outline">
                  <Link href={href(aba, {})}>Limpar filtros</Link>
                </Button>
              ) : aba === "pessoal" ? (
                <Button asChild>
                  <Link href="/exercicios/novo">
                    <Plus className="h-4 w-4" />
                    Criar exercício
                  </Link>
                </Button>
              ) : podeGerirBibliotecaClube ? (
                <InstalarBibliotecaButton variant="default" />
              ) : undefined
            }
          />
        ) : (
          <>
            <FavoritosVazio />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {lista.map((e) => {
                // Só o autor pode alternar a partilha (regra do backend, secção 3.3).
                const podeAlternarPartilha =
                  podeGerirBibliotecaClube &&
                  e.proprietario === "TREINADOR" &&
                  e.autorId === utilizadorId;

                // Editar segue as regras do backend: um exercício 🎒 pessoal só é
                // editável pelo autor; um 🏛️ do clube por quem gere a biblioteca.
                const podeEditar =
                  e.proprietario === "TREINADOR"
                    ? e.autorId === utilizadorId
                    : podeGerirBibliotecaClube;
                // Duplicar cria um exercício pessoal → exige EXERCICIOS_GERIR.
                const podeDuplicar = podeGerirBibliotecaClube;

                return (
                  <ExercicioCardCliente
                    key={e.id}
                    exercicioId={e.id}
                    podeEditar={podeEditar}
                    podeDuplicar={podeDuplicar}
                  >
                    <CartaoExercicio
                      exercicio={e}
                      acao={
                        podeAlternarPartilha ? (
                          <PartilhaExercicioButton
                            exercicioId={e.id}
                            partilhado={e.naBibliotecaDoClube}
                          />
                        ) : undefined
                      }
                    />
                  </ExercicioCardCliente>
                );
              })}
            </div>
            <p className="text-corpo-sec text-cinza-600">
              {lista.length} {lista.length === 1 ? "exercício" : "exercícios"}
            </p>
          </>
        )}
      </FavoritosProvider>
    </div>
  );
}
