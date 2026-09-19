-- Modo Jogo ao Vivo — desenho inicial (bíblia v7 §8.25.8).
--
-- RECONSTRUÍDA a partir do estado real da base de dados (introspeção).
-- A pasta original desta migração foi apagada localmente durante uma sessão
-- interrompida, mas o registo em _prisma_migrations manteve-se aplicado. Este
-- ficheiro repõe a consistência do histórico (replay em BD nova = mesmo estado).
-- O desenho final vive na migração seguinte (20260919000000), que transforma
-- este esquema no modelo consolidado (EventoJogo + SessaoJogoAoVivo redesenhada).
-- Não toca em auth.

-- CreateEnum
CREATE TYPE "EstadoCronometro" AS ENUM ('NAO_INICIADO', 'A_CORRER', 'PAUSADO', 'INTERVALO', 'TERMINADO');

-- CreateEnum
CREATE TYPE "TipoEventoAoVivo" AS ENUM ('INICIO_PARTE', 'FIM_PARTE', 'ENTRADA', 'SAIDA', 'PAUSA', 'RETOMA');

-- CreateTable
CREATE TABLE "SessaoJogoAoVivo" (
    "id" TEXT NOT NULL,
    "jogoId" TEXT NOT NULL,
    "numeroPartes" INTEGER NOT NULL DEFAULT 2,
    "duracaoParteMin" INTEGER NOT NULL DEFAULT 20,
    "estado" "EstadoCronometro" NOT NULL DEFAULT 'NAO_INICIADO',
    "parteAtual" INTEGER NOT NULL DEFAULT 1,
    "segundoDecorridoParte" INTEGER NOT NULL DEFAULT 0,
    "ultimoRetomeEm" TIMESTAMP(3),
    "jogadoresEmCampo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessaoJogoAoVivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoAoVivo" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "sessaoAoVivoId" TEXT NOT NULL,
    "tipo" "TipoEventoAoVivo" NOT NULL,
    "parte" INTEGER NOT NULL,
    "segundo" INTEGER NOT NULL,
    "sequencia" INTEGER NOT NULL DEFAULT 0,
    "atletaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoAoVivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessaoJogoAoVivo_jogoId_key" ON "SessaoJogoAoVivo"("jogoId");

-- CreateIndex
CREATE INDEX "SessaoJogoAoVivo_jogoId_idx" ON "SessaoJogoAoVivo"("jogoId");

-- CreateIndex
CREATE UNIQUE INDEX "EventoAoVivo_clienteId_key" ON "EventoAoVivo"("clienteId");

-- CreateIndex
CREATE INDEX "EventoAoVivo_sessaoAoVivoId_idx" ON "EventoAoVivo"("sessaoAoVivoId");

-- CreateIndex
CREATE INDEX "EventoAoVivo_atletaId_idx" ON "EventoAoVivo"("atletaId");

-- CreateIndex
CREATE INDEX "EventoAoVivo_sessaoAoVivoId_segundo_sequencia_idx" ON "EventoAoVivo"("sessaoAoVivoId", "segundo", "sequencia");

-- AddForeignKey
ALTER TABLE "SessaoJogoAoVivo" ADD CONSTRAINT "SessaoJogoAoVivo_jogoId_fkey" FOREIGN KEY ("jogoId") REFERENCES "Jogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAoVivo" ADD CONSTRAINT "EventoAoVivo_sessaoAoVivoId_fkey" FOREIGN KEY ("sessaoAoVivoId") REFERENCES "SessaoJogoAoVivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAoVivo" ADD CONSTRAINT "EventoAoVivo_atletaId_fkey" FOREIGN KEY ("atletaId") REFERENCES "Atleta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
