"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, CheckCircle2, Wand2 } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { criarEpoca, definirEpocaAtiva } from "@/lib/actions/epocas";
import type { Epoca } from "@prisma/client";

function CriarEpocaDialog() {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    startTransition(async () => {
      const res = await criarEpoca({
        nome: fd.get("nome"),
        dataInicio: fd.get("dataInicio"),
        dataFim: fd.get("dataFim"),
      });
      if (res.sucesso) {
        toast.success("Época criada");
        setAberto(false);
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Nova época
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova época</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" name="nome" placeholder="ex: 2026/27" required maxLength={20} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dataInicio">Início *</Label>
              <Input id="dataInicio" name="dataInicio" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataFim">Fim *</Label>
              <Input id="dataFim" name="dataFim" type="date" required />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "A criar…" : "Criar época"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EpocasLista({
  epocas,
  podeUsarWizard = false,
  podeGerir = false,
}: {
  epocas: Epoca[];
  podeUsarWizard?: boolean;
  podeGerir?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function definirAtiva(id: string) {
    startTransition(async () => {
      const res = await definirEpocaAtiva(id);
      if (res.sucesso) toast.success("Época ativa atualizada");
      else toast.error(res.erro);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1>Épocas</h1>
        <div className="flex items-center gap-2">
          {podeUsarWizard && (
            <Button asChild variant="outline">
              <Link href="/definicoes/nova-epoca">
                <Wand2 className="h-4 w-4" />
                Assistente nova época
              </Link>
            </Button>
          )}
          {podeGerir && <CriarEpocaDialog />}
        </div>
      </div>

      {epocas.length === 0 ? (
        <p className="text-corpo-sec text-cinza-600">
          Nenhuma época definida. Cria a primeira para começar a registar dados.
        </p>
      ) : (
        <ul className="space-y-2">
          {epocas.map((ep) => (
            <li
              key={ep.id}
              className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-4 shadow-card"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-corpo font-semibold text-cinza-900">{ep.nome}</p>
                  {ep.ativa && (
                    <Badge className="bg-verde-600 text-white text-legenda">Ativa</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-legenda text-cinza-600">
                  {format(ep.dataInicio, "d MMM yyyy", { locale: pt })} –{" "}
                  {format(ep.dataFim, "d MMM yyyy", { locale: pt })}
                </p>
              </div>
              {podeGerir && !ep.ativa && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => definirAtiva(ep.id)}
                  className="gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Definir ativa
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
