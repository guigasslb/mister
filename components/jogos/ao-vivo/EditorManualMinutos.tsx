"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { editarEventosJogoAoVivo } from "@/lib/actions/jogo-ao-vivo";
import {
  intervalosParaEventos,
  type IntervaloManual,
} from "@/components/jogos/ao-vivo/acoes";

/** Linha editável: entrada/saída em minutos (null = campo vazio). */
interface LinhaMinutos {
  atletaId: string;
  nome: string;
  numero: number | null;
  entradaMin: number | null;
  saidaMin: number | null;
}

/**
 * Editor manual e inserção retroativa de minutos (§8.25.6). Tabela
 * `atleta | entrada (min) | saída (min) | minutos`, com edição inline e
 * recálculo automático dos minutos. Ao guardar, converte para intervalos em
 * segundos e chama `editarEventosJogoAoVivo`, que recalcula as estatísticas.
 *
 * Nota de design: o editor trabalha com **um intervalo por atleta** (entrada→saída).
 * Múltiplos intervalos por atleta (entra/sai/volta a entrar) continuam suportados
 * pelo registo ao vivo; a edição tabular simplifica para o caso comum e para a
 * inserção retroativa (jogo registado depois, sem cronómetro).
 */
export function EditorManualMinutos({
  jogoId,
  linhasIniciais,
}: {
  jogoId: string;
  linhasIniciais: LinhaMinutos[];
}) {
  const [linhas, setLinhas] = useState<LinhaMinutos[]>(linhasIniciais);
  const [pending, startTransition] = useTransition();

  function atualizar(atletaId: string, patch: Partial<LinhaMinutos>) {
    setLinhas((prev) =>
      prev.map((l) => (l.atletaId === atletaId ? { ...l, ...patch } : l)),
    );
  }

  function minutosDe(l: LinhaMinutos): number {
    if (l.entradaMin == null || l.saidaMin == null) return 0;
    return Math.max(0, l.saidaMin - l.entradaMin);
  }

  function guardar() {
    const intervalos: IntervaloManual[] = linhas
      .filter((l) => l.entradaMin != null && l.saidaMin != null && l.saidaMin > l.entradaMin)
      .map((l) => ({
        atletaId: l.atletaId,
        entradaSegundo: (l.entradaMin as number) * 60,
        saidaSegundo: (l.saidaMin as number) * 60,
      }));

    startTransition(async () => {
      const res = await editarEventosJogoAoVivo(jogoId, intervalosParaEventos(intervalos));
      if (res.sucesso) toast.success("Minutos atualizados");
      else toast.error(res.erro);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-cinza-200 bg-white p-4 shadow-card">
      <div>
        <h3 className="text-subtitulo text-cinza-900">Editar minutos (Modo Jogo ao Vivo)</h3>
        <p className="text-legenda text-cinza-500">
          Ajusta a entrada e a saída de cada atleta (em minutos). Os minutos são
          recalculados automaticamente.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-corpo-sec">
          <thead>
            <tr className="border-b border-cinza-100 text-left text-legenda uppercase tracking-wide text-cinza-500">
              <th className="py-2 pr-2 font-medium">Atleta</th>
              <th className="w-24 py-2 px-1 font-medium">Entrada</th>
              <th className="w-24 py-2 px-1 font-medium">Saída</th>
              <th className="w-20 py-2 pl-1 text-right font-medium">Minutos</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.atletaId} className="border-b border-cinza-50 last:border-0">
                <td className="py-2 pr-2 text-cinza-900">
                  {l.numero != null && <span className="mr-1 text-cinza-400">#{l.numero}</span>}
                  {l.nome}
                </td>
                <td className="px-1 py-1.5">
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={l.entradaMin ?? ""}
                    onChange={(e) =>
                      atualizar(l.atletaId, {
                        entradaMin: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="h-10"
                    aria-label={`Minuto de entrada de ${l.nome}`}
                  />
                </td>
                <td className="px-1 py-1.5">
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={l.saidaMin ?? ""}
                    onChange={(e) =>
                      atualizar(l.atletaId, {
                        saidaMin: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="h-10"
                    aria-label={`Minuto de saída de ${l.nome}`}
                  />
                </td>
                <td className="py-1.5 pl-1 text-right font-semibold tabular-nums text-cinza-900">
                  {minutosDe(l)}′
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button onClick={guardar} disabled={pending}>
          <Check className="h-4 w-4" />
          {pending ? "A guardar…" : "Guardar alterações"}
        </Button>
      </div>
    </div>
  );
}

export type { LinhaMinutos };
