"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Palette,
  Layers,
  CalendarRange,
  Check,
  Plus,
  Trash2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { atualizarBrandingClube } from "@/lib/actions/clubes";
import { LogoClubeUpload } from "@/components/definicoes/LogoClubeUpload";
import { criarEscalao, apagarEscalao } from "@/lib/actions/escaloes";
import { criarEpoca, definirEpocaAtiva } from "@/lib/actions/epocas";
import { garantirSeccaoParaModalidade } from "@/lib/actions/seccoes";
import { marcarOnboardingConcluido } from "@/lib/actions/onboarding";
import { cn } from "@/lib/utils";
import type { Clube, Escalao, Epoca, Modalidade } from "@prisma/client";

// Modalidades disponíveis no onboarding (§8.1.1). A escolha determina a secção do
// escalão criado; um clube pode acrescentar a outra modalidade depois em Definições.
const MODALIDADES: { valor: Modalidade; rotulo: string; emoji: string }[] = [
  { valor: "FUTSAL", rotulo: "Futsal", emoji: "🥅" },
  { valor: "FUTEBOL", rotulo: "Futebol", emoji: "⚽" },
];

/** Flag local (§8.1): marca o onboarding como concluído/saltado neste browser. */
const CHAVE_ONBOARDING = "fc:onboarding:concluido";

interface Props {
  clube: Clube;
  escaloesIniciais: Escalao[];
  epocasIniciais: Epoca[];
  epocaAtivaId: string | null;
}

type IndicePasso = 0 | 1 | 2;

const PASSOS = [
  { titulo: "Identidade", icon: Palette },
  { titulo: "Escalões", icon: Layers },
  { titulo: "Época", icon: CalendarRange },
] as const;

