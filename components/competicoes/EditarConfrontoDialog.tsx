"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImpactoJogosConfronto } from "@/components/competicoes/ImpactoJogosConfronto";
import { editarConfronto, obterImpactoEditarConfronto } from "@/lib/actions/competicoes";
import {
  classificarEdicao,
  decisoesCompletas,
  eCorridaImpacto,
  edicaoTemImpacto,
  opcoesRonda,
  payloadDecisoes,
  resolverEquipaId,
  sufixoJogosApagados,
  estadoPrevia,
  textoResultadoFinal,
  type PreviaResultado,
  type DecisaoConvocatoria,
  type DecisaoJogosComDados,
  type EquipaOpcao,
} from "@/lib/confronto-dialogos-ui";
import type { ResultadoQuadro } from "@/components/competicoes/QuadroAgendamento";

type ImpactoEdicao = Extract<
  Awaited<ReturnType<typeof obterImpactoEditarConfronto>>,
  { sucesso: true }
>["dados"];

const SEM_RONDA = "__sem__";

/**
 * Editar um confronto (§5.2 do desenho): casa/visitante, ⇄ e jornada. D3: mudar
 * as equipas de um confronto com resultado exige confirmação explícita; D1: os
 * jogos com dados que sobram pedem «Manter/Retirar da competição».
 * O pai monta-o com `key={confronto.id}` — o estado inicial vem das props.
 */
