"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { atualizarExercicioSessao } from "@/lib/actions/treinos";
import type { SessaoExercicioOverrideInput } from "@/lib/schemas/treino";
import {
  PARTES_TREINO,
  LABEL_PARTE_TREINO,
  type ParteTreinoValor,
} from "@/lib/schemas/exercicio";

// Valor "sem fase" no Select (o Radix Select não aceita item com value vazio).
const SEM_FASE = "SEM_FASE";

interface Props {
  sessaoExercicioId: string;
  exercicioNome: string;
  valorActual: {
    duracaoMin: number | null;
    series: number | null;
    descricaoOverride: string | null;
    notas: string | null;
    parteTreino: ParteTreinoValor | null;
    // Plano de treino imprimível (§4.2.1) — overrides por sessão. Opcionais para
    // retrocompatibilidade com callers ainda por ligar aos novos campos.
    numeroJogadoresOverride?: string | null;
    espacoOverride?: string | null;
    // Valores base do exercício, usados para pré-preencher quando o override é nulo
    // (melhor UX: o treinador vê o valor original e ajusta a partir dele).
    numeroJogadoresBase?: string | null;
    espacoBase?: string | null;
  };
  aberto: boolean;
  onFechar: () => void;
}

/** Converte o valor de um input numérico (string) em `number | null`. */
function paraNumero(valor: string): number | null {
  const t = valor.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Adapta um exercício apenas para esta sessão (Fase 2 das melhorias à sessão de
 * treino): duração, séries/repetições, descrição/montagem própria e notas do
 * treinador. Estes overrides vivem no `SessaoExercicio` e nunca alteram o
 * exercício original da biblioteca.
 */
export function AdaptarExercicioDialog({
  sessaoExercicioId,
  exercicioNome,
  valorActual,
  aberto,
  onFechar,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [duracaoMin, setDuracaoMin] = useState(
    valorActual.duracaoMin != null ? String(valorActual.duracaoMin) : "",
  );
  const [series, setSeries] = useState(
    valorActual.series != null ? String(valorActual.series) : "",
  );
  const [descricaoOverride, setDescricaoOverride] = useState(
    valorActual.descricaoOverride ?? "",
  );
  const [notas, setNotas] = useState(valorActual.notas ?? "");
  const [parteTreino, setParteTreino] = useState<string>(
    valorActual.parteTreino ?? SEM_FASE,
  );
  // Pré-preencher com o override existente ou, se nulo, com o valor base do exercício.
  const [numeroJogadores, setNumeroJogadores] = useState(
    valorActual.numeroJogadoresOverride ?? valorActual.numeroJogadoresBase ?? "",
  );
  const [espaco, setEspaco] = useState(
    valorActual.espacoOverride ?? valorActual.espacoBase ?? "",
  );

  function guardar() {
    setErro(null);
    const descricaoLimpa = descricaoOverride.trim();
    const notasLimpa = notas.trim();
    const numeroJogadoresLimpo = numeroJogadores.trim();
    const espacoLimpo = espaco.trim();
    const dados: SessaoExercicioOverrideInput = {
      duracaoMin: paraNumero(duracaoMin),
      series: paraNumero(series),
      descricaoOverride: descricaoLimpa === "" ? null : descricaoLimpa,
      notas: notasLimpa === "" ? null : notasLimpa,
      numeroJogadoresOverride: numeroJogadoresLimpo === "" ? null : numeroJogadoresLimpo,
      espacoOverride: espacoLimpo === "" ? null : espacoLimpo,
      parteTreino: parteTreino === SEM_FASE ? null : (parteTreino as ParteTreinoValor),
    };
    startTransition(async () => {
      const res = await atualizarExercicioSessao(sessaoExercicioId, dados);
      if (res.sucesso) {
        toast.success("Exercício adaptado para esta sessão");
        onFechar();
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adaptar exercício para esta sessão</DialogTitle>
          <DialogDescription>{exercicioNome}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            guardar();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adaptar-duracao">Duração (min)</Label>
              <Input
                id="adaptar-duracao"
                type="number"
                min={1}
                max={180}
                inputMode="numeric"
                value={duracaoMin}
                onChange={(e) => setDuracaoMin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adaptar-series">Séries / repetições</Label>
              <Input
                id="adaptar-series"
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                value={series}
                onChange={(e) => setSeries(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adaptar-num-jogadores">Nº de jogadores</Label>
              <Input
                id="adaptar-num-jogadores"
                maxLength={40}
                placeholder="ex: 4+GR, 3x3, Todos"
                value={numeroJogadores}
                onChange={(e) => setNumeroJogadores(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adaptar-espaco">Espaço</Label>
              <Input
                id="adaptar-espaco"
                maxLength={60}
                placeholder="ex: campo inteiro, 20x20m"
                value={espaco}
                onChange={(e) => setEspaco(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adaptar-fase">Fase do treino</Label>
            <Select value={parteTreino} onValueChange={setParteTreino}>
              <SelectTrigger id="adaptar-fase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTES_TREINO.map((p) => (
                  <SelectItem key={p} value={p}>
                    {LABEL_PARTE_TREINO[p]}
                  </SelectItem>
                ))}
                <SelectItem value={SEM_FASE}>Sem fase</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adaptar-descricao">Montagem para esta sessão</Label>
            <Textarea
              id="adaptar-descricao"
              rows={4}
              placeholder="Deixar vazio para usar a descrição original"
              value={descricaoOverride}
              onChange={(e) => setDescricaoOverride(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adaptar-notas">Notas do treinador</Label>
            <Textarea
              id="adaptar-notas"
              rows={3}
              placeholder="Notas específicas desta sessão..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>

          <p className="text-legenda text-cinza-500">
            Estas alterações aplicam-se apenas a esta sessão. O exercício original
            da biblioteca não é modificado.
          </p>

          {erro && (
            <p
              role="alert"
              className="rounded-md border border-vermelho-600/30 bg-vermelho-600/5 px-3 py-2 text-corpo-sec text-vermelho-600"
            >
              {erro}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onFechar}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "A guardar..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
