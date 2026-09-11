import {
  type ConteudoEmail,
  envolverHtml,
  escaparHtml,
  paragrafo,
} from "./base";

/**
 * Template (a) — Novo registo → notifica o admin (§17.5).
 *
 * Informa a equipa Mister de que um novo utilizador se registou e está a
 * aguardar comprovativo de pagamento para ativação (fluxo descrito em
 * `docs/faq-registo-licencas.md`).
 */

/** Dados do registo a comunicar ao admin. */
export interface DadosNovoRegisto {
  /** Nome do treinador/responsável que se registou. */
  nome: string;
  /** Email de login escolhido no registo. */
  email: string;
  /** Nome do clube indicado no registo. */
  clube: string;
  /** Plano escolhido (ex.: "Individual", "Clube Médio"). */
  plano: string;
  /** Modalidade(s) (ex.: "Futsal", "Futebol", "Futsal + Futebol"). */
  modalidade: string;
}

/**
 * Email de admin: `ADMIN_EMAIL` do ambiente, com fallback documentado para o
 * endereço de suporte do FAQ (`goncalo.pereira.1992@gmail.com`) quando a
 * variável não está definida.
 */
export function obterEmailAdmin(): string {
  return process.env.ADMIN_EMAIL?.trim() || "goncalo.pereira.1992@gmail.com";
}

/** Constrói o conteúdo do email de notificação de novo registo. */
export function emailNovoRegisto(dados: DadosNovoRegisto): ConteudoEmail {
  const assunto = `Novo registo — ${dados.clube}`;

  const linhas: Array<[string, string]> = [
    ["Nome", dados.nome],
    ["Email", dados.email],
    ["Clube", dados.clube],
    ["Plano", dados.plano],
    ["Modalidade", dados.modalidade],
  ];

  const tabela = linhas
    .map(
      ([rotulo, valor]) =>
        `<tr>` +
        `<td style="padding:6px 12px 6px 0;color:#57514A;font-size:14px;white-space:nowrap;">${escaparHtml(rotulo)}</td>` +
        `<td style="padding:6px 0;font-size:14px;font-weight:600;color:#141210;">${escaparHtml(valor)}</td>` +
        `</tr>`,
    )
    .join("");

  const corpo =
    paragrafo("Um novo utilizador registou-se no Mister:") +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">${tabela}</table>` +
    paragrafo(
      "A conta está <strong>a aguardar o comprovativo de pagamento</strong> " +
        "para ser ativada. Assim que o comprovativo chegar e for confirmado, " +
        "ativa a licença no backoffice.",
    );

  const html = envolverHtml("Novo registo no Mister", corpo);

  const texto =
    "Um novo utilizador registou-se no Mister:\n" +
    linhas.map(([rotulo, valor]) => `- ${rotulo}: ${valor}`).join("\n") +
    "\n\nA conta está a aguardar o comprovativo de pagamento para ser ativada.";

  return { assunto, html, texto };
}
