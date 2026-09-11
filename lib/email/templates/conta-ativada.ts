import {
  type ConteudoEmail,
  botao,
  envolverHtml,
  escaparHtml,
  paragrafo,
} from "./base";

/**
 * Template (b) — Ativação → notifica o utilizador (§17.5).
 *
 * "A tua conta Mister está pronta" — o assunto exato prometido em
 * `docs/faq-registo-licencas.md`. Tom direto, PT-PT, marca Mister. Diz ao
 * utilizador que já pode entrar com o email/password do registo e completar o
 * assistente de configuração inicial (época, escalões, cores, logótipo).
 */

/** Dados para o email de conta ativada. */
export interface DadosContaAtivada {
  /** Nome do utilizador (para o tratamento). */
  nome: string;
  /** Email de login usado no registo. */
  email: string;
  /**
   * URL de entrada na app. Por omissão usa `NEXTAUTH_URL` (ou "https://mister.app"
   * como fallback) — o mesmo base usado no resto da app.
   */
  urlApp?: string;
}

/** Base pública da app para compor o link de entrada. */
function baseApp(urlApp?: string): string {
  const base = urlApp?.trim() || process.env.NEXTAUTH_URL?.trim() || "https://mister.app";
  return base.replace(/\/+$/, "");
}

/** Constrói o conteúdo do email de conta ativada. */
export function emailContaAtivada(dados: DadosContaAtivada): ConteudoEmail {
  const assunto = "A tua conta Mister está pronta";
  const url = `${baseApp(dados.urlApp)}/login`;

  const corpo =
    paragrafo(`Olá ${escaparHtml(dados.nome)},`) +
    paragrafo(
      "A tua conta Mister está <strong>ativa</strong>. Já podes entrar com o " +
        `email <strong>${escaparHtml(dados.email)}</strong> e a password que ` +
        "escolheste no registo.",
    ) +
    paragrafo(
      "No primeiro acesso, um breve assistente leva-te pela configuração " +
        "inicial: defines a época, os escalões, as cores do clube e o logótipo. " +
        "Em menos de dez minutos estás no dashboard, pronto a trabalhar.",
    ) +
    `<p style="margin:22px 0;">${botao("Entrar no Mister", url)}</p>` +
    paragrafo(
      '<span style="color:#57514A;font-size:13px;">Se o botão não funcionar, ' +
        `abre este endereço: ${escaparHtml(url)}</span>`,
    );

  const html = envolverHtml("A tua conta Mister está pronta", corpo);

  const texto =
    `Olá ${dados.nome},\n\n` +
    "A tua conta Mister está ativa. Já podes entrar com o email " +
    `${dados.email} e a password que escolheste no registo.\n\n` +
    "No primeiro acesso, um breve assistente leva-te pela configuração inicial: " +
    "época, escalões, cores do clube e logótipo.\n\n" +
    `Entra em: ${url}`;

  return { assunto, html, texto };
}
