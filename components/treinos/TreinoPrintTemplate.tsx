import { Logo } from "@/components/layout/Logo";
import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";
import { diagramaSchema, LABEL_PARTE_TREINO } from "@/lib/schemas/exercicio";
import { LABEL_CATEGORIA_PRINCIPAL } from "@/lib/schemas/subcategoria";
import { LABEL_TIPO_SESSAO } from "@/lib/schemas/treino";
import type { TipoSessao, ParteTreino, CategoriaExercicioPrincipal } from "@prisma/client";

/** Laranja da marca Mister (§12 / docs/BRAND.md) — acento dos cabeçalhos de secção. */
const MISTER_LARANJA = "#F0531E";

/** Exercício da sessão já resolvido (base + snapshot + overrides) para impressão. */
export type ExercicioImpressao = {
  id: string;
  ordem: number;
  nome: string;
  categoriaPrincipal: CategoriaExercicioPrincipal | null;
  parteTreino: ParteTreino | null;
  objetivo: string | null;
  descricao: string | null;
  duracaoMin: number | null;
  series: number | null;
  notas: string | null;
  /** Diagrama de campo (DiagramaCampo em JSON) ou null. */
  diagrama: unknown;
};

export type DadosImpressaoTreino = {
  clubeNome: string;
  epocaNome: string | null;
  escalaoNome: string;
  data: Date;
  tipoSessao: TipoSessao;
  local: string | null;
  objetivo: string | null;
  notas: string | null;
  duracaoTotalMin: number | null;
  exercicios: ExercicioImpressao[];
};

function formatarDataLonga(data: Date): string {
  const d = new Date(data);
  // `pt-PT` devolve o dia da semana/mês em minúsculas ("quinta-feira, 27 de
  // agosto de 2026"); capitalizamos apenas a primeira letra da frase para não
  // ficar "Quinta-Feira De Agosto" (evita depender do CSS `capitalize`).
  const dataStr = d.toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const horaStr = d.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dataCapitalizada = dataStr.charAt(0).toUpperCase() + dataStr.slice(1);
  return `${dataCapitalizada} às ${horaStr}`;
}

