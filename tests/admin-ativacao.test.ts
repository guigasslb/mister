import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
// `ativarLicenca` (lib/actions/admin-licencas.ts) é uma Server Action cross-tenant:
// gate `exigirAdminPlataforma()`, escreve via prisma e notifica o titular por email.
// Isolamos infra (guard, prisma, next/cache) e a camada de email (Resend + template)
// para não requerer env de Next.js, BD real, nem enviar emails.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin-guard", () => ({ exigirAdminPlataforma: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    licenca: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/email/resend", () => ({ enviarEmail: vi.fn() }));
vi.mock("@/lib/email/templates/conta-ativada", () => ({
  emailContaAtivada: vi.fn(() => ({
    assunto: "A tua conta Mister está pronta",
    html: "<html>ativada</html>",
    texto: "ativada",
  })),
}));

import { ativarLicenca } from "@/lib/actions/admin-licencas";
import { exigirAdminPlataforma } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { enviarEmail } from "@/lib/email/resend";
import { emailContaAtivada } from "@/lib/email/templates/conta-ativada";

const guardMock = exigirAdminPlataforma as unknown as ReturnType<typeof vi.fn>;
const findUniqueMock = prisma.licenca.findUnique as unknown as ReturnType<typeof vi.fn>;
const updateMock = prisma.licenca.update as unknown as ReturnType<typeof vi.fn>;
const enviarEmailMock = enviarEmail as unknown as ReturnType<typeof vi.fn>;
const emailContaAtivadaMock = emailContaAtivada as unknown as ReturnType<typeof vi.fn>;

const CUID = "ckv9v0z1w0000abcd1234efgh";

/** Licença de Clube (crua) devolvida por `update`, com o admin resolúvel. */
function licencaClubeCrua(estado: string) {
  return {
    id: CUID,
    tipo: "CLUBE",
    tier: "MEDIO",
    estado,
    ciclo: "MENSAL",
    dataInicio: new Date("2026-09-01"),
    dataFim: new Date("2026-10-11"),
    precoCentimos: 1900,
    modalidade: null,
    numSeccoes: 1,
    criadoEm: new Date("2026-09-01"),
    utilizador: null,
    clube: {
      id: "clube1",
      nome: "Juventude Sport Clube",
      membros: [
        {
          capacidadesExtra: [],
          capacidadesRevogadas: [],
          perfil: { capacidades: ["CLUBE_UTILIZADORES", "CLUBE_PERFIS"] },
          utilizador: { nome: "Gonçalo Pereira", email: "goncalo@jsc.pt" },
        },
      ],
    },
  };
}

/** Licença Individual (crua) devolvida por `update`, com titular `utilizador`. */
function licencaIndividualCrua(estado: string) {
  return {
    id: CUID,
    tipo: "INDIVIDUAL",
    tier: null,
    estado,
    ciclo: "ANUAL",
    dataInicio: new Date("2026-09-01"),
    dataFim: new Date("2027-09-01"),
    precoCentimos: 4900,
    modalidade: "FUTSAL",
    numSeccoes: 1,
    criadoEm: new Date("2026-09-01"),
    utilizador: { id: "user1", nome: "Ana Treinadora", email: "ana@exemplo.pt" },
    clube: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  guardMock.mockResolvedValue(undefined); // admin autorizado por defeito
});

describe("ativarLicenca — Clube (PENDENTE → ATIVA)", () => {
  it("transita para ATIVA e notifica o admin do clube por email", async () => {
    findUniqueMock.mockResolvedValue({ dataFim: null, ciclo: "MENSAL" });
    updateMock.mockResolvedValue(licencaClubeCrua("ATIVA"));

    const res = await ativarLicenca({ licencaId: CUID });

    expect(res.sucesso).toBe(true);
    // Estado ATIVA persistido.
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CUID },
        data: expect.objectContaining({ estado: "ATIVA" }),
      }),
    );
    // Email dirigido ao ADMIN do clube (titular resolvido por capacidades).
    expect(emailContaAtivadaMock).toHaveBeenCalledWith({
      nome: "Gonçalo Pereira",
      email: "goncalo@jsc.pt",
    });
    expect(enviarEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ para: "goncalo@jsc.pt" }),
    );
  });

  it("define dataFim alinhada ao ciclo MENSAL quando não existe (+1 mês)", async () => {
    findUniqueMock.mockResolvedValue({ dataFim: null, ciclo: "MENSAL" });
    updateMock.mockResolvedValue(licencaClubeCrua("ATIVA"));

    const antes = new Date();
    await ativarLicenca({ licencaId: CUID });

    const dataFim = updateMock.mock.calls[0][0].data.dataFim as Date;
    expect(dataFim).toBeInstanceOf(Date);
    // +1 mês (janela ~28..31 dias) — asserção robusta a fronteiras de mês.
    const dias = (dataFim.getTime() - antes.getTime()) / 86_400_000;
    expect(dias).toBeGreaterThan(27);
    expect(dias).toBeLessThan(32);
  });
});

