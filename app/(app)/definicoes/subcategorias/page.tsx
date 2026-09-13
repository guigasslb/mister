import type { Metadata } from "next";
import { listarSubcategorias } from "@/lib/actions/subcategorias";
import { obterMembroAtual } from "@/lib/permissoes";
import { SubcategoriasLista } from "@/components/definicoes/SubcategoriasLista";
import { CabecalhoDefinicoes } from "@/components/definicoes/CabecalhoDefinicoes";

export const metadata: Metadata = { title: "Definições · Subcategorias" };

export default async function SubcategoriasPage() {
  const [res, membro] = await Promise.all([
    listarSubcategorias(),
    obterMembroAtual(),
  ]);
  const subcategorias = res.sucesso ? res.dados : [];

  // Gating de UI (§6.7): sem EXERCICIOS_GERIR → só leitura.
  const podeGerir = membro?.capacidades.includes("EXERCICIOS_GERIR") ?? false;

  return (
    <div className="space-y-6">
      <CabecalhoDefinicoes />
      <SubcategoriasLista subcategorias={subcategorias} podeGerir={podeGerir} />
    </div>
  );
}
