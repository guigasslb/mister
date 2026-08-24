"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { editarUtilizadorAdmin } from "@/lib/actions/admin-membros";

/**
 * Diálogo de edição de dados básicos de uma conta (nome + email), para o admin
 * de plataforma. Ao guardar com sucesso, invoca `onGuardado` para o pai
 * recarregar a lista de membros.
 */
export function DialogEditarUtilizador({
  utilizadorId,
  nomeInicial,
  emailInicial,
  onGuardado,
}: {
  utilizadorId: string;
  nomeInicial: string;
  emailInicial: string;
  onGuardado: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  const [nome, setNome] = useState(nomeInicial);
  const [email, setEmail] = useState(emailInicial);
  const [erro, setErro] = useState<string | null>(null);

  function repor() {
    setNome(nomeInicial);
    setEmail(emailInicial);
    setErro(null);
  }

  function handleGuardar() {
    setErro(null);
    startTransition(async () => {
      const res = await editarUtilizadorAdmin({ utilizadorId, nome, email });
      if (res.sucesso) {
        toast.success("Conta atualizada");
        setAberto(false);
        onGuardado();
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (pending) return;
        if (v) repor();
        setAberto(v);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar conta</DialogTitle>
          <DialogDescription>{emailInicial}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {erro && (
            <p role="alert" className="text-corpo-sec text-vermelho-600">
              {erro}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="editar-nome">Nome</Label>
            <Input
              id="editar-nome"
              value={nome}
              disabled={pending}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="editar-email">Email</Label>
            <Input
              id="editar-email"
              type="email"
              value={email}
              disabled={pending}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setAberto(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={pending} onClick={handleGuardar}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
