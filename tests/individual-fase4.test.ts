import { describe, it, expect, vi, beforeEach } from "vitest";

// Fase 4 (§3.11/§7.3) — guards do modo Individual (clube técnico). Testam-se as
// funções de permissão REAIS (exigirCapacidade/obterMembroAtual): só `auth` e
// `prisma` são substituídos para controlar o contexto do membro. O `clubeTecnico`
// no contexto é o single source of truth que dispara os guards.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));
vi.mock("@/lib/billing", () => ({ calcularPrecoLicenca: vi.fn(() => 1000) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    membroClube: { findFirst: vi.fn(), findUnique: vi.fn() },
    seccao: { findMany: vi.fn(), upsert: vi.fn() },
    licenca: { findFirst: vi.fn() },
    perfil: { findFirst: vi.fn() },
    utilizador: { findUnique: vi.fn() },
  },
}));

import { garantirSeccaoParaModalidade } from "@/lib/actions/seccoes";
import { convidarMembro } from "@/lib/actions/utilizadores";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockResolvedValueOnce: (v: unknown) => void;
  };

const CLUBE_ID = "clube-1";

/**
 * Faz `obterMembroAtual()` devolver um membro Administrador (âmbito TODO_CLUBE,
 * com CLUBE_UTILIZADORES e CLUBE_ESCALOES) do clube indicado, definindo o flag
 * `clubeTecnico`. É o contexto que os guards leem.
 */
function setupMembro(clubeTecnico: boolean) {
  mocked(auth).mockResolvedValue({ user: { id: "user-1" } });
  mocked(prisma.membroClube.findFirst).mockResolvedValue({
    id: "membro-1",
    utilizadorId: "user-1",
    capacidadesExtra: [],
    capacidadesRevogadas: [],
    clube: { id: CLUBE_ID, nome: "Clube Teste", clubeTecnico },
    perfil: {
      capacidades: ["CLUBE_UTILIZADORES", "CLUBE_PERFIS", "CLUBE_ESCALOES"],
      ambito: "TODO_CLUBE",
    },
    atribuicoes: [],
    seccoes: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("garantirSeccaoParaModalidade — bloqueio da 2.ª modalidade no Individual (§17.1)", () => {
  it("recusa uma 2.ª modalidade quando o clube é técnico (Individual)", async () => {
    setupMembro(true);
    // Já existe a secção de futsal; pede-se futebol (2.ª modalidade distinta).
    mocked(prisma.seccao.findMany).mockResolvedValue([{ modalidade: "FUTSAL" }]);
    mocked(prisma.licenca.findFirst).mockResolvedValue(null); // licença PENDENTE não é ATIVA

    const r = await garantirSeccaoParaModalidade("FUTEBOL");

    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/licença Individual/i);
    // Não chegou a criar/garantir a secção.
    expect(prisma.seccao.upsert).not.toHaveBeenCalled();
  });

  it("é idempotente para a MESMA modalidade já existente (não bloqueia)", async () => {
    setupMembro(true);
    mocked(prisma.seccao.findMany).mockResolvedValue([{ modalidade: "FUTSAL" }]);
    mocked(prisma.seccao.upsert).mockResolvedValue({ id: "seccao-futsal" });

    const r = await garantirSeccaoParaModalidade("FUTSAL");

    expect(r.sucesso).toBe(true);
    expect(prisma.seccao.upsert).toHaveBeenCalledOnce();
  });

  it("NÃO bloqueia um clube normal (não técnico) a adicionar uma 2.ª modalidade", async () => {
    setupMembro(false);
    mocked(prisma.seccao.findMany).mockResolvedValue([{ modalidade: "FUTSAL" }]);
    mocked(prisma.licenca.findFirst).mockResolvedValue({ tipo: "CLUBE" });
    mocked(prisma.seccao.upsert).mockResolvedValue({ id: "seccao-futebol" });

    const r = await garantirSeccaoParaModalidade("FUTEBOL");

    expect(r.sucesso).toBe(true);
    expect(prisma.seccao.upsert).toHaveBeenCalledOnce();
  });
});

describe("convidarMembro — recusa em clube técnico (§3.11/§7.3, defesa em profundidade)", () => {
  it("recusa o convite quando o clube é técnico (Individual)", async () => {
    setupMembro(true);

    const r = await convidarMembro({
      nome: "Novo Treinador",
      email: "novo@clube.pt",
      perfilId: "perfil-1",
      passwordInicial: "password123",
    });

    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/licença Individual/i);
    // O guard corta antes de qualquer leitura de perfil/utilizador.
    expect(prisma.perfil.findFirst).not.toHaveBeenCalled();
    expect(prisma.utilizador.findUnique).not.toHaveBeenCalled();
  });

  it("num clube normal (não técnico) o guard não dispara — o fluxo prossegue", async () => {
    setupMembro(false);

    // Dados inválidos: o guard de clube técnico NÃO dispara, logo prossegue para a
    // validação Zod. O erro devolvido não pode ser a recusa de clube técnico.
    const r = await convidarMembro({ email: "invalido" });

    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).not.toMatch(/licença Individual/i);
  });
});
