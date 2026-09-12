import { describe, it, expect, beforeEach, vi } from "vitest";

// Evitar instanciar um PrismaClient real ao importar o módulo (default db param).
vi.mock("@/lib/db", () => ({ prisma: {} }));

import {
  instalarSubcategoriasFutsal,
  instalarBibliotecaArranqueFutsal,
  instalarTemplatesArranqueFutsal,
  instalarConteudoArranqueFutsal,
  instalarConteudoArranquePorModalidade,
} from "@/lib/biblioteca-arranque-instalar";
import { BIBLIOTECA_ARRANQUE } from "@/lib/biblioteca-arranque";
import { SUBCATEGORIAS_ARRANQUE } from "@/lib/subcategorias-arranque";
import { TEMPLATES_ARRANQUE } from "@/lib/templates-arranque";

// ─── Fake Prisma em memória (mesmo padrão de tests/biblioteca-futebol.test.ts) ─
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

describe("Fase 30 — instaladores idempotentes de futsal (§8.1.1)", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = criarFakeDb();
  });

  it("instala subcategorias e é idempotente", async () => {
    const r1 = await instalarSubcategoriasFutsal(CLUBE, db);
    expect(r1.criadas).toBe(SUBCATEGORIAS_ARRANQUE.length);
    const r2 = await instalarSubcategoriasFutsal(CLUBE, db);
    expect(r2.criadas).toBe(0);
  });

  it("instala a biblioteca (modalidade null = genérico, origemSeed) e é idempotente", async () => {
    const r1 = await instalarBibliotecaArranqueFutsal(CLUBE, db);
    expect(r1.criados).toBe(BIBLIOTECA_ARRANQUE.length);
    for (const e of db.exercicio.linhas) {
      expect(e.modalidade).toBeNull();
      expect(e.origemSeed).toBe(true);
      expect(e.proprietario).toBe("CLUBE");
      expect(e.clubeProprietarioId).toBe(CLUBE);
      expect(e.autorId).toBe("u1");
    }
    const r2 = await instalarBibliotecaArranqueFutsal(CLUBE, db);
    expect(r2.criados).toBe(0);
  });

  it("instala templates ligados aos exercícios e é idempotente", async () => {
    await instalarBibliotecaArranqueFutsal(CLUBE, db);
    const r1 = await instalarTemplatesArranqueFutsal(CLUBE, db);
    expect(r1.criados).toBe(TEMPLATES_ARRANQUE.length);
    for (const m of db.modeloSessao.linhas) {
      expect(m.modalidade).toBeNull();
      expect(m.origemSeed).toBe(true);
    }
    expect(db.modeloSessaoExercicio.linhas.length).toBe(
      TEMPLATES_ARRANQUE.reduce((n, t) => n + t.exercicios.length, 0),
    );
    const r2 = await instalarTemplatesArranqueFutsal(CLUBE, db);
    expect(r2.criados).toBe(0);
  });

  it("instalar templates sem biblioteca falha com mensagem clara", async () => {
    await expect(instalarTemplatesArranqueFutsal(CLUBE, db)).rejects.toThrow(/biblioteca de futsal/i);
  });

  it("a orquestração de futsal instala tudo e é idempotente na 2.ª corrida", async () => {
    const r1 = await instalarConteudoArranqueFutsal(CLUBE, db);
    expect(r1.subcategorias).toBe(SUBCATEGORIAS_ARRANQUE.length);
    expect(r1.exercicios).toBe(BIBLIOTECA_ARRANQUE.length);
    expect(r1.templates).toBe(TEMPLATES_ARRANQUE.length);

    const r2 = await instalarConteudoArranqueFutsal(CLUBE, db);
    expect(r2).toEqual({ subcategorias: 0, exercicios: 0, templates: 0 });
  });

  it("falha se o clube não tiver membros (criador não resolúvel)", async () => {
    db.membroClube.linhas.length = 0;
    await expect(instalarBibliotecaArranqueFutsal(CLUBE, db)).rejects.toThrow(/membro/i);
  });
});

describe("instalarConteudoArranquePorModalidade — dispatcher (§8.1.1)", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = criarFakeDb();
  });

  it("FUTSAL instala o conteúdo de futsal (exercícios modalidade null)", async () => {
    const r = await instalarConteudoArranquePorModalidade(CLUBE, "FUTSAL", db);
    expect(r.exercicios).toBe(BIBLIOTECA_ARRANQUE.length);
    expect(db.exercicio.linhas.every((e: Registo) => e.modalidade === null)).toBe(true);
  });

  it("FUTEBOL instala o conteúdo de futebol (exercícios modalidade FUTEBOL)", async () => {
    const r = await instalarConteudoArranquePorModalidade(CLUBE, "FUTEBOL", db);
    expect(r.exercicios).toBeGreaterThan(0);
    expect(db.exercicio.linhas.every((e: Registo) => e.modalidade === "FUTEBOL")).toBe(true);
  });
});
