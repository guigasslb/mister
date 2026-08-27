import { describe, it, expect, vi, beforeEach } from "vitest";

// Regras de visibilidade das bibliotecas 🎒 pessoal / 🏛️ clube (secções 3.3, 3.4 e 4.2).
//
// A visibilidade por ESCALÃO PARTILHADO (alternativa 2) deixou de ser um subquery
// correlacionado profundo (que o Prisma não traduzia fielmente — o filtro devolvia
// vazio mesmo com dados válidos) e passou a ser PRÉ-COMPUTADA em SQL simples:
//   escaloesCobertosPorUtilizador → autoresComEscalaoPartilhado → autorId in (...)
// Estes testes cobrem (a) a cobertura de escalão ciente do âmbito, (b) a resolução dos
// autores partilhados, e (c) a composição do filtro final e a semântica linha-a-linha
// das restantes alternativas (própria/portátil, clube, legado, partilha).

vi.mock("@/lib/db", () => ({
  prisma: {
    membroClube: { findFirst: vi.fn(), findMany: vi.fn() },
    escalao: { findMany: vi.fn() },
  },
}));

import {
  escaloesCobertosPorUtilizador,
  autoresComEscalaoPartilhado,
  filtroExerciciosVisiveis,
  filtroModelosSessaoVisiveis,
  origemDoItem,
} from "@/lib/biblioteca";
import { prisma } from "@/lib/db";

const CLUBE = "clube1";
const OUTRO_CLUBE = "clube2";
const EU = "u1";
const COLEGA = "u2";
const ESTRANHO = "u3";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocked = (fn: unknown) => fn as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Interpretador dos operadores do filtro final (igualdade, `in`, `some`) ───
// O filtro devolvido por `filtroExerciciosVisiveis` só usa igualdades simples, `in`
// (lista de autores pré-computada) e `some` (partilhasClube). Interpretá-lo contra
// linhas simples permite validar a semântica linha-a-linha sem uma base de dados.
type Linha = Record<string, unknown> & { partilhasClube?: { clubeId: string }[] };

