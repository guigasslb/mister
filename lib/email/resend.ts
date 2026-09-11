import "server-only";
import { Resend } from "resend";

/**
 * Camada de email transacional (infra reutilizável) — §17.5.
 *
 * Envio via **Resend** (SDK oficial). Distinto do login/autenticação e também
 * distinto do `lib/email.ts` (recuperação de password, que lança em produção):
 * aqui o envio é **best-effort** e **nunca** rebenta o fluxo que o chama. Serve
 * as notificações do fluxo de registo/licenças (novo registo → admin; ativação
 * → utilizador), onde uma falha de email não pode bloquear a ação de negócio.
 *
 * Estratégia:
 *   1. Se `RESEND_API_KEY` estiver definido → envia via Resend.
 *   2. Se ausente → degradação graciosa: regista um aviso e devolve um resultado
 *      "não enviado" (nunca lança).
 *   3. Qualquer erro real de envio é capturado e devolvido como "não enviado"
 *      (nunca propaga).
 *
 * Server-only: nunca vai para o bundle do cliente (contém a API key).
 */

/** Remetente por omissão quando `EMAIL_FROM` não está definido. */
const REMETENTE_FALLBACK = "Mister <no-reply@mister.app>";

/** Parâmetros de envio de um email transacional. */
export interface ParametrosEmail {
  /** Destinatário(s). */
  para: string | string[];
  /** Assunto (linha de subject). */
  assunto: string;
  /** Corpo em HTML. */
  html: string;
  /** Corpo alternativo em texto simples (opcional, recomendado). */
  texto?: string;
  /** Remetente; por omissão usa `EMAIL_FROM` ou o fallback da marca. */
  de?: string;
}

/**
 * Resultado de uma tentativa de envio. `enviado: false` cobre tanto a ausência
 * de configuração como um erro real — em ambos os casos o fluxo chamador segue
 * sem exceção.
 */
export type ResultadoEmail =
  | { enviado: true; id: string | null }
  | { enviado: false; motivo: "sem_configuracao" | "erro"; detalhe?: string };

/** Remetente efetivo (env `EMAIL_FROM` ou fallback da marca). */
function remetente(de?: string): string {
  return de?.trim() || process.env.EMAIL_FROM?.trim() || REMETENTE_FALLBACK;
}

/**
 * Envia um email transacional via Resend. **Best-effort**: nunca lança.
 * Devolve `{ enviado: true, id }` em sucesso, ou `{ enviado: false, motivo }`
 * quando não há configuração ou o envio falha.
 */
export async function enviarEmail(
  parametros: ParametrosEmail,
): Promise<ResultadoEmail> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.warn(
      "[email] RESEND_API_KEY ausente — email não enviado (degradação graciosa). " +
        `Assunto: "${parametros.assunto}".`,
    );
    return { enviado: false, motivo: "sem_configuracao" };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: remetente(parametros.de),
      to: parametros.para,
      subject: parametros.assunto,
      html: parametros.html,
      ...(parametros.texto ? { text: parametros.texto } : {}),
    });

    if (error) {
      console.warn(
        `[email] Resend recusou o envio (assunto "${parametros.assunto}"): ${error.message}`,
      );
      return { enviado: false, motivo: "erro", detalhe: error.message };
    }

    return { enviado: true, id: data?.id ?? null };
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : String(e);
    console.warn(
      `[email] Falha inesperada ao enviar (assunto "${parametros.assunto}"): ${detalhe}`,
    );
    return { enviado: false, motivo: "erro", detalhe };
  }
}
