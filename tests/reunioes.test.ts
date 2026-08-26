import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));
vi.mock("@/lib/epoca-context", () => ({
  obterClubeIdAtual: vi.fn(),
  COOKIE_EPOCA: "epoca_ativa",
}));
vi.mock("@/lib/permissoes", () => ({
  exigirCapacidade: vi.fn(),
  podeLerEscalao: vi.fn(),
  escaloesLegiveis: vi.fn(),
}));
// A sincronização com o Google Calendar é fire-and-forget e testada em
// tests/integracao-calendario.test.ts — aqui isolamos a dependência.
vi.mock("@/lib/actions/integracao", () => ({
  sincronizarComCalendario: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    reuniao: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import {
  criarReuniao,
  atualizarReuniao,
  apagarReuniao,
  alternarAfixadaReuniao,
  obterReunioesParaDashboard,
} from "@/lib/actions/reunioes";
import { auth } from "@/lib/auth";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidade, escaloesLegiveis } from "@/lib/permissoes";
import { sincronizarComCalendario } from "@/lib/actions/integracao";
import { prisma } from "@/lib/db";

const REUNIAO_ID = "ckv9v0z1w0000abcd1234efga";
const ESC_ID = "ckv9v0z1w0000abcd1234efgb";

const mocked = <T,>(fn: T) => fn as unknown as {
  mockResolvedValue: (v: unknown) => void;
  mockImplementation: (f: (...a: unknown[]) => unknown) => void;
};

const calls = (fn: unknown) => (fn as { mock: { calls: unknown[][] } }).mock.calls;

const PERM_OK = { ok: true, ctx: { clube: { id: "clube1" } } };

// Linha realista tal como o Prisma a devolve (create/update/findFirst retornam
// sempre a row completa) — inclui `data`, `googleEventId` e `afixada`.
const REUNIAO_BD = {
  id: REUNIAO_ID,
  titulo: "Reunião Mensal",
  clubeId: "clube1",
  ambito: "CLUBE",
  escalaoId: null,
  data: new Date("2026-09-15T00:00:00.000Z"),
  participantes: null,
  ordemTrabalhos: null,
  ata: null,
  afixada: false,
  googleEventId: null,
  criadorId: "user1",
  criadoEm: new Date("2026-08-01T00:00:00.000Z"),
};

const ENTRADA_CLUBE = {
  titulo: "Reunião Mensal",
  data: "2026-09-15",
  ambito: "CLUBE" as const,
};

const ENTRADA_ESCALAO = {
  titulo: "Reunião de Escalão",
  data: "2026-09-15",
  ambito: "ESCALAO" as const,
  escalaoId: ESC_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(auth).mockResolvedValue({ user: { id: "user1" } });
  mocked(obterClubeIdAtual).mockResolvedValue("clube1");
  mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
  mocked(escaloesLegiveis).mockResolvedValue("TODOS");
  mocked(prisma.reuniao.findFirst).mockResolvedValue(REUNIAO_BD);
  mocked(prisma.reuniao.create).mockResolvedValue(REUNIAO_BD);
  mocked(prisma.reuniao.update).mockResolvedValue(REUNIAO_BD);
  mocked(prisma.reuniao.delete).mockResolvedValue(REUNIAO_BD);
});

// ─── criarReuniao ─────────────────────────────────────────────────────────────

describe("criarReuniao", () => {
  it("falha sem sessão autenticada", async () => {
    mocked(auth).mockResolvedValue(null);
    const r = await criarReuniao(ENTRADA_CLUBE);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não autenticado/i);
    expect(prisma.reuniao.create).not.toHaveBeenCalled();
  });

  it("rejeita título vazio", async () => {
    const r = await criarReuniao({ ...ENTRADA_CLUBE, titulo: "" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.titulo).toBeTruthy();
    expect(prisma.reuniao.create).not.toHaveBeenCalled();
  });

  it("rejeita reunião de escalão sem escalaoId", async () => {
    const r = await criarReuniao({ titulo: "Sem Escalão", data: "2026-09-15", ambito: "ESCALAO" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.escalaoId).toBeTruthy();
    expect(prisma.reuniao.create).not.toHaveBeenCalled();
  });

  it("falha sem permissão REUNIOES_GERIR", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await criarReuniao(ENTRADA_CLUBE);
    expect(r.sucesso).toBe(false);
    expect(prisma.reuniao.create).not.toHaveBeenCalled();
  });

  it("cria reunião de clube com clubeId correto", async () => {
    const r = await criarReuniao(ENTRADA_CLUBE);
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.reuniao.create)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.clubeId).toBe("clube1");
    expect(arg.data.ambito).toBe("CLUBE");
    expect(arg.data.titulo).toBe("Reunião Mensal");
    expect(arg.data.criadorId).toBe("user1");
  });

  it("cria reunião de escalão com escalaoId correto", async () => {
    const r = await criarReuniao(ENTRADA_ESCALAO);
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.reuniao.create)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.ambito).toBe("ESCALAO");
    expect(arg.data.escalaoId).toBe(ESC_ID);
  });

  it("persiste afixada quando fornecida", async () => {
    const r = await criarReuniao({ ...ENTRADA_CLUBE, afixada: true });
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.reuniao.create)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.afixada).toBe(true);
  });

  it("assume afixada=false por omissão", async () => {
    const r = await criarReuniao(ENTRADA_CLUBE);
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.reuniao.create)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.afixada).toBe(false);
  });

  it("sincroniza com o Google Calendar uma reunião futura sem googleEventId", async () => {
    mocked(prisma.reuniao.create).mockResolvedValue({
      ...REUNIAO_BD,
      data: new Date(Date.now() + 86_400_000),
      googleEventId: null,
    });
    const r = await criarReuniao(ENTRADA_CLUBE);
    expect(r.sucesso).toBe(true);
    expect(sincronizarComCalendario).toHaveBeenCalledWith("REUNIAO", REUNIAO_ID);
  });

  it("não sincroniza uma reunião passada", async () => {
    mocked(prisma.reuniao.create).mockResolvedValue({
      ...REUNIAO_BD,
      data: new Date(Date.now() - 86_400_000),
      googleEventId: null,
    });
    const r = await criarReuniao(ENTRADA_CLUBE);
    expect(r.sucesso).toBe(true);
    expect(sincronizarComCalendario).not.toHaveBeenCalled();
  });

  it("não re-sincroniza uma reunião que já tem googleEventId", async () => {
    mocked(prisma.reuniao.create).mockResolvedValue({
      ...REUNIAO_BD,
      data: new Date(Date.now() + 86_400_000),
      googleEventId: "evt-existente",
    });
    const r = await criarReuniao(ENTRADA_CLUBE);
    expect(r.sucesso).toBe(true);
    expect(sincronizarComCalendario).not.toHaveBeenCalled();
  });
});

