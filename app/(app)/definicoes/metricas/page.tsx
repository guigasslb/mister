import type { Metadata } from "next";
import { listarMetricas } from "@/lib/actions/metricas";
import { obterMembroAtual } from "@/lib/permissoes";
import { MetricasLista } from "@/components/definicoes/MetricasLista";
import { EstadoErro } from "@/components/layout/EstadosUI";

export const metadata: Metadata = { title: "Definições · Métricas" };

export default async function MetricasPage() {
  const [resultado, membro] = await Promise.all([
    listarMetricas(),
    obterMembroAtual(),
  ]);
  if (!resultado.sucesso) return <EstadoErro mensagem={resultado.erro} />;

  // Gating de UI (§6.7): sem CATALOGO_METRICAS → só leitura.
  const podeGerir = membro?.capacidades.includes("CATALOGO_METRICAS") ?? false;

  return <MetricasLista metricas={resultado.dados} podeGerir={podeGerir} />;
}
