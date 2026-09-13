import type { Metadata } from "next";
import { listarMembros } from "@/lib/actions/utilizadores";
import { listarPerfis } from "@/lib/actions/perfis";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { obterMembroAtual } from "@/lib/permissoes";
import { UtilizadoresLista } from "@/components/definicoes/UtilizadoresLista";
import { EstadoErro } from "@/components/layout/EstadosUI";
import { CabecalhoDefinicoes } from "@/components/definicoes/CabecalhoDefinicoes";

export const metadata: Metadata = { title: "Definições · Utilizadores" };

export default async function MembrosPage() {
  const [resMembros, resPerfis, resEscaloes, membro] = await Promise.all([
    listarMembros(),
    listarPerfis(),
    listarEscaloes(),
    obterMembroAtual(),
  ]);
  if (!resMembros.sucesso) return <EstadoErro mensagem={resMembros.erro} />;

  const perfis = resPerfis.sucesso ? resPerfis.dados.map((p) => ({ id: p.id, nome: p.nome })) : [];
  const escaloes = resEscaloes.sucesso
    ? resEscaloes.dados.map((e) => ({ id: e.id, nome: e.nome }))
    : [];

  // Gating de UI (secção 6.7) + regra de delegação do editor de overrides (6.4):
  // só se concede a outro membro uma capacidade que o próprio possui.
  const capacidadesProprias = membro?.capacidades ?? [];
  const podeGerirMembros = capacidadesProprias.includes("CLUBE_UTILIZADORES");

  return (
    <div className="space-y-6">
      <CabecalhoDefinicoes />
      <UtilizadoresLista
        membros={resMembros.dados}
        perfis={perfis}
        escaloes={escaloes}
        podeGerirMembros={podeGerirMembros}
        capacidadesProprias={capacidadesProprias}
      />
    </div>
  );
}
