"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarRange,
  Users,
  ArrowUpRight,
  ClipboardCheck,
  Building2,
  PackageOpen,
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  Trash2,
  Sparkles,
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
import type { Modalidade } from "@prisma/client";
import { BadgeModalidade } from "@/components/plantel/BadgeModalidade";
import { cn } from "@/lib/utils";
import {
  novaEpocaStep1Schema,
  novoClubeSchema,
} from "@/lib/schemas/novaEpoca";
import {
  criarEpocaRollover,
  criarNovoClube,
  sugerirPromocoes,
  type ElegibilidadeWizard,
  type EscalaoResumo,
} from "@/lib/actions/novaEpoca";

// UI do wizard «Nova Época» (secção 8.21). Client Component que orquestra os
// cenários A (mesmo clube/escalão), B (promoções entre escalões — variante do A)
// e C (novo clube, licença individual). A validação por passo usa os mesmos
// schemas Zod do servidor (fonte única). O gating de acesso (CLUBE_EPOCAS) é
// feito na página/servidor; aqui assume-se que o utilizador é elegível.

// ─────────────────────────────────────────────────────────────────────────────
// Helpers partilhados
// ─────────────────────────────────────────────────────────────────────────────

/** Converte o campo de número (string) em número (1-999) ou null. */
function parseNumero(valor: string | undefined): number | null {
  const t = (valor ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

function fromZod(error: {
  issues: { path: (string | number)[]; message: string }[];
}): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((i) => [i.path.join("."), i.message]),
  );
}

