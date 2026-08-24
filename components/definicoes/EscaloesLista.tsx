"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, ChevronUp, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  criarEscalao,
  atualizarEscalao,
  apagarEscalao,
  moverEscalao,
} from "@/lib/actions/escaloes";
import type { Escalao } from "@prisma/client";

// ─── Formulário partilhado ────────────────────────────────────────────────────

function EscalaoForm({
  defaultValues,
  onSubmit,
  pending,
  erro,
  mostrarVisibilidade = false,
}: {
  defaultValues?: Partial<Escalao>;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  erro: string | null;
  mostrarVisibilidade?: boolean;
}) {
  const [visivel, setVisivel] = useState(
    defaultValues?.visivelOutrosTreinadores ?? true,
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome *</Label>
        <Input id="nome" name="nome" defaultValue={defaultValues?.nome ?? ""} required maxLength={50} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="idadeMin">Idade mínima</Label>
          <Input
            id="idadeMin"
            name="idadeMin"
            type="number"
            min={0}
            max={99}
            defaultValue={defaultValues?.idadeMin ?? ""}
            placeholder="—"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="idadeMax">Idade máxima</Label>
          <Input
            id="idadeMax"
            name="idadeMax"
            type="number"
            min={0}
            max={99}
            defaultValue={defaultValues?.idadeMax ?? ""}
            placeholder="—"
          />
        </div>
      </div>
      {mostrarVisibilidade && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-cinza-200 p-3">
          <div className="space-y-0.5">
            <Label htmlFor="visivelOutrosTreinadores" className="cursor-pointer">
              Visível para outros treinadores do clube
            </Label>
            <p className="text-legenda text-cinza-600">
              Permite que outros treinadores vejam os treinos e jogos deste escalão no calendário do clube.
            </p>
          </div>
          {/* Radix Switch não emite valor em FormData — sincronizamos via input escondido. */}
          <input
            type="hidden"
            name="visivelOutrosTreinadores"
            value={visivel ? "true" : "false"}
          />
          <Switch
            id="visivelOutrosTreinadores"
            checked={visivel}
            onCheckedChange={setVisivel}
            aria-label="Visível para outros treinadores do clube"
          />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "A guardar…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

// ─── Criar ───────────────────────────────────────────────────────────────────

function CriarEscalaoDialog() {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    startTransition(async () => {
      const res = await criarEscalao({
        nome: fd.get("nome"),
        idadeMin: fd.get("idadeMin") || null,
        idadeMax: fd.get("idadeMax") || null,
      });
      if (res.sucesso) {
        toast.success("Escalão criado");
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
          Novo escalão
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo escalão</DialogTitle>
        </DialogHeader>
        <EscalaoForm onSubmit={handleSubmit} pending={pending} erro={erro} />
      </DialogContent>
    </Dialog>
  );
}

// ─── Editar ───────────────────────────────────────────────────────────────────

function EditarEscalaoDialog({ escalao }: { escalao: Escalao }) {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    startTransition(async () => {
      const res = await atualizarEscalao(escalao.id, {
        nome: fd.get("nome"),
        idadeMin: fd.get("idadeMin") || null,
        idadeMax: fd.get("idadeMax") || null,
        visivelOutrosTreinadores: fd.get("visivelOutrosTreinadores") === "true",
      });
      if (res.sucesso) {
        toast.success("Escalão atualizado");
        setAberto(false);
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editar escalão">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar escalão</DialogTitle>
        </DialogHeader>
        <EscalaoForm
          defaultValues={escalao}
          onSubmit={handleSubmit}
          pending={pending}
          erro={erro}
          mostrarVisibilidade
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── Lista principal ──────────────────────────────────────────────────────────

export function EscaloesLista({
  escaloes,
  podeCriar = false,
  escaloesGeriveis = [],
}: {
  escaloes: Escalao[];
  podeCriar?: boolean;
  escaloesGeriveis?: string[];
}) {
  const [pending, startTransition] = useTransition();
  const geriveis = new Set(escaloesGeriveis);

  function apagar(id: string) {
    startTransition(async () => {
      const res = await apagarEscalao(id);
      if (res.sucesso) toast.success("Escalão apagado");
      else toast.error(res.erro);
    });
  }

  function mover(id: string, direcao: "subir" | "descer") {
    startTransition(async () => {
      const res = await moverEscalao(id, direcao);
      if (!res.sucesso) toast.error(res.erro);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Escalões</h1>
        {podeCriar && <CriarEscalaoDialog />}
      </div>

      {escaloes.length === 0 ? (
        <p className="text-corpo-sec text-cinza-600">
          Nenhum escalão definido. Cria o primeiro.
        </p>
      ) : (
        <ul className="space-y-2">
          {escaloes.map((e, idx) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-3 shadow-card"
            >
              {/* Reordenar */}
              {geriveis.has(e.id) && (
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => mover(e.id, "subir")}
                    disabled={idx === 0 || pending}
                    className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                    aria-label="Subir"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => mover(e.id, "descer")}
                    disabled={idx === escaloes.length - 1 || pending}
                    className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                    aria-label="Descer"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Dados */}
              <div className="flex-1">
                <p className="text-corpo font-semibold text-cinza-900">{e.nome}</p>
                {(e.idadeMin != null || e.idadeMax != null) && (
                  <p className="text-legenda text-cinza-600">
                    {e.idadeMin != null && e.idadeMax != null
                      ? `${e.idadeMin}–${e.idadeMax} anos`
                      : e.idadeMin != null
                        ? `≥ ${e.idadeMin} anos`
                        : `≤ ${e.idadeMax} anos`}
                  </p>
                )}
              </div>

              {/* Ações */}
              {geriveis.has(e.id) && (
                <div className="flex items-center gap-1">
                  <EditarEscalaoDialog escalao={e} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Apagar escalão">
                        <Trash2 className="h-4 w-4 text-vermelho-600" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apagar «{e.nome}»?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação é irreversível. O escalão só pode ser apagado se não tiver atletas associados.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => apagar(e.id)}
                          className="bg-vermelho-600 hover:bg-vermelho-600/90 text-white"
                        >
                          Apagar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
