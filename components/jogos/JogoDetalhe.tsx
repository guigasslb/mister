"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Ban, Check, Radio, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  definirConvocatoria,
  guardarEstatisticas,
  guardarRelatorio,
} from "@/lib/actions/jogos";
import {
  LABEL_UTILIZACAO,
  LABEL_SUSPENSAO,
  type SuspensaoPendente,
} from "@/lib/schemas/jogo";
import { parseRelatorio, serializarRelatorio } from "@/lib/relatorio-jogo";
import { MINUTOS_POR_PARTE } from "@/lib/estatisticas";
import { PlanoTatico } from "@/components/jogos/PlanoTatico";
import { EditorMinutosPorParte } from "@/components/jogos/EditorMinutosPorParte";
import { ScoutingJogo } from "@/components/jogos/ScoutingJogo";
import { TimelineEventos, type EventoTimeline } from "@/components/jogos/TimelineEventos";
import type { DiagramaCampo } from "@/lib/schemas/exercicio";
import type {
  BlocoTempo,
  FormatoJogo,
  Modalidade,
  ObservacaoAdversario,
  Posicao,
  TipoMetrica,
  Utilizacao,
} from "@prisma/client";

type Atleta = {
  id: string;
  nome: string;
  numero: number | null;
  eGR: boolean;
  posicoes: Posicao[];
  praticaDuplaModalidade: boolean;
};

type Metrica = { id: string; nome: string; tipo: TipoMetrica; ativa: boolean };

type LinhaPlano = { posicaoPrevista: Posicao | null; titularPrevisto: boolean };

type EstatLinha = {
  atletaId: string;
  utilizacao: Utilizacao;
  blocoTempo: BlocoTempo | null;
  minutos: number | null;
  // Editor de tempo de jogo: minutos absolutos por parte (índice 0 = Parte 1, ...,
  // comprimento = nº de partes do jogo). O total (`minutos`) é a soma deste array.
  minutosPorParte: number[];
  golos: number;
  assistencias: number;
  defesas: number | null;
  golosSofridosGR: number | null;
  faltasCometidas: number | null;
  // Disciplina (§3.7): cartões acumulados por jogo. Aplicam-se a futsal e futebol.
  cartaoAmarelo: number;
  cartaoVermelho: number;
  // 🔁 v7 (§10.8): núcleo estatístico de futebol. Só editado/gravado em jogos de
  // futebol; em futsal fica sempre a null (a grelha nem os mostra).
  remates: number | null;
  cantos: number | null;
  forasDeJogo: number | null;
  desarmes: number | null;
  valoresMetricas: Record<string, number>;
};

