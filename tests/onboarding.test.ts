import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));
vi.mock("@/lib/permissoes", () => ({ obterMembroAtual: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    utilizador: { findUnique: vi.fn(), create: vi.fn() },
    membroClube: { findFirst: vi.fn(), create: vi.fn() },
    clube: { create: vi.fn(), update: vi.fn() },
    epoca: { create: vi.fn() },
    seccao: { create: vi.fn() },
    escalao: { create: vi.fn() },
    perfil: { create: vi.fn() },
    licenca: { create: vi.fn(), updateMany: vi.fn() },
    carteira: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// A instalação de conteúdo curado é testada à parte — aqui isola-se de criarClube.
vi.mock("@/lib/biblioteca-arranque-instalar", () => ({
  instalarConteudoArranquePorModalidade: vi.fn(),
}));

// Email ao admin (§17.5): mockado para (a) assertar que é disparado no registo e
// (b) não carregar a infra real (Resend/server-only) nos testes.
vi.mock("@/lib/email/resend", () => ({ enviarEmail: vi.fn() }));
vi.mock("@/lib/email/templates/novo-registo", () => ({
  emailNovoRegisto: vi.fn(() => ({ assunto: "assunto", html: "html", texto: "texto" })),
  obterEmailAdmin: vi.fn(() => "admin@mister.app"),
}));

import { Prisma } from "@prisma/client";
import { criarClube, registar } from "@/lib/actions/onboarding";
import { instalarConteudoArranquePorModalidade } from "@/lib/biblioteca-arranque-instalar";
import { enviarEmail } from "@/lib/email/resend";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockImplementation: (f: (...a: unknown[]) => unknown) => void;
  };

type Calls = { mock: { calls: unknown[][] } };
const calls = (fn: unknown) => (fn as unknown as Calls).mock.calls;

beforeEach(() => {
  vi.clearAllMocks();

  // Sessão válida por defeito.
  mocked(auth).mockResolvedValue({ user: { id: "user1", name: "Treinador" } });
  // Utilizador da sessão existe.
  mocked(prisma.utilizador.findUnique).mockResolvedValue({ id: "user1" });
  // Sem adesão ativa prévia.
  mocked(prisma.membroClube.findFirst).mockResolvedValue(null);

  // Writes dentro da transação.
  mocked(prisma.clube.create).mockResolvedValue({ id: "clube1" });
  mocked(prisma.epoca.create).mockResolvedValue({ id: "epoca1" });
  mocked(prisma.seccao.create).mockResolvedValue({ id: "seccao1" });
  mocked(prisma.escalao.create).mockResolvedValue({ id: "escalao1" });
  mocked(prisma.perfil.create).mockImplementation((args: unknown) => {
    const { data } = args as { data: { nome: string } };
    return Promise.resolve({ id: `perfil-${data.nome}` });
  });
  mocked(prisma.membroClube.create).mockResolvedValue({ id: "membro1" });
  mocked(prisma.licenca.create).mockResolvedValue({ id: "licenca1" });
  mocked(prisma.licenca.updateMany).mockResolvedValue({ count: 1 });
  mocked(prisma.carteira.upsert).mockResolvedValue({ id: "carteira1", utilizadorId: "user1" });
  mocked(instalarConteudoArranquePorModalidade).mockResolvedValue({
    subcategorias: 0,
    exercicios: 0,
    templates: 0,
    habilidades: 0,
  });

  // $transaction interativo: invoca o callback com o próprio prisma como `tx`.
  mocked(prisma.$transaction).mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
});

describe("criarClube — semeia época ativa + secção inicial (P1.6)", () => {
  it("cria uma época ativa para o novo clube", async () => {
    const r = await criarClube({ nome: "Juventude SC", tier: "PEQUENO" });

    expect(r.sucesso).toBe(true);
    expect(prisma.epoca.create).toHaveBeenCalledOnce();

    const arg = calls(prisma.epoca.create)[0][0] as {
      data: {
        clubeId: string;
        ativa: boolean;
        nome: string;
        dataInicio: Date;
        dataFim: Date;
      };
    };
    expect(arg.data.clubeId).toBe("clube1");
    expect(arg.data.ativa).toBe(true);
    // Nome no formato "AAAA/AAAA" (época desportiva).
    expect(arg.data.nome).toMatch(/^\d{4}\/\d{4}$/);
    expect(arg.data.dataInicio).toBeInstanceOf(Date);
    expect(arg.data.dataFim).toBeInstanceOf(Date);
    expect(arg.data.dataInicio.getTime()).toBeLessThan(arg.data.dataFim.getTime());
  });

  it("NÃO semeia nenhum escalão por defeito (o wizard trata disso)", async () => {
    const r = await criarClube({ nome: "Juventude SC", tier: "PEQUENO" });

    expect(r.sucesso).toBe(true);
    // Pré-criar um "Seniores" fixo dava um escalão errado a clubes de formação
    // jovem ou de futebol; o passo de escalões do wizard cria-os com o nome certo.
    expect(prisma.escalao.create).not.toHaveBeenCalled();
  });

  it("semeia época e secção dentro da mesma transação do clube", async () => {
    await criarClube({ nome: "Juventude SC", tier: "PEQUENO" });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.clube.create).toHaveBeenCalledOnce();
    expect(prisma.epoca.create).toHaveBeenCalledOnce();
    expect(prisma.seccao.create).toHaveBeenCalledOnce();
    // Sem escalão-semente: o utilizador cria os escalões no wizard.
    expect(prisma.escalao.create).not.toHaveBeenCalled();
    // O membro administrador continua a ser criado (regressão do fluxo base).
    expect(prisma.membroClube.create).toHaveBeenCalledOnce();
  });

  it("devolve o id do clube criado", async () => {
    const r = await criarClube({ nome: "Juventude SC", tier: "PEQUENO" });
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados.clubeId).toBe("clube1");
  });

  it("não semeia nada quando a sessão é inválida", async () => {
    mocked(auth).mockResolvedValue(null);

    const r = await criarClube({ nome: "Juventude SC", tier: "PEQUENO" });
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.epoca.create).not.toHaveBeenCalled();
    expect(prisma.escalao.create).not.toHaveBeenCalled();
  });

  it("não semeia nada quando já existe uma adesão ativa", async () => {
    mocked(prisma.membroClube.findFirst).mockResolvedValue({ id: "membro-existente" });

    const r = await criarClube({ nome: "Juventude SC", tier: "PEQUENO" });
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/adesão ativa/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.epoca.create).not.toHaveBeenCalled();
  });

  it("não cria um segundo clube se surgir uma adesão ativa durante a transação (anti-duplicação)", async () => {
    // Simula a corrida TOCTOU: o check externo não vê adesão (1ª chamada → null),
    // mas quando a transação corre já existe uma adesão ativa (2ª chamada → membro).
    const ff = prisma.membroClube.findFirst as unknown as {
      mockResolvedValueOnce: (v: unknown) => typeof ff;
    };
    ff.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "concorrente" });

    const r = await criarClube({ nome: "Juventude SC", tier: "PEQUENO" });

    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/adesão ativa/i);
    // A transação abriu mas foi revertida antes de criar o clube ou o membro.
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.clube.create).not.toHaveBeenCalled();
    expect(prisma.membroClube.create).not.toHaveBeenCalled();
  });

  it("rejeita input inválido sem tocar na base de dados", async () => {
    const r = await criarClube({ nome: "" });
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("cria a secção inicial da modalidade escolhida (§8.1.1)", async () => {
    const r = await criarClube({ nome: "Juventude SC", modalidade: "FUTEBOL", tier: "MEDIO" });
    expect(r.sucesso).toBe(true);

    expect(prisma.seccao.create).toHaveBeenCalledOnce();
    const secArg = calls(prisma.seccao.create)[0][0] as {
      data: { clubeId: string; modalidade: string; nome: string };
    };
    expect(secArg.data).toMatchObject({ clubeId: "clube1", modalidade: "FUTEBOL", nome: "Futebol" });
  });

  it("por defeito (sem modalidade) cria secção FUTSAL", async () => {
    const r = await criarClube({ nome: "Juventude SC", tier: "PEQUENO" });
    expect(r.sucesso).toBe(true);
    const secArg = calls(prisma.seccao.create)[0][0] as { data: { modalidade: string } };
    expect(secArg.data.modalidade).toBe("FUTSAL");
  });

  it("instala o conteúdo curado da modalidade escolhida após criar o clube", async () => {
    const r = await criarClube({ nome: "Juventude SC", modalidade: "FUTEBOL", tier: "MEDIO" });
    expect(r.sucesso).toBe(true);
    expect(instalarConteudoArranquePorModalidade).toHaveBeenCalledWith("clube1", "FUTEBOL");
  });

  it("NÃO grava modalidade na licença de Clube (fica null — §3.11/§17.1)", async () => {
    await criarClube({ nome: "Juventude SC", modalidade: "FUTEBOL", tier: "MEDIO" });
    // A modalidade do clube deriva das secções, não da licença: a licença de Clube
    // fica com modalidade null e nenhum updateMany de modalidade é disparado.
    const arg = calls(prisma.licenca.create)[0][0] as {
      data: { tipo: string; modalidade: string | null };
    };
    expect(arg.data.tipo).toBe("CLUBE");
    expect(arg.data.modalidade).toBeNull();
    expect(prisma.licenca.updateMany).not.toHaveBeenCalled();
  });

  it("cria a licença PENDENTE com o tier escolhido no onboarding (§8.1 / §17.1)", async () => {
    const r = await criarClube({ nome: "Juventude SC", tier: "GRANDE" });
    expect(r.sucesso).toBe(true);

    expect(prisma.licenca.create).toHaveBeenCalledOnce();
    const arg = calls(prisma.licenca.create)[0][0] as {
      data: { tipo: string; tier: string; estado: string; ciclo: string; clubeId: string };
    };
    expect(arg.data).toMatchObject({
      tipo: "CLUBE",
      tier: "GRANDE",
      estado: "PENDENTE",
      ciclo: "MENSAL",
      clubeId: "clube1",
    });
    // Sem dataFim (não é trial) e sem numSeccoes explícito (usa o default do schema).
    expect(arg.data).not.toHaveProperty("dataFim");
    expect(arg.data).not.toHaveProperty("numSeccoes");
  });

  it("mapeia o plano INDIVIDUAL para TipoLicenca.INDIVIDUAL (tier null)", async () => {
    const r = await criarClube({ nome: "Juventude SC", tier: "INDIVIDUAL" });
    expect(r.sucesso).toBe(true);

    expect(prisma.licenca.create).toHaveBeenCalledOnce();
    const arg = calls(prisma.licenca.create)[0][0] as {
      data: { tipo: string; tier: string | null; estado: string };
    };
    expect(arg.data.tipo).toBe("INDIVIDUAL");
    expect(arg.data.tier).toBeNull();
    expect(arg.data.estado).toBe("PENDENTE");
  });

  it("rejeita quando falta o tier (plano obrigatório no onboarding)", async () => {
    const r = await criarClube({ nome: "Juventude SC" });
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("uma falha na instalação de conteúdo não aborta a criação do clube", async () => {
    mocked(instalarConteudoArranquePorModalidade).mockImplementation(() => {
      throw new Error("falha de biblioteca");
    });
    const r = await criarClube({ nome: "Juventude SC", tier: "PEQUENO" });
    expect(r.sucesso).toBe(true);
    if (r.sucesso) expect(r.dados.clubeId).toBe("clube1");
  });
});

// §8.1 / §17.5 — registo consolidado: conta + clube + licença PENDENTE numa só
// transação (atómico). Não faz signIn (o formulário autentica a seguir).
describe("registar — cria conta + clube + licença PENDENTE atomicamente (§8.1)", () => {
  const REGISTO_VALIDO = {
    nome: "Ana Treinadora",
    email: "ana@clube.pt",
    password: "password123",
    nomeClube: "Juventude SC",
    tier: "MEDIO" as const,
    modalidade: "FUTEBOL" as const,
  };

  beforeEach(() => {
    // Email livre (pré-check não encontra conta) e utilizador criado na transação.
    mocked(prisma.utilizador.findUnique).mockResolvedValue(null);
    mocked(prisma.utilizador.create).mockResolvedValue({ id: "user1" });
  });

  it("cria conta, clube, secção, época, membro e licença numa única transação", async () => {
    const r = await registar(REGISTO_VALIDO);

    expect(r.sucesso).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.utilizador.create).toHaveBeenCalledOnce();
    expect(prisma.clube.create).toHaveBeenCalledOnce();
    expect(prisma.seccao.create).toHaveBeenCalledOnce();
    expect(prisma.epoca.create).toHaveBeenCalledOnce();
    expect(prisma.membroClube.create).toHaveBeenCalledOnce();
    expect(prisma.licenca.create).toHaveBeenCalledOnce();
    // Sem escalões semeados (o wizard trata disso).
    expect(prisma.escalao.create).not.toHaveBeenCalled();
  });

  it("faz o hash bcrypt da password (nunca a guarda em claro)", async () => {
    await registar(REGISTO_VALIDO);
    const arg = calls(prisma.utilizador.create)[0][0] as {
      data: { nome: string; email: string; passwordHash: string };
    };
    expect(arg.data.nome).toBe("Ana Treinadora");
    expect(arg.data.email).toBe("ana@clube.pt");
    expect(typeof arg.data.passwordHash).toBe("string");
    expect(arg.data.passwordHash).not.toBe("password123");
  });

  it("torna o utilizador RECÉM-CRIADO o membro admin (não a sessão)", async () => {
    await registar(REGISTO_VALIDO);
    const arg = calls(prisma.membroClube.create)[0][0] as {
      data: { utilizadorId: string; estado: string };
    };
    expect(arg.data.utilizadorId).toBe("user1");
    expect(arg.data.estado).toBe("ATIVO");
  });

  it("cria a secção da modalidade escolhida e a licença PENDENTE do tier", async () => {
    await registar(REGISTO_VALIDO);

    const secArg = calls(prisma.seccao.create)[0][0] as {
      data: { modalidade: string; nome: string };
    };
    expect(secArg.data).toMatchObject({ modalidade: "FUTEBOL", nome: "Futebol" });

    const licArg = calls(prisma.licenca.create)[0][0] as {
      data: { tipo: string; tier: string; estado: string; clubeId: string };
    };
    expect(licArg.data).toMatchObject({
      tipo: "CLUBE",
      tier: "MEDIO",
      estado: "PENDENTE",
      clubeId: "clube1",
    });
  });

  it("NÃO faz signIn dentro da action (auth fica com o formulário)", async () => {
    await registar(REGISTO_VALIDO);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("notifica o admin por email do novo registo (§17.5)", async () => {
    await registar(REGISTO_VALIDO);
    expect(enviarEmail).toHaveBeenCalledOnce();
    const arg = calls(enviarEmail)[0][0] as { para: string };
    expect(arg.para).toBe("admin@mister.app");
  });

  it("uma falha no email do admin NÃO parte o registo", async () => {
    mocked(enviarEmail).mockImplementation(() => {
      throw new Error("resend down");
    });
    const r = await registar(REGISTO_VALIDO);
    expect(r.sucesso).toBe(true);
  });

  it("rejeita input inválido (modalidade em falta) sem tocar na base de dados", async () => {
    const r = await registar({
      nome: REGISTO_VALIDO.nome,
      email: REGISTO_VALIDO.email,
      password: REGISTO_VALIDO.password,
      nomeClube: REGISTO_VALIDO.nomeClube,
      tier: REGISTO_VALIDO.tier,
    });
    expect(r.sucesso).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejeita email já existente no pré-check (sem abrir transação)", async () => {
    mocked(prisma.utilizador.findUnique).mockResolvedValue({ id: "existente" });
    const r = await registar(REGISTO_VALIDO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/email/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("corrida TOCTOU no email (P2002 na transação) → erro limpo, sem propagar", async () => {
    mocked(prisma.$transaction).mockImplementation(() => {
      throw new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
      });
    });
    const r = await registar(REGISTO_VALIDO);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/email/i);
  });
});

// §3.11 / §17.1 (Fase 4) — modo Individual materializado no modelo: clube técnico
// (clubeTecnico=true), licença titulada pela PESSOA (utilizadorId), carteira criada
// e UMA única secção. O ramo Clube não regride (clubeTecnico=false, licença no clube,
// modalidade null).
describe("registar/criarClube — ramo Individual (§3.11)", () => {
  const INDIVIDUAL_VALIDO = {
    nome: "Ana Treinadora",
    email: "ana@clube.pt",
    password: "password123",
    nomeClube: "Escola do Ana",
    tier: "INDIVIDUAL" as const,
    modalidade: "FUTSAL" as const,
  };

  beforeEach(() => {
    // Registo: email livre e utilizador criado com id "user1" na transação.
    mocked(prisma.utilizador.findUnique).mockResolvedValue(null);
    mocked(prisma.utilizador.create).mockResolvedValue({ id: "user1" });
  });

  it("cria o clube com clubeTecnico=true (single source of truth do modo Individual)", async () => {
    const r = await registar(INDIVIDUAL_VALIDO);
    expect(r.sucesso).toBe(true);

    const arg = calls(prisma.clube.create)[0][0] as { data: { clubeTecnico: boolean } };
    expect(arg.data.clubeTecnico).toBe(true);
  });

  it("cria a licença titulada pela PESSOA (utilizadorId), tipo INDIVIDUAL e modalidade registada", async () => {
    await registar(INDIVIDUAL_VALIDO);

    const arg = calls(prisma.licenca.create)[0][0] as {
      data: {
        tipo: string;
        tier: string | null;
        estado: string;
        utilizadorId?: string;
        clubeId?: string;
        modalidade: string | null;
      };
    };
    expect(arg.data.tipo).toBe("INDIVIDUAL");
    expect(arg.data.tier).toBeNull();
    expect(arg.data.estado).toBe("PENDENTE");
    // Titular = utilizadorId; NUNCA clubeId (§3.11 — titular exclusivo).
    expect(arg.data.utilizadorId).toBe("user1");
    expect(arg.data).not.toHaveProperty("clubeId");
    // A modalidade contratada fica registada na licença Individual.
    expect(arg.data.modalidade).toBe("FUTSAL");
  });

  it("cria a Carteira do utilizador na mesma transação", async () => {
    await registar(INDIVIDUAL_VALIDO);

    expect(prisma.carteira.upsert).toHaveBeenCalledOnce();
    const arg = calls(prisma.carteira.upsert)[0][0] as {
      where: { utilizadorId: string };
      create: { utilizadorId: string };
    };
    expect(arg.where.utilizadorId).toBe("user1");
    expect(arg.create.utilizadorId).toBe("user1");
  });

  it("cria UMA única secção, da modalidade escolhida", async () => {
    await registar(INDIVIDUAL_VALIDO);

    expect(prisma.seccao.create).toHaveBeenCalledOnce();
    const arg = calls(prisma.seccao.create)[0][0] as {
      data: { modalidade: string; nome: string };
    };
    expect(arg.data).toMatchObject({ modalidade: "FUTSAL", nome: "Futsal" });
  });

  it("ramo Clube não regride: clubeTecnico=false, licença no clube, modalidade null, sem carteira", async () => {
    const r = await registar({ ...INDIVIDUAL_VALIDO, tier: "MEDIO", modalidade: "FUTEBOL" });
    expect(r.sucesso).toBe(true);

    const clubeArg = calls(prisma.clube.create)[0][0] as { data: { clubeTecnico: boolean } };
    expect(clubeArg.data.clubeTecnico).toBe(false);

    const licArg = calls(prisma.licenca.create)[0][0] as {
      data: { tipo: string; clubeId?: string; utilizadorId?: string; modalidade: string | null };
    };
    expect(licArg.data.tipo).toBe("CLUBE");
    expect(licArg.data.clubeId).toBe("clube1");
    expect(licArg.data).not.toHaveProperty("utilizadorId");
    expect(licArg.data.modalidade).toBeNull();

    // A carteira NÃO é materializada no ramo Clube (é um artefacto do modo Individual).
    expect(prisma.carteira.upsert).not.toHaveBeenCalled();
  });

  it("via criarClube (utilizador autenticado) também materializa o modo Individual", async () => {
    // criarClube valida que o utilizador da sessão existe (o beforeEach deste bloco
    // deixa findUnique a null para o pré-check de email do registo — repor aqui).
    mocked(prisma.utilizador.findUnique).mockResolvedValue({ id: "user1" });

    const r = await criarClube({ nome: "Escola do Ana", tier: "INDIVIDUAL", modalidade: "FUTSAL" });
    expect(r.sucesso).toBe(true);

    const clubeArg = calls(prisma.clube.create)[0][0] as { data: { clubeTecnico: boolean } };
    expect(clubeArg.data.clubeTecnico).toBe(true);
    // Titular da licença = a sessão autenticada ("user1").
    const licArg = calls(prisma.licenca.create)[0][0] as {
      data: { utilizadorId?: string; clubeId?: string };
    };
    expect(licArg.data.utilizadorId).toBe("user1");
    expect(licArg.data).not.toHaveProperty("clubeId");
    expect(prisma.carteira.upsert).toHaveBeenCalledOnce();
  });
});
