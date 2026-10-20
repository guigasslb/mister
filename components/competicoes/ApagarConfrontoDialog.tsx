"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ImpactoJogosConfronto } from "@/components/competicoes/ImpactoJogosConfronto";
import { apagarConfronto, obterImpactoApagarConfronto } from "@/lib/actions/competicoes";
import {
  decisoesCompletas,
  eCorridaImpacto,
  payloadDecisoes,
  sufixoJogosApagados,
  textoClassificacaoApagar,
  totalJogosImpacto,
  type DecisaoConvocatoria,
  type DecisaoJogosComDados,
} from "@/lib/confronto-dialogos-ui";
import { formatarData, formatarHora } from "@/lib/comunicacao-utils";
import type { ImpactoRemocaoJogos } from "@/lib/remocao-jogos-competicao";
import type { EstadoResultado } from "@prisma/client";

type ImpactoApagar = {
  confronto: {
    equipaCasa: string;
    equipaFora: string;
    ronda: number | null;
    dataHora: Date | null;
    estado: EstadoResultado;
  };
  jogos: ImpactoRemocaoJogos;
};

/**
 * Confirmação de apagar um confronto com o impacto em /jogos (§23.6 regra R3, D1).
 * Controlado: aberto enquanto `resultadoId` não for `null`.
 */
export function ApagarConfrontoDialog({
  resultadoId,
  onFechar,
  competicaoNome,
  rotuloRonda,
}: {
  resultadoId: string | null;
  onFechar: () => void;
  competicaoNome: string;
  rotuloRonda: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [impacto, setImpacto] = useState<ImpactoApagar | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [convocatoria, setConvocatoria] = useState<DecisaoConvocatoria | null>(null);
  const [dados, setDados] = useState<DecisaoJogosComDados | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!resultadoId) return;
    let ativo = true;
    setImpacto(null);
    setConvocatoria(null);
    setDados(null);
    obterImpactoApagarConfronto(resultadoId).then((res) => {
      if (!ativo) return;
      if (res.sucesso) setImpacto(res.dados);
      else setErro(res.erro);
    });
    return () => {
      ativo = false;
    };
  }, [resultadoId, versao]);

  function fechar() {
    setErro(null);
    setImpacto(null);
    onFechar();
  }

  function confirmar() {
    if (!resultadoId || !impacto) return;
    startTransition(async () => {
      const res = await apagarConfronto({
        resultadoId,
        ...payloadDecisoes(impacto.jogos, convocatoria, dados),
      });
      if (res.sucesso) {
        toast.success(
          `Confronto apagado${sufixoJogosApagados(res.dados.jogosApagados, " em /jogos")}`,
        );
        fechar();
        router.refresh();
      } else {
        setErro(res.erro);
        // Corrida (o impacto mudou entretanto): recalcula e volta a pedir a decisão.
        if (eCorridaImpacto(res)) setVersao((v) => v + 1);
      }
    });
  }

  const c = impacto?.confronto;
  const comResultado = c?.estado === "REALIZADO" || c?.estado === "WALKOVER";
  const podeConfirmar =
    impacto !== null && decisoesCompletas(impacto.jogos, convocatoria, dados) && !pending;

  return (
    <AlertDialog open={resultadoId !== null} onOpenChange={(v) => !v && !pending && fechar()}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar este confronto?</AlertDialogTitle>
          <AlertDialogDescription>
            {c
              ? `${c.equipaCasa} vs ${c.equipaFora} · ${
                  c.ronda !== null ? `${rotuloRonda} ${c.ronda}` : `Sem ${rotuloRonda.toLowerCase()}`
                } · ${c.dataHora ? `${formatarData(c.dataHora)} · ${formatarHora(c.dataHora)}` : "Por definir"}`
              : erro
                ? ""
                : "A calcular o impacto…"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

        {impacto && (
          <div className="space-y-3">
            {totalJogosImpacto(impacto.jogos) === 0 && (
              <p className="text-corpo-sec text-cinza-700">
                O confronto sai do quadro. Esta ação não pode ser desfeita.
              </p>
            )}
            {comResultado && (
              <p className="text-corpo-sec text-cinza-700">
                {textoClassificacaoApagar(impacto.jogos, convocatoria, dados)}
              </p>
            )}
            <ImpactoJogosConfronto
              impacto={impacto.jogos}
              competicaoNome={competicaoNome}
              convocatoria={convocatoria}
              onConvocatoria={setConvocatoria}
              dados={dados}
              onDados={setDados}
              disabled={pending}
            />
          </div>
        )}

        <AlertDialogFooter>
          <Button type="button" variant="outline" onClick={fechar} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={confirmar} disabled={!podeConfirmar}>
            {pending ? "A apagar…" : "Apagar confronto"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
