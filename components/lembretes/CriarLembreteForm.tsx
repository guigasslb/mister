"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { criarLembrete } from "@/lib/actions/lembretes";
import { wallClockLisbonToInstant } from "@/lib/utils-datas";

export type MembroBasico = { utilizadorId: string; nome: string };

/**
 * Formulário de criação de lembrete/tarefa (P2.1 — §3.15/§8.19).
 * Os destinatários são membros (utilizadores) do clube; a seleção é opcional
 * (um lembrete sem destinatários é pessoal do criador).
 */
export function CriarLembreteForm({
  membros,
  onDone,
}: {
  membros: MembroBasico[];
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [destinatarioIds, setDestinatarioIds] = useState<string[]>([]);

  function alternar(id: string) {
    setDestinatarioIds((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    const dataLimiteRaw = String(fd.get("dataLimite") ?? "").trim();
    const dados = {
      titulo: String(fd.get("titulo") ?? "").trim(),
      descricao: String(fd.get("descricao") ?? "").trim() || undefined,
      dataLimite: dataLimiteRaw
        ? wallClockLisbonToInstant(dataLimiteRaw).toISOString()
        : undefined,
      destinatarioIds,
    };
    startTransition(async () => {
      const res = await criarLembrete(dados);
      if (res.sucesso) {
        toast.success("Lembrete criado");
        setDestinatarioIds([]);
        onDone?.();
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

      <div className="space-y-1.5">
        <Label htmlFor="titulo">Título *</Label>
        <Input id="titulo" name="titulo" required minLength={2} maxLength={200} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" rows={3} maxLength={1000} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dataLimite">Data limite</Label>
        <Input id="dataLimite" name="dataLimite" type="datetime-local" />
      </div>

      <div className="space-y-1.5">
        <Label>Destinatários</Label>
        {membros.length === 0 ? (
          <p className="text-legenda text-cinza-500">Sem outros membros no clube.</p>
        ) : (
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-cinza-200 p-2">
            {membros.map((m) => (
              <label
                key={m.utilizadorId}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-cinza-50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[color:var(--cor-primaria)]"
                  checked={destinatarioIds.includes(m.utilizadorId)}
                  onChange={() => alternar(m.utilizadorId)}
                />
                <span className="text-corpo-sec text-cinza-900">{m.nome}</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-legenda text-cinza-500">
          Sem destinatários, o lembrete fica só para ti.
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "A guardar…" : "Criar lembrete"}
        </Button>
      </div>
    </form>
  );
}
