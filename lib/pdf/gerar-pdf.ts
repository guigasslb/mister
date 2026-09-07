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
 * Formatos de imagem aceites no logótipo do relatório. Alinhado com o resto da
 * app: o `logoUrl` é um URL http(s) livre inserido pelo clube (§8.4) e o
 * `LogoClube`/`next.config` já aceitam qualquer imagem (incl. WebP/SVG). Todos
 * são renderizados dentro de um `<img>` (sem execução de scripts em SVG).
 */
const MIME_LOGO = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/;

/**
 * Infere o MIME pela extensão do URL quando o servidor não devolve um
 * content-type de imagem utilizável (ex.: `application/octet-stream` ou vazio,
 * comuns em alguns storages). Devolve null quando não é reconhecível.
 */
function mimePorExtensao(url: string): string | null {
  let ext: string | undefined;
  try {
    ext = new URL(url).pathname.split(".").pop()?.toLowerCase();
  } catch {
    return null;
  }
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return null;
  }
}

/**
 * Carrega o logótipo do clube como data URI (best-effort). Aceita os formatos de
 * imagem suportados pela app (PNG/JPEG/WebP/GIF/SVG) e limita o tamanho — quando
 * o servidor não indica um content-type de imagem utilizável, o MIME é inferido
 * pela extensão do URL. Qualquer falha (URL inválida, timeout, tipo não
 * reconhecível) devolve null e o template cai no placeholder com a inicial do
 * clube. Embutir o logótipo (em vez de referenciar a URL) garante que a imagem
 * está pronta antes de o browser abrir o diálogo de impressão.
 */
async function carregarLogo(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    // Cabeçalhos tipo-browser: o `logoUrl` é um URL externo arbitrário (§8.4) e
    // muitos hosts de imagens (CDNs, object storages, Wikipedia, etc.) devolvem
    // 403/406 a pedidos sem User-Agent de browser ou sem `Accept: image/*`. Na
    // app o logótipo carrega porque é o BROWSER a pedir (next/image `unoptimized`
    // em BarraTopo/MarcaAgua); aqui é o servidor (Node/undici) a fazer o fetch,
    // por isso replica-se o pedido de um browser para não ser recusado. Segue
    // redirects (default) — comum em storages/CDNs que reencaminham para a CDN.
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MisterBot/1.0; +https://mister.app)",
        Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      console.warn(`[pdf] logótipo: fetch falhou (${res.status}) para ${url}`);
      return null;
    }
    const cabecalho = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    // Usa o content-type quando é uma imagem suportada; caso contrário infere
    // pela extensão do URL (servidores que devolvem octet-stream/sem tipo).
    const tipo = MIME_LOGO.test(cabecalho) ? cabecalho : mimePorExtensao(url);
    if (!tipo) {
      console.warn(
        `[pdf] logótipo: tipo não reconhecido (content-type="${cabecalho}") para ${url}`,
      );
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 2 * 1024 * 1024) {
      console.warn(
        `[pdf] logótipo: tamanho inválido (${buf.byteLength} bytes) para ${url}`,
      );
      return null;
    }
    return `data:${tipo};base64,${buf.toString("base64")}`;
  } catch (e) {
    console.warn(
      `[pdf] logótipo: erro ao carregar ${url}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
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
