"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { guardarMetricasSessao } from "@/lib/actions/metricas";
import type { TipoMetrica } from "@prisma/client";

type Metrica = { id: string; nome: string; tipo: TipoMetrica };
type Atleta = { id: string; nome: string; numero: number | null };

/**
 * §8.20: grelha de métricas de treino (empenho, desempenho, …) por atleta
 * presente. Guarda em lote via `guardarMetricasSessao`.
 */
export function GestorMetricasSessao({
  sessaoId,
  metricas,
  atletas,
  valoresIniciais,
  fechado = false,
}: {
  sessaoId: string;
  metricas: Metrica[];
  atletas: Atleta[];
  valoresIniciais: Record<string, Record<string, number>>;
  fechado?: boolean;
}) {
  const [valores, setValores] =
    useState<Record<string, Record<string, number>>>(valoresIniciais);
  const [pending, startTransition] = useTransition();

  function atualizar(atletaId: string, metricaId: string, valor: number | null) {
    setValores((prev) => {
      const doAtleta = { ...(prev[atletaId] ?? {}) };
      if (valor == null) delete doAtleta[metricaId];
      else doAtleta[metricaId] = valor;
      return { ...prev, [atletaId]: doAtleta };
    });
  }

  function guardar() {
    const dados = atletas.map((a) => ({
      atletaId: a.id,
      valores: Object.entries(valores[a.id] ?? {}).map(([metricaId, valor]) => ({
        metricaId,
        valor,
      })),
    }));
    startTransition(async () => {
      const res = await guardarMetricasSessao(sessaoId, dados);
      if (res.sucesso) toast.success("Métricas guardadas");
      else toast.error(res.erro);
    });
  }

  return (
    <section className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <h2 className="text-corpo font-semibold text-cinza-900">Métricas do treino</h2>
      </div>
      <p className="mt-1 text-corpo-sec text-cinza-500">
        Pontuações por atleta (empenho, desempenho, …). Agregadas no perfil ao longo
        da época.
      </p>

      {atletas.length === 0 ? (
        <p className="mt-4 text-corpo-sec text-cinza-500">
          Marca as presenças primeiro para pontuar os atletas.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-corpo-sec">
              <thead>
                <tr className="border-b border-cinza-200 text-left">
                  <th className="sticky left-0 bg-white py-2 pr-3 font-medium text-cinza-500">
                    Atleta
                  </th>
                  {metricas.map((m) => (
                    <th key={m.id} className="px-2 py-2 font-medium text-cinza-500">
                      {m.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {atletas.map((a) => (
                  <tr key={a.id} className="border-b border-cinza-100">
                    <td className="sticky left-0 bg-white py-2 pr-3 text-cinza-900">
                      {a.numero != null && (
                        <span className="mr-1.5 text-cinza-400">#{a.numero}</span>
                      )}
                      {a.nome}
                    </td>
                    {metricas.map((m) => (
                      <td key={m.id} className="px-2 py-1.5">
                        <CampoMetrica
                          tipo={m.tipo}
                          valor={valores[a.id]?.[m.id] ?? null}
                          disabled={fechado}
                          onChange={(v) => atualizar(a.id, m.id, v)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!fechado && (
            <div className="mt-4 flex justify-end">
              <Button onClick={guardar} disabled={pending}>
                {pending ? "A guardar…" : "Guardar métricas"}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CampoMetrica({
  tipo,
  valor,
  onChange,
  disabled,
}: {
  tipo: TipoMetrica;
  valor: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  if (tipo === "BOOLEANO") {
    return (
      <Select
        value={valor == null ? "" : String(valor)}
        onValueChange={(v) => onChange(v === "" ? null : Number(v))}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 w-24">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Sim</SelectItem>
          <SelectItem value="0">Não</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (tipo === "ESCALA") {
    return (
      <Select
        value={valor == null ? "" : String(valor)}
        onValueChange={(v) => onChange(v === "" ? null : Number(v))}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 w-20">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4, 5].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      type="number"
      min={0}
      value={valor ?? ""}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value.trim();
        onChange(v === "" ? null : Number(v));
      }}
      className="h-9 w-24"
    />
  );
}
