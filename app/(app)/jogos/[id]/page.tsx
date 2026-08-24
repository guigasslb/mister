import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Home, Plane, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { obterJogo, obterSuspensoesPendentes } from "@/lib/actions/jogos";
import { listarAtletas } from "@/lib/actions/atletas";
import { listarMetricas } from "@/lib/actions/metricas";
import { prisma } from "@/lib/db";
import { obterMembroAtual } from "@/lib/permissoes";
import { JogoDetalhe } from "@/components/jogos/JogoDetalhe";
import { ApagarJogoButton } from "@/components/jogos/ApagarJogoButton";
import { ConvocatoriaWhatsApp } from "@/components/jogos/ConvocatoriaWhatsApp";
import { BotoesPartilhaJogo } from "@/components/social/BotoesPartilhaJogo";
import { LABEL_CASA_FORA } from "@/lib/schemas/jogo";
import { MINUTOS_POR_PARTE } from "@/lib/modalidade-escalao";
import { BadgeModalidade } from "@/components/plantel/BadgeModalidade";
import { eEscalaoFormacaoJovem } from "@/lib/schemas/social";
import { urlCard } from "@/lib/social/token";

// 🔁 v7 (§3.7): rótulos PT-PT dos formatos de jogo (para o cabeçalho do detalhe).
const LABEL_FORMATO: Record<string, string> = {
  FUTSAL_5: "Futsal 5",
  FUTEBOL_3_3: "Futebol 3×3",
  FUTEBOL_5_5: "Futebol 5×5",
  FUTEBOL_7: "Futebol 7",
  FUTEBOL_9: "Futebol 9",
  FUTEBOL_11: "Futebol 11",
};

