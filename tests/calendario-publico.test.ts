import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({ exigirCapacidade: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    escalao: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    epoca: { findFirst: vi.fn() },
    jogo: { findMany: vi.fn() },
  },
}));

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirCapacidade } from "@/lib/permissoes";
import {
  linkCalendarioPublicoSchema,
  tokenCalendarioPublicoSchema,
  caminhoCalendarioPublico,
} from "@/lib/schemas/calendario-publico";
import {
  gerarTokenCalendario,
  mapearJogoPublico,
  montarCalendarioPublico,
  nomeSubequipaPublico,
  obterCalendarioPublico,
  whereJogosCalendarioPublico,
  SELECT_ESCALAO_CALENDARIO_PUBLICO,
  SELECT_JOGO_CALENDARIO_PUBLICO,
} from "@/lib/calendario-publico";
import {
  definirMostrarConvocadosCalendario,
  gerarLinkCalendarioPublico,
  obterLinkCalendarioPublico,
  revogarLinkCalendarioPublico,
} from "@/lib/actions/calendario-publico";

type Mock = ReturnType<typeof vi.fn>;
const m = (fn: unknown) => fn as Mock;

const ESC = "ckv9v0z1w0000abcd1234efgh";
const TOKEN = "A".repeat(16) + "b_-9".repeat(4); // 32 chars base64url
const AGORA = new Date("2026-10-21T12:00:00.000Z");

const ESCALAO_ROW = {
  id: ESC,
  nome: "Benjamins",
  clubeId: "clube1",
  calendarioPublicoMostrarConvocados: false,
  clube: { nome: "GD Exemplo", corPrimaria: "#0055AA", logoUrl: null },
};

function jogoRow(dataIso: string, extra: Record<string, unknown> = {}) {
  return {
    data: new Date(dataIso),
    adversario: "Rival FC",
    casaFora: "CASA" as const,
    local: "Pavilhão Municipal",
    competicao: null,
    golosMarcados: 3,
    golosSofridos: 1,
    competicaoRef: { nome: "Distrital" },
    equipaCompeticao: null,
    horaConcentracao: null,
    localConcentracao: null,
    ...extra,
  };
}

const CAMPOS_PUBLICOS = [
  "adversario",
  "casaFora",
  "competicao",
  "concentracao",
  "convocados",
  "data",
  "equipa",
  "local",
  "marcadores",
  "resultado",
].sort();

beforeEach(() => {
  vi.clearAllMocks();
  m(exigirCapacidade).mockResolvedValue({ ok: true, ctx: { clube: { id: "clube1" } } });
});

// ─── Schemas Zod ─────────────────────────────────────────────────────────────
describe("schemas do calendário público", () => {
  it("linkCalendarioPublicoSchema exige escalaoId cuid", () => {
    expect(linkCalendarioPublicoSchema.safeParse({ escalaoId: ESC }).success).toBe(true);
    expect(linkCalendarioPublicoSchema.safeParse({ escalaoId: "abc" }).success).toBe(false);
    expect(linkCalendarioPublicoSchema.safeParse({}).success).toBe(false);
  });

  it("tokenCalendarioPublicoSchema aceita só 32 caracteres base64url", () => {
    expect(tokenCalendarioPublicoSchema.safeParse(TOKEN).success).toBe(true);
    expect(tokenCalendarioPublicoSchema.safeParse(TOKEN.slice(1)).success).toBe(false);
    expect(tokenCalendarioPublicoSchema.safeParse(TOKEN + "a").success).toBe(false);
    expect(tokenCalendarioPublicoSchema.safeParse("../".repeat(10) + "ab").success).toBe(false);
    expect(tokenCalendarioPublicoSchema.safeParse("=".repeat(32)).success).toBe(false);
    expect(tokenCalendarioPublicoSchema.safeParse(42).success).toBe(false);
  });

  it("gerarTokenCalendario produz tokens válidos e únicos", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => gerarTokenCalendario()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(tokenCalendarioPublicoSchema.safeParse(t).success).toBe(true);
  });

  it("caminho público fica sob o prefixo /r/ (fora do matcher de auth)", () => {
    expect(caminhoCalendarioPublico(TOKEN)).toBe(`/r/calendario/${TOKEN}`);
  });
});

