import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks de infra necessários para isolar o módulo @/lib/permissoes.
// Não se mocka o módulo de permissões em si — as funções exigirCapacidade e
// escaloesLegiveis são testadas com a implementação REAL; só auth e prisma são
// substituídos para controlar o contexto devolvido por obterMembroAtual.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    membroClube: { findFirst: vi.fn() },
    escalao: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

import { exigirCapacidade, escaloesLegiveis, podeLerEscalao } from "@/lib/permissoes";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Helper de cast para mocks — mantém o mesmo padrão dos ficheiros de teste existentes.
const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockResolvedValueOnce: (v: unknown) => void;
    mock: { calls: unknown[][] };
  };

const CLUBE_ID = "clube-abc123";
const SECCAO_FUTSAL = "seccao-futsal-xyz";
const SECCAO_FUTEBOL = "seccao-futebol-xyz";

/**
 * Configura auth e prisma.membroClube.findFirst para que obterMembroAtual()
 * devolva um contexto com o âmbito, capacidades e secções indicados.
 * `capacidades` vai para perfil.capacidades; capacidadesEfetivas (função REAL)
 * processa-as em conjunto com capacidadesExtra e capacidadesRevogadas.
 */
function setupMembro(opts: {
  ambito: "TODO_CLUBE" | "SECCAO" | "PROPRIOS_ESCALOES";
  capacidades: string[];
  capacidadesExtra?: string[];
  escaloesAtribuidos?: string[];
  seccoesCoordenadas?: string[];
}) {
  mocked(auth).mockResolvedValue({ user: { id: "utilizador-1" } });
  mocked(prisma.membroClube.findFirst).mockResolvedValue({
    id: "membro-1",
    utilizadorId: "utilizador-1",
    capacidadesExtra: opts.capacidadesExtra ?? [],
    capacidadesRevogadas: [],
    clube: { id: CLUBE_ID, nome: "Clube Teste" },
    perfil: { capacidades: opts.capacidades, ambito: opts.ambito },
    atribuicoes: (opts.escaloesAtribuidos ?? []).map((id) => ({ escalaoId: id })),
    seccoes: (opts.seccoesCoordenadas ?? []).map((id) => ({ seccaoId: id })),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Carregamento de seccoesCoordenadas
// ─────────────────────────────────────────────────────────────────────────────

describe("seccoesCoordenadas — carregamento do contexto", () => {
  beforeEach(() => vi.clearAllMocks());

  it("membro COM MembroSeccao papel COORDENADOR: seccoesCoordenadas ativa permite acesso ao escalão da secção", async () => {
    // Verifica indiretamente que seccoesCoordenadas foi populado com o seccaoId:
    // se estiver vazio, exigirCapacidade nega mesmo com a capacidade presente.
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"],
      seccoesCoordenadas: [SECCAO_FUTSAL],
    });
    // escalão pertence à secção coordenada → prisma.escalao.findFirst devolve registo
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: "escalao-sub17" });

    const r = await exigirCapacidade("SECCAO_ESCALOES_GERIR", "escalao-sub17");
    expect(r.ok).toBe(true);
  });

  it("membro SEM MembroSeccao: seccoesCoordenadas = [] e exigirCapacidade nega sem consultar BD", async () => {
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"],
      seccoesCoordenadas: [], // sem linhas em MembroSeccao
    });

    const r = await exigirCapacidade("SECCAO_ESCALOES_GERIR", "escalao-sub17");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/secção/i);
    // seccoesCoordenadas.length === 0 → early return em algumEscalaoNaSeccaoCoordenada
    expect(prisma.escalao.findFirst).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. exigirCapacidade com SECCAO_ESCALOES_GERIR
// ─────────────────────────────────────────────────────────────────────────────

