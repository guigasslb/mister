"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apagarCompeticao, obterImpactoApagarCompeticao } from "@/lib/actions/competicoes";
import {
  eCorridaImpacto,
  resumoApagarCompeticao,
  sufixoJogosApagados,
} from "@/lib/confronto-dialogos-ui";
import type { ImpactoRemocaoJogos } from "@/lib/remocao-jogos-competicao";

type ImpactoCompeticao = ImpactoRemocaoJogos & { total: number };

/**
 * Apagar uma competição com o impacto em /jogos (§5.3 do desenho, D2): sem opção
 * pré-selecionada — dois botões explícitos «Apagar só a competição» / «Apagar
 * competição e jogos agendados». Partilhado por CompeticaoDetalhe e CompeticoesLista.
 */
export function ApagarCompeticaoDialog({
  competicao,
  trigger,
  onApagada,
}: {
  competicao: { id: string; nome: string };
  trigger: React.ReactNode;
  onApagada: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [impacto, setImpacto] = useState<ImpactoCompeticao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [apagarComConvocatoria, setApagarComConvocatoria] = useState(false);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    setImpacto(null);
    setApagarComConvocatoria(false);
    obterImpactoApagarCompeticao(competicao.id).then((res) => {
      if (!ativo) return;
      if (res.sucesso) setImpacto(res.dados);
      else setErro(res.erro);
    });
    return () => {
      ativo = false;
    };
  }, [aberto, competicao.id, versao]);

  function mudarAberto(v: boolean) {
    if (pending) return;
    setAberto(v);
    if (!v) {
      setErro(null);
      setImpacto(null);
    }
  }

  function apagar(apagarJogos: boolean) {
    if (!impacto) return;
    const resumo = resumoApagarCompeticao(impacto);
    startTransition(async () => {
      const res = await apagarCompeticao(competicao.id, {
        apagarJogos,
        ...(apagarJogos && resumo.comConvocatoria > 0
          ? { jogosComConvocatoria: apagarComConvocatoria ? "APAGAR" : "MANTER" }
          : {}),
      });
      if (res.sucesso) {
        toast.success(`Competição apagada${sufixoJogosApagados(res.dados.jogosApagados)}`);
        setAberto(false);
        onApagada();
      } else {
        setErro(res.erro);
        if (eCorridaImpacto(res)) setVersao((n) => n + 1);
      }
    });
  }

  const resumo = impacto ? resumoApagarCompeticao(impacto) : null;

  return (
    <AlertDialog open={aberto} onOpenChange={mudarAberto}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar «{competicao.nome}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Os confrontos, as equipas e os plantéis desta competição são apagados.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}
        {!impacto && !erro && (
          <p className="text-corpo-sec text-cinza-500">A calcular o impacto…</p>
        )}

        {impacto && resumo && impacto.total > 0 && (
          <div className="space-y-3">
            <p className="text-corpo-sec text-cinza-700">
              Jogos em /jogos associados a esta competição: {impacto.total} — {resumo.vazios} sem
              convocatória nem dados, {resumo.comConvocatoria} com convocatória, {resumo.comDados}{" "}
              com estatísticas ou outros dados.
            </p>
            {resumo.comConvocatoria > 0 && (
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-cinza-200 px-3 py-2">
                <input
                  type="checkbox"
                  checked={apagarComConvocatoria}
                  onChange={(e) => setApagarComConvocatoria(e.target.checked)}
                  disabled={pending}
                  className="h-5 w-5 accent-[hsl(var(--primary))]"
                />
                <span className="text-corpo-sec text-cinza-900">
                  Apagar também os {resumo.comConvocatoria} jogos com convocatória
                </span>
              </label>
            )}
            <p className="text-corpo-sec text-cinza-700">
              Os jogos que não forem apagados ficam em /jogos, sem ligação à competição.
            </p>
          </div>
        )}

        <AlertDialogFooter className="gap-2 sm:flex-wrap">
          <Button type="button" variant="outline" onClick={() => mudarAberto(false)} disabled={pending}>
            Cancelar
          </Button>
          {resumo?.doisBotoes ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => apagar(false)}
                disabled={pending}
                className="border-vermelho-600 text-vermelho-600 hover:bg-vermelho-600/5"
              >
                Apagar só a competição
              </Button>
              <div className="flex flex-col items-stretch gap-1">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => apagar(true)}
                  disabled={pending}
                >
                  Apagar competição e jogos agendados
                </Button>
                <span className="text-legenda text-cinza-500">
                  Apaga {resumo.vazios} jogo(s) sem dados
                  {apagarComConvocatoria && resumo.comConvocatoria > 0
                    ? ` e ${resumo.comConvocatoria} com convocatória`
                    : ""}
                  .
                </span>
              </div>
            </>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={() => apagar(false)}
              disabled={pending || !impacto}
            >
              {pending ? "A apagar…" : "Apagar"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
