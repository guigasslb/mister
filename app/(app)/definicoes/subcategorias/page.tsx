import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { listarSubcategorias } from "@/lib/actions/subcategorias";
import { obterMembroAtual } from "@/lib/permissoes";
import { SubcategoriasLista } from "@/components/definicoes/SubcategoriasLista";

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
      <Link
        href="/definicoes"
        className="flex w-fit items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Definições
      </Link>
      <SubcategoriasLista subcategorias={subcategorias} podeGerir={podeGerir} />
    </div>
  );
}