// ─── atualizarReuniao ─────────────────────────────────────────────────────────

describe("atualizarReuniao", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await atualizarReuniao(REUNIAO_ID, ENTRADA_CLUBE);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não autenticado/i);
    expect(prisma.reuniao.update).not.toHaveBeenCalled();
  });

  it("falha se a reunião não pertence ao clube (isolamento multi-tenant)", async () => {
    mocked(prisma.reuniao.findFirst).mockResolvedValue(null);
    const r = await atualizarReuniao(REUNIAO_ID, ENTRADA_CLUBE);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrada/i);
    expect(prisma.reuniao.update).not.toHaveBeenCalled();
  });

  it("atualiza a reunião com os novos dados", async () => {
    const r = await atualizarReuniao(REUNIAO_ID, { ...ENTRADA_CLUBE, titulo: "Novo Título" });
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.reuniao.update)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.titulo).toBe("Novo Título");
  });

  it("persiste afixada na atualização", async () => {
    const r = await atualizarReuniao(REUNIAO_ID, { ...ENTRADA_CLUBE, afixada: true });
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.reuniao.update)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.afixada).toBe(true);
  });
});

// ─── alternarAfixadaReuniao ───────────────────────────────────────────────────

describe("alternarAfixadaReuniao", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await alternarAfixadaReuniao(REUNIAO_ID);
    expect(r.sucesso).toBe(false);
    expect(prisma.reuniao.update).not.toHaveBeenCalled();
  });

  it("falha se a reunião não pertence ao clube", async () => {
    mocked(prisma.reuniao.findFirst).mockResolvedValue(null);
    const r = await alternarAfixadaReuniao(REUNIAO_ID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrada/i);
    expect(prisma.reuniao.update).not.toHaveBeenCalled();
  });

  it("inverte afixada: false → true", async () => {
    mocked(prisma.reuniao.findFirst).mockResolvedValue({ ...REUNIAO_BD, afixada: false });
    const r = await alternarAfixadaReuniao(REUNIAO_ID);
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.reuniao.update)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.afixada).toBe(true);
  });

  it("inverte afixada: true → false", async () => {
    mocked(prisma.reuniao.findFirst).mockResolvedValue({ ...REUNIAO_BD, afixada: true });
    const r = await alternarAfixadaReuniao(REUNIAO_ID);
    expect(r.sucesso).toBe(true);
    const arg = calls(prisma.reuniao.update)[0][0] as { data: Record<string, unknown> };
    expect(arg.data.afixada).toBe(false);
  });
});