export function EditarConfrontoDialog({
  confronto,
  equipas,
  rondaMaxima,
  rotuloRonda,
  competicaoNome,
  onFechar,
}: {
  confronto: ResultadoQuadro;
  equipas: EquipaOpcao[];
  rondaMaxima: number;
  rotuloRonda: string;
  competicaoNome: string;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const casaAtual = resolverEquipaId(confronto.equipaCasaId, confronto.equipaCasa, equipas);
  const foraAtual = resolverEquipaId(confronto.equipaForaId, confronto.equipaFora, equipas);
  const [casaId, setCasaIdBase] = useState(casaAtual ?? "");
  const [foraId, setForaIdBase] = useState(foraAtual ?? "");
  const [ronda, setRonda] = useState<number | null>(confronto.ronda);
  const [confirmarResultado, setConfirmarResultado] = useState(false);
  // A confirmação D3 vale para as equipas escolhidas: mudá-las pede-a de novo.
  const setCasaId = (v: string) => {
    setCasaIdBase(v);
    setConfirmarResultado(false);
  };
  const setForaId = (v: string) => {
    setForaIdBase(v);
    setConfirmarResultado(false);
  };
  const [impacto, setImpacto] = useState<ImpactoEdicao | null>(null);
  const [convocatoria, setConvocatoria] = useState<DecisaoConvocatoria | null>(null);
  const [dados, setDados] = useState<DecisaoJogosComDados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const comResultado = confronto.estado === "REALIZADO" || confronto.estado === "WALKOVER";
  const escolhidas = casaId !== "" && foraId !== "" && casaId !== foraId;
  const { mudaEquipas } = escolhidas
    ? classificarEdicao({ casaId: casaAtual, foraId: foraAtual }, { casaId, foraId })
    : { mudaEquipas: false };
  const pedeConfirmacao = comResultado && mudaEquipas;
  const nomeDe = (id: string) => equipas.find((e) => e.id === id)?.nome ?? "";

  // D3: o placar do aviso vem do servidor (`resultadoFinal`, já reorientado quando
  // os lados se invertem) — pré-visualização sem confirmação, pela escolha atual.
  const chavePrevia = `${casaId}|${foraId}`;
  const [previa, setPrevia] = useState<PreviaResultado<ImpactoEdicao["resultadoFinal"]> | null>(
    null,
  );
  const [tentativaPrevia, setTentativaPrevia] = useState(0);
  useEffect(() => {
    if (!pedeConfirmacao) return;
    let ativo = true;
    const chave = `${casaId}|${foraId}`;
    setPrevia(null);
    obterImpactoEditarConfronto({
      resultadoId: confronto.id,
      equipaCasaId: casaId,
      equipaForaId: foraId,
      ronda: confronto.ronda,
      confirmarAlteracaoResultado: false,
    }).then(
      (res) => {
        if (!ativo) return;
        setPrevia(
          res.sucesso
            ? { chave, sucesso: true, resultado: res.dados.resultadoFinal }
            : { chave, sucesso: false, erro: res.erro },
        );
      },
      () => {
        if (ativo) setPrevia({ chave, sucesso: false, erro: "Não foi possível calcular o resultado." });
      },
    );
    return () => {
      ativo = false;
    };
  }, [pedeConfirmacao, casaId, foraId, confronto.id, confronto.ronda, tentativaPrevia]);
  const estado = estadoPrevia(previa, chavePrevia);

  function dadosEdicao() {
    return {
      resultadoId: confronto.id,
      equipaCasaId: casaId,
      equipaForaId: foraId,
      ronda,
      confirmarAlteracaoResultado: pedeConfirmacao && confirmarResultado,
    };
  }

  function gravar(decisoes: ReturnType<typeof payloadDecisoes>) {
    return editarConfronto({ ...dadosEdicao(), ...decisoes });
  }

  function concluir(jogosApagados: number) {
    toast.success(`Confronto atualizado${sufixoJogosApagados(jogosApagados)}`);
    onFechar();
    router.refresh();
  }

  /** Corrida: recalcula o impacto e volta ao passo das decisões (a mensagem fica visível). */
  async function recalcularAposCorrida() {
    const novo = await obterImpactoEditarConfronto(dadosEdicao());
    setConvocatoria(null);
    setDados(null);
    if (!novo.sucesso) setErro(novo.erro);
    else if (novo.dados.bloqueio) setErro(novo.dados.bloqueio);
    else setImpacto(novo.dados);
  }

  function calcularImpacto() {
    startTransition(async () => {
      setConvocatoria(null);
      setDados(null);
      const res = await obterImpactoEditarConfronto(dadosEdicao());
      if (!res.sucesso) {
        setErro(res.erro);
        return;
      }
      if (res.dados.bloqueio) {
        setErro(res.dados.bloqueio);
        return;
      }
      if (edicaoTemImpacto(res.dados)) {
        setImpacto(res.dados);
        return;
      }
      const gravado = await gravar({});
      if (gravado.sucesso) {
        concluir(gravado.dados.jogosApagados);
        return;
      }
      setErro(gravado.erro);
      if (eCorridaImpacto(gravado)) await recalcularAposCorrida();
    });
  }

  function guardar() {
    setErro(null);
    if (!escolhidas) return;
    calcularImpacto();
  }

  function confirmarImpacto() {
    if (!impacto) return;
    setErro(null);
    startTransition(async () => {
      const res = await gravar(payloadDecisoes(impacto.saem, convocatoria, dados));
      if (res.sucesso) {
        concluir(res.dados.jogosApagados);
        return;
      }
      setErro(res.erro);
      // Corrida (o impacto mudou entretanto): recalcula e volta a pedir as decisões.
      if (eCorridaImpacto(res)) await recalcularAposCorrida();
    });
  }

  const erroCasa = casaId === "" ? "Escolhe a equipa da casa." : null;
  const erroFora =
    foraId === ""
      ? "Escolhe a equipa visitante."
      : casaId === foraId
        ? "A equipa da casa e a visitante têm de ser diferentes."
        : null;
  const podeGuardar =
    escolhidas && (!pedeConfirmacao || (confirmarResultado && estado.tipo === "OK")) && !pending;

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar confronto</DialogTitle>
          {impacto && <DialogDescription>Isto mexe em jogos de /jogos:</DialogDescription>}
        </DialogHeader>

        {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

        {impacto ? (
          <div className="space-y-3">
            <ImpactoJogosConfronto
              impacto={impacto.saem}
              competicaoNome={competicaoNome}
              convocatoria={convocatoria}
              onConvocatoria={setConvocatoria}
              dados={dados}
              onDados={setDados}
              disabled={pending}
            />
            {impacto.atualizados
              .filter((j) => j.temDados)
              .map((j) => (
                <p key={j.id} className="text-corpo-sec text-cinza-700">
                  O jogo {j.equipa ? `de ${j.equipa}` : "da tua equipa"} passa a ser contra{" "}
                  {j.adversario} ({j.casaFora === "CASA" ? "em casa" : "fora"}). A convocatória e
                  os dados mantêm-se.
                </p>
              ))}
            {impacto.criaJogos.map((nome) => (
              <p key={nome} className="text-corpo-sec text-cinza-700">
                {confronto.dataHora
                  ? `É criado o jogo de ${nome} em /jogos.`
                  : `O jogo de ${nome} é criado quando definires a data e hora.`}
              </p>
            ))}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setImpacto(null);
                  setErro(null);
                }}
                disabled={pending}
              >
                Voltar
              </Button>
              <Button
                type="button"
                onClick={confirmarImpacto}
                disabled={pending || !decisoesCompletas(impacto.saem, convocatoria, dados)}
              >
                {pending ? "A guardar…" : "Confirmar"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {comResultado && (
              <p className="text-legenda text-cinza-500">
                Este confronto já tem resultado. Trocar casa e visitante mantém os golos de cada
                equipa; mudar uma equipa altera a classificação.
              </p>
            )}

            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="editar-casa">Casa</Label>
                <Select value={casaId} onValueChange={setCasaId} disabled={pending}>
                  <SelectTrigger id="editar-casa" aria-invalid={erroCasa !== null}>
                    <SelectValue placeholder="Escolhe a equipa" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  setCasaId(foraId);
                  setForaId(casaId);
                }}
                disabled={pending}
                aria-label="Trocar casa e visitante"
                className="justify-self-center"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </Button>
              <div className="space-y-1.5">
                <Label htmlFor="editar-fora">Visitante</Label>
                <Select value={foraId} onValueChange={setForaId} disabled={pending}>
                  <SelectTrigger id="editar-fora" aria-invalid={erroFora !== null}>
                    <SelectValue placeholder="Escolhe a equipa" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {casaAtual === null && (
              <p className="text-legenda text-ambar-600">
                A equipa «{confronto.equipaCasa}» já não está na competição — escolhe outra.
              </p>
            )}
            {foraAtual === null && (
              <p className="text-legenda text-ambar-600">
                A equipa «{confronto.equipaFora}» já não está na competição — escolhe outra.
              </p>
            )}
            {(erroCasa ?? erroFora) && (
              <p className="text-legenda text-vermelho-600">{erroCasa ?? erroFora}</p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="editar-ronda">{rotuloRonda}</Label>
              <Select
                value={ronda === null ? SEM_RONDA : String(ronda)}
                onValueChange={(v) => setRonda(v === SEM_RONDA ? null : Number(v))}
                disabled={pending}
              >
                <SelectTrigger id="editar-ronda">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_RONDA}>Sem {rotuloRonda.toLowerCase()}</SelectItem>
                  {opcoesRonda(rondaMaxima, confronto.ronda).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {rotuloRonda} {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ronda !== confronto.ronda && (
                <p className="text-legenda text-cinza-500">
                  O confronto passa para o fim da {rotuloRonda.toLowerCase()} escolhida.
                </p>
              )}
            </div>

            {pedeConfirmacao && (
              <div className="space-y-2 rounded-md border border-ambar-500 bg-ambar-500/10 p-3">
                <p className="flex items-start gap-2 text-corpo-sec text-ambar-600">
                  <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  {estado.tipo === "A_CALCULAR"
                    ? "A calcular o resultado…"
                    : estado.tipo === "ERRO"
                      ? estado.erro
                      : `A classificação vai mudar: o resultado${
                          estado.resultado
                            ? ` ${textoResultadoFinal(estado.resultado, nomeDe(casaId), nomeDe(foraId))}`
                            : ""
                        } passa a contar para ${nomeDe(casaId)} vs ${nomeDe(foraId)}.`}
                </p>
                {estado.tipo === "ERRO" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTentativaPrevia((n) => n + 1)}
                    disabled={pending}
                  >
                    Tentar de novo
                  </Button>
                )}
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={confirmarResultado}
                    onChange={(e) => setConfirmarResultado(e.target.checked)}
                    disabled={pending || estado.tipo !== "OK"}
                    className="h-5 w-5 accent-[hsl(var(--primary))]"
                  />
                  <span className="text-corpo-sec text-cinza-900">Confirmo a alteração</span>
                </label>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onFechar} disabled={pending}>
                Cancelar
              </Button>
              <Button type="button" onClick={guardar} disabled={!podeGuardar}>
                {pending ? "A guardar…" : "Guardar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
