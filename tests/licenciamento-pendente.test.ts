import { describe, it, expect, vi, beforeEach } from "vitest";

// §8.1 / §17.1 — plano PENDENTE escolhido no onboarding, com preço on-read.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));
vi.mock("@/lib/permissoes", () => ({ obterMembroAtual: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    licenca: { findUnique: vi.fn() },
    carteira: { findUnique: vi.fn() },
  },
}));

import { obterLicenca, obterLicencaPendente } from "@/lib/actions/licenciamento";
import { prisma } from "@/lib/db";
import { obterMembroAtual } from "@/lib/permissoes";
import { PRECO_INDIVIDUAL_CENTIMOS, calcularPrecoLicenca } from "@/lib/billing";

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockImplementation: (f: (...a: unknown[]) => unknown) => void;
  };

beforeEach(() => {
  vi.clearAllMocks();
  // Por omissão há sessão com clube ativo; o clubeId deriva SEMPRE daqui
  // (nunca de um parâmetro externo — ver fix IDOR).
  mocked(obterMembroAtual).mockResolvedValue({ clube: { id: "clube1" } });
});

describe("obterLicencaPendente (§8.1 / §17.1)", () => {
  it("sem sessão/clube → null (IDOR: clubeId vem da sessão, não de input)", async () => {
    mocked(obterMembroAtual).mockResolvedValue(null);
    expect(await obterLicencaPendente()).toBeNull();
  });

  it("sem licença → null", async () => {
    mocked(prisma.licenca.findUnique).mockResolvedValue(null);
    expect(await obterLicencaPendente()).toBeNull();
  });

  it("licença ATIVA (não PENDENTE) → null", async () => {
    mocked(prisma.licenca.findUnique).mockResolvedValue({
      estado: "ATIVA",
      tipo: "CLUBE",
      tier: "PEQUENO",
      numSeccoes: 1,
    });
    expect(await obterLicencaPendente()).toBeNull();
  });

  it("PENDENTE Individual → preço fixo (€4,99/mês, €49/ano)", async () => {
    mocked(prisma.licenca.findUnique).mockResolvedValue({
      estado: "PENDENTE",
      tipo: "INDIVIDUAL",
      tier: null,
      numSeccoes: 1,
    });
    const r = await obterLicencaPendente();
    expect(r).toEqual({
      tier: "INDIVIDUAL",
      precoCentimos: PRECO_INDIVIDUAL_CENTIMOS.MENSAL,
      precoAnualCentimos: PRECO_INDIVIDUAL_CENTIMOS.ANUAL,
    });
    expect(r?.precoCentimos).toBe(499);
    expect(r?.precoAnualCentimos).toBe(4900);
  });

  it("PENDENTE Clube → preço do tier via calcularPrecoLicenca", async () => {
    mocked(prisma.licenca.findUnique).mockResolvedValue({
      estado: "PENDENTE",
      tipo: "CLUBE",
      tier: "MEDIO",
      numSeccoes: 1,
    });
    const r = await obterLicencaPendente();
    expect(r).toEqual({
      tier: "MEDIO",
      precoCentimos: calcularPrecoLicenca("MEDIO", 1, "MENSAL"),
      precoAnualCentimos: calcularPrecoLicenca("MEDIO", 1, "ANUAL"),
    });
    expect(r?.precoCentimos).toBe(1900);
    expect(r?.precoAnualCentimos).toBe(19000);
  });

  it("PENDENTE Clube com 2 secções → acréscimo multi-secção aplicado", async () => {
    mocked(prisma.licenca.findUnique).mockResolvedValue({
      estado: "PENDENTE",
      tipo: "CLUBE",
      tier: "PEQUENO",
      numSeccoes: 2,
    });
    const r = await obterLicencaPendente();
    // base €15,00 × 1.5 = €22,50
    expect(r?.precoCentimos).toBe(2250);
  });
});

// §3.11 — obterLicenca resolve a titularidade por clubeId OU utilizadorId. A
// licença Individual (Fase 4) vive no utilizadorId, sem clubeId: sem esta
// resolução, Definições→Licença mostrava "Sem licença ativa" a um Individual ativo.
describe("obterLicenca — titularidade Clube OU Individual (§3.11)", () => {
  beforeEach(() => {
    // Sessão com clube (técnico ou não) e utilizador conhecidos.
    mocked(obterMembroAtual).mockResolvedValue({
      clube: { id: "clube1" },
      utilizadorId: "user1",
    });
  });

  /** Devolve a licença certa consoante o titular consultado (clubeId vs utilizadorId). */
  function comLicencas(opts: {
    clube?: Record<string, unknown> | null;
    individual?: Record<string, unknown> | null;
  }) {
    mocked(prisma.licenca.findUnique).mockImplementation((args: unknown) => {
      const where = (args as { where: { clubeId?: string; utilizadorId?: string } }).where;
      if (where.clubeId) return Promise.resolve(opts.clube ?? null);
      if (where.utilizadorId) return Promise.resolve(opts.individual ?? null);
      return Promise.resolve(null);
    });
  }

  it("sem sessão → erro (sem acesso)", async () => {
    mocked(obterMembroAtual).mockResolvedValue(null);
    const r = await obterLicenca();
    expect(r.sucesso).toBe(false);
  });

  it("resolve a licença ATIVA Individual (titular utilizadorId, sem clubeId)", async () => {
    comLicencas({
      clube: null,
      individual: { id: "lic-ind", estado: "ATIVA", tipo: "INDIVIDUAL", tier: null },
    });
    mocked(prisma.carteira.findUnique).mockResolvedValue({
      id: "cart1",
      utilizadorId: "user1",
      saldoCentimos: 500,
    });

    const r = await obterLicenca();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados?.id).toBe("lic-ind");
      expect(r.dados?.tipo).toBe("INDIVIDUAL");
      // A carteira (do utilizador) é anexada.
      expect(r.dados?.carteira?.saldoCentimos).toBe(500);
    }
    // A carteira é lida por utilizadorId (não por clube).
    const cartArg = (prisma.carteira.findUnique as unknown as {
      mock: { calls: unknown[][] };
    }).mock.calls[0][0] as { where: { utilizadorId: string } };
    expect(cartArg.where.utilizadorId).toBe("user1");
  });

  it("resolve a licença ATIVA de Clube (titular clubeId)", async () => {
    comLicencas({
      clube: { id: "lic-clube", estado: "ATIVA", tipo: "CLUBE", tier: "MEDIO" },
      individual: null,
    });
    mocked(prisma.carteira.findUnique).mockResolvedValue(null);

    const r = await obterLicenca();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados?.id).toBe("lic-clube");
      expect(r.dados?.carteira).toBeNull();
    }
  });

  it("licença Individual PENDENTE (não ATIVA) → null", async () => {
    comLicencas({
      clube: null,
      individual: { id: "lic-ind", estado: "PENDENTE", tipo: "INDIVIDUAL", tier: null },
    });

    const r = await obterLicenca();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados).toBeNull();
  });

  it("sem qualquer licença → null", async () => {
    comLicencas({ clube: null, individual: null });
    const r = await obterLicenca();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados).toBeNull();
  });
});
