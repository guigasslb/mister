// ─────────────────────────────────────────────────────────────────────────────
// Calendário editável das competições (§8.11 Passo 3 e separador «Confrontos»).
//
// Funções PURAS (sem Prisma, sem I/O, sem React): edição do calendário no wizard
// (trocar, adicionar/remover confrontos e jornadas, mudar de jornada, reordenar),
// validação inline, avisos por jornada e conversão para o payload de
// `criarCompeticaoCompleta`. Todas devolvem uma lista NOVA (imutáveis).
// ─────────────────────────────────────────────────────────────────────────────

/** Confronto do calendário em edição (inputs nativos de data/hora em texto). */
export type JogoCalendario = {
  /** Id local estável (para `key` e foco); não vai no payload. */
  chave: string;
  equipaCasa: string; // "" = por escolher
  equipaFora: string; // "" = por escolher
  ronda: number;
  data: string; // "YYYY-MM-DD" | ""
  hora: string; // "HH:MM" | ""
};

/** Confronto como sai do gerador (`gerarLiga`/`gerarBracket` de lib/quadro-cliente). */
export type ConfrontoGerado = { equipaCasa: string; equipaFora: string; ronda: number };

/** Item do payload `jogos` de `criarCompeticaoCompleta` (= `jogoAgendadoSchema`). */
export type JogoPayload = {
  equipaCasa: string;
  equipaFora: string;
  ronda: number;
  dataHora: Date | null;
};

/** Aviso não bloqueante: a equipa joga mais de uma vez na mesma jornada. */
export type AvisoJornada = { ronda: number; equipa: string };

export type ValidacaoCalendario = {
  /** Erro (bloqueante) por `chave` do confronto. */
  erros: Map<string, string>;
  avisos: AvisoJornada[];
};

export const ERRO_CASA_POR_ESCOLHER = "Escolhe a equipa da casa.";
export const ERRO_FORA_POR_ESCOLHER = "Escolhe a equipa visitante.";
export const ERRO_EQUIPA_FORA_DA_LISTA = "Esta equipa já não está na lista de participantes.";
export const ERRO_MESMA_EQUIPA = "A equipa da casa e a visitante têm de ser diferentes.";

const norm = (s: string) => s.trim().toLowerCase();

let sequenciaChave = 0;

/** Nova chave local única (no ciclo de vida da página). */
function novaChave(): string {
  sequenciaChave += 1;
  return `cf-${sequenciaChave}`;
}

/** Converte o quadro gerado em confrontos editáveis (sem data/hora), pela mesma ordem. */
export function deGerados(gerados: ConfrontoGerado[]): JogoCalendario[] {
  return gerados.map((g) => ({
    chave: novaChave(),
    equipaCasa: g.equipaCasa,
    equipaFora: g.equipaFora,
    ronda: g.ronda,
    data: "",
    hora: "",
  }));
}

/** Maior jornada em uso (0 sem confrontos). */
export function rondaMaxima(jogos: { ronda: number }[]): number {
  return jogos.reduce((max, j) => Math.max(max, j.ronda), 0);
}

/** Inverte casa e visitante do confronto. */
export function trocar(jogos: JogoCalendario[], chave: string): JogoCalendario[] {
  return jogos.map((j) =>
    j.chave === chave ? { ...j, equipaCasa: j.equipaFora, equipaFora: j.equipaCasa } : j,
  );
}

/** Altera equipas e/ou data/hora de um confronto. */
export function atualizarConfronto(
  jogos: JogoCalendario[],
  chave: string,
  patch: Partial<Pick<JogoCalendario, "equipaCasa" | "equipaFora" | "data" | "hora">>,
): JogoCalendario[] {
  return jogos.map((j) => (j.chave === chave ? { ...j, ...patch } : j));
}

/** Acrescenta um confronto vazio no fim da jornada indicada. */
export function adicionarConfronto(jogos: JogoCalendario[], ronda: number): JogoCalendario[] {
  return [
    ...jogos,
    { chave: novaChave(), equipaCasa: "", equipaFora: "", ronda, data: "", hora: "" },
  ];
}

/** Cria uma jornada nova (máx + 1) com um confronto vazio. */
export function adicionarRonda(jogos: JogoCalendario[]): JogoCalendario[] {
  return adicionarConfronto(jogos, rondaMaxima(jogos) + 1);
}

/** Remove o confronto (a jornada deixa de existir se ficar vazia). */
export function removerConfronto(jogos: JogoCalendario[], chave: string): JogoCalendario[] {
  return jogos.filter((j) => j.chave !== chave);
}

/**
 * Muda o confronto de jornada: vai para o FIM da jornada de destino. Com a mesma
 * jornada nada muda.
 */
export function mudarRonda(
  jogos: JogoCalendario[],
  chave: string,
  ronda: number,
): JogoCalendario[] {
  const atual = jogos.find((j) => j.chave === chave);
  if (!atual || atual.ronda === ronda) return jogos;
  return [...jogos.filter((j) => j.chave !== chave), { ...atual, ronda }];
}

/**
 * Sobe (-1) ou desce (+1) o confronto dentro da sua jornada (troca com o vizinho da
 * mesma jornada). No 1.º/último da jornada nada muda.
 */
