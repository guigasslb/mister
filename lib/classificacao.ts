// lib/classificacao.ts
// F6 (Fase 16) · P1.2 (§23) — Cálculo puro da tabela de classificação de uma competição.
//
// A classificação NÃO é armazenada (bíblia §3.7, §23.5): é CALCULADA a partir de
// (a) resultados/confrontos inseridos manualmente para todas as equipas
// (`ResultadoCompeticao`) e (b) jogos da própria equipa (`Jogo`).
//
// Este módulo é PURO (sem "use server", sem Prisma) para ser reutilizável no
// cliente e testável sem base de dados.

import type { FormatoCompeticao, EstadoResultado, CasaFora } from "@prisma/client";

/** Uma linha da tabela de classificação (uma equipa). */
export interface LinhaClassificacao {
  equipa: string;
  // P1.2 (§23.5): destaque da equipa própria na UI (tipo = PROPRIO).
  ehProprio: boolean;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  golosMarcados: number;
  golosSofridos: number;
  pontos: number;
  // P1.2 (§23.5): posição final (1..N) após ordenação/desempate.
  posicao: number;
}

/** Jogo da própria equipa com resultado final, na perspetiva do clube. */
export interface JogoClassificacao {
  adversario: string;
  golosMarcados: number; // golos da própria equipa
  golosSofridos: number; // golos do adversário
}

/** Resultado/confronto (jogo de/entre outras equipas), inserido manualmente. */
export interface ResultadoClassificacao {
  equipaCasa: string;
  equipaFora: string;
  // Golos opcionais: um WALKOVER conta pelo resultado regulamentar (ignora golos);
  // um confronto sem golos (AGENDADO/CANCELADO) é ignorado no cálculo.
  golosCasa?: number | null;
  golosFora?: number | null;
  // P1.2 (§23.5): estado do confronto. Ausente = REALIZADO (retrocompatível com §10.9).
  estado?: EstadoResultado;
  // P1.2 (§23.7): vencedor por walkover (só relevante quando estado = WALKOVER).
  walkoverVencedor?: CasaFora | null;
}

/**
 * Argumentos de `calcularClassificacao`. A pontuação é configurável (§23.5) com
 * defaults iguais ao comportamento anterior (3/1/0), garantindo retrocompatibilidade.
 */
export interface ClassificacaoArgs {
  nomeEquipaPropria: string;
  formato: FormatoCompeticao;
  jogosProprios: JogoClassificacao[];
  resultados: ResultadoClassificacao[];
  // P1.2 (§23.5): pontuação configurável (só se aplica a LIGA).
  pontosVitoria?: number; // default 3
  pontosEmpate?: number; // default 1
  pontosDerrota?: number; // default 0
  // P1.2 (§23.7): resultado regulamentar do walkover (golosWalkover–0). Default 3.
  golosWalkover?: number;
}

/**
 * Calcula a tabela de classificação combinando os jogos da própria equipa com
 * os confrontos inseridos manualmente. Agrupa por nome de equipa (após `trim`),
 * acumulando jogos, vitórias/empates/derrotas, golos e pontos.
 *
 * Confrontos considerados (§23.5): apenas `estado ∈ { REALIZADO, WALKOVER }`.
 * `AGENDADO` e `CANCELADO` são ignorados. Um confronto sem `estado` (legado)
 * é tratado como `REALIZADO` — preserva o comportamento de §10.9.
 *
 * WALKOVER (§23.7): usa o resultado regulamentar `golosWalkover`–0 a favor de
 * `walkoverVencedor`; os golos inseridos (se existirem) são ignorados.
 *
 * Pontuação (§23.5): configurável em LIGA (default 3/1/0); TORNEIO/TAÇA não pontuam
 * (a ordenação recai na diferença de golos — a "classificação" é o bracket, §8.11).
 *
 * Ordenação/desempate: pontos desc → diferença de golos desc → golos marcados desc
 * → nome asc (estável).
 */