function formatarData(data: Date): string {
  return new Date(data).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export const metadata: Metadata = { title: "Detalhe do jogo" };

export default async function DetalheJogoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obterJogo(id);
  if (!res.sucesso) notFound();

  const j = res.dados;
  const [resAtletas, resMetricas, membro] = await Promise.all([
    listarAtletas(j.escalaoId),
    listarMetricas(true),
    obterMembroAtual(),
  ]);
  const atletas = resAtletas.sucesso ? resAtletas.dados : [];
  const metricasAtivas = resMetricas.sucesso ? resMetricas.dados : [];
  const podeComunicar = membro?.capacidades.includes("COMUNICACOES_GERIR") ?? false;

  // Métricas a mostrar: ativas + as que já têm valores neste jogo (histórico, secção 22.1)
  const idsComValor = new Set(
    j.estatisticas.flatMap((e) => e.valoresMetricas.map((v) => v.metricaId)),
  );
  const idsAtivas = new Set(metricasAtivas.map((m) => m.id));
  const idsHistoricasEmFalta = [...idsComValor].filter((id) => !idsAtivas.has(id));
  const metricasHistoricas = idsHistoricasEmFalta.length
    ? await prisma.metricaConfig.findMany({ where: { id: { in: idsHistoricasEmFalta } } })
    : [];
  const metricas = [...metricasAtivas, ...metricasHistoricas];

  const convocadosIniciais = j.convocatorias
    .filter((c) => c.convocado)
    .map((c) => c.atletaId);

  const estatisticasIniciais = Object.fromEntries(
    j.estatisticas.map((e) => [
      e.atletaId,
      {
        atletaId: e.atletaId,
        utilizacao: e.utilizacao,
        blocoTempo: e.blocoTempo,
        minutos: e.minutos,
        golos: e.golos,
        assistencias: e.assistencias,
        defesas: e.defesas,
        golosSofridosGR: e.golosSofridosGR,
        faltasCometidas: e.faltasCometidas,
        // Disciplina (§3.7): cartões acumulados no jogo (futsal e futebol).
        cartaoAmarelo: e.cartaoAmarelo,
        cartaoVermelho: e.cartaoVermelho,
        // 🔁 v7 (§10.8): núcleo de futebol (null em jogos de futsal).
        remates: e.remates,
        cantos: e.cantos,
        forasDeJogo: e.forasDeJogo,
        desarmes: e.desarmes,
        valoresMetricas: Object.fromEntries(
          e.valoresMetricas.map((v) => [v.metricaId, v.valor]),
        ),
      },
    ]),
  );

  // F5 (M15): plano de dia de jogo por convocado (posição/titularidade prevista).
  const planoInicial = Object.fromEntries(
    j.convocatorias
      .filter((c) => c.convocado)
      .map((c) => [
        c.atletaId,
        { posicaoPrevista: c.posicaoPrevista, titularPrevisto: c.titularPrevisto },
      ]),
  );

  const eventos = j.eventos.map((e) => ({
    id: e.id,
    parte: e.parte,
    minuto: e.minuto,
    tipo: e.tipo,
    bloco: e.bloco,
    atletaId: e.atletaId,
    atletaSecundarioId: e.atletaSecundarioId,
  }));

  // BUG-P1-04: as suspensões referem-se ao PRÓXIMO jogo do escalão (aquele para o
  // qual a convocatória está a ser preparada). Só as calculamos/mostramos quando o
  // jogo aberto é esse próximo jogo — nunca em jogos já realizados ou noutros futuros.
  const proximoJogo = await prisma.jogo.findFirst({
    where: { escalaoId: j.escalaoId, epocaId: j.epocaId, data: { gt: new Date() } },
    orderBy: { data: "asc" },
    select: { id: true },
  });
  const resSuspensoes =
    proximoJogo?.id === j.id ? await obterSuspensoesPendentes(j.escalaoId) : null;
  const suspensoes = resSuspensoes?.sucesso ? resSuspensoes.dados : [];

  const temResultado = j.golosMarcados != null && j.golosSofridos != null;

  // P4.7: cards sociais. Bloqueados para escalões de formação jovem (RGPD).
  const escalaoJovem = eEscalaoFormacaoJovem(j.escalao.nome);
  const urlCardResultado =
    temResultado && !escalaoJovem ? urlCard("resultado", { jogoId: j.id }) : null;
  const urlCardMvp =
    !escalaoJovem && j.estatisticas.length > 0 ? urlCard("mvp", { jogoId: j.id }) : null;

  return (
    <div className="space-y-6">
      {/* Navegação */}
      <div className="flex items-center justify-between">
        <Breadcrumbs
          items={[
            { label: "Jogos", href: "/jogos" },
            { label: `vs ${j.adversario}` },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          {podeComunicar && <ConvocatoriaWhatsApp jogoId={j.id} />}
          <BotoesPartilhaJogo urlResultado={urlCardResultado} urlMvp={urlCardMvp} />
          <Button asChild variant="outline">
            <Link href={`/jogos/${j.id}/editar`}>
              <Pencil className="h-4 w-4" />
              Editar
            </Link>
          </Button>
          <ApagarJogoButton jogoId={j.id} />
        </div>
      </div>

      {/* Cabeçalho */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1>vs {j.adversario}</h1>
          <span className="flex items-center gap-1 rounded-full bg-cinza-50 px-2.5 py-0.5 text-legenda text-cinza-600">
            {j.casaFora === "CASA" ? (
              <Home className="h-3.5 w-3.5" />
            ) : (
              <Plane className="h-3.5 w-3.5" />
            )}
            {LABEL_CASA_FORA[j.casaFora]}
          </span>
          <span className="rounded-full bg-primary/5 px-2.5 py-0.5 text-legenda text-primary">
            {j.escalao.nome}
          </span>
          <BadgeModalidade modalidade={j.modalidade} />
        </div>
        <p className="text-corpo-sec text-cinza-600 capitalize">
          {formatarData(j.data)}
          {j.competicao ? ` · ${j.competicao}` : ""}
          {j.local ? ` · ${j.local}` : ""}
        </p>
        {j.formato && (
          <p className="text-legenda text-cinza-500">
            {LABEL_FORMATO[j.formato] ?? j.formato} · 2 ×{" "}
            {MINUTOS_POR_PARTE[j.formato]} min
          </p>
        )}
        {temResultado && (
          <p className="text-titulo-pagina font-bold text-cinza-900">
            {j.golosMarcados} – {j.golosSofridos}
          </p>
        )}
        {(j.faltas1aParte != null || j.faltas2aParte != null) && (
          <p className="text-legenda text-cinza-500">
            Faltas: {j.faltas1aParte ?? 0} (1ª) · {j.faltas2aParte ?? 0} (2ª)
          </p>
        )}
        {j.videoUrl && (
          <a href={j.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-corpo-sec text-primary underline">
            <Video className="h-4 w-4" /> Ver vídeo do jogo
          </a>
        )}
      </div>

      <JogoDetalhe
        jogoId={j.id}
        atletas={atletas.map((a) => ({
          id: a.id,
          nome: a.nome,
          // Número da participação neste escalão (F1).
          numero: a.participacaoContexto?.numero ?? j.numeroPorAtleta[a.id] ?? null,
          eGR: a.posicoes.includes("GUARDA_REDES"),
          posicoes: a.posicoes,
        }))}
        metricas={metricas.map((m) => ({
          id: m.id,
          nome: m.nome,
          tipo: m.tipo,
          ativa: m.ativa,
        }))}
        convocadosIniciais={convocadosIniciais}
        estatisticasIniciais={estatisticasIniciais}
        relatorioInicial={j.relatorio ?? ""}
        golosMarcados={j.golosMarcados}
        planoInicial={planoInicial}
        eventos={eventos}
        observacoes={j.observacoes}
        casaFora={j.casaFora}
        adversario={j.adversario}
        modalidade={j.modalidade}
        formato={j.formato}
        suspensoes={suspensoes}
      />
    </div>
  );
}
