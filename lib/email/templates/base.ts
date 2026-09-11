/**
 * Base partilhada dos templates de email transacional — §17.5.
 *
 * Mantém a marca Mister consistente (laranja `#F0531E` + preto quente `#141210`
 * + papel `#EDEBE7`, alinhado com `docs/BRAND.md`) e escapa valores fornecidos
 * pelo utilizador para evitar injeção de HTML. Sem dependências server-only:
 * são funções puras, testáveis e reutilizáveis por qualquer fase.
 */

/** Conteúdo pronto a passar a `enviarEmail`. */
export interface ConteudoEmail {
  assunto: string;
  html: string;
  texto: string;
}

const LARANJA = "#F0531E";
const INK = "#141210";
const PAPEL = "#EDEBE7";
const CARTAO = "#F7F5F2";
const BORDA = "#E4E1DB";
const TEXTO_SECUNDARIO = "#57514A";

/** Escapa `& < > " '` para inserção segura de texto em HTML. */
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Envolve o corpo (HTML já escapado) na moldura de marca Mister. `titulo` é o
 * cabeçalho visível dentro do email; `corpoHtml` é o conteúdo específico.
 */
export function envolverHtml(titulo: string, corpoHtml: string): string {
  return `<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escaparHtml(titulo)}</title>
  </head>
  <body style="margin:0;padding:0;background:${PAPEL};font-family:Segoe UI,Helvetica,Arial,sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPEL};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
            <tr>
              <td style="padding:0 0 16px 4px;">
                <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${INK};">Mister</span>
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${LARANJA};margin-left:6px;vertical-align:middle;"></span>
              </td>
            </tr>
            <tr>
              <td style="background:${CARTAO};border:1px solid ${BORDA};border-radius:14px;padding:28px 28px 24px;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:${INK};">${escaparHtml(titulo)}</h1>
                ${corpoHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 4px 0;color:${TEXTO_SECUNDARIO};font-size:12px;line-height:1.5;">
                Mister — gestão desportiva para treinadores e clubes.<br />
                Recebeste este email por causa da tua conta Mister.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Botão de ação (CTA) com a cor da marca. */
export function botao(texto: string, url: string): string {
  return `<a href="${escaparHtml(url)}" style="display:inline-block;background:${LARANJA};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">${escaparHtml(texto)}</a>`;
}

/** Parágrafo de corpo com o estilo base. */
export function paragrafo(html: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};">${html}</p>`;
}
