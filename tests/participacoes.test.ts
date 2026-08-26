import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (hoisted pelo Vitest) ─────────────────────────────────────────────
// Os schemas e o invariante são puros; os mocks servem só as Server Actions.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

vi.mock("@/lib/epoca-context", () => ({
  obterClubeIdAtual: vi.fn(),
  obterEpocaAtiva: vi.fn(),
  COOKIE_EPOCA: "epoca_ativa",
}));

vi.mock("@/lib/permissoes", () => ({
  exigirCapacidade: vi.fn(),
  exigirCapacidadeEmAlgumEscalao: vi.fn(),
  podeLerEscalao: vi.fn(),
  podeLerAlgumEscalao: vi.fn(),
  escaloesLegiveis: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    epoca: { findFirst: vi.fn() },
    atleta: { findFirst: vi.fn() },
    escalao: { findFirst: vi.fn(), findMany: vi.fn() },
    atletaEscalao: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  associarAEscalaoSchema,
  transferirEscalaoSchema,
  terminarParticipacaoSchema,
  editarTipoParticipacaoSchema,
  conflitoPrincipalAtivo,
  principaisADespromover,
  ficariaSemPrincipal,
  ABREV_TIPO_PARTICIPACAO,
  ESTADOS_PARTICIPACAO,
  LABEL_ESTADO_PARTICIPACAO,
  LABEL_TIPO_PARTICIPACAO,
  TIPOS_PARTICIPACAO,
  TIPOS_PARTICIPACAO_ADICIONAL,
} from "@/lib/schemas/participacao";
import {
  associarAEscalao,
  transferirEscalao,
  terminarParticipacao,
  editarTipoParticipacao,
  listarParticipacoes,
  obterCarreiraAtleta,
} from "@/lib/actions/participacoes";
import { obterClubeIdAtual, obterEpocaAtiva } from "@/lib/epoca-context";
import { exigirCapacidade, podeLerAlgumEscalao } from "@/lib/permissoes";
import { prisma } from "@/lib/db";

const ATLETA = "ckv9v0z1w0000abcd1234efgh";
const ESC_A = "ckv9v0z1w0000abcd1234efgi";
const ESC_B = "ckv9v0z1w0000abcd1234efgj";
const ESC_C = "ckv9v0z1w0000abcd1234efgk";
const EPOCA = "ckv9v0z1w0000abcd1234efgl";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Schemas (puros)
// ─────────────────────────────────────────────────────────────────────────────

describe("associarAEscalaoSchema (F1)", () => {
  const base = { atletaId: ATLETA, escalaoId: ESC_A };

  it("aceita input mínimo e assume participação SIMULTANEA", () => {
    const r = associarAEscalaoSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tipo).toBe("SIMULTANEA");
  });

  it("número ausente fica undefined (não é erro de validação)", () => {
    const r = associarAEscalaoSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.numero).toBeUndefined();
  });

  it("aceita número explicitamente undefined (campo em branco no formulário)", () => {
    const r = associarAEscalaoSchema.safeParse({ ...base, numero: undefined });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.numero).toBeUndefined();
  });

  it("aceita número null (sem camisola atribuída)", () => {
    const r = associarAEscalaoSchema.safeParse({ ...base, numero: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.numero).toBeNull();
  });

  it("aceita os limites do intervalo 1-999", () => {
    for (const numero of [1, 7, 999]) {
      const r = associarAEscalaoSchema.safeParse({ ...base, numero });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.numero).toBe(numero);
    }
  });

  it("rejeita número fora do intervalo 1-999", () => {
    for (const numero of [0, -1, 1000, 5000]) {
      const r = associarAEscalaoSchema.safeParse({ ...base, numero });
      expect(r.success).toBe(false);
      if (!r.success)
        expect(r.error.issues[0].message).toMatch(/entre 1 e 999/);
    }
  });

  it("rejeita número não inteiro", () => {
    expect(associarAEscalaoSchema.safeParse({ ...base, numero: 7.5 }).success).toBe(
      false,
    );
  });

  it("rejeita número em texto (a conversão é do formulário, não do schema)", () => {
    expect(associarAEscalaoSchema.safeParse({ ...base, numero: "7" }).success).toBe(
      false,
    );
  });

  it("rejeita tipo PRINCIPAL — o principal só nasce em criarAtleta ou por transferência", () => {
    const r = associarAEscalaoSchema.safeParse({ ...base, tipo: "PRINCIPAL" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["tipo"]);
      expect(r.error.issues[0].message).toMatch(/principal/i);
    }
  });

  it("aceita todos os tipos adicionais (SIMULTANEA e OCASIONAL)", () => {
    for (const tipo of TIPOS_PARTICIPACAO_ADICIONAL) {
      const r = associarAEscalaoSchema.safeParse({ ...base, tipo });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.tipo).toBe(tipo);
    }
  });

  it("os tipos adicionais são exatamente os tipos menos PRINCIPAL", () => {
    expect([...TIPOS_PARTICIPACAO_ADICIONAL]).toEqual(
      TIPOS_PARTICIPACAO.filter((t) => t !== "PRINCIPAL"),
    );
  });

  it("rejeita tipo fora do enum", () => {
    expect(
      associarAEscalaoSchema.safeParse({ ...base, tipo: "EMPRESTIMO" }).success,
    ).toBe(false);
  });

  it("rejeita atleta e escalão que não sejam cuid", () => {
    expect(
      associarAEscalaoSchema.safeParse({ atletaId: "x", escalaoId: ESC_A }).success,
    ).toBe(false);
    expect(
      associarAEscalaoSchema.safeParse({ atletaId: ATLETA, escalaoId: "x" }).success,
    ).toBe(false);
  });

  it("época é opcional mas, quando presente, tem de ser cuid", () => {
    expect(associarAEscalaoSchema.safeParse({ ...base, epocaId: EPOCA }).success).toBe(
      true,
    );
    expect(associarAEscalaoSchema.safeParse({ ...base, epocaId: "x" }).success).toBe(
      false,
    );
  });
});

