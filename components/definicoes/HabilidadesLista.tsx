"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  criarHabilidade,
  atualizarHabilidade,
  apagarHabilidade,
  moverHabilidade,
} from "@/lib/actions/habilidades";
import { LABEL_NIVEL } from "@/lib/schemas/habilidade";
import type { Habilidade, NivelHabilidade } from "@prisma/client";

const NIVEIS: NivelHabilidade[] = ["BASICO", "INTERMEDIO", "AVANCADO"];

function HabilidadeForm({
  defaultValues,
  onSubmit,
  pending,
  erro,
  fixarNivel,
}: {
  defaultValues?: Partial<Habilidade>;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  erro: string | null;
  fixarNivel?: NivelHabilidade;
}) {
  const [nivel, setNivel] = useState<NivelHabilidade>(
    defaultValues?.nivel ?? fixarNivel ?? "BASICO",
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome *</Label>
        <Input id="nome" name="nome" defaultValue={defaultValues?.nome ?? ""} required maxLength={80} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="descricao">Descrição</Label>
        <Input id="descricao" name="descricao" defaultValue={defaultValues?.descricao ?? ""} maxLength={300} />
      </div>
      {!fixarNivel && (
        <div className="space-y-1.5">
          <Label>Nível</Label>
          <Select value={nivel} onValueChange={(v) => setNivel(v as NivelHabilidade)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NIVEIS.map((n) => (
                <SelectItem key={n} value={n}>
                  {LABEL_NIVEL[n]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="nivel" value={nivel} />
        </div>
      )}
      {fixarNivel && <input type="hidden" name="nivel" value={fixarNivel} />}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "A guardar…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

function CriarHabilidadeDialog({ nivel }: { nivel: NivelHabilidade }) {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    startTransition(async () => {
      const res = await criarHabilidade({
        nome: fd.get("nome"),
        descricao: fd.get("descricao") || undefined,
        nivel: fd.get("nivel"),
      });
      if (res.sucesso) {
        toast.success("Habilidade criada");
        setAberto(false);
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova habilidade — {LABEL_NIVEL[nivel]}</DialogTitle>
        </DialogHeader>
        <HabilidadeForm onSubmit={handleSubmit} pending={pending} erro={erro} fixarNivel={nivel} />
      </DialogContent>
    </Dialog>
  );
}

function EditarHabilidadeDialog({ habilidade }: { habilidade: Habilidade }) {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    startTransition(async () => {
      const res = await atualizarHabilidade(habilidade.id, {
        nome: fd.get("nome"),
        descricao: fd.get("descricao") || undefined,
        nivel: fd.get("nivel"),
      });
      if (res.sucesso) {
        toast.success("Habilidade atualizada");
        setAberto(false);
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editar habilidade">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar habilidade</DialogTitle>
        </DialogHeader>
        <HabilidadeForm
          defaultValues={habilidade}
          onSubmit={handleSubmit}
          pending={pending}
          erro={erro}
        />
      </DialogContent>
    </Dialog>
  );
}

function GrupoNivel({
  nivel,
  habilidades,
  podeGerir,
}: {
  nivel: NivelHabilidade;
  habilidades: Habilidade[];
  podeGerir: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function apagar(id: string) {
    startTransition(async () => {
      const res = await apagarHabilidade(id);
      if (res.sucesso) toast.success("Habilidade apagada");
      else toast.error(res.erro);
    });
  }

  function mover(id: string, direcao: "subir" | "descer") {
    startTransition(async () => {
      const res = await moverHabilidade(id, direcao);
      if (!res.sucesso) toast.error(res.erro);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2>{LABEL_NIVEL[nivel]}</h2>
        {podeGerir && <CriarHabilidadeDialog nivel={nivel} />}
      </div>

      {habilidades.length === 0 ? (
        <p className="text-corpo-sec text-cinza-600">Nenhuma habilidade neste nível.</p>
      ) : (
        <ul className="space-y-2">
          {habilidades.map((h, idx) => (
            <li
              key={h.id}
              className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-3 shadow-card"
            >
              {podeGerir && (
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => mover(h.id, "subir")}
                    disabled={idx === 0 || pending}
                    className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                    aria-label="Subir"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => mover(h.id, "descer")}
                    disabled={idx === habilidades.length - 1 || pending}
                    className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                    aria-label="Descer"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="flex-1">
                <p className="text-corpo font-medium text-cinza-900">{h.nome}</p>
                {h.descricao && (
                  <p className="text-legenda text-cinza-600">{h.descricao}</p>
                )}
              </div>

              {podeGerir && (
                <div className="flex items-center gap-1">
                  <EditarHabilidadeDialog habilidade={h} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Apagar habilidade">
                        <Trash2 className="h-4 w-4 text-vermelho-600" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apagar «{h.nome}»?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação é irreversível.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => apagar(h.id)}
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

export function HabilidadesLista({
  habilidades,
  podeGerir = false,
}: {
  habilidades: Habilidade[];
  podeGerir?: boolean;
}) {
  const porNivel = (nivel: NivelHabilidade) =>
    habilidades.filter((h) => h.nivel === nivel);

  return (
    <div className="space-y-6">
      <h1>Habilidades</h1>
      {NIVEIS.map((nivel, i) => (
        <div key={nivel}>
          {i > 0 && <Separator className="mb-6" />}
          <GrupoNivel nivel={nivel} habilidades={porNivel(nivel)} podeGerir={podeGerir} />
        </div>
      ))}
    </div>
  );
}
