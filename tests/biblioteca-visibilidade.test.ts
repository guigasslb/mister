import { describe, it, expect } from "vitest";

// Regras de visibilidade das bibliotecas 🎒 pessoal / 🏛️ clube (secções 3.3, 3.4 e 4.2).
// `lib/biblioteca.ts` é um módulo PURO: constrói cláusulas Prisma. Estes testes não
// avaliam a *forma* das cláusulas (isso já é feito em tests/templates-sessao.test.ts),
// avaliam a *semântica*: dada uma linha da BD, quem a vê e quem não a vê. Para isso
// interpretamos a cláusula OR gerada contra objetos simples.

import {
  filtroExerciciosVisiveis,
  filtroModelosSessaoVisiveis,
  origemDoItem,
} from "@/lib/biblioteca";

const CLUBE = "clube1";
const OUTRO_CLUBE = "clube2";
const EU = "u1";
const COLEGA = "u2";
const ESTRANHO = "u3";

type Linha = Record<string, unknown> & { partilhasClube?: { clubeId: string }[] };

/**
 * Mini-intérprete recursivo das cláusulas produzidas por `lib/biblioteca.ts`.
 * Suporta os operadores efetivamente usados pelo módulo: igualdades simples e o
 * quantificador `some` sobre relações (usado em `partilhasClube` e no caminho de
 * relações da visibilidade por escalão partilhado — `autor.membros.some...`).
 * Se o módulo passar a gerar operadores fora deste conjunto, os testes falham
 * (intencional: obriga a rever a semântica de visibilidade).
 */
function matchWhere(where: unknown, node: unknown): boolean {
  if (where === null || typeof where !== "object") return node === where;
  const w = where as Record<string, unknown>;
  if ("some" in w) {
    const arr = Array.isArray(node) ? node : [];
    return arr.some((el) => matchWhere(w.some, el));
  }
  if (node === null || typeof node !== "object") return false;
  const n = node as Record<string, unknown>;
  return Object.entries(w).every(([campo, cond]) => matchWhere(cond, n[campo]));
}

function visivel(filtro: { OR?: unknown }, linha: Linha): boolean {
  const clausulas = (filtro.OR ?? []) as Record<string, unknown>[];
  expect(clausulas.length).toBeGreaterThan(0);
  return clausulas.some((clausula) => matchWhere(clausula, linha));
}

/**
 * Constrói o subgrafo `autor` de uma linha de exercício para exercitar a
 * visibilidade por escalão partilhado. `escaloes` descreve os escalões que o autor
 * coordena no clube ativo (CLUBE) e, para cada um, os utilizadores atribuídos a
 * esse escalão nesse clube. Reflete o caminho de relações do filtro:
 * autor → membros(deste clube) → atribuicoes → escalao → atribuicoes → membroClube.
 */
function comEscaloesDoAutor(
  linha: Linha,
  escaloes: { membros: string[] }[],
  clubeDoAutor: string = CLUBE,
): Linha {
  return {
    ...linha,
    autor: {
      membros: [
        {
          clubeId: clubeDoAutor,
          atribuicoes: escaloes.map((esc) => ({
            escalao: {
              atribuicoes: esc.membros.map((utilizadorId) => ({
                membroClube: { clubeId: clubeDoAutor, utilizadorId },
              })),
            },
          })),
        },
      ],
    },
  };
}

const veExercicio = (linha: Linha, clubeId: string, utilizadorId: string) =>
  visivel(filtroExerciciosVisiveis(clubeId, utilizadorId), linha);

const veModelo = (linha: Linha, clubeId: string, utilizadorId: string) =>
  visivel(filtroModelosSessaoVisiveis(clubeId, utilizadorId), linha);

/** Linha de exercício 🎒 pessoal (proprietário = TREINADOR). */
function exercicioPessoal(autorId: string, partilhas: string[] = []): Linha {
  return {
    proprietario: "TREINADOR",
    autorId,
    clubeProprietarioId: null,
    clubeId: CLUBE,
    partilhasClube: partilhas.map((clubeId) => ({ clubeId })),
  };
}

/** Linha de exercício 🏛️ do clube (proprietário = CLUBE). */
function exercicioDoClube(clubeProprietarioId: string, autorId: string = EU): Linha {
  return {
    proprietario: "CLUBE",
    autorId,
    clubeProprietarioId,
    clubeId: clubeProprietarioId,
    partilhasClube: [],
  };
}

// ─── 🎒 Exercício pessoal sem escalão partilhado: só visível ao autor ─────────

