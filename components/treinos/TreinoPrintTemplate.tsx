import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";
import {
  diagramaSchema,
  LABEL_PARTE_TREINO,
  PARTES_TREINO,
  type ParteTreinoValor,
} from "@/lib/schemas/exercicio";
import { LABEL_CATEGORIA_PRINCIPAL } from "@/lib/schemas/subcategoria";
import {
  LABEL_TIPO_SESSAO_TODOS,
  LABEL_MOMENTO_SEMANA,
  type MomentoSemana,
} from "@/lib/schemas/treino";
import { LABEL_PERIODO } from "@/lib/schemas/planeamento";
import { formatarDataHoraLisboa } from "@/lib/utils-datas";
import { agruparEmBlocos, letraColuna } from "@/lib/treino-paralelo";
import { calcularDuracaoExercicios } from "@/lib/utils/duracaoSessao";
import { cssPaginaPdf, temaPdf, variaveisTemaPdf, type TemaPdf } from "@/lib/pdf/tema";
import type { CSSProperties } from "react";
import type {
  TipoSessao,
  ParteTreino,
  CategoriaExercicioPrincipal,
  PeriodoEpoca,
} from "@prisma/client";

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
  /** §3.5: mesmo valor = exercícios em simultâneo (impressos lado a lado); null = sequencial. */
  grupoParalelo: string | null;
};

