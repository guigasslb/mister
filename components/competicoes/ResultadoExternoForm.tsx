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
import { combinarDataHora } from "@/lib/calendario-wizard";
import { opcoesRonda } from "@/lib/confronto-dialogos-ui";
import type { CasaFora, EstadoResultado, FormatoCompeticao } from "@prisma/client";

const ESTADOS: EstadoResultado[] = ["REALIZADO", "AGENDADO", "CANCELADO", "WALKOVER"];
const SEM_RONDA = "__sem__";

export function ResultadoExternoForm({
  competicaoId,
  formato,
  rondaMaxima,
}: {
  competicaoId: string;
  formato: FormatoCompeticao;
  /** Maior jornada/ronda em uso (0 sem confrontos) — opções 1…máx+1. */
  rondaMaxima: number;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // P1.6 (§23.7): o estado do confronto controla que campos são pedidos.
  const [estado, setEstado] = useState<EstadoResultado>("REALIZADO");
  const [walkoverVencedor, setWalkoverVencedor] = useState<CasaFora>("CASA");
  const [ronda, setRonda] = useState<number | null>(null);
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const rotuloRonda = formato === "LIGA" ? "Jornada" : "Ronda";

  function reiniciar() {
    setErro(null);
    setEstado("REALIZADO");
    setWalkoverVencedor("CASA");
    setRonda(null);
    setData("");
    setHora("");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);

    const equipaCasaNome = String(fd.get("equipaCasa") ?? "").trim();
    const equipaForaNome = String(fd.get("equipaFora") ?? "").trim();
    const dataHora = combinarDataHora(data, hora);

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
      // Jornada e data/hora só seguem quando preenchidas (sem elas: igual a antes).
      ...(ronda !== null ? { ronda } : {}),
      ...(dataHora ? { dataHora } : {}),
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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

          <div className="space-y-1.5">
            <Label htmlFor="ronda">{rotuloRonda}</Label>
            <Select
              value={ronda === null ? SEM_RONDA : String(ronda)}
              onValueChange={(v) => setRonda(v === SEM_RONDA ? null : Number(v))}
            >
              <SelectTrigger id="ronda">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_RONDA}>Sem {rotuloRonda.toLowerCase()}</SelectItem>
                {opcoesRonda(rondaMaxima).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {rotuloRonda} {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="data-confronto">Data</Label>
                <Input
                  id="data-confronto"
                  type="date"
                  value={data}
                  onChange={(e) => {
                    setData(e.target.value);
                    if (e.target.value === "") setHora("");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hora-confronto">Hora</Label>
                <Input
                  id="hora-confronto"
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  disabled={data === ""}
                />
              </div>
            </div>
            <p className="text-legenda text-cinza-500">
              Se o confronto for da tua equipa e tiver data, aparece em /jogos.
            </p>
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
