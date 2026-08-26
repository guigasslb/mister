"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { editarTipoParticipacao } from "@/lib/actions/participacoes";
import {
  LABEL_TIPO_PARTICIPACAO,
  TIPOS_PARTICIPACAO,
} from "@/lib/schemas/participacao";
import type { TipoParticipacao } from "@prisma/client";

/**
 * Editar o tipo de uma participação ativa (secção 8.5).
 *
 * Os três tipos são oferecidos: ao escolher «Principal», a action despromove
 * automaticamente o principal anterior da mesma modalidade para «Simultânea»
 * (invariante da secção 9). Despromover o único principal é recusado pelo
 * servidor — a autoridade continua a ser a action.
 */
export function EditarTipoParticipacaoButton({
  atletaId,
  escalaoId,
  escalaoNome,
  tipoAtual,
}: {
  atletaId: string;
  escalaoId: string;
  escalaoNome: string;
  tipoAtual: TipoParticipacao;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [tipo, setTipo] = useState<TipoParticipacao>(tipoAtual);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  function alternar(valor: boolean) {
    setAberto(valor);
    if (!valor) {
      setTipo(tipoAtual);
      setErroGeral(null);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErroGeral(null);

    startTransition(async () => {
      const res = await editarTipoParticipacao({ atletaId, escalaoId, tipo });
      if (res.sucesso) {
        toast.success("Tipo de participação atualizado");
        router.refresh();
        alternar(false);
      } else {
        setErroGeral(res.erro);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={alternar}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-11">
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar participação em «{escalaoNome}»</DialogTitle>
          <DialogDescription>
            Ao definir «Principal», a participação principal anterior desta modalidade
            passa automaticamente a «Simultânea».
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="editar-tipo">Tipo de participação</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoParticipacao)}>
              <SelectTrigger id="editar-tipo" className="h-11">
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

          {erroGeral && (
            <p role="alert" className="text-corpo-sec text-vermelho-600">
              {erroGeral}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => alternar(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || tipo === tipoAtual}>
              {pending ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
