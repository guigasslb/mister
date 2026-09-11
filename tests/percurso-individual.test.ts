import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Percurso Individual ponta-a-ponta (§3.11 / §8.1 / §17.1 / §17.5).
//
// Cada teste de fase mocka o prisma em isolamento com valores fixos, pelo que
// NENHUM cobre a licença Individual a atravessar o seu ciclo de vida real:
//   registo (PENDENTE) → paywall (obterLicencaPendente) → ativação backoffice
//   (ativarLicenca) → guarda de acesso (temLicencaValida) → Definições→Licença
//   (obterLicenca).
//
// Aqui liga-se essa costura: TODAS as peças reais partilham UM único registo de
// licença em memória (mock de `@/lib/db`). Muta-se o estado com a ação real de
// ativação e observa-se o efeito nas leituras reais a jusante — provando os
// invariantes de negócio nas junções, não dentro de cada peça isolada:
//   • a licença Individual é titulada pela PESSOA e NUNCA ganha clubeId;
//   • enquanto PENDENTE, a guarda bloqueia (paywall); após ativação, liberta;
//   • a ativação notifica o UTILIZADOR (não um clube);
//   • o preço pendente é o preço fixo Individual (não o cálculo multi-secção).
// ─────────────────────────────────────────────────────────────────────────────

const CUID = "ckv9v0z1w0000abcd1234efgh";
const USER = "user-1";
const CLUBE_TECNICO = "clube-tecnico-1"; // clube técnico invisível do modo Individual

interface LicencaRow {
  id: string;
  tipo: "INDIVIDUAL" | "CLUBE";
  tier: string | null;
  estado: string;
  ciclo: "MENSAL" | "ANUAL";
  dataInicio: Date;
  dataFim: Date | null;
  precoCentimos: number;
  modalidade: string | null;
  numSeccoes: number;
  criadoEm: Date;
  utilizadorId?: string;
  clubeId?: string;
  utilizador: { id: string; nome: string; email: string } | null;
  clube: null;
}

