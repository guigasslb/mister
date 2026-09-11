import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// §17.5 — infra de email transacional (Resend, best-effort).
//
// O SDK `resend` é mockado: não há chamadas de rede. Verificamos o contrato:
//  (i)  com RESEND_API_KEY → chama o cliente com os campos certos e devolve enviado;
//  (ii) sem RESEND_API_KEY → não rebenta e devolve resultado "não enviado".

const { sendMock, ResendCtor } = vi.hoisted(() => {
  const sendMock = vi.fn();
  const ResendCtor = vi.fn(() => ({ emails: { send: sendMock } }));
  return { sendMock, ResendCtor };
});

vi.mock("resend", () => ({ Resend: ResendCtor }));

// Importado após o mock estar registado (o SDK é instanciado dentro de enviarEmail).
import { enviarEmail } from "@/lib/email/resend";
import {
  emailNovoRegisto,
  emailContaAtivada,
  obterEmailAdmin,
} from "@/lib/email/templates";

const AMBIENTE = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...AMBIENTE };
  sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null });
});

afterEach(() => {
  process.env = AMBIENTE;
});

describe("enviarEmail — com RESEND_API_KEY", () => {
  it("instancia o Resend com a chave e envia com os campos certos", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Mister <no-reply@mister.app>";

    const resultado = await enviarEmail({
      para: "treinador@clube.pt",
      assunto: "Assunto de teste",
      html: "<p>Olá</p>",
      texto: "Olá",
    });

    expect(ResendCtor).toHaveBeenCalledWith("re_test_key");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      from: "Mister <no-reply@mister.app>",
      to: "treinador@clube.pt",
      subject: "Assunto de teste",
      html: "<p>Olá</p>",
      text: "Olá",
    });
    expect(resultado).toEqual({ enviado: true, id: "email_123" });
  });

  it("usa o remetente fallback da marca quando EMAIL_FROM está ausente", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    delete process.env.EMAIL_FROM;

    await enviarEmail({ para: "a@b.pt", assunto: "X", html: "<p>x</p>" });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Mister <no-reply@mister.app>" }),
    );
  });

  it("devolve não enviado (erro) quando o Resend recusa, sem rebentar", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "domínio não verificado" },
    });

    const resultado = await enviarEmail({
      para: "a@b.pt",
      assunto: "X",
      html: "<p>x</p>",
    });

    expect(resultado).toEqual({
      enviado: false,
      motivo: "erro",
      detalhe: "domínio não verificado",
    });
  });

  it("não propaga exceções do SDK (best-effort)", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    sendMock.mockRejectedValueOnce(new Error("rede indisponível"));

    const resultado = await enviarEmail({
      para: "a@b.pt",
      assunto: "X",
      html: "<p>x</p>",
    });

    expect(resultado).toMatchObject({ enviado: false, motivo: "erro" });
  });
});

describe("enviarEmail — sem RESEND_API_KEY (degradação graciosa)", () => {
  it("não rebenta, não chama o cliente e devolve 'sem_configuracao'", async () => {
    delete process.env.RESEND_API_KEY;
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await enviarEmail({
      para: "a@b.pt",
      assunto: "X",
      html: "<p>x</p>",
    });

    expect(sendMock).not.toHaveBeenCalled();
    expect(resultado).toEqual({ enviado: false, motivo: "sem_configuracao" });
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });
});

describe("templates PT-PT", () => {
  it("novo registo: assunto com o clube e todos os dados no corpo", () => {
    const { assunto, html, texto } = emailNovoRegisto({
      nome: "Ana Silva",
      email: "ana@clube.pt",
      clube: "CF Exemplo",
      plano: "Clube Médio",
      modalidade: "Futsal + Futebol",
    });

    expect(assunto).toBe("Novo registo — CF Exemplo");
    for (const valor of ["Ana Silva", "ana@clube.pt", "CF Exemplo", "Clube Médio", "Futsal + Futebol"]) {
      expect(html).toContain(valor);
      expect(texto).toContain(valor);
    }
    expect(texto).toContain("aguardar o comprovativo de pagamento");
  });

  it("novo registo: escapa HTML dos valores fornecidos", () => {
    const { html } = emailNovoRegisto({
      nome: "<script>x</script>",
      email: "a@b.pt",
      clube: "Clube & Cª",
      plano: "Individual",
      modalidade: "Futsal",
    });

    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Clube &amp; Cª");
  });

  it("conta ativada: assunto exato do FAQ e link de entrada", () => {
    const { assunto, html, texto } = emailContaAtivada({
      nome: "Ana",
      email: "ana@clube.pt",
      urlApp: "https://app.mister.pt",
    });

    expect(assunto).toBe("A tua conta Mister está pronta");
    expect(html).toContain("https://app.mister.pt/login");
    expect(texto).toContain("https://app.mister.pt/login");
    expect(html).toContain("ana@clube.pt");
  });

  it("obterEmailAdmin: usa ADMIN_EMAIL, com fallback documentado", () => {
    const anterior = process.env.ADMIN_EMAIL;

    process.env.ADMIN_EMAIL = "backoffice@mister.app";
    expect(obterEmailAdmin()).toBe("backoffice@mister.app");

    delete process.env.ADMIN_EMAIL;
    expect(obterEmailAdmin()).toBe("goncalo.pereira.1992@gmail.com");

    if (anterior !== undefined) process.env.ADMIN_EMAIL = anterior;
  });
});
