"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Swords,
  Users,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  LABEL_TIPO_MANO_MANO,
  LABEL_AMBITO_MANO_MANO,
  LABEL_FORMATO_TORNEIO_MANO_MANO,
  LABEL_FORMATO_DUELO,
} from "@/lib/schemas/mano-a-mano";
import { gerarLiga } from "@/lib/quadro-cliente";
import {
  criarCompeticaoManoMano,
  obterCompeticaoManoMano,
  adicionarParticipante,
  removerParticipante,
  criarClubeExterno,
} from "@/lib/actions/mano-a-mano";
import type {
  TipoManoMano,
  AmbitoManoMano,
  FormatoTorneioManoMano,
  FormatoDuelo,
} from "@prisma/client";

type EscalaoBasico = { id: string; nome: string };
type EpocaBasica = { id: string; nome: string; ativa: boolean };
type AtletaBasico = { id: string; nome: string; escalaoIds: string[] };
type ClubeExternoBasico = { id: string; nome: string };

/** Participante externo em edição no wizard (ainda não persistido). */
type ExternoDraft = {
  chave: string;
  nome: string;
  clubeExternoId: string | null;
  novoClubeNome: string | null;
};

const SEM_ESCALAO = "__sem__";
const SEM_CLUBE = "__sem_clube__";
const NOVO_CLUBE = "__novo__";

const TIPOS: TipoManoMano[] = ["LIGA_ANUAL", "TORNEIO"];
const AMBITOS: AmbitoManoMano[] = ["INTRA_CLUBE", "INTER_CLUBES"];
const FORMATOS_TORNEIO: FormatoTorneioManoMano[] = ["ELIMINATORIO", "ROUND_ROBIN"];
const FORMATOS_DUELO: FormatoDuelo[] = [
  "PRIMEIRO_A_DOIS",
  "MELHOR_DE_2_JOGOS",
  "TEMPO_LIMITE",
];

const PASSOS = [
  { chave: "base", titulo: "Dados base" },
  { chave: "participantes", titulo: "Participantes" },
  { chave: "config", titulo: "Configuração" },
] as const;

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

