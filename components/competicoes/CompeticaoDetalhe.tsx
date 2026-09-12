"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  apagarCompeticao,
  type CompeticaoDetalhe as CompeticaoDetalheTipo,
  type LinhaClassificacao,
} from "@/lib/actions/competicoes";
import { LABEL_FORMATO_COMPETICAO, LABEL_AMBITO_COMPETICAO } from "@/lib/schemas/competicao";
import { LABEL_TIPO_JOGO } from "@/lib/schemas/jogo";
import { formatarDataCurta } from "@/lib/comunicacao-utils";
import { CompeticaoForm } from "@/components/competicoes/CompeticaoForm";
import { ResultadoExternoForm } from "@/components/competicoes/ResultadoExternoForm";
import { TabelaClassificacao } from "@/components/competicoes/TabelaClassificacao";
import { QuadroAgendamento } from "@/components/competicoes/QuadroAgendamento";

type EscalaoBasico = { id: string; nome: string };
type EpocaBasica = { id: string; nome: string; ativa: boolean };

export function CompeticaoDetalhe({
  competicao,
  classificacao,
  escaloes,
  epocas,
}: {
  competicao: CompeticaoDetalheTipo;
  classificacao: LinhaClassificacao[];
  escaloes: EscalaoBasico[];
  epocas: EpocaBasica[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apagar() {
    startTransition(async () => {
      const res = await apagarCompeticao(competicao.id);
      if (res.sucesso) {
        toast.success("Competição apagada");
        router.push("/jogos/competicoes");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={pending}>
                <Trash2 className="h-4 w-4 text-vermelho-600" />
                Apagar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar «{competicao.nome}»?</AlertDialogTitle>
                <AlertDialogDescription>
                  Os jogos mantêm-se, apenas deixam de estar ligados a esta competição. Os
                  resultados externos são apagados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={apagar}
                  className="bg-vermelho-600 hover:bg-vermelho-600/90 text-white"
                >
                  Apagar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs defaultValue="classificacao">
        <TabsList className="flex-wrap">
          <TabsTrigger value="classificacao">Classificação</TabsTrigger>
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

        <TabsContent value="resultados" className="space-y-4">
          <div className="flex justify-end">
            <ResultadoExternoForm competicaoId={competicao.id} />
          </div>
          <QuadroAgendamento
            resultados={competicao.resultados.map((r) => ({
              id: r.id,
              equipaCasa: r.equipaCasa,
              equipaFora: r.equipaFora,
              golosCasa: r.golosCasa,
              golosFora: r.golosFora,
              ronda: r.ronda,
              data: r.data,
              dataHora: r.dataHora,
              estado: r.estado,
              walkoverVencedor: r.walkoverVencedor,
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
                        <p className="text-legenda text-cinza-500">{formatarDataCurta(j.data)}</p>
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
