import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Regressão 2026-10-26 (§19): /treinos/[id] (e /exercicios, /definicoes/subcategorias)
// rebentava em produção porque a BD já tinha `SubcategoriaExercicio.categorias`
// (migração 20261012120000_subcategoria_multi_categoria, que remove `categoria`) e o
// código ainda lia/ordenava pela coluna antiga `categoria` → P2022 em listarSubcategorias().

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/epoca-context", () => ({ obterClubeIdAtual: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({ exigirCapacidade: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: { subcategoriaExercicio: { findMany: vi.fn() } },
}));

import { listarSubcategorias } from "@/lib/actions/subcategorias";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { prisma } from "@/lib/db";
import { subcategoriaSchema } from "@/lib/schemas/subcategoria";

const findMany = prisma.subcategoriaExercicio.findMany as unknown as ReturnType<typeof vi.fn>;

describe("listarSubcategorias — coluna `categorias` (array)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (obterClubeIdAtual as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("clube1");
    findMany.mockResolvedValue([
      { id: "s1", nome: "Finalização", categorias: ["ATAQUE"], ordem: 0 },
    ]);
  });

  it("sem filtro não referencia a coluna removida `categoria`", async () => {
    const r = await listarSubcategorias();
    expect(r.sucesso).toBe(true);
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ clubeId: "clube1" });
    expect(JSON.stringify(args)).not.toMatch(/"categoria"/);
    expect(args.orderBy).toEqual([{ ordem: "asc" }, { nome: "asc" }]);
  });

  it("com categoria filtra por `categorias: { has }`", async () => {
    await listarSubcategorias("DEFESA");
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ clubeId: "clube1", categorias: { has: "DEFESA" } });
    expect(JSON.stringify(args)).not.toMatch(/"categoria"/);
  });
});

describe("subcategoriaSchema — categorias (≥1, sem duplicados)", () => {
  it("aceita várias categorias e remove duplicados", () => {
    const r = subcategoriaSchema.safeParse({
      nome: "Transição",
      categorias: ["ATAQUE", "DEFESA", "ATAQUE"],
      ordem: 0,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.categorias).toEqual(["ATAQUE", "DEFESA"]);
  });

  it("recusa lista vazia (espelha o CHECK da BD)", () => {
    expect(subcategoriaSchema.safeParse({ nome: "X", categorias: [], ordem: 0 }).success).toBe(
      false,
    );
  });
});

describe("schema Prisma ↔ migrações (sem drift em SubcategoriaExercicio)", () => {
  const raiz = join(__dirname, "..");
  const schema = readFileSync(join(raiz, "prisma/schema.prisma"), "utf8");
  const modelo = schema.slice(
    schema.indexOf("model SubcategoriaExercicio {"),
    schema.indexOf("}", schema.indexOf("model SubcategoriaExercicio {")),
  );

  it("o modelo usa `categorias` (array) e já não tem `categoria`", () => {
    expect(modelo).toMatch(/^\s+categorias\s+CategoriaExercicioPrincipal\[\]/m);
    expect(modelo).not.toMatch(/^\s+categoria\s+CategoriaExercicioPrincipal\b/m);
  });

  it("a migração que remove `categoria` está versionada no repositório", () => {
    const sql = join(
      raiz,
      "prisma/migrations/20261012120000_subcategoria_multi_categoria/migration.sql",
    );
    expect(existsSync(sql)).toBe(true);
    const conteudo = readFileSync(sql, "utf8");
    expect(conteudo).toMatch(/ADD COLUMN "categorias"/);
    expect(conteudo).toMatch(/DROP COLUMN "categoria"/);
  });
});