describe("transferirEscalaoSchema (F1)", () => {
  const base = { atletaId: ATLETA, deEscalaoId: ESC_A, paraEscalaoId: ESC_B };

  it("aceita escalões diferentes e assume tipo PRINCIPAL no destino", () => {
    const r = transferirEscalaoSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tipo).toBe("PRINCIPAL");
  });

  it("rejeita origem igual ao destino, apontando o erro a paraEscalaoId", () => {
    const r = transferirEscalaoSchema.safeParse({
      ...base,
      paraEscalaoId: ESC_A,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["paraEscalaoId"]);
      expect(r.error.issues[0].message).toMatch(/diferente/i);
    }
  });

  it("número em branco (undefined) é aceite e fica undefined — a action mantém o da origem", () => {
    const r = transferirEscalaoSchema.safeParse({ ...base, numero: undefined });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.numero).toBeUndefined();
  });

  it("número omitido fica undefined", () => {
    const r = transferirEscalaoSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.numero).toBeUndefined();
  });

  it("aceita número no destino dentro do intervalo", () => {
    const r = transferirEscalaoSchema.safeParse({ ...base, numero: 10 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.numero).toBe(10);
  });

  it("rejeita número fora do intervalo 1-999", () => {
    for (const numero of [0, 1000]) {
      expect(transferirEscalaoSchema.safeParse({ ...base, numero }).success).toBe(
        false,
      );
    }
  });

  it("aceita qualquer um dos três tipos no destino", () => {
    for (const tipo of TIPOS_PARTICIPACAO) {
      expect(transferirEscalaoSchema.safeParse({ ...base, tipo }).success).toBe(true);
    }
  });

  it("rejeita ids que não sejam cuid", () => {
    expect(
      transferirEscalaoSchema.safeParse({ ...base, deEscalaoId: "x" }).success,
    ).toBe(false);
    expect(
      transferirEscalaoSchema.safeParse({ ...base, paraEscalaoId: "x" }).success,
    ).toBe(false);
  });
});

