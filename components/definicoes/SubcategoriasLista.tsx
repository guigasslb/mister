"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import {
  criarSubcategoria,
  atualizarSubcategoria,
  apagarSubcategoria,
  instalarSubcategoriasArranque,
} from "@/lib/actions/subcategorias";
import {
  CATEGORIAS_PRINCIPAIS,
  LABEL_CATEGORIA_PRINCIPAL,
} from "@/lib/schemas/subcategoria";
import type { SubcategoriaExercicio } from "@prisma/client";

function SubcategoriaForm({
  sub,
  onDone,
}: {
  sub?: SubcategoriaExercicio;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string>(sub?.categoria ?? "ATAQUE");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    const dados = {
      nome: String(fd.get("nome") ?? "").trim(),
      categoria,
      ordem: Number(fd.get("ordem") ?? 0),
    };
    startTransition(async () => {
      const res = sub
        ? await atualizarSubcategoria(sub.id, dados)
        : await criarSubcategoria(dados);
      if (res.sucesso) {
        toast.success(sub ? "Subcategoria atualizada" : "Subcategoria criada");
        onDone();
      } else setErro(res.erro);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome *</Label>
        <Input id="nome" name="nome" required minLength={1} maxLength={80} defaultValue={sub?.nome ?? ""} placeholder="ex: Finalização" />
      </div>
      <div className="space-y-1.5">
        <Label>Categoria principal *</Label>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIAS_PRINCIPAIS.map((c) => (
              <SelectItem key={c} value={c}>{LABEL_CATEGORIA_PRINCIPAL[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ordem">Ordem</Label>
        <Input id="ordem" name="ordem" type="number" min={0} max={999} defaultValue={sub?.ordem ?? 0} className="max-w-24" />
      </div>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={pending}>{pending ? "A guardar…" : "Guardar"}</Button>
      </div>
    </form>
  );
}

function CriarDialog() {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" />Nova subcategoria</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova subcategoria</DialogTitle></DialogHeader>
        <SubcategoriaForm onDone={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditarDialog({ sub }: { sub: SubcategoriaExercicio }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editar" disabled={sub.sistema}>
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar subcategoria</DialogTitle></DialogHeader>
        <SubcategoriaForm sub={sub} onDone={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function SubcategoriasLista({
  subcategorias,
  podeGerir = false,
}: {
  subcategorias: SubcategoriaExercicio[];
  podeGerir?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function apagar(id: string) {
    startTransition(async () => {
      const res = await apagarSubcategoria(id);
      if (res.sucesso) toast.success("Subcategoria apagada");
      else toast.error(res.erro);
    });
  }

  function instalar() {
    startTransition(async () => {
      const res = await instalarSubcategoriasArranque();
      if (res.sucesso) toast.success(`${res.dados.criadas} subcategorias instaladas`);
      else toast.error(res.erro);
    });
  }

  // Agrupar por categoria
  const grupos = CATEGORIAS_PRINCIPAIS.map((cat) => ({
    cat,
    label: LABEL_CATEGORIA_PRINCIPAL[cat],
    lista: subcategorias.filter((s) => s.categoria === cat),
  })).filter((g) => g.lista.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Subcategorias de exercícios</h1>
          <p className="mt-1 text-corpo-sec text-cinza-600">
            Classificação de segundo nível para a biblioteca de exercícios.
          </p>
        </div>
        {podeGerir && (
          <div className="flex gap-2">
            {subcategorias.length === 0 && (
              <Button variant="outline" onClick={instalar} disabled={pending}>
                {pending ? "A instalar…" : "Instalar predefinições"}
              </Button>
            )}
            <CriarDialog />
          </div>
        )}
      </div>

      {subcategorias.length === 0 ? (
        <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
          Ainda não há subcategorias. Instala as predefinições ou cria uma nova.
        </p>
      ) : (
        <div className="space-y-6">
          {grupos.map(({ cat, label, lista }) => (
            <div key={cat}>
              <h2 className="mb-2 text-corpo font-semibold text-cinza-700">{label}</h2>
              <ul className="space-y-1.5">
                {lista.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white px-4 py-2.5 shadow-card"
                  >
                    <span className="flex-1 text-corpo text-cinza-900">{s.nome}</span>
                    {s.sistema && (
                      <span className="text-legenda text-cinza-400">Sistema</span>
                    )}
                    {podeGerir && (
                      <>
                        <EditarDialog sub={s} />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Apagar"
                              disabled={pending || s.sistema}
                            >
                              <Trash2 className="h-4 w-4 text-vermelho-600" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Apagar «{s.nome}»?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Os exercícios associados perdem esta subcategoria mas mantêm-se na biblioteca.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => apagar(s.id)}
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
          ))}
        </div>
      )}
    </div>
  );
}