// ─── Seleção mínima (sem fuga de campos privados) ────────────────────────────
describe("seleção pública mínima", () => {
  it("o select do jogo é uma lista fechada sem dados privados", () => {
    expect(Object.keys(SELECT_JOGO_CALENDARIO_PUBLICO).sort()).toEqual(
      [
        "adversario",
        "casaFora",
        "competicao",
        "competicaoRef",
        "data",
        "equipaCompeticao",
        "golosMarcados",
        "golosSofridos",
        "horaConcentracao",
        "local",
        "localConcentracao",
      ].sort(),
    );
    expect(SELECT_JOGO_CALENDARIO_PUBLICO.competicaoRef).toEqual({ select: { nome: true } });
    expect(SELECT_JOGO_CALENDARIO_PUBLICO.equipaCompeticao).toEqual({ select: { nome: true } });
  });

  it("o select do escalão só traz identidade do clube", () => {
    expect(Object.keys(SELECT_ESCALAO_CALENDARIO_PUBLICO).sort()).toEqual(
      ["calendarioPublicoMostrarConvocados", "clube", "clubeId", "id", "nome"].sort(),
    );
    expect(SELECT_ESCALAO_CALENDARIO_PUBLICO.clube).toEqual({
      select: { nome: true, corPrimaria: true, logoUrl: true },
    });
  });

  it("o filtro dos jogos fixa escalão, época e clube do escalão", () => {
    expect(whereJogosCalendarioPublico({ id: ESC, clubeId: "clube1" }, "ep1")).toEqual({
      escalaoId: ESC,
      epocaId: "ep1",
      escalao: { clubeId: "clube1" },
    });
  });

  it("mapearJogoPublico projeta só os campos públicos, mesmo com campos extra no registo", () => {
    const comPrivados = jogoRow("2026-10-01T15:00:00.000Z", {
      relatorio: "notas internas",
      videoUrl: "https://youtube.com/x",
      criadorId: "u1",
      convocatorias: [{ atletaId: "a1" }],
      estatisticas: [{ golos: 2 }],
    });
    const dto = mapearJogoPublico(comPrivados as never, AGORA);
    expect(Object.keys(dto).sort()).toEqual(CAMPOS_PUBLICOS);
    expect(JSON.stringify(dto)).not.toMatch(/notas internas|youtube|u1|a1/);
    expect(dto).toEqual({
      data: "2026-10-01T15:00:00.000Z",
      adversario: "Rival FC",
      casaFora: "CASA",
      local: "Pavilhão Municipal",
      competicao: "Distrital",
      equipa: null,
      resultado: { marcados: 3, sofridos: 1 },
      concentracao: null,
      convocados: null,
      marcadores: null,
    });
  });

  it("resultado só aparece em jogos já realizados com placar completo", () => {
    expect(mapearJogoPublico(jogoRow("2026-11-01T15:00:00.000Z"), AGORA).resultado).toBeNull();
    expect(
      mapearJogoPublico(jogoRow("2026-10-01T15:00:00.000Z", { golosSofridos: null }), AGORA)
        .resultado,
    ).toBeNull();
  });

  it("competição usa o nome da competição e cai no texto legado; subequipa vem do nome", () => {
    const legado = mapearJogoPublico(
      jogoRow("2026-10-01T15:00:00.000Z", {
        competicaoRef: null,
        competicao: "  Taça  ",
        equipaCompeticao: { nome: "Benjamins B" },
        local: "   ",
      }),
      AGORA,
    );
    expect(legado.competicao).toBe("Taça");
    expect(legado.equipa).toBe("Benjamins B");
    expect(legado.local).toBeNull();
  });

  it("montarCalendarioPublico separa próximos (asc) e realizados (desc)", () => {
    const cal = montarCalendarioPublico(
      ESCALAO_ROW,
      { nome: "2026/27" },
      [
        jogoRow("2026-09-01T10:00:00.000Z"),
        jogoRow("2026-12-01T10:00:00.000Z"),
        jogoRow("2026-10-10T10:00:00.000Z"),
        jogoRow("2026-11-01T10:00:00.000Z"),
      ],
      AGORA,
    );
    expect(cal.proximos.map((j) => j.data)).toEqual([
      "2026-11-01T10:00:00.000Z",
      "2026-12-01T10:00:00.000Z",
    ]);
    expect(cal.realizados.map((j) => j.data)).toEqual([
      "2026-10-10T10:00:00.000Z",
      "2026-09-01T10:00:00.000Z",
    ]);
    expect(cal.clube).toEqual({ nome: "GD Exemplo", corPrimaria: "#0055AA", logoUrl: null });
    expect(Object.keys(cal).sort()).toEqual(
      ["clube", "epoca", "escalao", "proximos", "realizados"].sort(),
    );
    expect(cal.escalao).toEqual({ nome: "Benjamins" });
  });
});

