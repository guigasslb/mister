import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { obterCalendarioPublico } from "@/lib/calendario-publico";
import { LinhaJogo, PlantelSubequipas } from "@/components/jogos/CalendarioPublicoJogo";
import { LogoIcon } from "@/components/layout/Logo";
import {
  abreviarNomeClube,
  descricaoCalendarioPublico,
  resolverUrlBase,
  tituloCalendarioPublico,
  variaveisCorCalendarioPublico,
} from "@/lib/calendario-publico-partilha";
import { caminhoCalendarioPublico } from "@/lib/schemas/calendario-publico";

// Calendário público de jogos do escalão (bíblia §8.11.1). Só-de-leitura, sem
// autenticação (prefixo `/r/` fora do matcher do middleware), sem navegação para
// a app e sem indexação. Lido sempre da BD: revogar/regenerar tem efeito imediato.
export const dynamic = "force-dynamic";

const ROBOTS: Metadata["robots"] = { index: false, follow: false };

/** Uma só leitura por pedido, partilhada por `generateMetadata` e pela página. */
const obterCalendario = cache((token: string) => obterCalendarioPublico(token));

// Pré-visualização do link (WhatsApp, iMessage, Telegram…): título, descrição e
// Open Graph/Twitter com URL absoluta. A imagem vem de `opengraph-image.tsx`
// (o Next acrescenta `og:image`/`twitter:image` resolvidos contra `metadataBase`).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const calendario = await obterCalendario(token);
  if (!calendario) return { title: { absolute: "Calendário de jogos" }, robots: ROBOTS };

  const h = await headers();
  const metadataBase = resolverUrlBase({
    envUrl: process.env.NEXTAUTH_URL ?? process.env.AUTH_URL,
    host: h.get("x-forwarded-host") ?? h.get("host"),
    proto: h.get("x-forwarded-proto"),
  });
  const titulo = tituloCalendarioPublico(calendario);
  const descricao = descricaoCalendarioPublico(calendario);
  const url = caminhoCalendarioPublico(token);

  return {
    ...(metadataBase ? { metadataBase } : {}),
    title: { absolute: titulo },
    description: descricao,
    robots: ROBOTS,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "Mister",
      locale: "pt_PT",
      url,
      title: titulo,
      description: descricao,
    },
    twitter: { card: "summary_large_image", title: titulo, description: descricao },
  };
}

export default async function CalendarioPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const calendario = await obterCalendario(token);
  if (!calendario) notFound();

  const { clube, escalao, epoca, proximos, realizados, equipas } = calendario;
  const estiloClube = {
    "--cor-primaria": clube.corPrimaria,
    ...variaveisCorCalendarioPublico(clube.corPrimaria),
  } as React.CSSProperties;
  const semJogos = proximos.length === 0 && realizados.length === 0;

  return (
    <main className="min-h-screen bg-cinza-50 py-8" style={estiloClube}>
      <div className="mx-auto max-w-[760px] px-4">
        <header className="mb-6 overflow-hidden rounded-xl border border-cinza-200 bg-white shadow-card">
          <div className="h-2" style={{ backgroundColor: "var(--cor-primaria, #F0531E)" }} />
          <div className="flex items-center gap-4 p-5">
            {clube.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clube.logoUrl}
                alt=""
                aria-hidden
                className="h-14 w-14 flex-shrink-0 rounded-lg object-contain"
              />
            ) : (
              <span
                className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg text-titulo-seccao font-bold text-white"
                style={{ backgroundColor: "var(--cor-primaria, #F0531E)" }}
                aria-hidden
              >
                {clube.nome.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-legenda uppercase tracking-wide text-cinza-500">
                {abreviarNomeClube(clube.nome)}
              </p>
              <h1 className="leading-tight">Calendário de jogos</h1>
              <p className="mt-0.5 text-corpo-sec text-cinza-600">
                {escalao.nome}
                {epoca ? ` · Época ${epoca.nome}` : ""}
              </p>
            </div>
          </div>
        </header>

        {equipas.length > 0 && (
          <div className="mb-8">
            <PlantelSubequipas equipas={equipas} />
          </div>
        )}

        {semJogos ? (
          <p className="rounded-lg border border-dashed border-cinza-300 bg-white p-6 text-center text-corpo-sec text-cinza-500">
            Sem jogos agendados nesta época.
          </p>
        ) : (
          <div className="space-y-8">
            {proximos.length > 0 && (
              <section aria-labelledby="proximos-jogos">
                <h2 id="proximos-jogos" className="mb-3 text-titulo-seccao text-cinza-900">
                  Próximos jogos
                </h2>
                <ul className="space-y-3">
                  {proximos.map((j, i) => (
                    <LinhaJogo key={`p-${i}`} jogo={j} clubeNome={clube.nome} />
                  ))}
                </ul>
              </section>
            )}
            {realizados.length > 0 && (
              <section aria-labelledby="jogos-realizados">
                <h2 id="jogos-realizados" className="mb-3 text-titulo-seccao text-cinza-900">
                  Jogos realizados
                </h2>
                <ul className="space-y-3">
                  {realizados.map((j, i) => (
                    <LinhaJogo key={`r-${i}`} jogo={j} clubeNome={clube.nome} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <p className="mt-8 flex items-center justify-center gap-2 text-legenda text-cinza-400">
          <LogoIcon size={18} />
          Calendário partilhado com Mister
        </p>
      </div>
    </main>
  );
}