describe("exigirCapacidade(SECCAO_ESCALOES_GERIR) — âmbito SECCAO", () => {
  beforeEach(() => vi.clearAllMocks());

  it("coordenador da secção onde o escalão está → permite (ok: true)", async () => {
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"],
      seccoesCoordenadas: [SECCAO_FUTSAL],
    });
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: "escalao-sub17" });

    const r = await exigirCapacidade("SECCAO_ESCALOES_GERIR", "escalao-sub17");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ctx.ambito).toBe("SECCAO");
  });

  it("coordenador de secção diferente: escalão não pertence à sua secção → nega", async () => {
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"],
      seccoesCoordenadas: [SECCAO_FUTSAL], // coordena FUTSAL, não FUTEBOL
    });
    // prisma.escalao.findFirst não encontra o escalão na secção FUTSAL
    mocked(prisma.escalao.findFirst).mockResolvedValue(null);

    const r = await exigirCapacidade("SECCAO_ESCALOES_GERIR", "escalao-futebol-sub17");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/secção/i);
  });

  it("seccoesCoordenadas = [] → nega mesmo com capacidade SECCAO_ESCALOES_GERIR presente", async () => {
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"],
      seccoesCoordenadas: [],
    });

    const r = await exigirCapacidade("SECCAO_ESCALOES_GERIR", "escalao-sub17");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/secção/i);
  });

  it("escalão com seccaoId = null → nega (não herda nenhuma secção coordenada)", async () => {
    // Um escalão sem seccaoId não bate no WHERE seccaoId IN [...] → findFirst devolve null.
    // Comportamento fail-closed: escalões sem secção são inacessíveis por coordenadores.
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"],
      seccoesCoordenadas: [SECCAO_FUTSAL],
    });
    mocked(prisma.escalao.findFirst).mockResolvedValue(null); // seccaoId = null → não bate

    const r = await exigirCapacidade("SECCAO_ESCALOES_GERIR", "escalao-sem-seccao");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/secção/i);
  });

  it("sem escalaoId → âmbito não é verificado; capacidade basta para permitir", async () => {
    // A condição é `CAPACIDADES_LIMITADAS_POR_AMBITO.has(cap) && escalaoId`:
    // sem escalaoId a verificação de secção não corre.
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"],
      seccoesCoordenadas: [], // mesmo sem secções
    });

    const r = await exigirCapacidade("SECCAO_ESCALOES_GERIR"); // sem escalaoId
    expect(r.ok).toBe(true);
    expect(prisma.escalao.findFirst).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Isolamento cross-secção
// ─────────────────────────────────────────────────────────────────────────────

