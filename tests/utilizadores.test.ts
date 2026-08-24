import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  obterMembroAtual: vi.fn(),
  exigirCapacidade: vi.fn(),
  capacidadesEfetivas: vi.fn(),
}));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    membroClube: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    utilizador: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    perfil: { findFirst: vi.fn(), findUnique: vi.fn() },
    atribuicaoEscalao: { deleteMany: vi.fn(), create: vi.fn() },
    escalao: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { listarMembros, listarMembrosBasico, alterarMinhaPassword, convidarMembro } from "@/lib/actions/utilizadores";
import { auth } from "@/lib/auth";
import { obterMembroAtual, exigirCapacidade } from "@/lib/permissoes";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

// ─── Constantes ───────────────────────────────────────────────────────────────
const USER_ID   = "ckv9v0z1w0000abcd1234efgh";
const MEMBRO_ID = "ckv9v0z1w0001abcd1234efgh";
const PERFIL_ID = "ckv9v0z1w0002abcd1234efgh";

const mocked = <T,>(fn: T) => fn as unknown as {
  mockResolvedValue: (v: unknown) => void;
  mockImplementation: (f: (...a: unknown[]) => unknown) => void;
};

const calls = (fn: unknown) => (fn as { mock: { calls: unknown[][] } }).mock.calls;

const CTX     = { utilizadorId: USER_ID, membroId: MEMBRO_ID, clube: { id: "clube1" } };
const PERM_OK = { ok: true, ctx: CTX };

const MEMBRO_BD = {
  id: MEMBRO_ID,
  utilizadorId: USER_ID,
  perfilId: PERFIL_ID,
  estado: "ATIVO",
  capacidadesExtra: [],
  capacidadesRevogadas: [],
  utilizador: { id: USER_ID, nome: "João Silva", email: "joao@clube.pt" },
  perfil: { id: PERFIL_ID, nome: "Treinador", capacidades: ["PLANTEL_VER"] },
  atribuicoes: [],
};

const INPUT_PASSWORD_VALIDO = {
  passwordAtual: "VelhaPassword1!",
  novaPassword: "NovaPassword2!",
  confirmarPassword: "NovaPassword2!",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(obterMembroAtual).mockResolvedValue(CTX);
  mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
  mocked(auth).mockResolvedValue({ user: { id: USER_ID } });
  mocked(prisma.membroClube.findMany).mockResolvedValue([]);
  mocked(prisma.membroClube.findUnique).mockResolvedValue(null);
  mocked(prisma.membroClube.findFirst).mockResolvedValue(null);
  mocked(prisma.membroClube.create).mockResolvedValue({ id: "nova_adesao" });
  mocked(prisma.utilizador.findUnique).mockResolvedValue({ passwordHash: "$2b$12$hash" });
  mocked(prisma.utilizador.create).mockResolvedValue({ id: "novo_user" });
  mocked(prisma.utilizador.update).mockResolvedValue({ id: USER_ID });
  mocked(prisma.perfil.findFirst).mockResolvedValue({ id: PERFIL_ID, capacidades: ["PLANTEL_VER"] });
  mocked(bcrypt.compare).mockResolvedValue(true);
  mocked(bcrypt.hash).mockResolvedValue("$2b$12$newhash");
  mocked(prisma.$transaction).mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

// ─── listarMembros ────────────────────────────────────────────────────────────
describe("listarMembros", () => {
  it("rejeita membro sem capacidade CLUBE_UTILIZADORES (não enumera dados sensíveis)", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await listarMembros();
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/sem permissão/i);
    expect(prisma.membroClube.findMany).not.toHaveBeenCalled();
  });

  it("exige exatamente a capacidade CLUBE_UTILIZADORES", async () => {
    mocked(prisma.membroClube.findMany).mockResolvedValue([]);
    await listarMembros();
    expect(calls(exigirCapacidade)[0][0]).toBe("CLUBE_UTILIZADORES");
  });

  it("filtra membros pelo clubeId do utilizador autenticado (isolamento multi-tenant)", async () => {
    mocked(prisma.membroClube.findMany).mockResolvedValue([MEMBRO_BD] as never[]);
    await listarMembros();
    const arg = calls(prisma.membroClube.findMany)[0][0] as { where: { clubeId: string } };
    expect(arg.where.clubeId).toBe("clube1");
  });

  it("mapeia membros para DTO com todos os campos esperados", async () => {
    mocked(prisma.membroClube.findMany).mockResolvedValue([MEMBRO_BD] as never[]);
    const r = await listarMembros();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados).toHaveLength(1);
      const m = r.dados[0];
      expect(m.nome).toBe("João Silva");
      expect(m.email).toBe("joao@clube.pt");
      expect(m.perfilNome).toBe("Treinador");
      expect(m.perfilCapacidades).toEqual(["PLANTEL_VER"]);
      expect(m.escaloesAtribuidos).toEqual([]);
      expect(m.estado).toBe("ATIVO");
    }
  });

  it("devolve lista vazia quando clube não tem membros", async () => {
    mocked(prisma.membroClube.findMany).mockResolvedValue([]);
    const r = await listarMembros();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados).toHaveLength(0);
  });
});

