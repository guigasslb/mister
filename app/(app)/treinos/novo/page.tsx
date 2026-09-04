import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, CalendarPlus, CalendarRange } from "lucide-react";
import { listarEscaloesLegiveis } from "@/lib/actions/escaloes";
import { SessaoForm } from "@/components/treinos/SessaoForm";
import { PlanoSemanalForm } from "@/components/treinos/PlanoSemanalForm";
import { EstadoErro } from "@/components/layout/EstadosUI";

export const metadata: Metadata = { title: "Novo treino" };

/** Data pré-preenchida (default 20h00) quando se cria a partir de uma semana. */
function dataInicialDe(data?: string): Date | undefined {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return undefined;
  const d = new Date(`${data}T20:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function NovaSessaoPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; escalaoId?: string; modo?: string }>;
}) {
  const { data, escalaoId, modo } = await searchParams;
  const ehPlano = modo === "plano";

  const resEscaloes = await listarEscaloesLegiveis();
  if (!resEscaloes.sucesso) return <EstadoErro mensagem={resEscaloes.erro} />;

  const qs = escalaoId ? `escalaoId=${escalaoId}&` : "";
  const hrefAvulso = `/treinos/novo?${qs}modo=avulso`;
  const hrefPlano = `/treinos/novo?${qs}modo=plano`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/treinos"
          className="flex items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Treinos
        </Link>
      </div>

      <h1>{ehPlano ? "Novo plano semanal" : "Nova sessão"}</h1>

      {/* Toggle de modo (§8.8.1) */}
      <div className="flex gap-1 rounded-md border border-cinza-200 p-1 w-fit">
        <Link
          href={hrefAvulso}
          className={`flex min-h-[44px] items-center gap-1.5 rounded px-3 py-1.5 text-corpo-sec font-medium transition-colors ${
            !ehPlano ? "bg-primary text-white" : "text-cinza-600 hover:bg-cinza-50"
          }`}
        >
          <CalendarPlus className="h-4 w-4" />
          Treino avulso
        </Link>
        <Link
          href={hrefPlano}
          className={`flex min-h-[44px] items-center gap-1.5 rounded px-3 py-1.5 text-corpo-sec font-medium transition-colors ${
            ehPlano ? "bg-primary text-white" : "text-cinza-600 hover:bg-cinza-50"
          }`}
        >
          <CalendarRange className="h-4 w-4" />
          Plano semanal
        </Link>
      </div>

      {ehPlano ? (
        <PlanoSemanalForm escaloes={resEscaloes.dados} escalaoIdInicial={escalaoId} />
      ) : (
        <SessaoForm
          escaloes={resEscaloes.dados}
          escalaoIdInicial={escalaoId}
          dataInicial={dataInicialDe(data)}
        />
      )}
    </div>
  );
}