describe("Isolamento cross-secção — âmbito SECCAO", () => {
  beforeEach(() => vi.clearAllMocks());

  it("coordenador de FUTSAL não acede a escalão de FUTEBOL (secções diferentes)", async () => {
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"],
      seccoesCoordenadas: [SECCAO_FUTSAL], // apenas FUTSAL
    });
    mocked(prisma.escalao.findFirst).mockResolvedValue(null); // escalão de FUTEBOL → não encontra

    const r = await exigirCapacidade("SECCAO_ESCALOES_GERIR", "escalao-futebol-sub15");
    expect(r.ok).toBe(false);
  });

  it("coordenador com múltiplas secções acede a qualquer delas e não a secções alheias", async () => {
    // 1ª verificação: escalão de FUTEBOL → deve permitir (FUTEBOL está nas secções)
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"],
      seccoesCoordenadas: [SECCAO_FUTSAL, SECCAO_FUTEBOL],
    });
    mocked(prisma.escalao.findFirst).mockResolvedValue({ id: "escalao-futebol-sub17" });

    const r1 = await exigirCapacidade("SECCAO_ESCALOES_GERIR", "escalao-futebol-sub17");
    expect(r1.ok).toBe(true);

    // 2ª verificação: escalão de secção alheia → deve negar
    vi.clearAllMocks();
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"],
      seccoesCoordenadas: [SECCAO_FUTSAL, SECCAO_FUTEBOL],
    });
    mocked(prisma.escalao.findFirst).mockResolvedValue(null); // secção alheia → não encontra

    const r2 = await exigirCapacidade("SECCAO_ESCALOES_GERIR", "escalao-outra-seccao");
    expect(r2.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. escaloesLegiveis com âmbito SECCAO
// ─────────────────────────────────────────────────────────────────────────────

describe("escaloesLegiveis — âmbito SECCAO", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve escalões da secção coordenada (+ atribuídos + visíveis), nunca de secções alheias", async () => {
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"],
      seccoesCoordenadas: [SECCAO_FUTSAL],
      escaloesAtribuidos: [],
    });
    // 1ª findMany: visivelOutrosTreinadores → nenhum
    // 2ª findMany: daSeccao → dois escalões de FUTSAL
    mocked(prisma.escalao.findMany).mockResolvedValueOnce([]);
    mocked(prisma.escalao.findMany).mockResolvedValueOnce([
      { id: "escalao-fut-sub17" },
      { id: "escalao-fut-sub15" },
    ]);

    const ids = await escaloesLegiveis();
    expect(Array.isArray(ids)).toBe(true);
    const arr = ids as string[];
    expect(arr).toContain("escalao-fut-sub17");
    expect(arr).toContain("escalao-fut-sub15");
    expect(arr.length).toBe(2);
  });

  it("com seccoesCoordenadas = [], a query daSeccao não é executada", async () => {
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"],
      seccoesCoordenadas: [],
      escaloesAtribuidos: ["escalao-atribuido"],
    });
    // Apenas uma chamada findMany: visiveis (daSeccao fica em [])
    mocked(prisma.escalao.findMany).mockResolvedValueOnce([]);

    const ids = await escaloesLegiveis();
    expect(Array.isArray(ids)).toBe(true);
    const arr = ids as string[];
    expect(arr).toContain("escalao-atribuido");
    // findMany chamado exatamente 1 vez — daSeccao não foi consultado
    expect(
      (prisma.escalao.findMany as unknown as { mock: { calls: unknown[][] } }).mock.calls.length,
    ).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4b. escaloesLegiveis com âmbito PROPRIOS_ESCALOES (§6.5 — sem escalões alheios)
// ─────────────────────────────────────────────────────────────────────────────