// ─── listarMembrosBasico ──────────────────────────────────────────────────────
describe("listarMembrosBasico", () => {
  it("retorna erro quando não há adesão ativa (obterMembroAtual null)", async () => {
    mocked(obterMembroAtual).mockResolvedValue(null);
    const r = await listarMembrosBasico();
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/sem acesso/i);
    expect(prisma.membroClube.findMany).not.toHaveBeenCalled();
  });

  it("legível por membro ativo sem CLUBE_UTILIZADORES (não chama exigirCapacidade)", async () => {
    mocked(prisma.membroClube.findMany).mockResolvedValue([MEMBRO_BD] as never[]);
    const r = await listarMembrosBasico();
    expect(r.sucesso).toBe(true);
    expect(exigirCapacidade).not.toHaveBeenCalled();
  });

  it("filtra pelo clubeId da adesão ativa (isolamento multi-tenant)", async () => {
    mocked(prisma.membroClube.findMany).mockResolvedValue([MEMBRO_BD] as never[]);
    await listarMembrosBasico();
    const arg = calls(prisma.membroClube.findMany)[0][0] as { where: { clubeId: string } };
    expect(arg.where.clubeId).toBe("clube1");
  });

  it("expõe apenas id + nome (sem email nem capacidades)", async () => {
    mocked(prisma.membroClube.findMany).mockResolvedValue([MEMBRO_BD] as never[]);
    const r = await listarMembrosBasico();
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados[0]).toEqual({
        membroId: MEMBRO_ID,
        utilizadorId: USER_ID,
        nome: "João Silva",
      });
    }
  });
});

// ─── alterarMinhaPassword ─────────────────────────────────────────────────────
describe("alterarMinhaPassword", () => {
  it("retorna erro quando não autenticado (sessão null)", async () => {
    mocked(auth).mockResolvedValue(null);
    const r = await alterarMinhaPassword(INPUT_PASSWORD_VALIDO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não autenticado/i);
    expect(prisma.utilizador.update).not.toHaveBeenCalled();
  });

  it("rejeita novaPassword com menos de 8 caracteres com erroDeValidacao", async () => {
    const r = await alterarMinhaPassword({
      passwordAtual: "velha",
      novaPassword: "curta",
      confirmarPassword: "curta",
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos).toBeTruthy();
    expect(prisma.utilizador.update).not.toHaveBeenCalled();
  });

  it("rejeita quando novaPassword e confirmarPassword não coincidem", async () => {
    const r = await alterarMinhaPassword({
      passwordAtual: "velha",
      novaPassword: "NovaPassword1!",
      confirmarPassword: "OutraSenha123!",
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos).toBeTruthy();
    expect(prisma.utilizador.update).not.toHaveBeenCalled();
  });

  it("retorna erro se utilizador não existe na BD", async () => {
    mocked(prisma.utilizador.findUnique).mockResolvedValue(null);
    const r = await alterarMinhaPassword(INPUT_PASSWORD_VALIDO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não encontrado/i);
    expect(prisma.utilizador.update).not.toHaveBeenCalled();
  });

  it("rejeita quando password atual está incorreta", async () => {
    mocked(bcrypt.compare).mockResolvedValue(false);
    const r = await alterarMinhaPassword(INPUT_PASSWORD_VALIDO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/incorreta/i);
    expect(prisma.utilizador.update).not.toHaveBeenCalled();
  });

  it("altera password com sucesso quando todos os critérios passam", async () => {
    const r = await alterarMinhaPassword(INPUT_PASSWORD_VALIDO);
    expect(r.sucesso).toBe(true);
    expect(prisma.utilizador.update).toHaveBeenCalledOnce();
  });

  it("grava o hash bcrypt e nunca a password em texto claro", async () => {
    await alterarMinhaPassword(INPUT_PASSWORD_VALIDO);
    expect(bcrypt.hash).toHaveBeenCalledWith(INPUT_PASSWORD_VALIDO.novaPassword, 12);
    const arg = calls(prisma.utilizador.update)[0][0] as { data: { passwordHash: string } };
    expect(arg.data.passwordHash).toBe("$2b$12$newhash");
    expect(arg.data.passwordHash).not.toBe(INPUT_PASSWORD_VALIDO.novaPassword);
  });
});

// ─── convidarMembro ───────────────────────────────────────────────────────────
describe("convidarMembro", () => {
  const DADOS_VALIDOS = {
    nome: "Ana Ferreira",
    email: "ana@exemplo.pt",
    passwordInicial: "Senha2026!!",
    perfilId: PERFIL_ID,
  };

  it("rejeita utilizador sem permissão CLUBE_UTILIZADORES", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await convidarMembro(DADOS_VALIDOS);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/sem permissão/i);
    expect(prisma.membroClube.create).not.toHaveBeenCalled();
  });

  it("rejeita input inválido (email mal formado) com erroDeValidacao", async () => {
    const r = await convidarMembro({ ...DADOS_VALIDOS, email: "nao-e-email" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos).toBeTruthy();
  });

  it("rejeita quando perfil não existe no clube do utilizador autenticado", async () => {
    mocked(prisma.perfil.findFirst).mockResolvedValue(null);
    const r = await convidarMembro(DADOS_VALIDOS);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/perfil selecionado não existe/i);
  });

  it("rejeita quando utilizador existente já é membro do clube", async () => {
    mocked(prisma.utilizador.findUnique).mockResolvedValue({ id: USER_ID, email: "ana@exemplo.pt" });
    mocked(prisma.membroClube.findUnique).mockResolvedValue({ id: MEMBRO_ID });
    const r = await convidarMembro(DADOS_VALIDOS);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/já é membro/i);
    expect(prisma.membroClube.create).not.toHaveBeenCalled();
  });

  it("cria conta e adesão em transação para utilizador novo", async () => {
    mocked(prisma.utilizador.findUnique).mockResolvedValue(null); // utilizador não existe
    const r = await convidarMembro(DADOS_VALIDOS);
    expect(r.sucesso).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    // hash gerado antes da transação
    expect(bcrypt.hash).toHaveBeenCalledWith(DADOS_VALIDOS.passwordInicial, 12);
  });
});