describe("exercício 🎒 pessoal (sem escalão partilhado) — só o autor o vê", () => {
  it("é visível ao autor no clube ativo", () => {
    expect(veExercicio(exercicioPessoal(EU), CLUBE, EU)).toBe(true);
  });

  it("NÃO é visível a um colega do mesmo clube que não partilha escalão", () => {
    expect(veExercicio(exercicioPessoal(EU), CLUBE, COLEGA)).toBe(false);
    expect(veExercicio(exercicioPessoal(EU), CLUBE, ESTRANHO)).toBe(false);
  });

  it("é portátil: o autor continua a vê-lo noutro clube (secção 4.2)", () => {
    expect(veExercicio(exercicioPessoal(EU), OUTRO_CLUBE, EU)).toBe(true);
  });

  it("NÃO é visível a terceiros noutro clube", () => {
    expect(veExercicio(exercicioPessoal(EU), OUTRO_CLUBE, COLEGA)).toBe(false);
  });

  it("classifica-se como 🎒 PESSOAL para o autor e 🏛️ CLUBE para os restantes", () => {
    const linha = { proprietario: "TREINADOR" as const, autorId: EU };
    expect(origemDoItem(linha, EU)).toBe("PESSOAL");
    expect(origemDoItem(linha, COLEGA)).toBe("CLUBE");
  });
});

// ─── 🎒 Exercício pessoal com escalão partilhado: visível aos colegas do escalão ─

describe("exercício 🎒 pessoal — visível a quem partilha um escalão com o autor", () => {
  it("é visível ao colega que partilha pelo menos um escalão com o autor no clube ativo", () => {
    // Autor (EU) coordena um escalão onde COLEGA também está atribuído.
    const linha = comEscaloesDoAutor(exercicioPessoal(EU), [{ membros: [EU, COLEGA] }]);
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(true);
  });

  it("basta UM escalão em comum entre vários", () => {
    const linha = comEscaloesDoAutor(exercicioPessoal(EU), [
      { membros: [EU, ESTRANHO] }, // escalão não partilhado com COLEGA
      { membros: [EU, COLEGA] }, // escalão partilhado
    ]);
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(true);
  });

  it("NÃO é visível a quem não partilha nenhum escalão com o autor", () => {
    const linha = comEscaloesDoAutor(exercicioPessoal(EU), [{ membros: [EU, ESTRANHO] }]);
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(false);
  });

  it("a partilha por escalão é scoped ao clube ativo: escalões de outro clube não contam", () => {
    // O autor partilha o escalão com COLEGA, mas as atribuições são de OUTRO_CLUBE.
    const linha = comEscaloesDoAutor(
      exercicioPessoal(EU),
      [{ membros: [EU, COLEGA] }],
      OUTRO_CLUBE,
    );
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(false);
  });

  it("mantém a visibilidade do próprio autor mesmo sem escalões (aba 🎒)", () => {
    const linha = comEscaloesDoAutor(exercicioPessoal(EU), []);
    expect(veExercicio(linha, CLUBE, EU)).toBe(true);
  });
});

// ─── 🏛️ Exercício do clube: visível a todos os membros do clube ─────────────

describe("exercício 🏛️ do clube — visível a todos os membros", () => {
  it("é visível a qualquer membro do clube proprietário, independentemente do autor", () => {
    const linha = exercicioDoClube(CLUBE, COLEGA);
    expect(veExercicio(linha, CLUBE, EU)).toBe(true);
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(true);
    expect(veExercicio(linha, CLUBE, ESTRANHO)).toBe(true);
  });

  it("NÃO é visível a partir de outro clube — nem sequer ao autor", () => {
    const linha = exercicioDoClube(CLUBE, EU);
    expect(veExercicio(linha, OUTRO_CLUBE, EU)).toBe(false);
    expect(veExercicio(linha, OUTRO_CLUBE, COLEGA)).toBe(false);
  });

  it("classifica-se sempre como 🏛️ CLUBE, mesmo para quem o criou", () => {
    expect(origemDoItem({ proprietario: "CLUBE", autorId: EU }, EU)).toBe("CLUBE");
  });

  it("mantém visível a linha legada da fase expand (clubeProprietarioId ainda a null)", () => {
    const legado: Linha = {
      proprietario: "CLUBE",
      autorId: EU,
      clubeProprietarioId: null,
      clubeId: CLUBE,
      partilhasClube: [],
    };
    expect(veExercicio(legado, CLUBE, EU)).toBe(true);
    expect(veExercicio(legado, CLUBE, ESTRANHO)).toBe(true);
    // O clubeId legado continua a delimitar o clube.
    expect(veExercicio(legado, OUTRO_CLUBE, EU)).toBe(false);
  });
});