export function moverNaJornada(
  jogos: JogoCalendario[],
  chave: string,
  direcao: -1 | 1,
): JogoCalendario[] {
  const indice = jogos.findIndex((j) => j.chave === chave);
  if (indice < 0) return jogos;
  const ronda = jogos[indice].ronda;
  let vizinho = indice + direcao;
  while (vizinho >= 0 && vizinho < jogos.length && jogos[vizinho].ronda !== ronda) {
    vizinho += direcao;
  }
  if (vizinho < 0 || vizinho >= jogos.length) return jogos;
  const copia = [...jogos];
  [copia[indice], copia[vizinho]] = [copia[vizinho], copia[indice]];
  return copia;
}

/** Confrontos agrupados por jornada (asc), mantendo a ordem da lista dentro de cada uma. */
export function agruparPorRonda(jogos: JogoCalendario[]): [number, JogoCalendario[]][] {
  const mapa = new Map<number, JogoCalendario[]>();
  for (const j of jogos) {
    const lista = mapa.get(j.ronda) ?? [];
    lista.push(j);
    mapa.set(j.ronda, lista);
  }
  return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * Equipas que jogam mais de uma vez na mesma jornada (aviso âmbar, não bloqueia —
 * pode ser jornada dupla/adiada). Partilhado pelo wizard e pelo separador
 * «Confrontos» (onde `ronda` pode ser `null` = «Sem jornada», ignorado). Um aviso
 * por (jornada, equipa), por jornada asc e pela ordem de aparecimento.
 */
export function avisosJornada(
  confrontos: { ronda: number | null; equipaCasa: string; equipaFora: string }[],
): AvisoJornada[] {
  const contagem = new Map<number, Map<string, { nome: string; n: number }>>();
  for (const c of confrontos) {
    if (c.ronda === null) continue;
    const porEquipa = contagem.get(c.ronda) ?? new Map<string, { nome: string; n: number }>();
    for (const nome of [c.equipaCasa, c.equipaFora]) {
      const chave = norm(nome);
      if (chave === "") continue;
      const atual = porEquipa.get(chave);
      porEquipa.set(chave, { nome: atual?.nome ?? nome.trim(), n: (atual?.n ?? 0) + 1 });
    }
    contagem.set(c.ronda, porEquipa);
  }
  const avisos: AvisoJornada[] = [];
  for (const [ronda, porEquipa] of [...contagem.entries()].sort((a, b) => a[0] - b[0])) {
    for (const { nome, n } of porEquipa.values()) {
      if (n > 1) avisos.push({ ronda, equipa: nome });
    }
  }
  return avisos;
}

/**
 * Validação do calendário: um erro (bloqueante) por confronto, pela ordem
 * casa por escolher → visitante por escolher → equipa fora da lista → casa = fora;
 * mais os avisos por jornada. Comparação de nomes sem maiúsculas/espaços (igual ao
 * servidor em `criarCompeticaoCompleta`).
 */
export function validarCalendario(
  jogos: JogoCalendario[],
  participantes: string[],
): ValidacaoCalendario {
  const validos = new Set(participantes.map(norm));
  const erros = new Map<string, string>();
  for (const j of jogos) {
    const casa = norm(j.equipaCasa);
    const fora = norm(j.equipaFora);
    if (casa === "") erros.set(j.chave, ERRO_CASA_POR_ESCOLHER);
    else if (fora === "") erros.set(j.chave, ERRO_FORA_POR_ESCOLHER);
    else if (!validos.has(casa) || !validos.has(fora)) erros.set(j.chave, ERRO_EQUIPA_FORA_DA_LISTA);
    else if (casa === fora) erros.set(j.chave, ERRO_MESMA_EQUIPA);
  }
  return { erros, avisos: avisosJornada(jogos) };
}

/** Data ("YYYY-MM-DD") + hora ("HH:MM", opcional) → `Date` local; sem data → `null`. */
export function combinarDataHora(data: string, hora: string): Date | null {
  if (data === "") return null;
  const d = new Date(`${data}T${hora || "00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Payload `jogos` de `criarCompeticaoCompleta`: ordenado por jornada asc com
 * ordenação ESTÁVEL pela ordem da lista (o servidor grava `ordem = índice + 1`).
 */
export function paraPayload(jogos: JogoCalendario[]): JogoPayload[] {
  return jogos
    .map((j, indice) => ({ j, indice }))
    .sort((a, b) => a.j.ronda - b.j.ronda || a.indice - b.indice)
    .map(({ j }) => ({
      equipaCasa: j.equipaCasa,
      equipaFora: j.equipaFora,
      ronda: j.ronda,
      dataHora: combinarDataHora(j.data, j.hora),
    }));
}

/**
 * Separador «Confrontos»: nova ordem COMPLETA da jornada (input de
 * `reordenarConfrontos`) ao subir (-1) / descer (+1) o confronto `id`, trocando-o
 * com o vizinho VISÍVEL na sua secção («Por disputar»/«Resultados»). `null` se não
 * houver vizinho (1.º/último visível) ou o id não estiver nas listas.
 */
export function novaOrdemJornada(
  idsJornada: string[],
  idsVisiveis: string[],
  id: string,
  direcao: -1 | 1,
): string[] | null {
  const posVisivel = idsVisiveis.indexOf(id);
  if (posVisivel < 0) return null;
  const vizinho = idsVisiveis[posVisivel + direcao];
  if (vizinho === undefined) return null;
  const a = idsJornada.indexOf(id);
  const b = idsJornada.indexOf(vizinho);
  if (a < 0 || b < 0) return null;
  const copia = [...idsJornada];
  [copia[a], copia[b]] = [copia[b], copia[a]];
  return copia;
}
