import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listarMovimentosCarteira } from "@/lib/actions/licenciamento";
import { LABEL_TIPO_MOVIMENTO, formatarEuros } from "@/lib/schemas/licenciamento";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";
import { cn } from "@/lib/utils";
import { formatarDataHoraLisboa } from "@/lib/utils-datas";

export const metadata: Metadata = { title: "Definições · Movimentos da carteira" };

function formatarData(data: Date): string {
  return formatarDataHoraLisboa(data, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function MovimentosPage() {
  const resultado = await listarMovimentosCarteira();
  if (!resultado.sucesso) return <EstadoErro mensagem={resultado.erro} />;

  const movimentos = resultado.dados;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/definicoes/licenca"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-corpo-sec text-cinza-600 hover:text-cinza-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Licença
        </Link>
        <h1 className="mt-1">Movimentos da carteira</h1>
      </div>

      {movimentos.length === 0 ? (
        <EstadoVazio titulo="Sem movimentos de carteira" />
      ) : (
        <div className="overflow-hidden rounded-md border border-cinza-200 bg-white shadow-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-cinza-200 text-legenda text-cinza-600">
                <th className="px-4 py-3 font-semibold">Data</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 text-right font-semibold">Valor</th>
                <th className="px-4 py-3 font-semibold">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cinza-200">
              {movimentos.map((m) => {
                const credito = m.valorCentimos >= 0;
                return (
                  <tr key={m.id} className="text-corpo text-cinza-900">
                    <td className="whitespace-nowrap px-4 py-3 text-corpo-sec text-cinza-600">
                      {formatarData(m.criadoEm)}
                    </td>
                    <td className="px-4 py-3">{LABEL_TIPO_MOVIMENTO[m.tipo]}</td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums",
                        credito ? "text-verde-600" : "text-vermelho-600",
                      )}
                    >
                      {credito ? "+" : ""}
                      {formatarEuros(m.valorCentimos)}
                    </td>
                    <td className="px-4 py-3 text-corpo-sec text-cinza-600">
                      {m.descricao}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
