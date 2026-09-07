import { Logo } from "@/components/layout/Logo";
import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";
import {
  diagramaSchema,
  LABEL_PARTE_TREINO,
  PARTES_TREINO,
  type ParteTreinoValor,
} from "@/lib/schemas/exercicio";
import { LABEL_CATEGORIA_PRINCIPAL } from "@/lib/schemas/subcategoria";
import { LABEL_TIPO_SESSAO, LABEL_MOMENTO_SEMANA, type MomentoSemana } from "@/lib/schemas/treino";
import { LABEL_PERIODO } from "@/lib/schemas/planeamento";
import { formatarDataHoraLisboa } from "@/lib/utils-datas";
import type {
  TipoSessao,
  ParteTreino,
  CategoriaExercicioPrincipal,
  PeriodoEpoca,
} from "@prisma/client";

/** Laranja da marca Mister (§12 / docs/BRAND.md) — acento dos cabeçalhos de secção. */
const MISTER_LARANJA = "#F0531E";

// §3.5: ordem canónica das fases + bucket para exercícios sem fase (rows legadas).
// Idêntico ao ecrã (GestorExercicios): a impressão agrupa e numera os exercícios
// pela MESMA sequência de fases (Aquecimento → Parte principal → Jogo → Retorno à
// calma → Sem fase) e, dentro de cada fase, pela `ordem` da tabela de junção.
const SEM_FASE = "SEM_FASE" as const;
type FaseKey = ParteTreinoValor | typeof SEM_FASE;
const ORDEM_FASES: FaseKey[] = [...PARTES_TREINO, SEM_FASE];
const LABEL_FASE: Record<FaseKey, string> = {
  ...LABEL_PARTE_TREINO,
  [SEM_FASE]: "Sem fase",
};

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
  /** Nº de jogadores do exercício (§4.2.1), ou null. */
  numeroJogadores?: string | null;
  /** Espaço/dimensões do exercício (§4.2.1), ou null. */
  espaco?: string | null;
  /** Diagrama de campo (DiagramaCampo em JSON) ou null. */
  diagrama: unknown;
};

export type DadosImpressaoTreino = {
  clubeNome: string;
  clubeLogoUrl: string | null;
  epocaNome: string | null;
  escalaoNome: string;
  data: Date;
  tipoSessao: TipoSessao;
  local: string | null;
  objetivo: string | null;
  notas: string | null;
  duracaoTotalMin: number | null;
  // Periodização federativa (§8.9.1 / §16 Grupo B) — cabeçalho do plano de treino.
  microciclo?: number | null;
  mesociclo?: number | null;
  momentoSemana?: MomentoSemana | null;
  periodo?: PeriodoEpoca | null;
  // Presenças: presentes (PRESENTE/ATRASADO) sobre total de registos.
  nPresentes?: number | null;
  nRegistados?: number | null;
  exercicios: ExercicioImpressao[];
};

