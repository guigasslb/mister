"use client";

import { Footprints, Goal, MoreHorizontal, RectangleVertical } from "lucide-react";
import { ABREV_POSICAO } from "@/lib/schemas/atleta";
import type { Posicao } from "@prisma/client";

/** Atleta apresentado numa das listas (campo/banco). */
export interface AtletaAoVivo {
  id: string;
  nome: string;
  numero: number | null;
  posicao?: Posicao | null;
  /** Minutos jogados até ao segundo corrente (para o cartão). */
  minutos: number;
  /** Golos marcados por este atleta neste jogo (§8.25.3/§8.25.7). */
  golos: number;
  /** Assistências dadas por este atleta neste jogo (§8.25.3/§8.25.7). */
  assistencias: number;
  /** Cartões amarelos deste atleta neste jogo (§8.25.3/§8.25.7). */
  cartoesAmarelos: number;
}

/**
 * Selos de estatística do atleta **neste jogo** (§8.25.3/§8.25.7), derivados dos
 * eventos já registados no Modo Jogo ao Vivo: golos marcados, assistências e
 * cartões amarelos. Cada selo só aparece quando a contagem é > 0 (ecrã limpo em
 * beira-campo). Sem persistência nova — é leitura dos eventos existentes.
 */
function IndicadoresAtleta({ atleta }: { atleta: AtletaAoVivo }) {
  const { golos, assistencias, cartoesAmarelos } = atleta;
  if (golos === 0 && assistencias === 0 && cartoesAmarelos === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {golos > 0 && (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-white/10 px-1.5 py-0.5 tabular-nums"
          title={golos === 1 ? "1 golo" : `${golos} golos`}
          aria-label={golos === 1 ? "1 golo" : `${golos} golos`}
        >
          <Goal className="h-3 w-3 text-primary" aria-hidden />
          {golos}
        </span>
      )}
      {assistencias > 0 && (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-white/10 px-1.5 py-0.5 tabular-nums"
          title={assistencias === 1 ? "1 assistência" : `${assistencias} assistências`}
          aria-label={assistencias === 1 ? "1 assistência" : `${assistencias} assistências`}
        >
          <Footprints className="h-3 w-3 text-white/80" aria-hidden />
          {assistencias}
        </span>
      )}
      {cartoesAmarelos > 0 && (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-white/10 px-1.5 py-0.5 tabular-nums"
          title={cartoesAmarelos === 1 ? "1 cartão amarelo" : `${cartoesAmarelos} cartões amarelos`}
          aria-label={
            cartoesAmarelos === 1 ? "1 cartão amarelo" : `${cartoesAmarelos} cartões amarelos`
          }
        >
          <RectangleVertical className="h-3 w-3 fill-ambar-500 text-ambar-500" aria-hidden />
          {cartoesAmarelos}
        </span>
      )}
    </span>
  );
}

/**
 * Vista de campo do Modo Jogo ao Vivo (§8.25.3). Mostra quem está **em campo**
 * (N slots = tamanho do formato) e quem está no **banco**. Tocar num jogador em
 * campo abre o menu de ações (golo, cartão ou substituição — Fase B); tocar no
 * banco não faz nada. Cada cartão mostra nome + número + tempo em campo, com uma
 * dica de descoberta ("Toca para golo, cartão ou substituição") para que o
 * treinador perceba o gesto sem instruções.
 */
export function CampoAoVivo({
  emCampo,
  banco,
  onTapEmCampo,
  interativo,
}: {
  emCampo: AtletaAoVivo[];
  banco: AtletaAoVivo[];
  onTapEmCampo: (atletaId: string) => void;
  /** Quando false (jogo terminado/por iniciar), os cartões não reagem ao toque. */
  interativo: boolean;
}) {
  return (
    <div className="space-y-5">
      <section aria-label="Em campo">
        <h2 className="mb-1 flex items-center gap-2 text-corpo-sec font-semibold uppercase tracking-wide text-white/70">
          Em campo
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-legenda tabular-nums text-white/80">
            {emCampo.length}
          </span>
        </h2>
        {interativo && emCampo.length > 0 && (
          <p className="mb-2 text-legenda text-white/50">
            Toca num jogador para registar golo, cartão ou substituição.
          </p>
        )}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {emCampo.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={!interativo}
                onClick={() => onTapEmCampo(a.id)}
                className="group flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-3 text-left transition active:scale-[0.97] active:border-primary active:bg-primary/25 enabled:hover:border-white/40 enabled:hover:bg-white/15 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                aria-label={`Ações de ${a.nome}: golo, cartão ou substituição`}
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-corpo-sec font-bold text-white tabular-nums">
                  {a.numero ?? "–"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-corpo font-semibold text-white">
                    {a.nome}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 gap-y-1 text-legenda text-white/70">
                    {a.posicao && (
                      <span className="rounded bg-white/15 px-1.5 py-0.5 font-medium">
                        {ABREV_POSICAO[a.posicao]}
                      </span>
                    )}
                    <span className="tabular-nums">{a.minutos}′</span>
                    <IndicadoresAtleta atleta={a} />
                  </span>
                </span>
                {interativo && (
                  <span
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/60 transition group-hover:border-white/50 group-hover:text-white group-active:border-primary group-active:text-white"
                    aria-hidden
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Banco">
        <h2 className="mb-2 flex items-center gap-2 text-corpo-sec font-semibold uppercase tracking-wide text-white/70">
          Banco
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-legenda tabular-nums text-white/80">
            {banco.length}
          </span>
        </h2>
        {banco.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/20 p-3 text-center text-corpo-sec text-white/50">
            Ninguém no banco.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {banco.map((a) => (
              <li
                key={a.id}
                className="flex min-h-[56px] items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-legenda font-bold text-white/90 tabular-nums">
                  {a.numero ?? "–"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-corpo-sec font-medium text-white/90">
                    {a.nome}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 gap-y-1 text-legenda text-white/50">
                    <span className="tabular-nums">{a.minutos}′ jogados</span>
                    <IndicadoresAtleta atleta={a} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
