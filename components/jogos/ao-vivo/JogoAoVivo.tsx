"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, CloudOff, Goal, Loader2, Trophy, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { CronometroJogo } from "@/components/jogos/ao-vivo/CronometroJogo";
import { CampoAoVivo, type AtletaAoVivo } from "@/components/jogos/ao-vivo/CampoAoVivo";
import { TituloConfronto } from "@/components/jogos/TituloConfronto";
import { ModalSubstituicao } from "@/components/jogos/ao-vivo/ModalSubstituicao";
import { ModalAcoesJogador } from "@/components/jogos/ao-vivo/ModalAcoesJogador";
import { BarraControloJogo } from "@/components/jogos/ao-vivo/BarraControloJogo";
import {
  guardarNotaJogoAoVivo,
  iniciarJogoAoVivo,
  sincronizarJogoAoVivo,
  terminarJogoAoVivo,
} from "@/lib/actions/jogo-ao-vivo";
import { paraEventoCliente } from "@/components/jogos/ao-vivo/acoes";
import {
  eventosPendentes,
  gerarClientEventoId,
  guardarEstadoLocal,
  obterEstadoLocal,
  segundoCorrente,
  type EstadoLocalCompleto,
  type EventoLocal,
  type SessaoLocal,
  type TipoEventoLocal,
} from "@/lib/jogo-ao-vivo-local";
import {
  calcularMinutosDeEventos,
  type TipoEventoJogoAoVivo,
} from "@/lib/minutos-jogo";
import { ArranqueAoVivo } from "@/components/jogos/ao-vivo/ArranqueAoVivo";
import { LABEL_CASA_FORA } from "@/lib/schemas/jogo";
import type { CasaFora, FormatoJogo, Modalidade, Posicao } from "@prisma/client";

/** Convocado disponível como *pool* do Modo Jogo ao Vivo (§8.25.1). */
export interface ConvocadoAoVivo {
  id: string;
  nome: string;
  numero: number | null;
  eGR: boolean;
  posicoes: Posicao[];
}

interface JogoAoVivoProps {
  jogoId: string;
  adversario: string;
  // §9: nome do clube do utilizador (nossa equipa) para o título do confronto.
  clubeNome: string | null | undefined;
  casaFora: CasaFora;
  escalaoNome: string;
  modalidade: Modalidade;
  formato: FormatoJogo | null;
  convocados: ConvocadoAoVivo[];
  tamanhoFormato: number;
  /** Nº de partes herdado do jogo (§8.25.8) — já não se escolhe no arranque. */
  numeroPartes: number;
  /** Pré-seleção do arranque vinda do plano tático (titulares + posições). */
  titularesIniciais: { atletaId: string; posicao: Posicao | null }[];
  duracaoParteMins: number;
  notasIniciais: string;
  /** Estado hidratado do servidor (se já existir uma sessão); local tem precedência. */
  sessaoServidor: SessaoLocal | null;
  eventosServidor: EventoLocal[];
}

/**
 * Orquestrador do ecrã de condução `/jogos/[id]/ao-vivo` (§8.25). Mantém o estado
 * do jogo (sessão + eventos append-only) em memória, persiste-o localmente em
 * tempo real (IndexedDB/localStorage — offline-first) e sincroniza a *outbox* com
 * o servidor quando há rede. Todas as transições de estado seguem §8.25.3.
 */
