import type { Metadata } from "next";
import { listarHabilidades } from "@/lib/actions/habilidades";
import { obterMembroAtual } from "@/lib/permissoes";
import { HabilidadesLista } from "@/components/definicoes/HabilidadesLista";
import { EstadoErro } from "@/components/layout/EstadosUI";

export const metadata: Metadata = { title: "Definições · Habilidades" };

export default async function HabilidadesPage() {
  const [resultado, membro] = await Promise.all([
    listarHabilidades(),
    obterMembroAtual(),
  ]);
  if (!resultado.sucesso) return <EstadoErro mensagem={resultado.erro} />;

  // Gating de UI (§6.7): sem CATALOGO_HABILIDADES → só leitura.
  const podeGerir = membro?.capacidades.includes("CATALOGO_HABILIDADES") ?? false;

  return <HabilidadesLista habilidades={resultado.dados} podeGerir={podeGerir} />;
}
