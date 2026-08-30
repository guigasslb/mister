"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Users,
  CalendarPlus,
  MessageSquare,
  Check,
  Plus,
  Trash2,
  ChevronDown,
  Download,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarAtleta } from "@/lib/actions/atletas";
import { criarSessaoDeTemplate, instalarTemplatesArranque } from "@/lib/actions/templatesSessao";
import { criarJogo } from "@/lib/actions/jogos";
import { cn } from "@/lib/utils";
import { wallClockLisbonToInstant } from "@/lib/utils-datas";

/** Estado da checklist (§8.1) guardado localmente por browser. */
const CHAVE_PASSOS = "fc:vitoria-rapida:passos";

type ChavePasso = "plantel" | "treino" | "convocatoria";
type Passos = Record<ChavePasso, boolean>;
const PASSOS_INICIAIS: Passos = { plantel: false, treino: false, convocatoria: false };

export interface EscalaoOpcao {
  id: string;
  nome: string;
}
export interface ModeloOpcao {
  id: string;
  nome: string;
}
export interface JogoOpcao {
  id: string;
  rotulo: string;
}

interface Props {
  escaloes: EscalaoOpcao[];
  modelos: ModeloOpcao[];
  jogos: JogoOpcao[];
}

const CLASSE_SELECT =
  "flex h-11 w-full items-center rounded-md border border-cinza-200 bg-white px-3 text-corpo text-cinza-900 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function VitoriaRapida({ escaloes, modelos, jogos }: Props) {
  const [passos, setPassos] = useState<Passos>(PASSOS_INICIAIS);
  const [aberto, setAberto] = useState<ChavePasso>("plantel");
  const [montado, setMontado] = useState(false);

  // Carrega o estado guardado (localStorage só existe no cliente).
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CHAVE_PASSOS);
      if (guardado) {
        const dados = JSON.parse(guardado) as Partial<Passos>;
        setPassos({ ...PASSOS_INICIAIS, ...dados });
      }
    } catch {
      /* ignorar */
    }
    setMontado(true);
  }, []);

  function marcar(chave: ChavePasso, feito = true) {
    setPassos((atual) => {
      const proximo = { ...atual, [chave]: feito };
      try {
        window.localStorage.setItem(CHAVE_PASSOS, JSON.stringify(proximo));
      } catch {
        /* ignorar */
      }
      return proximo;
    });
  }

  const totalFeitos = Object.values(passos).filter(Boolean).length;
  const semEscaloes = escaloes.length === 0;

  return (
    <div className="space-y-6">
      {/* Progresso global */}
      <div className="card-base p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-corpo font-semibold text-cinza-900">
            {totalFeitos === 3 ? "Tudo pronto! 🎉" : `${totalFeitos} de 3 passos concluídos`}
          </p>
          <span className="text-legenda text-cinza-500">{montado ? "" : "…"}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-cinza-100">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(totalFeitos / 3) * 100}%` }}
          />
        </div>
      </div>

      {semEscaloes && (
        <div className="rounded-lg border border-ambar-500/40 bg-ambar-500/10 px-4 py-3 text-corpo-sec text-cinza-900">
          Ainda não tens escalões. Cria pelo menos um em{" "}
          <Link href="/onboarding" className="font-medium underline">
            setup do clube
          </Link>{" "}
          para poderes adicionar atletas e treinos.
        </div>
      )}

      <CartaoPasso
        numero={1}
        titulo="Adicionar plantel em massa"
        descricao="Nome, número e escalão de cada atleta. Os detalhes preenches depois."
        icon={Users}
        feito={passos.plantel}
        aberto={aberto === "plantel"}
        onToggle={() => setAberto("plantel")}
      >
        <PassoPlantel
          escaloes={escaloes}
          onConcluido={() => {
            marcar("plantel");
            setAberto("treino");
          }}
        />
      </CartaoPasso>

      <CartaoPasso
        numero={2}
        titulo="Primeiro treino a partir de um template"
        descricao="Escolhe um template curado, a data e o escalão."
        icon={CalendarPlus}
        feito={passos.treino}
        aberto={aberto === "treino"}
        onToggle={() => setAberto("treino")}
      >
        <PassoTreino
          escaloes={escaloes}
          modelos={modelos}
          onConcluido={() => {
            marcar("treino");
            setAberto("convocatoria");
          }}
        />
      </CartaoPasso>

      <CartaoPasso
        numero={3}
        titulo="Primeira convocatória no WhatsApp"
        descricao="Escolhe (ou cria) um jogo e gera o texto para partilhar."
        icon={MessageSquare}
        feito={passos.convocatoria}
        aberto={aberto === "convocatoria"}
        onToggle={() => setAberto("convocatoria")}
      >
        <PassoConvocatoria
          escaloes={escaloes}
          jogos={jogos}
          onGerar={() => marcar("convocatoria")}
        />
      </CartaoPasso>

      {totalFeitos === 3 && (
        <div className="flex justify-end">
          <Button asChild>
            <Link href="/dashboard">
              Ir para o painel <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Cartão de passo (colapsável) ─────────────────────────────────────────────

function CartaoPasso({
  numero,
  titulo,
  descricao,
  icon: Icon,
  feito,
  aberto,
  onToggle,
  children,
}: {
  numero: number;
  titulo: string;
  descricao: string;
  icon: typeof Users;
  feito: boolean;
  aberto: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card-base overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left"
        aria-expanded={aberto}
      >
        <span
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
            feito ? "bg-verde-600/10 text-verde-600" : "bg-primary/10 text-primary",
          )}
        >
          {feito ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-corpo font-semibold text-cinza-900">
            <span className="text-cinza-400">{numero}.</span> {titulo}
            {feito && (
              <span className="rounded-full bg-verde-600/10 px-2 py-0.5 text-legenda font-medium text-verde-600">
                Feito
              </span>
            )}
          </p>
          <p className="truncate text-legenda text-cinza-500">{descricao}</p>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 flex-shrink-0 text-cinza-400 transition-transform",
            aberto && "rotate-180",
          )}
        />
      </button>
      {aberto && <div className="border-t border-cinza-200 p-4">{children}</div>}
    </div>
  );
}