describe("terminarParticipacaoSchema (F1)", () => {
  it("aceita atleta + escalão", () => {
    const r = terminarParticipacaoSchema.safeParse({
      atletaId: ATLETA,
      escalaoId: ESC_A,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.epocaId).toBeUndefined();
  });

  it("aceita época explícita", () => {
    const r = terminarParticipacaoSchema.safeParse({
      atletaId: ATLETA,
      escalaoId: ESC_A,
      epocaId: EPOCA,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.epocaId).toBe(EPOCA);
  });

  it("exige escalão", () => {
    expect(terminarParticipacaoSchema.safeParse({ atletaId: ATLETA }).success).toBe(
      false,
    );
  });

  it("exige atleta", () => {
    expect(terminarParticipacaoSchema.safeParse({ escalaoId: ESC_A }).success).toBe(
      false,
    );
  });

  it("rejeita época que não seja cuid", () => {
    expect(
      terminarParticipacaoSchema.safeParse({
        atletaId: ATLETA,
        escalaoId: ESC_A,
        epocaId: "x",
      }).success,
    ).toBe(false);
  });
});

describe("editarTipoParticipacaoSchema (F1)", () => {
  const base = { atletaId: ATLETA, escalaoId: ESC_A };

  it("aceita qualquer um dos três tipos (incl. PRINCIPAL)", () => {
    for (const tipo of TIPOS_PARTICIPACAO) {
      const r = editarTipoParticipacaoSchema.safeParse({ ...base, tipo });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.tipo).toBe(tipo);
    }
  });

  it("exige tipo (não tem valor por omissão)", () => {
    expect(editarTipoParticipacaoSchema.safeParse(base).success).toBe(false);
  });

  it("rejeita tipo fora do enum", () => {
    expect(
      editarTipoParticipacaoSchema.safeParse({ ...base, tipo: "EMPRESTIMO" }).success,
    ).toBe(false);
  });

  it("aceita época explícita mas exige cuid", () => {
    expect(
      editarTipoParticipacaoSchema.safeParse({ ...base, tipo: "PRINCIPAL", epocaId: EPOCA })
        .success,
    ).toBe(true);
    expect(
      editarTipoParticipacaoSchema.safeParse({ ...base, tipo: "PRINCIPAL", epocaId: "x" })
        .success,
    ).toBe(false);
  });

  it("exige atleta e escalão em formato cuid", () => {
    expect(
      editarTipoParticipacaoSchema.safeParse({ atletaId: "x", escalaoId: ESC_A, tipo: "PRINCIPAL" })
        .success,
    ).toBe(false);
    expect(
      editarTipoParticipacaoSchema.safeParse({ atletaId: ATLETA, escalaoId: "x", tipo: "PRINCIPAL" })
        .success,
    ).toBe(false);
  });
});

describe("rótulos de participação (badges da UI)", () => {
  it("todos os tipos e estados têm rótulo", () => {
    for (const tipo of TIPOS_PARTICIPACAO) {
      expect(LABEL_TIPO_PARTICIPACAO[tipo]).toBeTruthy();
      expect(ABREV_TIPO_PARTICIPACAO[tipo]).toBeTruthy();
    }
    for (const estado of ESTADOS_PARTICIPACAO) {
      expect(LABEL_ESTADO_PARTICIPACAO[estado]).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Invariante: um só PRINCIPAL ativo por atleta/época (secção 9)
// ─────────────────────────────────────────────────────────────────────────────

describe("conflitoPrincipalAtivo (invariante do principal único)", () => {
  const principalEmA = { escalaoId: ESC_A, tipo: "PRINCIPAL" as const };
  const simultaneaEmB = { escalaoId: ESC_B, tipo: "SIMULTANEA" as const };

  it("destino não-PRINCIPAL nunca gera conflito", () => {
    expect(
      conflitoPrincipalAtivo([principalEmA], {
        escalaoId: ESC_C,
        tipo: "SIMULTANEA",
      }),
    ).toBeNull();
    expect(
      conflitoPrincipalAtivo([principalEmA], {
        escalaoId: ESC_C,
        tipo: "OCASIONAL",
      }),
    ).toBeNull();
  });

  it("sem participações ativas, um destino PRINCIPAL é seguro", () => {
    expect(
      conflitoPrincipalAtivo([], { escalaoId: ESC_A, tipo: "PRINCIPAL" }),
    ).toBeNull();
  });

  it("deteta o segundo principal quando já existe um noutro escalão", () => {
    expect(
      conflitoPrincipalAtivo([principalEmA], { escalaoId: ESC_C, tipo: "PRINCIPAL" }),
    ).toBe(ESC_A);
  });

  it("não há conflito quando o principal existente é o próprio escalão de destino", () => {
    expect(
      conflitoPrincipalAtivo([principalEmA], { escalaoId: ESC_A, tipo: "PRINCIPAL" }),
    ).toBeNull();
  });

  it("não há conflito quando o principal existente é encerrado pela operação", () => {
    // Transferência A → C: a origem (A, principal) fica em transição permanente.
    expect(
      conflitoPrincipalAtivo(
        [principalEmA],
        { escalaoId: ESC_C, tipo: "PRINCIPAL" },
        [ESC_A],
      ),
    ).toBeNull();
  });

  it("há conflito ao transferir uma simultânea para principal com outro principal ativo", () => {
    // Transferência B (simultânea) → C como principal, mantendo A principal ativo.
    expect(
      conflitoPrincipalAtivo(
        [principalEmA, simultaneaEmB],
        { escalaoId: ESC_C, tipo: "PRINCIPAL" },
        [ESC_B],
      ),
    ).toBe(ESC_A);
  });

  it("ignora participações simultâneas/ocasionais ao procurar conflito", () => {
    expect(
      conflitoPrincipalAtivo([simultaneaEmB], { escalaoId: ESC_C, tipo: "PRINCIPAL" }),
    ).toBeNull();
  });
});

describe("principaisADespromover (resolução do principal único)", () => {
  const principalEmA = { id: "ae1", escalaoId: ESC_A, tipo: "PRINCIPAL" as const };
  const principalEmB = { id: "ae2", escalaoId: ESC_B, tipo: "PRINCIPAL" as const };
  const simultaneaEmB = { id: "ae3", escalaoId: ESC_B, tipo: "SIMULTANEA" as const };

  it("nada a despromover quando o destino não é PRINCIPAL", () => {
    expect(
      principaisADespromover([principalEmA], { escalaoId: ESC_C, tipo: "SIMULTANEA" }),
    ).toEqual([]);
  });

  it("devolve a participação completa (com id) a despromover", () => {
    expect(
      principaisADespromover([principalEmA], { escalaoId: ESC_C, tipo: "PRINCIPAL" }),
    ).toEqual([principalEmA]);
  });

  it("despromove TODOS os principais que sobrariam ativos", () => {
    expect(
      principaisADespromover([principalEmA, principalEmB], {
        escalaoId: ESC_C,
        tipo: "PRINCIPAL",
      }),
    ).toEqual([principalEmA, principalEmB]);
  });

  it("exclui o próprio destino e os escalões encerrados pela operação", () => {
    expect(
      principaisADespromover([principalEmA], { escalaoId: ESC_A, tipo: "PRINCIPAL" }),
    ).toEqual([]);
    expect(
      principaisADespromover(
        [principalEmA],
        { escalaoId: ESC_C, tipo: "PRINCIPAL" },
        [ESC_A],
      ),
    ).toEqual([]);
  });

  it("ignora participações não-principais", () => {
    expect(
      principaisADespromover([simultaneaEmB], { escalaoId: ESC_C, tipo: "PRINCIPAL" }),
    ).toEqual([]);
  });

  it("é coerente com conflitoPrincipalAtivo", () => {
    const ativas = [principalEmA, simultaneaEmB];
    const destino = { escalaoId: ESC_C, tipo: "PRINCIPAL" as const };
    expect(conflitoPrincipalAtivo(ativas, destino)).toBe(
      principaisADespromover(ativas, destino)[0]?.escalaoId ?? null,
    );
  });
});

describe("ficariaSemPrincipal (participação principal obrigatória)", () => {
  const principalEmA = { escalaoId: ESC_A, tipo: "PRINCIPAL" as const };
  const simultaneaEmB = { escalaoId: ESC_B, tipo: "SIMULTANEA" as const };

  it("um destino PRINCIPAL garante sempre o principal", () => {
    expect(
      ficariaSemPrincipal([principalEmA], { escalaoId: ESC_C, tipo: "PRINCIPAL" }, [
        ESC_A,
      ]),
    ).toBe(false);
  });

  it("deteta a perda do principal ao transferi-lo para simultânea", () => {
    expect(
      ficariaSemPrincipal([principalEmA], { escalaoId: ESC_C, tipo: "SIMULTANEA" }, [
        ESC_A,
      ]),
    ).toBe(true);
  });

  it("não há perda quando sobra outro principal ativo", () => {
    expect(
      ficariaSemPrincipal(
        [principalEmA, simultaneaEmB],
        { escalaoId: ESC_C, tipo: "OCASIONAL" },
        [ESC_B],
      ),
    ).toBe(false);
  });

  it("o destino sobrepõe-se à participação existente no mesmo escalão", () => {
    // Despromover o principal de A ao transferir B → A como simultânea.
    expect(
      ficariaSemPrincipal([principalEmA, simultaneaEmB], {
        escalaoId: ESC_A,
        tipo: "SIMULTANEA",
      }),
    ).toBe(true);
  });

  it("sem destino (terminar participação), basta sobrar um principal ativo", () => {
    expect(ficariaSemPrincipal([principalEmA], null, [ESC_B])).toBe(false);
    expect(ficariaSemPrincipal([principalEmA], null, [ESC_A])).toBe(true);
    expect(ficariaSemPrincipal([simultaneaEmB], null)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Server Actions
// ─────────────────────────────────────────────────────────────────────────────

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockRejectedValue: (v: unknown) => void;
    mockImplementation: (f: (...a: unknown[]) => unknown) => void;
  };

const chamadas = (fn: unknown) =>
  (fn as { mock: { calls: unknown[][] } }).mock.calls;

const PERM_OK = { ok: true, ctx: { clube: { id: "clube1" } } };

beforeEach(() => {
  vi.clearAllMocks();
  mocked(exigirCapacidade).mockResolvedValue(PERM_OK);
  mocked(podeLerAlgumEscalao).mockResolvedValue(true);
  mocked(obterClubeIdAtual).mockResolvedValue("clube1");
  mocked(obterEpocaAtiva).mockResolvedValue({ id: "ep1" });
  mocked(prisma.atleta.findFirst).mockResolvedValue({ id: "atleta1" });
  mocked(prisma.escalao.findFirst).mockResolvedValue({ id: ESC_A });
  mocked(prisma.escalao.findMany).mockResolvedValue([{ id: ESC_A }, { id: ESC_B }]);
  mocked(prisma.atletaEscalao.findFirst).mockResolvedValue(null);
  mocked(prisma.atletaEscalao.findMany).mockResolvedValue([]);
  // $transaction em array: resolve cada promessa (é assim que transferirEscalao a usa).
  mocked(prisma.$transaction).mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

describe("associarAEscalao", () => {
  it("recusa tipo PRINCIPAL sem tocar na BD", async () => {
    const r = await associarAEscalao({
      atletaId: ATLETA,
      escalaoId: ESC_A,
      tipo: "PRINCIPAL",
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.tipo).toMatch(/principal/i);
    expect(prisma.atletaEscalao.create).not.toHaveBeenCalled();
    expect(exigirCapacidade).not.toHaveBeenCalled();
  });

  it("falha sem capacidade no escalão", async () => {
    mocked(exigirCapacidade).mockResolvedValue({
      ok: false,
      erro: "Sem permissão neste escalão",
    });
    const r = await associarAEscalao({ atletaId: ATLETA, escalaoId: ESC_A });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/permiss/i);
    expect(prisma.atletaEscalao.create).not.toHaveBeenCalled();
  });

  it("exige a capacidade PLANTEL_GERIR no escalão indicado", async () => {
    mocked(prisma.atletaEscalao.create).mockResolvedValue({ id: "ae1" });
    await associarAEscalao({ atletaId: ATLETA, escalaoId: ESC_A });
    expect(chamadas(exigirCapacidade)[0]).toEqual(["PLANTEL_GERIR", ESC_A]);
  });

  it("isola por clube: falha se o atleta não pertence ao clube ativo", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue(null);
    const r = await associarAEscalao({ atletaId: ATLETA, escalaoId: ESC_A });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/atleta não encontrado/i);
    expect(prisma.atletaEscalao.create).not.toHaveBeenCalled();
  });

  it("isola por clube: falha se o escalão não pertence ao clube ativo", async () => {
    mocked(prisma.escalao.findFirst).mockResolvedValue(null);
    const r = await associarAEscalao({ atletaId: ATLETA, escalaoId: ESC_A });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não existe/i);
    expect(prisma.atletaEscalao.create).not.toHaveBeenCalled();
  });

  it("falha se não houver época ativa nem época indicada", async () => {
    mocked(obterEpocaAtiva).mockResolvedValue(null);
    const r = await associarAEscalao({ atletaId: ATLETA, escalaoId: ESC_A });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/época ativa/i);
    expect(prisma.atletaEscalao.create).not.toHaveBeenCalled();
  });

  it("propaga erros inesperados da BD em vez de os mascarar", async () => {
    mocked(prisma.atletaEscalao.create).mockRejectedValue(new Error("ligação perdida"));
    await expect(
      associarAEscalao({ atletaId: ATLETA, escalaoId: ESC_A }),
    ).rejects.toThrow("ligação perdida");
  });

  it("revalida plantel, perfil do atleta e dashboard", async () => {
    mocked(prisma.atletaEscalao.create).mockResolvedValue({ id: "ae1" });
    await associarAEscalao({ atletaId: ATLETA, escalaoId: ESC_A });

    expect(chamadas(revalidatePath).map((c) => c[0])).toEqual([
      "/plantel",
      "/plantel/atleta1",
      "/dashboard",
    ]);
  });

  it("permite número já usado por outro atleta — o aviso é da UI (secção 9)", async () => {
    // Existe outra participação ativa com o número 7 no mesmo escalão/época.
    mocked(prisma.atletaEscalao.findFirst).mockResolvedValue({ id: "ae0" });
    mocked(prisma.atletaEscalao.create).mockResolvedValue({ id: "ae1" });

    const r = await associarAEscalao({
      atletaId: ATLETA,
      escalaoId: ESC_A,
      numero: 7,
    });
    expect(r.sucesso).toBe(true);

    const arg = chamadas(prisma.atletaEscalao.create)[0][0] as {
      data: { numero: number | null };
    };
    expect(arg.data.numero).toBe(7);
  });

  it("cria a participação adicional ATIVA com o tipo pedido quando já há principal na modalidade", async () => {
    // Já existe um PRINCIPAL ativo na modalidade do escalão destino (sem secção,
    // modalidade null): a associação mantém o tipo pedido — não força PRINCIPAL
    // (B3, §9).
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { escalao: { seccao: null } },
    ]);
    mocked(prisma.atletaEscalao.create).mockResolvedValue({ id: "ae1" });

    const r = await associarAEscalao({
      atletaId: ATLETA,
      escalaoId: ESC_A,
      tipo: "OCASIONAL",
      numero: 9,
    });
    expect(r.sucesso).toBe(true);

    const arg = chamadas(prisma.atletaEscalao.create)[0][0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data).toMatchObject({
      atletaId: "atleta1",
      escalaoId: ESC_A,
      epocaId: "ep1",
      tipo: "OCASIONAL",
      estado: "ATIVO",
      numero: 9,
    });
  });

  // ─── B3 (Apêndice C, §9): primeiro principal de uma modalidade nova ─────────

  it("força PRINCIPAL quando o atleta ainda não tem principal na modalidade destino (B3)", async () => {
    // Sem principais ativos na modalidade destino → a participação nasce PRINCIPAL,
    // apesar de o pedido ser SIMULTANEA (única exceção à regra «associar nunca
    // força principal»).
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([]);
    mocked(prisma.atletaEscalao.create).mockResolvedValue({ id: "ae1" });

    const r = await associarAEscalao({
      atletaId: ATLETA,
      escalaoId: ESC_A,
      tipo: "SIMULTANEA",
    });
    expect(r.sucesso).toBe(true);

    const arg = chamadas(prisma.atletaEscalao.create)[0][0] as {
      data: { tipo: string };
    };
    expect(arg.data.tipo).toBe("PRINCIPAL");
  });

  it("aplica o invariante POR MODALIDADE: um principal noutra modalidade não conta (B3)", async () => {
    // Escalão destino é de FUTEBOL; o atleta só tem principal em FUTSAL → não há
    // principal na modalidade destino → força PRINCIPAL.
    mocked(prisma.escalao.findFirst).mockResolvedValue({
      id: ESC_A,
      seccao: { modalidade: "FUTEBOL" },
    });
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { escalao: { seccao: { modalidade: "FUTSAL" } } },
    ]);
    mocked(prisma.atletaEscalao.create).mockResolvedValue({ id: "ae1" });

    const r = await associarAEscalao({
      atletaId: ATLETA,
      escalaoId: ESC_A,
      tipo: "SIMULTANEA",
    });
    expect(r.sucesso).toBe(true);

    const arg = chamadas(prisma.atletaEscalao.create)[0][0] as {
      data: { tipo: string };
    };
    expect(arg.data.tipo).toBe("PRINCIPAL");
  });

  it("mantém o tipo pedido quando já há principal na MESMA modalidade destino", async () => {
    mocked(prisma.escalao.findFirst).mockResolvedValue({
      id: ESC_A,
      seccao: { modalidade: "FUTEBOL" },
    });
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { escalao: { seccao: { modalidade: "FUTEBOL" } } },
    ]);
    mocked(prisma.atletaEscalao.create).mockResolvedValue({ id: "ae1" });

    const r = await associarAEscalao({
      atletaId: ATLETA,
      escalaoId: ESC_A,
      tipo: "SIMULTANEA",
    });
    expect(r.sucesso).toBe(true);

    const arg = chamadas(prisma.atletaEscalao.create)[0][0] as {
      data: { tipo: string };
    };
    expect(arg.data.tipo).toBe("SIMULTANEA");
  });

  it("corre numa transação com isolamento Serializable (invariante na escrita)", async () => {
    mocked(prisma.atletaEscalao.create).mockResolvedValue({ id: "ae1" });
    await associarAEscalao({ atletaId: ATLETA, escalaoId: ESC_A });

    const opcoes = chamadas(prisma.$transaction)[0][1] as { isolationLevel: string };
    expect(opcoes.isolationLevel).toBe(
      Prisma.TransactionIsolationLevel.Serializable,
    );
  });

  it("grava numero null quando o número vem em branco", async () => {
    mocked(prisma.atletaEscalao.create).mockResolvedValue({ id: "ae1" });
    await associarAEscalao({ atletaId: ATLETA, escalaoId: ESC_A });

    const arg = chamadas(prisma.atletaEscalao.create)[0][0] as {
      data: { numero: number | null };
    };
    expect(arg.data.numero).toBeNull();
  });

  it("traduz a violação de unicidade (P2002) numa mensagem de domínio", async () => {
    mocked(prisma.atletaEscalao.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "5.22.0",
      }),
    );
    const r = await associarAEscalao({ atletaId: ATLETA, escalaoId: ESC_A });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/já participa/i);
  });
});

