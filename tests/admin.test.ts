import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
// admin-guard.ts importa auth, redirect e prisma. `eAdminPlataforma` só usa
// prisma (consulta `Utilizador.isAdmin`); isolamos os três para não requerer
// env de Next.js nem uma BD real.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: { utilizador: { findFirst: vi.fn() } },
}));

import { eAdminPlataforma } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import {
  AlterarEstadoLicencaSchema,
  EditarDataFimLicencaSchema,
  EditarUtilizadorSchema,
  AlterarEstadoMembroSchema,
} from "@/lib/schemas/admin";

// Handle tipado ao mock de prisma.utilizador.findFirst.
const findFirstMock = prisma.utilizador.findFirst as unknown as ReturnType<
  typeof vi.fn
>;

// ─── eAdminPlataforma (admin persistido na BD) ────────────────────────────────

describe("eAdminPlataforma — admin persistido na BD (Utilizador.isAdmin)", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it("devolve true quando o utilizador existe e isAdmin=true", async () => {
    findFirstMock.mockResolvedValue({ isAdmin: true });
    await expect(eAdminPlataforma("admin@teste.pt")).resolves.toBe(true);
  });

  it("devolve false quando o utilizador existe mas isAdmin=false", async () => {
    findFirstMock.mockResolvedValue({ isAdmin: false });
    await expect(eAdminPlataforma("user@teste.pt")).resolves.toBe(false);
  });

  it("devolve false quando não existe utilizador com esse email", async () => {
    findFirstMock.mockResolvedValue(null);
    await expect(eAdminPlataforma("ninguem@teste.pt")).resolves.toBe(false);
  });

  it("consulta a BD case-insensitive pelo email (trim aplicado)", async () => {
    findFirstMock.mockResolvedValue({ isAdmin: true });
    await eAdminPlataforma("  ADMIN@TESTE.PT  ");
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "ADMIN@TESTE.PT", mode: "insensitive" } },
        select: { isAdmin: true },
      }),
    );
  });

  it("devolve false e NÃO consulta a BD quando o email é null", async () => {
    await expect(eAdminPlataforma(null)).resolves.toBe(false);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("devolve false e NÃO consulta a BD quando o email é undefined", async () => {
    await expect(eAdminPlataforma(undefined)).resolves.toBe(false);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("devolve false e NÃO consulta a BD quando o email é string vazia", async () => {
    await expect(eAdminPlataforma("")).resolves.toBe(false);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("devolve false e NÃO consulta a BD quando o email é só espaços", async () => {
    await expect(eAdminPlataforma("   ")).resolves.toBe(false);
    expect(findFirstMock).not.toHaveBeenCalled();
  });
});

// ─── AlterarEstadoLicencaSchema ───────────────────────────────────────────────

const CUID = "ckv9v0z1w0000abcd1234efgh";

describe("AlterarEstadoLicencaSchema", () => {
  it("aceita estado ATIVA com licencaId válido", () => {
    const r = AlterarEstadoLicencaSchema.safeParse({ licencaId: CUID, estado: "ATIVA" });
    expect(r.success).toBe(true);
  });

  it("aceita estado SUSPENSA", () => {
    const r = AlterarEstadoLicencaSchema.safeParse({ licencaId: CUID, estado: "SUSPENSA" });
    expect(r.success).toBe(true);
  });

  it("aceita estado CANCELADA", () => {
    const r = AlterarEstadoLicencaSchema.safeParse({ licencaId: CUID, estado: "CANCELADA" });
    expect(r.success).toBe(true);
  });

  it("rejeita estado EXPIRADA — é estado derivado, nunca definido manualmente", () => {
    const r = AlterarEstadoLicencaSchema.safeParse({ licencaId: CUID, estado: "EXPIRADA" });
    expect(r.success).toBe(false);
  });

  it("rejeita estado arbitrário inválido", () => {
    const r = AlterarEstadoLicencaSchema.safeParse({ licencaId: CUID, estado: "PENDENTE" });
    expect(r.success).toBe(false);
  });

  it("rejeita licencaId que não é CUID", () => {
    const r = AlterarEstadoLicencaSchema.safeParse({ licencaId: "nao-e-um-cuid", estado: "ATIVA" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const campos = r.error.flatten().fieldErrors;
      expect(campos.licencaId).toBeTruthy();
    }
  });

  it("rejeita quando licencaId está ausente", () => {
    const r = AlterarEstadoLicencaSchema.safeParse({ estado: "ATIVA" });
    expect(r.success).toBe(false);
  });

  it("rejeita quando estado está ausente", () => {
    const r = AlterarEstadoLicencaSchema.safeParse({ licencaId: CUID });
    expect(r.success).toBe(false);
  });
});

// ─── EditarDataFimLicencaSchema ───────────────────────────────────────────────

describe("EditarDataFimLicencaSchema", () => {
  it("aceita data futura como string ISO — coerce para Date", () => {
    const r = EditarDataFimLicencaSchema.safeParse({
      licencaId: CUID,
      dataFim: "2027-12-31",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dataFim).toBeInstanceOf(Date);
  });

  it("aceita dataFim como null (licença perpétua/sem expiração)", () => {
    const r = EditarDataFimLicencaSchema.safeParse({ licencaId: CUID, dataFim: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dataFim).toBeNull();
  });

  it("aceita dataFim como objeto Date diretamente", () => {
    const r = EditarDataFimLicencaSchema.safeParse({
      licencaId: CUID,
      dataFim: new Date("2027-06-01"),
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dataFim).toBeInstanceOf(Date);
  });

  it("rejeita dataFim como string não-data", () => {
    const r = EditarDataFimLicencaSchema.safeParse({ licencaId: CUID, dataFim: "não-é-data" });
    expect(r.success).toBe(false);
  });

  it("rejeita licencaId inválido", () => {
    const r = EditarDataFimLicencaSchema.safeParse({
      licencaId: "invalido",
      dataFim: "2027-12-31",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const campos = r.error.flatten().fieldErrors;
      expect(campos.licencaId).toBeTruthy();
    }
  });

  it("rejeita quando licencaId está ausente", () => {
    const r = EditarDataFimLicencaSchema.safeParse({ dataFim: "2027-12-31" });
    expect(r.success).toBe(false);
  });

  it("rejeita quando dataFim está ausente (undefined — campo obrigatório)", () => {
    const r = EditarDataFimLicencaSchema.safeParse({ licencaId: CUID });
    expect(r.success).toBe(false);
  });
});

// ─── EditarUtilizadorSchema ───────────────────────────────────────────────────

describe("EditarUtilizadorSchema", () => {
  it("aceita nome e email válidos", () => {
    const r = EditarUtilizadorSchema.safeParse({
      utilizadorId: CUID,
      nome: "Gonçalo Pereira",
      email: "goncalo@jsc.pt",
    });
    expect(r.success).toBe(true);
  });

  it("normaliza o email (trim + lowercase)", () => {
    const r = EditarUtilizadorSchema.safeParse({
      utilizadorId: CUID,
      nome: "Gonçalo",
      email: "  GONCALO@JSC.PT  ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("goncalo@jsc.pt");
  });

  it("rejeita nome vazio", () => {
    const r = EditarUtilizadorSchema.safeParse({
      utilizadorId: CUID,
      nome: "   ",
      email: "goncalo@jsc.pt",
    });
    expect(r.success).toBe(false);
  });

  it("rejeita email inválido", () => {
    const r = EditarUtilizadorSchema.safeParse({
      utilizadorId: CUID,
      nome: "Gonçalo",
      email: "nao-e-email",
    });
    expect(r.success).toBe(false);
  });

  it("rejeita utilizadorId que não é cuid", () => {
    const r = EditarUtilizadorSchema.safeParse({
      utilizadorId: "invalido",
      nome: "Gonçalo",
      email: "goncalo@jsc.pt",
    });
    expect(r.success).toBe(false);
  });
});

// ─── AlterarEstadoMembroSchema ────────────────────────────────────────────────

describe("AlterarEstadoMembroSchema", () => {
  it("aceita estado ATIVO (reativar)", () => {
    const r = AlterarEstadoMembroSchema.safeParse({ membroId: CUID, estado: "ATIVO" });
    expect(r.success).toBe(true);
  });

  it("aceita estado INATIVO (suspender)", () => {
    const r = AlterarEstadoMembroSchema.safeParse({ membroId: CUID, estado: "INATIVO" });
    expect(r.success).toBe(true);
  });

  it("rejeita estado CONVIDADO — não é operação manual do admin", () => {
    const r = AlterarEstadoMembroSchema.safeParse({ membroId: CUID, estado: "CONVIDADO" });
    expect(r.success).toBe(false);
  });

  it("rejeita membroId que não é cuid", () => {
    const r = AlterarEstadoMembroSchema.safeParse({ membroId: "x", estado: "ATIVO" });
    expect(r.success).toBe(false);
  });

  it("rejeita quando estado está ausente", () => {
    const r = AlterarEstadoMembroSchema.safeParse({ membroId: CUID });
    expect(r.success).toBe(false);
  });
});
