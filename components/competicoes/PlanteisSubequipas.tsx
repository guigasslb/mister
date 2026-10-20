"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, TriangleAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  copiarPlanteisCompeticao,
  definirPlantelEquipaCompeticao,
} from "@/lib/actions/competicoes";
import { outrasSubequipasDoAtleta, type PlantelSubequipa } from "@/lib/subequipas-ui";

/** Atleta do escalão/época da competição (candidato ao plantel). */
export type AtletaEscalaoPlantel = { id: string; nome: string; numero: number | null };

/** Plantel atual de uma subequipa própria (§23.11.5 `obterPlantelEquipaCompeticao`). */
export type PlantelAtual = { id: string; nome: string; atletas: { atletaId: string; nome: string }[] };

/**
 * Gestão do plantel de uma subequipa nesta competição (§23.11.3 regra 2). Um
 * atleta pode estar em várias subequipas: mostra-se aviso, sem bloquear.
 */
export function PlantelSubequipaDialog({
  equipa,
  planteis,
  atletasEscalao,
}: {
  equipa: PlantelAtual;
  planteis: PlantelAtual[];
  atletasEscalao: AtletaEscalaoPlantel[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const idsIniciais = useMemo(() => equipa.atletas.map((a) => a.atletaId), [equipa.atletas]);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(idsIniciais));

  const refsPlanteis: PlantelSubequipa[] = useMemo(
    () =>
      planteis.map((p) => ({ id: p.id, nome: p.nome, atletaIds: p.atletas.map((a) => a.atletaId) })),
    [planteis],
  );

  // Atletas que já estão no plantel mas saíram do escalão (histórico — §23.11.4):
  // mantêm-se listados (e no plantel) até serem desmarcados.
  const idsEscalao = new Set(atletasEscalao.map((a) => a.id));
  const historicos = equipa.atletas
    .filter((a) => !idsEscalao.has(a.atletaId))
    .map((a) => ({ id: a.atletaId, nome: a.nome, numero: null, historico: true }));
  const linhas = [...atletasEscalao.map((a) => ({ ...a, historico: false })), ...historicos];

  function abrir(estado: boolean) {
    if (estado) setSelecionados(new Set(idsIniciais));
    setAberto(estado);
  }

  function alternar(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function guardar() {
    startTransition(async () => {
      const res = await definirPlantelEquipaCompeticao(equipa.id, [...selecionados]);
      if (!res.sucesso) {
        toast.error(res.erro);
        return;
      }
      if (res.dados.length > 0) {
        toast.warning(
          `Plantel guardado. Também noutra equipa: ${res.dados
            .map((a) => `${a.nome} (${a.tambemEm.join(", ")})`)
            .join("; ")}`,
        );
      } else {
        toast.success("Plantel guardado");
      }
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="min-h-[44px] gap-1.5">
          <Users className="h-4 w-4" />
          Plantel ({equipa.atletas.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plantel de «{equipa.nome}»</DialogTitle>
          <DialogDescription>
            Atletas desta equipa nesta competição. Sem plantel, a convocatória mostra todo o
            escalão.
          </DialogDescription>
        </DialogHeader>

        {linhas.length === 0 ? (
          <p className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
            Não há atletas neste escalão nesta época.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {linhas.map((a) => {
              const outras = selecionados.has(a.id)
                ? outrasSubequipasDoAtleta(a.id, equipa.id, refsPlanteis)
                : [];
              return (
                <li
                  key={a.id}
                  className="flex min-h-[44px] items-center gap-3 rounded-md border border-cinza-200 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    id={`plantel-${equipa.id}-${a.id}`}
                    checked={selecionados.has(a.id)}
                    onChange={() => alternar(a.id)}
                    className="h-5 w-5 accent-primary"
                  />
                  <label
                    htmlFor={`plantel-${equipa.id}-${a.id}`}
                    className="min-w-0 flex-1 text-corpo text-cinza-900"
                  >
                    {a.numero != null && <span className="mr-1 text-cinza-400">#{a.numero}</span>}
                    {a.nome}
                    {a.historico && (
                      <span className="ml-1.5 text-legenda text-cinza-500">(já não está no escalão)</span>
                    )}
                    {outras.length > 0 && (
                      <span className="mt-0.5 flex items-center gap-1 text-legenda text-ambar-600">
                        <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0" />
                        Este atleta está também no plantel de {outras.join(", ")}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <p className="mr-auto self-center text-corpo-sec text-cinza-600">
            {selecionados.size} atleta(s)
          </p>
          <Button type="button" variant="outline" onClick={() => abrir(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={pending}>
            {pending ? "A guardar…" : "Guardar plantel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * «Copiar plantéis de outra competição» (§23.11.3 regra 3): correspondência das
 * subequipas por nome; aditivo e idempotente.
 */
export function CopiarPlanteisDialog({
  competicaoId,
  competicoesOrigem,
}: {
  competicaoId: string;
  competicoesOrigem: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [origemId, setOrigemId] = useState("");

  function copiar() {
    if (!origemId) return;
    startTransition(async () => {
      const res = await copiarPlanteisCompeticao(competicaoId, origemId);
      if (!res.sucesso) {
        toast.error(res.erro);
        return;
      }
      const { subequipas, atletasCopiados, atletasIgnorados } = res.dados;
      if (subequipas === 0) {
        toast.warning("Nenhuma equipa com o mesmo nome na competição escolhida.");
      } else {
        toast.success(
          `${atletasCopiados} atleta(s) copiado(s) para ${subequipas} equipa(s)` +
            (atletasIgnorados > 0
              ? ` · ${atletasIgnorados} ignorado(s) (sem inscrição ativa no escalão)`
              : ""),
        );
      }
      setAberto(false);
      setOrigemId("");
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-[44px] gap-1.5">
          <Copy className="h-4 w-4" />
          Copiar plantéis de outra competição
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copiar plantéis</DialogTitle>
          <DialogDescription>
            Os plantéis são copiados entre equipas com o mesmo nome. Os atletas já presentes
            mantêm-se; nada é removido.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="origem-planteis">Competição de origem</Label>
          <Select value={origemId} onValueChange={setOrigemId}>
            <SelectTrigger id="origem-planteis">
              <SelectValue placeholder="Escolhe a competição" />
            </SelectTrigger>
            <SelectContent>
              {competicoesOrigem.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={copiar} disabled={pending || !origemId}>
            {pending ? "A copiar…" : "Copiar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