describe("transferirEscalao", () => {
  const pedido = { atletaId: ATLETA, deEscalaoId: ESC_A, paraEscalaoId: ESC_B };

  it("exige capacidade na origem E no destino", async () => {
    mocked(exigirCapacidade).mockImplementation((_cap: unknown, escalaoId: unknown) =>
      Promise.resolve(
        escalaoId === ESC_B ? { ok: false, erro: "Sem permissão neste escalão" } : PERM_OK,
      ),
    );

    const r = await transferirEscalao(pedido);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/permiss/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("falha se o atleta não tem participação ativa na origem", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae2", escalaoId: ESC_C, tipo: "PRINCIPAL", numero: 3 },
    ]);

    const r = await transferirEscalao(pedido);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/origem/i);
    // A transação abre (a leitura é atómica com a escrita) mas nada é escrito.
    expect(prisma.atletaEscalao.update).not.toHaveBeenCalled();
    expect(prisma.atletaEscalao.upsert).not.toHaveBeenCalled();
  });

  it("corre numa transação com isolamento Serializable", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "PRINCIPAL", numero: 7 },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });
    mocked(prisma.atletaEscalao.upsert).mockResolvedValue({ id: "ae9" });

    await transferirEscalao(pedido);

    const opcoes = chamadas(prisma.$transaction)[0][1] as { isolationLevel: string };
    expect(opcoes.isolationLevel).toBe(
      Prisma.TransactionIsolationLevel.Serializable,
    );
  });

  it("despromove o principal existente para SIMULTANEA na mesma transação", async () => {
    // Principal em C; transfere-se a simultânea A → B pedindo PRINCIPAL no destino.
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "SIMULTANEA", numero: 7 },
      { id: "ae2", escalaoId: ESC_C, tipo: "PRINCIPAL", numero: 3 },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });
    mocked(prisma.atletaEscalao.upsert).mockResolvedValue({ id: "ae9" });

    const r = await transferirEscalao({ ...pedido, tipo: "PRINCIPAL" });
    expect(r.sucesso).toBe(true);

    const updates = chamadas(prisma.atletaEscalao.update) as [
      { where: { id: string }; data: Record<string, unknown> },
    ][];
    // 1º update: encerra a origem. 2º update: despromove o principal em C.
    expect(updates[0][0].where.id).toBe("ae1");
    expect(updates[0][0].data.estado).toBe("TRANSICAO_PERMANENTE");
    expect(updates[1][0].where.id).toBe("ae2");
    expect(updates[1][0].data).toEqual({ tipo: "SIMULTANEA" });

    // Fica exatamente um principal: o destino.
    const upsert = chamadas(prisma.atletaEscalao.upsert)[0][0] as {
      create: { tipo: string };
      update: { tipo: string };
    };
    expect(upsert.create.tipo).toBe("PRINCIPAL");
    expect(upsert.update.tipo).toBe("PRINCIPAL");
  });

  it("não despromove o principal de OUTRA modalidade (invariante por modalidade, §9)", async () => {
    // Escalões de origem/destino são de FUTSAL; o atleta tem também um principal
    // de FUTEBOL noutro escalão. Transferir dentro do futsal NÃO pode tocar no
    // principal do futebol.
    mocked(prisma.escalao.findMany).mockResolvedValue([
      { id: ESC_A, seccao: { modalidade: "FUTSAL" } },
      { id: ESC_B, seccao: { modalidade: "FUTSAL" } },
    ]);
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      {
        id: "ae1",
        escalaoId: ESC_A,
        tipo: "PRINCIPAL",
        numero: 7,
        escalao: { seccao: { modalidade: "FUTSAL" } },
      },
      {
        id: "ae2",
        escalaoId: ESC_C,
        tipo: "PRINCIPAL",
        numero: 9,
        escalao: { seccao: { modalidade: "FUTEBOL" } },
      },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });
    mocked(prisma.atletaEscalao.upsert).mockResolvedValue({ id: "ae9" });

    const r = await transferirEscalao({ ...pedido, tipo: "PRINCIPAL" });
    expect(r.sucesso).toBe(true);

    // Só o escalão de origem (futsal) é atualizado (encerrado). O principal de
    // futebol (ae2) NÃO é despromovido.
    const updates = chamadas(prisma.atletaEscalao.update) as [
      { where: { id: string } },
    ][];
    expect(updates).toHaveLength(1);
    expect(updates[0][0].where.id).toBe("ae1");
  });

  it("recusa transferir o principal para simultânea se ficasse sem principal", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "PRINCIPAL", numero: 7 },
    ]);

    const r = await transferirEscalao({ ...pedido, tipo: "SIMULTANEA" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/sem participação principal/i);
    expect(prisma.atletaEscalao.update).not.toHaveBeenCalled();
    expect(prisma.atletaEscalao.upsert).not.toHaveBeenCalled();
  });

  it("permite transferir a própria participação principal", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "PRINCIPAL", numero: 7 },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });
    mocked(prisma.atletaEscalao.upsert).mockResolvedValue({ id: "ae9" });

    const r = await transferirEscalao({ ...pedido, tipo: "PRINCIPAL" });
    expect(r.sucesso).toBe(true);

    const update = chamadas(prisma.atletaEscalao.update)[0][0] as {
      data: { estado: string; dataFim: Date };
    };
    expect(update.data.estado).toBe("TRANSICAO_PERMANENTE");
    expect(update.data.dataFim).toBeInstanceOf(Date);
  });

  it("permite transferir para simultânea mesmo com outro principal ativo", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "OCASIONAL", numero: null },
      { id: "ae2", escalaoId: ESC_C, tipo: "PRINCIPAL", numero: 3 },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });
    mocked(prisma.atletaEscalao.upsert).mockResolvedValue({ id: "ae9" });

    const r = await transferirEscalao({ ...pedido, tipo: "SIMULTANEA" });
    expect(r.sucesso).toBe(true);
  });

  it("mantém o número da origem quando o número do destino vem em branco", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "PRINCIPAL", numero: 7 },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });
    mocked(prisma.atletaEscalao.upsert).mockResolvedValue({ id: "ae9" });

    await transferirEscalao({ ...pedido, numero: undefined });

    const upsert = chamadas(prisma.atletaEscalao.upsert)[0][0] as {
      create: { numero: number | null };
      update: {
        numero: number | null;
        estado: string;
        dataFim: null;
        dataInicio: Date;
      };
    };
    expect(upsert.create.numero).toBe(7);
    expect(upsert.update.numero).toBe(7);
    expect(upsert.update.estado).toBe("ATIVO");
    expect(upsert.update.dataFim).toBeNull();
  });

  it("reinicia a dataInicio ao reativar uma participação existente no destino", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "PRINCIPAL", numero: 7 },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });
    mocked(prisma.atletaEscalao.upsert).mockResolvedValue({ id: "ae9" });

    await transferirEscalao(pedido);

    const upsert = chamadas(prisma.atletaEscalao.upsert)[0][0] as {
      create: { dataInicio: Date };
      update: { dataInicio: Date };
    };
    expect(upsert.update.dataInicio).toBeInstanceOf(Date);
    // A mesma instante nos dois ramos: a etapa nova começa agora.
    expect(upsert.update.dataInicio).toEqual(upsert.create.dataInicio);
  });

  it("usa o número indicado quando é fornecido", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "PRINCIPAL", numero: 7 },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });
    mocked(prisma.atletaEscalao.upsert).mockResolvedValue({ id: "ae9" });

    await transferirEscalao({ ...pedido, numero: 12 });

    const upsert = chamadas(prisma.atletaEscalao.upsert)[0][0] as {
      create: { numero: number | null };
    };
    expect(upsert.create.numero).toBe(12);
  });

  it("permite número já usado no escalão de destino — o aviso é da UI (secção 9)", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "PRINCIPAL", numero: 7 },
    ]);
    // Outro atleta já tem o número 7 no destino.
    mocked(prisma.atletaEscalao.findFirst).mockResolvedValue({ id: "ocupado" });
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });
    mocked(prisma.atletaEscalao.upsert).mockResolvedValue({ id: "ae9" });

    const r = await transferirEscalao(pedido);
    expect(r.sucesso).toBe(true);

    const upsert = chamadas(prisma.atletaEscalao.upsert)[0][0] as {
      create: { numero: number | null };
    };
    expect(upsert.create.numero).toBe(7);
  });

  it("falha quando um dos escalões não pertence ao clube", async () => {
    mocked(prisma.escalao.findMany).mockResolvedValue([{ id: ESC_A }]);
    const r = await transferirEscalao(pedido);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não existe/i);
  });

  it("rejeita origem igual ao destino antes de qualquer verificação de permissão", async () => {
    const r = await transferirEscalao({ ...pedido, paraEscalaoId: ESC_A });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.paraEscalaoId).toBeTruthy();
    expect(exigirCapacidade).not.toHaveBeenCalled();
  });
});

