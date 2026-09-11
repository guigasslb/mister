import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Costura transversal: resolução dual-titular da guarda de licença (§3.11).
//
// `temLicencaValida(clubeId, utilizadorId)` (lib/licenca.ts) é a peça que o
// layout autenticado (app/(app)/layout.tsx) invoca para decidir o paywall — e
// que, até aqui, NENHUM teste exercia (só a função pura `licencaValida` e o
// negador puro `deveBloquearPorLicenca` estavam cobertos, cada um isoladamente).
//
// Esta suite fecha a costura entre os dois: prova que a resolução por `clubeId`
// OU `utilizadorId` (dois findUnique @unique, combinados por OR) alimenta
// corretamente `deveBloquearPorLicenca`. É aqui que uma licença Individual
// (titular utilizadorId, sem clubeId) tem de dar acesso mesmo sem licença de
// clube — o bug que a resolução dual existe para evitar.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: { licenca: { findUnique: vi.fn() } },
}));

import { temLicencaValida } from "@/lib/licenca";
import { deveBloquearPorLicenca } from "@/lib/guarda-licenca";
import { prisma } from "@/lib/db";

type Row = { estado: string; dataFim: Date | null } | null;
const findUnique = prisma.licenca.findUnique as unknown as {
  mockImplementation: (f: (args: { where: { clubeId?: string; utilizadorId?: string } }) => unknown) => void;
  mock: { calls: unknown[][] };
};

const CLUBE = "clube-1";
const USER = "user-1";

/** Responde ao findUnique consoante o titular consultado (clubeId vs utilizadorId). */
function comTitulares(opts: { clube?: Row; individual?: Row }) {
  findUnique.mockImplementation(({ where }) => {
    if (where.clubeId) return Promise.resolve(opts.clube ?? null);
    if (where.utilizadorId) return Promise.resolve(opts.individual ?? null);
    return Promise.resolve(null);
  });
}

const noFuturo = () => new Date(Date.now() + 86_400_000); // +1 dia
const noPassado = () => new Date(Date.now() - 86_400_000); // -1 dia

beforeEach(() => vi.clearAllMocks());

describe("temLicencaValida — resolução por clubeId OU utilizadorId (§3.11)", () => {
  it("licença Individual ATIVA (titular utilizadorId, sem licença de clube) → válida", async () => {
    comTitulares({ clube: null, individual: { estado: "ATIVA", dataFim: null } });
    expect(await temLicencaValida(CLUBE, USER)).toBe(true);
  });

  it("licença de Clube ATIVA (titular clubeId, sem licença individual) → válida", async () => {
    comTitulares({ clube: { estado: "ATIVA", dataFim: null }, individual: null });
    expect(await temLicencaValida(CLUBE, USER)).toBe(true);
  });

  it("sem qualquer licença (ambos os titulares → null) → inválida", async () => {
    comTitulares({ clube: null, individual: null });
    expect(await temLicencaValida(CLUBE, USER)).toBe(false);
  });

  it("ambas PENDENTE (registo por pagar, os dois ramos) → inválida", async () => {
    comTitulares({
      clube: { estado: "PENDENTE", dataFim: null },
      individual: { estado: "PENDENTE", dataFim: null },
    });
    expect(await temLicencaValida(CLUBE, USER)).toBe(false);
  });

  it("Individual ATIVA mas com dataFim já passada (ciclo expirado) → inválida", async () => {
    comTitulares({ clube: null, individual: { estado: "ATIVA", dataFim: noPassado() } });
    expect(await temLicencaValida(CLUBE, USER)).toBe(false);
  });

  it("Clube ATIVA com dataFim no futuro + individual inexistente → válida", async () => {
    comTitulares({ clube: { estado: "ATIVA", dataFim: noFuturo() }, individual: null });
    expect(await temLicencaValida(CLUBE, USER)).toBe(true);
  });

  it("basta UM titular válido: clube expirado mas individual ATIVA → válida (OR)", async () => {
    // Prova que a resolução é um OR real e não um curto-circuito no primeiro ramo:
    // o ramo Clube está expirado, mas o Individual salva o acesso.
    comTitulares({
      clube: { estado: "ATIVA", dataFim: noPassado() },
      individual: { estado: "ATIVA", dataFim: null },
    });
    expect(await temLicencaValida(CLUBE, USER)).toBe(true);
  });

  it("consulta os DOIS titulares por @unique (clubeId e utilizadorId)", async () => {
    comTitulares({ clube: null, individual: { estado: "ATIVA", dataFim: null } });
    await temLicencaValida(CLUBE, USER);

    const wheres = findUnique.mock.calls.map(
      (c) => (c[0] as { where: { clubeId?: string; utilizadorId?: string } }).where,
    );
    expect(wheres).toContainEqual({ clubeId: CLUBE });
    expect(wheres).toContainEqual({ utilizadorId: USER });
  });
});

describe("costura temLicencaValida → deveBloquearPorLicenca (paywall do layout)", () => {
  it("sem licença válida → a guarda bloqueia (paywall, inclui o wizard)", async () => {
    comTitulares({ clube: null, individual: { estado: "PENDENTE", dataFim: null } });
    const ok = await temLicencaValida(CLUBE, USER);
    expect(deveBloquearPorLicenca(ok)).toBe(true);
  });

  it("licença Individual ATIVA → a guarda NÃO bloqueia (acesso concedido)", async () => {
    comTitulares({ clube: null, individual: { estado: "ATIVA", dataFim: null } });
    const ok = await temLicencaValida(CLUBE, USER);
    expect(deveBloquearPorLicenca(ok)).toBe(false);
  });
});
