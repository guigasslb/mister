import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Route Handler dos relatórios imprimíveis: mapeamento dos parâmetros de query.
vi.mock("@/lib/pdf/gerar-pdf", () => ({ gerarPdfAnalitico: vi.fn() }));

import { GET } from "@/app/api/pdf/route";
import { gerarPdfAnalitico } from "@/lib/pdf/gerar-pdf";

const gerar = gerarPdfAnalitico as unknown as ReturnType<typeof vi.fn>;
const ESC = "ckv9v0z1w0000abcd1234efga";
const COMP = "ckv9v0z1w0000abcd1234efgb";
const EQ = "ckv9v0z1w0000abcd1234efgc";

const pedir = (query: string) => GET(new NextRequest(`http://localhost/api/pdf?${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  gerar.mockResolvedValue({ ok: true, html: "<html></html>", titulo: "t" });
});

describe("GET /api/pdf — filtro «Equipa» (§23.11.3 regra 10)", () => {
  it("passa `equipa` ao gerador como equipaCompeticaoId", async () => {
    const res = await pedir(`tipo=escalao&escalaoId=${ESC}&competicao=${COMP}&equipa=${EQ}`);
    expect(res.status).toBe(200);
    expect(gerar).toHaveBeenCalledWith({
      tipo: "escalao",
      escalaoId: ESC,
      competicaoId: COMP,
      equipaCompeticaoId: EQ,
    });
  });

  it("zero-regressão: sem `equipa` o filtro fica ausente", async () => {
    await pedir(`tipo=escalao&escalaoId=${ESC}&competicao=${COMP}`);
    expect(gerar).toHaveBeenCalledWith({
      tipo: "escalao",
      escalaoId: ESC,
      competicaoId: COMP,
      equipaCompeticaoId: undefined,
    });
  });

  it("rejeita `equipa` que não é cuid com 400", async () => {
    const res = await pedir(`tipo=escalao&escalaoId=${ESC}&equipa=nao-cuid`);
    expect(res.status).toBe(400);
    expect(gerar).not.toHaveBeenCalled();
  });
});
