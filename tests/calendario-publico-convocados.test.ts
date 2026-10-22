import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    escalao: { findUnique: vi.fn() },
    epoca: { findFirst: vi.fn() },
    jogo: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import {
  mapearJogoPublico,
  nomePrimeiroUltimo,
  obterCalendarioPublico,
  ordenarConvocadosPublicos,
  selectJogoCalendarioPublico,
  SELECT_JOGO_CALENDARIO_PUBLICO,
} from "@/lib/calendario-publico";
import {
  comporHoraConcentracao,
  formatarConcentracao,
  horaConcentracaoParaInput,
} from "@/lib/concentracao";
import {
  ERRO_CONCENTRACAO_DEPOIS_DO_JOGO,
  MAX_LOCAL_CONCENTRACAO,
  jogoSchema,
} from "@/lib/schemas/jogo";
import { mostrarConvocadosCalendarioSchema } from "@/lib/schemas/calendario-publico";
import { camposJogoDoConfronto } from "@/lib/sincronizacao-jogo-confronto";

type Mock = ReturnType<typeof vi.fn>;
const m = (fn: unknown) => fn as Mock;

const ESC = "ckv9v0z1w0000abcd1234efgh";
const TOKEN = "A".repeat(16) + "b_-9".repeat(4);
const AGORA = new Date("2026-10-21T12:00:00.000Z");

function escalao(mostrar: boolean) {
  return {
    id: ESC,
    nome: "Benjamins",
    clubeId: "clube1",
    calendarioPublicoMostrarConvocados: mostrar,
    clube: { nome: "GD Exemplo", corPrimaria: "#0055AA", logoUrl: null },
  };
}

/** Linha "da BD" com campos privados a mais (não devem passar para o DTO). */
function jogoComConvocados() {
  return {
    data: new Date("2026-11-01T10:00:00.000Z"),
    adversario: "Rival FC",
    casaFora: "CASA" as const,
    local: null,
    competicao: null,
    golosMarcados: null,
    golosSofridos: null,
    competicaoRef: null,
    equipaCompeticao: null,
    horaConcentracao: new Date("2026-11-01T09:00:00.000Z"),
    localConcentracao: " Sede do clube ",
    relatorio: "nota interna",
    convocatorias: [
      {
        id: "conv1",
        atletaId: "atl1",
        atleta: {
          id: "atl1",
          nome: "Maria  da Silva   Santos ",
          fotoUrl: "https://x/foto.webp",
          dataNascimento: new Date("2016-01-01"),
          participacoes: [{ numero: 7 }],
        },
      },
      { atleta: { nome: "Zé", participacoes: [] } },
      { atleta: { nome: "Ana Costa", participacoes: [{ numero: 3 }] } },
      { atleta: { nome: "Bruno Dias", participacoes: [{ numero: 7 }] } },
    ],
  };
}

beforeEach(() => vi.clearAllMocks());

// ─── Nome «Primeiro Último» ─────────────────────────────────────────────────
describe("nomePrimeiroUltimo", () => {
  it("1, 2 e 4 palavras", () => {
    expect(nomePrimeiroUltimo("Zé")).toBe("Zé");
    expect(nomePrimeiroUltimo("Ana Costa")).toBe("Ana Costa");
    expect(nomePrimeiroUltimo("João Pedro Ferreira Gomes")).toBe("João Gomes");
  });
  it("espaços extra e partículas: o último é a última palavra", () => {
    expect(nomePrimeiroUltimo("  Maria   da  Silva  ")).toBe("Maria Silva");
    expect(nomePrimeiroUltimo("Rui de Sousa da Costa")).toBe("Rui Costa");
    expect(nomePrimeiroUltimo("Inês da")).toBe("Inês da");
    expect(nomePrimeiroUltimo("   ")).toBe("");
  });
  it("ordena por número (sem número no fim) e depois por nome", () => {
    expect(
      ordenarConvocadosPublicos([
        { nome: "Zé", numero: null },
        { nome: "Bruno Dias", numero: 7 },
        { nome: "Ana Costa", numero: 3 },
        { nome: "Álvaro Reis", numero: 7 },
        { nome: "Abel Neto", numero: null },
      ]),
    ).toEqual([
      { nome: "Ana Costa", numero: 3 },
      { nome: "Álvaro Reis", numero: 7 },
      { nome: "Bruno Dias", numero: 7 },
      { nome: "Abel Neto", numero: null },
      { nome: "Zé", numero: null },
    ]);
  });
});

