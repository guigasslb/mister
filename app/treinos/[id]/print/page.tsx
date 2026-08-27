import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { obterSessao } from "@/lib/actions/treinos";
import { obterEpocaAtiva } from "@/lib/epoca-context";
import { obterMembroAtual } from "@/lib/permissoes";
import { resolverExercicioSessao } from "@/lib/snapshot-exercicio";
import { BotaoImprimir } from "@/components/relatorios/BotaoImprimir";
import { AutoImprimir } from "@/components/treinos/AutoImprimir";
import {
  TreinoPrintTemplate,
  type DadosImpressaoTreino,
} from "@/components/treinos/TreinoPrintTemplate";

export const metadata: Metadata = { title: "Imprimir treino" };

/**
 * Página de impressão de uma sessão de treino (rota fora do grupo (app): sem
 * sidebar nem barra de topo). Verifica a sessão via `auth()`; a leitura da
 * sessão (`obterSessao`) reforça a autorização por escalão/clube. Otimizada para
 * `@media print` — a barra de ações desaparece na impressão.
 */
export default async function ImprimirTreinoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const [res, epoca, membro] = await Promise.all([
    obterSessao(id),
    obterEpocaAtiva(),
    obterMembroAtual(),
  ]);
  if (!res.sucesso) notFound();

  const s = res.dados;

  // Exercícios: base + fallback ao snapshot (§4.2.1) + overrides por sessão.
  const exercicios = s.exercicios.map((se) => {
    const r = resolverExercicioSessao(se);
    return {
      id: se.id,
      ordem: se.ordem,
      nome: r.nome,
      categoriaPrincipal: r.categoriaPrincipal,
      parteTreino: se.parteTreino ?? null,
      objetivo: r.objetivo,
      // Descrição própria da sessão prevalece sobre a do exercício-base.
      descricao: se.descricaoOverride ?? r.descricao,
      duracaoMin: se.duracaoMin,
      series: se.series ?? null,
      notas: se.notas ?? null,
      diagrama: r.diagrama,
    };
  });

  // Duração total: a planeada na sessão, ou o somatório dos exercícios.
  const somaExercicios = exercicios.reduce((tot, e) => tot + (e.duracaoMin ?? 0), 0);
  const duracaoTotalMin = s.duracaoMin ?? (somaExercicios > 0 ? somaExercicios : null);

  const dados: DadosImpressaoTreino = {
    clubeNome: membro?.clube.nome ?? "Clube",
    epocaNome: epoca?.nome ?? null,
    escalaoNome: s.escalao.nome,
    data: s.data,
    tipoSessao: s.tipoSessao,
    local: s.local,
    objetivo: s.objetivo,
    notas: s.notas,
    duracaoTotalMin,
    exercicios,
  };

  return (
    <div className="min-h-screen bg-white text-cinza-900 print:min-h-0">
      {/* Barra de ações — escondida na impressão. */}
      <div
        data-print-hidden
        className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-cinza-200 bg-white px-4 py-3 print:hidden"
      >
        <a
          href={`/treinos/${s.id}`}
          className="text-corpo-sec font-medium text-cinza-600 underline-offset-2 hover:underline"
        >
          ← Voltar ao treino
        </a>
        <BotaoImprimir />
      </div>

      <TreinoPrintTemplate dados={dados} />

      {/* Abre o diálogo de impressão automaticamente ao carregar a página. */}
      <AutoImprimir />
    </div>
  );
}
