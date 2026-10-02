import { z } from "zod";

const corHex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (ex: #1A2FD4)");

// 🔁 v7 (§8.1): contrato de registo ÚNICO. O registo passa a recolher, num só
// passo, a conta (nome/email/password) + o clube (nomeClube) + o plano (tier) +
// a modalidade — e cria atomicamente conta + clube + licença PENDENTE (§17.5).
// A `modalidade` é EXIGIDA explicitamente (sem `default("FUTSAL")` silencioso):
// é uma escolha de primeira classe do utilizador, não um fallback. Literal
// (não `z.nativeEnum`) para não puxar @prisma/client ao bundle cliente.
export const registarSchema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  email: z.string().email("Email inválido").toLowerCase(),
  password: z.string().min(8, "A password deve ter pelo menos 8 caracteres"),
  nomeClube: z.string().min(2, "Nome do clube obrigatório").max(100),
  tier: z.enum(["INDIVIDUAL", "PEQUENO", "MEDIO", "GRANDE"]),
  modalidade: z.enum(["FUTSAL", "FUTEBOL"]),
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

// Upload de ficheiro do logótipo do clube (§8.3). SVG excluído: pode conter
// script/referências externas e não é sanitizado. O tipo declarado e o tamanho
// validam-se aqui (cliente + servidor); a action confirma ainda os magic bytes.
export const TIPOS_LOGO_CLUBE = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_BYTES_LOGO_CLUBE = 2 * 1024 * 1024;

export const uploadLogoClubeSchema = z.object({
  logo: z
    .custom<File>(
      (v) => typeof File !== "undefined" && v instanceof File,
      "Nenhum ficheiro de logótipo recebido",
    )
    .refine((f) => f.size > 0, "O ficheiro está vazio")
    .refine(
      (f) => f.size <= MAX_BYTES_LOGO_CLUBE,
      "O logótipo excede o tamanho máximo de 2 MB.",
    )
    .refine(
      (f) => (TIPOS_LOGO_CLUBE as readonly string[]).includes(f.type),
      "Formato inválido. Usa PNG, JPEG ou WebP.",
    ),
});

export type RegistarInput = z.infer<typeof registarSchema>;
export type CriarClubeInput = z.infer<typeof criarClubeSchema>;
export type BrandingInput = z.infer<typeof brandingSchema>;
