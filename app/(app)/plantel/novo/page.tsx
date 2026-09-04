import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { listarEscaloesLegiveis } from "@/lib/actions/escaloes";
import { obterSeccoes } from "@/lib/actions/seccoes";
import { AtletaForm } from "@/components/plantel/AtletaForm";
import { EstadoErro } from "@/components/layout/EstadosUI";
import { escaloesComModalidade } from "@/lib/modalidade-escalao";

export const metadata: Metadata = { title: "Novo atleta" };

export default async function NovoAtletaPage() {
  const [resEscaloes, resSeccoes] = await Promise.all([
    listarEscaloesLegiveis(),
    obterSeccoes(),
  ]);
  if (!resEscaloes.sucesso) return <EstadoErro mensagem={resEscaloes.erro} />;
  const seccoes = resSeccoes.sucesso ? resSeccoes.dados : [];
  const escaloes = escaloesComModalidade(resEscaloes.dados, seccoes);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/plantel"
          className="flex items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Plantel
        </Link>
      </div>

      <h1>Novo atleta</h1>

      <AtletaForm escaloes={escaloes} />
    </div>
  );
}
