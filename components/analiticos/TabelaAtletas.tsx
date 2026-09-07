// Tabela detalhada do plantel do escalão (§10.2). Presentacional + filtros/ordenação
// client-side sobre a `tabelaAtletas` já calculada em obterAnaliticoEscalao. Inclui
// TODOS os participantes da época (ativos e histórico) — os filtros permitem focar.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EstadoParticipacao, Posicao } from "@prisma/client";
import type { LinhaAtletaEscalao } from "@/lib/actions/analise";
import { ABREV_POSICAO, LABEL_POSICAO } from "@/lib/schemas/atleta";
import { BadgeEstadoParticipacao } from "@/components/plantel/BadgesParticipacao";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TabelaAtletasProps {
  atletas: LinhaAtletaEscalao[];
  sessoesExecutadas: number;
}

type FiltroEstado = "todos" | "ativo" | "inativo";
type FiltroPosicao = Posicao | "todas";
type Ordenacao = "nome" | "golos" | "presenca";

/** Acento semântico da taxa 0–1 (verde ≥85%, âmbar ≥60%, senão vermelho). */
function corTaxa(taxa: number): { barra: string; texto: string } {
  if (taxa >= 0.85) return { barra: "bg-verde-600", texto: "text-verde-600" };
  if (taxa >= 0.6) return { barra: "bg-ambar-600", texto: "text-ambar-600" };
  return { barra: "bg-vermelho-600", texto: "text-vermelho-600" };
}

export function TabelaAtletas({ atletas, sessoesExecutadas }: TabelaAtletasProps) {
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [filtroPosicao, setFiltroPosicao] = useState<FiltroPosicao>("todas");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("nome");

  // Posições presentes nos atletas da lista (só estas surgem no filtro).
  const posicoesDisponiveis = useMemo(
    () => [...new Set(atletas.flatMap((a) => a.posicoes))].sort(),
    [atletas],
  );

  const atletasFiltrados = useMemo(
    () =>
      atletas
        .filter((a) => {
          const eAtivo = a.estadoParticipacao === "ATIVO" && a.atletaAtivo;
          if (filtroEstado === "ativo" && !eAtivo) return false;
          if (filtroEstado === "inativo" && eAtivo) return false;
          if (filtroPosicao !== "todas" && !a.posicoes.includes(filtroPosicao))
            return false;
          return true;
        })
        .sort((x, y) => {
          if (ordenacao === "golos") return y.golos - x.golos;
          if (ordenacao === "presenca") return y.taxaPresenca - x.taxaPresenca;
          return x.nome.localeCompare(y.nome, "pt");
        }),
    [atletas, filtroEstado, filtroPosicao, ordenacao],
  );

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="filtro-estado" className="text-legenda text-cinza-500">
            Estado
          </Label>
          <Select
            value={filtroEstado}
            onValueChange={(v) => setFiltroEstado(v as FiltroEstado)}
          >
            <SelectTrigger id="filtro-estado" className="h-10 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filtro-posicao" className="text-legenda text-cinza-500">
            Posição
          </Label>
          <Select
            value={filtroPosicao}
            onValueChange={(v) => setFiltroPosicao(v as FiltroPosicao)}
          >
            <SelectTrigger id="filtro-posicao" className="h-10 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {posicoesDisponiveis.map((p) => (
                <SelectItem key={p} value={p}>
                  {LABEL_POSICAO[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ordenacao" className="text-legenda text-cinza-500">
            Ordenar por
          </Label>
          <Select
            value={ordenacao}
            onValueChange={(v) => setOrdenacao(v as Ordenacao)}
          >
            <SelectTrigger id="ordenacao" className="h-10 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nome">Nome</SelectItem>
              <SelectItem value="golos">Golos</SelectItem>
              <SelectItem value="presenca">Taxa de presença</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela */}
      {atletasFiltrados.length === 0 ? (
        <div className="rounded-lg border border-cinza-200 bg-white p-8 text-center">
          <p className="text-corpo-sec text-cinza-500">
            Nenhum atleta corresponde aos filtros.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-cinza-200 bg-white">
          <table className="w-full text-corpo-sec">
            <thead>
              <tr className="border-b border-cinza-200 text-left text-legenda uppercase tracking-wide text-cinza-500">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-3 py-3 font-medium">Posição</th>
                <th className="px-3 py-3 font-medium">Estado</th>
                <th className="px-3 py-3 text-right font-medium">Presenças</th>
                <th className="px-3 py-3 font-medium">Taxa</th>
                <th className="px-3 py-3 text-right font-medium">Golos</th>
                <th className="px-3 py-3 text-right font-medium">Assist.</th>
                <th className="px-3 py-3 text-right font-medium">Jogos</th>
                <th className="px-5 py-3 text-right font-medium">Tempo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cinza-100">
              {atletasFiltrados.map((a) => {
                // Estado efetivo: um atleta globalmente inativo aparece como INATIVO,
                // em coerência com `eAtivo` da filtragem (evita badge "Ativo" enganador).
                const estadoEfetivo: EstadoParticipacao = a.atletaAtivo
                  ? a.estadoParticipacao
                  : "INATIVO";
                const cor = corTaxa(a.taxaPresenca);
                const taxaPct = Math.round(a.taxaPresenca * 100);
                return (
                  <tr
                    key={a.atletaId}
                    className="text-cinza-900 transition-colors hover:bg-cinza-50"
                  >
                    <td className="px-5 py-3 font-medium">
                      <Link
                        href={`/plantel/${a.atletaId}`}
                        className="text-cinza-900 hover:text-primary hover:underline"
                      >
                        {a.nome}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-cinza-600">
                      {a.posicoes.length > 0
                        ? a.posicoes.map((p) => ABREV_POSICAO[p]).join(" · ")
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <BadgeEstadoParticipacao estado={estadoEfetivo} />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-cinza-700">
                      {a.presencas}/{sessoesExecutadas}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 w-16 overflow-hidden rounded-full bg-cinza-100"
                          role="progressbar"
                          aria-valuenow={taxaPct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Taxa de presença de ${a.nome}`}
                        >
                          <div
                            className={`h-full rounded-full ${cor.barra}`}
                            style={{ width: `${taxaPct}%` }}
                          />
                        </div>
                        <span className={`tabular-nums font-medium ${cor.texto}`}>
                          {taxaPct}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold">
                      {a.golos}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {a.assistencias}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {a.jogosUtilizados}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-cinza-700">
                      {a.tempoJogo} min
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