// Estado partilhado por todas as peças reais (uma linha de licenca em memória).
const db = vi.hoisted(() => ({ row: null as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin-guard", () => ({ exigirAdminPlataforma: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({ obterMembroAtual: vi.fn() }));
vi.mock("@/lib/email/resend", () => ({ enviarEmail: vi.fn() }));
vi.mock("@/lib/email/templates/conta-ativada", () => ({
  emailContaAtivada: vi.fn(() => ({
    assunto: "A tua conta Mister está pronta",
    html: "<html>ativada</html>",
    texto: "ativada",
  })),
}));

vi.mock("@/lib/db", () => {
  const matches = (
    where: { id?: string; clubeId?: string; utilizadorId?: string },
    row: LicencaRow | null,
  ) => {
    if (!row) return false;
    if (where.id !== undefined) return row.id === where.id;
    if (where.clubeId !== undefined) return row.clubeId === where.clubeId;
    if (where.utilizadorId !== undefined) return row.utilizadorId === where.utilizadorId;
    return false;
  };
  return {
    prisma: {
      licenca: {
        findUnique: vi.fn(async ({ where }: { where: Record<string, string> }) => {
          const row = db.row as LicencaRow | null;
          return matches(where, row) ? row : null;
        }),
        update: vi.fn(
          async ({ where, data }: { where: { id: string }; data: Partial<LicencaRow> }) => {
            const row = db.row as LicencaRow | null;
            if (!matches(where, row)) throw new Error("registo inexistente");
            Object.assign(row as LicencaRow, data);
            return row;
          },
        ),
      },
      // A carteira do Individual existe mas está fora do âmbito deste percurso.
      carteira: { findUnique: vi.fn(async () => null) },
    },
  };
});

import { obterLicenca, obterLicencaPendente } from "@/lib/actions/licenciamento";
import { ativarLicenca } from "@/lib/actions/admin-licencas";
import { temLicencaValida } from "@/lib/licenca";
import { deveBloquearPorLicenca } from "@/lib/guarda-licenca";
import { obterMembroAtual } from "@/lib/permissoes";
import { enviarEmail } from "@/lib/email/resend";
import { PRECO_INDIVIDUAL_CENTIMOS } from "@/lib/billing";

const mockObterMembro = obterMembroAtual as unknown as { mockResolvedValue: (v: unknown) => void };
const enviarEmailMock = enviarEmail as unknown as { mock: { calls: unknown[][] } };

/** Semeia a licença Individual PENDENTE tal como `registar` a deixa (titular = pessoa). */
function semearIndividualPendente(): LicencaRow {
  const row: LicencaRow = {
    id: CUID,
    tipo: "INDIVIDUAL",
    tier: null,
    estado: "PENDENTE",
    ciclo: "MENSAL", // onboarding grava sempre MENSAL na licença pendente
    dataInicio: new Date("2026-09-01"),
    dataFim: null,
    precoCentimos: PRECO_INDIVIDUAL_CENTIMOS.MENSAL,
    modalidade: "FUTSAL",
    numSeccoes: 1,
    criadoEm: new Date("2026-09-01"),
    utilizadorId: USER, // titular = PESSOA; repare que clubeId NUNCA é definido
    utilizador: { id: USER, nome: "Ana Treinadora", email: "ana@exemplo.pt" },
    clube: null,
  };
  db.row = row;
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sessão do treinador Individual: clube técnico + utilizador conhecidos.
  mockObterMembro.mockResolvedValue({ clube: { id: CLUBE_TECNICO }, utilizadorId: USER });
});

describe("percurso Individual: PENDENTE → ativação → acesso liberto", () => {
  it("atravessa o ciclo de vida completo mantendo os invariantes nas costuras", async () => {
    const row = semearIndividualPendente();

    // 1) Paywall: o plano pendente é o preço FIXO Individual (não o multi-secção).
    const pendente = await obterLicencaPendente();
    expect(pendente).toEqual({
      tier: "INDIVIDUAL",
      precoCentimos: PRECO_INDIVIDUAL_CENTIMOS.MENSAL,
      precoAnualCentimos: PRECO_INDIVIDUAL_CENTIMOS.ANUAL,
    });

    // 2) Guarda ANTES da ativação: PENDENTE não é válida → bloqueia (paywall/wizard).
    const antes = await temLicencaValida(CLUBE_TECNICO, USER);
    expect(antes).toBe(false);
    expect(deveBloquearPorLicenca(antes)).toBe(true);

    // 3) Definições→Licença antes da ativação: sem licença ATIVA → null.
    const licAntes = await obterLicenca();
    expect(licAntes.sucesso).toBe(true);
    if (licAntes.sucesso) expect(licAntes.dados).toBeNull();

    // 4) Ativação no backoffice (PENDENTE → ATIVA) — a mesma linha em memória.
    const ativou = await ativarLicenca({ licencaId: CUID });
    expect(ativou.sucesso).toBe(true);
    expect(row.estado).toBe("ATIVA");
    expect(row.dataFim).toBeInstanceOf(Date); // dataFim atribuída no ato (ciclo MENSAL)

    // 5) A ativação notifica o UTILIZADOR (titular), não um clube.
    expect(enviarEmailMock.mock.calls).toHaveLength(1);
    expect((enviarEmailMock.mock.calls[0][0] as { para: string }).para).toBe("ana@exemplo.pt");

    // 6) Guarda DEPOIS da ativação: agora válida → não bloqueia.
    const depois = await temLicencaValida(CLUBE_TECNICO, USER);
    expect(depois).toBe(true);
    expect(deveBloquearPorLicenca(depois)).toBe(false);

    // 7) Definições→Licença depois da ativação: resolve a licença Individual ATIVA.
    const licDepois = await obterLicenca();
    expect(licDepois.sucesso).toBe(true);
    if (licDepois.sucesso) {
      expect(licDepois.dados?.id).toBe(CUID);
      expect(licDepois.dados?.tipo).toBe("INDIVIDUAL");
    }

    // Invariante transversal: em NENHUM ponto do percurso a licença ganhou clubeId.
    expect(row.clubeId).toBeUndefined();
  });

  it("invariante: ativar uma licença Individual nunca lhe atribui um clubeId", async () => {
    const row = semearIndividualPendente();
    await ativarLicenca({ licencaId: CUID });
    // A ativação só toca em estado/dataFim; a titularidade pela pessoa é imutável.
    expect(row.clubeId).toBeUndefined();
    expect(row.utilizadorId).toBe(USER);
    expect(row.tipo).toBe("INDIVIDUAL");
  });

  it("uma licença Individual ATIVA mas com ciclo expirado volta a bloquear a guarda", async () => {
    // Costura ativação↔expiração: ATIVA já não chega — a guarda considera (estado, dataFim).
    const row = semearIndividualPendente();
    row.estado = "ATIVA";
    row.dataFim = new Date(Date.now() - 86_400_000); // ontem

    const ok = await temLicencaValida(CLUBE_TECNICO, USER);
    expect(ok).toBe(false);
    expect(deveBloquearPorLicenca(ok)).toBe(true);

    // E Definições→Licença continua a mostrar a licença (é ATIVA), mas o ACESSO
    // é negado pela guarda — provando que as duas leituras têm critérios distintos.
    const lic = await obterLicenca();
    expect(lic.sucesso).toBe(true);
    if (lic.sucesso) expect(lic.dados?.id).toBe(CUID);
  });
});