export type DadosImpressaoTreino = {
  clubeNome: string;
  clubeLogoUrl: string | null;
  /** Cor primária do clube (acento do documento, §12); ausente → laranja da marca. */
  clubeCorPrimaria?: string | null;
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

function formatarDataCurta(data: Date): string {
  return formatarDataHoraLisboa(data, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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
 * Cartão de um exercício na impressão. O `numero` é a posição GLOBAL do bloco
 * na sequência do treino (corre fase a fase — igual ao ecrã); num bloco em
 * paralelo leva a letra da coluna ("3a", "3b"). A fase não aparece como chip por
 * já ser o cabeçalho do grupo onde o cartão vive. Em paralelo (`emParalelo`), o
 * cartão ocupa meia largura e empilha o diagrama sobre o texto.
 */
function ItemExercicioImpressao({
  ex,
  numero,
  tema,
  emParalelo,
}: {
  ex: ExercicioImpressao;
  numero: string;
  tema: TemaPdf;
  emParalelo: boolean;
}) {
  return (
    <li className="relative flex break-inside-avoid gap-4 overflow-hidden rounded-lg border border-cinza-200 p-4 pl-5">
      {/* Filete lateral na cor do clube (elemento próprio: o print do globals
          força a cor das bordas `border-cinza-*`). */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: tema.acento }}
      />
      {/* Número de ordem (global, fase a fase) — texto claro/escuro AA sobre a cor do clube */}
      <div
        className="flex h-9 min-w-9 flex-shrink-0 px-1.5 items-center justify-center rounded-full text-corpo font-bold"
        style={{ backgroundColor: tema.solidoFundo, color: tema.solidoTexto }}
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
        <div
          className={`mt-3 flex flex-col gap-4 ${emParalelo ? "" : "sm:flex-row"}`}
        >
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
    clubeCorPrimaria,
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

  // §3.5: dentro de cada fase, linhas seguidas do mesmo `grupoParalelo` formam
  // um bloco impresso lado a lado. A numeração corre por bloco; num bloco em
  // paralelo, cada exercício leva a letra da coluna ("3a", "3b").
  const blocosDe = Object.fromEntries(
    ORDEM_FASES.map((fase) => [fase, agruparEmBlocos(grupos[fase])]),
  ) as Record<FaseKey, ExercicioImpressao[][]>;
  const numeroDe: Record<string, string> = {};
  let contador = 0;
  for (const fase of ORDEM_FASES)
    for (const bloco of blocosDe[fase]) {
      contador++;
      bloco.forEach((ex, i) => {
        numeroDe[ex.id] = bloco.length > 1 ? `${contador}${letraColuna(i)}` : `${contador}`;
      });
    }

  const fasesComExercicios = ORDEM_FASES.filter((fase) => grupos[fase].length > 0);

  // Acento do documento = cor do clube (§12 / docs/BRAND.md); a marca Mister
  // fica só no rodapé. As variáveis alimentam também o `[data-brand]` em print.
  const tema = temaPdf(clubeCorPrimaria);
  const estiloTema = variaveisTemaPdf(tema) as CSSProperties;

  return (
    <article
      className="mx-auto max-w-[820px] bg-white px-8 py-8 text-cinza-900 print:px-0 print:py-0"
      style={estiloTema}
    >
      {/* A4 + numeração de páginas na impressão (tokens partilhados com os
          relatórios dos analíticos — lib/pdf/tema.ts). */}
      <style dangerouslySetInnerHTML={{ __html: `@media print {${cssPaginaPdf()}}` }} />

      {/* Cabeçalho: faixa na cor do clube; identidade do clube (escudo, nome,
          escalão/época) à esquerda e a data da sessão à direita. Sem logótipo
          do produto — a marca Mister vive apenas no rodapé (§BRAND). */}
      <header className="mb-6 break-inside-avoid">
        <div className="h-[5px] rounded-full" style={{ backgroundColor: tema.acento }} />
        <div className="flex items-center justify-between gap-4 border-b border-cinza-200 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {clubeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clubeLogoUrl}
                alt={clubeNome}
                data-print-logo
                className="h-12 w-12 flex-shrink-0 object-contain"
              />
            ) : (
              <div
                aria-hidden
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl font-display text-subtitulo font-bold"
                style={{ backgroundColor: tema.solidoFundo, color: tema.solidoTexto }}
              >
                {(clubeNome.trim()[0] ?? "?").toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-display text-subtitulo font-bold text-cinza-900">
                {clubeNome}
              </p>
              <p className="text-legenda text-cinza-600">
                {escalaoNome}
                {epocaNome && ` · Época ${epocaNome}`}
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <p
              data-brand
              className="text-legenda font-bold uppercase tracking-wide"
              style={{ color: tema.acentoTexto }}
            >
              Data
            </p>
            <p className="text-corpo font-semibold text-cinza-900">
              {formatarDataCurta(data)}
            </p>
          </div>
        </div>
      </header>

      {/* Título da sessão */}
      <div className="mb-6">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-legenda font-semibold"
            style={{ backgroundColor: tema.solidoFundo, color: tema.solidoTexto }}
          >
            {LABEL_TIPO_SESSAO_TODOS[tipoSessao]}
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
          style={{ color: tema.acentoTexto }}
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
              {LABEL_TIPO_SESSAO_TODOS[tipoSessao]}
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
          style={{ color: tema.acentoTexto }}
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
                  <span
                    aria-hidden
                    className="h-3.5 w-1 rounded-full"
                    style={{ backgroundColor: tema.acento }}
                  />
                  <h3 className="text-legenda font-bold uppercase tracking-wide text-cinza-700">
                    {LABEL_FASE[fase]}
                  </h3>
                  <span className="rounded-full border border-cinza-300 px-2 py-0.5 text-legenda text-cinza-500">
                    {grupos[fase].length}
                  </span>
                  <span className="h-px flex-1 bg-cinza-200" aria-hidden />
                </div>

                <ol className="space-y-5">
                  {blocosDe[fase].map((bloco) => {
                    if (bloco.length === 1)
                      return (
                        <ItemExercicioImpressao
                          key={bloco[0].id}
                          ex={bloco[0]}
                          numero={numeroDe[bloco[0].id]}
                          tema={tema}
                          emParalelo={false}
                        />
                      );
                    // §3.5: bloco em paralelo — exercícios em simultâneo lado a lado;
                    // a duração do bloco é a do exercício mais longo.
                    const duracaoBloco = calcularDuracaoExercicios(bloco);
                    return (
                      <li key={bloco[0].id} className="break-inside-avoid space-y-2">
                        <p className="text-legenda font-semibold uppercase tracking-wide text-cinza-700">
                          Em simultâneo · {bloco.length} exercícios
                          {duracaoBloco > 0 && ` · ${duracaoBloco} min`}
                        </p>
                        <ol className="grid grid-cols-2 gap-3">
                          {bloco.map((ex) => (
                            <ItemExercicioImpressao
                              key={ex.id}
                              ex={ex}
                              numero={numeroDe[ex.id]}
                              tema={tema}
                              emParalelo
                            />
                          ))}
                        </ol>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rodapé — nunca forçar quebra antes (evita página em branco no fim) e
          manter íntegro na mesma página. */}
      <footer className="mt-8 flex break-inside-avoid items-center justify-between gap-4 border-t border-cinza-200 pt-4 text-legenda text-cinza-500 [break-before:avoid]">
        <span className="min-w-0 truncate">
          <span className="font-semibold text-cinza-700">{clubeNome}</span>
          {epocaNome && ` · Época ${epocaNome}`}
        </span>
        <span className="flex-shrink-0 text-right">
          Impresso em {formatarDataImpressao(new Date())} · Gerado com Mister
        </span>
      </footer>
    </article>
  );
}
