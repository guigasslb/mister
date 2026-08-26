// Pipeline server-side de geração dos PDFs de analíticos (Dossier do Treinador).
//
// Orquestra: (1) branding do clube autenticado, (2) leitura do analítico já
// calculado (as próprias Server Actions garantem auth + RELATORIOS_VER + scope
// ao clube/escalão), (3) render do template `@react-pdf/renderer` num Buffer.
// Não contém lógica de negócio nem acede à BD diretamente — delega tudo nas
// Server Actions existentes (Regra Nº 6: os números batem com os painéis/CSV).

import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { obterMembroAtual } from "@/lib/permissoes";
import {
  obterAnaliticoEscalao,
  obterAnaliticoClubeEpoca,
} from "@/lib/actions/analise";
import { PdfEstatisticaIndividual } from "@/components/pdf/PdfEstatisticaIndividual";
import { PdfEstatisticaGeral } from "@/components/pdf/PdfEstatisticaGeral";
import type { MarcaClube } from "@/components/pdf/comum";

export type ParamsPdf =
  | { tipo: "escalao"; escalaoId: string; competicaoId?: string }
  | { tipo: "clube" };

export type ResultadoPdf =
  | { ok: true; buffer: Buffer; nomeFicheiro: string }
  | { ok: false; status: number; erro: string };

/** Mapeia o erro textual das Server Actions no código HTTP adequado. */
function estadoDoErro(erro: string): number {
  if (erro === "Não autenticado") return 401;
  if (erro === "Sem permissão") return 403;
  return 404;
}

/** Normaliza um texto para um segmento seguro de nome de ficheiro. */
function slugificar(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "export";
}

/** Carimbo "YYYY-MM-DD" para o nome do ficheiro. */
function carimboData(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Carrega o logótipo do clube como data URI (best-effort). Só aceita PNG/JPEG e
 * limita o tamanho — qualquer falha (URL inválida, timeout, tipo não suportado)
 * devolve null e o template cai no placeholder com a inicial do clube.
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
    const buffer = await renderToBuffer(
      <PdfEstatisticaIndividual dados={res.dados} marca={marca} />,
    );
    const nomeFicheiro = `estatistica-${slugificar(res.dados.escalao.nome)}-${carimboData()}.pdf`;
    return { ok: true, buffer, nomeFicheiro };
  }

  const res = await obterAnaliticoClubeEpoca();
  if (!res.sucesso) return { ok: false, status: estadoDoErro(res.erro), erro: res.erro };

  const marca: MarcaClube = {
    nome: ctx.clube.nome,
    epoca: res.dados.epoca.nome,
    corPrimaria: ctx.clube.corPrimaria,
    logo: await carregarLogo(ctx.clube.logoUrl),
  };
  const buffer = await renderToBuffer(
    <PdfEstatisticaGeral dados={res.dados} marca={marca} />,
  );
  const nomeFicheiro = `estatisticas-gerais-${slugificar(ctx.clube.nome)}-${carimboData()}.pdf`;
  return { ok: true, buffer, nomeFicheiro };
}
