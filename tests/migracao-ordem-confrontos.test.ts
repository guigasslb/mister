import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { ORDER_RESULTADOS } from "@/lib/ordem-confrontos";

// R6 (2026-10-20): migração 20261020120000_ordem_confrontos — coluna + backfill.
// O ORDER BY do backfill é comparado com a fonte independente usada nas leituras
// (`ORDER_RESULTADOS`, sem a própria `ordem`), campo a campo.

const raiz = join(__dirname, "..");
const sql = readFileSync(join(raiz, "prisma/migrations/20261020120000_ordem_confrontos/migration.sql"), "utf8");
const schema = readFileSync(join(raiz, "prisma/schema.prisma"), "utf8");
const semComentarios = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

type Termo = { campo: string; direcao: "ASC" | "DESC"; nulls: "FIRST" | "LAST" };

/** Termos do ORDER BY dentro do ROW_NUMBER() do backfill (NULLS por omissão do Postgres). */
function termosBackfill(): Termo[] {
  const m = semComentarios.match(/ROW_NUMBER\(\) OVER \(\s*PARTITION BY "competicaoId"\s*ORDER BY ([^)]*)\)/);
  expect(m).not.toBeNull();
  return (m?.[1] ?? "").split(",").map((t) => {
    const [, campo, dir, nulls] = t.trim().match(/^"(\w+)"\s+(ASC|DESC)(?:\s+NULLS\s+(FIRST|LAST))?$/) ?? [];
    const direcao = dir as Termo["direcao"];
    // Postgres: ASC ⇒ NULLS LAST, DESC ⇒ NULLS FIRST por omissão.
    return { campo, direcao, nulls: (nulls as Termo["nulls"]) ?? (direcao === "ASC" ? "LAST" : "FIRST") };
  });
}

/** Mapeia um termo do orderBy do Prisma para a semântica SQL equivalente no Postgres. */
function termoPrisma(o: Prisma.ResultadoCompeticaoOrderByWithRelationInput): Termo {
  const [[campo, v]] = Object.entries(o);
  const sort = typeof v === "string" ? v : (v as { sort: "asc" | "desc"; nulls?: "first" | "last" }).sort;
  const nulls = typeof v === "string" ? undefined : (v as { nulls?: "first" | "last" }).nulls;
  const direcao = sort === "asc" ? "ASC" : "DESC";
  return { campo, direcao, nulls: nulls ? (nulls.toUpperCase() as Termo["nulls"]) : direcao === "ASC" ? "LAST" : "FIRST" };
}


describe("migração ordem_confrontos", () => {
  it("só acrescenta a coluna nullable (sem índice/unique) e não toca no índice parcial §23.11.2", () => {
    expect(semComentarios).toMatch(/ALTER TABLE "ResultadoCompeticao" ADD COLUMN\s+"ordem" INTEGER;/);
    expect(semComentarios).not.toMatch(/DROP|CREATE (UNIQUE )?INDEX/i);
    expect(semComentarios).not.toContain("Jogo_resultadoCompeticaoId_sem_equipa_key");
  });

  it("schema.prisma coerente: ResultadoCompeticao.ordem Int?", () => {
    const modelo = schema.slice(schema.indexOf("model ResultadoCompeticao {"));
    expect(modelo.slice(0, modelo.indexOf("\n}"))).toMatch(/\n\s+ordem\s+Int\?/);
  });

  it("ORDER_RESULTADOS começa pela ordem persistida (asc, nulls last)", () => {
    expect(termoPrisma(ORDER_RESULTADOS[0])).toEqual({ campo: "ordem", direcao: "ASC", nulls: "LAST" });
  });

  it("o ORDER BY do backfill = ORDER_RESULTADOS sem `ordem`, campo a campo (direção e NULLS)", () => {
    expect(termosBackfill()).toEqual(ORDER_RESULTADOS.slice(1).map(termoPrisma));
  });

  it("backfill idempotente: só preenche linhas ainda sem ordem", () => {
    expect(semComentarios).toMatch(/WHERE r\."id" = s\."id" AND r\."ordem" IS NULL;/);
  });
});
