import { describe, it, expect, beforeEach, vi } from "vitest";

// Evitar instanciar um PrismaClient real ao importar o módulo (default db param).
vi.mock("@/lib/db", () => ({ prisma: {} }));

import {
  EXERCICIOS_ARRANQUE_FUTEBOL,
  SUBCATEGORIAS_ARRANQUE_FUTEBOL,
  instalarSubcategoriasFutebol,
  instalarBibliotecaArranqueFutebol,
  instalarTemplatesArranqueFutebol,
  instalarConteudoArranqueFutebol,
} from "@/lib/biblioteca-arranque-futebol";
import { TEMPLATES_ARRANQUE_FUTEBOL } from "@/lib/templates-arranque";

const CATEGORIAS_VALIDAS = [
  "ATAQUE",
  "DEFESA",
  "TRANSICAO",
  "BOLAS_PARADAS",
  "FISICO",
  "GUARDA_REDES",
  "OUTRO",
];
const PARTES_VALIDAS = ["AQUECIMENTO", "PRINCIPAL", "JOGO_REDUZIDO", "RETORNO_CALMA"];

// ─── Fake Prisma em memória (só as operações usadas pelos instaladores) ────────
type Registo = Record<string, unknown>;

function corresponde(registo: Registo, where: Registo | undefined): boolean {
  if (!where) return true;
  for (const [chave, valor] of Object.entries(where)) {
    if (valor && typeof valor === "object" && "in" in (valor as Registo)) {
      const lista = (valor as { in: unknown[] }).in;
      if (!lista.includes(registo[chave])) return false;
    } else if (registo[chave] !== valor) {
      return false;
    }
  }
  return true;
}

function criarTabela() {
  const linhas: Registo[] = [];
  let contador = 0;
  return {
    linhas,
    findMany: vi.fn(async (args?: { where?: Registo }) =>
      linhas.filter((r) => corresponde(r, args?.where)),
    ),
    findFirst: vi.fn(async (args?: { where?: Registo }) =>
      linhas.find((r) => corresponde(r, args?.where)) ?? null,
    ),
    createMany: vi.fn(async (args: { data: Registo[] }) => {
      for (const d of args.data) linhas.push({ id: `id-${++contador}`, ...d });
      return { count: args.data.length };
    }),
    create: vi.fn(async (args: { data: Registo }) => {
      const registo = { id: `id-${++contador}`, ...args.data };
      linhas.push(registo);
      return registo;
    }),
  };
}

