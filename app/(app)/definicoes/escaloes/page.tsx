import type { Metadata } from "next";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { obterMembroAtual } from "@/lib/permissoes";
import { EscaloesLista } from "@/components/definicoes/EscaloesLista";
import { EstadoErro } from "@/components/layout/EstadosUI";

export const metadata: Metadata = { title: "Definições · Escalões" };

export default async function EscaloesPage() {
  const [resultado, membro] = await Promise.all([
    listarEscaloes(),
    obterMembroAtual(),
  ]);
  if (!resultado.sucesso) return <EstadoErro mensagem={resultado.erro} />;

  // Gating de UI (§6.7/§6.9): quem gere escalões ao nível do clube
  // (CLUBE_ESCALOES) pode gerir todos; o Coordenador de Secção
  // (SECCAO_ESCALOES_GERIR) só os das secções que coordena. Sem qualquer das
  // capacidades → página em modo leitura (sem botões de escrita).
  const temClube = membro?.capacidades.includes("CLUBE_ESCALOES") ?? false;
  const temSeccao = membro?.capacidades.includes("SECCAO_ESCALOES_GERIR") ?? false;
  const podeCriar = temClube || temSeccao;
  const escaloesGeriveis = temClube
    ? resultado.dados.map((e) => e.id)
    : temSeccao
      ? resultado.dados
          .filter(
            (e) => e.seccaoId && membro!.seccoesCoordenadas.includes(e.seccaoId),
          )
          .map((e) => e.id)
      : [];

  return (
    <EscaloesLista
      escaloes={resultado.dados}
      podeCriar={podeCriar}
      escaloesGeriveis={escaloesGeriveis}
    />
  );
}
