import { z } from "zod";

// Atualização de uma secção (§8.1.1 / §17.1). Só o `nome` é editável — a
// modalidade é estrutural e fixa (define os escalões associados).
export const atualizarSeccaoSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório").max(50, "Máximo 50 caracteres"),
});

export type AtualizarSeccaoInput = z.infer<typeof atualizarSeccaoSchema>;