describe("escaloesLegiveis — âmbito PROPRIOS_ESCALOES", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve APENAS os escalões atribuídos, nunca os `visivelOutrosTreinadores`", async () => {
    setupMembro({
      ambito: "PROPRIOS_ESCALOES",
      capacidades: ["TREINOS_GERIR"],
      escaloesAtribuidos: ["benjamins-a"],
      seccoesCoordenadas: [],
    });

    const ids = await escaloesLegiveis();
    expect(ids).toEqual(["benjamins-a"]);
    // Não consulta escalões visíveis: um treinador de escalão não lê escalões alheios.
    expect(prisma.escalao.findMany).not.toHaveBeenCalled();
  });

  it("sem escalões atribuídos devolve lista vazia (sem acesso a nenhum escalão)", async () => {
    setupMembro({
      ambito: "PROPRIOS_ESCALOES",
      capacidades: ["TREINOS_GERIR"],
      escaloesAtribuidos: [],
      seccoesCoordenadas: [],
    });

    const ids = await escaloesLegiveis();
    expect(ids).toEqual([]);
    expect(prisma.escalao.findMany).not.toHaveBeenCalled();
  });

  it("podeLerEscalao: nega escalão alheio mesmo que `visivelOutrosTreinadores` (direct-nav)", async () => {
    setupMembro({
      ambito: "PROPRIOS_ESCALOES",
      capacidades: ["TREINOS_GERIR"],
      escaloesAtribuidos: ["benjamins-a"],
      seccoesCoordenadas: [],
    });

    // Um treinador de âmbito próprio não lê o escalão dos Infantis, mesmo que este
    // esteja marcado visível — nem sequer consulta a flag na BD.
    const pode = await podeLerEscalao("infantis");
    expect(pode).toBe(false);
    expect(prisma.escalao.findFirst).not.toHaveBeenCalled();

    // …mas continua a ler o seu próprio escalão.
    const podeProprio = await podeLerEscalao("benjamins-a");
    expect(podeProprio).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Retrocesso — âmbitos existentes não quebram com a introdução de SECCAO
// ─────────────────────────────────────────────────────────────────────────────

describe("Retrocesso — âmbitos TODO_CLUBE e PROPRIOS_ESCALOES não afetados", () => {
  beforeEach(() => vi.clearAllMocks());

  it("TODO_CLUBE continua a dar acesso sem qualquer verificação de secção", async () => {
    setupMembro({
      ambito: "TODO_CLUBE",
      capacidades: ["PLANTEL_GERIR"],
      seccoesCoordenadas: [],
    });

    const r = await exigirCapacidade("PLANTEL_GERIR", "qualquer-escalao");
    expect(r.ok).toBe(true);
    // Nenhuma consulta ao escalão — TODO_CLUBE passa diretamente
    expect(prisma.escalao.findFirst).not.toHaveBeenCalled();
  });

  it("PROPRIOS_ESCALOES continua a verificar escaloesAtribuidos: permite se atribuído", async () => {
    setupMembro({
      ambito: "PROPRIOS_ESCALOES",
      capacidades: ["PLANTEL_GERIR"],
      escaloesAtribuidos: ["escalao-sub17"],
      seccoesCoordenadas: [],
    });

    const r = await exigirCapacidade("PLANTEL_GERIR", "escalao-sub17");
    expect(r.ok).toBe(true);
    expect(prisma.escalao.findFirst).not.toHaveBeenCalled();
  });

  it("PROPRIOS_ESCALOES continua a verificar escaloesAtribuidos: nega se não atribuído", async () => {
    setupMembro({
      ambito: "PROPRIOS_ESCALOES",
      capacidades: ["PLANTEL_GERIR"],
      escaloesAtribuidos: ["escalao-sub17"],
      seccoesCoordenadas: [],
    });

    const r = await exigirCapacidade("PLANTEL_GERIR", "escalao-sub15"); // não atribuído
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/escalão/i);
  });

  it("membro com âmbito PROPRIOS_ESCALOES não ganha acesso via seccoesCoordenadas preenchidas", async () => {
    // seccoesCoordenadas preenchidas mas o ramo `else if (ctx.ambito === "SECCAO")` não é ativado
    setupMembro({
      ambito: "PROPRIOS_ESCALOES",
      capacidades: ["PLANTEL_GERIR"],
      escaloesAtribuidos: [],
      seccoesCoordenadas: [SECCAO_FUTSAL], // preenchidas mas ignoradas para PROPRIOS_ESCALOES
    });

    const r = await exigirCapacidade("PLANTEL_GERIR", "escalao-sub17");
    expect(r.ok).toBe(false);
    // o ramo SECCAO não foi executado — escalao.findFirst não foi consultado
    expect(prisma.escalao.findFirst).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Capacidade fora de CAPACIDADES_LIMITADAS_POR_AMBITO com perfil SECCAO
// ─────────────────────────────────────────────────────────────────────────────

describe("Capacidade de nível clube (CLUBE_*) com perfil SECCAO — sem restrição de secção", () => {
  beforeEach(() => vi.clearAllMocks());

  it("perfil SECCAO com CLUBE_ESCALOES via capacidadesExtra passa sem verificação de secção", async () => {
    // Spec §6.9: CLUBE_* não estão em CAPACIDADES_LIMITADAS_POR_AMBITO.
    // Se um Coordenador receber CLUBE_ESCALOES por override extra, acede sem restrição de secção.
    // Comportamento esperado por spec: a capacidade de nível clube é sempre global.
    setupMembro({
      ambito: "SECCAO",
      capacidades: ["SECCAO_ESCALOES_GERIR"], // perfil base da secção
      capacidadesExtra: ["CLUBE_ESCALOES"],   // elevação por override
      seccoesCoordenadas: [],                 // sem secções — mas não importa para CLUBE_ESCALOES
    });

    const r = await exigirCapacidade("CLUBE_ESCALOES", "escalao-qualquer");
    expect(r.ok).toBe(true);
    // CLUBE_ESCALOES não está em CAPACIDADES_LIMITADAS_POR_AMBITO → sem consulta de escalão
    expect(prisma.escalao.findFirst).not.toHaveBeenCalled();
  });
});
