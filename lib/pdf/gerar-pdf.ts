// Pipeline server-side dos relatórios imprimíveis de analíticos (Dossier do Treinador).
//
// Estratégia serverless-safe: devolve HTML auto-contido e imprimível (o browser
// converte em PDF via "Guardar como PDF"), evitando o motor nativo WASM/Yoga do
// `@react-pdf/renderer` — incompatível com o runtime serverless da Vercel (falha
// "Erro ao gerar o PDF" por crash de instanciação do WASM fora do try/catch).
//
// Orquestra: (1) branding do clube autenticado, (2) leitura do analítico já
// calculado (as próprias Server Actions garantem auth + RELATORIOS_VER + scope
// ao clube/escalão), (3) render do template em HTML. Não contém lógica de
// negócio nem acede à BD diretamente — delega tudo nas Server Actions existentes
// (Regra Nº 6: os números batem com os painéis/CSV).

import "server-only";
import { obterMembroAtual } from "@/lib/permissoes";
import {
  obterAnaliticoEscalao,
  obterAnaliticoClubeEpoca,
} from "@/lib/actions/analise";
import {
  htmlEstatisticaIndividual,
  tituloEstatisticaIndividual,
} from "@/components/pdf/PdfEstatisticaIndividual";
import {
  htmlEstatisticaGeral,
  tituloEstatisticaGeral,
} from "@/components/pdf/PdfEstatisticaGeral";
import type { MarcaClube } from "@/components/pdf/comum";

export type ParamsPdf =
  | { tipo: "escalao"; escalaoId: string; competicaoId?: string }
  | { tipo: "clube" };

export type ResultadoPdf =
  | { ok: true; html: string; titulo: string }
  | { ok: false; status: number; erro: string };

/** Mapeia o erro textual das Server Actions no código HTTP adequado. */
function estadoDoErro(erro: string): number {
  if (erro === "Não autenticado") return 401;
  if (erro === "Sem permissão") return 403;
  return 404;
}

/**
 * Carrega o logótipo do clube como data URI (best-effort). Só aceita PNG/JPEG e
 * limita o tamanho — qualquer falha (URL inválida, timeout, tipo não suportado)
 * devolve null e o template cai no placeholder com a inicial do clube. Embutir o
 * logótipo (em vez de referenciar a URL) garante que a imagem está pronta antes
 * de o browser abrir o diálogo de impressão.
 */
async function carregarLogo(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const tipo = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!/^image\/(png|jpe?g)$/.test(tipo)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 2 * 1024 * 1024) return null;
    return `data:${tipo};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function gerarPdfAnalitico(params: ParamsPdf): Promise<ResultadoPdf> {
  const ctx = await obterMembroAtual();
  if (!ctx) return { ok: false, status: 401, erro: "Não autenticado" };

  if (params.tipo === "escalao") {
    const res = await obterAnaliticoEscalao(
      params.escalaoId,
      undefined,
      params.competicaoId,
    );
    if (!res.sucesso) return { ok: false, status: estadoDoErro(res.erro), erro: res.erro };

    const marca: MarcaClube = {
      nome: ctx.clube.nome,
      epoca: res.dados.epoca.nome,
      corPrimaria: ctx.clube.corPrimaria,
      logo: await carregarLogo(ctx.clube.logoUrl),
    };
    return {
      ok: true,
      html: htmlEstatisticaIndividual(res.dados, marca),
      titulo: tituloEstatisticaIndividual(res.dados),
    };
  }

  const res = await obterAnaliticoClubeEpoca();
  if (!res.sucesso) return { ok: false, status: estadoDoErro(res.erro), erro: res.erro };

  const marca: MarcaClube = {
    nome: ctx.clube.nome,
    epoca: res.dados.epoca.nome,
    corPrimaria: ctx.clube.corPrimaria,
    logo: await carregarLogo(ctx.clube.logoUrl),
  };
  return {
    ok: true,
    html: htmlEstatisticaGeral(res.dados, marca),
    titulo: tituloEstatisticaGeral(res.dados),
  };
}