export function calcularClassificacao(args: ClassificacaoArgs): LinhaClassificacao[] {
  const {
    nomeEquipaPropria,
    formato,
    jogosProprios,
    resultados,
    pontosVitoria = 3,
    pontosEmpate = 1,
    pontosDerrota = 0,
    golosWalkover = 3,
  } = args;

  // Só LIGA pontua; TORNEIO/TAÇA ordenam por diferença de golos (§23.5).
  const pontos =
    formato === "LIGA"
      ? { vitoria: pontosVitoria, empate: pontosEmpate, derrota: pontosDerrota }
      : { vitoria: 0, empate: 0, derrota: 0 };

  const nomeProprio = nomeEquipaPropria.trim();
  const tabela = new Map<string, LinhaClassificacao>();

  const linha = (equipaBruta: string): LinhaClassificacao | null => {
    const equipa = equipaBruta.trim();
    if (equipa === "") return null;
    let l = tabela.get(equipa);
    if (!l) {
      l = {
        equipa,
        ehProprio: nomeProprio !== "" && equipa === nomeProprio,
        jogos: 0,
        vitorias: 0,
        empates: 0,
        derrotas: 0,
        golosMarcados: 0,
        golosSofridos: 0,
        pontos: 0,
        posicao: 0,
      };
      tabela.set(equipa, l);
    }
    return l;
  };

  // Regista um confronto na perspetiva de UMA equipa (marcados vs sofridos).
  const registar = (equipa: string, marcados: number, sofridos: number): void => {
    const l = linha(equipa);
    if (!l) return;
    l.jogos += 1;
    l.golosMarcados += marcados;
    l.golosSofridos += sofridos;
    if (marcados > sofridos) {
      l.vitorias += 1;
      l.pontos += pontos.vitoria;
    } else if (marcados === sofridos) {
      l.empates += 1;
      l.pontos += pontos.empate;
    } else {
      l.derrotas += 1;
      l.pontos += pontos.derrota;
    }
  };

  // Jogos próprios: a própria equipa e o adversário (espelho). Já filtrados a
  // montante para jogos com resultado final (§10.9).
  for (const j of jogosProprios) {
    registar(nomeEquipaPropria, j.golosMarcados, j.golosSofridos);
    registar(j.adversario, j.golosSofridos, j.golosMarcados);
  }

  // Confrontos: só REALIZADO e WALKOVER contam (§23.5).
  for (const r of resultados) {
    const estado = r.estado ?? "REALIZADO";
    if (estado !== "REALIZADO" && estado !== "WALKOVER") continue; // AGENDADO/CANCELADO

    if (estado === "WALKOVER") {
      // Resultado regulamentar golosWalkover–0 a favor do vencedor; golos ignorados.
      if (r.walkoverVencedor === "CASA") {
        registar(r.equipaCasa, golosWalkover, 0);
        registar(r.equipaFora, 0, golosWalkover);
      } else if (r.walkoverVencedor === "FORA") {
        registar(r.equipaCasa, 0, golosWalkover);
        registar(r.equipaFora, golosWalkover, 0);
      }
      // Sem vencedor (não deveria ocorrer — validação Zod) → ignora defensivamente.
      continue;
    }

    // REALIZADO: precisa de ambos os golos.
    if (r.golosCasa === null || r.golosCasa === undefined) continue;
    if (r.golosFora === null || r.golosFora === undefined) continue;
    registar(r.equipaCasa, r.golosCasa, r.golosFora);
    registar(r.equipaFora, r.golosFora, r.golosCasa);
  }

  const diff = (l: LinhaClassificacao): number => l.golosMarcados - l.golosSofridos;

  const ordenada = [...tabela.values()].sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (diff(b) !== diff(a)) return diff(b) - diff(a);
    if (b.golosMarcados !== a.golosMarcados) return b.golosMarcados - a.golosMarcados;
    return a.equipa.localeCompare(b.equipa, "pt");
  });

  // Posição final (1..N) após ordenação.
  ordenada.forEach((l, i) => {
    l.posicao = i + 1;
  });

  return ordenada;
}
