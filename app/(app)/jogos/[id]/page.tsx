import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Home, Plane, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { TituloConfronto } from "@/components/jogos/TituloConfronto";
import { tituloConfronto } from "@/lib/jogo-confronto";
import { obterJogo, obterSuspensoesPendentes } from "@/lib/actions/jogos";
import { combinarEstatisticasIniciais } from "@/lib/derivar-estatisticas";
import { listarAtletas } from "@/lib/actions/atletas";
import { listarMetricas } from "@/lib/actions/metricas";
import { listarQuadrosTaticos } from "@/lib/actions/modeloJogo";
import { NOME_QUADRO_PLANO_JOGO } from "@/lib/schemas/modeloJogo";
import { diagramaSchema, type DiagramaCampo } from "@/lib/schemas/exercicio";
import { prisma } from "@/lib/db";
import { obterMembroAtual } from "@/lib/permissoes";
import { JogoDetalhe } from "@/components/jogos/JogoDetalhe";
import { ApagarJogoButton } from "@/components/jogos/ApagarJogoButton";
import { FecharJogoButton } from "@/components/jogos/FecharJogoButton";
import { ConvocatoriaWhatsApp } from "@/components/jogos/ConvocatoriaWhatsApp";
import { BotoesPartilhaJogo } from "@/components/social/BotoesPartilhaJogo";
import { LABEL_CASA_FORA } from "@/lib/schemas/jogo";
import { MINUTOS_POR_PARTE } from "@/lib/modalidade-escalao";
import { BadgeModalidade } from "@/components/plantel/BadgeModalidade";
import { eEscalaoFormacaoJovem } from "@/lib/schemas/social";
import { mostrarCargaTreino } from "@/lib/utils";
import { urlCard } from "@/lib/social/token";
import { formatarDataHoraLisboa, partesDataLisboa } from "@/lib/utils-datas";

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
  return formatarDataHoraLisboa(data, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

/**
 * Hora do jogo em "HH:MM". Devolve null para jogos sem hora definida
 * (meia-noite, 00:00), típico de registos antigos — nesse caso não se mostra.
 */
function formatarHora(data: Date): string | null {
  const { hora, minuto } = partesDataLisboa(data);
  if (hora === 0 && minuto === 0) return null;
  return formatarDataHoraLisboa(data, { hour: "2-digit", minute: "2-digit" });
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
  const [resAtletas, resMetricas, membro, resQuadros] = await Promise.all([
    listarAtletas(j.escalaoId),
    listarMetricas(true),
    obterMembroAtual(),
    listarQuadrosTaticos(j.id),
  ]);
  const atletas = resAtletas.sucesso ? resAtletas.dados : [];
  const metricasAtivas = resMetricas.sucesso ? resMetricas.dados : [];
  const podeComunicar = membro?.capacidades.includes("COMUNICACOES_GERIR") ?? false;
  const clubeNome = membro?.clube.nome;
  // §8.10: o quadro tático do plano de jogo é gerido sob MODELO_JOGO_GERIR.
  const podeGerirQuadro = membro?.capacidades.includes("MODELO_JOGO_GERIR") ?? false;

  // Quadro tático interativo do "Plano de jogo": um único quadro por jogo,
  // identificado pelo nome canónico. O diagrama (Json) é validado antes de descer
  // ao cliente (diagramas legados/corrompidos → null, semeia-se pela formação).
  const quadroPlano =
    (resQuadros.sucesso
      ? resQuadros.dados.find((q) => q.nome === NOME_QUADRO_PLANO_JOGO)
      : undefined) ?? null;
  let quadroInicial: { id: string; diagrama: DiagramaCampo | null } | null = null;
  if (quadroPlano) {
    const parsed = diagramaSchema.safeParse(quadroPlano.diagrama);
    quadroInicial = { id: quadroPlano.id, diagrama: parsed.success ? parsed.data : null };
  }

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

  // §8.11 (vista consolidada única): a grelha de Estatísticas carrega já com os
  // valores DERIVADOS dos eventos (motor único `derivarEstatisticas` — minutos,
  // golos/assistências/cartões e secundários por atleta), servindo de valores
  // iniciais. Onde há edição manual persistida em `EstatisticaAtleta`, esta
  // prevalece sobre o derivado (last-write-wins, §13.4). Isto substitui o antigo
  // botão "Preencher do registo ao vivo": não é preciso ação manual.
  const eFutebolJogo = j.modalidade === "FUTEBOL";

  // Registo COMPLETO (clássico + Modo Jogo ao Vivo): o motor único entende
  // `segundoJogo` (intervalos ao segundo) E `bloco`/`minuto` (legado).
  const eventosParaDerivacao = j.eventos.map((e) => ({
    tipo: e.tipo,
    atletaId: e.atletaId,
    atletaSecundarioId: e.atletaSecundarioId,
    bloco: e.bloco,
    minuto: e.minuto,
    segundoJogo: e.segundoJogo,
    parte: e.parte,
  }));

  const convocadosParaDerivacao = j.convocatorias
    .filter((c) => c.convocado)
    .map((c) => ({ atletaId: c.atletaId, titularPrevisto: c.titularPrevisto }));

  // Estatísticas manuais persistidas (verdade final) — prevalecem por atleta.
  const persistidas = j.estatisticas.map((e) => ({
    atletaId: e.atletaId,
    utilizacao: e.utilizacao,
    blocoTempo: e.blocoTempo,
    minutos: e.minutos,
    minutosPorParte: e.minutosPorParte,
    golos: e.golos,
    assistencias: e.assistencias,
    defesas: e.defesas,
    golosSofridosGR: e.golosSofridosGR,
    faltasCometidas: e.faltasCometidas,
    cartaoAmarelo: e.cartaoAmarelo,
    cartaoVermelho: e.cartaoVermelho,
    remates: e.remates,
    cantos: e.cantos,
    forasDeJogo: e.forasDeJogo,
    desarmes: e.desarmes,
    valoresMetricas: e.valoresMetricas.map((v) => ({
      metricaId: v.metricaId,
      valor: v.valor,
    })),
  }));

  const estatisticasCombinadas = combinarEstatisticasIniciais(
    eventosParaDerivacao,
    convocadosParaDerivacao,
    persistidas,
    eFutebolJogo,
    j.formato,
  );

  const estatisticasIniciais = Object.fromEntries(
    [...estatisticasCombinadas.values()].map((e) => [
      e.atletaId,
      {
        atletaId: e.atletaId,
        utilizacao: e.utilizacao,
        blocoTempo: e.blocoTempo ?? null,
        minutos: e.minutos ?? null,
        // Editor de tempo por parte (§8.11/§10.4): valores iniciais da grelha —
        // persistido (BD) prevalece; senão derivado dos eventos; senão [].
        minutosPorParte: e.minutosPorParte ?? [],
        golos: e.golos,
        assistencias: e.assistencias,
        defesas: e.defesas ?? null,
        golosSofridosGR: e.golosSofridosGR ?? null,
        faltasCometidas: e.faltasCometidas ?? null,
        // Disciplina (§3.7): cartões acumulados no jogo (futsal e futebol).
        cartaoAmarelo: e.cartaoAmarelo,
        cartaoVermelho: e.cartaoVermelho,
        // 🔁 v7 (§10.8): núcleo de futebol (null em jogos de futsal).
        remates: e.remates ?? null,
        cantos: e.cantos ?? null,
        forasDeJogo: e.forasDeJogo ?? null,
        desarmes: e.desarmes ?? null,
        valoresMetricas: Object.fromEntries(
          (e.valoresMetricas ?? []).map((v) => [v.metricaId, v.valor]),
        ),
      },
    ]),
  );

  // Atletas com estatísticas efetivamente PERSISTIDAS (edição manual guardada).
  // Distinto dos que só têm valores derivados: a confirmação de "remover
  // convocado com estatísticas" (§22.4) só deve disparar para os persistidos.
  const atletasComStatsPersistidas = j.estatisticas.map((e) => e.atletaId);

  // F5 (M15): plano de dia de jogo por convocado (posição/titularidade prevista).
  const planoInicial = Object.fromEntries(
    j.convocatorias
      .filter((c) => c.convocado)
      .map((c) => [
        c.atletaId,
        { posicaoPrevista: c.posicaoPrevista, titularPrevisto: c.titularPrevisto },
      ]),
  );

  // Capitão de equipa (plano de jogo): no máximo 1 por jogo. null = sem capitão.
  const capitaoInicial =
    j.convocatorias.find((c) => c.convocado && c.capitao)?.atletaId ?? null;

  const eventos = j.eventos.map((e) => ({
    id: e.id,
    parte: e.parte,
    minuto: e.minuto,
    tipo: e.tipo,
    bloco: e.bloco,
    atletaId: e.atletaId,
    atletaSecundarioId: e.atletaSecundarioId,
  }));

  // §8.25: estado da sessão do Modo Jogo ao Vivo. O botão de entrada aparece
  // enquanto o jogo não terminou; o editor manual de minutos (§8.25.6) fica
  // disponível depois de a sessão terminar.
  const sessaoAoVivo = await prisma.sessaoJogoAoVivo.findUnique({
    where: { jogoId: j.id },
    select: { estado: true },
  });
  const sessaoAoVivoTerminada = sessaoAoVivo?.estado === "TERMINADO";
  const mostrarModoAoVivo = !sessaoAoVivoTerminada && !j.fechado;

  // Seed do editor tabular: um intervalo por atleta (1ª ENTRADA → última SAIDA),
  // derivado dos eventos ao vivo (segundo absoluto → minutos inteiros).
  const intervalosAoVivo = new Map<string, { entrada: number; saida: number }>();
  for (const e of j.eventos) {
    if (e.segundoJogo == null || !e.atletaId) continue;
    if (e.tipo !== "ENTRADA" && e.tipo !== "SAIDA") continue;
    const atual = intervalosAoVivo.get(e.atletaId) ?? {
      entrada: Number.POSITIVE_INFINITY,
      saida: 0,
    };
    if (e.tipo === "ENTRADA") atual.entrada = Math.min(atual.entrada, e.segundoJogo);
    else atual.saida = Math.max(atual.saida, e.segundoJogo);
    intervalosAoVivo.set(e.atletaId, atual);
  }
  const linhasMinutosAoVivo = sessaoAoVivoTerminada
    ? convocadosIniciais.map((atletaId) => {
        const atleta = atletas.find((a) => a.id === atletaId);
        const intervalo = intervalosAoVivo.get(atletaId);
        return {
          atletaId,
          nome: atleta?.nome ?? "Atleta",
          numero:
            atleta?.participacaoContexto?.numero ?? j.numeroPorAtleta[atletaId] ?? null,
          entradaMin:
            intervalo && Number.isFinite(intervalo.entrada)
              ? Math.round(intervalo.entrada / 60)
              : null,
          saidaMin: intervalo && intervalo.saida > 0 ? Math.round(intervalo.saida / 60) : null,
        };
      })
    : [];

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

  // Jogo já realizado: data anterior ao momento atual. Só nesses se mostra o
  // botão de fechar/reabrir (estado aberto/fechado).
  const jogoPassou = new Date(j.data).getTime() < Date.now();

  // Disciplina (§3.7): a formação jovem não regista cartões nem suspensões.
  // Reutiliza a heurística de carga de treino (ambos ocultos na formação jovem).
  const escalaoJovemDisciplina = !mostrarCargaTreino(j.escalao.nome);

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
            { label: tituloConfronto(clubeNome, j.adversario, j.casaFora) },
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
          {jogoPassou && <FecharJogoButton jogoId={j.id} fechado={j.fechado} />}
          <ApagarJogoButton jogoId={j.id} />
        </div>
      </div>

      {/* Cabeçalho */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1>
            <TituloConfronto
              clubeNome={clubeNome}
              adversario={j.adversario}
              casaFora={j.casaFora}
            />
          </h1>
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
          {formatarHora(j.data) ? ` · ${formatarHora(j.data)}` : ""}
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
          praticaDuplaModalidade: a.praticaDuplaModalidade,
        }))}
        metricas={metricas.map((m) => ({
          id: m.id,
          nome: m.nome,
          tipo: m.tipo,
          ativa: m.ativa,
        }))}
        convocadosIniciais={convocadosIniciais}
        estatisticasIniciais={estatisticasIniciais}
        atletasComStatsPersistidas={atletasComStatsPersistidas}
        relatorioInicial={j.relatorio ?? ""}
        golosMarcados={j.golosMarcados}
        planoInicial={planoInicial}
        capitaoInicial={capitaoInicial}
        eventos={eventos}
        observacoes={j.observacoes}
        modalidade={j.modalidade}
        formato={j.formato}
        numeroPartes={j.numeroPartes}
        suspensoes={suspensoes}
        escalaoJovem={escalaoJovemDisciplina}
        quadroInicial={quadroInicial}
        podeGerirQuadro={podeGerirQuadro}
        mostrarModoAoVivo={mostrarModoAoVivo}
        sessaoAoVivoTerminada={sessaoAoVivoTerminada}
        linhasMinutosAoVivo={linhasMinutosAoVivo}
      />
    </div>
  );
}
