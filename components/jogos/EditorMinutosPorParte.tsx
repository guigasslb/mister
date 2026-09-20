"use client";

import { Input } from "@/components/ui/input";

/**
 * Linha do editor de tempo de jogo por parte: minutos ABSOLUTOS jogados em cada
 * parte. `minutosPorParte[i]` = minutos na parte i+1 (índice 0 = Parte 1). O total
 * é sempre a soma das partes.
 */
export interface LinhaMinutosPorParte {
  atletaId: string;
  nome: string;
  numero: number | null;
  minutosPorParte: number[];
}

/**
 * Editor de tempo de jogo por parte (substitui o antigo editor entrada/saída e o
 * seletor de bloco de tempo). Cada atleta tem um input de minutos por cada parte
 * do jogo (`numeroPartes`, 1..4) e uma coluna «Total» só de leitura, calculada em
 * tempo real como a soma das partes. Ao guardar as estatísticas, o array
 * `minutosPorParte` viaja no payload e o servidor calcula `minutos = soma`.
 */
export function EditorMinutosPorParte({
  numeroPartes,
  linhas,
  duracaoMaxRazoavel,
  onChange,
}: {
  numeroPartes: number;
  linhas: LinhaMinutosPorParte[];
  // Duração máxima razoável por parte (min). Só alimenta um aviso visual suave
  // (não bloqueia o guardar). `null` = sem referência (formato desconhecido).
  duracaoMaxRazoavel?: number | null;
  onChange: (atletaId: string, minutosPorParte: number[]) => void;
}) {
  const partes = Array.from({ length: Math.max(1, numeroPartes) }, (_, i) => i);

  function minutosDaParte(l: LinhaMinutosPorParte, idx: number): number {
    const v = l.minutosPorParte[idx];
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
  }

  function total(l: LinhaMinutosPorParte): number {
    return partes.reduce((acc, idx) => acc + minutosDaParte(l, idx), 0);
  }

  function alterar(l: LinhaMinutosPorParte, idx: number, valorStr: string) {
    // Reconstrói o array com o comprimento = nº de partes (índices em falta = 0).
    const arr = partes.map((p) => minutosDaParte(l, p));
    const v = valorStr.trim();
    let n = v === "" ? 0 : Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0) n = 0;
    arr[idx] = n;
    onChange(l.atletaId, arr);
  }

  return (
    <div className="space-y-3 rounded-lg border border-cinza-200 bg-white p-4 shadow-card">
      <div>
        <h3 className="text-subtitulo text-cinza-900">Tempo de jogo</h3>
        <p className="text-legenda text-cinza-500">
          Minutos jogados em cada parte. O total é a soma automática das partes.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-corpo-sec">
          <thead>
            <tr className="border-b border-cinza-100 text-left text-legenda uppercase tracking-wide text-cinza-500">
              <th className="py-2 pr-2 font-medium">Atleta</th>
              {partes.map((p) => (
                <th key={p} className="w-20 py-2 px-1 font-medium">
                  Parte {p + 1}
                </th>
              ))}
              <th className="w-16 py-2 pl-1 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.atletaId} className="border-b border-cinza-50 last:border-0">
                <td className="py-2 pr-2 text-cinza-900">
                  {l.numero != null && (
                    <span className="mr-1 text-cinza-400">#{l.numero}</span>
                  )}
                  {l.nome}
                </td>
                {partes.map((p) => {
                  const inputId = `mpp-${l.atletaId}-${p}`;
                  const valor = minutosDaParte(l, p);
                  const acimaMax =
                    duracaoMaxRazoavel != null && valor > duracaoMaxRazoavel;
                  return (
                    <td key={p} className="px-1 py-1.5 align-top">
                      <label htmlFor={inputId} className="sr-only">
                        Parte {p + 1} de {l.nome} (minutos)
                      </label>
                      <Input
                        id={inputId}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={valor}
                        onChange={(e) => alterar(l, p, e.target.value)}
                        className={`h-11 ${
                          acimaMax
                            ? "border-ambar-500 focus-visible:ring-ambar-500"
                            : ""
                        }`}
                        aria-label={`Parte ${p + 1} de ${l.nome} (minutos)`}
                        title={
                          acimaMax
                            ? "Valor elevado para uma parte — confirma."
                            : undefined
                        }
                      />
                    </td>
                  );
                })}
                <td className="py-1.5 pl-1 text-right align-top font-semibold tabular-nums text-cinza-900">
                  {total(l)}′
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
