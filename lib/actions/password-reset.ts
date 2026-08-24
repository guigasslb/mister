"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { enviarEmail } from "@/lib/email";
import { pedirResetSchema, confirmarResetSchema } from "@/lib/schemas/password-reset";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";

const BCRYPT_COST = 12; // igual ao registo (onboarding.ts / utilizadores.ts)
const VALIDADE_MS = 60 * 60 * 1000; // 1 hora

/** Base pública da app para compor o link de reposição (mesmo padrão do resto da app). */
function baseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "").replace(/\/+$/, "");
}

function templateEmail(email: string, link: string): string {
  return `
    <div style="font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="font-size: 20px; color: #F0531E;">Recuperação de password</h1>
      <p>Recebemos um pedido de recuperação de password para <strong>${email}</strong>.</p>
      <p>Carrega no link abaixo para criar uma nova password. O link expira em 1 hora.</p>
      <p style="margin: 24px 0;">
        <a href="${link}"
           style="display: inline-block; background: #F0531E; color: #fff; text-decoration: none;
                  padding: 12px 20px; border-radius: 8px; font-weight: 600;">
          Repor password
        </a>
      </p>
      <p style="font-size: 13px; color: #666; word-break: break-all;">
        Se o botão não funcionar, copia este endereço para o navegador:<br />${link}
      </p>
      <p style="font-size: 13px; color: #666;">Se não pediste a recuperação, ignora este email.</p>
    </div>
  `.trim();
}

/**
 * Inicia o fluxo de recuperação de password para um email (secção 6.2).
 *
 * Não expõe se a conta existe (mitigação de user enumeration): devolve sempre
 * `ok` quando o input é válido, quer o email tenha conta ou não. Só cria/envia
 * token quando a conta existe. Qualquer falha de envio é registada no servidor,
 * sem alterar a resposta ao cliente.
 */
export async function pedirResetPassword(email: string): Promise<Resultado<void>> {
  const parsed = pedirResetSchema.safeParse({ email });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const emailNormalizado = parsed.data.email.trim().toLowerCase();

  const utilizador = await prisma.utilizador.findUnique({
    where: { email: emailNormalizado },
    select: { id: true, email: true },
  });

  // Conta inexistente → resposta idêntica, sem revelar nada.
  if (!utilizador) return ok(undefined);

  // Uso único por email: remove pedidos anteriores antes de criar o novo.
  await prisma.passwordResetToken.deleteMany({ where: { email: utilizador.email } });

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      email: utilizador.email,
      token,
      expiresAt: new Date(Date.now() + VALIDADE_MS),
    },
  });

  const link = `${baseUrl()}/repor-password?token=${token}`;

  try {
    await enviarEmail({
      to: utilizador.email,
      subject: "Recuperação de password — Mister",
      html: templateEmail(utilizador.email, link),
    });
  } catch (e) {
    // Não revelar falhas de infraestrutura de email ao cliente (poderia sinalizar
    // que a conta existe). Regista-se no servidor para diagnóstico.
    console.error("pedirResetPassword: falha ao enviar email de recuperação", e);
  }

  return ok(undefined);
}

/**
 * Verifica a validade de um token de reposição e devolve o email associado
 * (para pré-preencher o formulário). Token inexistente ou expirado → erro
 * genérico (mensagem única para ambos os casos).
 */
export async function verificarTokenReset(
  token: string,
): Promise<Resultado<{ email: string }>> {
  if (!token || typeof token !== "string") {
    return erro("O link de recuperação é inválido ou expirou.");
  }

  const registo = await prisma.passwordResetToken.findUnique({
    where: { token },
    select: { email: true, expiresAt: true },
  });

  if (!registo || registo.expiresAt <= new Date()) {
    return erro("O link de recuperação é inválido ou expirou.");
  }

  return ok({ email: registo.email });
}

/**
 * Conclui a reposição de password: valida o token, valida a nova password,
 * grava o novo hash (bcrypt, cost 12) e invalida todos os tokens do email.
 * Não toca em sessões ativas (o utilizador mantém a sessão atual).
 */
export async function confirmarResetPassword(
  token: string,
  novaPassword: string,
): Promise<Resultado<void>> {
  const parsed = confirmarResetSchema.safeParse({ token, novaPassword });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const validacao = await verificarTokenReset(parsed.data.token);
  if (!validacao.sucesso) return erro(validacao.erro);

  const { email } = validacao.dados;

  // A conta pode ter sido apagada entretanto — guard para não gerar 500.
  const utilizador = await prisma.utilizador.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!utilizador) {
    await prisma.passwordResetToken.deleteMany({ where: { email } });
    return erro("O link de recuperação é inválido ou expirou.");
  }

  const passwordHash = await bcrypt.hash(parsed.data.novaPassword, BCRYPT_COST);

  // Atualiza a password e invalida todos os tokens do email numa transação.
  await prisma.$transaction([
    prisma.utilizador.update({
      where: { id: utilizador.id },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.deleteMany({ where: { email } }),
  ]);

  return ok(undefined);
}
