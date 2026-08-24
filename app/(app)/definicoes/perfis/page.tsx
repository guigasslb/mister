import type { Metadata } from "next";
import { listarPerfis } from "@/lib/actions/perfis";
import { obterMembroAtual } from "@/lib/permissoes";
import { PerfisLista } from "@/components/definicoes/PerfisLista";
import { EstadoErro } from "@/components/layout/EstadosUI";

export const metadata: Metadata = { title: "Definições · Perfis" };

export default async function PerfisPage() {
  const [res, membro] = await Promise.all([listarPerfis(), obterMembroAtual()]);
  if (!res.sucesso) return <EstadoErro mensagem={res.erro} />;

  // Gating de UI (§6.7): sem CLUBE_PERFIS → só leitura.
  const podeGerir = membro?.capacidades.includes("CLUBE_PERFIS") ?? false;

  return <PerfisLista perfis={res.dados} podeGerir={podeGerir} />;
}
