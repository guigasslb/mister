import type { Metadata } from "next";
import { listarReunioes } from "@/lib/actions/reunioes";
import { listarEscaloesLegiveis } from "@/lib/actions/escaloes";
import { ReunioesLista } from "@/components/reunioes/ReunioesLista";
import { EstadoErro } from "@/components/layout/EstadosUI";

export const metadata: Metadata = { title: "Reuniões" };

export default async function ReunioesPage() {
  const [resReunioes, resEsc] = await Promise.all([listarReunioes(), listarEscaloesLegiveis()]);
  if (!resReunioes.sucesso) return <EstadoErro mensagem={resReunioes.erro} />;
  const escaloes = resEsc.sucesso ? resEsc.dados.map((e) => ({ id: e.id, nome: e.nome })) : [];

  return <ReunioesLista reunioes={resReunioes.dados} escaloes={escaloes} />;
}