function criarFakeDb() {
  const membroClube = criarTabela();
  membroClube.linhas.push({ id: "m1", clubeId: "clube1", utilizadorId: "u1", criadoEm: new Date() });
  return {
    membroClube,
    subcategoriaExercicio: criarTabela(),
    exercicio: criarTabela(),
    modeloSessao: criarTabela(),
    modeloSessaoExercicio: criarTabela(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FakeDb = ReturnType<typeof criarFakeDb> & any;

const CLUBE = "clube1";

describe("Fase 29 — dados curados de futebol", () => {
  it("tem ~15 exercícios com categorias e partes válidas", () => {
    expect(EXERCICIOS_ARRANQUE_FUTEBOL.length).toBeGreaterThanOrEqual(15);
    for (const ex of EXERCICIOS_ARRANQUE_FUTEBOL) {
      expect(CATEGORIAS_VALIDAS).toContain(ex.categoriaPrincipal);
      expect(PARTES_VALIDAS).toContain(ex.parteTreino);
      expect(ex.nome.trim().length).toBeGreaterThan(0);
      expect(ex.descricao.trim().length).toBeGreaterThan(0);
      expect(ex.objetivo.trim().length).toBeGreaterThan(0);
      expect(ex.duracaoMin).toBeGreaterThan(0);
    }
  });

  it("não tem nomes de exercício duplicados", () => {
    const nomes = EXERCICIOS_ARRANQUE_FUTEBOL.map((e) => e.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("cobre as áreas mínimas do plano (aquecimento, técnica, bolas paradas, GR)", () => {
    const cats = new Set(EXERCICIOS_ARRANQUE_FUTEBOL.map((e) => e.categoriaPrincipal));
    expect(cats.has("BOLAS_PARADAS")).toBe(true);
    expect(cats.has("GUARDA_REDES")).toBe(true);
    expect(cats.has("FISICO")).toBe(true);
    const partes = new Set(EXERCICIOS_ARRANQUE_FUTEBOL.map((e) => e.parteTreino));
    expect(partes.has("AQUECIMENTO")).toBe(true);
    expect(partes.has("PRINCIPAL")).toBe(true);
  });

  it("as subcategorias têm categorias válidas do enum", () => {
    expect(SUBCATEGORIAS_ARRANQUE_FUTEBOL.length).toBeGreaterThan(0);
    for (const s of SUBCATEGORIAS_ARRANQUE_FUTEBOL) {
      expect(CATEGORIAS_VALIDAS).toContain(s.categoria);
      expect(s.nome.trim().length).toBeGreaterThan(0);
    }
  });

  it("os exercícios referenciados pelos templates existem na biblioteca", () => {
    const nomesBiblioteca = new Set(EXERCICIOS_ARRANQUE_FUTEBOL.map((e) => e.nome));
    for (const t of TEMPLATES_ARRANQUE_FUTEBOL) {
      for (const ex of t.exercicios) {
        expect(nomesBiblioteca.has(ex.nomeExercicio)).toBe(true);
      }
    }
  });

  it("as subcategorias referenciadas pelos exercícios existem", () => {
    const nomesSub = new Set(SUBCATEGORIAS_ARRANQUE_FUTEBOL.map((s) => s.nome));
    for (const ex of EXERCICIOS_ARRANQUE_FUTEBOL) {
      if (ex.subcategoria) expect(nomesSub.has(ex.subcategoria)).toBe(true);
    }
  });
});

describe("Fase 29 — instaladores idempotentes de futebol", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = criarFakeDb();
  });

  it("instala subcategorias e é idempotente", async () => {
    const r1 = await instalarSubcategoriasFutebol(CLUBE, db);
    expect(r1.criadas).toBe(SUBCATEGORIAS_ARRANQUE_FUTEBOL.length);
    const r2 = await instalarSubcategoriasFutebol(CLUBE, db);
    expect(r2.criadas).toBe(0);
    expect(db.subcategoriaExercicio.linhas.length).toBe(SUBCATEGORIAS_ARRANQUE_FUTEBOL.length);
  });

  it("instala a biblioteca (modalidade FUTEBOL, origemSeed) e é idempotente", async () => {
    await instalarSubcategoriasFutebol(CLUBE, db);
    const r1 = await instalarBibliotecaArranqueFutebol(CLUBE, db);
    expect(r1.criados).toBe(EXERCICIOS_ARRANQUE_FUTEBOL.length);
    for (const e of db.exercicio.linhas) {
      expect(e.modalidade).toBe("FUTEBOL");
      expect(e.origemSeed).toBe(true);
      expect(e.proprietario).toBe("CLUBE");
    }
    // As subcategorias foram ligadas.
    const comSub = db.exercicio.linhas.filter((e: Registo) => e.subcategoriaId);
    expect(comSub.length).toBeGreaterThan(0);
    const r2 = await instalarBibliotecaArranqueFutebol(CLUBE, db);
    expect(r2.criados).toBe(0);
  });

  it("instala templates ligados aos exercícios e é idempotente", async () => {
    await instalarSubcategoriasFutebol(CLUBE, db);
    await instalarBibliotecaArranqueFutebol(CLUBE, db);
    const r1 = await instalarTemplatesArranqueFutebol(CLUBE, db);
    expect(r1.criados).toBe(TEMPLATES_ARRANQUE_FUTEBOL.length);
    for (const m of db.modeloSessao.linhas) {
      expect(m.modalidade).toBe("FUTEBOL");
      expect(m.origemSeed).toBe(true);
    }
    expect(db.modeloSessaoExercicio.linhas.length).toBe(
      TEMPLATES_ARRANQUE_FUTEBOL.reduce((n, t) => n + t.exercicios.length, 0),
    );
    const r2 = await instalarTemplatesArranqueFutebol(CLUBE, db);
    expect(r2.criados).toBe(0);
  });

  it("instalar templates sem biblioteca falha com mensagem clara", async () => {
    await expect(instalarTemplatesArranqueFutebol(CLUBE, db)).rejects.toThrow(
      /biblioteca de futebol/i,
    );
  });

  it("a orquestração instala tudo e é idempotente na 2.ª corrida", async () => {
    const r1 = await instalarConteudoArranqueFutebol(CLUBE, db);
    expect(r1.subcategorias).toBe(SUBCATEGORIAS_ARRANQUE_FUTEBOL.length);
    expect(r1.exercicios).toBe(EXERCICIOS_ARRANQUE_FUTEBOL.length);
    expect(r1.templates).toBe(TEMPLATES_ARRANQUE_FUTEBOL.length);

    const r2 = await instalarConteudoArranqueFutebol(CLUBE, db);
    expect(r2).toEqual({ subcategorias: 0, exercicios: 0, templates: 0 });
  });

  it("falha se o clube não tiver membros (criador não resolúvel)", async () => {
    db.membroClube.linhas.length = 0;
    await expect(instalarBibliotecaArranqueFutebol(CLUBE, db)).rejects.toThrow(/membro/i);
  });
});
