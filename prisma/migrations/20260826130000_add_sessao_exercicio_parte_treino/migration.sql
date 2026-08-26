-- Fase do treino por exercício da sessão (§3.5). Reutiliza o enum ParteTreino
-- existente. Aditivo e retrocompatível: rows legadas ficam com parteTreino NULL.
ALTER TABLE "SessaoExercicio" ADD COLUMN "parteTreino" "ParteTreino";
