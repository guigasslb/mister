import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { EstadoErro } from "@/components/layout/EstadosUI";
import { VotacaoCapitao } from "@/components/jogos/VotacaoCapitao";
import { obterJogo } from "@/lib/actions/jogos";
import { obterVotacaoCapitao } from "@/lib/actions/votacao-capitao";
import { obterMembroAtual } from "@/lib/permissoes";
import { tituloConfronto } from "@/lib/jogo-confronto";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Votação do capitão" };

/**
 * Votação secreta do capitão (tablet do treinador, de mão em mão). Autorização,
 * isolamento por clube e segredo dos votos garantidos pelas actions.
 */
export default async function VotacaoCapitaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obterJogo(id);
  if (!res.sucesso) notFound();
  const j = res.dados;

  const [resVotacao, membro] = await Promise.all([obterVotacaoCapitao(id), obterMembroAtual()]);
  const titulo = tituloConfronto(membro?.clube.nome, j.adversario, j.casaFora);

  // Fotos dos convocados (ids já autorizados pela action, do jogo deste clube).
  const fotos = resVotacao.sucesso
    ? Object.fromEntries(
        (
          await prisma.atleta.findMany({
            where: { id: { in: resVotacao.dados.convocados.map((c) => c.atletaId) } },
            select: { id: true, fotoUrl: true },
          })
        ).map((a) => [a.id, a.fotoUrl]),
      )
    : {};
  const capitaoAtualId = j.convocatorias.find((c) => c.convocado && c.capitao)?.atletaId ?? null;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Jogos", href: "/jogos" },
          { label: titulo, href: `/jogos/${j.id}` },
          { label: "Votação do capitão" },
        ]}
      />
      <div>
        <h1>Votação do capitão</h1>
        <p className="text-corpo-sec text-cinza-600">
          Voto secreto dos convocados. Os resultados só ficam visíveis depois de fechares a
          votação.
        </p>
      </div>
      {resVotacao.sucesso ? (
        <VotacaoCapitao
          jogoId={j.id}
          vista={resVotacao.dados}
          fotos={fotos}
          capitaoAtualId={capitaoAtualId}
        />
      ) : (
        <EstadoErro mensagem={resVotacao.erro} />
      )}
    </div>
  );
}
