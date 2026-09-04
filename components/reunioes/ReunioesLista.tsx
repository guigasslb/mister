"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users2, Pin, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  criarReuniao,
  atualizarReuniao,
  apagarReuniao,
  alternarAfixadaReuniao,
} from "@/lib/actions/reunioes";
import { LABEL_AMBITO_REUNIAO } from "@/lib/schemas/reuniao";
import { formatarDataHoraLisboa, instantToWallClockLisbon, wallClockLisbonToInstant } from "@/lib/utils-datas";
import type { Reuniao } from "@prisma/client";

type EscalaoBasico = { id: string; nome: string };

function dtInput(d: Date | null | undefined): string {
  if (!d) return "";
  return instantToWallClockLisbon(new Date(d));
}

function Form({
  escaloes,
  reuniao,
  onDone,
}: {
  escaloes: EscalaoBasico[];
  reuniao?: Reuniao;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ambito, setAmbito] = useState(reuniao?.ambito ?? "CLUBE");
  const [escalaoId, setEscalaoId] = useState(reuniao?.escalaoId ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    const dados = {
      titulo: String(fd.get("titulo")),
      data: wallClockLisbonToInstant(String(fd.get("data"))).toISOString(),
      ambito,
      escalaoId: ambito === "ESCALAO" ? escalaoId || undefined : undefined,
      participantes: String(fd.get("participantes") ?? "").trim() || undefined,
      ordemTrabalhos: String(fd.get("ordemTrabalhos") ?? "").trim() || undefined,
      ata: String(fd.get("ata") ?? "").trim() || undefined,
    };
    startTransition(async () => {
      const res = reuniao ? await atualizarReuniao(reuniao.id, dados) : await criarReuniao(dados);
      if (res.sucesso) {
        toast.success(reuniao ? "Reunião atualizada" : "Reunião criada");
        onDone();
      } else setErro(res.erro);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}
      <div className="space-y-1.5">
        <Label htmlFor="titulo">Título *</Label>
        <Input id="titulo" name="titulo" required maxLength={150} defaultValue={reuniao?.titulo ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="data">Data e hora *</Label>
          <Input id="data" name="data" type="datetime-local" required defaultValue={dtInput(reuniao?.data)} />
        </div>
        <div className="space-y-1.5">
          <Label>Âmbito</Label>
          <Select value={ambito} onValueChange={(v) => setAmbito(v as typeof ambito)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CLUBE">Clube</SelectItem>
              <SelectItem value="ESCALAO">Escalão</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {ambito === "ESCALAO" && (
        <div className="space-y-1.5">
          <Label>Escalão *</Label>
          <Select value={escalaoId} onValueChange={setEscalaoId}>
            <SelectTrigger><SelectValue placeholder="Seleciona" /></SelectTrigger>
            <SelectContent>
              {escaloes.map((e) => (<SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="participantes">Participantes</Label>
        <Input id="participantes" name="participantes" maxLength={1000} defaultValue={reuniao?.participantes ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ordemTrabalhos">Ordem de trabalhos</Label>
        <Textarea id="ordemTrabalhos" name="ordemTrabalhos" rows={3} defaultValue={reuniao?.ordemTrabalhos ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ata">Ata</Label>
        <Textarea id="ata" name="ata" rows={5} defaultValue={reuniao?.ata ?? ""} placeholder="Registo da reunião…" />
      </div>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={pending || (ambito === "ESCALAO" && !escalaoId)}>
          {pending ? "A guardar…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

/** Secção colapsável (disclosure) de um campo de texto de reunião. */
function SeccaoColapsavel({ titulo, conteudo }: { titulo: string; conteudo: string | null }) {
  const temConteudo = !!conteudo?.trim();
  return (
    <details open={temConteudo} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-corpo-sec font-semibold text-cinza-700 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-cinza-400 transition-transform group-open:rotate-90" />
        {titulo}
      </summary>
      {temConteudo ? (
        <p className="mt-1 whitespace-pre-wrap pl-5 text-corpo-sec text-cinza-700">{conteudo}</p>
      ) : (
        <p className="mt-1 pl-5 text-corpo-sec italic text-cinza-400">Sem registo.</p>
      )}
    </details>
  );
}

export function ReunioesLista({
  reunioes,
  escaloes,
}: {
  reunioes: Reuniao[];
  escaloes: EscalaoBasico[];
}) {
  const [criar, setCriar] = useState(false);
  const [editar, setEditar] = useState<Reuniao | null>(null);
  const [pending, startTransition] = useTransition();

  const nomeEscalao = (id: string | null) => escaloes.find((e) => e.id === id)?.nome ?? "Escalão";

  function apagar(id: string) {
    startTransition(async () => {
      const res = await apagarReuniao(id);
      if (res.sucesso) toast.success("Reunião apagada");
      else toast.error(res.erro);
    });
  }

  function afixar(r: Reuniao) {
    startTransition(async () => {
      const res = await alternarAfixadaReuniao(r.id);
      if (res.sucesso) toast.success(r.afixada ? "Reunião removida do início" : "Reunião afixada no início");
      else toast.error(res.erro);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Reuniões</h1>
          <p className="mt-1 text-corpo-sec text-cinza-600">Ao nível do clube ou de um escalão, com ata.</p>
        </div>
        <Dialog open={criar} onOpenChange={setCriar}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4" />Nova reunião</Button></DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova reunião</DialogTitle></DialogHeader>
            <Form escaloes={escaloes} onDone={() => setCriar(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {reunioes.length === 0 ? (
        <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
          Ainda não há reuniões registadas.
        </p>
      ) : (
        <ul className="space-y-2">
          {reunioes.map((r) => (
            <li key={r.id} className="rounded-md border border-cinza-200 bg-white p-4 shadow-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/5">
                  <Users2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-corpo font-semibold text-cinza-900">{r.titulo}</p>
                  <p className="text-legenda text-cinza-500">
                    {formatarDataHoraLisboa(r.data, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {" · "}
                    {r.ambito === "CLUBE" ? LABEL_AMBITO_REUNIAO.CLUBE : nomeEscalao(r.escalaoId)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={r.afixada ? "Remover do início" : "Afixar no início"}
                  aria-pressed={r.afixada}
                  disabled={pending}
                  onClick={() => afixar(r)}
                >
                  <Pin
                    className={`h-4 w-4 ${r.afixada ? "fill-primary text-primary" : "text-cinza-500"}`}
                  />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditar(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Apagar" disabled={pending}>
                      <Trash2 className="h-4 w-4 text-vermelho-600" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Apagar «{r.titulo}»?</AlertDialogTitle>
                      <AlertDialogDescription>Esta ação é irreversível.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => apagar(r.id)} className="bg-vermelho-600 hover:bg-vermelho-600/90 text-white">Apagar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="mt-3 space-y-1 border-t border-cinza-100 pt-3">
                <SeccaoColapsavel titulo="Ordem de trabalhos" conteudo={r.ordemTrabalhos} />
                <SeccaoColapsavel titulo="Ata" conteudo={r.ata} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editar !== null} onOpenChange={(v) => !v && setEditar(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar reunião</DialogTitle></DialogHeader>
          {editar && <Form escaloes={escaloes} reuniao={editar} onDone={() => setEditar(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
