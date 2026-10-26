-- Subcategorias em várias categorias principais (§3.3 — 2026-10-12).
-- `SubcategoriaExercicio.categoria` (enum único) passa a `categorias` (array de enum).
-- O exercício mantém UMA `categoriaPrincipal` (analíticos sem dupla contagem); a
-- subcategoria escolhida tem de incluir essa categoria (validado nas actions).
-- Ordem: adicionar coluna → backfill → constraint → remover coluna/índice antigos.

-- AlterTable: nova coluna (array de enum)
ALTER TABLE "SubcategoriaExercicio" ADD COLUMN "categorias" "CategoriaExercicioPrincipal"[];

-- Backfill: cada subcategoria existente fica com a sua categoria atual.
UPDATE "SubcategoriaExercicio" SET "categorias" = ARRAY["categoria"];

-- Invariante: pelo menos uma categoria (não modelável no Prisma; só na BD).
ALTER TABLE "SubcategoriaExercicio"
  ADD CONSTRAINT "SubcategoriaExercicio_categorias_nao_vazio"
  CHECK ("categorias" IS NOT NULL AND cardinality("categorias") >= 1);

-- DropIndex (dependia da coluna antiga)
DROP INDEX "SubcategoriaExercicio_clubeId_categoria_idx";

-- AlterTable: remover a coluna antiga
ALTER TABLE "SubcategoriaExercicio" DROP COLUMN "categoria";

-- CreateIndex
CREATE INDEX "SubcategoriaExercicio_clubeId_idx" ON "SubcategoriaExercicio"("clubeId");

-- CreateIndex (filtro "subcategorias desta categoria": categorias @> ARRAY[...])
CREATE INDEX "SubcategoriaExercicio_categorias_idx" ON "SubcategoriaExercicio" USING GIN ("categorias");
