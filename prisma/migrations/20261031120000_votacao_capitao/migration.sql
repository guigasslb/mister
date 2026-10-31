-- Votação secreta do capitão (2026-10-31).
-- * "VotacaoCapitao": uma por jogo (jogoId UNIQUE; repetir = apagar e recriar).
-- * "ParticipacaoVotacaoCapitao": quem já votou (PK composta votacaoId+atletaId; sem id/timestamp).
-- * "VotoCapitao": voto anónimo (só votacaoId + votadoAtletaId; id UUID v4; sem votante/timestamp).
-- Sem ligação entre participação e voto. Sem backfill; sem alteração a colunas existentes.

-- CreateEnum
CREATE TYPE "EstadoVotacaoCapitao" AS ENUM ('ABERTA', 'FECHADA');

-- CreateTable
CREATE TABLE "VotacaoCapitao" (
    "id" TEXT NOT NULL,
    "jogoId" TEXT NOT NULL,
    "estado" "EstadoVotacaoCapitao" NOT NULL DEFAULT 'ABERTA',
    "vencedorAtletaId" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadaEm" TIMESTAMP(3),

    CONSTRAINT "VotacaoCapitao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipacaoVotacaoCapitao" (
    "votacaoId" TEXT NOT NULL,
    "atletaId" TEXT NOT NULL,

    CONSTRAINT "ParticipacaoVotacaoCapitao_pkey" PRIMARY KEY ("votacaoId","atletaId")
);

-- CreateTable
CREATE TABLE "VotoCapitao" (
    "id" TEXT NOT NULL,
    "votacaoId" TEXT NOT NULL,
    "votadoAtletaId" TEXT NOT NULL,

    CONSTRAINT "VotoCapitao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VotacaoCapitao_jogoId_key" ON "VotacaoCapitao"("jogoId");

-- CreateIndex
CREATE INDEX "VotacaoCapitao_vencedorAtletaId_idx" ON "VotacaoCapitao"("vencedorAtletaId");

-- CreateIndex
CREATE INDEX "ParticipacaoVotacaoCapitao_atletaId_idx" ON "ParticipacaoVotacaoCapitao"("atletaId");

-- CreateIndex
CREATE INDEX "VotoCapitao_votacaoId_votadoAtletaId_idx" ON "VotoCapitao"("votacaoId", "votadoAtletaId");

-- CreateIndex
CREATE INDEX "VotoCapitao_votadoAtletaId_idx" ON "VotoCapitao"("votadoAtletaId");

-- AddForeignKey
ALTER TABLE "VotacaoCapitao" ADD CONSTRAINT "VotacaoCapitao_jogoId_fkey" FOREIGN KEY ("jogoId") REFERENCES "Jogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotacaoCapitao" ADD CONSTRAINT "VotacaoCapitao_vencedorAtletaId_fkey" FOREIGN KEY ("vencedorAtletaId") REFERENCES "Atleta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipacaoVotacaoCapitao" ADD CONSTRAINT "ParticipacaoVotacaoCapitao_votacaoId_fkey" FOREIGN KEY ("votacaoId") REFERENCES "VotacaoCapitao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipacaoVotacaoCapitao" ADD CONSTRAINT "ParticipacaoVotacaoCapitao_atletaId_fkey" FOREIGN KEY ("atletaId") REFERENCES "Atleta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotoCapitao" ADD CONSTRAINT "VotoCapitao_votacaoId_fkey" FOREIGN KEY ("votacaoId") REFERENCES "VotacaoCapitao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotoCapitao" ADD CONSTRAINT "VotoCapitao_votadoAtletaId_fkey" FOREIGN KEY ("votadoAtletaId") REFERENCES "Atleta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

