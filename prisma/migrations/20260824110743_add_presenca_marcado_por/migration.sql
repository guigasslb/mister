-- AlterTable
ALTER TABLE "Presenca" ADD COLUMN     "marcadoPorId" TEXT;

-- CreateIndex
CREATE INDEX "Presenca_marcadoPorId_idx" ON "Presenca"("marcadoPorId");

-- AddForeignKey
ALTER TABLE "Presenca" ADD CONSTRAINT "Presenca_marcadoPorId_fkey" FOREIGN KEY ("marcadoPorId") REFERENCES "MembroClube"("id") ON DELETE SET NULL ON UPDATE CASCADE;