// ─── obterReunioesParaDashboard ───────────────────────────────────────────────

describe("obterReunioesParaDashboard", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await obterReunioesParaDashboard();
    expect(r.sucesso).toBe(false);
    expect(prisma.reuniao.findMany).not.toHaveBeenCalled();
  });

  it("separa em próximas (futuras, asc) e anteriores (afixadas passadas, desc), limita cada grupo a 5", async () => {
    const PROXIMA = { ...REUNIAO_BD, id: "proxima" };
    const ANTERIOR = { ...REUNIAO_BD, id: "anterior" };
    // 1.ª chamada findMany → próximas; 2.ª chamada → anteriores.
    mocked(prisma.reuniao.findMany).mockImplementation(() => {
      const n = calls(prisma.reuniao.findMany).length;
      return Promise.resolve(n === 1 ? [PROXIMA] : [ANTERIOR]);
    });

    const r = await obterReunioesParaDashboard();
    expect(r.sucesso).toBe(true);
    if (!r.sucesso) return;
    expect(r.dados.proximas).toEqual([PROXIMA]);
    expect(r.dados.anteriores).toEqual([ANTERIOR]);

    // Duas consultas independentes (uma por grupo).
    expect(calls(prisma.reuniao.findMany).length).toBe(2);

    // Grupo "próximas": futuras (data >= hoje), ordem ascendente, limite 5.
    const argProximas = calls(prisma.reuniao.findMany)[0][0] as {
      where: { clubeId: string; AND: Array<Record<string, unknown>> };
      orderBy: { data: string };
      take: number;
    };
    expect(argProximas.where.clubeId).toBe("clube1");
    expect(argProximas.take).toBe(5);
    expect(argProximas.orderBy.data).toBe("asc");
    expect(argProximas.where.AND.some((c) => "data" in c && "gte" in (c.data as object))).toBe(
      true,
    );

    // Grupo "anteriores": afixadas passadas (data < hoje), ordem descendente, limite 5.
    const argAnteriores = calls(prisma.reuniao.findMany)[1][0] as {
      where: { clubeId: string; AND: Array<Record<string, unknown>> };
      orderBy: { data: string };
      take: number;
    };
    expect(argAnteriores.where.clubeId).toBe("clube1");
    expect(argAnteriores.take).toBe(5);
    expect(argAnteriores.orderBy.data).toBe("desc");
    expect(argAnteriores.where.AND).toContainEqual({ afixada: true });
    expect(argAnteriores.where.AND.some((c) => "data" in c && "lt" in (c.data as object))).toBe(
      true,
    );
  });

  it("respeita a legibilidade por escalão (âmbito restrito) nos dois grupos", async () => {
    mocked(escaloesLegiveis).mockResolvedValue([ESC_ID]);
    mocked(prisma.reuniao.findMany).mockResolvedValue([]);
    const r = await obterReunioesParaDashboard();
    expect(r.sucesso).toBe(true);

    // O filtro de âmbito (1.º bloco AND) é partilhado pelas duas consultas.
    for (const call of calls(prisma.reuniao.findMany)) {
      const arg = call[0] as { where: { AND: Array<{ OR?: Array<Record<string, unknown>> }> } };
      const orAmbito = arg.where.AND[0].OR!;
      expect(orAmbito).toContainEqual({ ambito: "CLUBE" });
      expect(orAmbito).toContainEqual({ escalaoId: { in: [ESC_ID] } });
    }
  });
});

// ─── apagarReuniao ────────────────────────────────────────────────────────────

describe("apagarReuniao", () => {
  it("falha sem clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await apagarReuniao(REUNIAO_ID);
    expect(r.sucesso).toBe(false);
    expect(prisma.reuniao.delete).not.toHaveBeenCalled();
  });

  it("falha se a reunião não pertence ao clube", async () => {
    mocked(prisma.reuniao.findFirst).mockResolvedValue(null);
    const r = await apagarReuniao(REUNIAO_ID);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrada/i);
    expect(prisma.reuniao.delete).not.toHaveBeenCalled();
  });

  it("apaga a reunião quando autorizado", async () => {
    const r = await apagarReuniao(REUNIAO_ID);
    expect(r.sucesso).toBe(true);
    expect(prisma.reuniao.delete).toHaveBeenCalledOnce();
  });
});