export function JogoAoVivo(props: JogoAoVivoProps) {
  const { jogoId, convocados } = props;

  const [estado, setEstado] = useState<EstadoLocalCompleto | null>(null);
  const [hidratado, setHidratado] = useState(false);
  const [notas, setNotas] = useState(props.notasIniciais);
  const [online, setOnline] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [saiId, setSaiId] = useState<string | null>(null);
  // Jogador tocado para o menu de ações (Golo/Cartão/Substituir) — Fase B.
  const [acoesId, setAcoesId] = useState<string | null>(null);
  const [confirmarTerminar, setConfirmarTerminar] = useState(false);
  // Só há `document.body` no cliente: guarda para o portal (evita mismatch de hidratação).
  const [montado, setMontado] = useState(false);
  // Tick para refrescar os minutos/tempo em campo a cada segundo (quando a correr).
  const [, setTick] = useState(0);

  useEffect(() => setMontado(true), []);

  const convocadoPorId = new Map(convocados.map((c) => [c.id, c]));

  // ── Hidratação: local tem precedência (offline-first, RN-JV-11) ──────────────
  useEffect(() => {
    let vivo = true;
    (async () => {
      const local = await obterEstadoLocal(jogoId);
      if (!vivo) return;
      if (local) {
        setEstado(local);
      } else if (props.sessaoServidor) {
        setEstado({
          jogoId,
          sessao: props.sessaoServidor,
          eventos: props.eventosServidor,
        });
      } else {
        setEstado(null);
      }
      setHidratado(true);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jogoId]);

  // ── Estado de rede ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator !== "undefined") setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // ── Tick de 1s enquanto o cronómetro corre ──────────────────────────────────
  const aCorrer = estado?.sessao.estado === "EM_CURSO" && estado?.sessao.aCorrerDesde != null;
  useEffect(() => {
    if (!aCorrer) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [aCorrer]);

  // ── Persistência + sincronização ─────────────────────────────────────────────
  const sincronizarRef = useRef(false);

  const sincronizar = useCallback(
    async (atual: EstadoLocalCompleto) => {
      if (sincronizarRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      // Nada a fazer antes de o jogo arrancar localmente.
      if (atual.sessao.estado === "POR_INICIAR") return;

      sincronizarRef.current = true;
      try {
        let trabalho = atual;

        // (1) Offline-first: se a sessão ainda não existe no servidor, cria-a a
        // partir dos titulares locais (ENTRADA no segundo 0). Essas ENTRADA são
        // criadas pela própria action — marcamo-las como sincronizadas para não as
        // reenviar pela outbox (evita duplicados). O INICIO_PARTE e as restantes
        // primitivas seguem pela outbox (idempotentes por clientEventoId).
        if (!trabalho.sessao.servidorIniciado) {
          const titulares = trabalho.eventos
            .filter((e) => e.tipo === "ENTRADA" && e.segundoJogo === 0 && e.atletaId)
            .map((e) => ({ atletaId: e.atletaId as string, posicao: e.posicao ?? null }));
          if (titulares.length === 0) return;
          const resIni = await iniciarJogoAoVivo(jogoId, {
            numeroPartes: trabalho.sessao.numeroPartes,
            duracaoParteMins: trabalho.sessao.duracaoParteMins,
            titulares,
          });
          if (!resIni.sucesso) return; // sem rede/erro → tenta mais tarde
          trabalho = {
            ...trabalho,
            sessao: { ...trabalho.sessao, servidorIniciado: true },
            eventos: trabalho.eventos.map((e) =>
              e.tipo === "ENTRADA" && e.segundoJogo === 0
                ? { ...e, pendente: false }
                : e,
            ),
          };
        }

        // (2) Envia a outbox (upsert idempotente por clientEventoId).
        const pendentes = eventosPendentes(trabalho);
        if (pendentes.length > 0) {
          const res = await sincronizarJogoAoVivo(jogoId, pendentes.map(paraEventoCliente));
          if (!res.sucesso) {
            // Mantém o que já foi consolidado (init), tenta reenviar a outbox depois.
            if (trabalho !== atual) {
              setEstado(trabalho);
              void guardarEstadoLocal(jogoId, trabalho);
            }
            return;
          }
          trabalho = {
            ...trabalho,
            eventos: trabalho.eventos.map((e) => ({ ...e, pendente: false })),
          };
        }

        if (trabalho !== atual) {
          setEstado(trabalho);
          void guardarEstadoLocal(jogoId, trabalho);
        }
      } finally {
        sincronizarRef.current = false;
      }
    },
    [jogoId],
  );

  const persistir = useCallback(
    (next: EstadoLocalCompleto, autoSync = true) => {
      setEstado(next);
      void guardarEstadoLocal(jogoId, next);
      if (autoSync) void sincronizar(next);
    },
    [jogoId, sincronizar],
  );

  // Finalização no servidor (§8.25.5): garante que a outbox foi enviada e chama
  // `terminarJogoAoVivo`, que regista as SAIDA finais e persiste minutos/utilização.
  const finalizadoRef = useRef(false);
  const finalizarNoServidor = useCallback(
    async (atual: EstadoLocalCompleto, segundoFinal: number) => {
      if (finalizadoRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      finalizadoRef.current = true;
      try {
        await sincronizar(atual);
        const res = await terminarJogoAoVivo(jogoId, segundoFinal);
        if (!res.sucesso) {
          finalizadoRef.current = false; // permite nova tentativa
          toast.error(res.erro);
        }
      } catch {
        finalizadoRef.current = false;
      }
    },
    [jogoId, sincronizar],
  );

  // Tenta sincronizar (e finalizar, se terminado) quando a rede regressa.
  useEffect(() => {
    if (!online || !estado) return;
    if (estado.sessao.estado === "TERMINADO") {
      void finalizarNoServidor(estado, estado.sessao.segundosDecorridos);
    } else {
      void sincronizar(estado);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // ── Helpers de construção de eventos ─────────────────────────────────────────
  function novoEvento(
    tipo: TipoEventoLocal,
    segundoJogo: number,
    extra?: {
      atletaId?: string | null;
      atletaSecundarioId?: string | null;
      posicao?: Posicao | null;
      parte?: number | null;
    },
  ): EventoLocal {
    return {
      clientEventoId: gerarClientEventoId(),
      tipo,
      segundoJogo,
      atletaId: extra?.atletaId ?? null,
      atletaSecundarioId: extra?.atletaSecundarioId ?? null,
      posicao: extra?.posicao ?? null,
      parte: extra?.parte ?? null,
      criadoEm: Date.now(),
      pendente: true,
    };
  }

  // ── Transições (§8.25.3) ─────────────────────────────────────────────────────
  function iniciar(titulares: { atletaId: string; posicao: Posicao | null }[]) {
    const agora = Date.now();
    const eventos: EventoLocal[] = [
      novoEvento("INICIO_PARTE", 0, { parte: 1 }),
      ...titulares.map((t) =>
        novoEvento("ENTRADA", 0, { atletaId: t.atletaId, posicao: t.posicao }),
      ),
    ];
    const sessao: SessaoLocal = {
      jogoId,
      // §8.25.8: o nº de partes é herdado do jogo, não escolhido no arranque.
      numeroPartes: props.numeroPartes,
      duracaoParteMins: props.duracaoParteMins,
      estado: "EM_CURSO",
      parteAtual: 1,
      segundosDecorridos: 0,
      aCorrerDesde: agora,
      emCampo: titulares.map((t) => ({
        atletaId: t.atletaId,
        posicao: t.posicao,
        entradaSegundo: 0,
      })),
      servidorIniciado: false,
      atualizadoEm: agora,
    };
    persistir({ jogoId, sessao, eventos });
    toast.success("Jogo iniciado — Parte 1");
  }

  function comSessao(fn: (s: SessaoLocal) => EstadoLocalCompleto) {
    if (!estado) return;
    persistir(fn(estado.sessao));
  }

  function substituir(entraId: string) {
    if (!estado || !saiId) return;
    const s = estado.sessao;
    const seg = segundoCorrente(s);
    const jogadorSai = s.emCampo.find((j) => j.atletaId === saiId);
    const posicao = jogadorSai?.posicao ?? null;
    const eventos: EventoLocal[] = [
      ...estado.eventos,
      novoEvento("SAIDA", seg, { atletaId: saiId }),
      novoEvento("ENTRADA", seg, { atletaId: entraId, posicao }),
    ];
    const emCampo = s.emCampo.map((j) =>
      j.atletaId === saiId ? { atletaId: entraId, posicao, entradaSegundo: seg } : j,
    );
    persistir({
      jogoId,
      sessao: { ...s, emCampo, atualizadoEm: Date.now() },
      eventos,
    });
    setSaiId(null);
    const entra = convocadoPorId.get(entraId);
    toast.success(`Entra ${entra?.nome ?? "atleta"}`);
  }

  // ── Registo desportivo por toque (Fase B) ────────────────────────────────────
  // Golo/cartão entram na mesma outbox append-only e sincronizam pelo caminho
  // normal; o backend persiste como EventoJogo e atualiza o placar. O segundo e a
  // parte são automáticos (cronómetro corrente). A assistência vai embutida no GOLO.
  function registarGolo(marcadorId: string, assistenteId: string | null) {
    if (!estado) return;
    const s = estado.sessao;
    const seg = segundoCorrente(s);
    persistir({
      jogoId,
      sessao: { ...s, atualizadoEm: Date.now() },
      eventos: [
        ...estado.eventos,
        novoEvento("GOLO", seg, {
          atletaId: marcadorId,
          atletaSecundarioId: assistenteId,
          parte: s.parteAtual,
        }),
      ],
    });
    setAcoesId(null);
    const marcador = convocadoPorId.get(marcadorId);
    const assistente = assistenteId ? convocadoPorId.get(assistenteId) : null;
    toast.success(
      assistente
        ? `Golo de ${marcador?.nome ?? "atleta"} (ass. ${assistente.nome})`
        : `Golo de ${marcador?.nome ?? "atleta"}`,
    );
  }

  function registarGoloSofrido() {
    if (!estado) return;
    const s = estado.sessao;
    const seg = segundoCorrente(s);
    persistir({
      jogoId,
      sessao: { ...s, atualizadoEm: Date.now() },
      eventos: [...estado.eventos, novoEvento("GOLO_SOFRIDO", seg, { parte: s.parteAtual })],
    });
    toast("Golo sofrido");
  }

  function registarCartao(
    atletaId: string,
    tipo: "CARTAO_AMARELO" | "CARTAO_VERMELHO",
  ) {
    if (!estado) return;
    const s = estado.sessao;
    const seg = segundoCorrente(s);
    persistir({
      jogoId,
      sessao: { ...s, atualizadoEm: Date.now() },
      eventos: [...estado.eventos, novoEvento(tipo, seg, { atletaId, parte: s.parteAtual })],
    });
    setAcoesId(null);
    const atleta = convocadoPorId.get(atletaId);
    toast(
      tipo === "CARTAO_AMARELO"
        ? `Cartão amarelo — ${atleta?.nome ?? "atleta"}`
        : `Cartão vermelho — ${atleta?.nome ?? "atleta"}`,
    );
  }

  function terminarParte() {
    comSessao((s) => {
      const seg = segundoCorrente(s);
      return {
        jogoId,
        sessao: {
          ...s,
          segundosDecorridos: seg,
          aCorrerDesde: null,
          estado: "INTERVALO",
          atualizadoEm: Date.now(),
        },
        eventos: [...estado!.eventos, novoEvento("FIM_PARTE", seg, { parte: s.parteAtual })],
      };
    });
    toast("Intervalo");
  }

  function iniciarParteSeguinte() {
    comSessao((s) => {
      const novaParte = Math.min(s.parteAtual + 1, s.numeroPartes);
      const agora = Date.now();
      return {
        jogoId,
        sessao: {
          ...s,
          parteAtual: novaParte,
          aCorrerDesde: agora,
          estado: "EM_CURSO",
          atualizadoEm: agora,
        },
        eventos: [
          ...estado!.eventos,
          novoEvento("INICIO_PARTE", s.segundosDecorridos, { parte: novaParte }),
        ],
      };
    });
  }

  function pausar() {
    comSessao((s) => {
      const seg = segundoCorrente(s);
      return {
        jogoId,
        sessao: {
          ...s,
          segundosDecorridos: seg,
          aCorrerDesde: null,
          estado: "PAUSADO",
          atualizadoEm: Date.now(),
        },
        eventos: [...estado!.eventos, novoEvento("PAUSA", seg)],
      };
    });
  }

  function retomar() {
    comSessao((s) => {
      const agora = Date.now();
      return {
        jogoId,
        sessao: { ...s, aCorrerDesde: agora, estado: "EM_CURSO", atualizadoEm: agora },
        eventos: [...estado!.eventos, novoEvento("RETOMA", s.segundosDecorridos)],
      };
    });
  }

  function terminar() {
    if (!estado) return;
    setConfirmarTerminar(false);
    const s = estado.sessao;
    const seg = segundoCorrente(s);
    // Não geramos SAIDA finais localmente: `terminarJogoAoVivo` fá-lo no servidor
    // (a partir dos eventos) e o cálculo local trata quem fica em campo com
    // saída = segundo final. Evita SAIDA duplicadas no servidor.
    const next: EstadoLocalCompleto = {
      jogoId,
      sessao: {
        ...s,
        segundosDecorridos: seg,
        aCorrerDesde: null,
        estado: "TERMINADO",
        emCampo: [],
        atualizadoEm: Date.now(),
      },
      eventos: estado.eventos,
    };
    persistir(next, false);
    toast.success("Jogo terminado — minutos calculados");
    void finalizarNoServidor(next, seg);
  }

  async function guardarNotas(texto: string) {
    setNotas(texto);
    const res = await guardarNotaJogoAoVivo(jogoId, texto);
    if (res.sucesso) toast.success("Notas guardadas");
    else toast.error(res.erro);
  }

  // ── Derivações para render ───────────────────────────────────────────────────
  const sessao = estado?.sessao ?? null;
  const segAtual = sessao ? segundoCorrente(sessao) : 0;

  // Placar ao vivo (§ Fase B): contagem dos eventos locais de golo.
  let golosMarcados = 0;
  let golosSofridos = 0;
  for (const e of estado?.eventos ?? []) {
    if (e.tipo === "GOLO") golosMarcados += 1;
    else if (e.tipo === "GOLO_SOFRIDO") golosSofridos += 1;
  }

  const minutosPorAtleta = new Map<string, number>();
  if (estado) {
    for (const m of calcularMinutosDeEventos(
      // Só as primitivas da linha do tempo contam para os minutos; os eventos de
      // registo (GOLO/CARTAO_*) são ignorados pelo motor (o cast é seguro).
      estado.eventos.map((e) => ({
        tipo: e.tipo as TipoEventoJogoAoVivo,
        segundoJogo: e.segundoJogo,
        atletaId: e.atletaId ?? undefined,
        parte: e.parte ?? undefined,
      })),
      segAtual,
    )) {
      minutosPorAtleta.set(m.atletaId, m.minutos);
    }
  }

  function toAtletaAoVivo(atletaId: string, posicao: Posicao | null): AtletaAoVivo {
    const c = convocadoPorId.get(atletaId);
    return {
      id: atletaId,
      nome: c?.nome ?? "Atleta",
      numero: c?.numero ?? null,
      posicao,
      minutos: minutosPorAtleta.get(atletaId) ?? 0,
    };
  }

  const emCampoAtletas: AtletaAoVivo[] = (sessao?.emCampo ?? []).map((j) =>
    toAtletaAoVivo(j.atletaId, j.posicao),
  );
  const idsEmCampo = new Set((sessao?.emCampo ?? []).map((j) => j.atletaId));
  const bancoAtletas: AtletaAoVivo[] = convocados
    .filter((c) => !idsEmCampo.has(c.id))
    .map((c) => toAtletaAoVivo(c.id, c.posicoes[0] ?? null));

  const nomeEquipa = props.casaFora === "CASA" ? "Casa" : "Fora";

  // ── Render ───────────────────────────────────────────────────────────────────
  const conteudo = (
    <div className="fixed inset-0 z-[70] flex flex-col bg-ink text-white">
      {/* Cabeçalho fixo */}
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/10"
        >
          <Link href={`/jogos/${jogoId}`}>
            <ArrowLeft className="h-4 w-4" />
            Sair
          </Link>
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-corpo font-semibold">
            <TituloConfronto
              clubeNome={props.clubeNome}
              adversario={props.adversario}
              casaFora={props.casaFora}
              aplicarCor={false}
            />
          </p>
          <p className="truncate text-legenda text-white/60">
            {props.escalaoNome} · {LABEL_CASA_FORA[props.casaFora]} ({nomeEquipa})
          </p>
        </div>
        <span
          className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-legenda text-white/70"
          title={online ? "Online" : "Offline — os eventos ficam guardados localmente"}
        >
          {online ? (
            <Wifi className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-ambar-500" aria-hidden />
          )}
          <span className="sr-only">{online ? "Online" : "Offline"}</span>
        </span>
      </header>

      {/* Corpo com scroll */}
      <main className="flex-1 overflow-y-auto px-4 py-5">
        {!hidratado ? (
          <div className="flex h-full items-center justify-center text-white/60">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
            A carregar…
          </div>
        ) : !sessao || sessao.estado === "POR_INICIAR" ? (
          <ArranqueAoVivo
            convocados={convocados}
            tamanhoFormato={props.tamanhoFormato}
            titularesIniciais={props.titularesIniciais}
            modalidade={props.modalidade}
            jogoId={jogoId}
            onIniciar={iniciar}
          />
        ) : sessao.estado === "TERMINADO" ? (
          <ResumoFinal
            jogoId={jogoId}
            convocados={convocados}
            minutosPorAtleta={minutosPorAtleta}
          />
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="rounded-2xl bg-white/5 py-6">
              <CronometroJogo
                segundosBase={sessao.segundosDecorridos}
                aCorrerDesde={sessao.aCorrerDesde}
                parteAtual={sessao.parteAtual}
                numeroPartes={sessao.numeroPartes}
              />
              {sessao.estado === "INTERVALO" && (
                <p className="mt-2 text-center text-corpo-sec font-medium uppercase tracking-wide text-ambar-500">
                  Intervalo
                </p>
              )}
              {sessao.estado === "PAUSADO" && (
                <p className="mt-2 flex items-center justify-center gap-1 text-center text-corpo-sec font-medium uppercase tracking-wide text-ambar-500">
                  <CloudOff className="h-4 w-4" aria-hidden /> Pausado
                </p>
              )}

              {/* Placar ao vivo (Fase B): derivado dos eventos de golo locais. */}
              <div className="mt-4 flex items-center justify-center gap-4 border-t border-white/10 pt-4">
                <div className="text-center">
                  <p className="max-w-[9rem] truncate text-legenda uppercase tracking-wide text-white/60">
                    {props.clubeNome || "A nossa equipa"}
                  </p>
                  <p className="text-titulo-pagina font-bold tabular-nums text-white">
                    {golosMarcados}
                  </p>
                </div>
                <span className="text-corpo font-semibold text-white/40">–</span>
                <div className="text-center">
                  <p className="max-w-[9rem] truncate text-legenda uppercase tracking-wide text-white/60">
                    {props.adversario}
                  </p>
                  <p className="text-titulo-pagina font-bold tabular-nums text-white">
                    {golosSofridos}
                  </p>
                </div>
              </div>
              {sessao.estado === "EM_CURSO" && (
                <div className="mt-3 flex justify-center">
                  <Button
                    onClick={registarGoloSofrido}
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] border-white/25 bg-white/10 text-white hover:bg-white/20"
                  >
                    <Goal className="h-4 w-4" />
                    Golo sofrido
                  </Button>
                </div>
              )}
            </div>

            <CampoAoVivo
              emCampo={emCampoAtletas}
              banco={bancoAtletas}
              onTapEmCampo={setAcoesId}
              interativo={sessao.estado === "EM_CURSO" || sessao.estado === "INTERVALO"}
            />
          </div>
        )}
      </main>

      {/* Barra de controlo fixa */}
      {hidratado && sessao && sessao.estado !== "POR_INICIAR" && sessao.estado !== "TERMINADO" && (
        <footer className="border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <BarraControloJogo
            estado={sessao.estado}
            parteAtual={sessao.parteAtual}
            numeroPartes={sessao.numeroPartes}
            ocupado={ocupado}
            notas={notas}
            onIniciarParte={iniciarParteSeguinte}
            onTerminarParte={terminarParte}
            onPausar={pausar}
            onRetomar={retomar}
            onTerminarJogo={() => setConfirmarTerminar(true)}
            onGuardarNotas={(t) => {
              setOcupado(true);
              void guardarNotas(t).finally(() => setOcupado(false));
            }}
          />
        </footer>
      )}

      {/* Menu de ações do jogador (Golo / Cartão / Substituir) — Fase B */}
      <ModalAcoesJogador
        jogador={
          acoesId
            ? toAtletaAoVivo(
                acoesId,
                sessao?.emCampo.find((j) => j.atletaId === acoesId)?.posicao ?? null,
              )
            : null
        }
        outrosEmCampo={emCampoAtletas.filter((a) => a.id !== acoesId)}
        onGolo={registarGolo}
        onCartao={registarCartao}
        onSubstituir={(atletaId) => {
          setAcoesId(null);
          setSaiId(atletaId);
        }}
        onFechar={() => setAcoesId(null)}
      />

      {/* Modal de substituição */}
      <ModalSubstituicao
        jogadorSai={saiId ? toAtletaAoVivo(saiId, sessao?.emCampo.find((j) => j.atletaId === saiId)?.posicao ?? null) : null}
        banco={bancoAtletas}
        onConfirmar={substituir}
        onCancelar={() => setSaiId(null)}
      />

      {/* Confirmação de terminar jogo */}
      <AlertDialog open={confirmarTerminar} onOpenChange={setConfirmarTerminar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminar o jogo?</AlertDialogTitle>
            <AlertDialogDescription>
              Os jogadores em campo saem no segundo atual e os minutos de cada
              atleta são calculados. Podes ajustá-los depois na grelha de
              estatísticas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={terminar}>Terminar jogo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  // Takeover fullscreen via portal para o <body>. Sem isto, o overlay `fixed
  // inset-0` fica ancorado ao ancestral `.app-content`, que retém um `transform`
  // (animar-entrada com fill-mode `both` termina em translateY(0)) e passa a ser
  // o bloco de contenção do `position: fixed`. O resultado era o `bg-ink` opaco
  // não cobrir a viewport, deixando a marca de água do clube (layout do grupo
  // `(app)`, `object-fit: contain`) aparecer gigante por trás. Ancorado ao body,
  // o overlay cobre o ecrã e esconde a marca de água.
  if (!montado) return null;
  return createPortal(conteudo, document.body);
}

/** Resumo pós-jogo com os minutos calculados por atleta (§8.25.5). */
function ResumoFinal({
  jogoId,
  convocados,
  minutosPorAtleta,
}: {
  jogoId: string;
  convocados: ConvocadoAoVivo[];
  minutosPorAtleta: Map<string, number>;
}) {
  const linhas = convocados
    .map((c) => ({ ...c, minutos: minutosPorAtleta.get(c.id) ?? 0 }))
    .sort((a, b) => b.minutos - a.minutos);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="text-center">
        <Trophy className="mx-auto h-10 w-10 text-primary" aria-hidden />
        <h2 className="mt-2 text-titulo-pagina font-bold text-white">Jogo terminado</h2>
        <p className="text-corpo-sec text-white/70">
          Minutos calculados automaticamente. Revê e ajusta na grelha de
          estatísticas do jogo.
        </p>
      </div>

      <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/5">
        {linhas.map((l) => (
          <li key={l.id} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-corpo text-white">
              {l.numero != null && <span className="text-white/50">#{l.numero} </span>}
              {l.nome}
            </span>
            <span className="tabular-nums text-corpo font-semibold text-white">
              {l.minutos}′
            </span>
          </li>
        ))}
      </ul>

      <Button asChild className="w-full">
        <Link href={`/jogos/${jogoId}`}>Voltar ao jogo</Link>
      </Button>
    </div>
  );
}
