/**
 * Relatório de jogo estruturado (UX-P3-07).
 *
 * O relatório do jogo é guardado no campo `Jogo.relatorio` (String? @db.Text) como
 * um JSON com três secções: análise táctica, destaques e próximo jogo. Este módulo
 * é a fonte única de (de)serialização e garante RETROCOMPATIBILIDADE: relatórios
 * antigos guardados como texto puro são interpretados como "análise táctica".
 *
 * Puro (sem "use server"): usável tanto no cliente como no servidor.
 */

export type RelatorioEstruturado = {
  analiseTatica: string;
  destaques: string;
  proximoJogo: string;
  /**
   * Notas tiradas em beira-campo no Modo Jogo ao Vivo (§8.25.3/§8.25.8). Vive na
   * mesma coluna `Jogo.relatorio` (chave `notasAoVivo`), sem coluna nova. Vazio por
   * omissão; preservada por (de)serialização para não colidir com o relatório.
   */
  notasAoVivo: string;
};

export const RELATORIO_VAZIO: RelatorioEstruturado = {
  analiseTatica: "",
  destaques: "",
  proximoJogo: "",
  notasAoVivo: "",
};

function eString(valor: unknown): valor is string {
  return typeof valor === "string";
}

/**
 * Interpreta o valor guardado. Se for JSON com a forma esperada, devolve as três
 * secções; caso contrário (texto puro legado ou vazio) coloca o texto integral em
 * "análise táctica".
 */
export function parseRelatorio(raw: string | null | undefined): RelatorioEstruturado {
  const texto = (raw ?? "").trim();
  if (texto === "") return { ...RELATORIO_VAZIO };

  if (texto.startsWith("{")) {
    try {
      const obj = JSON.parse(texto) as Record<string, unknown>;
      if (
        obj &&
        (eString(obj.analiseTatica) ||
          eString(obj.destaques) ||
          eString(obj.proximoJogo) ||
          eString(obj.notasAoVivo))
      ) {
        return {
          analiseTatica: eString(obj.analiseTatica) ? obj.analiseTatica : "",
          destaques: eString(obj.destaques) ? obj.destaques : "",
          proximoJogo: eString(obj.proximoJogo) ? obj.proximoJogo : "",
          notasAoVivo: eString(obj.notasAoVivo) ? obj.notasAoVivo : "",
        };
      }
    } catch {
      // Não é JSON válido → trata como texto puro legado (abaixo).
    }
  }

  return { analiseTatica: texto, destaques: "", proximoJogo: "", notasAoVivo: "" };
}

/**
 * Serializa para guardar. Se todas as secções estiverem vazias devolve "" (a action
 * grava `null`). Caso contrário devolve o JSON das três secções (com trim).
 */
export function serializarRelatorio(r: RelatorioEstruturado): string {
  const analiseTatica = r.analiseTatica.trim();
  const destaques = r.destaques.trim();
  const proximoJogo = r.proximoJogo.trim();
  const notasAoVivo = r.notasAoVivo.trim();
  if (!analiseTatica && !destaques && !proximoJogo && !notasAoVivo) return "";
  // As notas ao vivo só são incluídas quando existem — mantém a serialização
  // byte-idêntica ao comportamento anterior para relatórios sem notas (§8.25.8).
  const base: Record<string, string> = { analiseTatica, destaques, proximoJogo };
  if (notasAoVivo) base.notasAoVivo = notasAoVivo;
  return JSON.stringify(base);
}

/**
 * Representação em texto simples do relatório, para usos que precisam de uma string
 * legível (ex.: `comentarioTreinador` nas comunicações). Um relatório legado (só
 * análise táctica) produz exatamente o texto original, preservando o comportamento.
 */
export function relatorioParaTexto(raw: string | null | undefined): string {
  const r = parseRelatorio(raw);
  const partes: string[] = [];
  if (r.analiseTatica.trim()) partes.push(r.analiseTatica.trim());
  if (r.destaques.trim()) partes.push(`Destaques: ${r.destaques.trim()}`);
  if (r.proximoJogo.trim()) partes.push(`Próximo jogo: ${r.proximoJogo.trim()}`);
  return partes.join("\n\n");
}
