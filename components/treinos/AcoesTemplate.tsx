"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Landmark, Trash2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  criarSessaoDeTemplate,
  partilharModeloSessaoNoClube,
  apagarModeloSessao,
} from "@/lib/actions/templatesSessao";
import { wallClockLisbonToInstant } from "@/lib/utils-datas";

/** Valor inicial do input datetime-local: próxima hora certa. */
function proximaHoraCerta(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

/**
 * Cria uma sessão de treino a partir do template (secção 3.4). Pede data/hora e
 * escalão — os exercícios e durações são copiados para a nova sessão.
 */
export function CriarSessaoDeTemplateButton({
  modeloSessaoId,
  nomeTemplate,
  escaloes,
  escalaoIdSugerido,
}: {
  modeloSessaoId: string;
  nomeTemplate: string;
  escaloes: { id: string; nome: string }[];
  escalaoIdSugerido?: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [escalaoId, setEscalaoId] = useState(escalaoIdSugerido ?? "");
  const [data, setData] = useState(proximaHoraCerta());
  const [erro, setErro] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const res = await criarSessaoDeTemplate({
        modeloSessaoId,
        escalaoId,
        data: wallClockLisbonToInstant(data).toISOString(),
      });
      if (res.sucesso) {
        toast.success("Sessão criada a partir do template");
        setAberto(false);
        router.push(`/treinos/${res.dados.id}`);
        router.refresh();
      } else {
        setErro(res.erro);
        toast.error(res.erro);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm" className="min-h-[44px]">
          <CalendarPlus className="h-4 w-4" />
          Criar sessão
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar sessão de «{nomeTemplate}»</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-corpo-sec text-cinza-600">
            Os exercícios e durações do template são copiados para a nova sessão. Depois
            podes editá-la livremente.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor={`data-${modeloSessaoId}`}>Data e hora *</Label>
            <Input
              id={`data-${modeloSessaoId}`}
              type="datetime-local"
              required
              value={data}
              onChange={(ev) => setData(ev.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`escalao-${modeloSessaoId}`}>Escalão *</Label>
            <Select value={escalaoId} onValueChange={setEscalaoId}>
              <SelectTrigger id={`escalao-${modeloSessaoId}`}>
                <SelectValue placeholder="Seleciona um escalão" />
              </SelectTrigger>
              <SelectContent>
                {escaloes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

          <div className="flex gap-3">
            <Button type="submit" disabled={pending || !escalaoId || !data}>
              {pending ? "A criar…" : "Criar sessão"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setAberto(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Contribui com um template 🎒 pessoal para a biblioteca 🏛️ do clube.
 * Ao contrário dos exercícios, a contribuição transfere a propriedade (secção 3.4).
 */
export function PartilharTemplateButton({ modeloSessaoId }: { modeloSessaoId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function partilhar() {
    startTransition(async () => {
      const res = await partilharModeloSessaoNoClube(modeloSessaoId);
      if (res.sucesso) {
        toast.success("Template partilhado na biblioteca do clube");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending} className="min-h-[44px]">
          <Landmark className="h-4 w-4" />
          {pending ? "A partilhar…" : "Partilhar no clube"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Partilhar o template no clube?</AlertDialogTitle>
          <AlertDialogDescription>
            O template passa a pertencer à biblioteca do clube e fica disponível para toda a
            equipa técnica. Ao contrário dos exercícios, esta contribuição transfere a
            propriedade — o template deixa de ser pessoal.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={partilhar}>Partilhar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ApagarTemplateButton({
  modeloSessaoId,
  nomeTemplate,
}: {
  modeloSessaoId: string;
  nomeTemplate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apagar() {
    startTransition(async () => {
      const res = await apagarModeloSessao(modeloSessaoId);
      if (res.sucesso) {
        toast.success("Template apagado");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          className="min-h-[44px] text-vermelho-600 hover:bg-vermelho-600/10 hover:text-vermelho-600"
        >
          <Trash2 className="h-4 w-4" />
          Apagar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar «{nomeTemplate}»?</AlertDialogTitle>
          <AlertDialogDescription>
            O template será apagado permanentemente. As sessões já criadas a partir dele não
            são afetadas — são cópias independentes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={apagar}
            className="bg-vermelho-600 text-white hover:bg-vermelho-600/90"
          >
            Apagar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