function formatarDataImpressao(data: Date): string {
  return new Date(data).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Miniatura do campo para impressão, ou nada se o exercício não tiver diagrama. */
function DiagramaImpressao({ diagrama, nome }: { diagrama: unknown; nome: string }) {
  const diag = diagramaSchema.safeParse(diagrama);
  if (!diag.success || diag.data.elementos.length === 0) return null;

  return (
    <div className="h-[120px] w-[240px] flex-shrink-0 overflow-hidden rounded-md border border-cinza-300 bg-white">
      <MiniaturaCampo
        diagrama={diag.data}
        largura={240}
        className="h-full w-full"
      />
      <p className="sr-only">{`Diagrama de campo do exercício ${nome}`}</p>
    </div>
  );
}

/** Item de metadados (duração, categoria, fase, séries) no cartão do exercício. */
function MetaExercicio({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-cinza-300 px-2.5 py-0.5 text-legenda text-cinza-700">
      <span className="font-semibold text-cinza-900">{rotulo}:</span>
      {valor}
    </span>
  );
}

/**
 * Template imprimível de uma sessão de treino completa (§ produto — "levar
 * impresso quando não há tablet"). Puro (server component): renderiza o
 * diagrama SVG sem depender de JavaScript no cliente, para sair fiel na
 * impressão / Guardar como PDF.
 */
export function TreinoPrintTemplate({ dados }: { dados: DadosImpressaoTreino }) {
  const {
    clubeNome,
    epocaNome,
    escalaoNome,
    data,
    tipoSessao,
    local,
    objetivo,
    notas,
    duracaoTotalMin,
    exercicios,
  } = dados;

  return (
    <article className="mx-auto max-w-[820px] bg-white px-8 py-8 text-cinza-900 print:px-0 print:py-0">
      {/* Cabeçalho: logótipo Mister (produto) + clube/época no contexto da página.
          §BRAND: o logótipo do clube nunca fica em lockup ao lado do produto. */}
      <header className="mb-6 flex items-start justify-between border-b-2 border-cinza-200 pb-5">
        <Logo variant="light" size={24} />
        <div className="text-right">
          <p className="font-display text-subtitulo font-semibold text-cinza-900">
            {clubeNome}
          </p>
          {epocaNome && <p className="text-legenda text-cinza-600">Época {epocaNome}</p>}
        </div>
      </header>

      {/* Título da sessão */}
      <div className="mb-6">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-legenda font-semibold text-white"
            style={{ backgroundColor: MISTER_LARANJA }}
          >
            {LABEL_TIPO_SESSAO[tipoSessao]}
          </span>
          <span className="rounded-full border border-cinza-300 px-2.5 py-0.5 text-legenda text-cinza-700">
            {escalaoNome}
          </span>
        </div>
        <h1 className="font-display text-titulo-pagina font-bold text-cinza-900">
          Plano de treino
        </h1>
        <p className="mt-1 text-corpo text-cinza-600">
          {formatarDataLonga(data)}
        </p>
      </div>

      {/* Resumo da sessão */}
      <section className="mb-8 break-inside-avoid rounded-lg border border-cinza-200 p-5">
        <h2
          data-brand
          className="mb-3 text-legenda font-bold uppercase tracking-wide"
          style={{ color: MISTER_LARANJA }}
        >
          Resumo da sessão
        </h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <div>
            <p className="text-legenda text-cinza-500">Duração total</p>
            <p className="text-corpo font-semibold text-cinza-900">
              {duracaoTotalMin ? `${duracaoTotalMin} min` : "—"}
            </p>
          </div>
          <div>
            <p className="text-legenda text-cinza-500">Exercícios</p>
            <p className="text-corpo font-semibold text-cinza-900">{exercicios.length}</p>
          </div>
          <div>
            <p className="text-legenda text-cinza-500">Tipo</p>
            <p className="text-corpo font-semibold text-cinza-900">
              {LABEL_TIPO_SESSAO[tipoSessao]}
            </p>
          </div>
          <div>
            <p className="text-legenda text-cinza-500">Local</p>
            <p className="text-corpo font-semibold text-cinza-900">{local ?? "—"}</p>
          </div>
        </div>
        {objetivo && (
          <div className="mt-4 border-t border-cinza-100 pt-3">
            <p className="text-legenda text-cinza-500">Objetivo da sessão</p>
            <p className="whitespace-pre-line text-corpo text-cinza-900">{objetivo}</p>
          </div>
        )}
        {notas && (
          <div className="mt-3 border-t border-cinza-100 pt-3">
            <p className="text-legenda text-cinza-500">Notas</p>
            <p className="whitespace-pre-line text-corpo text-cinza-900">{notas}</p>
          </div>
        )}
      </section>

      {/* Lista de exercícios (sequência numerada) */}
      <section>
        <h2
          data-brand
          className="mb-4 text-legenda font-bold uppercase tracking-wide"
          style={{ color: MISTER_LARANJA }}
        >
          Exercícios
        </h2>

        {exercicios.length === 0 ? (
          <p className="rounded-lg border border-dashed border-cinza-300 p-6 text-center text-corpo text-cinza-500">
            Esta sessão ainda não tem exercícios.
          </p>
        ) : (
          <ol className="space-y-5">
            {exercicios.map((ex, indice) => (
              <li
                key={ex.id}
                className="flex break-inside-avoid gap-4 rounded-lg border border-cinza-200 p-4"
              >
                {/* Número de ordem */}
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-corpo font-bold text-white"
                  style={{ backgroundColor: MISTER_LARANJA }}
                  aria-hidden
                >
                  {indice + 1}
                </div>

                {/* Conteúdo do exercício */}
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-subtitulo font-semibold text-cinza-900">
                    {ex.nome}
                  </h3>

                  {/* Metadados */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ex.duracaoMin != null && (
                      <MetaExercicio rotulo="Duração" valor={`${ex.duracaoMin} min`} />
                    )}
                    {ex.parteTreino && (
                      <MetaExercicio
                        rotulo="Fase"
                        valor={LABEL_PARTE_TREINO[ex.parteTreino]}
                      />
                    )}
                    {ex.categoriaPrincipal && (
                      <MetaExercicio
                        rotulo="Categoria"
                        valor={LABEL_CATEGORIA_PRINCIPAL[ex.categoriaPrincipal]}
                      />
                    )}
                    {ex.series != null && (
                      <MetaExercicio rotulo="Séries" valor={String(ex.series)} />
                    )}
                  </div>

                  {/* Corpo: diagrama + texto lado a lado */}
                  <div className="mt-3 flex flex-col gap-4 sm:flex-row">
                    <DiagramaImpressao diagrama={ex.diagrama} nome={ex.nome} />
                    <div className="min-w-0 flex-1 space-y-2">
                      {ex.objetivo && (
                        <div>
                          <p className="text-legenda font-semibold text-cinza-700">
                            Objetivo
                          </p>
                          <p className="whitespace-pre-line text-corpo-sec text-cinza-900">
                            {ex.objetivo}
                          </p>
                        </div>
                      )}
                      {ex.descricao && (
                        <div>
                          <p className="text-legenda font-semibold text-cinza-700">
                            Descrição
                          </p>
                          <p className="whitespace-pre-line text-corpo-sec text-cinza-900">
                            {ex.descricao}
                          </p>
                        </div>
                      )}
                      {ex.notas && (
                        <div>
                          <p className="text-legenda font-semibold text-cinza-700">
                            Notas
                          </p>
                          <p className="whitespace-pre-line text-corpo-sec text-cinza-900">
                            {ex.notas}
                          </p>
                        </div>
                      )}
                      {!ex.objetivo && !ex.descricao && !ex.notas && (
                        <p className="text-corpo-sec italic text-cinza-500">
                          Sem descrição.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Rodapé — nunca forçar quebra antes (evita página em branco no fim) e
          manter íntegro na mesma página. */}
      <footer className="mt-8 flex break-inside-avoid items-center justify-between border-t border-cinza-200 pt-4 text-legenda text-cinza-500 [break-before:avoid]">
        <span>{clubeNome}</span>
        <span>Impresso em {formatarDataImpressao(new Date())} · Mister</span>
      </footer>
    </article>
  );
}