function matchWhere(where: unknown, node: unknown): boolean {
  if (where === null || typeof where !== "object") return node === where;
  const w = where as Record<string, unknown>;
  if ("in" in w && Object.keys(w).length === 1) {
    return (w.in as unknown[]).includes(node);
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
  const clausulas = (filtro.OR ?? []) as unknown[];
  expect(clausulas.length).toBeGreaterThan(0);
  return clausulas.some((clausula) => matchWhere(clausula, linha));
}

/** Constrói o filtro para (clube, utilizador), controlando os autores partilhados. */
async function filtroCom(
  clubeId: string,
  utilizadorId: string,
  opts: {
    ambito?: "TODO_CLUBE" | "SECCAO" | "PROPRIOS_ESCALOES";
    escaloes?: string[]; // atribuídos (PROPRIOS)
    membro?: boolean; // false = não é membro do clube
    autores?: string[]; // autores devolvidos por membroClube.findMany
  } = {},
) {
  const { ambito = "PROPRIOS_ESCALOES", escaloes = [], membro = true, autores = [] } = opts;
  mocked(prisma.membroClube.findFirst).mockResolvedValue(
    membro
      ? {
          perfil: { ambito },
          atribuicoes: escaloes.map((escalaoId) => ({ escalaoId })),
          seccoes: [],
        }
      : null,
  );
  mocked(prisma.membroClube.findMany).mockResolvedValue(
    autores.map((utilizadorId) => ({ utilizadorId })),
  );
  return filtroExerciciosVisiveis(clubeId, utilizadorId);
}

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

// ─── escaloesCobertosPorUtilizador — cobertura ciente do âmbito (§6.3/§6.5/§6.9) ─

describe("escaloesCobertosPorUtilizador — âmbito", () => {
  it("não-membro do clube não cobre nenhum escalão", async () => {
    mocked(prisma.membroClube.findFirst).mockResolvedValue(null);
    expect(await escaloesCobertosPorUtilizador(CLUBE, EU)).toEqual([]);
    expect(prisma.escalao.findMany).not.toHaveBeenCalled();
  });

  it("PROPRIOS_ESCALOES: só os escalões atribuídos (sem consulta a escalao)", async () => {
    mocked(prisma.membroClube.findFirst).mockResolvedValue({
      perfil: { ambito: "PROPRIOS_ESCALOES" },
      atribuicoes: [{ escalaoId: "e1" }, { escalaoId: "e2" }],
      seccoes: [],
    });
    expect(await escaloesCobertosPorUtilizador(CLUBE, EU)).toEqual(["e1", "e2"]);
    expect(prisma.escalao.findMany).not.toHaveBeenCalled();
  });

  it("TODO_CLUBE: todos os escalões do clube", async () => {
    mocked(prisma.membroClube.findFirst).mockResolvedValue({
      perfil: { ambito: "TODO_CLUBE" },
      atribuicoes: [],
      seccoes: [],
    });
    mocked(prisma.escalao.findMany).mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
    expect(await escaloesCobertosPorUtilizador(CLUBE, EU)).toEqual(["e1", "e2"]);
    expect(prisma.escalao.findMany).toHaveBeenCalledWith({
      where: { clubeId: CLUBE },
      select: { id: true },
    });
  });

  it("SECCAO: escalões das secções coordenadas", async () => {
    mocked(prisma.membroClube.findFirst).mockResolvedValue({
      perfil: { ambito: "SECCAO" },
      atribuicoes: [],
      seccoes: [{ seccaoId: "s1" }],
    });
    mocked(prisma.escalao.findMany).mockResolvedValue([{ id: "e1" }]);
    expect(await escaloesCobertosPorUtilizador(CLUBE, EU)).toEqual(["e1"]);
    expect(prisma.escalao.findMany).toHaveBeenCalledWith({
      where: { clubeId: CLUBE, seccaoId: { in: ["s1"] } },
      select: { id: true },
    });
  });

  it("SECCAO sem secções coordenadas não cobre nenhum escalão", async () => {
    mocked(prisma.membroClube.findFirst).mockResolvedValue({
      perfil: { ambito: "SECCAO" },
      atribuicoes: [],
      seccoes: [],
    });
    expect(await escaloesCobertosPorUtilizador(CLUBE, EU)).toEqual([]);
    expect(prisma.escalao.findMany).not.toHaveBeenCalled();
  });
});

// ─── autoresComEscalaoPartilhado — resolução dos autores visíveis ─────────────

describe("autoresComEscalaoPartilhado", () => {
  it("sem escalões cobertos, não há autores partilhados (nem consulta membros)", async () => {
    mocked(prisma.membroClube.findFirst).mockResolvedValue(null);
    expect(await autoresComEscalaoPartilhado(CLUBE, EU)).toEqual([]);
    expect(prisma.membroClube.findMany).not.toHaveBeenCalled();
  });

  it("procura autores por âmbito (TODO_CLUBE) ou por escalão coberto (PROPRIOS/SECCAO)", async () => {
    mocked(prisma.membroClube.findFirst).mockResolvedValue({
      perfil: { ambito: "PROPRIOS_ESCALOES" },
      atribuicoes: [{ escalaoId: "e1" }],
      seccoes: [],
    });
    mocked(prisma.membroClube.findMany).mockResolvedValue([
      { utilizadorId: EU },
      { utilizadorId: COLEGA },
    ]);

    expect(await autoresComEscalaoPartilhado(CLUBE, EU)).toEqual([EU, COLEGA]);
    expect(prisma.membroClube.findMany).toHaveBeenCalledWith({
      where: {
        clubeId: CLUBE,
        OR: [
          { perfil: { ambito: "TODO_CLUBE" } },
          { atribuicoes: { some: { escalaoId: { in: ["e1"] } } } },
          {
            seccoes: {
              some: {
                papel: "COORDENADOR",
                seccao: { escaloes: { some: { id: { in: ["e1"] } } } },
              },
            },
          },
        ],
      },
      select: { utilizadorId: true },
    });
  });
});

// ─── filtroExerciciosVisiveis — composição das alternativas ───────────────────

describe("filtroExerciciosVisiveis — composição", () => {
  it("inclui a alternativa de colegas (autorId in) quando há autores partilhados", async () => {
    const filtro = await filtroCom(CLUBE, EU, { escaloes: ["e1"], autores: [EU, COLEGA] });
    expect(filtro.OR).toEqual([
      { proprietario: "TREINADOR", autorId: EU },
      { proprietario: "TREINADOR", autorId: { in: [EU, COLEGA] } },
      { proprietario: "CLUBE", clubeProprietarioId: CLUBE },
      { proprietario: "CLUBE", clubeProprietarioId: null, clubeId: CLUBE },
      { partilhasClube: { some: { clubeId: CLUBE } } },
    ]);
  });

  it("omite a alternativa de colegas quando o utilizador não partilha escalão", async () => {
    const filtro = await filtroCom(CLUBE, EU, { escaloes: [] });
    expect(filtro.OR).toEqual([
      { proprietario: "TREINADOR", autorId: EU },
      { proprietario: "CLUBE", clubeProprietarioId: CLUBE },
      { proprietario: "CLUBE", clubeProprietarioId: null, clubeId: CLUBE },
      { partilhasClube: { some: { clubeId: CLUBE } } },
    ]);
    expect(prisma.membroClube.findMany).not.toHaveBeenCalled();
  });
});

// ─── 🎒 Exercício pessoal — semântica linha-a-linha ──────────────────────────

describe("exercício 🎒 pessoal", () => {
  it("é sempre visível ao autor, mesmo sem escalões partilhados", async () => {
    const filtro = await filtroCom(CLUBE, EU, { escaloes: [] });
    expect(visivel(filtro, exercicioPessoal(EU))).toBe(true);
  });

  it("NÃO é visível a um colega que não partilha escalão (nenhum autor partilhado)", async () => {
    const filtro = await filtroCom(CLUBE, COLEGA, { escaloes: [] });
    expect(visivel(filtro, exercicioPessoal(EU))).toBe(false);
  });

  it("é visível a um colega que partilha escalão (autor consta dos partilhados)", async () => {
    const filtro = await filtroCom(CLUBE, COLEGA, { escaloes: ["e1"], autores: [EU, COLEGA] });
    expect(visivel(filtro, exercicioPessoal(EU))).toBe(true);
  });

  it("NÃO vaza para um colega quando o autor não consta dos partilhados", async () => {
    // COLEGA partilha um escalão, mas EU (autor) não está entre os autores resolvidos.
    const filtro = await filtroCom(CLUBE, COLEGA, { escaloes: ["e1"], autores: [COLEGA] });
    expect(visivel(filtro, exercicioPessoal(EU))).toBe(false);
  });

  it("é portátil: o autor continua a vê-lo noutro clube onde nem é membro", async () => {
    const filtro = await filtroCom(OUTRO_CLUBE, EU, { membro: false });
    expect(visivel(filtro, exercicioPessoal(EU))).toBe(true);
  });

  it("NÃO é visível a terceiros noutro clube", async () => {
    const filtro = await filtroCom(OUTRO_CLUBE, COLEGA, { membro: false });
    expect(visivel(filtro, exercicioPessoal(EU))).toBe(false);
  });
});

// ─── 🏛️ Exercício do clube — visível a todos os membros ─────────────────────

describe("exercício 🏛️ do clube", () => {
  it("é visível a qualquer membro do clube proprietário, independentemente do autor", async () => {
    const filtro = await filtroCom(CLUBE, ESTRANHO, { escaloes: [] });
    expect(visivel(filtro, exercicioDoClube(CLUBE, COLEGA))).toBe(true);
  });

  it("NÃO é visível a partir de outro clube — nem ao autor", async () => {
    const filtro = await filtroCom(OUTRO_CLUBE, EU, { membro: false });
    expect(visivel(filtro, exercicioDoClube(CLUBE, EU))).toBe(false);
  });

  it("mantém visível a linha legada da fase expand (clubeProprietarioId a null)", async () => {
    const legado: Linha = {
      proprietario: "CLUBE",
      autorId: EU,
      clubeProprietarioId: null,
      clubeId: CLUBE,
      partilhasClube: [],
    };
    const filtroClube = await filtroCom(CLUBE, ESTRANHO, { escaloes: [] });
    expect(visivel(filtroClube, legado)).toBe(true);
    // O clubeId legado continua a delimitar o clube.
    const filtroOutro = await filtroCom(OUTRO_CLUBE, EU, { membro: false });
    expect(visivel(filtroOutro, legado)).toBe(false);
  });
});

// ─── Partilha: o exercício aparece nas duas abas, scoped ao clube ─────────────

describe("exercício 🎒 pessoal partilhado no clube", () => {
  it("passa a estar visível aos colegas do clube via partilhasClube", async () => {
    const partilhado = exercicioPessoal(EU, [CLUBE]);
    // COLEGA não partilha escalão com EU, mas a partilha explícita torna-o visível.
    const filtro = await filtroCom(CLUBE, COLEGA, { escaloes: [] });
    expect(visivel(filtro, partilhado)).toBe(true);
  });

  it("a partilha é por clube: não vaza para outros clubes", async () => {
    const noutroClube = exercicioPessoal(EU, [OUTRO_CLUBE]);
    const filtro = await filtroCom(CLUBE, COLEGA, { escaloes: [] });
    expect(visivel(filtro, noutroClube)).toBe(false);
  });

  it("remover a partilha retira-o da aba 🏛️ sem afetar a aba 🎒 do autor", async () => {
    const semPartilha = exercicioPessoal(EU, []);
    const filtroColega = await filtroCom(CLUBE, COLEGA, { escaloes: [] });
    expect(visivel(filtroColega, semPartilha)).toBe(false);
    const filtroAutor = await filtroCom(CLUBE, EU, { escaloes: [] });
    expect(visivel(filtroAutor, semPartilha)).toBe(true);
  });
});

// ─── Templates de sessão: sem partilha pontual (módulo puro) ──────────────────

describe("templates de sessão — visibilidade (secção 3.4)", () => {
  const veModelo = (linha: Linha, clubeId: string, utilizadorId: string) =>
    visivel(filtroModelosSessaoVisiveis(clubeId, utilizadorId), linha);

  const pessoal = { proprietario: "TREINADOR", autorId: EU, clubeProprietarioId: null };
  const doClube = { proprietario: "CLUBE", autorId: COLEGA, clubeProprietarioId: CLUBE };

  it("o template 🎒 pessoal só é visível ao autor e é portátil", () => {
    expect(veModelo(pessoal, CLUBE, EU)).toBe(true);
    expect(veModelo(pessoal, CLUBE, COLEGA)).toBe(false);
    expect(veModelo(pessoal, OUTRO_CLUBE, EU)).toBe(true);
  });

  it("o template 🏛️ do clube é visível a todos os membros do clube", () => {
    expect(veModelo(doClube, CLUBE, EU)).toBe(true);
    expect(veModelo(doClube, CLUBE, COLEGA)).toBe(true);
    expect(veModelo(doClube, CLUBE, ESTRANHO)).toBe(true);
    expect(veModelo(doClube, OUTRO_CLUBE, EU)).toBe(false);
  });

  it("não existe partilha pontual de templates: uma linha partilhada é irrelevante", () => {
    const comPartilhaIrrelevante = { ...pessoal, partilhasClube: [{ clubeId: CLUBE }] };
    expect(veModelo(comPartilhaIrrelevante, CLUBE, COLEGA)).toBe(false);
    const transferido = { proprietario: "CLUBE", autorId: EU, clubeProprietarioId: CLUBE };
    expect(veModelo(transferido, CLUBE, COLEGA)).toBe(true);
  });
});

// ─── origemDoItem: classificação 🎒 / 🏛️ ────────────────────────────────────

describe("origemDoItem", () => {
  it("classifica-se como 🎒 PESSOAL para o autor e 🏛️ CLUBE para os restantes", () => {
    const linha = { proprietario: "TREINADOR" as const, autorId: EU };
    expect(origemDoItem(linha, EU)).toBe("PESSOAL");
    expect(origemDoItem(linha, COLEGA)).toBe("CLUBE");
  });

  it("um exercício do clube é sempre 🏛️, mesmo para quem o criou", () => {
    expect(origemDoItem({ proprietario: "CLUBE", autorId: EU }, EU)).toBe("CLUBE");
  });

  it("trata autoria desconhecida (autorId null) como 🏛️ clube", () => {
    expect(origemDoItem({ proprietario: "TREINADOR", autorId: null }, EU)).toBe("CLUBE");
    expect(origemDoItem({ proprietario: "CLUBE", autorId: null }, EU)).toBe("CLUBE");
  });
});
