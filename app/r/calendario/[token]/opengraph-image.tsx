import { notFound } from "next/navigation";
import { obterCalendarioPublico } from "@/lib/calendario-publico";
import { renderizarImagemCalendario, TAMANHO_IMAGEM } from "@/lib/calendario-publico-imagem";

// Imagem de pré-visualização do link público (§8.11.1). Sob `/r/` (fora do
// matcher do middleware de autenticação), como a própria página.
export const runtime = "nodejs"; // Prisma
export const dynamic = "force-dynamic";
export const alt = "Calendário de jogos";
export const size = TAMANHO_IMAGEM;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ token: string }> | { token: string };
}) {
  const { token } = await params;
  const calendario = await obterCalendarioPublico(token);
  if (!calendario) notFound();
  return renderizarImagemCalendario(calendario);
}