export function WizardOnboarding({
  clube,
  escaloesIniciais,
  epocasIniciais,
  epocaAtivaId,
}: Props) {
  const router = useRouter();
  const [passo, setPasso] = useState<IndicePasso>(0);
  const [concluindo, startConcluir] = useTransition();

  function avancar() {
    setPasso((p) => (p < 2 ? ((p + 1) as IndicePasso) : p));
  }

  function concluir() {
    startConcluir(async () => {
      // Persiste o estado na BD (partilhado entre dispositivos).
      await marcarOnboardingConcluido();
      // Cache local, inofensiva: acelera decisões no cliente neste browser.
      try {
        window.localStorage.setItem(CHAVE_ONBOARDING, "1");
      } catch {
        /* localStorage indisponível — segue na mesma. */
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Cabeçalho */}
      <div className="text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </span>
        <h1>Vamos preparar o {clube.nome}</h1>
        <p className="mt-1 text-corpo-sec text-cinza-600">
          Três passos rápidos para deixar tudo pronto. Podes saltar qualquer um e
          voltar mais tarde nas Definições.
        </p>
      </div>

      {/* Indicador de passos */}
      <ol className="flex items-center justify-center gap-2" aria-label="Progresso do setup">
        {PASSOS.map((p, i) => {
          const feito = i < passo;
          const ativo = i === passo;
          const Icon = p.icon;
          return (
            <li key={p.titulo} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-corpo-sec font-medium transition-colors",
                  ativo && "bg-primary/10 text-primary",
                  feito && "text-cinza-600",
                  !ativo && !feito && "text-cinza-400",
                )}
                aria-current={ativo ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border",
                    ativo && "border-primary bg-primary text-white",
                    feito && "border-primary/40 bg-primary/10 text-primary",
                    !ativo && !feito && "border-cinza-200 text-cinza-400",
                  )}
                >
                  {feito ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span className="hidden sm:inline">{p.titulo}</span>
              </div>
              {i < PASSOS.length - 1 && (
                <span className="h-px w-4 bg-cinza-200 sm:w-6" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      {/* Conteúdo do passo */}
      <div className="card-base p-6">
        {passo === 0 && (
          <PassoBranding clube={clube} onContinuar={avancar} onSaltar={avancar} />
        )}
        {passo === 1 && (
          <PassoEscaloes
            escaloesIniciais={escaloesIniciais}
            onContinuar={avancar}
            onSaltar={avancar}
          />
        )}
        {passo === 2 && (
          <PassoEpoca
            epocasIniciais={epocasIniciais}
            epocaAtivaIdInicial={epocaAtivaId}
            onConcluir={concluir}
            concluindo={concluindo}
          />
        )}
      </div>
    </div>
  );
}

// ─── Passo 1: Branding ────────────────────────────────────────────────────────

function PassoBranding({
  clube,
  onContinuar,
  onSaltar,
}: {
  clube: Clube;
  onContinuar: () => void;
  onSaltar: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [corPrimaria, setCorPrimaria] = useState(clube.corPrimaria);
  const [logoUrl, setLogoUrl] = useState(clube.logoUrl ?? "");
  const [nome, setNome] = useState(clube.nome);
  const [erro, setErro] = useState<string | null>(null);

  function guardar() {
    setErro(null);
    startTransition(async () => {
      const res = await atualizarBrandingClube({
        nome: nome.trim(),
        corPrimaria,
        corSecundaria: clube.corSecundaria,
        logoUrl: logoUrl.trim(),
        morada: clube.morada ?? undefined,
        email: clube.email ?? "",
        telefone: clube.telefone ?? undefined,
      });
      if (res.sucesso) {
        toast.success("Identidade guardada");
        onContinuar();
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <div className="space-y-5">
      <CabecalhoPasso
        titulo="Identidade do clube"
        descricao="O logótipo e a cor primária personalizam toda a aplicação."
      />

      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome do clube</Label>
        <Input
          id="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          minLength={2}
          maxLength={100}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="corPrimaria">Cor primária</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              id="corPrimaria"
              value={corPrimaria}
              onChange={(e) => setCorPrimaria(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-cinza-200"
              aria-label="Cor primária"
            />
            <Input
              value={corPrimaria}
              onChange={(e) => setCorPrimaria(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
      </div>

      <LogoClubeUpload valor={logoUrl} onAlterar={setLogoUrl} nomeClube={nome} />

      {/* Pré-visualização */}
      <div className="flex items-center gap-3 rounded-lg border border-cinza-200 p-3">
        {logoUrl.trim() ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl.trim()}
            alt=""
            aria-hidden
            className="h-10 w-10 rounded-md object-contain"
          />
        ) : (
          <span
            className="flex h-10 w-10 items-center justify-center rounded-md text-white"
            style={{ backgroundColor: corPrimaria }}
          >
            {nome.trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
        <div>
          <p className="text-corpo font-semibold text-cinza-900">{nome || "Clube"}</p>
          <span
            className="inline-block rounded px-2 py-0.5 text-legenda text-white"
            style={{ backgroundColor: corPrimaria }}
          >
            {corPrimaria}
          </span>
        </div>
      </div>

      <RodapePasso pending={pending} onSaltar={onSaltar} onContinuar={guardar} />
    </div>
  );
}

// ─── Passo 2: Escalões ────────────────────────────────────────────────────────

function PassoEscaloes({
  escaloesIniciais,
  onContinuar,
  onSaltar,
}: {
  escaloesIniciais: Escalao[];
  onContinuar: () => void;
  onSaltar: () => void;
}) {
  const [escaloes, setEscaloes] = useState<Escalao[]>(escaloesIniciais);
  const [nome, setNome] = useState("");
  const [modalidade, setModalidade] = useState<Modalidade>("FUTSAL");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function adicionar() {
    const limpo = nome.trim();
    if (!limpo) return;
    setErro(null);
    startTransition(async () => {
      // §8.1.1: garante a secção da modalidade escolhida (idempotente) e cria o
      // escalão nessa secção. Quem só faz futsal nunca sai do comportamento base.
      const resSeccao = await garantirSeccaoParaModalidade(modalidade);
      if (!resSeccao.sucesso) {
        setErro(resSeccao.erro);
        return;
      }
      const res = await criarEscalao({ nome: limpo, seccaoId: resSeccao.dados.seccaoId });
      if (res.sucesso) {
        setEscaloes((atual) => [...atual, res.dados]);
        setNome("");
        toast.success(`Escalão "${res.dados.nome}" criado`);
      } else {
        setErro(res.erro);
      }
    });
  }

  function remover(id: string) {
    startTransition(async () => {
      const res = await apagarEscalao(id);
      if (res.sucesso) {
        setEscaloes((atual) => atual.filter((e) => e.id !== id));
      } else {
        toast.error(res.erro);
      }
    });
  }

  const temEscaloes = escaloes.length > 0;

  return (
    <div className="space-y-5">
      <CabecalhoPasso
        titulo="Escalões do clube"
        descricao="Cria pelo menos um escalão (ex: Seniores, Juniores, Sub-13). Podes gerir tudo depois em Definições."
      />

      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

      {/* Modalidade do escalão (§8.1.1) — o escalão é criado na secção escolhida. */}
      <div className="space-y-1.5">
        <Label>Modalidade</Label>
        <div className="grid grid-cols-2 gap-2">
          {MODALIDADES.map((m) => {
            const ativo = modalidade === m.valor;
            return (
              <button
                key={m.valor}
                type="button"
                onClick={() => setModalidade(m.valor)}
                aria-pressed={ativo}
                className={cn(
                  "flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-4 py-2 text-corpo font-medium transition-colors",
                  ativo
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-cinza-200 text-cinza-600 hover:bg-cinza-50",
                )}
              >
                <span aria-hidden>{m.emoji}</span>
                {m.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="novoEscalao">Nome do escalão</Label>
          <Input
            id="novoEscalao"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                adicionar();
              }
            }}
            maxLength={50}
            placeholder="ex: Seniores"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={adicionar}
          disabled={pending || !nome.trim()}
        >
          <Plus className="mr-1 h-4 w-4" /> Adicionar
        </Button>
      </div>

      {temEscaloes ? (
        <ul className="divide-y divide-cinza-200 rounded-lg border border-cinza-200">
          {escaloes.map((e) => (
            <li key={e.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-corpo text-cinza-900">{e.nome}</span>
              <button
                type="button"
                onClick={() => remover(e.id)}
                disabled={pending}
                className="flex h-11 w-11 items-center justify-center rounded-md text-cinza-400 transition-colors hover:bg-vermelho-600/5 hover:text-vermelho-600 disabled:opacity-50"
                aria-label={`Remover escalão ${e.nome}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-cinza-200 px-4 py-6 text-center text-corpo-sec text-cinza-500">
          Ainda não há escalões. Adiciona o primeiro acima.
        </p>
      )}

      <RodapePasso
        pending={pending}
        onSaltar={onSaltar}
        onContinuar={onContinuar}
        rotuloContinuar="Continuar"
      />
    </div>
  );
}

// ─── Passo 3: Época ───────────────────────────────────────────────────────────

function PassoEpoca({
  epocasIniciais,
  epocaAtivaIdInicial,
  onConcluir,
  concluindo,
}: {
  epocasIniciais: Epoca[];
  epocaAtivaIdInicial: string | null;
  onConcluir: () => void;
  concluindo: boolean;
}) {
  const [epocas, setEpocas] = useState<Epoca[]>(epocasIniciais);
  const [ativaId, setAtivaId] = useState<string | null>(epocaAtivaIdInicial);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aCriar, setACriar] = useState(epocasIniciais.length === 0);

  const anoAtual = new Date().getFullYear();
  const [nome, setNome] = useState(`${anoAtual}/${anoAtual + 1}`);
  const [dataInicio, setDataInicio] = useState(`${anoAtual}-09-01`);
  const [dataFim, setDataFim] = useState(`${anoAtual + 1}-06-30`);

  const ativa = epocas.find((e) => e.id === ativaId) ?? null;

  function criar() {
    setErro(null);
    startTransition(async () => {
      const res = await criarEpoca({ nome: nome.trim(), dataInicio, dataFim });
      if (!res.sucesso) {
        setErro(res.erro);
        return;
      }
      const nova = res.dados;
      setEpocas((atual) => [nova, ...atual]);
      const resAtiva = await definirEpocaAtiva(nova.id);
      if (resAtiva.sucesso) {
        setAtivaId(nova.id);
        setACriar(false);
        toast.success(`Época ${nova.nome} criada e ativada`);
      } else {
        setErro(resAtiva.erro);
      }
    });
  }

  function ativar(id: string) {
    setErro(null);
    startTransition(async () => {
      const res = await definirEpocaAtiva(id);
      if (res.sucesso) {
        setAtivaId(id);
        toast.success("Época ativada");
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <div className="space-y-5">
      <CabecalhoPasso
        titulo="Época ativa"
        descricao="A época enquadra atletas, treinos e jogos. Confirma a ativa ou cria a primeira."
      />

      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

      {ativa && !aCriar && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Check className="h-5 w-5" />
          </span>
          <div>
            <p className="text-corpo font-semibold text-cinza-900">Época {ativa.nome}</p>
            <p className="text-legenda text-cinza-500">É a época ativa.</p>
          </div>
        </div>
      )}

      {/* Outras épocas para ativar */}
      {epocas.length > 0 && !aCriar && (
        <ul className="space-y-1.5">
          {epocas
            .filter((e) => e.id !== ativaId)
            .map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-lg border border-cinza-200 px-4 py-2.5"
              >
                <span className="text-corpo text-cinza-900">{e.nome}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => ativar(e.id)}
                  disabled={pending}
                >
                  Tornar ativa
                </Button>
              </li>
            ))}
        </ul>
      )}

      {aCriar ? (
        <div className="space-y-4 rounded-lg border border-cinza-200 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="epocaNome">Nome da época</Label>
            <Input
              id="epocaNome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={20}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="epocaInicio">Início</Label>
              <Input
                id="epocaInicio"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="epocaFim">Fim</Label>
              <Input
                id="epocaFim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={criar} disabled={pending || !nome.trim()}>
              {pending ? "A criar…" : "Criar e ativar época"}
            </Button>
            {epocas.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setACriar(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setACriar(true)}>
          <Plus className="mr-1 h-4 w-4" /> Criar nova época
        </Button>
      )}

      <div className="flex items-center justify-between border-t border-cinza-200 pt-4">
        <button
          type="button"
          onClick={onConcluir}
          disabled={pending || concluindo}
          className="text-corpo-sec font-medium text-cinza-500 transition-colors hover:text-cinza-900 disabled:opacity-50"
        >
          Saltar por agora
        </button>
        <Button type="button" onClick={onConcluir} disabled={pending || concluindo}>
          {concluindo ? "A concluir…" : "Começar a usar"}
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Auxiliares de UI ─────────────────────────────────────────────────────────

function CabecalhoPasso({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div>
      <h2 className="text-[18px] font-bold text-cinza-900">{titulo}</h2>
      <p className="mt-1 text-corpo-sec text-cinza-600">{descricao}</p>
    </div>
  );
}

function RodapePasso({
  pending,
  onSaltar,
  onContinuar,
  rotuloContinuar = "Continuar",
}: {
  pending: boolean;
  onSaltar: () => void;
  onContinuar: () => void;
  rotuloContinuar?: string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-cinza-200 pt-4">
      <button
        type="button"
        onClick={onSaltar}
        disabled={pending}
        className="text-corpo-sec font-medium text-cinza-500 transition-colors hover:text-cinza-900 disabled:opacity-50"
      >
        Saltar
      </button>
      <Button type="button" onClick={onContinuar} disabled={pending}>
        {pending ? "A guardar…" : rotuloContinuar}
        <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}
