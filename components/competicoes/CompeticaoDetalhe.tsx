"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  CompeticaoDetalhe as CompeticaoDetalheTipo,
  LinhaClassificacao,
} from "@/lib/actions/competicoes";
import { LABEL_FORMATO_COMPETICAO, LABEL_AMBITO_COMPETICAO } from "@/lib/schemas/competicao";
import { LABEL_TIPO_JOGO } from "@/lib/schemas/jogo";
import { formatarDataCurta } from "@/lib/comunicacao-utils";
import { CompeticaoForm } from "@/components/competicoes/CompeticaoForm";
import { ResultadoExternoForm } from "@/components/competicoes/ResultadoExternoForm";
import { TabelaClassificacao } from "@/components/competicoes/TabelaClassificacao";
import { QuadroAgendamento } from "@/components/competicoes/QuadroAgendamento";
import { ApagarCompeticaoDialog } from "@/components/competicoes/ApagarCompeticaoDialog";
import { GestaoEquipas } from "@/components/competicoes/GestaoEquipas";
import type {
  AtletaEscalaoPlantel,
  PlantelAtual,
} from "@/components/competicoes/PlanteisSubequipas";
import { confrontoComPlacarDivergente } from "@/lib/subequipas-ui";

type EscalaoBasico = { id: string; nome: string };
type EpocaBasica = { id: string; nome: string; ativa: boolean };

export function CompeticaoDetalhe({
  competicao,
  classificacao,
  escaloes,
  epocas,
  planteis,
  atletasEscalao,
  competicoesOrigem,
}: {
  competicao: CompeticaoDetalheTipo;
  classificacao: LinhaClassificacao[];
  escaloes: EscalaoBasico[];
  epocas: EpocaBasica[];
  /** §23.11: plantéis das subequipas (só com ≥2 equipas próprias). */
  planteis?: PlantelAtual[];
  atletasEscalao?: AtletaEscalaoPlantel[];
  competicoesOrigem?: { id: string; nome: string }[];
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/5">
            <Trophy className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1">
            <h1>{competicao.nome}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{LABEL_FORMATO_COMPETICAO[competicao.formato]}</Badge>
              <Badge variant="secondary">{LABEL_TIPO_JOGO[competicao.tipo]}</Badge>
              <Badge variant="outline">{LABEL_AMBITO_COMPETICAO[competicao.ambito]}</Badge>
              <span className="text-corpo-sec text-cinza-600">{competicao.escalao.nome}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CompeticaoForm
            escaloes={escaloes}
            epocas={epocas}
            competicao={{
              id: competicao.id,
              nome: competicao.nome,
              tipo: competicao.tipo,
              formato: competicao.formato,
              escalaoId: competicao.escalaoId,
              epocaId: competicao.epocaId,
            }}
            trigger={
              <Button variant="outline">
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            }
          />
          <ApagarCompeticaoDialog
            competicao={{ id: competicao.id, nome: competicao.nome }}
            onApagada={() => {
              router.push("/jogos/competicoes");
              router.refresh();
            }}
            trigger={
              <Button variant="outline">
                <Trash2 className="h-4 w-4 text-vermelho-600" />
                Apagar
              </Button>
            }
          />
        </div>
      </div>

      <Tabs defaultValue="classificacao">
        <TabsList className="flex-wrap">
          <TabsTrigger value="classificacao">Classificação</TabsTrigger>
          <TabsTrigger value="equipas">Equipas ({competicao.equipas.length})</TabsTrigger>
          <TabsTrigger value="resultados">
            Confrontos ({competicao._count.resultados})
          </TabsTrigger>
          <TabsTrigger value="jogos">Jogos próprios ({competicao._count.jogos})</TabsTrigger>
        </TabsList>

        <TabsContent value="classificacao" className="space-y-3">
          {competicao.formato !== "LIGA" && (
            <p className="text-legenda text-cinza-500">
              Formato {LABEL_FORMATO_COMPETICAO[competicao.formato].toLowerCase()}: sem pontuação —
              a ordenação segue a diferença de golos.
            </p>
          )}
          <TabelaClassificacao linhas={classificacao} formato={competicao.formato} />
        </TabsContent>

        <TabsContent value="equipas" className="space-y-4">
          <GestaoEquipas
            competicaoId={competicao.id}
            formato={competicao.formato}
            equipas={competicao.equipas.map((e) => ({
              id: e.id,
              nome: e.nome,
              tipo: e.tipo,
            }))}
            resultados={competicao.resultados.map((r) => ({
              equipaCasa: r.equipaCasa,
              equipaFora: r.equipaFora,
              equipaCasaId: r.equipaCasaId,
              equipaForaId: r.equipaForaId,
              estado: r.estado,
              walkoverVencedor: r.walkoverVencedor,
            }))}
            planteis={planteis}
            atletasEscalao={atletasEscalao}
            competicoesOrigem={competicoesOrigem}
          />
        </TabsContent>

        <TabsContent value="resultados" className="space-y-4">
          <div className="flex justify-end">
            <ResultadoExternoForm
              competicaoId={competicao.id}
              formato={competicao.formato}
              rondaMaxima={competicao.resultados.reduce((max, r) => Math.max(max, r.ronda ?? 0), 0)}
            />
          </div>
          <QuadroAgendamento
            competicaoId={competicao.id}
            competicaoNome={competicao.nome}
            equipas={competicao.equipas.map((e) => ({ id: e.id, nome: e.nome }))}
            resultados={competicao.resultados.map((r) => ({
              id: r.id,
              equipaCasa: r.equipaCasa,
              equipaFora: r.equipaFora,
              equipaCasaId: r.equipaCasaId,
              equipaForaId: r.equipaForaId,
              golosCasa: r.golosCasa,
              golosFora: r.golosFora,
              ronda: r.ronda,
              data: r.data,
              dataHora: r.dataHora,
              estado: r.estado,
              walkoverVencedor: r.walkoverVencedor,
              placarDivergente: confrontoComPlacarDivergente(r.jogosDetalhados),
            }))}
            formato={competicao.formato}
          />
        </TabsContent>

        <TabsContent value="jogos" className="space-y-2">
          {competicao.jogos.length === 0 ? (
            <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
              Sem jogos próprios nesta competição. Associa jogos ao criá-los ou editá-los.
            </p>
          ) : (
            <ul className="space-y-2">
              {competicao.jogos.map((j) => {
                const temResultado = j.golosMarcados !== null && j.golosSofridos !== null;
                return (
                  <li key={j.id}>
                    <Link
                      href={`/jogos/${j.id}`}
                      className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-3 shadow-card transition-colors hover:bg-cinza-50"
                    >
                      <div className="flex-1">
                        <p className="text-corpo text-cinza-900">
                          {j.casaFora === "CASA" ? "vs" : "@"} {j.adversario}
                        </p>
                        <p className="text-legenda text-cinza-500">
                          {formatarDataCurta(j.data)}
                          {j.equipaCompeticao ? ` · ${j.equipaCompeticao.nome}` : ""}
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums text-cinza-900">
                        {temResultado ? `${j.golosMarcados} — ${j.golosSofridos}` : "—"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
