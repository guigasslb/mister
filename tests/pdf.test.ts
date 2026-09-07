import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `server-only` lança fora de um contexto de servidor (ex.: em testes) — neutralizado.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/permissoes", () => ({ obterMembroAtual: vi.fn() }));
vi.mock("@/lib/actions/analise", () => ({
  obterAnaliticoEscalao: vi.fn(),
  obterAnaliticoClubeEpoca: vi.fn(),
}));

import { gerarPdfAnalitico } from "@/lib/pdf/gerar-pdf";
import { obterMembroAtual } from "@/lib/permissoes";
import {
  obterAnaliticoEscalao,
  obterAnaliticoClubeEpoca,
} from "@/lib/actions/analise";

const m = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

function ctxClube() {
  return {
    utilizadorId: "u1",
    membroId: "mem1",
    clube: {
      id: "clube1",
      nome: "Sport Clube",
      corPrimaria: "#0055AA",
      corSecundaria: "#FFD700",
      logoUrl: null, // null → sem fetch de logótipo (usa placeholder).
    },
    perfil: {},
    capacidades: ["RELATORIOS_VER"],
    ambito: "TODO_CLUBE",
    escaloesAtribuidos: [],
    seccoesCoordenadas: [],
  };
}

function analiticoEscalao() {
  return {
    sucesso: true as const,
    dados: {
      escalao: { id: "esc1", nome: "Sub-13" },
      epoca: { id: "ep1", nome: "2025/26" },
      jogos: 3,
      vitorias: 2,
      empates: 0,
      derrotas: 1,
      golosMarcados: 7,
      golosSofridos: 4,
      golosMarcadosMedia: 2.33,
      golosSofridosMedia: 1.33,
      sessoes: 10,
      sessoesExecutadas: 4,
      nAtletas: 12,
      taxaPresencaMedia: 0.82,
      marcadores: [{ atletaId: "a1", nome: "João", valor: 4 }],
      assistentes: [{ atletaId: "a2", nome: "Rui", valor: 3 }],
      maisUtilizados: [
        { atletaId: "a1", nome: "João", tempoJogoAcumulado: 120, jogosUtilizados: 3 },
        { atletaId: "a2", nome: "Rui", tempoJogoAcumulado: 80, jogosUtilizados: 2 },
      ],
      rankingAssiduidade: [
        { atletaId: "a1", nome: "João", presencas: 4, taxa: 1 },
        { atletaId: "a2", nome: "Rui", presencas: 3, taxa: 0.75 },
      ],
      eventosPorTipo: {},
      presencaMensal: [],
      distribuicaoTipoTreino: {},
      resultados: [],
      rankingsMetricas: [],
      cartoes: { amarelos: 2, vermelhos: 0 },
      rankingDisciplina: [{ atletaId: "a1", nome: "João", amarelos: 2, vermelhos: 0 }],
    },
  };
}

function analiticoClube() {
  return {
    sucesso: true as const,
    dados: {
      clube: { id: "clube1", nome: "Sport Clube" },
      epoca: { id: "ep1", nome: "2025/26" },
      escaloes: [
        {
          escalaoId: "esc1",
          nome: "Sub-13",
          modalidade: "FUTSAL",
          nAtletas: 12,
          jogos: 3,
          vitorias: 2,
          empates: 0,
          derrotas: 1,
          golosMarcados: 7,
          golosSofridos: 4,
          sessoes: 10,
          sessoesExecutadas: 4,
          taxaPresencaMedia: 0.82,
        },
      ],
      totais: {
        nAtletas: 12,
        jogos: 3,
        vitorias: 2,
        empates: 0,
        derrotas: 1,
        golosMarcados: 7,
        golosSofridos: 4,
        sessoes: 10,
        sessoesExecutadas: 4,
        taxaPresencaMediaGlobal: 0.82,
      },
      balanco: {
        vitorias: 2,
        empates: 0,
        derrotas: 1,
        jogos: 3,
        golosMarcados: 7,
        golosSofridos: 4,
      },
    },
  };
}

/** Um relatório imprimível válido é um documento HTML auto-contido. */
function eHtmlImprimivel(html: string): boolean {
  return (
    html.length > 100 &&
    html.trimStart().startsWith("<!DOCTYPE html>") &&
    html.includes("window.print()")
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m(obterMembroAtual).mockResolvedValue(ctxClube());
});