// ─── Leitura pública pelo token ──────────────────────────────────────────────
describe("obterCalendarioPublico", () => {
  it("token malformado → null sem tocar na BD", async () => {
    expect(await obterCalendarioPublico("curto", AGORA)).toBeNull();
    expect(await obterCalendarioPublico(undefined, AGORA)).toBeNull();
    expect(m(prisma.escalao.findUnique)).not.toHaveBeenCalled();
  });

  it("token inexistente/revogado → null", async () => {
    m(prisma.escalao.findUnique).mockResolvedValue(null);
    expect(await obterCalendarioPublico(TOKEN, AGORA)).toBeNull();
    expect(m(prisma.escalao.findUnique)).toHaveBeenCalledWith({
      where: { calendarioPublicoToken: TOKEN },
      select: SELECT_ESCALAO_CALENDARIO_PUBLICO,
    });
    expect(m(prisma.jogo.findMany)).not.toHaveBeenCalled();
  });

  it("token válido → jogos só desse escalão, época ativa do mesmo clube, select mínimo", async () => {
    m(prisma.escalao.findUnique).mockResolvedValue(ESCALAO_ROW);
    m(prisma.epoca.findFirst).mockResolvedValue({ id: "ep1", nome: "2026/27" });
    m(prisma.jogo.findMany).mockResolvedValue([jogoRow("2026-11-01T10:00:00.000Z")]);

    const cal = await obterCalendarioPublico(TOKEN, AGORA);

    expect(m(prisma.epoca.findFirst)).toHaveBeenCalledWith({
      where: { clubeId: "clube1", ativa: true },
      select: { id: true, nome: true },
    });
    expect(m(prisma.jogo.findMany)).toHaveBeenCalledWith({
      where: { escalaoId: ESC, epocaId: "ep1", escalao: { clubeId: "clube1" } },
      select: SELECT_JOGO_CALENDARIO_PUBLICO,
      orderBy: { data: "asc" },
    });
    expect(cal?.epoca).toEqual({ nome: "2026/27" });
    expect(cal?.proximos).toHaveLength(1);
  });

  it("clube sem época ativa → calendário vazio, sem consultar jogos", async () => {
    m(prisma.escalao.findUnique).mockResolvedValue(ESCALAO_ROW);
    m(prisma.epoca.findFirst).mockResolvedValue(null);
    const cal = await obterCalendarioPublico(TOKEN, AGORA);
    expect(cal).toMatchObject({ epoca: null, proximos: [], realizados: [] });
    expect(m(prisma.jogo.findMany)).not.toHaveBeenCalled();
  });
});

