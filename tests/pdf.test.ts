import { describe, it, expect, vi, beforeEach } from "vitest";

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

/** Um PDF válido começa sempre pelos bytes "%PDF". */
function ePdf(buffer: Buffer): boolean {
  return buffer.byteLength > 100 && buffer.subarray(0, 4).toString("latin1") === "%PDF";
}

beforeEach(() => {
  vi.clearAllMocks();
  m(obterMembroAtual).mockResolvedValue(ctxClube());
});

describe("gerarPdfAnalitico", () => {
  it("gera um PDF válido do escalão (estatística individual)", async () => {
    m(obterAnaliticoEscalao).mockResolvedValue(analiticoEscalao());

    const r = await gerarPdfAnalitico({ tipo: "escalao", escalaoId: "esc1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ePdf(r.buffer)).toBe(true);
    expect(r.nomeFicheiro).toMatch(/^estatistica-sub-13-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("gera um PDF válido do clube (estatísticas gerais)", async () => {
    m(obterAnaliticoClubeEpoca).mockResolvedValue(analiticoClube());

    const r = await gerarPdfAnalitico({ tipo: "clube" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ePdf(r.buffer)).toBe(true);
    expect(r.nomeFicheiro).toMatch(/^estatisticas-gerais-sport-clube-\d{4}-\d{2}-\d{2}\.pdf$/);
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
