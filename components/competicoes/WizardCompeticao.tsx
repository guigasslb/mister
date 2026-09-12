"use client";

import { useMemo, useState, useTransition } from "react";
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
  X,
  Globe,
  Building2,
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
import { cn } from "@/lib/utils";
import {
  LABEL_FORMATO_COMPETICAO,
  LABEL_AMBITO_COMPETICAO,
} from "@/lib/schemas/competicao";
import { LABEL_TIPO_JOGO } from "@/lib/schemas/jogo";
import { gerarLiga, gerarBracket, type EquipaQuadro } from "@/lib/quadro-cliente";
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

/** Jogo do quadro com data/hora em campos de texto editáveis (inputs nativos). */
type JogoEditavel = {
  equipaCasa: string;
  equipaFora: string;
  ronda: number;
  data: string; // "YYYY-MM-DD" | ""
  hora: string; // "HH:MM" | ""
};

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
  const [equipas, setEquipas] = useState<EquipaQuadro[]>([]);
  const [novaEquipa, setNovaEquipa] = useState("");
  const [duasMaos, setDuasMaos] = useState(false);

  // ── Passo 3 — quadro ───────────────────────────────────────────────────────
  const [jogos, setJogos] = useState<JogoEditavel[]>([]);
  const [chaveGerada, setChaveGerada] = useState<string>("");

  const eLiga = formato === "LIGA";

  // Nome do escalão selecionado (equipa própria em competições PROPRIA).
  const escalaoNome = useMemo(
    () => escaloes.find((e) => e.id === escalaoId)?.nome.trim() ?? "",
    [escaloes, escalaoId],
  );

  // P1.6 (§23.4 Fluxo D): em competições PRÓPRIAS a equipa do escalão é o primeiro
  // participante (marcada PROPRIO, não removível); as restantes são EXTERNO. Numa
  // EXTERNA todos os participantes são as equipas introduzidas pelo utilizador.
  const temPropria = ambito === "PROPRIA" && escalaoNome !== "";
  const participantes = useMemo(() => {
    const externas = equipas.map((e) => ({ nome: e.nome, ehPropria: false }));
    if (!temPropria) return externas;
    const semDup = externas.filter(
      (e) => e.nome.toLocaleLowerCase("pt") !== escalaoNome.toLocaleLowerCase("pt"),
    );
    return [{ nome: escalaoNome, ehPropria: true }, ...semDup];
  }, [equipas, temPropria, escalaoNome]);

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
    setEquipas((atual) => [...atual, { nome: nomeTrim }]);
    setNovaEquipa("");
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
  function gerarQuadro(): JogoEditavel[] {
    const comPosicao: EquipaQuadro[] = participantes.map((e, i) => ({
      nome: e.nome,
      posicao: i + 1,
    }));
    const gerados = eLiga
      ? gerarLiga(comPosicao, duasMaos)
      : gerarBracket(comPosicao);
    return gerados.map((j) => ({
      equipaCasa: j.equipaCasa,
      equipaFora: j.equipaFora,
      ronda: j.ronda,
      data: "",
      hora: "",
    }));
  }

  function atualizarJogo(indice: number, patch: Partial<Pick<JogoEditavel, "data" | "hora">>) {
    setJogos((atual) => atual.map((j, i) => (i === indice ? { ...j, ...patch } : j)));
  }

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
      // Ao entrar no passo do quadro, (re)gera se a configuração mudou.
      if (chaveConfig !== chaveGerada) {
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
  function combinarDataHora(data: string, hora: string): Date | null {
    if (data === "") return null;
    const d = new Date(`${data}T${hora || "00:00"}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

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
      })),
      jogos: jogos.map((j) => ({
        equipaCasa: j.equipaCasa,
        equipaFora: j.equipaFora,
        ronda: j.ronda,
        dataHora: combinarDataHora(j.data, j.hora),
      })),
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

  // Jogos agrupados por ronda para a tabela do passo 3.
  const jogosPorRonda = useMemo(() => {
    const mapa = new Map<number, { indice: number; jogo: JogoEditavel }[]>();
    jogos.forEach((jogo, indice) => {
      const lista = mapa.get(jogo.ronda) ?? [];
      lista.push({ indice, jogo });
      mapa.set(jogo.ronda, lista);
    });
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
  }, [jogos]);

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

            {jogos.length === 0 ? (
              <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
                Não foi possível gerar jogos. Volta atrás e confirma as equipas.
              </p>
            ) : (
              <div className="space-y-5">
                <p className="text-legenda text-cinza-500">
                  {eLiga
                    ? `${jogos.length} jogo(s) gerados${duasMaos ? " (ida e volta)" : ""}. Define a data/hora ou deixa por definir.`
                    : `${jogos.length} confronto(s) da primeira ronda. As rondas seguintes abrem com os resultados.`}
                </p>

                {jogosPorRonda.map(([ronda, lista]) => (
                  <div key={ronda} className="space-y-2">
                    <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                      {eLiga ? `Ronda ${ronda}` : `Ronda ${ronda} · Eliminatória`}
                    </p>
                    <div className="overflow-hidden rounded-md border border-cinza-200">
                      <table className="w-full text-corpo-sec">
                        <thead className="bg-cinza-50 text-legenda uppercase tracking-wide text-cinza-500">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Casa</th>
                            <th className="px-3 py-2 text-left font-medium">Visitante</th>
                            <th className="px-3 py-2 text-left font-medium">Data</th>
                            <th className="px-3 py-2 text-left font-medium">Hora</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lista.map(({ indice, jogo }) => (
                            <tr
                              key={indice}
                              className="border-t border-cinza-100 align-middle"
                            >
                              <td className="px-3 py-2 font-medium text-cinza-900">
                                {jogo.equipaCasa}
                              </td>
                              <td className="px-3 py-2 font-medium text-cinza-900">
                                {jogo.equipaFora}
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="date"
                                  value={jogo.data}
                                  onChange={(e) => atualizarJogo(indice, { data: e.target.value })}
                                  className="h-10 w-40"
                                  aria-label={`Data de ${jogo.equipaCasa} vs ${jogo.equipaFora}`}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="time"
                                  value={jogo.hora}
                                  onChange={(e) => atualizarJogo(indice, { hora: e.target.value })}
                                  disabled={jogo.data === ""}
                                  className="h-10 w-28"
                                  aria-label={`Hora de ${jogo.equipaCasa} vs ${jogo.equipaFora}`}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
            disabled={pending || jogos.length === 0}
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
