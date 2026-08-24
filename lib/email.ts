import "server-only";
import nodemailer from "nodemailer";

/**
 * Envio de email transacional (secção 6.2 — recuperação de password).
 *
 * Estratégia, por ordem de preferência (a primeira configurada ganha):
 *   1. Resend  — se `RESEND_API_KEY` estiver definido (API HTTP, sem dependência
 *      de SMTP). Bom para serverless.
 *   2. SMTP    — via `nodemailer`, com `EMAIL_HOST`/`EMAIL_PORT`/`EMAIL_USER`/
 *      `EMAIL_PASS`. Porta 465 → TLS implícito; outras portas → STARTTLS.
 *   3. Dev     — sem qualquer transporte configurado, em ambiente não-produção,
 *      o email é impresso no log do servidor (degradação controlada, à imagem
 *      da integração Google — nunca rebenta o fluxo). Em produção, a ausência
 *      de configuração é um erro (lançado).
 *
 * Server-only: nunca vai para o bundle do cliente.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

const REMETENTE_FALLBACK = "Mister <no-reply@mister.app>";

function remetente(): string {
  return process.env.EMAIL_FROM?.trim() || REMETENTE_FALLBACK;
}

async function enviarViaResend(msg: EmailMessage): Promise<void> {
  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remetente(),
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    }),
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new Error(`Resend respondeu ${resposta.status}: ${detalhe}`);
  }
}

async function enviarViaSmtp(msg: EmailMessage): Promise<void> {
  const porta = Number(process.env.EMAIL_PORT) || 587;
  const transporte = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: porta,
    secure: porta === 465, // 465 = TLS implícito; 587/25 = STARTTLS
    auth:
      process.env.EMAIL_USER || process.env.EMAIL_PASS
        ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        : undefined,
  });
  await transporte.sendMail({
    from: remetente(),
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
  });
}

/**
 * Envia um email. Lança em caso de falha real de envio ou de configuração em
 * falta em produção. Quem chama decide como reagir (o fluxo de recuperação de
 * password engole a falha para não expor a existência da conta).
 */
export async function enviarEmail(msg: EmailMessage): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    await enviarViaResend(msg);
    return;
  }

  if (process.env.EMAIL_HOST) {
    await enviarViaSmtp(msg);
    return;
  }

  // Sem transporte configurado.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Envio de email não configurado: define RESEND_API_KEY ou EMAIL_HOST/EMAIL_PORT/EMAIL_USER/EMAIL_PASS.",
    );
  }

  // Dev: degradação controlada — imprime no log em vez de falhar.
  console.info(
    `[email:dev] Sem transporte configurado. Email que seria enviado:\n` +
      `  para:    ${msg.to}\n` +
      `  assunto: ${msg.subject}\n` +
      `  html:\n${msg.html}`,
  );
}