function formatarDataLonga(data: Date): string {
  // `pt-PT` devolve o dia da semana/mês em minúsculas ("quinta-feira, 27 de
  // agosto de 2026"); capitalizamos apenas a primeira letra da frase para não
  // ficar "Quinta-Feira De Agosto" (evita depender do CSS `capitalize`).
  const dataStr = formatarDataHoraLisboa(data, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const horaStr = formatarDataHoraLisboa(data, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dataCapitalizada = dataStr.charAt(0).toUpperCase() + dataStr.slice(1);
  return `${dataCapitalizada} às ${horaStr}`;
}

function formatarDataImpressao(data: Date): string {
  return formatarDataHoraLisboa(data, {
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

/** Chip de metadado federativo no cabeçalho (microciclo, mesociclo, período…). */
function MetaCabecalho({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-cinza-300 px-2.5 py-0.5 text-legenda text-cinza-700">
      <span className="font-semibold text-cinza-900">{rotulo}:</span>
      {valor}
    </span>
  );
}

/**
 * Cartão de um exercício na impressão. O `numero` é a posição GLOBAL do
 * exercício na sequência do treino (corre fase a fase — igual ao ecrã). A fase
 * não aparece como chip por já ser o cabeçalho do grupo onde o cartão vive.
 */
function ItemExercicioImpressao({
  ex,
  numero,
}: {
  ex: ExercicioImpressao;
  numero: number;
}) {
  return (
    <li className="flex break-inside-avoid gap-4 rounded-lg border border-cinza-200 p-4">
      {/* Número de ordem (global, fase a fase) */}
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-corpo font-bold text-white"
        style={{ backgroundColor: MISTER_LARANJA }}
        aria-hidden
      >
        {numero}
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
          {ex.categoriaPrincipal && (
            <MetaExercicio
              rotulo="Categoria"
              valor={LABEL_CATEGORIA_PRINCIPAL[ex.categoriaPrincipal]}
            />
          )}
          {ex.series != null && (
            <MetaExercicio rotulo="Séries" valor={String(ex.series)} />
          )}
          {ex.numeroJogadores && (
            <MetaExercicio rotulo="Nº jogadores" valor={ex.numeroJogadores} />
          )}
          {ex.espaco && <MetaExercicio rotulo="Espaço" valor={ex.espaco} />}
        </div>

        {/* Corpo: diagrama + texto lado a lado */}
        <div className="mt-3 flex flex-col gap-4 sm:flex-row">
          <DiagramaImpressao diagrama={ex.diagrama} nome={ex.nome} />
          <div className="min-w-0 flex-1 space-y-2">
            {ex.objetivo && (
              <div>
                <p className="text-legenda font-semibold text-cinza-700">Objetivo</p>
                <p className="whitespace-pre-line text-corpo-sec text-cinza-900">
                  {ex.objetivo}
                </p>
              </div>
            )}
            {ex.descricao && (
              <div>
                <p className="text-legenda font-semibold text-cinza-700">Descrição</p>
                <p className="whitespace-pre-line text-corpo-sec text-cinza-900">
                  {ex.descricao}
                </p>
              </div>
            )}
            {ex.notas && (
              <div>
                <p className="text-legenda font-semibold text-cinza-700">Notas</p>
                <p className="whitespace-pre-line text-corpo-sec text-cinza-900">
                  {ex.notas}
                </p>
              </div>
            )}
            {!ex.objetivo && !ex.descricao && !ex.notas && (
              <p className="text-corpo-sec italic text-cinza-500">Sem descrição.</p>
            )}
          </div>
        </div>
      </div>
    </li>
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
    clubeLogoUrl,
    epocaNome,
    escalaoNome,
    data,
    tipoSessao,
    local,
    objetivo,
    notas,
    duracaoTotalMin,
    microciclo,
    mesociclo,
    momentoSemana,
    periodo,
    nPresentes,
    nRegistados,
    exercicios,
  } = dados;

  // Cabeçalho federativo: só mostramos a linha se houver pelo menos um dado.
  const temPresencas = nRegistados != null && nRegistados > 0;
  const temPeriodizacao =
    microciclo != null ||
    mesociclo != null ||
    periodo != null ||
    momentoSemana != null ||
    temPresencas;

  // §3.5: agrupamento por fase — MESMA lógica do ecrã (GestorExercicios). Cada
  // fase preserva a `ordem` da tabela de junção; a numeração é global e corre
  // fase a fase, pela sequência canónica das fases. Só se renderizam grupos com
  // exercícios.
  const grupos: Record<FaseKey, ExercicioImpressao[]> = {
    AQUECIMENTO: [],
    PRINCIPAL: [],
    JOGO_REDUZIDO: [],
    RETORNO_CALMA: [],
    [SEM_FASE]: [],
  };
  for (const ex of exercicios) grupos[ex.parteTreino ?? SEM_FASE].push(ex);
  for (const fase of ORDEM_FASES) grupos[fase].sort((a, b) => a.ordem - b.ordem);

  const numeroDe: Record<string, number> = {};
  let contador = 0;
  for (const fase of ORDEM_FASES)
    for (const ex of grupos[fase]) numeroDe[ex.id] = ++contador;

  const fasesComExercicios = ORDEM_FASES.filter((fase) => grupos[fase].length > 0);

  return (
    <article className="mx-auto max-w-[820px] bg-white px-8 py-8 text-cinza-900 print:px-0 print:py-0">
      {/* Cabeçalho: logótipo Mister (produto) + clube/época no contexto da página.
          §BRAND: o logótipo do clube nunca fica em lockup ao lado do produto. */}
      <header className="mb-6 flex items-start justify-between gap-4 border-b-2 border-cinza-200 pb-5">
        <Logo variant="light" size={24} />
        <div className="flex items-center gap-3">
          <div className="min-w-0 text-right">
            <p className="truncate font-display text-subtitulo font-semibold text-cinza-900">
              {clubeNome}
            </p>
            {epocaNome && (
              <p className="text-legenda text-cinza-600">Época {epocaNome}</p>
            )}
          </div>
          {clubeLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clubeLogoUrl}
              alt={clubeNome}
              data-print-logo
              className="h-10 w-10 flex-shrink-0 object-contain"
            />
          )}
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

        {/* Metadados federativos (§8.9.1 / §16 Grupo B): periodização + presenças. */}
        {temPeriodizacao && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {microciclo != null && (
              <MetaCabecalho rotulo="Microciclo" valor={String(microciclo)} />
            )}
            {mesociclo != null && (
              <MetaCabecalho rotulo="Mesociclo" valor={String(mesociclo)} />
            )}
            {periodo != null && (
              <MetaCabecalho rotulo="Período" valor={LABEL_PERIODO[periodo]} />
            )}
            {momentoSemana != null && (
              <MetaCabecalho
                rotulo="Momento"
                valor={LABEL_MOMENTO_SEMANA[momentoSemana]}
              />
            )}
            {temPresencas && (
              <MetaCabecalho
                rotulo="Nº jogadores"
                valor={`${nPresentes ?? 0}/${nRegistados}`}
              />
            )}
          </div>
        )}
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

      {/* Exercícios agrupados por fase (§3.5) — MESMA sequência/agrupamento do
          ecrã do treino (GestorExercicios): Aquecimento → Parte principal → Jogo
          → Retorno à calma → Sem fase; dentro de cada fase, por `ordem`. */}
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
          <div className="space-y-6">
            {fasesComExercicios.map((fase) => (
              <div key={fase} className="space-y-3">
                {/* Cabeçalho da fase — evita ficar órfão no fim da página. */}
                <div className="flex items-center gap-2 [break-after:avoid]">
                  <h3 className="text-legenda font-bold uppercase tracking-wide text-cinza-700">
                    {LABEL_FASE[fase]}
                  </h3>
                  <span className="rounded-full border border-cinza-300 px-2 py-0.5 text-legenda text-cinza-500">
                    {grupos[fase].length}
                  </span>
                  <span className="h-px flex-1 bg-cinza-200" aria-hidden />
                </div>

                <ol className="space-y-5">
                  {grupos[fase].map((ex) => (
                    <ItemExercicioImpressao
                      key={ex.id}
                      ex={ex}
                      numero={numeroDe[ex.id]}
                    />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rodapé — nunca forçar quebra antes (evita página em branco no fim) e
          manter íntegro na mesma página. */}
      <footer className="mt-8 flex break-inside-avoid items-center justify-between gap-4 border-t border-cinza-200 pt-4 text-legenda text-cinza-500 [break-before:avoid]">
        <span className="min-w-0 truncate">{clubeNome}</span>
        <span className="flex-shrink-0 text-right">
          Impresso em {formatarDataImpressao(new Date())} · Mister
        </span>
      </footer>
    </article>
  );
}
