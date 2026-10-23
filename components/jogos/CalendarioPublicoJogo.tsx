import { ChevronDown, Clock, Home, MapPin, Plane, Trophy, Users } from "lucide-react";
import type { JogoCalendarioPublico } from "@/lib/calendario-publico";
import { TituloConfronto } from "@/components/jogos/TituloConfronto";
import { formatarDataHoraLisboa, partesDataLisboa } from "@/lib/utils-datas";
import { detalheJogoPublico, separarLocal } from "@/lib/calendario-publico-partilha";
import { formatarConcentracao } from "@/lib/concentracao";

// Apresentação de um jogo no calendário público (bíblia §8.11.1). Componentes
// sem estado nem interatividade JS (o expansível é `<details>` nativo) — usáveis
// em Server Components. As cores AA vêm das variáveis `--cal-*` definidas na
// página (`variaveisCorCalendarioPublico`), com fallback no laranja da marca.

/** Anel de foco visível na cor do clube (AA), comum aos interativos da página. */
const FOCO =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cal-solido,#C7430F)] focus-visible:ring-offset-2";

function formatarData(iso: string): string {
  return formatarDataHoraLisboa(iso, { weekday: "short", day: "2-digit", month: "short" });
}

/** "HH:MM"; null para jogos sem hora definida (00:00), como na lista de jogos. */
function formatarHora(iso: string): string | null {
  const { hora, minuto } = partesDataLisboa(iso);
  if (hora === 0 && minuto === 0) return null;
  return formatarDataHoraLisboa(iso, { hour: "2-digit", minute: "2-digit" });
}

/** Local livre: texto (sem URLs) + botão «Ver no mapa» na cor do clube quando há URL http(s). */
export function LocalComMapa({ valor, icone = true }: { valor: string | null; icone?: boolean }) {
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
          aria-label={local.texto ? `Ver no mapa: ${local.texto}` : "Ver no mapa"}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md bg-[color:var(--cal-solido,#C7430F)] px-3 text-corpo-sec font-semibold text-[color:var(--cal-solido-texto,#FFFFFF)] shadow-sm transition hover:brightness-110 ${FOCO}`}
        >
          <MapPin className="h-4 w-4 flex-shrink-0" aria-hidden />
          Ver no mapa
        </a>
      )}
    </>
  );
}

/** Badge «Convocatória» na cor do clube (fundo sólido AA). */
function BadgeConvocatoria() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--cal-solido,#C7430F)] px-2 py-0.5 text-legenda font-semibold text-[color:var(--cal-solido-texto,#FFFFFF)]">
      <Users className="h-3 w-3" aria-hidden />
      Convocatória
    </span>
  );
}

/** Painel expansível (concentração + convocados); só existe se houver conteúdo. */
export function DetalhesJogo({ jogo }: { jogo: JogoCalendarioPublico }) {
  const { concentracao, convocados } = jogo;
  const detalhe = detalheJogoPublico(jogo);
  if (!detalhe.expansivel) return null;
  return (
    <details className="group mt-2 border-t border-cinza-100 pt-1">
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-1 text-corpo-sec font-medium text-cinza-700 [&::-webkit-details-marker]:hidden ${FOCO}`}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {detalhe.temConvocados && <BadgeConvocatoria />}
          <span>{detalhe.rotulo}</span>
        </span>
        <span className="inline-flex flex-shrink-0 items-center gap-1 font-semibold text-[color:var(--cal-acento-texto,#C7430F)]">
          <span className="group-open:hidden">Ver detalhes</span>
          <span className="hidden group-open:inline">Ocultar detalhes</span>
          <ChevronDown
            className="h-4 w-4 flex-shrink-0 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </span>
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
        {convocados && convocados.length > 0 && (
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

export function LinhaJogo({ jogo, clubeNome }: { jogo: JogoCalendarioPublico; clubeNome: string }) {
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
                corClube="var(--cal-acento-texto, #C7430F)"
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
