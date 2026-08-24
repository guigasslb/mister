import type { Metadata } from "next";
import { obterMembroAtual } from "@/lib/permissoes";
import { BrandingForm } from "@/components/definicoes/BrandingForm";
import { EstadoErro } from "@/components/layout/EstadosUI";

export const metadata: Metadata = { title: "Definições · Clube" };

export default async function ClubePage() {
  const membro = await obterMembroAtual();
  if (!membro) return <EstadoErro mensagem="Sem clube ativo." />;

  // Gating de UI (§6.7): sem CLUBE_BRANDING a página fica em modo leitura
  // (campos desativados, sem botão de guardar).
  const podeEditar = membro.capacidades.includes("CLUBE_BRANDING");

  return (
    <div className="space-y-6">
      <div>
        <h1>Clube</h1>
        <p className="mt-1 text-corpo-sec text-cinza-600">
          Identidade do clube: nome, cores e logótipo.
        </p>
      </div>
      <BrandingForm clube={membro.clube} podeEditar={podeEditar} />
    </div>
  );
}
