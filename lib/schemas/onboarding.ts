import { z } from "zod";

const corHex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (ex: #1A2FD4)");

export const registarSchema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  email: z.string().email("Email inválido").toLowerCase(),
  password: z.string().min(8, "A password deve ter pelo menos 8 caracteres"),
});

export const criarClubeSchema = z.object({
  nome: z.string().min(2, "Nome do clube obrigatório").max(100),
  corPrimaria: corHex.optional(),
  corSecundaria: corHex.optional(),
  // 🔁 v7 (§8.1.1): modalidade escolhida no onboarding. Determina a secção
  // inicial do clube e o conteúdo curado instalado. Default FUTSAL (retro-compat).
  // Literal (não `z.nativeEnum`) para não puxar @prisma/client ao bundle cliente.
  modalidade: z.enum(["FUTSAL", "FUTEBOL"]).default("FUTSAL"),
  // 🔁 v7 (§8.1 / §17.1): plano escolhido no onboarding. Guardado como licença
  // PENDENTE para o paywall mostrar o valor exato a transferir. `INDIVIDUAL`
  // mapeia para TipoLicenca.INDIVIDUAL (tier null); os restantes para
  // TipoLicenca.CLUBE + TierClube. Literal (não `z.nativeEnum`) para não puxar
  // @prisma/client ao bundle cliente (o wizard é um Client Component).
  tier: z.enum(["INDIVIDUAL", "PEQUENO", "MEDIO", "GRANDE"]),
});

export const brandingSchema = z.object({
  nome: z.string().min(2).max(100),
  corPrimaria: corHex,
  corSecundaria: corHex,
  // Segurança: `z.string().url()` aceita esquemas perigosos (javascript:, data:).
  // Restringir a http(s) — o URL alimenta um <img src> na UI.
  logoUrl: z
    .string()
    .url("URL inválido")
    .refine((url) => /^https?:\/\//i.test(url), { message: "URL inválido" })
    .optional()
    .or(z.literal("")),
  morada: z.string().max(200).optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  telefone: z.string().max(30).optional(),
});

export type RegistarInput = z.infer<typeof registarSchema>;
export type CriarClubeInput = z.infer<typeof criarClubeSchema>;
export type BrandingInput = z.infer<typeof brandingSchema>;
