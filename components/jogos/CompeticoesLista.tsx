"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Plus, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apagarCompeticao, type CompeticaoComRelacoes } from "@/lib/actions/competicoes";
import { LABEL_FORMATO_COMPETICAO } from "@/lib/schemas/competicao";
import { LABEL_TIPO_JOGO } from "@/lib/schemas/jogo";

type EscalaoBasico = { id: string; nome: string };
type EpocaBasica = { id: string; nome: string; ativa: boolean };

const TODOS = "__todos__";

export function CompeticoesLista({
  competicoes,
  escaloes,
  epocas,
}: {
  competicoes: CompeticaoComRelacoes[];
  escaloes: EscalaoBasico[];
  epocas: EpocaBasica[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filtroEscalao, setFiltroEscalao] = useState<string>(TODOS);

  const nomeEpoca = useMemo(() => {
    const mapa = new Map(epocas.map((e) => [e.id, e.nome]));
    return (id: string) => mapa.get(id) ?? "";
  }, [epocas]);

  const visiveis = useMemo(
    () =>
      filtroEscalao === TODOS
        ? competicoes
        : competicoes.filter((c) => c.escalaoId === filtroEscalao),
    [competicoes, filtroEscalao],
  );

  function apagar(id: string) {
    startTransition(async () => {
      const res = await apagarCompeticao(id);
      if (res.sucesso) {
        toast.success("Competição apagada");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Competições</h1>
          <p className="mt-1 text-corpo-sec text-cinza-600">Provas em disputa nesta época.</p>
        </div>
        <Button asChild>
          <Link href="/jogos/competicoes/nova">
            <Plus className="h-4 w-4" />
            Nova competição
          </Link>
        </Button>
      </div>

      {escaloes.length > 0 && (
        <div className="flex items-center gap-2">
          <Label htmlFor="filtro-escalao" className="text-corpo-sec text-cinza-600">
            Escalão
          </Label>
          <Select value={filtroEscalao} onValueChange={setFiltroEscalao}>
            <SelectTrigger id="filtro-escalao" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os escalões</SelectItem>
              {escaloes.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {visiveis.length === 0 ? (
        <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
          {competicoes.length === 0
            ? "Sem competições nesta época."
            : "Sem competições neste escalão."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visiveis.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-4 shadow-card"
            >
              <Link
                href={`/jogos/competicoes/${c.id}`}
                className="flex flex-1 items-center gap-3"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/5">
                  <Trophy className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-corpo font-semibold text-cinza-900">{c.nome}</p>
                  <p className="text-legenda text-cinza-500">
                    {LABEL_FORMATO_COMPETICAO[c.formato]} · {LABEL_TIPO_JOGO[c.tipo]} ·{" "}
                    {c.escalao.nome}
                    {nomeEpoca(c.epocaId) ? ` · ${nomeEpoca(c.epocaId)}` : ""} · {c._count.jogos}{" "}
                    jogo(s)
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 flex-shrink-0 text-cinza-400" />
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Apagar" disabled={pending}>
                    <Trash2 className="h-4 w-4 text-vermelho-600" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apagar «{c.nome}»?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Os jogos mantêm-se, apenas deixam de estar ligados a esta competição.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => apagar(c.id)}
                      className="bg-vermelho-600 hover:bg-vermelho-600/90 text-white"
                    >
                      Apagar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