describe("gerarPdfAnalitico", () => {
  it("gera um relatório HTML válido do escalão (estatística individual)", async () => {
    m(obterAnaliticoEscalao).mockResolvedValue(analiticoEscalao());

    const r = await gerarPdfAnalitico({ tipo: "escalao", escalaoId: "esc1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(eHtmlImprimivel(r.html)).toBe(true);
    expect(r.titulo).toBe("Estatística individual — Sub-13");
    // Dados do analítico refletidos no documento (paridade com os painéis/CSV).
    expect(r.html).toContain("Sub-13");
    expect(r.html).toContain("Sport Clube");
    expect(r.html).toContain("João");
    // Escapamento de HTML aplicado a texto dinâmico (segurança).
    expect(r.html).not.toMatch(/<script[^>]*>[^<]*João/);
  });

  it("gera um relatório HTML válido do clube (estatísticas gerais)", async () => {
    m(obterAnaliticoClubeEpoca).mockResolvedValue(analiticoClube());

    const r = await gerarPdfAnalitico({ tipo: "clube" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(eHtmlImprimivel(r.html)).toBe(true);
    expect(r.titulo).toBe("Estatísticas gerais — Sport Clube");
    expect(r.html).toContain("Sport Clube");
    // Blocos do relatório geral redesenhado (paridade com os painéis).
    expect(r.html).toContain("Geral");
    expect(r.html).toContain("Resultados");
    expect(r.html).toContain("Por escalão");
  });

  it("propaga «Sem permissão» como 403", async () => {
    m(obterAnaliticoEscalao).mockResolvedValue({ sucesso: false, erro: "Sem permissão" });

    const r = await gerarPdfAnalitico({ tipo: "escalao", escalaoId: "esc1" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
  });

  it("devolve 401 quando não há membro autenticado", async () => {
    m(obterMembroAtual).mockResolvedValue(null);

    const r = await gerarPdfAnalitico({ tipo: "clube" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(401);
  });
});

describe("gerarPdfAnalitico · logótipo do clube", () => {
  const fetchOriginal = globalThis.fetch;

  /** Contexto de clube com um logótipo por URL (formato configurável). */
  function ctxClubeComLogo(logoUrl: string) {
    const base = ctxClube();
    return { ...base, clube: { ...base.clube, logoUrl } };
  }

  /** Simula a resposta HTTP do fetch do logótipo. */
  function mockFetchLogo(contentType: string | null, bytes = new Uint8Array([1, 2, 3, 4])) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null) },
      arrayBuffer: async () => bytes.buffer,
    }) as unknown as typeof fetch;
  }

  beforeEach(() => {
    m(obterAnaliticoClubeEpoca).mockResolvedValue(analiticoClube());
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it("embute o logótipo PNG como data URI no relatório", async () => {
    m(obterMembroAtual).mockResolvedValue(ctxClubeComLogo("https://cdn.exemplo.pt/escudo.png"));
    mockFetchLogo("image/png");

    const r = await gerarPdfAnalitico({ tipo: "clube" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.html).toContain("data:image/png;base64,");
    expect(r.html).not.toContain('class="marca-logo-ph"'); // sem placeholder quando há logo
  });

  it("embute logótipos WebP/SVG (antes descartados) via content-type", async () => {
    m(obterMembroAtual).mockResolvedValue(ctxClubeComLogo("https://cdn.exemplo.pt/escudo.webp"));
    mockFetchLogo("image/webp");

    const r = await gerarPdfAnalitico({ tipo: "clube" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.html).toContain("data:image/webp;base64,");
  });

  it("infere o MIME pela extensão quando o servidor devolve octet-stream", async () => {
    m(obterMembroAtual).mockResolvedValue(ctxClubeComLogo("https://cdn.exemplo.pt/escudo.svg"));
    mockFetchLogo("application/octet-stream");

    const r = await gerarPdfAnalitico({ tipo: "clube" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.html).toContain("data:image/svg+xml;base64,");
  });

  it("cai no placeholder (fallback gracioso) quando o logótipo não é reconhecível", async () => {
    m(obterMembroAtual).mockResolvedValue(ctxClubeComLogo("https://cdn.exemplo.pt/escudo.bin"));
    mockFetchLogo("application/octet-stream");

    const r = await gerarPdfAnalitico({ tipo: "clube" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.html).not.toContain("data:image");
    expect(r.html).toContain('class="marca-logo-ph"'); // inicial do clube
  });
});
