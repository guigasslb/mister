"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { atualizarParticipacaoAtleta } from "@/lib/actions/participacoes";
import {
  LABEL_TIPO_PARTICIPACAO,
  TIPOS_PARTICIPACAO,
} from "@/lib/schemas/participacao";
import type { TipoParticipacao } from "@prisma/client";

/**
 * Edição inline de uma participação ativa do atleta (secção 8.5): número de
 * camisola e tipo de participação, na época ativa. Cada linha guarda de forma
 * independente via `atualizarParticipacaoAtleta`.
 *
 * O invariante do «principal por modalidade» (§9) é imposto na action (servidor):
 * ao passar a «Principal», o principal anterior da modalidade é despromovido;
 * despromover o único principal é recusado com mensagem de erro.
 */
export function ParticipacaoAtletaItem({
  atletaId,
  escalaoId,
  escalaoNome,
  numeroInicial,
  tipoInicial,
}: {
  atletaId: string;
  escalaoId: string;
  escalaoNome: string;
  numeroInicial: number | null;
  tipoInicial: TipoParticipacao;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const numeroInicialStr = numeroInicial != null ? String(numeroInicial) : "";
  const [numero, setNumero] = useState<string>(numeroInicialStr);
  const [tipo, setTipo] = useState<TipoParticipacao>(tipoInicial);
  const [erro, setErro] = useState<string | null>(null);

  const alterado = numero.trim() !== numeroInicialStr || tipo !== tipoInicial;

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);

    const numeroTrim = numero.trim();
    const numeroValor = numeroTrim === "" ? null : Number(numeroTrim);
    if (
      numeroValor !== null &&
      (!Number.isInteger(numeroValor) || numeroValor < 1 || numeroValor > 999)
    ) {
      setErro("O número deve estar entre 1 e 999");
      return;
    }

    startTransition(async () => {
      const res = await atualizarParticipacaoAtleta(atletaId, escalaoId, {
        numero: numeroValor,
        tipoParticipacao: tipo,
      });
      if (res.sucesso) {
        toast.success(`Participação em «${escalaoNome}» atualizada`);
        router.refresh();
      } else {
        setErro(res.erro);
      }
    });
  }

  const idNumero = `participacao-numero-${escalaoId}`;
  const idTipo = `participacao-tipo-${escalaoId}`;

  return (
    <li className="rounded-md border border-cinza-200 bg-white p-3 shadow-card">
      <form onSubmit={guardar} className="space-y-3">
        <p className="text-corpo font-semibold text-cinza-900">{escalaoNome}</p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-24 space-y-1.5">
            <Label htmlFor={idNumero}>Número</Label>
            <Input
              id={idNumero}
              type="number"
              min={1}
              max={999}
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="—"
            />
          </div>

          <div className="min-w-[10rem] flex-1 space-y-1.5">
            <Label htmlFor={idTipo}>Tipo de participação</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoParticipacao)}>
              <SelectTrigger id={idTipo} className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_PARTICIPACAO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LABEL_TIPO_PARTICIPACAO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={pending || !alterado}>
            {pending ? "A guardar…" : "Guardar"}
          </Button>
        </div>

        {erro && (
          <p role="alert" className="text-legenda text-vermelho-600">
            {erro}
          </p>
        )}
      </form>
    </li>
  );
}
