"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
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
import { criarPerfil, atualizarPerfil, apagarPerfil } from "@/lib/actions/perfis";
import {
  CAPACIDADES,
  LABEL_CAPACIDADE,
  CAPACIDADES_ESTRUTURA,
  type Capacidade,
} from "@/lib/permissoes-catalogo";
import type { Perfil } from "@prisma/client";

const LABEL_AMBITO: Record<string, string> = {
  TODO_CLUBE: "Todo o clube",
  PROPRIOS_ESCALOES: "Próprios escalões",
};

function PerfilForm({
  perfil,
  onDone,
}: {
  perfil?: Perfil;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ambito, setAmbito] = useState<string>(perfil?.ambito ?? "PROPRIOS_ESCALOES");
  const [caps, setCaps] = useState<Set<string>>(
    () => new Set(perfil?.capacidades ?? []),
  );

  function alternar(cap: Capacidade) {
    setCaps((prev) => {
      const novo = new Set(prev);
      if (novo.has(cap)) novo.delete(cap);
      else novo.add(cap);
      return novo;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    const dados = {
      nome: fd.get("nome"),
      descricao: String(fd.get("descricao") ?? "").trim() || undefined,
      ambito,
      capacidades: [...caps],
    };
    startTransition(async () => {
      const res = perfil ? await atualizarPerfil(perfil.id, dados) : await criarPerfil(dados);
      if (res.sucesso) {
        toast.success(perfil ? "Perfil atualizado" : "Perfil criado");
        onDone();
      } else setErro(res.erro);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome *</Label>
        <Input id="nome" name="nome" defaultValue={perfil?.nome ?? ""} required minLength={2} maxLength={60} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="descricao">Descrição</Label>
        <Input id="descricao" name="descricao" defaultValue={perfil?.descricao ?? ""} maxLength={200} />
      </div>
      <div className="space-y-1.5">
        <Label>Âmbito</Label>
        <Select value={ambito} onValueChange={setAmbito}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODO_CLUBE">Todo o clube</SelectItem>
            <SelectItem value="PROPRIOS_ESCALOES">Próprios escalões</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-legenda text-cinza-400">
          &quot;Próprios escalões&quot; limita as permissões de equipa aos escalões atribuídos ao membro.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Capacidades</Label>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {CAPACIDADES.map((cap) => (
            <label
              key={cap}
              className="flex items-center gap-2 rounded border border-cinza-200 px-2.5 py-1.5 text-corpo-sec"
            >
              <input
                type="checkbox"
                checked={caps.has(cap)}
                onChange={() => alternar(cap)}
                className="h-4 w-4 accent-primary"
              />
              <span className={CAPACIDADES_ESTRUTURA.includes(cap) ? "font-medium" : ""}>
                {LABEL_CAPACIDADE[cap]}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "A guardar…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

function CriarPerfilDialog() {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" />Novo perfil</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo perfil</DialogTitle></DialogHeader>
        <PerfilForm onDone={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditarPerfilDialog({ perfil }: { perfil: Perfil }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editar perfil">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar perfil — {perfil.nome}</DialogTitle></DialogHeader>
        <PerfilForm perfil={perfil} onDone={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function PerfisLista({
  perfis,
  podeGerir = false,
}: {
  perfis: Perfil[];
  podeGerir?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function apagar(id: string) {
    startTransition(async () => {
      const res = await apagarPerfil(id);
      if (res.sucesso) toast.success("Perfil apagado");
      else toast.error(res.erro);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Perfis</h1>
          <p className="mt-1 text-corpo-sec text-cinza-600">
            Pacotes de permissões. Edita os de arranque ou cria os teus.
          </p>
        </div>
        {podeGerir && <CriarPerfilDialog />}
      </div>

      <ul className="space-y-2">
        {perfis.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-4 shadow-card"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/5">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-corpo font-semibold text-cinza-900">
                {p.nome}
                {p.sistema && (
                  <span className="ml-2 rounded-full bg-cinza-50 px-2 py-0.5 text-legenda text-cinza-500">
                    arranque
                  </span>
                )}
              </p>
              <p className="text-legenda text-cinza-600">
                {LABEL_AMBITO[p.ambito]} · {p.capacidades.length} capacidade(s)
              </p>
            </div>
            {podeGerir && (
              <>
                <EditarPerfilDialog perfil={p} />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Apagar perfil">
                      <Trash2 className="h-4 w-4 text-vermelho-600" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Apagar «{p.nome}»?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Só é possível apagar perfis que não estejam atribuídos a membros.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => apagar(p.id)}
                        className="bg-vermelho-600 hover:bg-vermelho-600/90 text-white"
                      >
                        Apagar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