describe("terminarParticipacao", () => {
  const pedido = { atletaId: ATLETA, escalaoId: ESC_A };

  it("exige a capacidade de clube PROMOVER_ATLETAS", async () => {
    mocked(prisma.atletaEscalao.findFirst).mockResolvedValue({ id: "ae1" });
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });

    await terminarParticipacao(pedido);
    expect(chamadas(exigirCapacidade)[0]).toEqual(["PROMOVER_ATLETAS"]);
  });

  it("falha sem a capacidade", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await terminarParticipacao(pedido);
    expect(r.sucesso).toBe(false);
    expect(prisma.atletaEscalao.update).not.toHaveBeenCalled();
  });

  it("falha se não houver participação ativa nesse escalão", async () => {
    mocked(prisma.atletaEscalao.findFirst).mockResolvedValue(null);
    const r = await terminarParticipacao(pedido);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/participação ativa/i);
    expect(prisma.atletaEscalao.update).not.toHaveBeenCalled();
  });

  it("recusa terminar a participação PRINCIPAL (invariante da secção 9)", async () => {
    mocked(prisma.atletaEscalao.findFirst).mockResolvedValue({
      id: "ae1",
      tipo: "PRINCIPAL",
    });

    const r = await terminarParticipacao(pedido);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/participação principal/i);
    expect(prisma.atletaEscalao.update).not.toHaveBeenCalled();
  });

  it("corre numa transação com isolamento Serializable", async () => {
    mocked(prisma.atletaEscalao.findFirst).mockResolvedValue({
      id: "ae1",
      tipo: "SIMULTANEA",
    });
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });

    await terminarParticipacao(pedido);

    const opcoes = chamadas(prisma.$transaction)[0][1] as { isolationLevel: string };
    expect(opcoes.isolationLevel).toBe(
      Prisma.TransactionIsolationLevel.Serializable,
    );
  });

  it("marca a participação INATIVO com dataFim", async () => {
    mocked(prisma.atletaEscalao.findFirst).mockResolvedValue({
      id: "ae1",
      tipo: "SIMULTANEA",
    });
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });

    const r = await terminarParticipacao(pedido);
    expect(r.sucesso).toBe(true);

    const arg = chamadas(prisma.atletaEscalao.update)[0][0] as {
      where: { id: string };
      data: { estado: string; dataFim: Date };
    };
    expect(arg.where.id).toBe("ae1");
    expect(arg.data.estado).toBe("INATIVO");
    expect(arg.data.dataFim).toBeInstanceOf(Date);
  });

  it("valida a época indicada contra o clube", async () => {
    mocked(prisma.epoca.findFirst).mockResolvedValue(null);
    const r = await terminarParticipacao({ ...pedido, epocaId: EPOCA });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/época selecionada não existe/i);
    expect(prisma.atletaEscalao.update).not.toHaveBeenCalled();
  });
});

