import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obterJogo } from "@/lib/actions/jogos";
import { listarAtletas } from "@/lib/actions/atletas";
import { obterClubeAtivo } from "@/lib/permissoes";
import { prisma } from "@/lib/db";
import { maxTitulares, MINUTOS_POR_PARTE } from "@/lib/estatisticas";
import { parseRelatorio } from "@/lib/relatorio-jogo";
import {
  reconstruirEmCampo,
  type EventoLocal,
  type SessaoLocal,
  type TipoEventoAoVivo,
} from "@/lib/jogo-ao-vivo-local";
import { JogoAoVivo, type ConvocadoAoVivo } from "@/components/jogos/ao-vivo/JogoAoVivo";
import type { Posicao } from "@prisma/client";

export const metadata: Metadata = { title: "Modo Jogo ao Vivo" };

/** Tipos de evento que pertencem ao Modo Jogo ao Vivo (§8.25.8). */
const TIPOS_AO_VIVO = new Set<TipoEventoAoVivo>([
  "INICIO_PARTE",
  "FIM_PARTE",
  "ENTRADA",
  "SAIDA",
  "PAUSA",
  "RETOMA",
]);

/**
 * Ecrã dedicado de condução do jogo (§8.25). Rota fullscreen: o componente cliente
 * `JogoAoVivo` renderiza-se como uma camada `fixed inset-0`, cobrindo a navegação
 * normal (foco total em beira-campo). A autenticação/licença/isolamento multi-tenant
 * são garantidos pelo layout do grupo `(app)` e por `obterJogo`.
 */
export default async function ModoJogoAoVivoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obterJogo(id);
  if (!res.sucesso) notFound();
  const j = res.dados;

  const [resAtletas, clube] = await Promise.all([
    listarAtletas(j.escalaoId),
    obterClubeAtivo(),
  ]);
  const atletas = resAtletas.sucesso ? resAtletas.dados : [];
  const atletaPorId = new Map(atletas.map((a) => [a.id, a]));

  // Pool = convocados (RN-JV-2/14). A convocatória é gerida à parte (§8.11).
  const convocados: ConvocadoAoVivo[] = j.convocatorias
    .filter((c) => c.convocado)
    .map((c) => {
      const a = atletaPorId.get(c.atletaId);
      return {
        id: c.atletaId,
        nome: a?.nome ?? c.atleta?.nome ?? "Atleta",
        numero: a?.participacaoContexto?.numero ?? j.numeroPorAtleta[c.atletaId] ?? null,
        eGR: (a?.posicoes ?? c.atleta?.posicoes ?? []).includes("GUARDA_REDES"),
        posicoes: a?.posicoes ?? c.atleta?.posicoes ?? [],
      };
    });

  const tamanhoFormato = maxTitulares(j.formato, j.modalidade);
  const duracaoParteMins = j.formato ? MINUTOS_POR_PARTE[j.formato] : 20;
  // 🔁 v7 (§8.25.8): o nº de partes é definido na criação/edição do jogo; o Modo
  // Jogo ao Vivo herda-o (já não se escolhe no arranque).
  const numeroPartes = j.numeroPartes;
  const notasIniciais = parseRelatorio(j.relatorio).notasAoVivo;

  // Arranque pré-carregado (§8.25.3): usa os titulares + posições do plano tático
  // do jogo, se existir. Sem plano tático, fica vazio e o treinador escolhe a
  // partir do pool de convocados (comportamento anterior). Limitado ao tamanho do
  // formato; o treinador pode ajustar antes de iniciar.
  const titularesIniciais: { atletaId: string; posicao: Posicao | null }[] = j.convocatorias
    .filter((c) => c.convocado && c.titularPrevisto)
    .slice(0, tamanhoFormato)
    .map((c) => ({ atletaId: c.atletaId, posicao: c.posicaoPrevista ?? null }));

  // Hidratação a partir do servidor (se já existe sessão). O cliente dá precedência
  // ao estado local (offline-first) — isto é só o ponto de partida noutro dispositivo.
  const sessaoRow = await prisma.sessaoJogoAoVivo.findUnique({ where: { jogoId: j.id } });

  const eventosServidor: EventoLocal[] = j.eventos
    .filter((e) => TIPOS_AO_VIVO.has(e.tipo as TipoEventoAoVivo) && e.segundoJogo != null)
    .map((e) => ({
      clientEventoId: e.clientEventoId ?? e.id,
      tipo: e.tipo as TipoEventoAoVivo,
      segundoJogo: e.segundoJogo as number,
      atletaId: e.atletaId,
      posicao: e.posicao,
      parte: e.parte,
      criadoEm: e.criadoEm.getTime(),
      pendente: false,
    }));

  const sessaoServidor: SessaoLocal | null = sessaoRow
    ? {
        jogoId: j.id,
        numeroPartes: sessaoRow.numeroPartes,
        duracaoParteMins: sessaoRow.duracaoParteMins,
        estado: sessaoRow.estado,
        parteAtual: sessaoRow.parteAtual,
        segundosDecorridos: sessaoRow.segundosDecorridos,
        aCorrerDesde: sessaoRow.aCorrerDesde ? sessaoRow.aCorrerDesde.getTime() : null,
        emCampo: reconstruirEmCampo(eventosServidor),
        servidorIniciado: true,
        atualizadoEm: sessaoRow.atualizadoEm.getTime(),
      }
    : null;

  return (
    <JogoAoVivo
      jogoId={j.id}
      adversario={j.adversario}
      clubeNome={clube?.nome}
      casaFora={j.casaFora}
      escalaoNome={j.escalao.nome}
      modalidade={j.modalidade}
      formato={j.formato}
      convocados={convocados}
      tamanhoFormato={tamanhoFormato}
      numeroPartes={numeroPartes}
      titularesIniciais={titularesIniciais}
      duracaoParteMins={duracaoParteMins}
      notasIniciais={notasIniciais}
      sessaoServidor={sessaoServidor}
      eventosServidor={eventosServidor}
    />
  );
}
