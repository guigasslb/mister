"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  SeletorDiasPlano,
  diasIniciais,
  diasParaPayload,
  type DiaConfig,
} from "@/components/treinos/SeletorDiasPlano";
import { atualizarPlanoSemanal } from "@/lib/actions/planoSemanal";
import { atualizarPlanoSemanalSchema } from "@/lib/schemas/planoSemanal";
import type { TipoSessao } from "@prisma/client";

type DiaExistente = {
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
  local: string | null;
  tipoSessao: TipoSessao;
};

/** Preenche o estado dos 7 dias com a configuração já existente do plano. */
function estadoInicial(dias: DiaExistente[]): DiaConfig[] {
  const base = diasIniciais();
  for (const d of dias) {
    const i = d.diaSemana - 1;
    if (i < 0 || i > 6) continue;
    base[i] = {
      diaSemana: d.diaSemana,
      ativo: true,
      horaInicio: d.horaInicio,
      horaFim: d.horaFim,
      local: d.local ?? "",
      tipoSessao: d.tipoSessao,
    };
  }
  return base;
}

export function EditarPlanoDialog({
  planoId,
  nomeInicial,
  ativoInicial,
  diasExistentes,
}: {
  planoId: string;
  nomeInicial: string | null;
  ativoInicial: boolean;
  diasExistentes: DiaExistente[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  const [nome, setNome] = useState<string>(nomeInicial ?? "");
  const [ativo, setAtivo] = useState<boolean>(ativoInicial);
  const [dias, setDias] = useState<DiaConfig[]>(() => estadoInicial(diasExistentes));

  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  function repor() {
    setNome(nomeInicial ?? "");
    setAtivo(ativoInicial);
    setDias(estadoInicial(diasExistentes));
    setErros({});
    setErroGeral(null);
  }

  function handleGuardar() {
    setErroGeral(null);
    const dados = {
      nome: nome.trim() || undefined,
      ativo,
      dias: diasParaPayload(dias),
    };

    const parsed = atualizarPlanoSemanalSchema.safeParse(dados);
    if (!parsed.success) {
      const campos: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const chave = issue.path[0];
        if (typeof chave === "string" && !campos[chave]) campos[chave] = issue.message;
      }
      setErros(campos);
      return;
    }
    setErros({});

    startTransition(async () => {
      const res = await atualizarPlanoSemanal(planoId, dados);
      if (res.sucesso) {
        const { geradas, apagadas, desvinculadas, propagadas } = res.dados;
        const partes: string[] = [];
        if (geradas > 0) partes.push(`${geradas} gerada(s)`);
        if (propagadas > 0) partes.push(`${propagadas} atualizada(s)`);
        if (apagadas > 0) partes.push(`${apagadas} apagada(s)`);
        if (desvinculadas > 0) partes.push(`${desvinculadas} desvinculada(s)`);
        toast.success(
          partes.length > 0 ? `Horário atualizado · ${partes.join(" · ")}` : "Horário atualizado",
        );
        setAberto(false);
        router.refresh();
      } else {
        setErroGeral(res.erro);
        if (res.camposInvalidos) setErros(res.camposInvalidos);
      }
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (pending) return;
        if (v) repor();
        setAberto(v);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar horário de treinos</DialogTitle>
          <DialogDescription>
            Alterar dias/horários aplica-se às sessões futuras. As passadas ficam intactas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {erroGeral && (
            <p role="alert" className="text-corpo-sec text-vermelho-600">
              {erroGeral}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="nome-plano">Nome do horário</Label>
            <Input
              id="nome-plano"
              value={nome}
              maxLength={100}
              placeholder="ex: Plantel A — 2025/26"
              onChange={(e) => setNome(e.target.value)}
            />
            {erros.nome && <p className="text-legenda text-vermelho-600">{erros.nome}</p>}
          </div>

          <div className="flex items-center justify-between rounded-md border border-cinza-200 p-3">
            <div>
              <Label htmlFor="ativo-plano">Horário ativo</Label>
              <p className="text-legenda text-cinza-500">
                Só pode haver um horário ativo por escalão nesta época.
              </p>
            </div>
            <Switch id="ativo-plano" checked={ativo} onCheckedChange={setAtivo} />
          </div>

          <SeletorDiasPlano
            valor={dias}
            onChange={setDias}
            desativado={pending}
            erro={erros.dias}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setAberto(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={pending} onClick={handleGuardar}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