describe("editarTipoParticipacao", () => {
  const pedido = { atletaId: ATLETA, escalaoId: ESC_A, tipo: "OCASIONAL" as const };

  it("recusa tipo inválido sem tocar na BD", async () => {
    const r = await editarTipoParticipacao({
      atletaId: ATLETA,
      escalaoId: ESC_A,
      tipo: "EMPRESTIMO",
    });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.tipo).toBeTruthy();
    expect(exigirCapacidade).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("exige a capacidade de clube PROMOVER_ATLETAS", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "SIMULTANEA", escalao: { seccao: null } },
      { id: "ae2", escalaoId: ESC_B, tipo: "PRINCIPAL", escalao: { seccao: null } },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });

    await editarTipoParticipacao(pedido);
    expect(chamadas(exigirCapacidade)[0]).toEqual(["PROMOVER_ATLETAS"]);
  });

  it("falha sem a capacidade", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const r = await editarTipoParticipacao(pedido);
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("isola por clube: falha se o atleta não pertence ao clube ativo", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue(null);
    const r = await editarTipoParticipacao(pedido);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/atleta não encontrado/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("isola por clube: falha se o escalão não pertence ao clube ativo", async () => {
    mocked(prisma.escalao.findFirst).mockResolvedValue(null);
    const r = await editarTipoParticipacao(pedido);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não existe/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("falha se o atleta não tem participação ativa nesse escalão", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae2", escalaoId: ESC_B, tipo: "PRINCIPAL", escalao: { seccao: null } },
    ]);
    const r = await editarTipoParticipacao(pedido);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/participação ativa/i);
    expect(prisma.atletaEscalao.update).not.toHaveBeenCalled();
  });

  it("corre numa transação com isolamento Serializable", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "SIMULTANEA", escalao: { seccao: null } },
      { id: "ae2", escalaoId: ESC_B, tipo: "PRINCIPAL", escalao: { seccao: null } },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });

    await editarTipoParticipacao(pedido);

    const opcoes = chamadas(prisma.$transaction)[0][1] as { isolationLevel: string };
    expect(opcoes.isolationLevel).toBe(
      Prisma.TransactionIsolationLevel.Serializable,
    );
  });

  it("altera o tipo de uma participação não-principal", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "SIMULTANEA", escalao: { seccao: null } },
      { id: "ae2", escalaoId: ESC_B, tipo: "PRINCIPAL", escalao: { seccao: null } },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });

    const r = await editarTipoParticipacao(pedido);
    expect(r.sucesso).toBe(true);

    const updates = chamadas(prisma.atletaEscalao.update) as [
      { where: { id: string }; data: Record<string, unknown> },
    ][];
    // Um único update: a própria participação. O principal (ae2) não é tocado.
    expect(updates).toHaveLength(1);
    expect(updates[0][0].where.id).toBe("ae1");
    expect(updates[0][0].data).toEqual({ tipo: "OCASIONAL" });
  });

  it("promover a PRINCIPAL despromove o principal anterior da mesma modalidade", async () => {
    // ae1 (Infantis) é SIMULTANEA; ae2 (Benjamins) é o PRINCIPAL atual. Promover
    // ae1 a PRINCIPAL deve despromover ae2 para SIMULTANEA (invariante §9).
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "SIMULTANEA", escalao: { seccao: null } },
      { id: "ae2", escalaoId: ESC_B, tipo: "PRINCIPAL", escalao: { seccao: null } },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });

    const r = await editarTipoParticipacao({ ...pedido, tipo: "PRINCIPAL" });
    expect(r.sucesso).toBe(true);

    const updates = chamadas(prisma.atletaEscalao.update) as [
      { where: { id: string }; data: Record<string, unknown> },
    ][];
    // 1º: despromove o principal anterior (ae2). 2º: promove o alvo (ae1).
    expect(updates[0][0].where.id).toBe("ae2");
    expect(updates[0][0].data).toEqual({ tipo: "SIMULTANEA" });
    expect(updates[1][0].where.id).toBe("ae1");
    expect(updates[1][0].data).toEqual({ tipo: "PRINCIPAL" });
  });

  it("não despromove o principal de OUTRA modalidade ao promover (invariante por modalidade)", async () => {
    // Escalão editado é de FUTSAL; o principal existente noutra modalidade
    // (FUTEBOL) não pode ser despromovido.
    mocked(prisma.escalao.findFirst).mockResolvedValue({
      id: ESC_A,
      seccao: { modalidade: "FUTSAL" },
    });
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      {
        id: "ae1",
        escalaoId: ESC_A,
        tipo: "SIMULTANEA",
        escalao: { seccao: { modalidade: "FUTSAL" } },
      },
      {
        id: "ae2",
        escalaoId: ESC_B,
        tipo: "PRINCIPAL",
        escalao: { seccao: { modalidade: "FUTEBOL" } },
      },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });

    const r = await editarTipoParticipacao({ ...pedido, tipo: "PRINCIPAL" });
    expect(r.sucesso).toBe(true);

    // Só o alvo (ae1) é atualizado — o principal de futebol (ae2) fica intacto,
    // porque a modalidade FUTSAL não tinha ainda principal.
    const updates = chamadas(prisma.atletaEscalao.update) as [
      { where: { id: string }; data: Record<string, unknown> },
    ][];
    expect(updates).toHaveLength(1);
    expect(updates[0][0].where.id).toBe("ae1");
    expect(updates[0][0].data).toEqual({ tipo: "PRINCIPAL" });
  });

  it("recusa despromover o único principal da modalidade (participação principal obrigatória)", async () => {
    // ae1 (ESC_A) é o único PRINCIPAL; tentar passá-lo a OCASIONAL deixaria a
    // modalidade sem principal.
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "PRINCIPAL", escalao: { seccao: null } },
      { id: "ae2", escalaoId: ESC_B, tipo: "SIMULTANEA", escalao: { seccao: null } },
    ]);

    const r = await editarTipoParticipacao(pedido);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/sem participação principal/i);
    expect(prisma.atletaEscalao.update).not.toHaveBeenCalled();
  });

  it("revalida plantel, perfil do atleta e dashboard", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      { id: "ae1", escalaoId: ESC_A, tipo: "SIMULTANEA", escalao: { seccao: null } },
      { id: "ae2", escalaoId: ESC_B, tipo: "PRINCIPAL", escalao: { seccao: null } },
    ]);
    mocked(prisma.atletaEscalao.update).mockResolvedValue({ id: "ae1" });

    await editarTipoParticipacao(pedido);

    expect(chamadas(revalidatePath).map((c) => c[0])).toEqual([
      "/plantel",
      "/plantel/atleta1",
      "/dashboard",
    ]);
  });

  it("valida a época indicada contra o clube", async () => {
    mocked(prisma.epoca.findFirst).mockResolvedValue(null);
    const r = await editarTipoParticipacao({ ...pedido, epocaId: EPOCA });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/época selecionada não existe/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("listarParticipacoes (histórico)", () => {
  const registo = {
    id: "ae1",
    escalaoId: ESC_A,
    epocaId: "ep1",
    tipo: "PRINCIPAL",
    estado: "ATIVO",
    numero: 7,
    dataInicio: new Date("2026-09-01"),
    dataFim: null,
    escalao: { nome: "Sub-15" },
    epoca: { nome: "2026/27" },
  };

  it("falha sem sessão/clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await listarParticipacoes("atleta1");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não autenticado/i);
    expect(prisma.atletaEscalao.findMany).not.toHaveBeenCalled();
  });

  it("isola por clube: falha se o atleta não pertence ao clube ativo", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue(null);
    const r = await listarParticipacoes("atleta1");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/atleta não encontrado/i);
  });

  it("recusa quem não pode ler nenhum dos escalões do histórico (âmbito, secção 6.4)", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([registo]);
    mocked(podeLerAlgumEscalao).mockResolvedValue(false);

    const r = await listarParticipacoes("atleta1");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/permissão/i);
  });

  it("basta poder ler UM dos escalões para ver o histórico", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      registo,
      { ...registo, id: "ae2", escalaoId: ESC_B, escalao: { nome: "Sub-17" } },
    ]);

    const r = await listarParticipacoes("atleta1");
    expect(r.sucesso).toBe(true);
    expect(chamadas(podeLerAlgumEscalao)[0][0]).toEqual([ESC_A, ESC_B]);
  });

  it("devolve o histórico achatado com nomes de escalão e época", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([registo]);

    const r = await listarParticipacoes("atleta1");
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados).toHaveLength(1);
      expect(r.dados[0]).toMatchObject({
        id: "ae1",
        escalaoId: ESC_A,
        escalaoNome: "Sub-15",
        epocaNome: "2026/27",
        tipo: "PRINCIPAL",
        estado: "ATIVO",
        numero: 7,
        dataFim: null,
      });
    }
  });

  it("um atleta sem participações devolve lista vazia sem verificar âmbito", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([]);

    const r = await listarParticipacoes("atleta1");
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados).toEqual([]);
    expect(podeLerAlgumEscalao).not.toHaveBeenCalled();
  });
});