// ─── Partilha: o exercício aparece nas duas abas ─────────────────────────────

describe("exercício 🎒 pessoal partilhado — aparece nas duas abas", () => {
  const partilhado = exercicioPessoal(EU, [CLUBE]);

  it("continua na aba 🎒 do autor (a partilha dá leitura, não propriedade)", () => {
    expect(veExercicio(partilhado, CLUBE, EU)).toBe(true);
    expect(origemDoItem({ proprietario: "TREINADOR", autorId: EU }, EU)).toBe("PESSOAL");
  });

  it("passa a estar na aba 🏛️ dos colegas do clube", () => {
    expect(veExercicio(partilhado, CLUBE, COLEGA)).toBe(true);
    expect(origemDoItem({ proprietario: "TREINADOR", autorId: EU }, COLEGA)).toBe("CLUBE");
  });

  it("a partilha é por clube: não vaza para os outros clubes do autor", () => {
    expect(veExercicio(partilhado, OUTRO_CLUBE, COLEGA)).toBe(false);
    // O autor mantém-no por ser dele (portabilidade), não por causa da partilha.
    expect(veExercicio(partilhado, OUTRO_CLUBE, EU)).toBe(true);
  });

  it("uma partilha noutro clube não o torna visível no clube ativo", () => {
    const noutroClube = exercicioPessoal(EU, [OUTRO_CLUBE]);
    expect(veExercicio(noutroClube, CLUBE, COLEGA)).toBe(false);
  });

  it("remover a partilha retira-o da aba 🏛️ sem afetar a aba 🎒", () => {
    const semPartilha = exercicioPessoal(EU, []);
    expect(veExercicio(semPartilha, CLUBE, COLEGA)).toBe(false);
    expect(veExercicio(semPartilha, CLUBE, EU)).toBe(true);
  });

  it("o pessoal de um colega partilhado no clube fica visível a todos", () => {
    const doColega = exercicioPessoal(COLEGA, [CLUBE]);
    expect(veExercicio(doColega, CLUBE, EU)).toBe(true);
    expect(veExercicio(doColega, CLUBE, ESTRANHO)).toBe(true);
  });
});

// ─── Templates de sessão: sem partilha pontual ───────────────────────────────

describe("templates de sessão — visibilidade (secção 3.4)", () => {
  const pessoal = { proprietario: "TREINADOR", autorId: EU, clubeProprietarioId: null };
  const doClube = { proprietario: "CLUBE", autorId: COLEGA, clubeProprietarioId: CLUBE };

  it("o template 🎒 pessoal só é visível ao autor", () => {
    expect(veModelo(pessoal, CLUBE, EU)).toBe(true);
    expect(veModelo(pessoal, CLUBE, COLEGA)).toBe(false);
  });

  it("o template 🎒 pessoal é portátil entre clubes", () => {
    expect(veModelo(pessoal, OUTRO_CLUBE, EU)).toBe(true);
  });

  it("o template 🏛️ do clube é visível a todos os membros do clube", () => {
    expect(veModelo(doClube, CLUBE, EU)).toBe(true);
    expect(veModelo(doClube, CLUBE, COLEGA)).toBe(true);
    expect(veModelo(doClube, CLUBE, ESTRANHO)).toBe(true);
    expect(veModelo(doClube, OUTRO_CLUBE, EU)).toBe(false);
  });

  it("não existe partilha pontual de templates: a contribuição transfere a propriedade", () => {
    // Uma linha "partilhada" (com partilhasClube preenchido) é irrelevante para
    // templates — o filtro não a considera.
    const comPartilhaIrrelevante = { ...pessoal, partilhasClube: [{ clubeId: CLUBE }] };
    expect(veModelo(comPartilhaIrrelevante, CLUBE, COLEGA)).toBe(false);

    // Depois de contribuir (proprietario → CLUBE), passa a ser visível a todos.
    const transferido = { proprietario: "CLUBE", autorId: EU, clubeProprietarioId: CLUBE };
    expect(veModelo(transferido, CLUBE, COLEGA)).toBe(true);
  });
});

// ─── origemDoItem: casos-limite ──────────────────────────────────────────────

describe("origemDoItem — casos-limite", () => {
  it("trata autoria desconhecida (autorId null) como 🏛️ clube", () => {
    expect(origemDoItem({ proprietario: "TREINADOR", autorId: null }, EU)).toBe("CLUBE");
    expect(origemDoItem({ proprietario: "CLUBE", autorId: null }, EU)).toBe("CLUBE");
  });
});
