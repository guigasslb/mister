import { describe, it, expect, vi, beforeEach } from "vitest";

// Situações de jogo (bíblia §24.9). As permissões usam a implementação REAL de
// @/lib/permissoes (âmbitos TODO_CLUBE / SECCAO / PROPRIOS_ESCALOES); só auth,
// licença e prisma são substituídos.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));
vi.mock("@/lib/licenca", () => ({ temLicencaValida: vi.fn(async () => true) }));
vi.mock("@/lib/db", () => {
  const prisma = {
    membroClube: { findFirst: vi.fn() },
    utilizador: { findUnique: vi.fn() },
    escalao: { findFirst: vi.fn(), findMany: vi.fn() },
    jogo: { findFirst: vi.fn() },
    categoriaSituacaoJogo: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    situacaoJogo: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    quadroTatico: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return { prisma };
});

import { Prisma } from "@prisma/client";
import {
  nomeSituacaoSchema,
  situacaoJogoSchema,
  referenciaCategoria,
  quadroSituacaoSchema,
} from "@/lib/schemas/situacaoJogo";
import {
  listarCategoriasSituacao,
  criarCategoriaSituacao,
  atualizarCategoriaSituacao,
  apagarCategoriaSituacao,
  listarSituacoesJogo,
  listarEscaloesSituacoes,
  obterSituacaoJogo,
  criarSituacaoJogo,
  atualizarSituacaoJogo,
  apagarSituacaoJogo,
  importarSituacaoParaJogo,
  atualizarQuadroSituacao,
  guardarQuadroComoNovaSituacao,
  duplicarQuadroSituacao,
} from "@/lib/actions/situacoesJogo";
import { apagarQuadroTatico } from "@/lib/actions/modeloJogo";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

type MockFn = {
  mockResolvedValue: (v: unknown) => void;
  mockResolvedValueOnce: (v: unknown) => MockFn;
  mockRejectedValue: (v: unknown) => void;
  mockImplementation: (f: (...a: never[]) => unknown) => void;
  mock: { calls: unknown[][] };
};
const mocked = <T,>(fn: T) => fn as unknown as MockFn;

const CLUBE = "clube1";
const ESC_A = "ckv9v0z1w0000abcd1234efgh";
const ESC_B = "ckv9v0z1w0001abcd1234efgh";
const JOGO = "ckv9v0z1w0002abcd1234efgh";
const SIT = "ckv9v0z1w0003abcd1234efgh";
const CAT = "ckv9v0z1w0004abcd1234efgh";
const QUADRO = "ckv9v0z1w0005abcd1234efgh";
const SECCAO = "seccao-futsal";

const DIAGRAMA = {
  versao: 2 as const,
  campo: "FUTSAL_5" as const,
  elementos: [{ id: "j1", tipo: "jogador" as const, x: 100, y: 50, cor: "azul" as const }],
  passos: [{ id: "p1", ordem: 0, duracaoMs: 800, posicoes: [{ elementoId: "j1", x: 150, y: 60 }] }],
};

function membro(opts: {
  ambito: "TODO_CLUBE" | "SECCAO" | "PROPRIOS_ESCALOES";
  capacidades?: string[];
  atribuidos?: string[];
  seccoes?: string[];
}) {
  mocked(prisma.membroClube.findFirst).mockResolvedValue({
    id: "membro1",
    utilizadorId: "user1",
    clubeId: CLUBE,
    capacidadesExtra: [],
    capacidadesRevogadas: [],
    clube: { id: CLUBE, nome: "Clube" },
    perfil: { capacidades: opts.capacidades ?? ["MODELO_JOGO_GERIR"], ambito: opts.ambito },
    atribuicoes: (opts.atribuidos ?? []).map((escalaoId) => ({ escalaoId })),
    seccoes: (opts.seccoes ?? []).map((seccaoId) => ({ seccaoId })),
  });
}

const ESCALOES_CLUBE = [
  { id: ESC_A, nome: "Sub-13", seccaoId: SECCAO, ordem: 0 },
  { id: ESC_B, nome: "Sub-15", seccaoId: "outra", ordem: 1 },
];

/** Escalões do clube: A na secção coordenada, B fora (e marcado visível). */
function escaloesDoClube() {
  mocked(prisma.escalao.findFirst).mockImplementation(((args: {
    where: { id: string | { in: string[] }; clubeId: string; seccaoId?: { in: string[] } };
  }) => {
    const ids = typeof args.where.id === "string" ? [args.where.id] : args.where.id.in;
    const todos = [
      { id: ESC_A, seccaoId: SECCAO },
      { id: ESC_B, seccaoId: "outra" },
    ];
    const e = todos.find(
      (x) =>
        ids.includes(x.id) &&
        args.where.clubeId === CLUBE &&
        (!args.where.seccaoId || args.where.seccaoId.in.includes(x.seccaoId)),
    );
    return Promise.resolve(e ? { id: e.id } : null);
  }) as never);
}

const SITUACAO = {
  id: SIT,
  nome: "Saída de jogo 1",
  descricao: "Saída a 3",
  diagrama: DIAGRAMA,
  escalaoId: ESC_A,
  categoriaId: null,
  atualizadoEm: new Date(),
  escalao: { id: ESC_A, nome: "Sub-13" },
  categoria: null,
};

const QUADRO_SIT = {
  id: QUADRO,
  jogoId: JOGO,
  nome: "Saída de jogo 1",
  notas: "Notas do jogo",
  diagrama: DIAGRAMA,
  situacaoOrigemId: SIT,
  jogo: { escalaoId: ESC_A, formato: "FUTSAL_5" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(auth).mockResolvedValue({ user: { id: "user1" } });
  membro({ ambito: "TODO_CLUBE" });
  escaloesDoClube();
  mocked(prisma.escalao.findMany).mockImplementation(((args: {
    where: { clubeId: string; id?: { in: string[] }; seccaoId?: { in: string[] } };
  }) =>
    Promise.resolve(
      ESCALOES_CLUBE.filter(
        (e) =>
          args.where.clubeId === CLUBE &&
          (!args.where.id || args.where.id.in.includes(e.id)) &&
          (!args.where.seccaoId || args.where.seccaoId.in.includes(e.seccaoId)),
      ),
    )) as never);
  mocked(prisma.$executeRaw).mockResolvedValue(1);
  mocked(prisma.quadroTatico.findMany).mockResolvedValue([]);
  mocked(prisma.$transaction).mockImplementation(((fn: (tx: typeof prisma) => unknown) =>
    fn(prisma)) as never);
});

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

describe("schemas de situações", () => {
  it("nome reservado «Plano de jogo» recusado com variações de maiúsculas/espaços", () => {
    for (const n of ["Plano de jogo", "  plano DE JOGO  ", "PLANO DE JOGO"]) {
      const r = nomeSituacaoSchema.safeParse(n);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe(
        "Este nome está reservado ao quadro do plano de jogo.",
      );
    }
  });

  it("nome vazio e >100 recusados; trim aplicado", () => {
    expect(nomeSituacaoSchema.safeParse("   ").success).toBe(false);
    expect(nomeSituacaoSchema.safeParse("x".repeat(101)).success).toBe(false);
    expect(nomeSituacaoSchema.parse("  Livre lateral 3 ")).toBe("Livre lateral 3");
  });

  it("campo em falta na situação recusado; no quadro do jogo é aceite", () => {
    const { campo: _campo, ...semCampo } = DIAGRAMA;
    const r = situacaoJogoSchema.safeParse({ escalaoId: ESC_A, nome: "S", diagrama: semCampo });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Escolhe o campo da situação.");
    expect(quadroSituacaoSchema.safeParse({ nome: "S", diagrama: semCampo }).success).toBe(true);
  });

  it("categoria \"\"/null/undefined → sem categoria; cuid inválido recusado", () => {
    expect(referenciaCategoria.parse("")).toBeNull();
    expect(referenciaCategoria.parse(null)).toBeNull();
    expect(referenciaCategoria.parse(undefined)).toBeUndefined();
    expect(referenciaCategoria.safeParse("nao-cuid").success).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Acesso (RN-SJ-1 / RN-SJ-2)
// ─────────────────────────────────────────────

describe("acesso às situações", () => {
  it("PROPRIOS_ESCALOES não atribuído → recusa listar/obter/criar/editar/apagar/importar", async () => {
    membro({ ambito: "PROPRIOS_ESCALOES", atribuidos: [ESC_B] });
    mocked(prisma.situacaoJogo.findFirst).mockResolvedValue(SITUACAO);
    mocked(prisma.jogo.findFirst).mockResolvedValue({ id: JOGO, escalaoId: ESC_A });

    const resultados = [
      await listarSituacoesJogo({ escalaoId: ESC_A }),
      await obterSituacaoJogo(SIT),
      await criarSituacaoJogo({ escalaoId: ESC_A, nome: "S", diagrama: DIAGRAMA }),
      await atualizarSituacaoJogo(SIT, { nome: "S", diagrama: DIAGRAMA }),
      await apagarSituacaoJogo(SIT),
      await importarSituacaoParaJogo({ jogoId: JOGO, situacaoId: SIT }),
    ];
    for (const r of resultados) {
      expect(r.sucesso).toBe(false);
      if (!r.sucesso) expect(r.erro).toMatch(/permissão/i);
    }
    expect(prisma.situacaoJogo.create).not.toHaveBeenCalled();
    expect(prisma.situacaoJogo.update).not.toHaveBeenCalled();
    expect(prisma.situacaoJogo.delete).not.toHaveBeenCalled();
    expect(prisma.quadroTatico.create).not.toHaveBeenCalled();
  });

  it("PROPRIOS_ESCALOES lista só os escalões atribuídos (visivelOutrosTreinadores não concede)", async () => {
    membro({ ambito: "PROPRIOS_ESCALOES", atribuidos: [ESC_B] });
    mocked(prisma.situacaoJogo.findMany).mockResolvedValue([]);
    const r = await listarSituacoesJogo();
    expect(r.sucesso).toBe(true);
    const where = (mocked(prisma.situacaoJogo.findMany).mock.calls[0][0] as {
      where: { clubeId: string; escalaoId: { in: string[] } };
    }).where;
    expect(where).toMatchObject({ clubeId: CLUBE, escalaoId: { in: [ESC_B] } });
    // Uma só consulta, restrita aos atribuídos (sem `visivelOutrosTreinadores`).
    expect(prisma.escalao.findMany).toHaveBeenCalledTimes(1);
    expect(mocked(prisma.escalao.findMany).mock.calls[0][0]).toEqual({
      where: { clubeId: CLUBE, id: { in: [ESC_B] } },
      orderBy: { ordem: "asc" },
    });
  });

  it("SECCAO só acede aos escalões da secção coordenada", async () => {
    membro({ ambito: "SECCAO", seccoes: [SECCAO] });
    mocked(prisma.situacaoJogo.findMany).mockResolvedValue([]);

    const lista = await listarSituacoesJogo();
    expect(lista.sucesso).toBe(true);
    expect(mocked(prisma.escalao.findMany).mock.calls[0][0]).toEqual({
      where: { clubeId: CLUBE, seccaoId: { in: [SECCAO] } },
      orderBy: { ordem: "asc" },
    });
    expect(mocked(prisma.situacaoJogo.findMany).mock.calls[0][0]).toMatchObject({
      where: { escalaoId: { in: [ESC_A] } },
    });

    const fora = await listarSituacoesJogo({ escalaoId: ESC_B });
    expect(fora.sucesso).toBe(false);
    if (!fora.sucesso) expect(fora.erro).toBe("Sem permissão neste escalão");

    mocked(prisma.situacaoJogo.create).mockResolvedValue(SITUACAO);
    expect(
      (await criarSituacaoJogo({ escalaoId: ESC_A, nome: "S", diagrama: DIAGRAMA })).sucesso,
    ).toBe(true);
    expect(
      (await criarSituacaoJogo({ escalaoId: ESC_B, nome: "S", diagrama: DIAGRAMA })).sucesso,
    ).toBe(false);
  });

  it("sem MODELO_JOGO_GERIR → recusa (ex.: Presidente)", async () => {
    membro({ ambito: "TODO_CLUBE", capacidades: ["RELATORIOS_VER"] });
    const r = await listarSituacoesJogo();
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Sem permissão");
    expect((await listarCategoriasSituacao(ESC_A)).sucesso).toBe(false);
    expect(prisma.situacaoJogo.findMany).not.toHaveBeenCalled();
  });

  it("isolamento por clube: situação fora do clube → «Situação não encontrada»", async () => {
    mocked(prisma.situacaoJogo.findFirst).mockResolvedValue(null);
    const r = await obterSituacaoJogo(SIT);
    expect(r).toEqual({ sucesso: false, erro: "Situação não encontrada", camposInvalidos: undefined });
    expect(mocked(prisma.situacaoJogo.findFirst).mock.calls[0][0]).toMatchObject({
      where: { id: SIT, clubeId: CLUBE },
    });
  });

  it("listar aplica categoria, pesquisa insensível e ordem por nome", async () => {
    mocked(prisma.situacaoJogo.findMany).mockResolvedValue([SITUACAO]);
    const r = await listarSituacoesJogo({ escalaoId: ESC_A, categoriaId: CAT, q: " saída " });
    expect(r.sucesso).toBe(true);
    expect(mocked(prisma.situacaoJogo.findMany).mock.calls[0][0]).toMatchObject({
      where: {
        clubeId: CLUBE,
        escalaoId: { in: [ESC_A] },
        categoriaId: CAT,
        nome: { contains: "saída", mode: "insensitive" },
      },
      orderBy: { nome: "asc" },
    });
  });
});

// ─────────────────────────────────────────────
// Biblioteca: criar / atualizar / apagar
// ─────────────────────────────────────────────

describe("biblioteca de situações", () => {
  it("criar grava clubeId do contexto e diagrama com campo; «» → descrição null", async () => {
    mocked(prisma.situacaoJogo.create).mockResolvedValue(SITUACAO);
    const r = await criarSituacaoJogo({
      escalaoId: ESC_A,
      nome: " Saída de jogo 1 ",
      categoriaId: "",
      diagrama: DIAGRAMA,
    });
    expect(r.sucesso).toBe(true);
    expect(mocked(prisma.situacaoJogo.create).mock.calls[0][0]).toMatchObject({
      data: {
        clubeId: CLUBE,
        escalaoId: ESC_A,
        categoriaId: null,
        nome: "Saída de jogo 1",
        descricao: null,
        diagrama: DIAGRAMA,
      },
    });
  });

  it("nome repetido no escalão (P2002) → mensagem RN-SJ-4", async () => {
    mocked(prisma.situacaoJogo.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x" }),
    );
    const r = await criarSituacaoJogo({ escalaoId: ESC_A, nome: "S", diagrama: DIAGRAMA });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Já existe uma situação com este nome neste escalão.");
  });

  it("categoria de outro escalão recusada em criar e atualizar", async () => {
    mocked(prisma.categoriaSituacaoJogo.findFirst).mockResolvedValue(null);
    const c = await criarSituacaoJogo({
      escalaoId: ESC_A,
      nome: "S",
      categoriaId: CAT,
      diagrama: DIAGRAMA,
    });
    expect(c.sucesso).toBe(false);
    if (!c.sucesso) expect(c.erro).toBe("Categoria não encontrada neste escalão.");
    expect(mocked(prisma.categoriaSituacaoJogo.findFirst).mock.calls[0][0]).toMatchObject({
      where: { id: CAT, escalaoId: ESC_A, escalao: { clubeId: CLUBE } },
    });

    mocked(prisma.situacaoJogo.findFirst).mockResolvedValue(SITUACAO);
    const a = await atualizarSituacaoJogo(SIT, { nome: "S", categoriaId: CAT, diagrama: DIAGRAMA });
    expect(a.sucesso).toBe(false);
    expect(prisma.situacaoJogo.create).not.toHaveBeenCalled();
    expect(prisma.situacaoJogo.update).not.toHaveBeenCalled();
  });

  it("atualizarSituacaoJogo nunca escreve em QuadroTatico (RN-SJ-8)", async () => {
    mocked(prisma.situacaoJogo.findFirst).mockResolvedValue(SITUACAO);
    mocked(prisma.situacaoJogo.update).mockResolvedValue(SITUACAO);
    const r = await atualizarSituacaoJogo(SIT, { nome: "Outro nome", diagrama: DIAGRAMA });
    expect(r.sucesso).toBe(true);
    expect(prisma.quadroTatico.create).not.toHaveBeenCalled();
    expect(prisma.quadroTatico.update).not.toHaveBeenCalled();
    expect(prisma.quadroTatico.delete).not.toHaveBeenCalled();
  });

  it("apagar a situação faz delete simples (cópias seguem via SetNull)", async () => {
    mocked(prisma.situacaoJogo.findFirst).mockResolvedValue(SITUACAO);
    const r = await apagarSituacaoJogo(SIT);
    expect(r.sucesso).toBe(true);
    expect(prisma.situacaoJogo.delete).toHaveBeenCalledWith({ where: { id: SIT } });
    expect(prisma.quadroTatico.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// Categorias (RN-SJ-11)
// ─────────────────────────────────────────────

describe("categorias de situação", () => {
  it("listar valida o escalão (cuid) e ordena por ordem e nome", async () => {
    expect((await listarCategoriasSituacao("x")).sucesso).toBe(false);
    mocked(prisma.categoriaSituacaoJogo.findMany).mockResolvedValue([]);
    const r = await listarCategoriasSituacao(ESC_A);
    expect(r.sucesso).toBe(true);
    expect(mocked(prisma.categoriaSituacaoJogo.findMany).mock.calls[0][0]).toEqual({
      where: { escalaoId: ESC_A, escalao: { clubeId: CLUBE } },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });
  });

  it("nome único por escalão (P2002) → mensagem RN-SJ-11", async () => {
    mocked(prisma.categoriaSituacaoJogo.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x" }),
    );
    const r = await criarCategoriaSituacao({ escalaoId: ESC_A, nome: "Bolas paradas" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Já existe uma categoria com este nome neste escalão.");
  });

  it("apagar em uso recusado com a contagem", async () => {
    mocked(prisma.categoriaSituacaoJogo.findFirst).mockResolvedValue({ id: CAT, escalaoId: ESC_A });
    mocked(prisma.situacaoJogo.count).mockResolvedValue(2);
    const r = await apagarCategoriaSituacao(CAT);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) {
      expect(r.erro).toBe("Esta categoria está associada a 2 situação(ões) e não pode ser apagada.");
    }
    expect(prisma.categoriaSituacaoJogo.delete).not.toHaveBeenCalled();
  });

  it("acesso pela regra RN-SJ-1 no escalão da categoria; fora do clube → não encontrada", async () => {
    membro({ ambito: "PROPRIOS_ESCALOES", atribuidos: [ESC_B] });
    mocked(prisma.categoriaSituacaoJogo.findFirst).mockResolvedValue({ id: CAT, escalaoId: ESC_A });
    const r = await atualizarCategoriaSituacao(CAT, { nome: "Saídas", ordem: 1 });
    expect(r.sucesso).toBe(false);
    expect(prisma.categoriaSituacaoJogo.update).not.toHaveBeenCalled();
    expect((await criarCategoriaSituacao({ escalaoId: ESC_A, nome: "X" })).sucesso).toBe(false);

    mocked(prisma.categoriaSituacaoJogo.findFirst).mockResolvedValue(null);
    const fora = await apagarCategoriaSituacao(CAT);
    expect(fora.sucesso).toBe(false);
    if (!fora.sucesso) expect(fora.erro).toBe("Categoria não encontrada");
    expect(mocked(prisma.categoriaSituacaoJogo.findFirst).mock.calls.at(-1)?.[0]).toMatchObject({
      where: { id: CAT, escalao: { clubeId: CLUBE } },
    });
  });
});

// ─────────────────────────────────────────────
// Situações no jogo (snapshot — RN-SJ-5..14)
// ─────────────────────────────────────────────

describe("importarSituacaoParaJogo", () => {
  beforeEach(() => {
    mocked(prisma.jogo.findFirst).mockResolvedValue({ id: JOGO, escalaoId: ESC_A });
    mocked(prisma.situacaoJogo.findFirst).mockResolvedValue(SITUACAO);
    mocked(prisma.quadroTatico.findFirst).mockResolvedValue(null);
    mocked(prisma.quadroTatico.create).mockResolvedValue({ id: QUADRO });
  });

  it("cria cópia integral: diagrama deep-equal, notas = descrição, situacaoOrigemId", async () => {
    const r = await importarSituacaoParaJogo({ jogoId: JOGO, situacaoId: SIT });
    expect(r.sucesso).toBe(true);
    const data = (mocked(prisma.quadroTatico.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    }).data;
    expect(data).toEqual({
      jogoId: JOGO,
      nome: SITUACAO.nome,
      tipo: "GERAL",
      notas: SITUACAO.descricao,
      diagrama: DIAGRAMA,
      situacaoOrigemId: SIT,
    });
    expect(data.diagrama).toStrictEqual(SITUACAO.diagrama);
  });

  it("dupla importação recusada", async () => {
    mocked(prisma.quadroTatico.findFirst).mockResolvedValue({ id: QUADRO });
    const r = await importarSituacaoParaJogo({ jogoId: JOGO, situacaoId: SIT });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Esta situação já foi importada para este jogo.");
    expect(prisma.quadroTatico.create).not.toHaveBeenCalled();
  });

  it("nome igual a outro quadro do jogo recusado (RN-SJ-13)", async () => {
    mocked(prisma.quadroTatico.findMany).mockResolvedValue([
      { id: "q0", nome: "Plano de jogo" },
      { id: "q1", nome: "  SAÍDA DE JOGO 1 " },
    ]);
    const r = await importarSituacaoParaJogo({ jogoId: JOGO, situacaoId: SIT });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Já existe um quadro com este nome neste jogo.");
  });

  it("jogo fora do clube → «Jogo não encontrado»", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue(null);
    const r = await importarSituacaoParaJogo({ jogoId: JOGO, situacaoId: SIT });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Jogo não encontrado");
    expect(mocked(prisma.jogo.findFirst).mock.calls[0][0]).toMatchObject({
      where: { id: JOGO, escalao: { clubeId: CLUBE } },
    });
  });

  it("situação de outro escalão acessível é permitida; não acessível é recusada", async () => {
    membro({ ambito: "PROPRIOS_ESCALOES", atribuidos: [ESC_A, ESC_B] });
    mocked(prisma.situacaoJogo.findFirst).mockResolvedValue({ ...SITUACAO, escalaoId: ESC_B });
    expect((await importarSituacaoParaJogo({ jogoId: JOGO, situacaoId: SIT })).sucesso).toBe(true);

    membro({ ambito: "PROPRIOS_ESCALOES", atribuidos: [ESC_A] });
    expect((await importarSituacaoParaJogo({ jogoId: JOGO, situacaoId: SIT })).sucesso).toBe(false);
  });
});

describe("gestão de quadros de situação no jogo", () => {
  beforeEach(() => {
    mocked(prisma.quadroTatico.findFirst).mockResolvedValue(QUADRO_SIT);
    mocked(prisma.quadroTatico.update).mockResolvedValue({ id: QUADRO });
    mocked(prisma.quadroTatico.create).mockResolvedValue({ id: "variante" });
  });

  it("atualizarQuadroSituacao grava só no quadro e mantém situacaoOrigemId", async () => {
    const r = await atualizarQuadroSituacao(QUADRO, { nome: "Saída 1 (jogo)", diagrama: DIAGRAMA });
    expect(r.sucesso).toBe(true);
    expect(prisma.situacaoJogo.update).not.toHaveBeenCalled();
    expect(prisma.situacaoJogo.create).not.toHaveBeenCalled();
    expect(prisma.quadroTatico.update).toHaveBeenCalledWith({
      where: { id: QUADRO },
      data: { nome: "Saída 1 (jogo)", notas: null, diagrama: DIAGRAMA },
    });
  });

  it("quadro «Plano de jogo» recusado em editar/guardar como nova/duplicar", async () => {
    mocked(prisma.quadroTatico.findFirst).mockResolvedValue({ ...QUADRO_SIT, nome: "Plano de jogo" });
    const rs = [
      await atualizarQuadroSituacao(QUADRO, { nome: "X", diagrama: DIAGRAMA }),
      await guardarQuadroComoNovaSituacao(QUADRO, { nome: "X", diagrama: DIAGRAMA }),
      await duplicarQuadroSituacao(QUADRO, { nome: "X" }),
    ];
    for (const r of rs) {
      expect(r.sucesso).toBe(false);
      if (!r.sucesso) expect(r.erro).toBe("Este quadro não é uma situação de jogo.");
    }
    expect(prisma.quadroTatico.update).not.toHaveBeenCalled();
    expect(prisma.quadroTatico.create).not.toHaveBeenCalled();
  });

  it("guardar como nova cria no escalão do jogo (transação) e reaponta situacaoOrigemId", async () => {
    mocked(prisma.situacaoJogo.create).mockResolvedValue({ ...SITUACAO, id: "nova" });
    const { campo: _c, ...semCampo } = DIAGRAMA;
    const r = await guardarQuadroComoNovaSituacao(QUADRO, {
      nome: "Saída de jogo 2",
      notas: "variante",
      diagrama: semCampo,
    });
    expect(r.sucesso).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const esperado = { ...semCampo, campo: "FUTSAL_5" };
    expect(mocked(prisma.situacaoJogo.create).mock.calls[0][0]).toMatchObject({
      data: {
        clubeId: CLUBE,
        escalaoId: ESC_A,
        categoriaId: null,
        nome: "Saída de jogo 2",
        descricao: "variante",
        diagrama: esperado,
      },
    });
    expect(prisma.quadroTatico.update).toHaveBeenCalledWith({
      where: { id: QUADRO },
      data: { nome: "Saída de jogo 2", notas: "variante", diagrama: esperado, situacaoOrigemId: "nova" },
    });
    expect(prisma.situacaoJogo.update).not.toHaveBeenCalled();
  });

  it("guardar como nova: campo em falta usa o formato do jogo", async () => {
    mocked(prisma.quadroTatico.findFirst).mockResolvedValue({
      ...QUADRO_SIT,
      jogo: { escalaoId: ESC_A, formato: "FUTEBOL_7" },
    });
    mocked(prisma.situacaoJogo.create).mockResolvedValue({ ...SITUACAO, id: "nova" });
    const { campo: _c, ...semCampo } = DIAGRAMA;
    await guardarQuadroComoNovaSituacao(QUADRO, { nome: "S2", diagrama: semCampo });
    expect(mocked(prisma.situacaoJogo.create).mock.calls[0][0]).toMatchObject({
      data: { diagrama: { campo: "FUTEBOL_7" } },
    });
  });

  it("guardar como nova: categoria de outro escalão recusada; nome repetido no escalão → nada gravado", async () => {
    mocked(prisma.categoriaSituacaoJogo.findFirst).mockResolvedValue(null);
    const c = await guardarQuadroComoNovaSituacao(QUADRO, {
      nome: "S2",
      categoriaId: CAT,
      diagrama: DIAGRAMA,
    });
    expect(c.sucesso).toBe(false);
    if (!c.sucesso) expect(c.erro).toBe("Categoria não encontrada neste escalão.");
    expect(mocked(prisma.categoriaSituacaoJogo.findFirst).mock.calls[0][0]).toMatchObject({
      where: { id: CAT, escalaoId: ESC_A },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();

    mocked(prisma.situacaoJogo.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x" }),
    );
    const d = await guardarQuadroComoNovaSituacao(QUADRO, { nome: "S2", diagrama: DIAGRAMA });
    expect(d.sucesso).toBe(false);
    if (!d.sucesso) expect(d.erro).toBe("Já existe uma situação com este nome neste escalão.");
    expect(prisma.quadroTatico.update).not.toHaveBeenCalled();
  });

  it("duplicar copia notas/diagrama e mantém situacaoOrigemId", async () => {
    const r = await duplicarQuadroSituacao(QUADRO, { nome: "Saída de jogo 1 (variante)" });
    expect(r.sucesso).toBe(true);
    expect(prisma.quadroTatico.create).toHaveBeenCalledWith({
      data: {
        jogoId: JOGO,
        nome: "Saída de jogo 1 (variante)",
        tipo: "GERAL",
        notas: QUADRO_SIT.notas,
        diagrama: DIAGRAMA,
        situacaoOrigemId: SIT,
      },
    });
    expect(prisma.situacaoJogo.create).not.toHaveBeenCalled();
    expect(prisma.situacaoJogo.update).not.toHaveBeenCalled();
  });

  it("duplicar com nome repetido no jogo recusado (RN-SJ-13)", async () => {
    mocked(prisma.quadroTatico.findMany).mockResolvedValue([
      { id: QUADRO, nome: "Saída de jogo 1" },
    ]);
    const r = await duplicarQuadroSituacao(QUADRO, { nome: "saída de jogo 1" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Já existe um quadro com este nome neste jogo.");
    expect(prisma.quadroTatico.create).not.toHaveBeenCalled();
  });

  it("editar o próprio quadro com o mesmo nome é permitido", async () => {
    mocked(prisma.quadroTatico.findMany).mockResolvedValue([
      { id: QUADRO, nome: "Saída de jogo 1" },
    ]);
    const r = await atualizarQuadroSituacao(QUADRO, { nome: "Saída de jogo 1", diagrama: DIAGRAMA });
    expect(r.sucesso).toBe(true);
  });

  it("treinador PROPRIOS_ESCALOES não atribuído ao escalão do jogo recusado (RN-SJ-12)", async () => {
    membro({ ambito: "PROPRIOS_ESCALOES", atribuidos: [ESC_B] });
    mocked(prisma.jogo.findFirst).mockResolvedValue({ id: JOGO, escalaoId: ESC_A });
    mocked(prisma.situacaoJogo.findFirst).mockResolvedValue({ ...SITUACAO, escalaoId: ESC_B });
    mocked(prisma.quadroTatico.findFirst).mockResolvedValue({
      ...QUADRO_SIT,
      jogo: { escalaoId: ESC_A },
    });
    const rs = [
      await importarSituacaoParaJogo({ jogoId: JOGO, situacaoId: SIT }),
      await atualizarQuadroSituacao(QUADRO, { nome: "X", diagrama: DIAGRAMA }),
      await duplicarQuadroSituacao(QUADRO, { nome: "X" }),
      await apagarQuadroTatico(QUADRO),
    ];
    for (const r of rs) {
      expect(r.sucesso).toBe(false);
      if (!r.sucesso) expect(r.erro).toBe("Sem permissão neste escalão");
    }
    expect(prisma.quadroTatico.create).not.toHaveBeenCalled();
    expect(prisma.quadroTatico.update).not.toHaveBeenCalled();
    expect(prisma.quadroTatico.delete).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// listarEscaloesSituacoes (fonte única dos seletores — RN-SJ-2)
// ─────────────────────────────────────────────

describe("listarEscaloesSituacoes", () => {
  it("TODO_CLUBE → todos os escalões do clube numa só consulta", async () => {
    const r = await listarEscaloesSituacoes();
    expect(r).toEqual({ sucesso: true, dados: ESCALOES_CLUBE });
    expect(prisma.escalao.findMany).toHaveBeenCalledTimes(1);
  });

  it("SECCAO → só os da secção coordenada; PROPRIOS_ESCALOES → só os atribuídos", async () => {
    membro({ ambito: "SECCAO", seccoes: [SECCAO] });
    const s = await listarEscaloesSituacoes();
    expect(s.sucesso && s.dados.map((e) => e.id)).toEqual([ESC_A]);

    membro({ ambito: "PROPRIOS_ESCALOES", atribuidos: [ESC_B] });
    const p = await listarEscaloesSituacoes();
    expect(p.sucesso && p.dados.map((e) => e.id)).toEqual([ESC_B]);
  });

  it("sem MODELO_JOGO_GERIR → erro, sem consulta", async () => {
    membro({ ambito: "TODO_CLUBE", capacidades: ["RELATORIOS_VER"] });
    const r = await listarEscaloesSituacoes();
    expect(r.sucesso).toBe(false);
    expect(prisma.escalao.findMany).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// Atomicidade (advisory lock por jogo) e corrida em apagar categoria
// ─────────────────────────────────────────────

describe("atomicidade das escritas no jogo", () => {
  function ordem(fn: unknown): number {
    return (fn as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0];
  }

  it("importar: lock do jogo na transação antes das verificações e da escrita", async () => {
    mocked(prisma.jogo.findFirst).mockResolvedValue({ id: JOGO, escalaoId: ESC_A });
    mocked(prisma.situacaoJogo.findFirst).mockResolvedValue(SITUACAO);
    mocked(prisma.quadroTatico.findFirst).mockResolvedValue(null);
    mocked(prisma.quadroTatico.create).mockResolvedValue({ id: QUADRO });

    const r = await importarSituacaoParaJogo({ jogoId: JOGO, situacaoId: SIT });
    expect(r.sucesso).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const sql = mocked(prisma.$executeRaw).mock.calls[0];
    expect((sql[0] as string[]).join("?")).toContain("pg_advisory_xact_lock");
    expect(sql[1]).toBe(`situacoes-jogo:${JOGO}`);
    expect(ordem(prisma.$executeRaw)).toBeLessThan(ordem(prisma.quadroTatico.findFirst));
    expect(ordem(prisma.$executeRaw)).toBeLessThan(ordem(prisma.quadroTatico.findMany));
    expect(ordem(prisma.$executeRaw)).toBeLessThan(ordem(prisma.quadroTatico.create));
  });

  it("editar, duplicar e guardar como nova verificam o nome sob o mesmo lock", async () => {
    mocked(prisma.quadroTatico.findFirst).mockResolvedValue(QUADRO_SIT);
    mocked(prisma.quadroTatico.update).mockResolvedValue({ id: QUADRO });
    mocked(prisma.quadroTatico.create).mockResolvedValue({ id: "variante" });
    mocked(prisma.situacaoJogo.create).mockResolvedValue({ ...SITUACAO, id: "nova" });

    await atualizarQuadroSituacao(QUADRO, { nome: "A", diagrama: DIAGRAMA });
    await duplicarQuadroSituacao(QUADRO, { nome: "B" });
    await guardarQuadroComoNovaSituacao(QUADRO, { nome: "C", diagrama: DIAGRAMA });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    const chaves = mocked(prisma.$executeRaw).mock.calls.map((c) => c[1]);
    expect(chaves).toEqual(Array(3).fill(`situacoes-jogo:${JOGO}`));
  });

  it("nome repetido detetado dentro do lock → nada é escrito", async () => {
    mocked(prisma.quadroTatico.findFirst).mockResolvedValue(QUADRO_SIT);
    mocked(prisma.quadroTatico.findMany).mockResolvedValue([{ id: "outro", nome: "c" }]);
    const r = await guardarQuadroComoNovaSituacao(QUADRO, { nome: "C", diagrama: DIAGRAMA });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Já existe um quadro com este nome neste jogo.");
    expect(prisma.situacaoJogo.create).not.toHaveBeenCalled();
    expect(prisma.quadroTatico.update).not.toHaveBeenCalled();
  });

  it("apagar categoria: FK violada por corrida (P2003) → mensagem RN-SJ-11", async () => {
    mocked(prisma.categoriaSituacaoJogo.findFirst).mockResolvedValue({ id: CAT, escalaoId: ESC_A });
    mocked(prisma.situacaoJogo.count).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    mocked(prisma.categoriaSituacaoJogo.delete).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("fk", { code: "P2003", clientVersion: "x" }),
    );
    const r = await apagarCategoriaSituacao(CAT);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) {
      expect(r.erro).toBe("Esta categoria está associada a 1 situação(ões) e não pode ser apagada.");
    }
  });
});