// ─── Projeção pública com o interruptor ligado/desligado ────────────────────
describe("convocados no calendário público", () => {
  it("select desligado = base fechada, sem convocatórias", () => {
    const sel = selectJogoCalendarioPublico({
      escalaoId: ESC,
      epocaId: "ep1",
      clubeId: "clube1",
      mostrarConvocados: false,
    });
    expect(sel).toBe(SELECT_JOGO_CALENDARIO_PUBLICO);
    expect("convocatorias" in sel).toBe(false);
  });

  it("select ligado: só convocados do clube, nome + nº da participação no escalão/época", () => {
    const sel = selectJogoCalendarioPublico({
      escalaoId: ESC,
      epocaId: "ep1",
      clubeId: "clube1",
      mostrarConvocados: true,
    });
    expect(sel).toEqual({
      ...SELECT_JOGO_CALENDARIO_PUBLICO,
      convocatorias: {
        where: { convocado: true, atleta: { clubeId: "clube1" } },
        select: {
          atleta: {
            select: {
              nome: true,
              participacoes: {
                where: { escalaoId: ESC, epocaId: "ep1" },
                select: { numero: true },
                take: 1,
              },
            },
          },
        },
      },
    });
  });

  it("desligado: mesmo que a linha traga convocatórias, não saem", () => {
    const dto = mapearJogoPublico(jogoComConvocados() as never, AGORA, "GD Exemplo", false);
    expect(dto.convocados).toBeNull();
    expect(JSON.stringify(dto)).not.toMatch(/Maria|Bruno|atl1|conv1|foto|nota interna/);
  });

  it("ligado: «Primeiro Último · nº», ordenados, sem ids/fotos/datas", () => {
    const dto = mapearJogoPublico(jogoComConvocados() as never, AGORA, "GD Exemplo", true);
    expect(dto.convocados).toEqual([
      { nome: "Ana Costa", numero: 3 },
      { nome: "Bruno Dias", numero: 7 },
      { nome: "Maria Santos", numero: 7 },
      { nome: "Zé", numero: null },
    ]);
    for (const c of dto.convocados ?? []) expect(Object.keys(c).sort()).toEqual(["nome", "numero"]);
    expect(JSON.stringify(dto)).not.toMatch(/atl1|conv1|foto|2016|Silva|nota interna/);
  });

  it("ligado sem convocatória → sem secção (null)", () => {
    const dto = mapearJogoPublico(
      { ...jogoComConvocados(), convocatorias: [] } as never,
      AGORA,
      "GD Exemplo",
      true,
    );
    expect(dto.convocados).toBeNull();
  });

  it("concentração: hora ISO + local; vazia → null", () => {
    const dto = mapearJogoPublico(jogoComConvocados() as never, AGORA, "GD Exemplo");
    expect(dto.concentracao).toEqual({ hora: "2026-11-01T09:00:00.000Z", local: "Sede do clube" });
    const sem = mapearJogoPublico(
      { ...jogoComConvocados(), horaConcentracao: null, localConcentracao: "  " } as never,
      AGORA,
    );
    expect(sem.concentracao).toBeNull();
  });

  it("leitura pública: o opt-in do escalão decide o select e a query fica no escalão/época/clube", async () => {
    m(prisma.escalao.findUnique).mockResolvedValue(escalao(true));
    m(prisma.epoca.findFirst).mockResolvedValue({ id: "ep1", nome: "2026/27" });
    m(prisma.jogo.findMany).mockResolvedValue([jogoComConvocados()]);
    const cal = await obterCalendarioPublico(TOKEN, AGORA);
    const args = m(prisma.jogo.findMany).mock.calls[0][0];
    expect(args.where).toEqual({ escalaoId: ESC, epocaId: "ep1", escalao: { clubeId: "clube1" } });
    expect(args.select.convocatorias.where).toEqual({
      convocado: true,
      atleta: { clubeId: "clube1" },
    });
    expect(args.select.convocatorias.select.atleta.select.participacoes.where).toEqual({
      escalaoId: ESC,
      epocaId: "ep1",
    });
    expect(cal?.proximos[0].convocados).toHaveLength(4);

    vi.clearAllMocks();
    m(prisma.escalao.findUnique).mockResolvedValue(escalao(false));
    m(prisma.epoca.findFirst).mockResolvedValue({ id: "ep1", nome: "2026/27" });
    m(prisma.jogo.findMany).mockResolvedValue([jogoComConvocados()]);
    const cal2 = await obterCalendarioPublico(TOKEN, AGORA);
    expect(m(prisma.jogo.findMany).mock.calls[0][0].select).toBe(SELECT_JOGO_CALENDARIO_PUBLICO);
    expect(cal2?.proximos[0].convocados).toBeNull();
  });
});

