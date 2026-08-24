-- CreateEnum
CREATE TYPE "TipoManoMano" AS ENUM ('LIGA_ANUAL', 'TORNEIO');

-- CreateEnum
CREATE TYPE "AmbitoManoMano" AS ENUM ('INTRA_CLUBE', 'INTER_CLUBES');

-- CreateEnum
CREATE TYPE "FormatoTorneioManoMano" AS ENUM ('ELIMINATORIO', 'ROUND_ROBIN');

-- CreateEnum
CREATE TYPE "FormatoDuelo" AS ENUM ('PRIMEIRO_A_DOIS', 'MELHOR_DE_2_JOGOS', 'TEMPO_LIMITE');

-- CreateEnum
CREATE TYPE "EstadoManoMano" AS ENUM ('ATIVA', 'CONCLUIDA', 'ARQUIVADA');

-- CreateEnum
CREATE TYPE "EstadoMatch" AS ENUM ('AGENDADO', 'REALIZADO', 'ADIADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "TipoParticipante" AS ENUM ('ATLETA', 'EXTERNO');

-- CreateTable
CREATE TABLE "ClubeExterno" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "localidade" TEXT,
    "criadoPorClubeId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubeExterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompeticaoManoMano" (
    "id" TEXT NOT NULL,
    "clubeId" TEXT NOT NULL,
    "epocaId" TEXT NOT NULL,
    "escalaoId" TEXT,
    "nome" TEXT NOT NULL,
    "tipo" "TipoManoMano" NOT NULL,
    "ambito" "AmbitoManoMano" NOT NULL DEFAULT 'INTRA_CLUBE',
    "formatoTorneio" "FormatoTorneioManoMano",
    "formatoDuelo" "FormatoDuelo" NOT NULL DEFAULT 'PRIMEIRO_A_DOIS',
    "golosParaVencer" INTEGER NOT NULL DEFAULT 2,
    "duracaoLimiteMin" INTEGER,
    "pontosVitoria" INTEGER NOT NULL DEFAULT 3,
    "pontosEmpate" INTEGER NOT NULL DEFAULT 1,
    "pontosDerrota" INTEGER NOT NULL DEFAULT 0,
    "criteriosDesempate" JSONB,
    "integraTreinos" BOOLEAN NOT NULL DEFAULT false,
    "estado" "EstadoManoMano" NOT NULL DEFAULT 'ATIVA',
    "criadorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompeticaoManoMano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipanteManoMano" (
    "id" TEXT NOT NULL,
    "competicaoId" TEXT NOT NULL,
    "tipo" "TipoParticipante" NOT NULL,
    "atletaId" TEXT,
    "atletaExternoNome" TEXT,
    "clubeExternoId" TEXT,
    "seed" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ParticipanteManoMano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchManoMano" (
    "id" TEXT NOT NULL,
    "competicaoId" TEXT NOT NULL,
    "participanteAId" TEXT,
    "participanteBId" TEXT,
    "ronda" INTEGER,
    "ordemNaRonda" INTEGER,
    "chaveBracket" TEXT,
    "proximoMatchId" TEXT,
    "data" TIMESTAMP(3),
    "local" TEXT,
    "sessaoId" TEXT,
    "estado" "EstadoMatch" NOT NULL DEFAULT 'AGENDADO',
    "golosA" INTEGER,
    "golosB" INTEGER,
    "vencedorParticipanteId" TEXT,
    "empate" BOOLEAN NOT NULL DEFAULT false,
    "registadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchManoMano_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubeExterno_criadoPorClubeId_idx" ON "ClubeExterno"("criadoPorClubeId");

-- CreateIndex
CREATE INDEX "CompeticaoManoMano_clubeId_idx" ON "CompeticaoManoMano"("clubeId");

-- CreateIndex
CREATE INDEX "CompeticaoManoMano_epocaId_escalaoId_idx" ON "CompeticaoManoMano"("epocaId", "escalaoId");

-- CreateIndex
CREATE INDEX "ParticipanteManoMano_competicaoId_idx" ON "ParticipanteManoMano"("competicaoId");

-- CreateIndex
CREATE INDEX "ParticipanteManoMano_atletaId_idx" ON "ParticipanteManoMano"("atletaId");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipanteManoMano_competicaoId_atletaId_key" ON "ParticipanteManoMano"("competicaoId", "atletaId");

-- CreateIndex
CREATE INDEX "MatchManoMano_competicaoId_idx" ON "MatchManoMano"("competicaoId");

-- CreateIndex
CREATE INDEX "MatchManoMano_sessaoId_idx" ON "MatchManoMano"("sessaoId");

-- CreateIndex
CREATE INDEX "MatchManoMano_estado_idx" ON "MatchManoMano"("estado");

-- CreateIndex
CREATE INDEX "MatchManoMano_competicaoId_ronda_idx" ON "MatchManoMano"("competicaoId", "ronda");

-- AddForeignKey
ALTER TABLE "ClubeExterno" ADD CONSTRAINT "ClubeExterno_criadoPorClubeId_fkey" FOREIGN KEY ("criadoPorClubeId") REFERENCES "Clube"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompeticaoManoMano" ADD CONSTRAINT "CompeticaoManoMano_clubeId_fkey" FOREIGN KEY ("clubeId") REFERENCES "Clube"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompeticaoManoMano" ADD CONSTRAINT "CompeticaoManoMano_epocaId_fkey" FOREIGN KEY ("epocaId") REFERENCES "Epoca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompeticaoManoMano" ADD CONSTRAINT "CompeticaoManoMano_escalaoId_fkey" FOREIGN KEY ("escalaoId") REFERENCES "Escalao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompeticaoManoMano" ADD CONSTRAINT "CompeticaoManoMano_criadorId_fkey" FOREIGN KEY ("criadorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipanteManoMano" ADD CONSTRAINT "ParticipanteManoMano_competicaoId_fkey" FOREIGN KEY ("competicaoId") REFERENCES "CompeticaoManoMano"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipanteManoMano" ADD CONSTRAINT "ParticipanteManoMano_atletaId_fkey" FOREIGN KEY ("atletaId") REFERENCES "Atleta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipanteManoMano" ADD CONSTRAINT "ParticipanteManoMano_clubeExternoId_fkey" FOREIGN KEY ("clubeExternoId") REFERENCES "ClubeExterno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchManoMano" ADD CONSTRAINT "MatchManoMano_competicaoId_fkey" FOREIGN KEY ("competicaoId") REFERENCES "CompeticaoManoMano"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchManoMano" ADD CONSTRAINT "MatchManoMano_participanteAId_fkey" FOREIGN KEY ("participanteAId") REFERENCES "ParticipanteManoMano"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchManoMano" ADD CONSTRAINT "MatchManoMano_participanteBId_fkey" FOREIGN KEY ("participanteBId") REFERENCES "ParticipanteManoMano"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchManoMano" ADD CONSTRAINT "MatchManoMano_proximoMatchId_fkey" FOREIGN KEY ("proximoMatchId") REFERENCES "MatchManoMano"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchManoMano" ADD CONSTRAINT "MatchManoMano_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "Sessao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchManoMano" ADD CONSTRAINT "MatchManoMano_vencedorParticipanteId_fkey" FOREIGN KEY ("vencedorParticipanteId") REFERENCES "ParticipanteManoMano"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchManoMano" ADD CONSTRAINT "MatchManoMano_registadoPorId_fkey" FOREIGN KEY ("registadoPorId") REFERENCES "MembroClube"("id") ON DELETE SET NULL ON UPDATE CASCADE;

