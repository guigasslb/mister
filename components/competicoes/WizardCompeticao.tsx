"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Trophy,
  Users,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  X,
  Globe,
  Building2,
  TriangleAlert,
  Sparkles,
  PencilLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { cn } from "@/lib/utils";
import {
  LABEL_FORMATO_COMPETICAO,
  LABEL_AMBITO_COMPETICAO,
} from "@/lib/schemas/competicao";
import { LABEL_TIPO_JOGO } from "@/lib/schemas/jogo";
import { gerarLiga, gerarBracket, type EquipaQuadro } from "@/lib/quadro-cliente";
import {
  adicionarConfronto,
  adicionarRonda,
  agruparPorRonda,
  atualizarConfronto,
  deGerados,
  moverNaJornada,
  mudarRonda,
  paraPayload,
  removerConfronto,
  rondaMaxima,
  trocar,
  validarCalendario,
  type JogoCalendario,
} from "@/lib/calendario-wizard";
import { opcoesRonda, vezesNaJornada } from "@/lib/confronto-dialogos-ui";
import { participantesWizard, type EquipaWizard } from "@/lib/subequipas-ui";
import { criarCompeticaoCompleta } from "@/lib/actions/competicoes";
import type {
  AmbitoCompeticao,
  FormatoCompeticao,
  FormatoJogo,
  TipoJogo,
} from "@prisma/client";

type EscalaoBasico = { id: string; nome: string };
type EpocaBasica = { id: string; nome: string; ativa: boolean };

/** Rótulos dos formatos de jogo (§3.7). Local — não há mapa partilhado ainda. */
const LABEL_FORMATO_JOGO: Record<FormatoJogo, string> = {
  FUTSAL_5: "Futsal (5)",
  FUTEBOL_3_3: "Futebol 3x3",
  FUTEBOL_5_5: "Futebol 5x5",
  FUTEBOL_7: "Futebol de 7",
  FUTEBOL_9: "Futebol de 9",
  FUTEBOL_11: "Futebol de 11",
};

const AMBITOS: AmbitoCompeticao[] = ["EXTERNA", "PROPRIA"];
const PONTOS_VITORIA_OPCOES = [3, 2] as const;

/** Descrição contextual de cada âmbito (Passo 1 — §23.4 Fluxo A). */
const DESCRICAO_AMBITO: Record<AmbitoCompeticao, string> = {
  EXTERNA: "Registas resultados de terceiros para acompanhar a classificação.",
  PROPRIA: "O clube organiza a prova, convida equipas e gere o calendário.",
};

const FORMATOS: FormatoCompeticao[] = ["LIGA", "TORNEIO", "TACA"];
const FORMATOS_JOGO: FormatoJogo[] = [
  "FUTSAL_5",
  "FUTEBOL_3_3",
  "FUTEBOL_5_5",
  "FUTEBOL_7",
  "FUTEBOL_9",
  "FUTEBOL_11",
];

const FORMATO_JOGO_AUTO = "__auto__";

/** Passo 3: calendário gerado pelo formato ou introduzido à mão (ex.: copiar da FPF). */
type ModoCalendario = "GERADO" | "MANUAL";

