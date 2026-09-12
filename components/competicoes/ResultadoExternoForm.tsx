"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { registarConfronto } from "@/lib/actions/competicoes";
import { LABEL_ESTADO_RESULTADO } from "@/lib/schemas/competicao";
import type { CasaFora, EstadoResultado } from "@prisma/client";

const ESTADOS: EstadoResultado[] = ["REALIZADO", "AGENDADO", "CANCELADO", "WALKOVER"];

export function ResultadoExternoForm({ competicaoId }: { competicaoId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // P1.6 (§23.7): o estado do confronto controla que campos são pedidos.
  const [estado, setEstado] = useState<EstadoResultado>("REALIZADO");
  const [walkoverVencedor, setWalkoverVencedor] = useState<CasaFora>("CASA");

  function reiniciar() {
    setErro(null);
    setEstado("REALIZADO");
    setWalkoverVencedor("CASA");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);

    const equipaCasaNome = String(fd.get("equipaCasa") ?? "").trim();
    const equipaForaNome = String(fd.get("equipaFora") ?? "").trim();

    const dados = {
      equipaCasaNome,
      equipaForaNome,
      estado,
      // Golos só são relevantes num confronto realizado.
      ...(estado === "REALIZADO"
        ? {
            golosCasa: Number(fd.get("golosCasa") ?? 0),
            golosFora: Number(fd.get("golosFora") ?? 0),
          }
        : {}),
      // Vencedor obrigatório num walkover (§23.7).
      ...(estado === "WALKOVER" ? { walkoverVencedor } : {}),
    };

    startTransition(async () => {
      const res = await registarConfronto(competicaoId, dados);
      if (res.sucesso) {
        toast.success("Confronto registado");
        setAberto(false);
        reiniciar();
        router.refresh();
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) reiniciar();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4" />
          Adicionar confronto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar confronto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="estado">Estado</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as EstadoResultado)}>
              <SelectTrigger id="estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {LABEL_ESTADO_RESULTADO[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="equipaCasa">Equipa da casa *</Label>
              <Input id="equipaCasa" name="equipaCasa" required maxLength={100} placeholder="ex: FC Porto" />
            </div>
            {estado === "REALIZADO" ? (
              <div className="space-y-1.5">
                <Label htmlFor="golosCasa" className="sr-only">
                  Golos da casa
                </Label>
                <Input
                  id="golosCasa"
                  name="golosCasa"
                  type="number"
                  min={0}
                  max={99}
                  required
                  defaultValue={0}
                  className="w-16 text-center"
                  aria-label="Golos da equipa da casa"
                />
              </div>
            ) : (
              <div className="space-y-1.5" />
            )}
            <div className="space-y-1.5" />
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="equipaFora">Equipa visitante *</Label>
              <Input id="equipaFora" name="equipaFora" required maxLength={100} placeholder="ex: Benfica" />
            </div>
            {estado === "REALIZADO" ? (
              <div className="space-y-1.5">
                <Label htmlFor="golosFora" className="sr-only">
                  Golos do visitante
                </Label>
                <Input
                  id="golosFora"
                  name="golosFora"
                  type="number"
                  min={0}
                  max={99}
                  required
                  defaultValue={0}
                  className="w-16 text-center"
                  aria-label="Golos da equipa visitante"
                />
              </div>
            ) : (
              <div className="space-y-1.5" />
            )}
            <div className="space-y-1.5" />
          </div>

          {estado === "WALKOVER" && (
            <div className="space-y-1.5">
              <Label htmlFor="walkoverVencedor">Vencedor do walkover</Label>
              <Select
                value={walkoverVencedor}
                onValueChange={(v) => setWalkoverVencedor(v as CasaFora)}
              >
                <SelectTrigger id="walkoverVencedor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASA">Casa vence</SelectItem>
                  <SelectItem value="FORA">Fora vence</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-legenda text-cinza-500">
                Conta como resultado regulamentar a favor do vencedor.
              </p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "A guardar…" : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