export function WizardManoMano({
  escaloes,
  epocas,
  atletas,
  clubesExternos,
}: {
  escaloes: EscalaoBasico[];
  epocas: EpocaBasica[];
  atletas: AtletaBasico[];
  clubesExternos: ClubeExternoBasico[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [passoIndex, setPassoIndex] = useState(0);
  const chaveAtual = PASSOS[passoIndex].chave;

  const epocaAtiva = useMemo(() => epocas.find((e) => e.ativa) ?? epocas[0], [epocas]);

  // ── Passo 1 — dados base ────────────────────────────────────────────────────
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoManoMano>("LIGA_ANUAL");
  const [ambito, setAmbito] = useState<AmbitoManoMano>("INTRA_CLUBE");
  const [formatoTorneio, setFormatoTorneio] =
    useState<FormatoTorneioManoMano>("ROUND_ROBIN");
  const [formatoDuelo, setFormatoDuelo] = useState<FormatoDuelo>("PRIMEIRO_A_DOIS");
  const [golosParaVencer, setGolosParaVencer] = useState(2);
  const [duracaoLimiteMin, setDuracaoLimiteMin] = useState(10);
  const [escalaoId, setEscalaoId] = useState<string>(escaloes[0]?.id ?? SEM_ESCALAO);
  const [erros, setErros] = useState<Record<string, string>>({});

  // ── Passo 2 — participantes ─────────────────────────────────────────────────
  const [atletasSel, setAtletasSel] = useState<Set<string>>(new Set());
  const [externos, setExternos] = useState<ExternoDraft[]>([]);
  const [novoExternoNome, setNovoExternoNome] = useState("");
  const [novoExternoClube, setNovoExternoClube] = useState<string>(SEM_CLUBE);
  const [novoClubeNome, setNovoClubeNome] = useState("");

  // ── Passo 3 — configuração ──────────────────────────────────────────────────
  const [integraTreinos, setIntegraTreinos] = useState(true);
  const [duasMaos, setDuasMaos] = useState(false);

  const eLiga = tipo === "LIGA_ANUAL";
  const eBracket = tipo === "TORNEIO" && formatoTorneio === "ELIMINATORIO";
  const eRoundRobin = tipo === "TORNEIO" && formatoTorneio === "ROUND_ROBIN";
  const usaDuasMaos = eLiga || eRoundRobin;

  // Atletas elegíveis do escalão selecionado (intra-clube).
  const poolAtletas = useMemo(() => {
    if (escalaoId === SEM_ESCALAO) return [];
    return atletas.filter((a) => a.escalaoIds.includes(escalaoId));
  }, [atletas, escalaoId]);

  // Ao mudar de escalão (intra-clube), pré-seleciona todos os atletas do pool.
  useEffect(() => {
    if (ambito !== "INTRA_CLUBE") return;
    setAtletasSel(new Set(poolAtletas.map((a) => a.id)));
  }, [ambito, poolAtletas]);

  const numParticipantes =
    ambito === "INTRA_CLUBE" ? atletasSel.size : externos.length;

  // Pré-visualização client-side da distribuição (round-robin / liga).
  const previsao = useMemo(() => {
    if (numParticipantes < 2) return null;
    if (eBracket) {
      const rondas = Math.ceil(Math.log2(numParticipantes));
      return { totalDuelos: numParticipantes - 1, jornadas: rondas };
    }
    const equipas = Array.from({ length: numParticipantes }, (_, i) => ({
      nome: `p${i}`,
      posicao: i + 1,
    }));
    const jogos = gerarLiga(equipas, usaDuasMaos);
    const jornadas = new Set(jogos.map((j) => j.ronda)).size;
    return { totalDuelos: jogos.length, jornadas };
  }, [numParticipantes, eBracket, usaDuasMaos]);

  // ── Mutações ────────────────────────────────────────────────────────────────
  function alternarAtleta(id: string) {
    setAtletasSel((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function adicionarExterno() {
    const nomeTrim = novoExternoNome.trim();
    if (nomeTrim === "") return;
    const usaNovoClube = novoExternoClube === NOVO_CLUBE;
    if (usaNovoClube && novoClubeNome.trim() === "") {
      toast.error("Indica o nome do novo clube.");
      return;
    }
    setExternos((atual) => [
      ...atual,
      {
        chave: `${Date.now()}-${Math.random()}`,
        nome: nomeTrim,
        clubeExternoId:
          novoExternoClube === SEM_CLUBE || usaNovoClube ? null : novoExternoClube,
        novoClubeNome: usaNovoClube ? novoClubeNome.trim() : null,
      },
    ]);
    setNovoExternoNome("");
    setNovoClubeNome("");
    setNovoExternoClube(SEM_CLUBE);
  }

  function removerExterno(chave: string) {
    setExternos((atual) => atual.filter((e) => e.chave !== chave));
  }

  // ── Navegação ───────────────────────────────────────────────────────────────
  function validarBase(): boolean {
    const novos: Record<string, string> = {};
    if (nome.trim() === "") novos.nome = "O nome é obrigatório.";
    if (ambito === "INTRA_CLUBE" && escalaoId === SEM_ESCALAO)
      novos.escalaoId = "Escolhe o escalão dos atletas.";
    if (golosParaVencer < 1) novos.golosParaVencer = "Mínimo 1 golo.";
    if (formatoDuelo === "TEMPO_LIMITE" && duracaoLimiteMin < 1)
      novos.duracaoLimiteMin = "Indica a duração (minutos).";
    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  function avancar() {
    if (chaveAtual === "base" && !validarBase()) return;
    if (chaveAtual === "participantes" && numParticipantes < 2) {
      toast.error("Adiciona pelo menos 2 participantes.");
      return;
    }
    setPassoIndex((i) => Math.min(i + 1, PASSOS.length - 1));
  }

  function recuar() {
    setPassoIndex((i) => Math.max(i - 1, 0));
  }

  // ── Submissão ─────────────────────────────────────────────────────────────
  function submeter() {
    if (!validarBase()) {
      setPassoIndex(0);
      return;
    }
    if (numParticipantes < 2) {
      setPassoIndex(1);
      toast.error("Adiciona pelo menos 2 participantes.");
      return;
    }

    startTransition(async () => {
      const dados = {
        nome: nome.trim(),
        tipo,
        ambito,
        ...(tipo === "TORNEIO" ? { formatoTorneio } : {}),
        formatoDuelo,
        golosParaVencer,
        ...(formatoDuelo === "TEMPO_LIMITE" ? { duracaoLimiteMin } : {}),
        integraTreinos: eLiga ? integraTreinos : false,
        ...(escalaoId !== SEM_ESCALAO ? { escalaoId } : {}),
      };

      const res = await criarCompeticaoManoMano(dados);
      if (!res.sucesso) {
        toast.error(res.erro);
        if (res.camposInvalidos) setErros(res.camposInvalidos);
        return;
      }
      const id = res.dados.id;

      // Reconcilia participantes com o que foi escolhido no wizard. A criação já
      // inscreve automaticamente os atletas ativos numa liga intra-clube com
      // escalão — por isso comparamos e ajustamos (adiciona/remove) o necessário.
      const det = await obterCompeticaoManoMano(id);
      const jaPorAtleta = new Map<string, string>();
      if (det.sucesso) {
        for (const p of det.dados.participantes) {
          if (p.atletaId) jaPorAtleta.set(p.atletaId, p.id);
        }
      }

      if (ambito === "INTRA_CLUBE") {
        for (const atletaId of atletasSel) {
          if (!jaPorAtleta.has(atletaId)) {
            await adicionarParticipante(id, { tipo: "ATLETA", atletaId });
          }
        }
        for (const [atletaId, participanteId] of jaPorAtleta) {
          if (!atletasSel.has(atletaId)) {
            await removerParticipante(participanteId);
          }
        }
      } else {
        for (const ext of externos) {
          let clubeExternoId = ext.clubeExternoId ?? undefined;
          if (ext.novoClubeNome) {
            const rc = await criarClubeExterno({ nome: ext.novoClubeNome });
            if (rc.sucesso) clubeExternoId = rc.dados.id;
          }
          await adicionarParticipante(id, {
            tipo: "EXTERNO",
            atletaExternoNome: ext.nome,
            ...(clubeExternoId ? { clubeExternoId } : {}),
          });
        }
      }

      toast.success("Competição criada");
      router.push(`/mano-a-mano/${id}`);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1>Nova competição Mano-a-Mano</h1>
        <p className="mt-1 text-corpo-sec text-cinza-600">
          Define a prova, escolhe os participantes e configura os duelos.
        </p>
      </div>

      <PassosIndicador atual={passoIndex} />

      {/* ── Passo 1 — Dados base ─────────────────────────────────────────────── */}
      {chaveAtual === "base" && (
        <CartaoPasso>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cinza-900">
              <Swords className="h-5 w-5 text-primary" />
              <h2 className="text-titulo-seccao">Dados base</h2>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={100}
                placeholder="ex: Liga dos Melhores Sub-15"
              />
              {erros.nome && <p className="text-legenda text-vermelho-600">{erros.nome}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as TipoManoMano)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {LABEL_TIPO_MANO_MANO[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {tipo === "TORNEIO" && (
                <div className="space-y-1.5">
                  <Label>Formato do torneio</Label>
                  <Select
                    value={formatoTorneio}
                    onValueChange={(v) => setFormatoTorneio(v as FormatoTorneioManoMano)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMATOS_TORNEIO.map((f) => (
                        <SelectItem key={f} value={f}>
                          {LABEL_FORMATO_TORNEIO_MANO_MANO[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Âmbito</Label>
                <Select value={ambito} onValueChange={(v) => setAmbito(v as AmbitoManoMano)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AMBITOS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {LABEL_AMBITO_MANO_MANO[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Escalão {ambito === "INTRA_CLUBE" ? "*" : "(opcional)"}</Label>
                <Select value={escalaoId} onValueChange={setEscalaoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {ambito !== "INTRA_CLUBE" && (
                      <SelectItem value={SEM_ESCALAO}>Sem escalão</SelectItem>
                    )}
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
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Formato do duelo</Label>
                <Select
                  value={formatoDuelo}
                  onValueChange={(v) => setFormatoDuelo(v as FormatoDuelo)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATOS_DUELO.map((f) => (
                      <SelectItem key={f} value={f}>
                        {LABEL_FORMATO_DUELO[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formatoDuelo === "TEMPO_LIMITE" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="duracao">Duração limite (min) *</Label>
                  <Input
                    id="duracao"
                    type="number"
                    min={1}
                    max={240}
                    value={duracaoLimiteMin}
                    onChange={(e) => setDuracaoLimiteMin(Number(e.target.value))}
                  />
                  {erros.duracaoLimiteMin && (
                    <p className="text-legenda text-vermelho-600">{erros.duracaoLimiteMin}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="golos">Golos para vencer *</Label>
                  <Input
                    id="golos"
                    type="number"
                    min={1}
                    max={50}
                    value={golosParaVencer}
                    onChange={(e) => setGolosParaVencer(Number(e.target.value))}
                  />
                  {erros.golosParaVencer && (
                    <p className="text-legenda text-vermelho-600">{erros.golosParaVencer}</p>
                  )}
                </div>
              )}
            </div>

            <p className="text-legenda text-cinza-500">
              A competição é criada na época ativa
              {epocaAtiva ? ` (${epocaAtiva.nome})` : ""}.
            </p>
          </div>
        </CartaoPasso>
      )}

      {/* ── Passo 2 — Participantes ──────────────────────────────────────────── */}
      {chaveAtual === "participantes" && (
        <CartaoPasso>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cinza-900">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-titulo-seccao">Participantes</h2>
            </div>

            {ambito === "INTRA_CLUBE" ? (
              poolAtletas.length === 0 ? (
                <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
                  Não há atletas ativos neste escalão. Volta atrás e escolhe outro escalão.
                </p>
              ) : (
                <>
                  <p className="text-legenda text-cinza-500">
                    {atletasSel.size} de {poolAtletas.length} atleta(s) selecionado(s). Toca
                    para incluir ou remover.
                  </p>
                  <ul className="space-y-1.5">
                    {poolAtletas.map((a) => {
                      const on = atletasSel.has(a.id);
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => alternarAtleta(a.id)}
                            aria-pressed={on}
                            className={cn(
                              "flex min-h-[44px] w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                              on
                                ? "border-primary bg-primary/5"
                                : "border-cinza-200 bg-white hover:bg-cinza-50",
                            )}
                          >
                            <span className="min-w-0 truncate text-corpo text-cinza-900">
                              {a.nome}
                            </span>
                            <span
                              className={cn(
                                "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border",
                                on
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-cinza-300",
                              )}
                            >
                              {on && <Check className="h-3.5 w-3.5" />}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )
            ) : (
              <>
                <div className="space-y-3 rounded-md border border-cinza-200 p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ext-nome">Nome do atleta externo</Label>
                    <Input
                      id="ext-nome"
                      value={novoExternoNome}
                      onChange={(e) => setNovoExternoNome(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          adicionarExterno();
                        }
                      }}
                      maxLength={100}
                      placeholder="ex: João Silva"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Clube</Label>
                    <Select value={novoExternoClube} onValueChange={setNovoExternoClube}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_CLUBE}>Sem clube</SelectItem>
                        {clubesExternos.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                        <SelectItem value={NOVO_CLUBE}>＋ Novo clube…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {novoExternoClube === NOVO_CLUBE && (
                    <div className="space-y-1.5">
                      <Label htmlFor="novo-clube">Nome do novo clube</Label>
                      <Input
                        id="novo-clube"
                        value={novoClubeNome}
                        onChange={(e) => setNovoClubeNome(e.target.value)}
                        maxLength={100}
                        placeholder="ex: CD Adversário"
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    onClick={adicionarExterno}
                    disabled={novoExternoNome.trim() === ""}
                    className="w-full gap-1.5 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar participante
                  </Button>
                </div>

                {externos.length === 0 ? (
                  <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
                    Ainda sem participantes externos. Adiciona pelo menos 2.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {externos.map((e) => (
                      <li
                        key={e.chave}
                        className="flex min-h-[44px] items-center gap-3 rounded-md border border-cinza-200 px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-corpo text-cinza-900">
                          {e.nome}
                          {(e.novoClubeNome ||
                            clubesExternos.find((c) => c.id === e.clubeExternoId)?.nome) && (
                            <span className="text-cinza-500">
                              {" "}
                              (
                              {e.novoClubeNome ??
                                clubesExternos.find((c) => c.id === e.clubeExternoId)?.nome}
                              )
                            </span>
                          )}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removerExterno(e.chave)}
                          aria-label={`Remover ${e.nome}`}
                        >
                          <X className="h-4 w-4 text-vermelho-600" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </CartaoPasso>
      )}

      {/* ── Passo 3 — Configuração ───────────────────────────────────────────── */}
      {chaveAtual === "config" && (
        <CartaoPasso>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cinza-900">
              <Settings2 className="h-5 w-5 text-primary" />
              <h2 className="text-titulo-seccao">Configuração</h2>
            </div>

            {eBracket ? (
              <p className="text-corpo-sec text-cinza-600">
                Quadro eliminatório com {numParticipantes} participante(s). Os
                emparelhamentos são gerados por seed no detalhe da competição.
              </p>
            ) : (
              <>
                {usaDuasMaos && (
                  <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-md border border-cinza-200 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-corpo text-cinza-900">Duas mãos</span>
                      <span className="block text-legenda text-cinza-500">
                        Cada confronto joga-se duas vezes (ida e volta).
                      </span>
                    </span>
                    <Switch checked={duasMaos} onCheckedChange={setDuasMaos} />
                  </label>
                )}
                {eLiga && (
                  <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-md border border-cinza-200 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-corpo text-cinza-900">
                        Integrar nos treinos
                      </span>
                      <span className="block text-legenda text-cinza-500">
                        Distribui as jornadas pelas próximas sessões de treino do escalão.
                      </span>
                    </span>
                    <Switch checked={integraTreinos} onCheckedChange={setIntegraTreinos} />
                  </label>
                )}
              </>
            )}

            {previsao && (
              <div className="rounded-md border border-cinza-200 bg-cinza-50/70 p-4">
                <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                  Pré-visualização
                </p>
                <p className="mt-1 text-corpo text-cinza-900">
                  {previsao.totalDuelos} duelo(s) em {previsao.jornadas}{" "}
                  {eBracket ? "ronda(s)" : "jornada(s)"}, entre {numParticipantes}{" "}
                  participante(s).
                </p>
                <p className="mt-1 text-legenda text-cinza-500">
                  Os duelos são gerados no detalhe da competição, após a criação.
                </p>
              </div>
            )}
          </div>
        </CartaoPasso>
      )}

      {/* ── Rodapé de navegação ──────────────────────────────────────────────── */}
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
        {chaveAtual === "config" ? (
          <Button type="button" onClick={submeter} disabled={pending} className="gap-1.5">
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