describe("obterCarreiraAtleta (percurso)", () => {
  const registo = {
    id: "ae1",
    escalaoId: ESC_A,
    epocaId: "ep1",
    tipo: "PRINCIPAL",
    estado: "ATIVO",
    numero: 7,
    dataInicio: new Date("2026-09-01"),
    dataFim: null,
    escalao: { nome: "Sub-15" },
    epoca: { nome: "2026/27", ativa: true },
  };

  it("falha sem sessão/clube ativo", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const r = await obterCarreiraAtleta("atleta1");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não autenticado/i);
    expect(prisma.atletaEscalao.findMany).not.toHaveBeenCalled();
  });

  it("isola por clube: falha se o atleta não pertence ao clube ativo", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue(null);
    const r = await obterCarreiraAtleta("atleta1");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/atleta não encontrado/i);
  });

  it("recusa quem não pode ler nenhum dos escalões do percurso (âmbito, secção 6.4)", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([registo]);
    mocked(podeLerAlgumEscalao).mockResolvedValue(false);

    const r = await obterCarreiraAtleta("atleta1");
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/permissão/i);
  });

  it("mapeia dataIngresso/dataSaida e assinala a época ativa", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([
      registo,
      {
        ...registo,
        id: "ae2",
        escalaoId: ESC_B,
        estado: "INATIVO",
        numero: null,
        dataInicio: new Date("2025-09-01"),
        dataFim: new Date("2026-06-30"),
        escalao: { nome: "Sub-13" },
        epoca: { nome: "2025/26", ativa: false },
      },
    ]);

    const r = await obterCarreiraAtleta("atleta1");
    expect(r.sucesso).toBe(true);
    if (r.sucesso) {
      expect(r.dados).toHaveLength(2);
      expect(r.dados[0]).toEqual({
        id: "ae1",
        epocaNome: "2026/27",
        epocaAtiva: true,
        escalaoNome: "Sub-15",
        numero: 7,
        estado: "ATIVO",
        dataIngresso: new Date("2026-09-01"),
        dataSaida: null,
      });
      expect(r.dados[1]).toEqual({
        id: "ae2",
        epocaNome: "2025/26",
        epocaAtiva: false,
        escalaoNome: "Sub-13",
        numero: null,
        estado: "INATIVO",
        dataIngresso: new Date("2025-09-01"),
        dataSaida: new Date("2026-06-30"),
      });
    }
  });

  it("um atleta sem percurso devolve lista vazia sem verificar âmbito", async () => {
    mocked(prisma.atletaEscalao.findMany).mockResolvedValue([]);

    const r = await obterCarreiraAtleta("atleta1");
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados).toEqual([]);
    expect(podeLerAlgumEscalao).not.toHaveBeenCalled();
  });
});
