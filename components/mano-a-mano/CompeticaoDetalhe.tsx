"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BarChart3,
  CheckCircle2,
  Archive,
  Trash2,
  Swords,
  Wand2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  concluirCompeticaoManoMano,
  arquivarCompeticaoManoMano,
  apagarCompeticaoManoMano,
  gerarFixturesManoMano,
  gerarBracketManoMano,
  reabrirDuelo,
  type CompeticaoManoManoDetalhe as CompeticaoDetalheTipo,
  type MatchManoManoComParticipantes,
} from "@/lib/actions/mano-a-mano";
import {
  LABEL_TIPO_MANO_MANO,
  LABEL_FORMATO_TORNEIO_MANO_MANO,
  LABEL_FORMATO_DUELO,
  LABEL_ESTADO_MANO_MANO,
} from "@/lib/schemas/mano-a-mano";
import {
  nomeParticipanteMatch,
  LABEL_ESTADO_MATCH,
  VARIANTE_ESTADO_MATCH,
} from "@/lib/mano-a-mano-ui";
import { RegistarResultadoDialog } from "@/components/mano-a-mano/RegistarResultadoDialog";
import type { EstadoManoMano, EstadoMatch } from "@prisma/client";

const VARIANTE_ESTADO_COMP: Record<
  EstadoManoMano,
  "default" | "secondary" | "outline"
> = {
  ATIVA: "default",
  CONCLUIDA: "secondary",
  ARQUIVADA: "outline",
};

