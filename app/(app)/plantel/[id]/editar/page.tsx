import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { obterAtleta } from "@/lib/actions/atletas";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { obterSeccoes } from "@/lib/actions/seccoes";
import { AtletaForm } from "@/components/plantel/AtletaForm";
import { ApagarAtletaButton } from "@/components/plantel/ApagarAtletaButton";
import { ApagarAtletaDefinitivamenteButton } from "@/components/plantel/ApagarAtletaDefinitivamenteButton";
import { ToggleAtivoAtleta } from "@/components/plantel/ToggleAtivoAtleta";
import { EstadoErro } from "@/components/layout/EstadosUI";
import { escaloesComModalidade } from "@/lib/modalidade-escalao";
import { obterMembroAtual } from "@/lib/permissoes";

export const metadata: Metadata = { title: "Editar atleta" };

export default async function EditarAtletaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [resAtleta, resEscaloes, resSeccoes, membro] = await Promise.all([
    obterAtleta(id),
    listarEscaloes(),
    obterSeccoes(),
    obterMembroAtual(),
  ]);

  if (!resAtleta.sucesso) notFound();
  if (!resEscaloes.sucesso) return <EstadoErro mensagem={resEscaloes.erro} />;

  const atleta = resAtleta.dados;
  const seccoes = resSeccoes.sucesso ? resSeccoes.dados : [];
  const escaloes = escaloesComModalidade(resEscaloes.dados, seccoes);

  // Gating de UI das ações de estado do plantel (secção 8). O servidor continua a
  // ser a autoridade; isto apenas evita mostrar ações que iriam falhar.
  const podeGerirPlantel = new Set(membro?.capacidades ?? []).has("PLANTEL_GERIR");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/plantel/${id}`}
          className="flex items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {atleta.nome}
        </Link>
      </div>

      <h1>Editar atleta</h1>

      <AtletaForm escaloes={escaloes} atleta={atleta} />

      {/* Estado do atleta no plantel (secção 8). Gerível por quem gere o plantel. */}
      {podeGerirPlantel && (
        <div className="rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
          <ToggleAtivoAtleta atletaId={atleta.id} ativoInicial={atleta.ativo} />
        </div>
      )}

      <div className="border-t border-cinza-200 pt-6">
        <ApagarAtletaButton atletaId={atleta.id} nomeAtleta={atleta.nome} />
      </div>

      {/* Zona de perigo — hard-delete RGPD (P1.3). Só para quem gere o plantel. */}
      {podeGerirPlantel && (
        <div className="rounded-lg border border-vermelho-600/40 bg-vermelho-600/5 p-5 space-y-3">
          <p className="text-corpo font-semibold text-vermelho-600">Zona de perigo</p>
          <p className="text-corpo-sec text-cinza-600">
            Apagar definitivamente remove o atleta e todos os dados pessoais associados
            (presenças, caderneta, convocatórias, participações). A ação é irreversível
            e destina-se ao cumprimento do direito ao apagamento (RGPD). Para apenas o
            retirar das listas, usa «Arquivar atleta» acima.
          </p>
          <ApagarAtletaDefinitivamenteButton atletaId={atleta.id} nomeAtleta={atleta.nome} />
        </div>
      )}
    </div>
  );
}
