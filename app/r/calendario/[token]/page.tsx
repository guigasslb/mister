import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ChevronDown, Clock, Home, MapPin, Plane, Trophy, Users } from "lucide-react";
import { obterCalendarioPublico, type JogoCalendarioPublico } from "@/lib/calendario-publico";
import { TituloConfronto } from "@/components/jogos/TituloConfronto";
import { LogoIcon } from "@/components/layout/Logo";
import { formatarDataHoraLisboa, partesDataLisboa } from "@/lib/utils-datas";
import {
  descricaoCalendarioPublico,
  separarLocal,
  resolverUrlBase,
  tituloCalendarioPublico,
} from "@/lib/calendario-publico-partilha";
import { caminhoCalendarioPublico } from "@/lib/schemas/calendario-publico";
import { formatarConcentracao } from "@/lib/concentracao";

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

function formatarData(iso: string): string {
  return formatarDataHoraLisboa(iso, { weekday: "short", day: "2-digit", month: "short" });
}

/** "HH:MM"; null para jogos sem hora definida (00:00), como na lista de jogos. */
function formatarHora(iso: string): string | null {
  const { hora, minuto } = partesDataLisboa(iso);
  if (hora === 0 && minuto === 0) return null;
  return formatarDataHoraLisboa(iso, { hour: "2-digit", minute: "2-digit" });
}

/** Local livre: texto (sem URLs) + link discreto «Ver no mapa» quando há URL http(s). */
function LocalComMapa({ valor, icone = true }: { valor: string | null; icone?: boolean }) {
  const local = separarLocal(valor);
  return (
    <>
      {local.texto && (
        <span className="inline-flex items-center gap-1">
          {icone && !local.mapaUrl && <MapPin className="h-3.5 w-3.5" aria-hidden />}
          {local.texto}
        </span>
      )}
      {local.mapaUrl && (
        <a
          href={local.mapaUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 font-medium text-cinza-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          Ver no mapa
        </a>
      )}
    </>
  );
}

/** Painel expansível (concentração + convocados); só existe se houver conteúdo. */
function DetalhesJogo({ jogo }: { jogo: JogoCalendarioPublico }) {
  const { concentracao, convocados } = jogo;
  if (!concentracao && !convocados) return null;
  const rotulo = [concentracao && "Concentração", convocados && "Convocados"]
    .filter(Boolean)
    .join(" e ");
  return (
    <details className="group mt-2 border-t border-cinza-100 pt-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-1 text-corpo-sec font-medium text-cinza-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {rotulo}
        <ChevronDown
          className="h-4 w-4 flex-shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-3 px-1 pb-2 pt-1 text-corpo-sec text-cinza-700">
        {concentracao && (
          <div>
            <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
              Concentração
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {concentracao.hora && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {formatarConcentracao(concentracao.hora, jogo.data)}
                </span>
              )}
              <LocalComMapa valor={concentracao.local} />
            </p>
          </div>
        )}
        {convocados && (
          <div>
            <p className="inline-flex items-center gap-1 text-legenda font-medium uppercase tracking-wide text-cinza-500">
              <Users className="h-3.5 w-3.5" aria-hidden />
              Convocados ({convocados.length})
            </p>
            <ul className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {convocados.map((c, i) => (
                <li key={i}>
                  {c.nome}
                  {c.numero != null ? ` · ${c.numero}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function LinhaJogo({ jogo, clubeNome }: { jogo: JogoCalendarioPublico; clubeNome: string }) {
  const hora = formatarHora(jogo.data);
  return (
    <li
      className="rounded-lg border border-l-4 border-cinza-200 bg-white p-4 shadow-card"
      style={{ borderLeftColor: "var(--cor-primaria, #F0531E)" }}
    >
      <div className="flex items-center gap-4">
        <div className="flex w-20 flex-shrink-0 flex-col items-center text-center">
          <span className="text-legenda font-medium capitalize text-cinza-700">
            {formatarData(jogo.data)}
          </span>
          {hora && <span className="text-legenda text-cinza-500">{hora}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-corpo font-semibold text-cinza-900">
              <TituloConfronto
                clubeNome={clubeNome}
                adversario={jogo.adversario}
                casaFora={jogo.casaFora}
              />
            </p>
            {jogo.equipa && (
              <span className="rounded-full bg-cinza-100 px-2 py-0.5 text-legenda font-medium text-cinza-700">
                {jogo.equipa}
              </span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-legenda text-cinza-500">
            <span className="inline-flex items-center gap-1">
              {jogo.casaFora === "CASA" ? (
                <Home className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Plane className="h-3.5 w-3.5" aria-hidden />
              )}
              {jogo.casaFora === "CASA" ? "Casa" : "Fora"}
            </span>
            <LocalComMapa valor={jogo.local} />
            {jogo.competicao && (
              <span className="inline-flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5" aria-hidden />
                {jogo.competicao}
              </span>
            )}
          </p>
        </div>
        {jogo.resultado && (
          <div
            className="text-titulo-seccao font-bold text-cinza-900"
            aria-label={`Resultado ${jogo.resultado.marcados}–${jogo.resultado.sofridos}`}
          >
            {jogo.resultado.marcados}–{jogo.resultado.sofridos}
          </div>
        )}
      </div>
      <DetalhesJogo jogo={jogo} />
    </li>
  );
}

export default async function CalendarioPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const calendario = await obterCalendario(token);
  if (!calendario) notFound();

  const { clube, escalao, epoca, proximos, realizados } = calendario;
  const estiloClube = { "--cor-primaria": clube.corPrimaria } as React.CSSProperties;
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
              <p className="text-legenda uppercase tracking-wide text-cinza-500">{clube.nome}</p>
              <h1 className="leading-tight">Calendário de jogos</h1>
              <p className="mt-0.5 text-corpo-sec text-cinza-600">
                {escalao.nome}
                {epoca ? ` · Época ${epoca.nome}` : ""}
              </p>
            </div>
          </div>
        </header>

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