describe("ativarLicenca — Individual (PENDENTE → ATIVA)", () => {
  it("transita para ATIVA e notifica o titular (utilizador) por email", async () => {
    findUniqueMock.mockResolvedValue({ dataFim: null, ciclo: "ANUAL" });
    updateMock.mockResolvedValue(licencaIndividualCrua("ATIVA"));

    const res = await ativarLicenca({ licencaId: CUID });

    expect(res.sucesso).toBe(true);
    expect(emailContaAtivadaMock).toHaveBeenCalledWith({
      nome: "Ana Treinadora",
      email: "ana@exemplo.pt",
    });
    expect(enviarEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ para: "ana@exemplo.pt" }),
    );
  });

  it("define dataFim alinhada ao ciclo ANUAL quando não existe (+1 ano)", async () => {
    findUniqueMock.mockResolvedValue({ dataFim: null, ciclo: "ANUAL" });
    updateMock.mockResolvedValue(licencaIndividualCrua("ATIVA"));

    const antes = new Date();
    await ativarLicenca({ licencaId: CUID });

    const dataFim = updateMock.mock.calls[0][0].data.dataFim as Date;
    expect(dataFim.getFullYear()).toBe(antes.getFullYear() + 1);
  });

  it("preserva a dataFim existente (não a recalcula)", async () => {
    const dataFimExistente = new Date("2028-01-01");
    findUniqueMock.mockResolvedValue({ dataFim: dataFimExistente, ciclo: "ANUAL" });
    updateMock.mockResolvedValue(licencaIndividualCrua("ATIVA"));

    await ativarLicenca({ licencaId: CUID });

    expect(updateMock.mock.calls[0][0].data.dataFim).toEqual(dataFimExistente);
  });
});

describe("ativarLicenca — email best-effort", () => {
  it("uma FALHA de email NÃO desfaz a ativação (devolve sucesso na mesma)", async () => {
    findUniqueMock.mockResolvedValue({ dataFim: null, ciclo: "MENSAL" });
    updateMock.mockResolvedValue(licencaClubeCrua("ATIVA"));
    // Cenário extremo: mesmo que o envio rebente (para além do best-effort interno).
    enviarEmailMock.mockRejectedValue(new Error("SMTP down"));

    const res = await ativarLicenca({ licencaId: CUID });

    expect(res.sucesso).toBe(true); // ativação persistida, apesar do email falhar
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it("não tenta enviar email se o titular não for resolúvel (clube sem admin)", async () => {
    findUniqueMock.mockResolvedValue({ dataFim: null, ciclo: "MENSAL" });
    const semAdmin = licencaClubeCrua("ATIVA");
    semAdmin.clube.membros = []; // nenhum membro com capacidades de admin
    updateMock.mockResolvedValue(semAdmin);

    const res = await ativarLicenca({ licencaId: CUID });

    expect(res.sucesso).toBe(true);
    expect(enviarEmailMock).not.toHaveBeenCalled();
  });
});

describe("ativarLicenca — validação e existência", () => {
  it("rejeita licencaId inválido (não-cuid) sem tocar na BD", async () => {
    const res = await ativarLicenca({ licencaId: "nao-e-cuid" });
    expect(res.sucesso).toBe(false);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("devolve erro tratável quando a licença não existe", async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await ativarLicenca({ licencaId: CUID });
    expect(res.sucesso).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

// ─── Regressão do gate de admin ───────────────────────────────────────────────
describe("ativarLicenca — gate de admin de plataforma", () => {
  it("invoca exigirAdminPlataforma ANTES de qualquer acesso à BD", async () => {
    findUniqueMock.mockResolvedValue({ dataFim: null, ciclo: "MENSAL" });
    updateMock.mockResolvedValue(licencaClubeCrua("ATIVA"));

    await ativarLicenca({ licencaId: CUID });

    expect(guardMock).toHaveBeenCalledOnce();
  });

  it("um não-admin (guard bloqueia) não chega a escrever na BD", async () => {
    // exigirAdminPlataforma redireciona (lança) para não-admins.
    guardMock.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(ativarLicenca({ licencaId: CUID })).rejects.toThrow();
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