export function JogoDetalhe({
  jogoId,
  atletas,
  metricas,
  convocadosIniciais,
  estatisticasIniciais,
  atletasComStatsPersistidas = [],
  relatorioInicial,
  golosMarcados,
  planoInicial,
  capitaoInicial,
  eventos,
  observacoes,
  modalidade,
  formato,
  suspensoes = [],
  escalaoJovem = false,
  quadroInicial = null,
  podeGerirQuadro = false,
  mostrarModoAoVivo = false,
  numeroPartes = 2,
}: {
  jogoId: string;
  atletas: Atleta[];
  metricas: Metrica[];
  convocadosIniciais: string[];
  // §8.11: valores iniciais da grelha já combinam o derivado dos eventos com a
  // edição manual persistida (esta prevalece). Inclui todos os convocados.
  estatisticasIniciais: Record<string, EstatLinha>;
  // §22.4: atletas com estatísticas efetivamente PERSISTIDAS (edição manual
  // guardada). Distingue-os dos que só têm valores derivados — a confirmação de
  // remoção da convocatória só dispara para estes.
  atletasComStatsPersistidas?: string[];
  relatorioInicial: string;
  golosMarcados: number | null;
  planoInicial: Record<string, LinhaPlano>;
  // Capitão de equipa gravado (atletaId) ou null. Só pode haver 1 por jogo.
  capitaoInicial: string | null;
  eventos: EventoTimeline[];
  observacoes: ObservacaoAdversario[];
  // 🔁 v7 (§10.8): modalidade efetiva do jogo → decide o núcleo estatístico
  // exibido; `formato` alimenta a conversão bloco→minutos (tempo de jogo).
  modalidade: Modalidade;
  formato: FormatoJogo | null;
  // BUG-P1-04: suspensões pendentes dos convocados (só preenchido quando este é o
  // próximo jogo do escalão). Alimenta o badge/alerta na convocatória.
  suspensoes?: SuspensaoPendente[];
  // Formação jovem (§3.7): oculta cartões e suspensões (não aplicáveis a menores).
  escalaoJovem?: boolean;
  // §8.10: quadro tático interativo do plano de jogo (persistido em
  // QuadroTatico.diagrama) + gating por MODELO_JOGO_GERIR.
  quadroInicial?: { id: string; diagrama: DiagramaCampo | null } | null;
  podeGerirQuadro?: boolean;
  // §8.25: Modo Jogo ao Vivo. `mostrarModoAoVivo` liga o botão de entrada no
  // separador "Ao Vivo" (só quando o jogo não está terminado). Quando a sessão ao
  // vivo já terminou, o editor manual de minutos (§8.25.6) aparece nas estatísticas.
  mostrarModoAoVivo?: boolean;
  // Nº de partes do jogo (1..4). Define quantos inputs de minutos por parte
  // aparecem no editor de tempo de jogo das Estatísticas.
  numeroPartes?: number;
  // Legado (§8.25.6): props do antigo editor entrada/saída, substituído pelo
  // editor de minutos por parte. Ainda aceites para compatibilidade com o loader
  // enquanto este é atualizado em paralelo; já não são consumidas aqui.
  sessaoAoVivoTerminada?: boolean;
  linhasMinutosAoVivo?: unknown[];
}) {
  const eFutebol = modalidade === "FUTEBOL";
  const suspensaoPorAtleta = new Map(suspensoes.map((s) => [s.atletaId, s]));
  const [convocados, setConvocados] = useState<Set<string>>(
    () => new Set(convocadosIniciais),
  );
  const [estatisticas, setEstatisticas] = useState<Record<string, EstatLinha>>(
    estatisticasIniciais,
  );
  // UX-P3-07: relatório em 3 secções. Retrocompatível — texto puro legado é
  // interpretado como "análise táctica" por `parseRelatorio`.
  const [relatorio, setRelatorio] = useState(() => parseRelatorio(relatorioInicial));
  const [confirmarRemocao, setConfirmarRemocao] = useState<string[] | null>(null);

  const [pendingConv, startConv] = useTransition();
  const [pendingEstat, startEstat] = useTransition();
  const [pendingRel, startRel] = useTransition();

  const atletaPorId = new Map(atletas.map((a) => [a.id, a]));
  const convocadosLista = atletas.filter((a) => convocados.has(a.id));
  // Plano/Timeline/editor de minutos usam a convocatória gravada no servidor (verdade persistida).
  const convocadosSalvos = atletas.filter((a) => convocadosIniciais.includes(a.id));

  // §22.4: atletas com estatísticas efetivamente PERSISTIDAS (edição manual
  // guardada) — NÃO os que só têm valores derivados dos eventos. A confirmação
  // de remoção da convocatória só deve alertar quando há dados guardados a perder.
  const comEstatisticas = new Set(atletasComStatsPersistidas);

  function alternarConvocado(id: string) {
    setConvocados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  // Todos selecionados quando há atletas e todos estão na convocatória local.
  const todosConvocados =
    atletas.length > 0 && atletas.every((a) => convocados.has(a.id));

  function alternarTodos() {
    setConvocados(() =>
      todosConvocados ? new Set() : new Set(atletas.map((a) => a.id)),
    );
  }

  function gravarConvocatoria() {
    startConv(async () => {
      const res = await definirConvocatoria(jogoId, [...convocados]);
      if (res.sucesso) {
        toast.success("Convocatória guardada");
        setConfirmarRemocao(null);
      } else {
        toast.error(res.erro);
      }
    });
  }

  function guardarConvocatoria() {
    // Convocados originais que foram removidos E têm estatísticas registadas (secção 22.4)
    const removidosComStats = convocadosIniciais.filter(
      (id) => !convocados.has(id) && comEstatisticas.has(id),
    );
    if (removidosComStats.length > 0) {
      setConfirmarRemocao(removidosComStats);
      return;
    }
    gravarConvocatoria();
  }

  function estatDe(id: string): EstatLinha {
    return (
      estatisticas[id] ?? {
        atletaId: id,
        utilizacao: "NAO_UTILIZADO",
        blocoTempo: null,
        minutos: null,
        minutosPorParte: [],
        golos: 0,
        assistencias: 0,
        defesas: null,
        golosSofridosGR: null,
        faltasCometidas: null,
        cartaoAmarelo: 0,
        cartaoVermelho: 0,
        remates: null,
        cantos: null,
        forasDeJogo: null,
        desarmes: null,
        valoresMetricas: {},
      }
    );
  }

  function atualizarMetrica(atletaId: string, metricaId: string, valor: number | null) {
    setEstatisticas((prev) => {
      const atual = estatDe(atletaId);
      const valores = { ...atual.valoresMetricas };
      if (valor == null) delete valores[metricaId];
      else valores[metricaId] = valor;
      return { ...prev, [atletaId]: { ...atual, valoresMetricas: valores, atletaId } };
    });
  }

  function atualizarEstat(id: string, patch: Partial<EstatLinha>) {
    setEstatisticas((prev) => ({
      ...prev,
      [id]: { ...estatDe(id), ...patch, atletaId: id },
    }));
  }

  // Editor de tempo de jogo por parte: atualiza o array de minutos por parte do
  // atleta. O total (minutos) é derivado no servidor a partir desta soma.
  function atualizarMinutosPorParte(id: string, minutosPorParte: number[]) {
    atualizarEstat(id, { minutosPorParte });
  }

  // Normaliza o array de minutos por parte para o comprimento = nº de partes do
  // jogo (índices em falta → 0). Usado para semear o editor e o payload.
  function partesNormalizadas(arr: number[] | undefined): number[] {
    return Array.from({ length: Math.max(1, numeroPartes) }, (_, i) => {
      const v = arr?.[i];
      return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    });
  }

  // Aviso visual suave: um valor por parte acima da duração total padrão do jogo
  // (2 × minutos-por-parte do formato) é quase de certeza um erro de digitação.
  const duracaoMaxRazoavel = formato ? MINUTOS_POR_PARTE[formato] * 2 : null;

  const linhasMinutosPorParte = convocadosLista.map((a) => ({
    atletaId: a.id,
    nome: a.nome,
    numero: a.numero,
    minutosPorParte: partesNormalizadas(estatDe(a.id).minutosPorParte),
  }));

  function guardarEstat() {
    const payload = convocadosLista.map((a) => {
      const e = estatDe(a.id);
      return {
        ...e,
        // Minutos por parte com o comprimento certo (= nº de partes); o servidor
        // calcula `minutos = soma` a partir deste array.
        minutosPorParte: partesNormalizadas(e.minutosPorParte),
        valoresMetricas: Object.entries(e.valoresMetricas).map(([metricaId, valor]) => ({
          metricaId,
          valor,
        })),
      };
    });
    startEstat(async () => {
      const res = await guardarEstatisticas(jogoId, payload);
      if (res.sucesso) toast.success("Estatísticas guardadas");
      else toast.error(res.erro);
    });
  }

  function guardarRel() {
    startRel(async () => {
      const res = await guardarRelatorio(jogoId, serializarRelatorio(relatorio));
      if (res.sucesso) toast.success("Relatório guardado");
      else toast.error(res.erro);
    });
  }

  return (
    <Tabs defaultValue="convocatoria">
      {/* 🔁 2026-09-20 (Fase C): 3 separadores. A tab «Ao Vivo» (registo clássico
          por eventos) foi descontinuada — as Estatísticas são a vista consolidada
          única (§8.11) e o CTA «Modo Jogo ao Vivo» vive no topo da Convocatória. */}
      <TabsList className="flex-wrap">
        <TabsTrigger value="convocatoria">Convocatória</TabsTrigger>
        <TabsTrigger value="estatisticas">Estatísticas</TabsTrigger>
        <TabsTrigger value="analise">Análise</TabsTrigger>
      </TabsList>

      {/* ─── Convocatória (+ Plano de jogo) ─── */}
      <TabsContent value="convocatoria" className="space-y-4">
        {/* §8.25: entrada para o ecrã dedicado de condução (Modo Jogo ao Vivo).
            🔁 Fase C: reposicionado para o topo da Convocatória (a tab «Ao Vivo»
            deixou de existir). Só com convocatória gravada e jogo não terminado. */}
        {mostrarModoAoVivo && convocadosSalvos.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-subtitulo text-cinza-900">
                <Radio className="h-4 w-4 text-primary" />
                Modo Jogo ao Vivo
              </p>
              <p className="text-corpo-sec text-cinza-600">
                Cronómetro contínuo, substituições por toque e minutos calculados
                automaticamente no fim.
              </p>
            </div>
            <Button asChild className="min-h-[44px] flex-shrink-0">
              <Link href={`/jogos/${jogoId}/ao-vivo`}>Abrir modo jogo</Link>
            </Button>
          </div>
        )}
        <Tabs defaultValue="convocados">
          <TabsList className="flex-wrap">
            <TabsTrigger value="convocados">Convocados</TabsTrigger>
            <TabsTrigger value="plano">Plano de jogo</TabsTrigger>
          </TabsList>

          <TabsContent value="convocados" className="space-y-4">
        {atletas.length === 0 ? (
          <p className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
            Não há atletas neste escalão nesta época.
          </p>
        ) : (
          <>
            {/* BUG-P1-04: aviso de atletas suspensos para este jogo.
                §3.7: sem suspensões na formação jovem. */}
            {!escalaoJovem && suspensoes.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-vermelho-600/20 bg-vermelho-600/5 px-3 py-2 text-corpo-sec text-vermelho-600">
                <Ban className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-medium">
                    {suspensoes.length === 1
                      ? "1 atleta suspenso para este jogo:"
                      : `${suspensoes.length} atletas suspensos para este jogo:`}
                  </p>
                  <ul className="mt-0.5 list-disc pl-5">
                    {suspensoes.map((s) => (
                      <li key={s.atletaId}>
                        {s.nome} — {LABEL_SUSPENSAO[s.motivo]}
                        {s.motivo === "ACUMULACAO_AMARELOS" && s.amarelosAcumulados != null
                          ? ` (${s.amarelosAcumulados} 🟨)`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-corpo-sec text-cinza-600">
                {convocados.size}/{atletas.length} selecionado(s)
              </p>
              <Button variant="outline" size="sm" onClick={alternarTodos}>
                {todosConvocados ? "Desselecionar todos" : "Selecionar todos"}
              </Button>
            </div>
            <ul className="space-y-2">
              {atletas.map((a) => {
                const suspensao = escalaoJovem
                  ? undefined
                  : suspensaoPorAtleta.get(a.id);
                return (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-2.5 shadow-card"
                >
                  <input
                    type="checkbox"
                    id={`conv-${a.id}`}
                    checked={convocados.has(a.id)}
                    onChange={() => alternarConvocado(a.id)}
                    className="h-5 w-5 accent-primary"
                  />
                  <label htmlFor={`conv-${a.id}`} className="flex-1 text-corpo text-cinza-900">
                    {a.numero != null && <span className="mr-1 text-cinza-400">#{a.numero}</span>}
                    {a.nome}
                    {/* §3.2: atleta de dupla modalidade (futebol + futsal). */}
                    {a.praticaDuplaModalidade && (
                      <span
                        title="Pratica futebol e futsal"
                        className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-azul-300/50 bg-azul-50 px-2 py-0.5 align-middle text-legenda font-medium text-azul-700"
                      >
                        <span aria-hidden>⚽</span>
                        <span aria-hidden>🥅</span>
                        <span className="sr-only">Futebol e futsal</span>
                      </span>
                    )}
                  </label>
                  {suspensao && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-vermelho-600/10 px-2 py-0.5 text-legenda font-medium text-vermelho-600"
                      title={
                        suspensao.motivo === "ACUMULACAO_AMARELOS" &&
                        suspensao.amarelosAcumulados != null
                          ? `${suspensao.amarelosAcumulados} cartões amarelos acumulados na época`
                          : "Cartão vermelho no último jogo"
                      }
                    >
                      <Ban className="h-3 w-3" />
                      {LABEL_SUSPENSAO[suspensao.motivo]}
                    </span>
                  )}
                </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between">
              <p className="text-corpo-sec text-cinza-600">{convocados.size} convocado(s)</p>
              <Button onClick={guardarConvocatoria} disabled={pendingConv}>
                <Check className="h-4 w-4" />
                {pendingConv ? "A guardar…" : "Guardar convocatória"}
              </Button>
            </div>
          </>
        )}
      </TabsContent>

          {/* ─── Plano (dia de jogo) ─── */}
          <TabsContent value="plano" className="space-y-4">
            <PlanoTatico
              jogoId={jogoId}
              convocados={convocadosSalvos.map((a) => ({
                id: a.id,
                nome: a.nome,
                numero: a.numero,
                posicoes: a.posicoes,
              }))}
              planoInicial={planoInicial}
              capitaoInicial={capitaoInicial}
              modalidade={modalidade}
              formato={formato}
              quadroInicial={quadroInicial}
              podeGerirQuadro={podeGerirQuadro}
            />
          </TabsContent>
        </Tabs>
      </TabsContent>

      {/* ─── Estatísticas ─── */}
      <TabsContent value="estatisticas" className="space-y-4">
        {convocadosLista.length === 0 ? (
          <p className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
            Define a convocatória primeiro para registar estatísticas.
          </p>
        ) : (
          <>
            {/* Editor de tempo de jogo por parte: minutos absolutos por cada parte
                do jogo + total (soma automática). Substitui o antigo editor
                entrada/saída e o seletor de bloco de tempo. Pré-preenchido com o
                valor persistido/derivado (§8.11); o total viaja no guardar. */}
            {linhasMinutosPorParte.length > 0 && (
              <EditorMinutosPorParte
                numeroPartes={numeroPartes}
                linhas={linhasMinutosPorParte}
                duracaoMaxRazoavel={duracaoMaxRazoavel}
                onChange={atualizarMinutosPorParte}
              />
            )}
            {(() => {
              const somaGolos = convocadosLista.reduce(
                (acc, a) => acc + (estatDe(a.id).golos ?? 0),
                0,
              );
              if (golosMarcados != null && somaGolos !== golosMarcados) {
                return (
                  <p className="flex items-center gap-1.5 rounded-md bg-ambar-500/10 px-3 py-2 text-corpo-sec text-ambar-600">
                    <TriangleAlert className="h-4 w-4 flex-shrink-0" />
                    A soma dos golos individuais ({somaGolos}) não coincide com o resultado da
                    equipa ({golosMarcados}). Pode ser normal (autogolos), mas confirma.
                  </p>
                );
              }
              return null;
            })()}
            <div className="space-y-3">
              {convocadosLista.map((a) => {
                const e = estatDe(a.id);
                const eGR = atletaPorId.get(a.id)?.eGR ?? false;
                return (
                  <div
                    key={a.id}
                    className="rounded-md border border-cinza-200 bg-white p-3 shadow-card"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-corpo font-medium text-cinza-900">
                        {a.numero != null && (
                          <span className="mr-1 text-cinza-400">#{a.numero}</span>
                        )}
                        {a.nome}
                        {eGR && <span className="ml-1 text-legenda text-cinza-500">(GR)</span>}
                      </p>
                      <Select
                        value={e.utilizacao}
                        onValueChange={(v) => atualizarEstat(a.id, { utilizacao: v as Utilizacao })}
                      >
                        <SelectTrigger className="w-40" aria-label={`Utilização de ${a.nome}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["TITULAR", "UTILIZADO", "NAO_UTILIZADO"] as const).map((u) => (
                            <SelectItem key={u} value={u}>
                              {LABEL_UTILIZACAO[u]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {/* Núcleo específico do GR (defesas / golos sofridos), comum às
                          duas modalidades (§10.8). */}
                      {eGR && (
                        <>
                          <CampoNum
                            label="Defesas"
                            valor={e.defesas}
                            onChange={(n) => atualizarEstat(a.id, { defesas: n })}
                          />
                          <CampoNum
                            label="Golos sofridos"
                            valor={e.golosSofridosGR}
                            onChange={(n) => atualizarEstat(a.id, { golosSofridosGR: n })}
                          />
                        </>
                      )}
                      {/* Golos/assistências: só se mostram para jogadores de campo
                          (mantém o comportamento de futsal — GR não os edita). */}
                      {!eGR && (
                        <>
                          <CampoNum
                            label="Golos"
                            valor={e.golos}
                            onChange={(n) => atualizarEstat(a.id, { golos: n ?? 0 })}
                          />
                          <CampoNum
                            label="Assistências"
                            valor={e.assistencias}
                            onChange={(n) => atualizarEstat(a.id, { assistencias: n ?? 0 })}
                          />
                        </>
                      )}
                      {eFutebol ? (
                        // 🥅 §10.8: núcleo de futebol substitui as faltas por parte.
                        <>
                          <CampoNum
                            label="Remates"
                            valor={e.remates}
                            onChange={(n) => atualizarEstat(a.id, { remates: n })}
                          />
                          <CampoNum
                            label="Cantos"
                            valor={e.cantos}
                            onChange={(n) => atualizarEstat(a.id, { cantos: n })}
                          />
                          <CampoNum
                            label="Foras-de-jogo"
                            valor={e.forasDeJogo}
                            onChange={(n) => atualizarEstat(a.id, { forasDeJogo: n })}
                          />
                          <CampoNum
                            label="Desarmes"
                            valor={e.desarmes}
                            onChange={(n) => atualizarEstat(a.id, { desarmes: n })}
                          />
                        </>
                      ) : (
                        // ⚽ Futsal: faltas cometidas por atleta.
                        <CampoNum
                          label="Faltas"
                          valor={e.faltasCometidas}
                          onChange={(n) => atualizarEstat(a.id, { faltasCometidas: n })}
                        />
                      )}
                      {/* Disciplina (§3.7): cartões — comuns a futsal e futebol,
                          mas ocultos na formação jovem (não aplicáveis a menores). */}
                      {!escalaoJovem && (
                        <>
                          <CampoNum
                            label={
                              <>
                                <span aria-hidden>🟨</span> Cartão amarelo
                              </>
                            }
                            valor={e.cartaoAmarelo}
                            max={5}
                            onChange={(n) => atualizarEstat(a.id, { cartaoAmarelo: n ?? 0 })}
                          />
                          <CampoNum
                            label={
                              <>
                                <span aria-hidden>🟥</span> Cartão vermelho
                              </>
                            }
                            valor={e.cartaoVermelho}
                            max={2}
                            onChange={(n) => atualizarEstat(a.id, { cartaoVermelho: n ?? 0 })}
                          />
                        </>
                      )}
                    </div>

                    {/* Métricas configuráveis */}
                    {metricas.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-cinza-100 pt-2 sm:grid-cols-4">
                        {metricas.map((m) => (
                          <CampoMetrica
                            key={m.id}
                            metrica={m}
                            valor={e.valoresMetricas[m.id] ?? null}
                            onChange={(n) => atualizarMetrica(a.id, m.id, n)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button onClick={guardarEstat} disabled={pendingEstat}>
                <Check className="h-4 w-4" />
                {pendingEstat ? "A guardar…" : "Guardar estatísticas"}
              </Button>
            </div>
          </>
        )}
      </TabsContent>

      {/* ─── Análise (Relatório + Scouting) ─── */}
      <TabsContent value="analise" className="space-y-4">
        <Tabs defaultValue="relatorio">
          <TabsList className="flex-wrap">
            <TabsTrigger value="relatorio">Relatório</TabsTrigger>
            <TabsTrigger value="scouting">Scouting</TabsTrigger>
          </TabsList>

          {/* Relatório estruturado (UX-P3-07) */}
          <TabsContent value="relatorio" className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="rel-analise-tatica"
                  className="text-corpo-sec font-medium text-cinza-900"
                >
                  Análise tática
                </label>
                <Textarea
                  id="rel-analise-tatica"
                  value={relatorio.analiseTatica}
                  onChange={(e) =>
                    setRelatorio((r) => ({ ...r, analiseTatica: e.target.value }))
                  }
                  rows={5}
                  maxLength={3000}
                  placeholder="Como correu taticamente…"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="rel-destaques"
                  className="text-corpo-sec font-medium text-cinza-900"
                >
                  Destaques
                </label>
                <Textarea
                  id="rel-destaques"
                  value={relatorio.destaques}
                  onChange={(e) =>
                    setRelatorio((r) => ({ ...r, destaques: e.target.value }))
                  }
                  rows={4}
                  maxLength={3000}
                  placeholder="Jogadores em destaque, momentos decisivos…"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="rel-proximo-jogo"
                  className="text-corpo-sec font-medium text-cinza-900"
                >
                  Próximo jogo
                </label>
                <Textarea
                  id="rel-proximo-jogo"
                  value={relatorio.proximoJogo}
                  onChange={(e) =>
                    setRelatorio((r) => ({ ...r, proximoJogo: e.target.value }))
                  }
                  rows={4}
                  maxLength={3000}
                  placeholder="Foco para o próximo jogo…"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={guardarRel} disabled={pendingRel}>
                  <Check className="h-4 w-4" />
                  {pendingRel ? "A guardar…" : "Guardar relatório"}
                </Button>
              </div>
            </div>

            {/* Cronologia dos eventos (§10.4) */}
            <div className="space-y-2 border-t border-cinza-100 pt-4">
              <h3 className="text-subtitulo text-cinza-900">Cronologia do jogo</h3>
              <TimelineEventos
                eventos={eventos}
                atletas={convocadosSalvos.map((a) => ({
                  id: a.id,
                  nome: a.nome,
                  numero: a.numero,
                }))}
              />
            </div>
          </TabsContent>

          {/* Scouting (no jogo) */}
          <TabsContent value="scouting" className="space-y-4">
            <ScoutingJogo jogoId={jogoId} observacoes={observacoes} />
          </TabsContent>
        </Tabs>
      </TabsContent>

      {/* Confirmação de remoção com estatísticas (secção 22.4) */}
      <AlertDialog
        open={confirmarRemocao !== null}
        onOpenChange={(aberto) => !aberto && setConfirmarRemocao(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da convocatória?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmarRemocao && confirmarRemocao.length === 1
                ? "Este atleta tem estatísticas registadas neste jogo que serão apagadas:"
                : "Estes atletas têm estatísticas registadas neste jogo que serão apagadas:"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc pl-5 text-corpo-sec text-cinza-900">
            {confirmarRemocao?.map((id) => (
              <li key={id}>{atletaPorId.get(id)?.nome ?? "Atleta"}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={gravarConvocatoria}
              className="bg-vermelho-600 hover:bg-vermelho-600/90 text-white"
            >
              Remover e apagar estatísticas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}

function CampoNum({
  label,
  valor,
  onChange,
  max,
}: {
  label: React.ReactNode;
  valor: number | null;
  onChange: (n: number | null) => void;
  max?: number;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-legenda text-cinza-500">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        min={0}
        max={max}
        value={valor ?? ""}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === "") {
            onChange(null);
            return;
          }
          let n = Number(v);
          if (max != null && n > max) n = max;
          if (n < 0) n = 0;
          onChange(n);
        }}
        className="h-9"
      />
    </div>
  );
}

function CampoMetrica({
  metrica,
  valor,
  onChange,
}: {
  metrica: Metrica;
  valor: number | null;
  onChange: (n: number | null) => void;
}) {
  const id = useId();
  const renderLabel = (htmlFor?: string) => (
    <label htmlFor={htmlFor} className="text-legenda text-cinza-500">
      {metrica.nome}
      {!metrica.ativa && <span className="ml-1 text-cinza-400">(inativa)</span>}
    </label>
  );

  // BOOLEANO: sim/não → 1/0
  if (metrica.tipo === "BOOLEANO") {
    return (
      <div className="space-y-1">
        {renderLabel(id)}
        <Select
          value={valor == null ? "" : String(valor)}
          onValueChange={(v) => onChange(v === "" ? null : Number(v))}
        >
          <SelectTrigger id={id} className="h-9">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Sim</SelectItem>
            <SelectItem value="0">Não</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  // ESCALA: 1 a 5
  if (metrica.tipo === "ESCALA") {
    return (
      <div className="space-y-1">
        {renderLabel(id)}
        <Select
          value={valor == null ? "" : String(valor)}
          onValueChange={(v) => onChange(v === "" ? null : Number(v))}
        >
          <SelectTrigger id={id} className="h-9">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // ESCALA_1_3: 1 a 3 → botões toggle inline
  if (metrica.tipo === "ESCALA_1_3") {
    return (
      <div className="space-y-1">
        {renderLabel()}
        <div
          className="flex gap-1.5"
          role="group"
          aria-label={metrica.nome}
        >
          {[1, 2, 3].map((n) => {
            const ativo = valor === n;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={ativo}
                onClick={() => onChange(ativo ? null : n)}
                className={`flex h-11 min-w-[44px] flex-1 items-center justify-center rounded-md border text-corpo font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  ativo
                    ? "border-primary bg-primary text-white"
                    : "border-cinza-200 text-cinza-700 hover:bg-primary/5"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // NUMERO
  return (
    <div className="space-y-1">
      {renderLabel(id)}
      <Input
        id={id}
        type="number"
        min={0}
        value={valor ?? ""}
        onChange={(e) => {
          const v = e.target.value.trim();
          onChange(v === "" ? null : Number(v));
        }}
        className="h-9"
      />
    </div>
  );
}