// ─── Concentração: schema Zod e helpers ─────────────────────────────────────
describe("concentração", () => {
  const BASE = {
    data: "2026-11-01T10:00:00.000Z",
    adversario: "Rival FC",
    casaFora: "CASA",
    escalaoId: ESC,
  };

  it("schema: opcional, null limpa, antes do jogo é válido", () => {
    expect(jogoSchema.safeParse(BASE).success).toBe(true);
    const nulo = jogoSchema.safeParse({ ...BASE, horaConcentracao: null, localConcentracao: null });
    expect(nulo.success && nulo.data.horaConcentracao).toBeNull();
    const ok = jogoSchema.safeParse({
      ...BASE,
      horaConcentracao: "2026-11-01T09:00:00.000Z",
      localConcentracao: "  Sede  ",
    });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.localConcentracao).toBe("Sede");
    expect(ok.success && ok.data.horaConcentracao?.toISOString()).toBe("2026-11-01T09:00:00.000Z");
  });

  it("schema: depois da hora do jogo, data inválida ou local longo → erro", () => {
    const depois = jogoSchema.safeParse({ ...BASE, horaConcentracao: "2026-11-01T11:00:00.000Z" });
    expect(depois.success).toBe(false);
    expect(!depois.success && depois.error.issues[0]).toMatchObject({
      path: ["horaConcentracao"],
      message: ERRO_CONCENTRACAO_DEPOIS_DO_JOGO,
    });
    expect(jogoSchema.safeParse({ ...BASE, horaConcentracao: "amanhã" }).success).toBe(false);
    expect(
      jogoSchema.safeParse({ ...BASE, localConcentracao: "x".repeat(MAX_LOCAL_CONCENTRACAO + 1) })
        .success,
    ).toBe(false);
  });

  it("compõe a hora com o dia do jogo (Lisboa) e formata", () => {
    const h = comporHoraConcentracao("2026-11-01T10:00", "09:15");
    expect(h?.toISOString()).toBe("2026-11-01T09:15:00.000Z"); // WET (UTC+0)
    expect(comporHoraConcentracao("2026-07-01T10:00", "09:15")?.toISOString()).toBe(
      "2026-07-01T08:15:00.000Z", // WEST (UTC+1)
    );
    expect(comporHoraConcentracao("2026-11-01T10:00", "")).toBeNull();
    expect(comporHoraConcentracao("", "09:15")).toBeNull();
    expect(horaConcentracaoParaInput(h)).toBe("09:15");
    expect(horaConcentracaoParaInput(null)).toBe("");
    expect(formatarConcentracao(h!, "2026-11-01T10:00:00.000Z")).toBe("09:15");
    expect(formatarConcentracao(h!, "2026-11-02T10:00:00.000Z")).toContain("01/11");
  });

  it("opt-in: schema exige escalão cuid e booleano", () => {
    expect(mostrarConvocadosCalendarioSchema.safeParse({ escalaoId: ESC, ativo: true }).success).toBe(true);
    expect(mostrarConvocadosCalendarioSchema.safeParse({ escalaoId: ESC, ativo: "sim" }).success).toBe(false);
  });

  it("sincronização competição → /jogos não toca na concentração", () => {
    const campos = camposJogoDoConfronto(
      {
        equipaCasa: "GD Exemplo",
        equipaFora: "Rival FC",
        dataHora: new Date("2026-11-01T10:00:00.000Z"),
        golosCasa: 2,
        golosFora: 1,
        estado: "REALIZADO",
      } as never,
      "CASA",
    );
    expect(Object.keys(campos)).not.toContain("horaConcentracao");
    expect(Object.keys(campos)).not.toContain("localConcentracao");
  });
});
