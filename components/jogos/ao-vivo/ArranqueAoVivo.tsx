"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Play, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LABEL_POSICAO, posicoesPorModalidade } from "@/lib/schemas/atleta";
import type { Modalidade, Posicao } from "@prisma/client";
import type { ConvocadoAoVivo } from "@/components/jogos/ao-vivo/JogoAoVivo";

/**
 * Ecrã de arranque do Modo Jogo ao Vivo (§8.25.3, passo 1). O treinador escolhe
 * os titulares (nº exato = tamanho do formato — RN-JV-1), atribui posições e toca
 * «Iniciar Parte 1». O nº de partes já não se escolhe aqui: é herdado do jogo
 * (§8.25.8). O arranque vem **pré-carregado** com os titulares/posições do plano
 * tático (`titularesIniciais`), se existir; senão fica vazio (pool de convocados).
 * Se houver menos convocados que o tamanho do formato, o arranque fica bloqueado
 * (RN-JV-1) com um CTA para a convocatória.
 */
export function ArranqueAoVivo({
  convocados,
  tamanhoFormato,
  titularesIniciais,
  modalidade,
  jogoId,
  onIniciar,
}: {
  convocados: ConvocadoAoVivo[];
  tamanhoFormato: number;
  /** Pré-seleção vinda do plano tático (titulares + posições previstas). */
  titularesIniciais: { atletaId: string; posicao: Posicao | null }[];
  modalidade: Modalidade;
  jogoId: string;
  onIniciar: (titulares: { atletaId: string; posicao: Posicao | null }[]) => void;
}) {
  const [selecionados, setSelecionados] = useState<Map<string, Posicao | null>>(
    () => {
      // Arranque pré-carregado do plano tático: só considera atletas que ainda
      // constam do pool de convocados e respeita o tamanho do formato.
      const idsConvocados = new Set(convocados.map((c) => c.id));
      const inicial = new Map<string, Posicao | null>();
      for (const t of titularesIniciais) {
        if (inicial.size >= tamanhoFormato) break;
        if (idsConvocados.has(t.atletaId)) inicial.set(t.atletaId, t.posicao);
      }
      return inicial;
    },
  );

  const posicoesDisponiveis = posicoesPorModalidade(modalidade);
  const convocadosInsuficientes = convocados.length < tamanhoFormato;
  const completo = selecionados.size === tamanhoFormato;

  function alternar(atleta: ConvocadoAoVivo) {
    setSelecionados((prev) => {
      const novo = new Map(prev);
      if (novo.has(atleta.id)) {
        novo.delete(atleta.id);
      } else if (novo.size < tamanhoFormato) {
        novo.set(atleta.id, atleta.posicoes[0] ?? null);
      }
      return novo;
    });
  }

  function definirPosicao(atletaId: string, posicao: Posicao | null) {
    setSelecionados((prev) => new Map(prev).set(atletaId, posicao));
  }

  function iniciar() {
    if (!completo) return;
    const titulares = [...selecionados.entries()].map(([atletaId, posicao]) => ({
      atletaId,
      posicao,
    }));
    onIniciar(titulares);
  }

  if (convocadosInsuficientes) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-white/15 bg-white/5 p-6 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-ambar-500" aria-hidden />
        <h2 className="mt-3 text-subtitulo text-white">Convocados insuficientes</h2>
        <p className="mt-1 text-corpo-sec text-white/70">
          Este formato precisa de {tamanhoFormato} jogadores em campo, mas só há{" "}
          {convocados.length} convocado(s). Ajusta a convocatória antes de iniciar.
        </p>
        <Button asChild className="mt-4">
          <Link href={`/jogos/${jogoId}`}>
            <Users className="h-4 w-4" />
            Ir à convocatória
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="text-subtitulo text-white">Titulares e posições</h2>
        <p className="text-corpo-sec text-white/70">
          Escolhe {tamanhoFormato} titulares.{" "}
          <span className="tabular-nums">
            {selecionados.size}/{tamanhoFormato}
          </span>{" "}
          selecionado(s).
        </p>
      </div>

      <ul className="space-y-2">
        {convocados.map((a) => {
          const escolhido = selecionados.has(a.id);
          const posicao = selecionados.get(a.id) ?? null;
          const bloqueado = !escolhido && selecionados.size >= tamanhoFormato;
          return (
            <li
              key={a.id}
              className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 transition ${
                escolhido
                  ? "border-primary bg-primary/15"
                  : "border-white/15 bg-white/5"
              } ${bloqueado ? "opacity-40" : ""}`}
            >
              <button
                type="button"
                onClick={() => alternar(a)}
                disabled={bloqueado}
                className="flex min-h-[44px] flex-1 items-center gap-3 text-left focus-visible:outline-none"
                aria-pressed={escolhido}
              >
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border ${
                    escolhido
                      ? "border-primary bg-primary text-white"
                      : "border-white/30"
                  }`}
                >
                  {escolhido && <Check className="h-4 w-4" aria-hidden />}
                </span>
                <span className="text-corpo text-white">
                  {a.numero != null && <span className="text-white/50">#{a.numero} </span>}
                  {a.nome}
                  {a.eGR && <span className="ml-1 text-legenda text-white/50">(GR)</span>}
                </span>
              </button>
              {escolhido && (
                <Select
                  value={posicao ?? "none"}
                  onValueChange={(v) =>
                    definirPosicao(a.id, v === "none" ? null : (v as Posicao))
                  }
                >
                  <SelectTrigger className="h-10 w-44 border-white/20 bg-white/10 text-white">
                    <SelectValue placeholder="Posição" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— sem posição —</SelectItem>
                    {posicoesDisponiveis.map((p) => (
                      <SelectItem key={p} value={p}>
                        {LABEL_POSICAO[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </li>
          );
        })}
      </ul>

      <Button
        onClick={iniciar}
        disabled={!completo}
        className="min-h-[52px] w-full text-corpo"
      >
        <Play className="h-5 w-5" />
        Iniciar Parte 1
      </Button>
    </div>
  );
}