export function CompeticaoDetalhe({
  competicao,
}: {
  competicao: CompeticaoDetalheTipo;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [duasMaos, setDuasMaos] = useState(false);

  const eLiga = competicao.tipo === "LIGA_ANUAL";
  const eBracket =
    competicao.tipo === "TORNEIO" && competicao.formatoTorneio === "ELIMINATORIO";
  const eRoundRobin =
    competicao.tipo === "TORNEIO" && competicao.formatoTorneio === "ROUND_ROBIN";

  const matches = competicao.matches;
  const temDuelos = matches.length > 0;
  const estado = competicao.estado as EstadoManoMano;

  // Duelos agrupados por ronda (jornada / ronda de quadro), ordenados.
  const porRonda = useMemo(() => {
    const mapa = new Map<number, MatchManoManoComParticipantes[]>();
    for (const m of matches) {
      const r = m.ronda ?? 0;
      const lista = mapa.get(r) ?? [];
      lista.push(m);
      mapa.set(r, lista);
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);

  function comAcao(fn: () => Promise<{ sucesso: boolean; erro?: string }>, msg: string, redir?: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.sucesso) {
        toast.success(msg);
        if (redir) router.push(redir);
        router.refresh();
      } else {
        toast.error(res.erro ?? "Ocorreu um erro");
      }
    });
  }

  function gerar() {
    comAcao(
      () =>
        eBracket
          ? gerarBracketManoMano(competicao.id)
          : gerarFixturesManoMano(competicao.id, { duasMaos }),
      eBracket ? "Quadro gerado" : "Duelos gerados",
    );
  }

  const totalRondas = porRonda.length;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/5">
            <Swords className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1">
            <h1>{competicao.nome}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={VARIANTE_ESTADO_COMP[estado]}>
                {LABEL_ESTADO_MANO_MANO[estado]}
              </Badge>
              <Badge variant="secondary">{LABEL_TIPO_MANO_MANO[competicao.tipo]}</Badge>
              {competicao.tipo === "TORNEIO" && competicao.formatoTorneio && (
                <Badge variant="outline">
                  {LABEL_FORMATO_TORNEIO_MANO_MANO[competicao.formatoTorneio]}
                </Badge>
              )}
              {competicao.escalao && (
                <span className="text-corpo-sec text-cinza-600">{competicao.escalao.nome}</span>
              )}
            </div>
            <p className="text-legenda text-cinza-500">
              {LABEL_FORMATO_DUELO[competicao.formatoDuelo]} ·{" "}
              {competicao._count.participantes} participante(s)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/mano-a-mano/${competicao.id}/classificacao`}>
              <BarChart3 className="h-4 w-4" />
              Ver classificação
            </Link>
          </Button>
          {estado === "ATIVA" && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                comAcao(() => concluirCompeticaoManoMano(competicao.id), "Competição concluída")
              }
            >
              <CheckCircle2 className="h-4 w-4" />
              Concluir
            </Button>
          )}
          {estado !== "ARQUIVADA" && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                comAcao(() => arquivarCompeticaoManoMano(competicao.id), "Competição arquivada")
              }
            >
              <Archive className="h-4 w-4" />
              Arquivar
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={pending}>
                <Trash2 className="h-4 w-4 text-vermelho-600" />
                Apagar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar «{competicao.nome}»?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação é permanente. Só é possível apagar competições sem duelos já
                  realizados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    comAcao(
                      () => apagarCompeticaoManoMano(competicao.id),
                      "Competição apagada",
                      "/mano-a-mano",
                    )
                  }
                  className="bg-vermelho-600 hover:bg-vermelho-600/90 text-white"
                >
                  Apagar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Geração de duelos / quadro (quando ainda não existem) */}
      {!temDuelos ? (
        <div className="space-y-4 rounded-md border border-cinza-200 bg-white p-4 shadow-card sm:p-6">
          <div className="flex items-center gap-2 text-cinza-900">
            <Wand2 className="h-5 w-5 text-primary" />
            <h2 className="text-titulo-seccao">
              {eBracket ? "Gerar quadro eliminatório" : "Gerar duelos"}
            </h2>
          </div>
          <p className="text-corpo-sec text-cinza-600">
            {competicao._count.participantes < 2
              ? "Adiciona pelo menos 2 participantes antes de gerar os duelos."
              : eBracket
                ? "Gera o quadro eliminatório a partir dos participantes (por seed)."
                : eLiga
                  ? "Gera todos os duelos e distribui-os pelas próximas sessões de treino."
                  : "Gera todos os duelos (todos-contra-todos)."}
          </p>
          {(eLiga || eRoundRobin) && competicao._count.participantes >= 2 && (
            <label className="flex min-h-[44px] w-fit cursor-pointer items-center gap-3 rounded-md border border-cinza-200 px-3 py-2">
              <Switch checked={duasMaos} onCheckedChange={setDuasMaos} />
              <span className="text-corpo-sec text-cinza-900">
                Duas mãos (ida e volta)
              </span>
            </label>
          )}
          <Button
            onClick={gerar}
            disabled={pending || competicao._count.participantes < 2}
          >
            <Wand2 className="h-4 w-4" />
            {eBracket ? "Gerar quadro" : "Gerar duelos"}
          </Button>
        </div>
      ) : eBracket ? (
        <BracketVista
          porRonda={porRonda}
          totalRondas={totalRondas}
          pending={pending}
          formatoDuelo={competicao.formatoDuelo}
          golosParaVencer={competicao.golosParaVencer}
        />
      ) : (
        <div className="space-y-5">
          {porRonda.map(([ronda, lista]) => (
            <section key={ronda} className="space-y-2">
              <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                {eLiga ? `Jornada ${ronda}` : `Ronda ${ronda}`}
              </p>
              <ul className="space-y-2">
                {lista.map((m) => (
                  <li key={m.id}>
                    <LinhaDuelo
                      match={m}
                      formatoDuelo={competicao.formatoDuelo}
                      golosParaVencer={competicao.golosParaVencer}
                      pending={pending}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Linha de um duelo (liga / round-robin)
// ─────────────────────────────────────────────

function LinhaDuelo({
  match,
  formatoDuelo,
  golosParaVencer,
  pending,
}: {
  match: MatchManoManoComParticipantes;
  formatoDuelo: CompeticaoDetalheTipo["formatoDuelo"];
  golosParaVencer: number;
  pending: boolean;
}) {
  const router = useRouter();
  const [pendingLocal, startTransition] = useTransition();
  const nomeA = nomeParticipanteMatch(match.participanteA);
  const nomeB = nomeParticipanteMatch(match.participanteB);
  const estado = match.estado as EstadoMatch;
  const realizado = estado === "REALIZADO";
  const temAmbos = !!match.participanteAId && !!match.participanteBId;
  const vencedorA = match.vencedorParticipanteId === match.participanteAId;
  const vencedorB = match.vencedorParticipanteId === match.participanteBId;

  function reabrir() {
    startTransition(async () => {
      const res = await reabrirDuelo(match.id);
      if (res.sucesso) {
        toast.success("Duelo reaberto");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-3 shadow-card">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-right text-corpo text-cinza-900",
              vencedorA && "font-semibold text-primary",
            )}
          >
            {nomeA}
          </span>
          <span className="flex-shrink-0 rounded bg-cinza-50 px-2 py-0.5 text-corpo font-bold tabular-nums text-cinza-900">
            {realizado ? `${match.golosA ?? 0} – ${match.golosB ?? 0}` : "vs"}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-corpo text-cinza-900",
              vencedorB && "font-semibold text-primary",
            )}
          >
            {nomeB}
          </span>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <Badge variant={VARIANTE_ESTADO_MATCH[estado]}>{LABEL_ESTADO_MATCH[estado]}</Badge>
        {!realizado && temAmbos && estado !== "ANULADO" && (
          <RegistarResultadoDialog
            matchId={match.id}
            nomeA={nomeA}
            nomeB={nomeB}
            formatoDuelo={formatoDuelo}
            golosParaVencer={golosParaVencer}
            trigger={
              <Button size="sm" disabled={pending || pendingLocal}>
                Registar
              </Button>
            }
          />
        )}
        {realizado && (
          <Button
            variant="ghost"
            size="icon"
            onClick={reabrir}
            disabled={pending || pendingLocal}
            aria-label="Reabrir duelo"
            title="Reabrir duelo"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Vista de quadro eliminatório (bracket)
// ─────────────────────────────────────────────

function BracketVista({
  porRonda,
  totalRondas,
  pending,
  formatoDuelo,
  golosParaVencer,
}: {
  porRonda: [number, MatchManoManoComParticipantes[]][];
  totalRondas: number;
  pending: boolean;
  formatoDuelo: CompeticaoDetalheTipo["formatoDuelo"];
  golosParaVencer: number;
}) {
  const nomeRonda = (ronda: number): string => {
    const faltam = totalRondas - ronda;
    if (faltam === 0) return "Final";
    if (faltam === 1) return "Meias-finais";
    if (faltam === 2) return "Quartos de final";
    return `Ronda ${ronda}`;
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4">
        {porRonda.map(([ronda, lista]) => (
          <div key={ronda} className="flex min-w-[220px] flex-col gap-3">
            <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
              {nomeRonda(ronda)}
            </p>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {lista.map((m) => (
                <CartaoBracket
                  key={m.id}
                  match={m}
                  pending={pending}
                  formatoDuelo={formatoDuelo}
                  golosParaVencer={golosParaVencer}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CartaoBracket({
  match,
  pending,
  formatoDuelo,
  golosParaVencer,
}: {
  match: MatchManoManoComParticipantes;
  pending: boolean;
  formatoDuelo: CompeticaoDetalheTipo["formatoDuelo"];
  golosParaVencer: number;
}) {
  const nomeA = nomeParticipanteMatch(match.participanteA);
  const nomeB = nomeParticipanteMatch(match.participanteB);
  const realizado = match.estado === "REALIZADO";
  const temAmbos = !!match.participanteAId && !!match.participanteBId;
  const vencedorA = match.vencedorParticipanteId === match.participanteAId;
  const vencedorB = match.vencedorParticipanteId === match.participanteBId;

  return (
    <div className="rounded-md border border-cinza-200 bg-white shadow-card">
      <LadoBracket nome={nomeA} golos={match.golosA} vencedor={vencedorA} realizado={realizado} />
      <div className="border-t border-cinza-100" />
      <LadoBracket nome={nomeB} golos={match.golosB} vencedor={vencedorB} realizado={realizado} />
      {!realizado && temAmbos && match.estado !== "ANULADO" && (
        <div className="border-t border-cinza-100 p-1.5">
          <RegistarResultadoDialog
            matchId={match.id}
            nomeA={nomeA}
            nomeB={nomeB}
            formatoDuelo={formatoDuelo}
            golosParaVencer={golosParaVencer}
            trigger={
              <Button size="sm" variant="ghost" disabled={pending} className="w-full">
                Registar resultado
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}

function LadoBracket({
  nome,
  golos,
  vencedor,
  realizado,
}: {
  nome: string;
  golos: number | null;
  vencedor: boolean;
  realizado: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-2 text-corpo-sec",
        vencedor ? "font-semibold text-primary" : "text-cinza-900",
      )}
    >
      <span className="min-w-0 truncate">{nome}</span>
      <span className="flex-shrink-0 tabular-nums text-cinza-500">
        {realizado ? (golos ?? 0) : "—"}
      </span>
    </div>
  );
}
