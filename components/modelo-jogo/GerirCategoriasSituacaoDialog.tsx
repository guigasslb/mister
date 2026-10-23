"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  criarCategoriaSituacao,
  atualizarCategoriaSituacao,
  apagarCategoriaSituacao,
} from "@/lib/actions/situacoesJogo";

export type CategoriaSituacaoLinha = { id: string; nome: string; ordem: number };

/** Linha de uma categoria: ver, renomear/reordenar e apagar (com confirmação). */
function LinhaCategoria({ categoria }: { categoria: CategoriaSituacaoLinha }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editar, setEditar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    startTransition(async () => {
      const res = await atualizarCategoriaSituacao(categoria.id, {
        nome: String(fd.get("nome") ?? ""),
        ordem: Number(fd.get("ordem") ?? 0),
      });
      if (res.sucesso) {
        toast.success("Categoria atualizada");
        setEditar(false);
        router.refresh();
      } else setErro(res.camposInvalidos?.nome ?? res.erro);
    });
  }

  function apagar() {
    startTransition(async () => {
      const res = await apagarCategoriaSituacao(categoria.id);
      if (res.sucesso) {
        toast.success("Categoria apagada");
        router.refresh();
      } else toast.error(res.erro);
    });
  }

  if (editar) {
    return (
      <li className="rounded-md border border-cinza-200 bg-white p-3">
        <form onSubmit={guardar} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={`nome-${categoria.id}`}>Nome</Label>
            <Input
              id={`nome-${categoria.id}`}
              name="nome"
              required
              maxLength={60}
              defaultValue={categoria.nome}
            />
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor={`ordem-${categoria.id}`}>Ordem</Label>
            <Input
              id={`ordem-${categoria.id}`}
              name="ordem"
              type="number"
              min={0}
              max={999}
              defaultValue={categoria.ordem}
            />
          </div>
          <Button type="submit" size="icon" aria-label="Guardar" disabled={pending}>
            <Check className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cancelar"
            disabled={pending}
            onClick={() => {
              setErro(null);
              setEditar(false);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
        {erro && <p className="mt-1 text-legenda text-vermelho-600">{erro}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 rounded-md border border-cinza-200 bg-white px-3 py-1.5">
      <span className="flex-1 text-corpo text-cinza-900">{categoria.nome}</span>
      <span className="text-legenda text-cinza-400">Ordem {categoria.ordem}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Editar «${categoria.nome}»`}
        disabled={pending}
        onClick={() => setEditar(true)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Apagar «${categoria.nome}»`}
            disabled={pending}
          >
            <Trash2 className="h-4 w-4 text-vermelho-600" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar «{categoria.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é irreversível.</AlertDialogDescription>
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
    </li>
  );
}

/**
 * Gestão das categorias de situação de UM escalão (§24.6, RN-SJ-11), em diálogo
 * (padrão `SubcategoriasLista`). As categorias chegam do Server Component; cada
 * mutação revalida `/modelo-jogo` e faz `router.refresh()`.
 */
export function GerirCategoriasSituacaoDialog({
  escalaoId,
  escalaoNome,
  categorias,
}: {
  escalaoId: string;
  escalaoNome: string;
  categorias: CategoriaSituacaoLinha[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function criar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setErro(null);
    startTransition(async () => {
      const res = await criarCategoriaSituacao({
        escalaoId,
        nome: String(fd.get("nome") ?? ""),
        ordem: Number(fd.get("ordem") ?? 0),
      });
      if (res.sucesso) {
        toast.success("Categoria criada");
        form.reset();
        router.refresh();
      } else setErro(res.camposInvalidos?.nome ?? res.erro);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Tags className="h-4 w-4" />
          Gerir categorias
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categorias de {escalaoNome}</DialogTitle>
        </DialogHeader>

        {categorias.length === 0 ? (
          <p className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
            Ainda não há categorias neste escalão. Cria as que fizerem sentido (ex.:
            «Saídas de jogo», «Bolas paradas»).
          </p>
        ) : (
          <ul className="space-y-1.5">
            {categorias.map((c) => (
              <LinhaCategoria key={c.id} categoria={c} />
            ))}
          </ul>
        )}

        <form onSubmit={criar} className="space-y-2 border-t border-cinza-200 pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="nova-categoria-nome">Nova categoria</Label>
              <Input
                id="nova-categoria-nome"
                name="nome"
                required
                maxLength={60}
                placeholder="ex: Bolas paradas"
              />
            </div>
            <div className="w-24 space-y-1">
              <Label htmlFor="nova-categoria-ordem">Ordem</Label>
              <Input
                id="nova-categoria-ordem"
                name="ordem"
                type="number"
                min={0}
                max={999}
                defaultValue={0}
              />
            </div>
            <Button type="submit" disabled={pending}>
              <Plus className="h-4 w-4" />
              Criar
            </Button>
          </div>
          {erro && <p className="text-legenda text-vermelho-600">{erro}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
