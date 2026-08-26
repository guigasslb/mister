// Route Handler — download dos PDFs de analíticos (Dossier do Treinador).
//
// Único ponto REST permitido (além do Auth.js) por servir binário (PDF), que uma
// Server Action não devolve com streaming/attachment. A autenticação, a
// capacidade RELATORIOS_VER e o scoping ao clube/escalão são garantidos dentro
// de `gerarPdfAnalitico` (que delega nas Server Actions dos analíticos).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { gerarPdfAnalitico, type ParamsPdf } from "@/lib/pdf/gerar-pdf";

// `@react-pdf/renderer` precisa do runtime Node (não Edge); o PDF é sempre dinâmico.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("escalao"),
    escalaoId: z.string().cuid(),
    competicao: z.string().cuid().optional(),
  }),
  z.object({ tipo: z.literal("clube") }),
]);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    tipo: sp.get("tipo") ?? undefined,
    escalaoId: sp.get("escalaoId") ?? undefined,
    competicao: sp.get("competicao") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const params: ParamsPdf =
    parsed.data.tipo === "escalao"
      ? {
          tipo: "escalao",
          escalaoId: parsed.data.escalaoId,
          competicaoId: parsed.data.competicao,
        }
      : { tipo: "clube" };

  const resultado = await gerarPdfAnalitico(params);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.erro }, { status: resultado.status });
  }

  return new NextResponse(new Uint8Array(resultado.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${resultado.nomeFicheiro}"`,
      "Cache-Control": "no-store",
    },
  });
}
