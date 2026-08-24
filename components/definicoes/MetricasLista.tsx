"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
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
import { criarMetrica, alternarMetrica, moverMetrica } from "@/lib/actions/metricas";
import { LABEL_TIPO } from "@/lib/schemas/metrica";
import type { MetricaConfig, TipoMetrica } from "@prisma/client";

function CriarMetricaDialog() {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoMetrica>("NUMERO");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    startTransition(async () => {
      const res = await criarMetrica({ nome: fd.get("nome"), tipo });
      if (res.sucesso) {
        toast.success("Métrica criada");
        setAberto(false);
        setTipo("NUMERO");
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
          Nova métrica
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova métrica</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" name="nome" required maxLength={60} placeholder="ex: Dribles completados" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMetrica)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LABEL_TIPO) as TipoMetrica[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {LABEL_TIPO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "A criar…" : "Criar métrica"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MetricasLista({
  metricas,
  podeGerir = false,
}: {
  metricas: MetricaConfig[];
  podeGerir?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function alternar(id: string, ativa: boolean) {
    startTransition(async () => {
      const res = await alternarMetrica(id, ativa);
      if (!res.sucesso) toast.error(res.erro);
    });
  }

  function mover(id: string, direcao: "subir" | "descer") {
    startTransition(async () => {
      const res = await moverMetrica(id, direcao);
      if (!res.sucesso) toast.error(res.erro);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Métricas</h1>
          <p className="mt-1 text-corpo-sec text-cinza-600">
            As métricas ativas aparecem na grelha de estatísticas dos jogos.
          </p>
        </div>
        {podeGerir && <CriarMetricaDialog />}
      </div>

      {metricas.length === 0 ? (
        <p className="text-corpo-sec text-cinza-600">
          Nenhuma métrica configurada. Cria a primeira.
        </p>
      ) : (
        <ul className="space-y-2">
          {metricas.map((m, idx) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-3 shadow-card"
            >
              {/* Reordenar */}
              {podeGerir && (
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => mover(m.id, "subir")}
                    disabled={idx === 0 || pending}
                    className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                    aria-label="Subir"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => mover(m.id, "descer")}
                    disabled={idx === metricas.length - 1 || pending}
                    className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                    aria-label="Descer"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Dados */}
              <div className="flex-1">
                <p className="text-corpo font-semibold text-cinza-900">{m.nome}</p>
                <p className="text-legenda text-cinza-600">{LABEL_TIPO[m.tipo]}</p>
              </div>

              {/* Estado */}
              <Badge
                className={
                  m.ativa
                    ? "bg-verde-600 text-white text-legenda"
                    : "bg-cinza-200 text-cinza-600 text-legenda"
                }
              >
                {m.ativa ? "Ativa" : "Inativa"}
              </Badge>

              {/* Toggle */}
              {podeGerir && (
                <Switch
                  checked={m.ativa}
                  disabled={pending}
                  onCheckedChange={(v) => alternar(m.id, v)}
                  aria-label={m.ativa ? "Desativar métrica" : "Ativar métrica"}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
