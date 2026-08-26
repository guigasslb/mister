import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { obterCompeticaoManoMano } from "@/lib/actions/mano-a-mano";
import { CompeticaoDetalhe } from "@/components/mano-a-mano/CompeticaoDetalhe";

export const metadata: Metadata = { title: "Detalhe · Mano-a-Mano" };

export default async function DetalheManoManoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obterCompeticaoManoMano(id);
  if (!res.sucesso) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/mano-a-mano"
        className="flex w-fit items-center gap-1 text-corpo-sec text-cinza-600 transition-colors hover:text-cinza-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Mano-a-Mano
      </Link>

      <CompeticaoDetalhe competicao={res.dados} />
    </div>
  );
}
