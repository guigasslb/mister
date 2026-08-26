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
 * Suporta os operadores efetivamente usados pelo módulo: igualdades simples, o
 * quantificador `some` sobre relações (usado em `partilhasClube` e no caminho de
 * relações da visibilidade por escalão partilhado) e a disjunção `OR` aninhada
 * (usada na cobertura de escalão ciente do âmbito — `escaloesCobertoPor`).
 * Se o módulo passar a gerar operadores fora deste conjunto, os testes falham
 * (intencional: obriga a rever a semântica de visibilidade).
 */
function matchWhere(where: unknown, node: unknown): boolean {
  if (where === null || typeof where !== "object") return node === where;
  const w = where as Record<string, unknown>;
  if ("OR" in w) {
    const arms = (w.OR ?? []) as unknown[];
    // Numa cláusula com OR, os restantes campos combinam-se em AND com a disjunção.
    const resto = Object.fromEntries(Object.entries(w).filter(([k]) => k !== "OR"));
    return (
      arms.some((arm) => matchWhere(arm, node)) &&
      matchWhere(resto, node)
    );
  }
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
 * visibilidade por escalão partilhado no caso PROPRIOS_ESCALOES. `escaloes`
 * descreve os escalões que o autor coordena no clube ativo (CLUBE) e, para cada um,
 * os utilizadores ATRIBUÍDOS (atribuição explícita) a esse escalão nesse clube.
 * Reflete o modelo de dados que o filtro navega — cada nó de escalão carrega o
 * `clubeId`, as atribuições explícitas e os membros do clube (todos de âmbito
 * PROPRIOS_ESCALOES aqui) — sem depender da forma exata da cláusula gerada.
 */
function comEscaloesDoAutor(
  linha: Linha,
  escaloes: { membros: string[] }[],
  clubeDoAutor: string = CLUBE,
): Linha {
  const escalaoNode = (esc: { membros: string[] }) => ({
    clubeId: clubeDoAutor,
    atribuicoes: esc.membros.map((utilizadorId) => ({
      membroClube: { clubeId: clubeDoAutor, utilizadorId },
    })),
    clube: {
      membros: esc.membros.map((utilizadorId) => ({
        utilizadorId,
        perfil: { ambito: "PROPRIOS_ESCALOES" },
      })),
    },
    seccao: undefined,
  });
  const nodes = escaloes.map(escalaoNode);
  return {
    ...linha,
    autor: {
      membros: [
        {
          clubeId: clubeDoAutor,
          perfil: { ambito: "PROPRIOS_ESCALOES" },
          atribuicoes: nodes.map((escalao) => ({ escalao })),
          clube: { escaloes: nodes },
          seccoes: [],
        },
      ],
    },
  };
}

// ─── Modelo de mundo para exercitar os três âmbitos (§6.3/§6.5/§6.9) ──────────

type AmbitoTexto = "TODO_CLUBE" | "SECCAO" | "PROPRIOS_ESCALOES";
type MembroMundo = {
  utilizadorId: string;
  ambito: AmbitoTexto;
  /** Escalões atribuídos (só relevante para PROPRIOS_ESCALOES). */
  escaloes?: string[];
  /** Secções coordenadas (só relevante para SECCAO). */
  seccoes?: string[];
};
type EscalaoMundo = { id: string; seccaoId?: string };

/**
 * Constrói uma linha de exercício 🎒 pessoal (autor = `autorId`) a partir de um
 * "mundo" de escalões e membros do clube, modelando fielmente a cobertura de
 * escalão por âmbito: PROPRIOS_ESCALOES (atribuição explícita), TODO_CLUBE (todos
 * os escalões do clube) e SECCAO (escalões da secção coordenada). Independente da
 * forma da cláusula gerada — modela os dados, não o filtro.
 */
function linhaAutorMundo(
  autorId: string,
  escaloes: EscalaoMundo[],
  membros: MembroMundo[],
  clubeDoMundo: string = CLUBE,
): Linha {
  const escalaoNode = (e: EscalaoMundo) => ({
    clubeId: clubeDoMundo,
    atribuicoes: membros
      .filter((m) => m.ambito === "PROPRIOS_ESCALOES" && (m.escaloes ?? []).includes(e.id))
      .map((m) => ({ membroClube: { clubeId: clubeDoMundo, utilizadorId: m.utilizadorId } })),
    clube: {
      membros: membros.map((m) => ({
        utilizadorId: m.utilizadorId,
        perfil: { ambito: m.ambito },
      })),
    },
    seccao: e.seccaoId
      ? {
          membros: membros
            .filter((m) => m.ambito === "SECCAO" && (m.seccoes ?? []).includes(e.seccaoId!))
            .map((m) => ({
              papel: "COORDENADOR",
              membroClube: { clubeId: clubeDoMundo, utilizadorId: m.utilizadorId },
            })),
        }
      : undefined,
  });

  const autor = membros.find((m) => m.utilizadorId === autorId)!;
  const todosNodes = escaloes.map(escalaoNode);
  const membroAutor = {
    clubeId: clubeDoMundo,
    perfil: { ambito: autor.ambito },
    atribuicoes:
      autor.ambito === "PROPRIOS_ESCALOES"
        ? escaloes
            .filter((e) => (autor.escaloes ?? []).includes(e.id))
            .map((e) => ({ escalao: escalaoNode(e) }))
        : [],
    clube: { escaloes: todosNodes },
    seccoes:
      autor.ambito === "SECCAO"
        ? (autor.seccoes ?? []).map((sid) => ({
            papel: "COORDENADOR",
            seccao: { escaloes: escaloes.filter((e) => e.seccaoId === sid).map(escalaoNode) },
          }))
        : [],
  };

  return {
    proprietario: "TREINADOR",
    autorId,
    clubeProprietarioId: null,
    clubeId: clubeDoMundo,
    partilhasClube: [],
    autor: { membros: [membroAutor] },
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

// ─── 🎒 Escalão partilhado por ÂMBITO (TODO_CLUBE / SECCAO), não só atribuição ─

describe("exercício 🎒 pessoal — cobertura de escalão por âmbito (§6.3/§6.5/§6.9)", () => {
  it("autor TODO_CLUBE: visível a quem cobre qualquer escalão do clube", () => {
    // Ex.: Diretor Técnico (autor, TODO_CLUBE) e um treinador de escalão (COLEGA).
    const linha = linhaAutorMundo(EU, [{ id: "e1" }], [
      { utilizadorId: EU, ambito: "TODO_CLUBE" },
      { utilizadorId: COLEGA, ambito: "PROPRIOS_ESCALOES", escaloes: ["e1"] },
    ]);
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(true);
  });

  it("autor TODO_CLUBE: NÃO visível a quem não cobre nenhum escalão", () => {
    const linha = linhaAutorMundo(EU, [{ id: "e1" }], [
      { utilizadorId: EU, ambito: "TODO_CLUBE" },
      { utilizadorId: COLEGA, ambito: "PROPRIOS_ESCALOES", escaloes: [] },
    ]);
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(false);
  });

  it("utilizador TODO_CLUBE vê o pessoal de um autor com escalão atribuído (bug reportado)", () => {
    // Hugo (COLEGA) é Diretor Técnico (TODO_CLUBE); o treinador A (EU) tem o escalão
    // atribuído. Antes da correção, Hugo não via — não tinha AtribuicaoEscalao.
    const linha = linhaAutorMundo(EU, [{ id: "e1" }], [
      { utilizadorId: EU, ambito: "PROPRIOS_ESCALOES", escaloes: ["e1"] },
      { utilizadorId: COLEGA, ambito: "TODO_CLUBE" },
    ]);
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(true);
  });

  it("dois membros TODO_CLUBE partilham os escalões do clube", () => {
    const linha = linhaAutorMundo(EU, [{ id: "e1" }], [
      { utilizadorId: EU, ambito: "TODO_CLUBE" },
      { utilizadorId: COLEGA, ambito: "TODO_CLUBE" },
    ]);
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(true);
  });

  it("clube sem escalões: mesmo dois TODO_CLUBE não partilham nada", () => {
    const linha = linhaAutorMundo(EU, [], [
      { utilizadorId: EU, ambito: "TODO_CLUBE" },
      { utilizadorId: COLEGA, ambito: "TODO_CLUBE" },
    ]);
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(false);
  });

  it("autor SECCAO: visível a quem cobre um escalão da secção coordenada", () => {
    const linha = linhaAutorMundo(EU, [{ id: "e1", seccaoId: "s1" }], [
      { utilizadorId: EU, ambito: "SECCAO", seccoes: ["s1"] },
      { utilizadorId: COLEGA, ambito: "PROPRIOS_ESCALOES", escaloes: ["e1"] },
    ]);
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(true);
  });

  it("utilizador SECCAO vê o pessoal de um autor com escalão na sua secção", () => {
    const linha = linhaAutorMundo(EU, [{ id: "e1", seccaoId: "s1" }], [
      { utilizadorId: EU, ambito: "PROPRIOS_ESCALOES", escaloes: ["e1"] },
      { utilizadorId: COLEGA, ambito: "SECCAO", seccoes: ["s1"] },
    ]);
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(true);
  });

  it("autor SECCAO: NÃO visível a quem coordena outra secção", () => {
    const linha = linhaAutorMundo(
      EU,
      [
        { id: "e1", seccaoId: "s1" },
        { id: "e2", seccaoId: "s2" },
      ],
      [
        { utilizadorId: EU, ambito: "SECCAO", seccoes: ["s1"] },
        { utilizadorId: COLEGA, ambito: "SECCAO", seccoes: ["s2"] },
      ],
    );
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(false);
  });

  it("a cobertura por âmbito continua scoped ao clube ativo", () => {
    // Autor e COLEGA são ambos TODO_CLUBE, mas de OUTRO_CLUBE.
    const linha = linhaAutorMundo(
      EU,
      [{ id: "e1" }],
      [
        { utilizadorId: EU, ambito: "TODO_CLUBE" },
        { utilizadorId: COLEGA, ambito: "TODO_CLUBE" },
      ],
      OUTRO_CLUBE,
    );
    expect(veExercicio(linha, CLUBE, COLEGA)).toBe(false);
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