/** Indicador de progresso: «Passo X de Y» + pontos. */
function PassosIndicador({
  passos,
  atual,
}: {
  passos: { chave: string; titulo: string }[];
  atual: number;
}) {
  return (
    <div className="space-y-3">
      <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
        Passo {atual + 1} de {passos.length} · {passos[atual].titulo}
      </p>
      <div className="flex items-center gap-2" role="list" aria-label="Progresso do assistente">
        {passos.map((p, i) => (
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

/** Rodapé de navegação (Anterior / Próximo / ação final). */
function RodapeWizard({
  podeVoltar,
  ehUltimo,
  pending,
  rotuloFinal,
  onAnterior,
  onProximo,
  onSubmeter,
}: {
  podeVoltar: boolean;
  ehUltimo: boolean;
  pending: boolean;
  rotuloFinal: string;
  onAnterior: () => void;
  onProximo: () => void;
  onSubmeter: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-cinza-200 pt-4">
      <Button
        type="button"
        variant="outline"
        onClick={onAnterior}
        disabled={!podeVoltar || pending}
        className="gap-1.5"
      >
        <ChevronLeft className="h-4 w-4" />
        Anterior
      </Button>
      {ehUltimo ? (
        <Button type="button" onClick={onSubmeter} disabled={pending} className="gap-1.5">
          {pending ? (
            "A criar…"
          ) : (
            <>
              <Check className="h-4 w-4" />
              {rotuloFinal}
            </>
          )}
        </Button>
      ) : (
        <Button type="button" onClick={onProximo} disabled={pending} className="gap-1.5">
          Próximo
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
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
// Ponto de entrada — escolhe o fluxo pelo cenário detetado
// ─────────────────────────────────────────────────────────────────────────────

export interface SeccaoWizard {
  id: string;
  nome: string | null;
  modalidade: Modalidade;
}

export function WizardNovaEpoca({
  elegibilidade,
  seccoes = [],
  seccaoPorEscalao = {},
}: {
  elegibilidade: ElegibilidadeWizard;
  /** Secções do clube (§8.21 v7) — agrupam os escalões por modalidade no wizard. */
  seccoes?: SeccaoWizard[];
  /** Mapa escalãoId → secçãoId (ou null se sem secção). */
  seccaoPorEscalao?: Record<string, string | null>;
}) {
  if (elegibilidade.cenario === "C") return <WizardNovoClube />;
  return (
    <WizardRollover
      elegibilidade={elegibilidade}
      seccoes={seccoes}
      seccaoPorEscalao={seccaoPorEscalao}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cenário A/B — rollover no mesmo clube
// ─────────────────────────────────────────────────────────────────────────────

interface EstadoTransicao {
  transita: boolean;
  numero: string;
}

interface AtletaPromocao {
  atletaId: string;
  nome: string;
  numeroAtual: number | null;
  idade: number | null;
  transita: boolean;
  novoNumero: string;
}

interface BlocoPromocao {
  id: string;
  escalaoOrigemId: string;
  escalaoDestinoId: string;
  atletas: AtletaPromocao[];
  carregado: boolean;
  aCarregar: boolean;
}

let contadorBloco = 0;
function novoBloco(): BlocoPromocao {
  contadorBloco += 1;
  return {
    id: `bloco-${contadorBloco}`,
    escalaoOrigemId: "",
    escalaoDestinoId: "",
    atletas: [],
    carregado: false,
    aCarregar: false,
  };
}

function WizardRollover({
  elegibilidade,
  seccoes,
  seccaoPorEscalao,
}: {
  elegibilidade: ElegibilidadeWizard;
  seccoes: SeccaoWizard[];
  seccaoPorEscalao: Record<string, string | null>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const { atletasAtivos, escaloes } = elegibilidade;

  // §8.21 v7: agrupa os escalões por secção quando o clube tem >1 secção. Cada
  // grupo permite incluir/excluir a modalidade inteira na nova época.
  const multiSeccao = seccoes.length > 1;
  const gruposEscaloes = useMemo(() => {
    if (!multiSeccao) return [];
    return seccoes
      .map((s) => ({
        seccao: s,
        escaloes: escaloes.filter((e) => seccaoPorEscalao[e.id] === s.id),
      }))
      .filter((g) => g.escaloes.length > 0);
  }, [multiSeccao, seccoes, escaloes, seccaoPorEscalao]);

  // Passo 1 — dados da nova época
  const [nome, setNome] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [escalaoIds, setEscalaoIds] = useState<string[]>(
    escaloes.map((e) => e.id),
  );
  const [incluirPromocoes, setIncluirPromocoes] = useState(false);
  const [errosPasso1, setErrosPasso1] = useState<Record<string, string>>({});

  // Passo 2 — plantel (transições regulares)
  const [transicoes, setTransicoes] = useState<Record<string, EstadoTransicao>>(
    () =>
      Object.fromEntries(
        atletasAtivos.map((a) => [
          a.id,
          { transita: true, numero: a.numero != null ? String(a.numero) : "" },
        ]),
      ),
  );

  // Passo 3 (opcional) — promoções entre escalões
  const [promocoes, setPromocoes] = useState<BlocoPromocao[]>([]);

  const passos = useMemo(
    () =>
      incluirPromocoes
        ? [
            { chave: "epoca", titulo: "Época" },
            { chave: "plantel", titulo: "Plantel" },
            { chave: "promocoes", titulo: "Promoções" },
            { chave: "resumo", titulo: "Resumo" },
          ]
        : [
            { chave: "epoca", titulo: "Época" },
            { chave: "plantel", titulo: "Plantel" },
            { chave: "resumo", titulo: "Resumo" },
          ],
    [incluirPromocoes],
  );

  const [passoIndex, setPassoIndex] = useState(0);
  const chaveAtual = passos[Math.min(passoIndex, passos.length - 1)].chave;

  // Atletas cujo escalão continua na nova época (base das transições regulares).
  const atletasContinuam = useMemo(
    () => atletasAtivos.filter((a) => escalaoIds.includes(a.escalaoId)),
    [atletasAtivos, escalaoIds],
  );

  // Agrupados por escalão para a lista do plantel.
  const grupos = useMemo(() => {
    const mapa = new Map<string, { nome: string; atletas: typeof atletasContinuam }>();
    for (const a of atletasContinuam) {
      const g = mapa.get(a.escalaoId) ?? { nome: a.escalaoNome, atletas: [] };
      g.atletas.push(a);
      mapa.set(a.escalaoId, g);
    }
    return [...mapa.values()];
  }, [atletasContinuam]);

  const promovidosIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of promocoes)
      for (const a of b.atletas) if (a.transita) s.add(a.atletaId);
    return s;
  }, [promocoes]);

  const totalTransitaRegular = atletasContinuam.filter(
    (a) => transicoes[a.id]?.transita && !promovidosIds.has(a.id),
  ).length;
  const totalTransita = totalTransitaRegular + promovidosIds.size;
  const totalFicamFora = atletasAtivos.length - totalTransita;

  // ── Navegação com validação por passo ─────────────────────────────────────
  function validarPasso1(): boolean {
    const r = novaEpocaStep1Schema.safeParse({
      nome,
      dataInicio,
      dataFim,
      escalaoIds,
    });
    if (!r.success) {
      setErrosPasso1(fromZod(r.error));
      return false;
    }
    setErrosPasso1({});
    return true;
  }

  function avancar() {
    if (chaveAtual === "epoca" && !validarPasso1()) return;
    setPassoIndex((i) => Math.min(i + 1, passos.length - 1));
  }
  function recuar() {
    setPassoIndex((i) => Math.max(i - 1, 0));
  }

  // ── Mutações de estado ─────────────────────────────────────────────────────
  function alternarEscalao(id: string) {
    setEscalaoIds((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  /** Inclui/exclui todos os escalões de uma secção de uma só vez (§8.21 v7). */
  function alternarSeccao(idsSeccao: string[], incluir: boolean) {
    setEscalaoIds((atual) => {
      const conjunto = new Set(atual);
      for (const id of idsSeccao) {
        if (incluir) conjunto.add(id);
        else conjunto.delete(id);
      }
      return [...conjunto];
    });
  }

  function definirTransicao(atletaId: string, patch: Partial<EstadoTransicao>) {
    setTransicoes((atual) => ({
      ...atual,
      [atletaId]: { ...atual[atletaId], ...patch },
    }));
  }

  function marcarTodos(valor: boolean) {
    setTransicoes((atual) => {
      const copia = { ...atual };
      for (const a of atletasContinuam)
        copia[a.id] = { ...copia[a.id], transita: valor };
      return copia;
    });
  }

  function atualizarBloco(id: string, patch: Partial<BlocoPromocao>) {
    setPromocoes((atual) =>
      atual.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  }

  function removerBloco(id: string) {
    setPromocoes((atual) => atual.filter((b) => b.id !== id));
  }

  function definirAtletaPromocao(
    blocoId: string,
    atletaId: string,
    patch: Partial<AtletaPromocao>,
  ) {
    setPromocoes((atual) =>
      atual.map((b) =>
        b.id === blocoId
          ? {
              ...b,
              atletas: b.atletas.map((a) =>
                a.atletaId === atletaId ? { ...a, ...patch } : a,
              ),
            }
          : b,
      ),
    );
  }

  function carregarSugestoes(bloco: BlocoPromocao) {
    if (!bloco.escalaoOrigemId) {
      toast.error("Escolhe o escalão de origem para ver sugestões.");
      return;
    }
    atualizarBloco(bloco.id, { aCarregar: true });
    startTransition(async () => {
      const res = await sugerirPromocoes(bloco.escalaoOrigemId);
      if (res.sucesso) {
        atualizarBloco(bloco.id, {
          carregado: true,
          aCarregar: false,
          atletas: res.dados.atletas.map((a) => ({
            atletaId: a.atletaId,
            nome: a.nome,
            numeroAtual: a.numeroAtual,
            idade: a.idade,
            transita: true,
            novoNumero: "",
          })),
        });
        if (res.dados.atletas.length === 0)
          toast.info("Nenhum atleta deste escalão ultrapassa o limite de idade.");
      } else {
        atualizarBloco(bloco.id, { aCarregar: false });
        toast.error(res.erro);
      }
    });
  }

  // ── Submissão final ────────────────────────────────────────────────────────
  function submeter() {
    const dados = {
      nome,
      dataInicio,
      dataFim,
      escalaoIds,
      atletas: atletasContinuam.map((a) => ({
        atletaId: a.id,
        transitaParaNova: !!transicoes[a.id]?.transita,
        novoNumero: parseNumero(transicoes[a.id]?.numero),
      })),
      promocoes: promocoes
        .filter(
          (b) =>
            b.escalaoOrigemId &&
            b.escalaoDestinoId &&
            b.escalaoOrigemId !== b.escalaoDestinoId,
        )
        .map((b) => ({
          escalaoOrigemId: b.escalaoOrigemId,
          escalaoDestinoId: b.escalaoDestinoId,
          atletasParaPromover: b.atletas.map((a) => ({
            atletaId: a.atletaId,
            transitaParaNova: a.transita,
            novoNumero: parseNumero(a.novoNumero),
          })),
        })),
    };

    startTransition(async () => {
      const res = await criarEpocaRollover(dados);
      if (res.sucesso) {
        toast.success("Nova época criada");
        router.push("/dashboard");
      } else {
        toast.error(res.erro);
        // Erros de datas/escalões pertencem ao passo 1 — volta lá se necessário.
        if (res.camposInvalidos) {
          setErrosPasso1(res.camposInvalidos);
          if (
            ["nome", "dataInicio", "dataFim", "escalaoIds"].some(
              (k) => res.camposInvalidos?.[k],
            )
          )
            setPassoIndex(0);
        }
      }
    });
  }

  const muitosAtletas = atletasContinuam.length > 15;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1>Nova época</h1>
        <p className="mt-1 text-corpo-sec text-cinza-600">
          Transição guiada: herda exercícios e métricas; zera
          estatísticas, presenças e jogos.
        </p>
      </div>

      <PassosIndicador passos={passos} atual={passoIndex} />

      {/* ── Passo: Época ────────────────────────────────────────────────── */}
      {chaveAtual === "epoca" && (
        <CartaoPasso>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cinza-900">
              <CalendarRange className="h-5 w-5 text-primary" />
              <h2 className="text-titulo-seccao">Dados da nova época</h2>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="ex: 2026/27"
                maxLength={20}
              />
              {errosPasso1.nome && (
                <p className="text-legenda text-vermelho-600">{errosPasso1.nome}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dataInicio">Início *</Label>
                <Input
                  id="dataInicio"
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
                {errosPasso1.dataInicio && (
                  <p className="text-legenda text-vermelho-600">
                    {errosPasso1.dataInicio}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dataFim">Fim *</Label>
                <Input
                  id="dataFim"
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                />
                {errosPasso1.dataFim && (
                  <p className="text-legenda text-vermelho-600">
                    {errosPasso1.dataFim}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Escalões que continuam *</Label>
              {escaloes.length === 0 ? (
                <p className="text-corpo-sec text-cinza-600">
                  Este clube não tem escalões definidos.
                </p>
              ) : multiSeccao && gruposEscaloes.length > 0 ? (
                // Multi-secção: escalões agrupados por modalidade, com a opção de
                // incluir/excluir a secção inteira na nova época (§8.21 v7).
                <div className="space-y-4">
                  {gruposEscaloes.map((g) => {
                    const idsSeccao = g.escaloes.map((e) => e.id);
                    const todos = idsSeccao.every((id) => escalaoIds.includes(id));
                    return (
                      <div key={g.seccao.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="flex items-center gap-2 text-corpo-sec font-semibold text-cinza-700">
                            {g.seccao.nome ?? g.seccao.modalidade}
                            <BadgeModalidade modalidade={g.seccao.modalidade} compacto />
                          </p>
                          <button
                            type="button"
                            onClick={() => alternarSeccao(idsSeccao, !todos)}
                            className="text-legenda font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {todos ? "Excluir secção" : "Incluir secção"}
                          </button>
                        </div>
                        <ul className="space-y-1.5">
                          {g.escaloes.map((e) => (
                            <li key={e.id}>
                              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-cinza-200 px-3 hover:bg-primary/5">
                                <input
                                  type="checkbox"
                                  className="h-5 w-5 accent-primary"
                                  checked={escalaoIds.includes(e.id)}
                                  onChange={() => alternarEscalao(e.id)}
                                />
                                <span className="text-corpo text-cinza-900">{e.nome}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {escaloes.map((e) => (
                    <li key={e.id}>
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-cinza-200 px-3 hover:bg-primary/5">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-primary"
                          checked={escalaoIds.includes(e.id)}
                          onChange={() => alternarEscalao(e.id)}
                        />
                        <span className="text-corpo text-cinza-900">{e.nome}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {errosPasso1.escalaoIds && (
                <p className="text-legenda text-vermelho-600">
                  {errosPasso1.escalaoIds}
                </p>
              )}
            </div>

            <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-md border border-cinza-200 px-3">
              <span className="flex items-center gap-2 text-corpo text-cinza-900">
                <ArrowUpRight className="h-4 w-4 text-primary" />
                Há atletas a mudar de escalão (promoções)?
              </span>
              <Switch
                checked={incluirPromocoes}
                onCheckedChange={(v) => {
                  setIncluirPromocoes(v);
                  if (v && promocoes.length === 0) setPromocoes([novoBloco()]);
                }}
              />
            </label>
          </div>
        </CartaoPasso>
      )}

      {/* ── Passo: Plantel ─────────────────────────────────────────────── */}
      {chaveAtual === "plantel" && (
        <CartaoPasso>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-cinza-900">
                <Users className="h-5 w-5 text-primary" />
                <h2 className="text-titulo-seccao">Quem transita?</h2>
              </div>
              {muitosAtletas && (
                <div className="flex items-center gap-3 text-corpo-sec">
                  <button
                    type="button"
                    onClick={() => marcarTodos(true)}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Marcar todos
                  </button>
                  <span className="text-cinza-300">·</span>
                  <button
                    type="button"
                    onClick={() => marcarTodos(false)}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Desmarcar todos
                  </button>
                </div>
              )}
            </div>

            <p className="text-corpo-sec text-cinza-600">
              Todos marcados por defeito. Desmarca quem saiu. Podes ajustar o
              número; adicionar novos atletas faz-se depois, no plantel.
            </p>

            {atletasContinuam.length === 0 ? (
              <p className="text-corpo-sec text-cinza-600">
                Nenhum atleta na época anterior para os escalões selecionados.
              </p>
            ) : (
              <div className="space-y-5">
                {grupos.map((g) => (
                  <div key={g.nome} className="space-y-2">
                    <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                      {g.nome}
                    </p>
                    <ul className="space-y-1.5">
                      {g.atletas.map((a) => {
                        const est = transicoes[a.id];
                        const promovido = promovidosIds.has(a.id);
                        return (
                          <li
                            key={a.id}
                            className="flex min-h-[44px] items-center gap-3 rounded-md border border-cinza-200 px-3 py-2"
                          >
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-primary"
                              checked={!!est?.transita}
                              disabled={promovido}
                              onChange={(e) =>
                                definirTransicao(a.id, { transita: e.target.checked })
                              }
                              aria-label={`${a.nome} transita?`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-corpo text-cinza-900">
                                {a.nome}
                              </p>
                              {promovido && (
                                <p className="text-legenda text-ambar-600">
                                  Promovido noutro escalão
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-legenda text-cinza-400">Nº</span>
                              <Input
                                type="number"
                                min={1}
                                max={999}
                                inputMode="numeric"
                                value={est?.numero ?? ""}
                                onChange={(e) =>
                                  definirTransicao(a.id, { numero: e.target.value })
                                }
                                disabled={promovido || !est?.transita}
                                className="h-9 w-20"
                                aria-label={`Número de ${a.nome}`}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CartaoPasso>
      )}

      {/* ── Passo: Promoções (opcional) ────────────────────────────────── */}
      {chaveAtual === "promocoes" && (
        <CartaoPasso>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cinza-900">
              <ArrowUpRight className="h-5 w-5 text-primary" />
              <h2 className="text-titulo-seccao">Promoções entre escalões</h2>
            </div>
            <p className="text-corpo-sec text-cinza-600">
              A sugestão por idade é apenas indicativa — a promoção é sempre de
              confirmação individual, nunca automática.
            </p>

            {promocoes.length === 0 && (
              <p className="text-corpo-sec text-cinza-600">
                Sem promoções configuradas.
              </p>
            )}

            <div className="space-y-4">
              {promocoes.map((b) => (
                <BlocoPromocaoCard
                  key={b.id}
                  bloco={b}
                  escaloes={escaloes}
                  pending={pending}
                  onAlterar={(patch) => atualizarBloco(b.id, patch)}
                  onRemover={() => removerBloco(b.id)}
                  onCarregar={() => carregarSugestoes(b)}
                  onAtleta={(atletaId, patch) =>
                    definirAtletaPromocao(b.id, atletaId, patch)
                  }
                />
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setPromocoes((atual) => [...atual, novoBloco()])}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Adicionar promoção
            </Button>
          </div>
        </CartaoPasso>
      )}

      {/* ── Passo: Resumo ──────────────────────────────────────────────── */}
      {chaveAtual === "resumo" && (
        <CartaoPasso>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cinza-900">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <h2 className="text-titulo-seccao">Confirmação</h2>
            </div>

            <dl className="space-y-2 text-corpo">
              <div className="flex justify-between gap-4">
                <dt className="text-cinza-600">Nova época</dt>
                <dd className="font-semibold text-cinza-900">{nome || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-cinza-600">Escalões que continuam</dt>
                <dd className="text-right font-semibold text-cinza-900">
                  {escalaoIds.length}
                </dd>
              </div>
            </dl>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-cinza-200 p-3 text-center">
                <p className="text-titulo-pagina text-verde-600">{totalTransita}</p>
                <p className="text-legenda text-cinza-600">transitam</p>
              </div>
              <div className="rounded-md border border-cinza-200 p-3 text-center">
                <p className="text-titulo-pagina text-cinza-900">{totalFicamFora}</p>
                <p className="text-legenda text-cinza-600">ficam fora</p>
              </div>
              <div className="rounded-md border border-cinza-200 p-3 text-center">
                <p className="text-titulo-pagina text-primary">
                  {promovidosIds.size}
                </p>
                <p className="text-legenda text-cinza-600">promovidos</p>
              </div>
            </div>

            <p className="text-legenda text-cinza-500">
              Ao criar, a nova época fica ativa e o plantel escolhido transita com
              uma participação principal cada.
            </p>
          </div>
        </CartaoPasso>
      )}

      <RodapeWizard
        podeVoltar={passoIndex > 0}
        ehUltimo={chaveAtual === "resumo"}
        pending={pending}
        rotuloFinal="Criar época"
        onAnterior={recuar}
        onProximo={avancar}
        onSubmeter={submeter}
      />
    </div>
  );
}

function BlocoPromocaoCard({
  bloco,
  escaloes,
  pending,
  onAlterar,
  onRemover,
  onCarregar,
  onAtleta,
}: {
  bloco: BlocoPromocao;
  escaloes: EscalaoResumo[];
  pending: boolean;
  onAlterar: (patch: Partial<BlocoPromocao>) => void;
  onRemover: () => void;
  onCarregar: () => void;
  onAtleta: (atletaId: string, patch: Partial<AtletaPromocao>) => void;
}) {
  const destinoInvalido =
    !!bloco.escalaoDestinoId &&
    bloco.escalaoDestinoId === bloco.escalaoOrigemId;

  return (
    <div className="space-y-4 rounded-md border border-cinza-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Escalão de origem</Label>
            <Select
              value={bloco.escalaoOrigemId || undefined}
              onValueChange={(v) =>
                onAlterar({ escalaoOrigemId: v, carregado: false, atletas: [] })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolher…" />
              </SelectTrigger>
              <SelectContent>
                {escaloes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Escalão de destino</Label>
            <Select
              value={bloco.escalaoDestinoId || undefined}
              onValueChange={(v) => onAlterar({ escalaoDestinoId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolher…" />
              </SelectTrigger>
              <SelectContent>
                {escaloes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {destinoInvalido && (
              <p className="text-legenda text-vermelho-600">
                O destino deve ser diferente da origem.
              </p>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemover}
          aria-label="Remover promoção"
        >
          <Trash2 className="h-4 w-4 text-vermelho-600" />
        </Button>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCarregar}
        disabled={pending || !bloco.escalaoOrigemId || bloco.aCarregar}
        className="gap-1.5"
      >
        <Sparkles className="h-4 w-4" />
        {bloco.aCarregar ? "A sugerir…" : "Sugerir por idade"}
      </Button>

      {bloco.carregado && bloco.atletas.length === 0 && (
        <p className="text-corpo-sec text-cinza-600">
          Nenhum atleta sugerido para promoção neste escalão.
        </p>
      )}

      {bloco.atletas.length > 0 && (
        <ul className="space-y-1.5">
          {bloco.atletas.map((a) => (
            <li
              key={a.atletaId}
              className="flex min-h-[44px] items-center gap-3 rounded-md border border-cinza-200 px-3 py-2"
            >
              <input
                type="checkbox"
                className="h-5 w-5 accent-primary"
                checked={a.transita}
                onChange={(e) => onAtleta(a.atletaId, { transita: e.target.checked })}
                aria-label={`Promover ${a.nome}?`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-corpo text-cinza-900">{a.nome}</p>
                {a.idade != null && (
                  <p className="text-legenda text-cinza-500">{a.idade} anos</p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-legenda text-cinza-400">Nº</span>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  inputMode="numeric"
                  value={a.novoNumero}
                  onChange={(e) => onAtleta(a.atletaId, { novoNumero: e.target.value })}
                  disabled={!a.transita}
                  className="h-9 w-20"
                  aria-label={`Número de ${a.nome} no novo escalão`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cenário C — novo clube (licença individual)
// ─────────────────────────────────────────────────────────────────────────────

function WizardNovoClube() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [nomeClube, setNomeClube] = useState("");
  const [corClube, setCorClube] = useState("#F0531E");
  const [escalaoNome, setEscalaoNome] = useState("");
  const [importarExercicios, setImportarExercicios] = useState(true);
  const [importarModelosTaticos, setImportarModelosTaticos] = useState(true);
  const [importarMetricas, setImportarMetricas] = useState(true);
  const [erros, setErros] = useState<Record<string, string>>({});

  const passos = [
    { chave: "clube", titulo: "Novo clube" },
    { chave: "importar", titulo: "Transportar" },
    { chave: "confirmar", titulo: "Confirmação" },
  ];
  const [passoIndex, setPassoIndex] = useState(0);
  const chaveAtual = passos[passoIndex].chave;

  function dados() {
    return {
      nomeClube,
      corClube,
      escalaoNome,
      importarExercicios,
      importarModelosTaticos,
      importarMetricas,
    };
  }

  function validarClube(): boolean {
    const r = novoClubeSchema.safeParse(dados());
    if (!r.success) {
      setErros(fromZod(r.error));
      return false;
    }
    setErros({});
    return true;
  }

  function avancar() {
    if (chaveAtual === "clube" && !validarClube()) return;
    setPassoIndex((i) => Math.min(i + 1, passos.length - 1));
  }
  function recuar() {
    setPassoIndex((i) => Math.max(i - 1, 0));
  }

  function submeter() {
    if (!validarClube()) {
      setPassoIndex(0);
      return;
    }
    startTransition(async () => {
      const res = await criarNovoClube(dados());
      if (res.sucesso) {
        toast.success("Novo clube e época criados");
        router.push("/dashboard");
      } else {
        toast.error(res.erro);
        if (res.camposInvalidos) {
          setErros(res.camposInvalidos);
          setPassoIndex(0);
        }
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1>Novo clube e época</h1>
        <p className="mt-1 text-corpo-sec text-cinza-600">
          Cria o teu novo clube e transporta o teu conteúdo metodológico.
        </p>
      </div>

      <PassosIndicador passos={passos} atual={passoIndex} />

      {chaveAtual === "clube" && (
        <CartaoPasso>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cinza-900">
              <Building2 className="h-5 w-5 text-primary" />
              <h2 className="text-titulo-seccao">Dados do novo clube</h2>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nomeClube">Nome do clube *</Label>
              <Input
                id="nomeClube"
                value={nomeClube}
                onChange={(e) => setNomeClube(e.target.value)}
                maxLength={100}
              />
              {erros.nomeClube && (
                <p className="text-legenda text-vermelho-600">{erros.nomeClube}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="corClube">Cor do clube</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={corClube}
                  onChange={(e) => setCorClube(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-cinza-200"
                  aria-label="Cor do clube"
                />
                <Input
                  value={corClube}
                  onChange={(e) => setCorClube(e.target.value)}
                  className="font-mono"
                  maxLength={7}
                />
              </div>
              {erros.corClube && (
                <p className="text-legenda text-vermelho-600">{erros.corClube}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="escalaoNome">Primeiro escalão *</Label>
              <Input
                id="escalaoNome"
                value={escalaoNome}
                onChange={(e) => setEscalaoNome(e.target.value)}
                placeholder="ex: Seniores"
                maxLength={50}
              />
              {erros.escalaoNome && (
                <p className="text-legenda text-vermelho-600">{erros.escalaoNome}</p>
              )}
            </div>
          </div>
        </CartaoPasso>
      )}

      {chaveAtual === "importar" && (
        <CartaoPasso>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cinza-900">
              <PackageOpen className="h-5 w-5 text-primary" />
              <h2 className="text-titulo-seccao">O que transportar</h2>
            </div>
            <p className="text-corpo-sec text-cinza-600">
              O teu conteúdo portátil viaja contigo. Escolhe o que copiar para o
              novo clube.
            </p>

            <ToggleImportar
              titulo="Exercícios portáteis"
              descricao="Exercícios da tua autoria."
              valor={importarExercicios}
              onChange={setImportarExercicios}
            />
            <ToggleImportar
              titulo="Modelos táticos"
              descricao="A tua metodologia de jogo."
              valor={importarModelosTaticos}
              onChange={setImportarModelosTaticos}
            />
            <ToggleImportar
              titulo="Métricas configuradas"
              descricao="As métricas de estatística do clube anterior."
              valor={importarMetricas}
              onChange={setImportarMetricas}
            />
          </div>
        </CartaoPasso>
      )}

      {chaveAtual === "confirmar" && (
        <CartaoPasso>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cinza-900">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <h2 className="text-titulo-seccao">Confirmação</h2>
            </div>

            <dl className="space-y-2 text-corpo">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-cinza-600">Clube</dt>
                <dd className="flex items-center gap-2 font-semibold text-cinza-900">
                  <span
                    className="inline-block h-4 w-4 rounded-full border border-cinza-200"
                    style={{ backgroundColor: corClube }}
                  />
                  {nomeClube || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-cinza-600">Primeiro escalão</dt>
                <dd className="font-semibold text-cinza-900">{escalaoNome || "—"}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              {importarExercicios && <Badge variant="outline">Exercícios</Badge>}
              {importarModelosTaticos && (
                <Badge variant="outline">Modelos táticos</Badge>
              )}
              {importarMetricas && <Badge variant="outline">Métricas</Badge>}
              {!importarExercicios &&
                !importarModelosTaticos &&
                !importarMetricas && (
                  <span className="text-corpo-sec text-cinza-500">
                    Sem conteúdo a transportar.
                  </span>
                )}
            </div>

            <p className="text-legenda text-cinza-500">
              Ao criar, sais do clube atual (se for individual) e passas a
              Administrador do novo clube, com a época corrente ativa.
            </p>
          </div>
        </CartaoPasso>
      )}

      <RodapeWizard
        podeVoltar={passoIndex > 0}
        ehUltimo={chaveAtual === "confirmar"}
        pending={pending}
        rotuloFinal="Criar clube"
        onAnterior={recuar}
        onProximo={avancar}
        onSubmeter={submeter}
      />
    </div>
  );
}

function ToggleImportar({
  titulo,
  descricao,
  valor,
  onChange,
}: {
  titulo: string;
  descricao: string;
  valor: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-md border border-cinza-200 px-3 py-2">
      <span className="min-w-0">
        <span className="block text-corpo text-cinza-900">{titulo}</span>
        <span className="block text-legenda text-cinza-500">{descricao}</span>
      </span>
      <Switch checked={valor} onCheckedChange={onChange} />
    </label>
  );
}
