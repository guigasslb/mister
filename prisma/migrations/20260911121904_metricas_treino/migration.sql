-- CreateEnum
CREATE TYPE "ContextoMetrica" AS ENUM ('JOGO', 'TREINO', 'AMBOS');

-- AlterTable
ALTER TABLE "MetricaConfig" ADD COLUMN     "contexto" "ContextoMetrica" NOT NULL DEFAULT 'JOGO';

-- CreateTable
CREATE TABLE "ValorMetricaSessao" (
    "id" TEXT NOT NULL,
    "metricaId" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "atletaId" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,

    CONSTRAINT "ValorMetricaSessao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ValorMetricaSessao_sessaoId_idx" ON "ValorMetricaSessao"("sessaoId");

-- CreateIndex
CREATE INDEX "ValorMetricaSessao_atletaId_idx" ON "ValorMetricaSessao"("atletaId");

-- CreateIndex
CREATE INDEX "ValorMetricaSessao_metricaId_idx" ON "ValorMetricaSessao"("metricaId");

-- CreateIndex
CREATE UNIQUE INDEX "ValorMetricaSessao_metricaId_sessaoId_atletaId_key" ON "ValorMetricaSessao"("metricaId", "sessaoId", "atletaId");

-- AddForeignKey
ALTER TABLE "ValorMetricaSessao" ADD CONSTRAINT "ValorMetricaSessao_metricaId_fkey" FOREIGN KEY ("metricaId") REFERENCES "MetricaConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorMetricaSessao" ADD CONSTRAINT "ValorMetricaSessao_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "Sessao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorMetricaSessao" ADD CONSTRAINT "ValorMetricaSessao_atletaId_fkey" FOREIGN KEY ("atletaId") REFERENCES "Atleta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