// ─── Passo 1: Plantel em massa ────────────────────────────────────────────────

interface LinhaAtleta {
  key: string;
  nome: string;
  numero: string;
  escalaoId: string;
}

let contadorLinhas = 0;
function novaLinha(escalaoId: string): LinhaAtleta {
  contadorLinhas += 1;
  return { key: `l${contadorLinhas}`, nome: "", numero: "", escalaoId };
}

function PassoPlantel({
  escaloes,
  onConcluido,
}: {
  escaloes: EscalaoOpcao[];
  onConcluido: () => void;
}) {
  const escalaoInicial = escaloes[0]?.id ?? "";
  const [linhas, setLinhas] = useState<LinhaAtleta[]>(() => [
    novaLinha(escalaoInicial),
    novaLinha(escalaoInicial),
    novaLinha(escalaoInicial),
  ]);
  const [pending, startTransition] = useTransition();
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function atualizar(key: string, campo: keyof Omit<LinhaAtleta, "key">, valor: string) {
    setLinhas((atual) =>
      atual.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)),
    );
  }

  function adicionarLinha() {
    setLinhas((atual) => [...atual, novaLinha(escalaoInicial)]);
  }

  function removerLinha(key: string) {
    setLinhas((atual) => (atual.length > 1 ? atual.filter((l) => l.key !== key) : atual));
  }

  function submeter() {
    const preenchidas = linhas.filter((l) => l.nome.trim() && l.escalaoId);
    if (preenchidas.length === 0) {
      setErro("Preenche pelo menos um atleta (nome e escalão).");
      return;
    }
    setErro(null);
    startTransition(async () => {
      let feitos = 0;
      const falhados: string[] = [];
      for (const l of preenchidas) {
        const numeroTexto = l.numero.trim();
        const numero = numeroTexto ? Number(numeroTexto) : undefined;
        const res = await criarAtleta({
          nome: l.nome.trim(),
          posicoes: [],
          participacaoInicial: {
            escalaoId: l.escalaoId,
            ...(numero !== undefined && Number.isFinite(numero) ? { numero } : {}),
            tipo: "PRINCIPAL",
          },
        });
        if (res.sucesso) feitos += 1;
        else falhados.push(l.nome.trim());
        setProgresso({ feitos, total: preenchidas.length });
      }
      if (feitos > 0) {
        toast.success(`${feitos} atleta(s) criado(s)`);
        if (falhados.length === 0) onConcluido();
      }
      if (falhados.length > 0) {
        setErro(`Não foi possível criar: ${falhados.join(", ")}.`);
      }
    });
  }

  const escaloesVazio = escaloes.length === 0;

  return (
    <div className="space-y-4">
      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-corpo">
          <thead>
            <tr className="text-left text-legenda uppercase tracking-wide text-cinza-400">
              <th className="pb-2 pr-2 font-semibold">Nome</th>
              <th className="w-24 pb-2 pr-2 font-semibold">Número</th>
              <th className="pb-2 pr-2 font-semibold">Escalão</th>
              <th className="w-10 pb-2" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.key}>
                <td className="py-1 pr-2">
                  <Input
                    value={l.nome}
                    onChange={(e) => atualizar(l.key, "nome", e.target.value)}
                    placeholder="Nome do atleta"
                    aria-label="Nome do atleta"
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    value={l.numero}
                    onChange={(e) =>
                      atualizar(l.key, "numero", e.target.value.replace(/\D/g, "").slice(0, 3))
                    }
                    inputMode="numeric"
                    placeholder="Nº"
                    aria-label="Número"
                  />
                </td>
                <td className="py-1 pr-2">
                  <select
                    value={l.escalaoId}
                    onChange={(e) => atualizar(l.key, "escalaoId", e.target.value)}
                    className={CLASSE_SELECT}
                    aria-label="Escalão"
                    disabled={escaloesVazio}
                  >
                    {escaloesVazio && <option value="">Sem escalões</option>}
                    {escaloes.map((esc) => (
                      <option key={esc.id} value={esc.id}>
                        {esc.nome}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1">
                  <button
                    type="button"
                    onClick={() => removerLinha(l.key)}
                    disabled={linhas.length === 1}
                    className="flex h-11 w-11 items-center justify-center rounded-md text-cinza-400 transition-colors hover:bg-vermelho-600/5 hover:text-vermelho-600 disabled:opacity-30"
                    aria-label="Remover linha"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={adicionarLinha} disabled={pending}>
          <Plus className="mr-1 h-4 w-4" /> Linha
        </Button>
        <div className="flex items-center gap-3">
          {progresso && (
            <span className="text-corpo-sec text-cinza-500">
              {progresso.feitos} de {progresso.total} criados
            </span>
          )}
          <Button type="button" onClick={submeter} disabled={pending || escaloesVazio}>
            {pending ? "A criar…" : "Criar atletas"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Passo 2: Treino a partir de template ─────────────────────────────────────

function PassoTreino({
  escaloes,
  modelos,
  onConcluido,
}: {
  escaloes: EscalaoOpcao[];
  modelos: ModeloOpcao[];
  onConcluido: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [modeloId, setModeloId] = useState(modelos[0]?.id ?? "");
  const [escalaoId, setEscalaoId] = useState(escaloes[0]?.id ?? "");
  const [data, setData] = useState("");

  function instalar() {
    setErro(null);
    startTransition(async () => {
      const res = await instalarTemplatesArranque();
      if (res.sucesso) {
        toast.success("Templates instalados");
        router.refresh();
      } else {
        setErro(res.erro);
      }
    });
  }

  function criar() {
    if (!modeloId || !escalaoId || !data) {
      setErro("Escolhe o template, o escalão e a data.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const res = await criarSessaoDeTemplate({
        modeloSessaoId: modeloId,
        escalaoId,
        data: wallClockLisbonToInstant(data).toISOString(),
      });
      if (res.sucesso) {
        toast.success("Treino criado");
        onConcluido();
      } else {
        setErro(res.erro);
      }
    });
  }

  if (modelos.length === 0) {
    return (
      <div className="space-y-4">
        {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}
        <p className="text-corpo-sec text-cinza-600">
          Ainda não há templates de sessão. Instala a biblioteca curada de arranque
          para começares com sessões prontas a usar.
        </p>
        <Button type="button" onClick={instalar} disabled={pending}>
          <Download className="mr-1 h-4 w-4" />
          {pending ? "A instalar…" : "Instalar templates de arranque"}
        </Button>
      </div>
    );
  }

  const escaloesVazio = escaloes.length === 0;

  return (
    <div className="space-y-4">
      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="modelo">Template</Label>
          <select
            id="modelo"
            value={modeloId}
            onChange={(e) => setModeloId(e.target.value)}
            className={CLASSE_SELECT}
          >
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="escalaoTreino">Escalão</Label>
          <select
            id="escalaoTreino"
            value={escalaoId}
            onChange={(e) => setEscalaoId(e.target.value)}
            className={CLASSE_SELECT}
            disabled={escaloesVazio}
          >
            {escaloesVazio && <option value="">Sem escalões</option>}
            {escaloes.map((esc) => (
              <option key={esc.id} value={esc.id}>
                {esc.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dataTreino">Data e hora</Label>
        <Input
          id="dataTreino"
          type="datetime-local"
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={criar} disabled={pending || escaloesVazio}>
          {pending ? "A criar…" : "Criar treino"}
        </Button>
      </div>
    </div>
  );
}

// ─── Passo 3: Convocatória ────────────────────────────────────────────────────

function PassoConvocatoria({
  escaloes,
  jogos,
  onGerar,
}: {
  escaloes: EscalaoOpcao[];
  jogos: JogoOpcao[];
  onGerar: () => void;
}) {
  const [lista, setLista] = useState<JogoOpcao[]>(jogos);
  const [jogoId, setJogoId] = useState(jogos[0]?.id ?? "");
  const [aCriar, setACriar] = useState(jogos.length === 0);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  // Formulário de criação rápida de jogo.
  const [adversario, setAdversario] = useState("");
  const [data, setData] = useState("");
  const [casaFora, setCasaFora] = useState<"CASA" | "FORA">("CASA");
  const [escalaoId, setEscalaoId] = useState(escaloes[0]?.id ?? "");

  function criarJogoRapido() {
    if (!adversario.trim() || !data || !escalaoId) {
      setErro("Indica o adversário, a data e o escalão.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const res = await criarJogo({
        adversario: adversario.trim(),
        data: wallClockLisbonToInstant(data).toISOString(),
        casaFora,
        escalaoId,
        tipo: "OFICIAL",
      });
      if (res.sucesso) {
        const escalaoNome = escaloes.find((e) => e.id === escalaoId)?.nome ?? "";
        const rotulo = `vs ${adversario.trim()}${escalaoNome ? ` (${escalaoNome})` : ""}`;
        const opcao: JogoOpcao = { id: res.dados.id, rotulo };
        setLista((atual) => [opcao, ...atual]);
        setJogoId(res.dados.id);
        setACriar(false);
        toast.success("Jogo criado");
      } else {
        setErro(res.erro);
      }
    });
  }

  const escaloesVazio = escaloes.length === 0;

  return (
    <div className="space-y-4">
      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

      {!aCriar && lista.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="jogoConv">Jogo</Label>
          <select
            id="jogoConv"
            value={jogoId}
            onChange={(e) => setJogoId(e.target.value)}
            className={CLASSE_SELECT}
          >
            {lista.map((j) => (
              <option key={j.id} value={j.id}>
                {j.rotulo}
              </option>
            ))}
          </select>
        </div>
      )}

      {aCriar ? (
        <div className="space-y-4 rounded-lg border border-cinza-200 p-4">
          <p className="text-corpo-sec font-medium text-cinza-900">Criar jogo rápido</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="adversario">Adversário</Label>
              <Input
                id="adversario"
                value={adversario}
                onChange={(e) => setAdversario(e.target.value)}
                maxLength={100}
                placeholder="ex: SC Braga"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataJogo">Data e hora</Label>
              <Input
                id="dataJogo"
                type="datetime-local"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="casaFora">Local</Label>
              <select
                id="casaFora"
                value={casaFora}
                onChange={(e) => setCasaFora(e.target.value === "FORA" ? "FORA" : "CASA")}
                className={CLASSE_SELECT}
              >
                <option value="CASA">Casa</option>
                <option value="FORA">Fora</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="escalaoJogo">Escalão</Label>
              <select
                id="escalaoJogo"
                value={escalaoId}
                onChange={(e) => setEscalaoId(e.target.value)}
                className={CLASSE_SELECT}
                disabled={escaloesVazio}
              >
                {escaloesVazio && <option value="">Sem escalões</option>}
                {escaloes.map((esc) => (
                  <option key={esc.id} value={esc.id}>
                    {esc.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={criarJogoRapido} disabled={pending || escaloesVazio}>
              {pending ? "A criar…" : "Criar jogo"}
            </Button>
            {lista.length > 0 && (
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
          <Plus className="mr-1 h-4 w-4" /> Criar jogo rápido
        </Button>
      )}

      <div className="flex justify-end border-t border-cinza-200 pt-4">
        {jogoId ? (
          <Button asChild onClick={onGerar}>
            <Link href={`/comunicacoes/gerar?tipo=CONVOCATORIA&jogo=${jogoId}`}>
              <MessageSquare className="mr-1 h-4 w-4" /> Gerar convocatória
            </Link>
          </Button>
        ) : (
          <Button type="button" disabled>
            <MessageSquare className="mr-1 h-4 w-4" /> Gerar convocatória
          </Button>
        )}
      </div>
    </div>
  );
}