// ─── Server Actions (gestão do link) ─────────────────────────────────────────
describe("actions do link do calendário", () => {
  it("input inválido → erro de validação sem verificar permissões", async () => {
    const r = await gerarLinkCalendarioPublico({ escalaoId: "x" });
    expect(r.sucesso).toBe(false);
    expect(m(exigirCapacidade)).not.toHaveBeenCalled();
    expect(m(prisma.escalao.updateMany)).not.toHaveBeenCalled();
  });

  it("sem permissão → erro e nada é escrito", async () => {
    m(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    expect(await gerarLinkCalendarioPublico({ escalaoId: ESC })).toEqual({
      sucesso: false,
      erro: "Sem permissão",
      camposInvalidos: undefined,
    });
    expect(await revogarLinkCalendarioPublico({ escalaoId: ESC })).toMatchObject({
      sucesso: false,
    });
    expect(await obterLinkCalendarioPublico({ escalaoId: ESC })).toMatchObject({
      sucesso: false,
    });
    expect(m(prisma.escalao.updateMany)).not.toHaveBeenCalled();
    expect(m(prisma.escalao.findFirst)).not.toHaveBeenCalled();
  });

  it("gerar: exige JOGOS_GERIR no escalão, grava token novo filtrado pelo clube", async () => {
    m(prisma.escalao.updateMany).mockResolvedValue({ count: 1 });
    const r = await gerarLinkCalendarioPublico({ escalaoId: ESC });
    expect(m(exigirCapacidade)).toHaveBeenCalledWith("JOGOS_GERIR", ESC);
    expect(r.sucesso).toBe(true);
    const token = r.sucesso ? r.dados.token : "";
    expect(tokenCalendarioPublicoSchema.safeParse(token).success).toBe(true);
    expect(m(prisma.escalao.updateMany)).toHaveBeenCalledWith({
      where: { id: ESC, clubeId: "clube1" },
      data: { calendarioPublicoToken: token },
    });
    expect(m(revalidatePath)).toHaveBeenCalledWith("/jogos");
  });

  it("regenerar produz um token diferente do anterior", async () => {
    m(prisma.escalao.updateMany).mockResolvedValue({ count: 1 });
    const a = await gerarLinkCalendarioPublico({ escalaoId: ESC });
    const b = await gerarLinkCalendarioPublico({ escalaoId: ESC });
    expect(a.sucesso && b.sucesso && a.dados.token !== b.dados.token).toBe(true);
  });

  it("escalão de outro clube → «Escalão não encontrado»", async () => {
    m(prisma.escalao.updateMany).mockResolvedValue({ count: 0 });
    expect(await gerarLinkCalendarioPublico({ escalaoId: ESC })).toMatchObject({
      sucesso: false,
      erro: "Escalão não encontrado",
    });
    expect(await revogarLinkCalendarioPublico({ escalaoId: ESC })).toMatchObject({
      sucesso: false,
      erro: "Escalão não encontrado",
    });
    expect(m(revalidatePath)).not.toHaveBeenCalled();
  });

  it("revogar: põe o token a null no escalão do clube", async () => {
    m(prisma.escalao.updateMany).mockResolvedValue({ count: 1 });
    const r = await revogarLinkCalendarioPublico({ escalaoId: ESC });
    expect(r).toEqual({ sucesso: true, dados: undefined });
    expect(m(prisma.escalao.updateMany)).toHaveBeenCalledWith({
      where: { id: ESC, clubeId: "clube1" },
      data: { calendarioPublicoToken: null },
    });
  });

  it("obter: lê o token do escalão filtrado pelo clube", async () => {
    m(prisma.escalao.findFirst).mockResolvedValue({
      calendarioPublicoToken: TOKEN,
      calendarioPublicoMostrarConvocados: true,
    });
    expect(await obterLinkCalendarioPublico({ escalaoId: ESC })).toEqual({
      sucesso: true,
      dados: { token: TOKEN, mostrarConvocados: true },
    });
    expect(m(prisma.escalao.findFirst)).toHaveBeenCalledWith({
      where: { id: ESC, clubeId: "clube1" },
      select: { calendarioPublicoToken: true, calendarioPublicoMostrarConvocados: true },
    });
  });
});

// ─── Nome da subequipa no calendário público ─────────────────────────────────
describe("nomeSubequipaPublico", () => {
  it("remove o prefixo «<clube> - »", () => {
    expect(nomeSubequipaPublico("Lusitano GC - Brancos", "Lusitano GC")).toBe("Brancos");
    expect(nomeSubequipaPublico("lusitano  gc – Azuis", "Lusitano GC")).toBe("Azuis");
  });

  it("caso real: prefixo diferente do nome do clube → último segmento", () => {
    expect(nomeSubequipaPublico("Juventude SC - Brancos", "Lusitano GC")).toBe("Brancos");
    expect(nomeSubequipaPublico("Juventude SC - Azuis")).toBe("Azuis");
  });

  it("sem separador mantém-se (inclui hífen sem espaços e nome que só começa como o clube)", () => {
    expect(nomeSubequipaPublico("Brancos", "Lusitano GC")).toBe("Brancos");
    expect(nomeSubequipaPublico("Benjamins B")).toBe("Benjamins B");
    expect(nomeSubequipaPublico("Sub-11 A")).toBe("Sub-11 A");
    expect(nomeSubequipaPublico("Lusitanos", "Lusitano")).toBe("Lusitanos");
  });

  it("nunca devolve vazio", () => {
    expect(nomeSubequipaPublico("Lusitano GC - ", "Lusitano GC")).toBe("Lusitano GC -");
  });

  it("aplicado no DTO público via montarCalendarioPublico", () => {
    const c = montarCalendarioPublico(
      ESCALAO_ROW,
      null,
      [jogoRow("2026-11-01T10:00:00.000Z", { equipaCompeticao: { nome: "GD Exemplo - Brancos" } })],
      AGORA,
    );
    expect(c.proximos[0].equipa).toBe("Brancos");
  });
});

describe("definirMostrarConvocadosCalendario", () => {
  it("exige JOGOS_GERIR no escalão e grava só no escalão do clube", async () => {
    m(prisma.escalao.updateMany).mockResolvedValue({ count: 1 });
    expect(await definirMostrarConvocadosCalendario({ escalaoId: ESC, ativo: true })).toEqual({
      sucesso: true,
      dados: { mostrarConvocados: true },
    });
    expect(m(exigirCapacidade)).toHaveBeenCalledWith("JOGOS_GERIR", ESC);
    expect(m(prisma.escalao.updateMany)).toHaveBeenCalledWith({
      where: { id: ESC, clubeId: "clube1" },
      data: { calendarioPublicoMostrarConvocados: true },
    });
    expect(m(revalidatePath)).toHaveBeenCalledWith("/jogos");
  });

  it("sem permissão, input inválido ou escalão de outro clube → nada muda", async () => {
    expect((await definirMostrarConvocadosCalendario({ escalaoId: ESC })).sucesso).toBe(false);
    m(exigirCapacidade).mockResolvedValueOnce({ ok: false, erro: "Sem permissão" });
    expect(await definirMostrarConvocadosCalendario({ escalaoId: ESC, ativo: true })).toMatchObject({
      sucesso: false,
      erro: "Sem permissão",
    });
    expect(m(prisma.escalao.updateMany)).not.toHaveBeenCalled();
    m(prisma.escalao.updateMany).mockResolvedValue({ count: 0 });
    expect(await definirMostrarConvocadosCalendario({ escalaoId: ESC, ativo: false })).toMatchObject({
      sucesso: false,
      erro: "Escalão não encontrado",
    });
    expect(m(revalidatePath)).not.toHaveBeenCalled();
  });
});
