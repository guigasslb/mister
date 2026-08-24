import { z } from "zod";
import { passwordSchema } from "@/lib/schemas/auth";

/** Pedido de recuperação de password — apenas o email (secção 6.2). */
export const pedirResetSchema = z.object({
  email: z.string().email("Email inválido"),
});
export type PedirResetInput = z.infer<typeof pedirResetSchema>;

/**
 * Confirmação de reposição de password. `novaPassword` segue o mesmo requisito
 * mínimo do registo (`passwordSchema`, ≥ 8 caracteres).
 */
export const confirmarResetSchema = z.object({
  token: z.string().min(1, "Token em falta"),
  novaPassword: passwordSchema,
});
export type ConfirmarResetInput = z.infer<typeof confirmarResetSchema>;
