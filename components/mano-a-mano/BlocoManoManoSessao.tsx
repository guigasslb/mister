"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Swords, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { criarDueloAdHoc } from "@/lib/actions/mano-a-mano";
import { LABEL_ESTADO_MATCH, VARIANTE_ESTADO_MATCH } from "@/lib/mano-a-mano-ui";
import { RegistarResultadoDialog } from "@/components/mano-a-mano/RegistarResultadoDialog";
import type { EstadoMatch, FormatoDuelo } from "@prisma/client";

export type DueloSessao = {
  id: string;
  estado: EstadoMatch;
  golosA: number | null;
  golosB: number | null;
  nomeA: string;
  nomeB: string;
  temAmbos: boolean;
  vencedorParticipanteId: string | null;
  participanteAId: string | null;
  participanteBId: string | null;
  formatoDuelo: FormatoDuelo;
  golosParaVencer: number;
};

export type CompeticaoSessao = {
  id: string;
  nome: string;
  formatoDuelo: FormatoDuelo;
  golosParaVencer: number;
  participantes: { id: string; nome: string; atletaId: string | null }[];
};

export function BlocoManoManoSessao({
  sessaoId,
  duelos,
  competicoes,
  presentesAtletaIds,
}: {
  sessaoId: string;
  duelos: DueloSessao[];
  competicoes: CompeticaoSessao[];
  presentesAtletaIds: string[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-subtitulo text-cinza-900">
          <Swords className="h-5 w-5 text-primary" />
          Mano-a-Mano
        </h2>
        <NovoDueloDialog
          sessaoId={sessaoId}
          competicoes={competicoes}
          presentesAtletaIds={presentesAtletaIds}
        />
      </div>

      {duelos.length === 0 ? (
        <p className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
          Sem duelos agendados para esta sessão. Cria um duelo entre dois atletas presentes.
        </p>
      ) : (
        <ul className="space-y-2">
          {duelos.map((d) => (
            <li key={d.id}>
              <LinhaDueloSessao duelo={d} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinhaDueloSessao({ duelo: d }: { duelo: DueloSessao }) {
  const realizado = d.estado === "REALIZADO";
  const vencedorA = d.vencedorParticipanteId === d.participanteAId;
  const vencedorB = d.vencedorParticipanteId === d.participanteBId;

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
            {d.nomeA}
          </span>
          <span className="flex-shrink-0 rounded bg-cinza-50 px-2 py-0.5 text-corpo font-bold tabular-nums text-cinza-900">
            {realizado ? `${d.golosA ?? 0} – ${d.golosB ?? 0}` : "vs"}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-corpo text-cinza-900",
              vencedorB && "font-semibold text-primary",
            )}
          >
            {d.nomeB}
          </span>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <Badge variant={VARIANTE_ESTADO_MATCH[d.estado]}>{LABEL_ESTADO_MATCH[d.estado]}</Badge>
        {!realizado && d.temAmbos && d.estado !== "ANULADO" && (
          <RegistarResultadoDialog
            matchId={d.id}
            nomeA={d.nomeA}
            nomeB={d.nomeB}
            formatoDuelo={d.formatoDuelo}
            golosParaVencer={d.golosParaVencer}
            trigger={<Button size="sm">Registar</Button>}
          />
        )}
      </div>
    </div>
  );
}

function NovoDueloDialog({
  sessaoId,
  competicoes,
  presentesAtletaIds,
}: {
  sessaoId: string;
  competicoes: CompeticaoSessao[];
  presentesAtletaIds: string[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [competicaoId, setCompeticaoId] = useState<string>("");
  const [participanteAId, setParticipanteAId] = useState<string>("");
  const [participanteBId, setParticipanteBId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const presentes = useMemo(() => new Set(presentesAtletaIds), [presentesAtletaIds]);

  const competicao = competicoes.find((c) => c.id === competicaoId);

  // Só participantes que sejam atletas presentes nesta sessão.
  const elegiveis = useMemo(
    () =>
      (competicao?.participantes ?? []).filter(
        (p) => p.atletaId && presentes.has(p.atletaId),
      ),
    [competicao, presentes],
  );

  function repor() {
    setCompeticaoId("");
    setParticipanteAId("");
    setParticipanteBId("");
  }

  function submeter() {
    if (!competicaoId) {
      toast.error("Escolhe a competição.");
      return;
    }
    if (!participanteAId || !participanteBId) {
      toast.error("Escolhe os dois atletas.");
      return;
    }
    if (participanteAId === participanteBId) {
      toast.error("Os dois atletas têm de ser diferentes.");
      return;
    }
    startTransition(async () => {
      const res = await criarDueloAdHoc({
        competicaoId,
        participanteAId,
        participanteBId,
        sessaoId,
      });
      if (res.sucesso) {
        toast.success("Duelo criado");
        setAberto(false);
        repor();
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  if (competicoes.length === 0) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/mano-a-mano/novo">
          <Plus className="h-4 w-4" />
          Nova competição
        </Link>
      </Button>
    );
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) repor();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          Novo duelo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo duelo</DialogTitle>
          <DialogDescription>
            Escolhe a competição e dois atletas presentes nesta sessão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Competição</Label>
            <Select
              value={competicaoId}
              onValueChange={(v) => {
                setCompeticaoId(v);
                setParticipanteAId("");
                setParticipanteBId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleciona" />
              </SelectTrigger>
              <SelectContent>
                {competicoes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {competicao && (
            <>
              {elegiveis.length < 2 ? (
                <p className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-legenda text-cinza-500">
                  Precisas de pelo menos 2 participantes desta competição presentes na sessão.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Atleta A</Label>
                    <Select value={participanteAId} onValueChange={setParticipanteAId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleciona" />
                      </SelectTrigger>
                      <SelectContent>
                        {elegiveis
                          .filter((p) => p.id !== participanteBId)
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Atleta B</Label>
                    <Select value={participanteBId} onValueChange={setParticipanteBId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleciona" />
                      </SelectTrigger>
                      <SelectContent>
                        {elegiveis
                          .filter((p) => p.id !== participanteAId)
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={submeter}
            disabled={pending || !participanteAId || !participanteBId}
            className="min-h-[44px]"
          >
            {pending ? "A criar…" : "Criar duelo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