const PASSOS = [
  { chave: "base", titulo: "Informação base" },
  { chave: "equipas", titulo: "Equipas" },
  { chave: "quadro", titulo: "Quadro e agendamento" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes de apresentação (self-contained)
// ─────────────────────────────────────────────────────────────────────────────

function PassosIndicador({ atual }: { atual: number }) {
  return (
    <div className="space-y-3">
      <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
        Passo {atual + 1} de {PASSOS.length} · {PASSOS[atual].titulo}
      </p>
      <div className="flex items-center gap-2" role="list" aria-label="Progresso do assistente">
        {PASSOS.map((p, i) => (
          <div
            key={p.chave}
            role="listitem"
            aria-current={i === atual ? "step" : undefined}
            className={cn(
              "h-2 flex-1 rounded-full transition-colors",
              i < atual && "bg-verde-600",
              i === atual && "bg-primary",
              i > atual && "bg-cinza-200",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function CartaoPasso({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-cinza-200 bg-white p-4 shadow-card sm:p-6">
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard
// ─────────────────────────────────────────────────────────────────────────────

export function WizardCompeticao({
  escaloes,
  epocas,
}: {
  escaloes: EscalaoBasico[];
  epocas: EpocaBasica[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [passoIndex, setPassoIndex] = useState(0);
  const chaveAtual = PASSOS[passoIndex].chave;

  const epocaAtiva = useMemo(() => epocas.find((e) => e.ativa) ?? epocas[0], [epocas]);

  // ── Passo 1 — informação base ──────────────────────────────────────────────
  const [nome, setNome] = useState("");
  const [ambito, setAmbito] = useState<AmbitoCompeticao>("PROPRIA");
  const [pontosVitoria, setPontosVitoria] = useState<3 | 2>(3);
  const [tipo, setTipo] = useState<TipoJogo>("OFICIAL");
  const [formato, setFormato] = useState<FormatoCompeticao>("LIGA");
  const [formatoJogo, setFormatoJogo] = useState<string>(FORMATO_JOGO_AUTO);
  const [escalaoId, setEscalaoId] = useState(escaloes[0]?.id ?? "");
  const [erros, setErros] = useState<Record<string, string>>({});

  // ── Passo 2 — equipas ──────────────────────────────────────────────────────
  const [equipas, setEquipas] = useState<EquipaWizard[]>([]);
  const [novaEquipa, setNovaEquipa] = useState("");
  const [duasMaos, setDuasMaos] = useState(false);

  // ── Passo 3 — quadro ───────────────────────────────────────────────────────
  const [jogos, setJogos] = useState<JogoCalendario[]>([]);
  const [chaveGerada, setChaveGerada] = useState<string>("");
  const [modo, setModo] = useState<ModoCalendario>("GERADO");
  // Alguma mutação manual do calendário — a partir daí nunca se regenera por cima.
  const [editado, setEditado] = useState(false);
  const [confirmar, setConfirmar] = useState<"MANUAL" | "GERAR" | null>(null);
  const [foco, setFoco] = useState<{ chave: string; direcao: -1 | 1 } | null>(null);
  const [anuncio, setAnuncio] = useState("");

  const eLiga = formato === "LIGA";

  // Nome do escalão selecionado (equipa própria em competições PROPRIA).
  const escalaoNome = useMemo(
    () => escaloes.find((e) => e.id === escalaoId)?.nome.trim() ?? "",
    [escaloes, escalaoId],
  );

  // P1.6 (§23.4 Fluxo D): em competições PRÓPRIAS a equipa do escalão é o primeiro
  // participante (marcada PROPRIO, não removível); as restantes são EXTERNO. Numa
  // EXTERNA todos os participantes são as equipas introduzidas pelo utilizador.
  // §23.11.3 regra 9: entradas marcadas como «Equipa própria» (subequipas) — se
  // houver alguma, o escalão deixa de ser juntado automaticamente.
  const participantes = useMemo(
    () => participantesWizard(equipas, ambito === "PROPRIA", escalaoNome),
    [equipas, ambito, escalaoNome],
  );
  const temPropria = participantes.some((p) => p.automatica);
  const algumaMarcada = equipas.some((e) => e.propria);

  // Deslocamento de numeração da lista de equipas externas (1 quando há própria).
  const offsetNumeracao = temPropria ? 1 : 0;

  // Chave que identifica a configuração que gerou o quadro atual. Se mudar, o
  // quadro é regenerado ao (re)entrar no passo 3 — preservando edições manuais
  // quando nada relevante mudou.
  const chaveConfig = useMemo(
    () => JSON.stringify({ formato, duasMaos: eLiga && duasMaos, participantes }),
    [formato, duasMaos, eLiga, participantes],
  );

  // ── Mutações de equipas ────────────────────────────────────────────────────
  function adicionarEquipa() {
    const nomeTrim = novaEquipa.trim();
    if (nomeTrim === "") return;
    if (temPropria && nomeTrim.toLocaleLowerCase("pt") === escalaoNome.toLocaleLowerCase("pt")) {
      toast.error("A equipa do clube já é participante (própria).");
      return;
    }
    if (equipas.some((e) => e.nome.toLocaleLowerCase("pt") === nomeTrim.toLocaleLowerCase("pt"))) {
      toast.error("Essa equipa já está na lista.");
      return;
    }
    setEquipas((atual) => [...atual, { nome: nomeTrim, propria: false }]);
    setNovaEquipa("");
  }

  function alternarPropria(indice: number) {
    setEquipas((atual) =>
      atual.map((e, i) => (i === indice ? { ...e, propria: !e.propria } : e)),
    );
  }

  function removerEquipa(indice: number) {
    setEquipas((atual) => atual.filter((_, i) => i !== indice));
  }

  function moverEquipa(indice: number, direcao: -1 | 1) {
    setEquipas((atual) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= atual.length) return atual;
      const copia = [...atual];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  // ── Geração do quadro ──────────────────────────────────────────────────────
  function gerarQuadro(): JogoCalendario[] {
    const comPosicao: EquipaQuadro[] = participantes.map((e, i) => ({
      nome: e.nome,
      posicao: i + 1,
    }));
    return deGerados(eLiga ? gerarLiga(comPosicao, duasMaos) : gerarBracket(comPosicao));
  }

  function gerarDeNovo() {
    setJogos(gerarQuadro());
    setChaveGerada(chaveConfig);
    setModo("GERADO");
    setEditado(false);
  }

  function comecarVazio() {
    setJogos([]);
    setModo("MANUAL");
    setEditado(false);
  }

  function escolherModo(novo: ModoCalendario) {
    if (novo === modo) return;
    if (novo === "MANUAL") {
      if (jogos.length > 0) setConfirmar("MANUAL");
      else comecarVazio();
    } else if (editado) {
      setConfirmar("GERAR");
    } else {
      gerarDeNovo();
    }
  }

  // ── Edição do calendário (lib/calendario-wizard — funções puras) ───────────
  function mutar(fn: (atual: JogoCalendario[]) => JogoCalendario[]) {
    setJogos(fn);
    setEditado(true);
  }

  function mover(jogo: JogoCalendario, direcao: -1 | 1) {
    const daJornada = jogos.filter((j) => j.ronda === jogo.ronda);
    const destino = daJornada.findIndex((j) => j.chave === jogo.chave) + direcao;
    if (destino < 0 || destino >= daJornada.length) return;
    mutar((atual) => moverNaJornada(atual, jogo.chave, direcao));
    setFoco({ chave: jogo.chave, direcao });
    setAnuncio(
      `Confronto na posição ${destino + 1} de ${daJornada.length} da ${rotuloRonda.toLowerCase()} ${jogo.ronda}.`,
    );
  }

  // O foco fica no mesmo botão da linha movida (ou no oposto, se esse ficou no limite).
  useEffect(() => {
    if (!foco) return;
    const seletor = (d: number) => `[data-mover="${foco.chave}:${d}"]`;
    const alvo = document.querySelector<HTMLButtonElement>(seletor(foco.direcao));
    const oposto = document.querySelector<HTMLButtonElement>(seletor(-foco.direcao));
    (alvo && !alvo.disabled ? alvo : oposto)?.focus();
    setFoco(null);
  }, [foco, jogos]);

  // ── Navegação com validação por passo ──────────────────────────────────────
  function validarBase(): boolean {
    const novos: Record<string, string> = {};
    if (nome.trim() === "") novos.nome = "O nome é obrigatório.";
    if (!escalaoId) novos.escalaoId = "Escolhe o escalão.";
    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  function avancar() {
    if (chaveAtual === "base") {
      if (!validarBase()) return;
    }
    if (chaveAtual === "equipas") {
      if (participantes.length < 2) {
        toast.error("Adiciona pelo menos 2 equipas para gerar o quadro.");
        return;
      }
      // Ao entrar no passo do quadro, (re)gera se a configuração mudou — nunca por
      // cima de edições manuais nem no modo manual (aí aparece «Gerar de novo»).
      if (modo === "GERADO" && !editado && chaveConfig !== chaveGerada) {
        setJogos(gerarQuadro());
        setChaveGerada(chaveConfig);
      }
    }
    setPassoIndex((i) => Math.min(i + 1, PASSOS.length - 1));
  }

  function recuar() {
    setPassoIndex((i) => Math.max(i - 1, 0));
  }

  // ── Submissão ──────────────────────────────────────────────────────────────
  function submeter() {
    if (!validarBase()) {
      setPassoIndex(0);
      return;
    }
    if (participantes.length < 2) {
      setPassoIndex(1);
      toast.error("Adiciona pelo menos 2 equipas.");
      return;
    }
    if (validacao.erros.size > 0) {
      setPassoIndex(2);
      toast.error("Corrige os confrontos assinalados antes de criar a competição.");
      return;
    }

    const dados = {
      nome: nome.trim(),
      ambito,
      tipo,
      formato,
      // P1.6 (§23.3): pontuação configurável (empate/derrota fixos nos valores comuns).
      pontosVitoria,
      pontosEmpate: 1,
      pontosDerrota: 0,
      golosWalkover: 3,
      ...(formatoJogo !== FORMATO_JOGO_AUTO
        ? { formatoJogo: formatoJogo as FormatoJogo }
        : {}),
      escalaoId,
      equipas: participantes.map((p, i) => ({
        nome: p.nome,
        posicao: i + 1,
        tipo: p.ehPropria ? ("PROPRIO" as const) : ("EXTERNO" as const),
        ...(p.ehPropria ? { escalaoVinculadoId: escalaoId } : {}),
        ...(p.ehPropria && !p.automatica ? { propria: true } : {}),
      })),
      // Ordenado por jornada e, dentro de cada uma, pela ordem do ecrã (R6).
      jogos: paraPayload(jogos),
      duasMaos: eLiga ? duasMaos : false,
    };

    startTransition(async () => {
      const res = await criarCompeticaoCompleta(dados);
      if (res.sucesso) {
        toast.success("Competição criada");
        router.push(`/jogos/competicoes/${res.dados.id}`);
        router.refresh();
      } else {
        toast.error(res.erro);
        if (res.camposInvalidos) setErros(res.camposInvalidos);
      }
    });
  }

  const rotuloRonda = eLiga ? "Jornada" : "Ronda";
  const jogosPorRonda = useMemo(() => agruparPorRonda(jogos), [jogos]);
  const validacao = useMemo(
    () =>
      validarCalendario(
        jogos,
        participantes.map((p) => p.nome),
      ),
    [jogos, participantes],
  );
  const maxRonda = rondaMaxima(jogos);
  const equipasMudaram = modo === "GERADO" && editado && chaveConfig !== chaveGerada;

  // Função de render (não componente): os Selects e os inputs nativos de data/hora
  // não podem viver num componente aninhado — remontavam a cada render (§23.7).
  function renderConfronto(jogo: JogoCalendario, posicao: number, total: number) {
    const nome = `${jogo.equipaCasa || "…"} vs ${jogo.equipaFora || "…"}`;
    const erro = validacao.erros.get(jogo.chave);
    return (
      <li
        key={jogo.chave}
        className={cn(
          "space-y-2 rounded-md border bg-white p-3",
          erro ? "border-vermelho-600" : "border-cinza-200",
        )}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Select
            value={jogo.equipaCasa}
            onValueChange={(v) => mutar((a) => atualizarConfronto(a, jogo.chave, { equipaCasa: v }))}
          >
            <SelectTrigger aria-label={`Equipa da casa de ${nome}`} aria-invalid={Boolean(erro)}>
              <SelectValue placeholder="Casa" />
            </SelectTrigger>
            <SelectContent>
              {participantes.map((p) => (
                <SelectItem key={p.nome} value={p.nome}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => mutar((a) => trocar(a, jogo.chave))}
            aria-label="Trocar casa e visitante"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <Select
            value={jogo.equipaFora}
            onValueChange={(v) => mutar((a) => atualizarConfronto(a, jogo.chave, { equipaFora: v }))}
          >
            <SelectTrigger aria-label={`Equipa visitante de ${nome}`} aria-invalid={Boolean(erro)}>
              <SelectValue placeholder="Visitante" />
            </SelectTrigger>
            <SelectContent>
              {participantes.map((p) => (
                <SelectItem key={p.nome} value={p.nome}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(jogo.ronda)}
            onValueChange={(v) => mutar((a) => mudarRonda(a, jogo.chave, Number(v)))}
          >
            <SelectTrigger className="w-36" aria-label={`${rotuloRonda} de ${nome}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opcoesRonda(maxRonda, jogo.ronda).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {rotuloRonda} {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={jogo.data}
            onChange={(e) =>
              mutar((a) =>
                atualizarConfronto(a, jogo.chave, {
                  data: e.target.value,
                  ...(e.target.value === "" ? { hora: "" } : {}),
                }),
              )
            }
            className="h-11 w-40"
            aria-label={`Data de ${nome}`}
          />
          <Input
            type="time"
            value={jogo.hora}
            onChange={(e) => mutar((a) => atualizarConfronto(a, jogo.chave, { hora: e.target.value }))}
            disabled={jogo.data === ""}
            className="h-11 w-28"
            aria-label={`Hora de ${nome}`}
          />
          <div className="ml-auto flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-mover={`${jogo.chave}:-1`}
              onClick={() => mover(jogo, -1)}
              disabled={posicao === 0}
              aria-label={`Subir ${nome}`}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-mover={`${jogo.chave}:1`}
              onClick={() => mover(jogo, 1)}
              disabled={posicao === total - 1}
              aria-label={`Descer ${nome}`}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => mutar((a) => removerConfronto(a, jogo.chave))}
              aria-label="Remover confronto"
            >
              <X className="h-4 w-4 text-vermelho-600" />
            </Button>
          </div>
        </div>
        {erro && <p className="text-legenda text-vermelho-600">{erro}</p>}
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1>Nova competição</h1>
        <p className="mt-1 text-corpo-sec text-cinza-600">
          Define a prova, adiciona as equipas e gera o calendário.
        </p>
      </div>

      <PassosIndicador atual={passoIndex} />

      {/* ── Passo 1 — Informação base ──────────────────────────────────────── */}
      {chaveAtual === "base" && (
        <CartaoPasso>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cinza-900">
              <Trophy className="h-5 w-5 text-primary" />
              <h2 className="text-titulo-seccao">Informação base</h2>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={100}
                placeholder="ex: Liga distrital"
              />
              {erros.nome && <p className="text-legenda text-vermelho-600">{erros.nome}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Âmbito</Label>
              <div
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                role="radiogroup"
                aria-label="Âmbito da competição"
              >
                {AMBITOS.map((a) => {
                  const ativo = ambito === a;
                  const Icone = a === "EXTERNA" ? Globe : Building2;
                  return (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => setAmbito(a)}
                      className={cn(
                        "flex min-h-[44px] flex-col gap-1 rounded-md border p-3 text-left transition-colors",
                        ativo
                          ? "border-primary bg-primary/5"
                          : "border-cinza-200 hover:bg-cinza-50",
                      )}
                    >
                      <span className="flex items-center gap-2 text-corpo font-medium text-cinza-900">
                        <Icone className="h-4 w-4 text-primary" />
                        {a === "EXTERNA"
                          ? "Externa (seguimento)"
                          : "Própria (gerida pelo clube)"}
                      </span>
                      <span className="text-legenda text-cinza-500">{DESCRICAO_AMBITO[a]}</span>
                    </button>
                  );
                })}
              </div>
              {ambito === "EXTERNA" && (
                <p className="text-legenda text-cinza-500">
                  Podes adicionar equipas agora ou à medida que os resultados saem.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Formato</Label>
                <Select value={formato} onValueChange={(v) => setFormato(v as FormatoCompeticao)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATOS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {LABEL_FORMATO_COMPETICAO[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as TipoJogo)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OFICIAL">{LABEL_TIPO_JOGO.OFICIAL}</SelectItem>
                    <SelectItem value="AMIGAVEL">{LABEL_TIPO_JOGO.AMIGAVEL}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Escalão *</Label>
                <Select value={escalaoId} onValueChange={setEscalaoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {escaloes.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {erros.escalaoId && (
                  <p className="text-legenda text-vermelho-600">{erros.escalaoId}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Formato de jogo</Label>
                <Select value={formatoJogo} onValueChange={setFormatoJogo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FORMATO_JOGO_AUTO}>Automático (pelo escalão)</SelectItem>
                    {FORMATOS_JOGO.map((f) => (
                      <SelectItem key={f} value={f}>
                        {LABEL_FORMATO_JOGO[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Pontos por vitória</Label>
              <div className="flex gap-2" role="radiogroup" aria-label="Pontos por vitória">
                {PONTOS_VITORIA_OPCOES.map((p) => {
                  const ativo = pontosVitoria === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => setPontosVitoria(p)}
                      className={cn(
                        "min-h-[44px] flex-1 rounded-md border px-3 py-2 text-corpo font-medium transition-colors",
                        ativo
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-cinza-200 text-cinza-900 hover:bg-cinza-50",
                      )}
                    >
                      {p} pts
                    </button>
                  );
                })}
              </div>
              <p className="text-legenda text-cinza-500">Empate 1 ponto · derrota 0 pontos.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Época</Label>
              <Select value={epocaAtiva?.id ?? ""} disabled>
                <SelectTrigger>
                  <SelectValue placeholder="Sem época ativa" />
                </SelectTrigger>
                <SelectContent>
                  {epocas.map((ep) => (
                    <SelectItem key={ep.id} value={ep.id}>
                      {ep.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-legenda text-cinza-500">
                A competição é criada na época ativa
                {epocaAtiva ? ` (${epocaAtiva.nome})` : ""}.
              </p>
            </div>
          </div>
        </CartaoPasso>
      )}

      {/* ── Passo 2 — Equipas ──────────────────────────────────────────────── */}
      {chaveAtual === "equipas" && (
        <CartaoPasso>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cinza-900">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-titulo-seccao">Equipas participantes</h2>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nova-equipa">Adicionar equipa</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="nova-equipa"
                  value={novaEquipa}
                  onChange={(e) => setNovaEquipa(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      adicionarEquipa();
                    }
                  }}
                  maxLength={100}
                  placeholder="Nome da equipa"
                />
                <Button
                  type="button"
                  onClick={adicionarEquipa}
                  disabled={novaEquipa.trim() === ""}
                  className="min-h-[44px] shrink-0 gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              </div>
            </div>

            {temPropria && (
              <div className="flex min-h-[44px] items-center gap-3 rounded-md border border-primary bg-primary/5 px-3 py-2">
                <span className="w-6 shrink-0 text-center text-legenda font-semibold text-primary tabular-nums">
                  1
                </span>
                <span className="min-w-0 flex-1 truncate text-corpo font-medium text-cinza-900">
                  {escalaoNome}
                </span>
                <Badge className="shrink-0">Própria</Badge>
              </div>
            )}

            {equipas.length === 0 ? (
              <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
                {temPropria
                  ? "Adiciona as equipas convidadas (mínimo 1 além da tua)."
                  : "Ainda sem equipas. Adiciona pelo menos 2 para gerar o quadro."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {equipas.map((e, i) => (
                  <li
                    key={`${e.nome}-${i}`}
                    className="flex min-h-[44px] items-center gap-3 rounded-md border border-cinza-200 px-3 py-2"
                  >
                    <span className="w-6 shrink-0 text-center text-legenda font-semibold text-cinza-400 tabular-nums">
                      {offsetNumeracao + i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-corpo text-cinza-900">
                      {e.nome}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-pressed={e.propria}
                        onClick={() => alternarPropria(i)}
                        title="Equipa própria (subequipa do escalão)"
                        className={cn(
                          "min-h-[44px] shrink-0 rounded-md border px-2.5 text-legenda font-medium transition-colors",
                          e.propria
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-cinza-200 text-cinza-600 hover:bg-cinza-50",
                        )}
                      >
                        {e.propria ? "Própria ✓" : "Equipa própria"}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => moverEquipa(i, -1)}
                        disabled={i === 0}
                        aria-label={`Subir ${e.nome}`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => moverEquipa(i, 1)}
                        disabled={i === equipas.length - 1}
                        aria-label={`Descer ${e.nome}`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removerEquipa(i)}
                        aria-label={`Remover ${e.nome}`}
                      >
                        <X className="h-4 w-4 text-vermelho-600" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-legenda text-cinza-500">
              A ordem define a posição (usada nos emparelhamentos de torneio/taça).
              {temPropria
                ? " A tua equipa é o primeiro participante (própria)."
                : ""}
              {" "}Marca «Equipa própria» nas subequipas do clube (ex.: {escalaoNome || "Benjamins"} A
              e B).
              {algumaMarcada && ambito === "PROPRIA"
                ? ` Com equipas próprias marcadas, «${escalaoNome}» não é juntada automaticamente.`
                : ""}
            </p>

            {eLiga && (
              <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-md border border-cinza-200 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-corpo text-cinza-900">Duas mãos</span>
                  <span className="block text-legenda text-cinza-500">
                    Cada confronto joga-se em casa e fora (ida e volta).
                  </span>
                </span>
                <Switch checked={duasMaos} onCheckedChange={setDuasMaos} />
              </label>
            )}
          </div>
        </CartaoPasso>
      )}

      {/* ── Passo 3 — Quadro e agendamento ─────────────────────────────────── */}
      {chaveAtual === "quadro" && (
        <CartaoPasso>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cinza-900">
              <CalendarClock className="h-5 w-5 text-primary" />
              <h2 className="text-titulo-seccao">Quadro e agendamento</h2>
            </div>

            <div
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Como criar o calendário"
            >
              {(["GERADO", "MANUAL"] as const).map((m) => {
                const ativo = modo === m;
                const Icone = m === "GERADO" ? Sparkles : PencilLine;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => escolherModo(m)}
                    className={cn(
                      "flex min-h-[44px] flex-col gap-1 rounded-md border p-3 text-left transition-colors",
                      ativo ? "border-primary bg-primary/5" : "border-cinza-200 hover:bg-cinza-50",
                    )}
                  >
                    <span className="flex items-center gap-2 text-corpo font-medium text-cinza-900">
                      <Icone className="h-4 w-4 text-primary" />
                      {m === "GERADO" ? "Gerar automaticamente" : "Introduzir calendário manualmente"}
                    </span>
                    <span className="text-legenda text-cinza-500">
                      {m === "MANUAL"
                        ? "Começa vazio. Ideal para copiar o calendário oficial (ex.: FPF)."
                        : eLiga
                          ? "Todos-contra-todos pelo número de equipas. Podes ajustar tudo a seguir."
                          : "Emparelhamentos da 1.ª ronda. Podes ajustar tudo a seguir."}
                    </span>
                  </button>
                );
              })}
            </div>

            {equipasMudaram && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ambar-500 bg-ambar-500/10 px-3 py-2">
                <p className="flex items-center gap-2 text-corpo-sec text-ambar-600">
                  <TriangleAlert className="h-4 w-4 flex-shrink-0" />
                  As equipas mudaram desde que criaste este calendário.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmar("GERAR")}>
                  Gerar de novo
                </Button>
              </div>
            )}

            {jogos.length === 0 ? (
              <div className="space-y-3 rounded-md border border-dashed border-cinza-300 p-6 text-center">
                <p className="text-corpo-sec text-cinza-500">
                  Ainda sem confrontos. Adiciona a 1.ª {rotuloRonda.toLowerCase()} ou cria a
                  competição e acrescenta-os depois no separador Confrontos.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => mutar(adicionarRonda)}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar {rotuloRonda.toLowerCase()}
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <p className="text-legenda text-cinza-500">
                  {jogos.length} confronto(s) em {jogosPorRonda.length}{" "}
                  {rotuloRonda.toLowerCase()}(s). Define a data/hora ou deixa por definir.
                </p>

                {jogosPorRonda.map(([ronda, lista]) => (
                  <div key={ronda} className="space-y-2">
                    <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                      {eLiga ? `Jornada ${ronda}` : `Ronda ${ronda} · Eliminatória`}
                    </p>
                    {validacao.avisos
                      .filter((a) => a.ronda === ronda)
                      .map((a) => (
                        <p
                          key={a.equipa}
                          className="flex items-center gap-1 text-legenda text-ambar-600"
                        >
                          <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0" />
                          Atenção: {a.equipa} joga {vezesNaJornada(jogos, ronda, a.equipa)} vezes na{" "}
                          {rotuloRonda.toLowerCase()} {ronda}.
                        </p>
                      ))}
                    <ul className="space-y-2">
                      {lista.map((jogo, i) => renderConfronto(jogo, i, lista.length))}
                    </ul>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => mutar((a) => adicionarConfronto(a, ronda))}
                      className="gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar confronto
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => mutar(adicionarRonda)}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar {rotuloRonda.toLowerCase()}
                </Button>
              </div>
            )}

            <p className="sr-only" aria-live="polite">
              {anuncio}
            </p>

            <AlertDialog open={confirmar !== null} onOpenChange={(v) => !v && setConfirmar(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {confirmar === "MANUAL"
                      ? "Começar com o calendário vazio?"
                      : "Gerar de novo o calendário?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {confirmar === "MANUAL"
                      ? `Os ${jogos.length} confrontos atuais são descartados.`
                      : "As alterações que fizeste perdem-se."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      if (confirmar === "MANUAL") comecarVazio();
                      else gerarDeNovo();
                      setConfirmar(null);
                    }}
                  >
                    {confirmar === "MANUAL" ? "Começar vazio" : "Gerar de novo"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CartaoPasso>
      )}

      {/* ── Rodapé de navegação ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-t border-cinza-200 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={recuar}
          disabled={passoIndex === 0 || pending}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        {chaveAtual === "quadro" ? (
          <Button
            type="button"
            onClick={submeter}
            disabled={pending}
            className="gap-1.5"
          >
            {pending ? (
              "A criar…"
            ) : (
              <>
                <Check className="h-4 w-4" />
                Criar competição
              </>
            )}
          </Button>
        ) : (
          <Button type="button" onClick={avancar} disabled={pending} className="gap-1.5">
            Próximo
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
