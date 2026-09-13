"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  adicionarEquipaCompeticao,
  removerEquipaCompeticao,
  gerarQuadroCompeticao,
} from "@/lib/actions/competicoes";
import type { CasaFora, EstadoResultado, FormatoCompeticao } from "@prisma/client";

// Subconjunto de EquipaCompeticao necessário à UI.
export type EquipaGestao = {
  id: string;
  nome: string;
  tipo: "PROPRIO" | "CLUBE_MISTER" | "EXTERNO";
};

// Subconjunto de ResultadoCompeticao para detetar confrontos por equipa.
export type ResultadoRef = {
  equipaCasa: string;
  equipaFora: string;
  equipaCasaId: string | null;
  equipaForaId: string | null;
  estado: EstadoResultado;
  walkoverVencedor: CasaFora | null;
};

export function GestaoEquipas({
  competicaoId,
  equipas,
  resultados,
  formato,
}: {
  competicaoId: string;
  equipas: EquipaGestao[];
  resultados: ResultadoRef[];
  formato: FormatoCompeticao;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState("");

  // Uma equipa "tem confrontos" se aparecer em algum resultado — por FK
  // (equipaCasaId/equipaForaId) ou por nome legado (equipaCasa/equipaFora).
  const temConfronto = useMemo(() => {
    return (e: EquipaGestao) =>
      resultados.some(
        (r) =>
          r.equipaCasaId === e.id ||
          r.equipaForaId === e.id ||
          r.equipaCasa === e.nome ||
          r.equipaFora === e.nome,
      );
  }, [resultados]);

  // "Gerar quadro" visível quando o formato não é LIGA ou quando há equipas
  // ainda sem confrontos gerados.
  const podeGerarQuadro =
    equipas.length >= 2 && (formato !== "LIGA" || equipas.some((e) => !temConfronto(e)));

  function adicionar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const valor = nome.trim();
    if (valor === "") return;
    startTransition(async () => {
      const res = await adicionarEquipaCompeticao(competicaoId, { nome: valor });
      if (res.sucesso) {
        toast.success("Equipa adicionada");
        setNome("");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  function remover(equipaId: string) {
    startTransition(async () => {
      const res = await removerEquipaCompeticao(equipaId);
      if (res.sucesso) {
        toast.success("Equipa removida");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  function gerarQuadro() {
    startTransition(async () => {
      const res = await gerarQuadroCompeticao(competicaoId);
      if (res.sucesso) {
        toast.success("Quadro gerado");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={adicionar} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1.5" style={{ minWidth: "12rem" }}>
          <Label htmlFor="nova-equipa">Adicionar equipa</Label>
          <Input
            id="nova-equipa"
            value={nome}
            onChange={(ev) => setNome(ev.target.value)}
            maxLength={100}
            placeholder="ex: FC Porto"
            disabled={pending}
          />
        </div>
        <Button type="submit" disabled={pending || nome.trim() === ""}>
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
        {podeGerarQuadro && (
          <Button type="button" variant="outline" onClick={gerarQuadro} disabled={pending}>
            <ListChecks className="h-4 w-4" />
            Gerar quadro
          </Button>
        )}
      </form>

      {equipas.length === 0 ? (
        <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
          Sem equipas nesta competição. Adiciona pelo menos 2 para gerar o quadro.
        </p>
      ) : (
        <ul className="space-y-2">
          {equipas.map((e) => {
            const proprio = e.tipo === "PROPRIO";
            const comConfronto = temConfronto(e);
            return (
              <li
                key={e.id}
                className={
                  proprio
                    ? "flex items-center gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 shadow-card"
                    : "flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-3 shadow-card"
                }
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {proprio && <Star className="h-4 w-4 flex-shrink-0 fill-primary text-primary" />}
                  <span className="truncate text-corpo font-medium text-cinza-900">{e.nome}</span>
                  {proprio && <Badge variant="secondary">A minha equipa</Badge>}
                </div>

                {!proprio &&
                  (comConfronto ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={pending}
                          aria-label={`Remover ${e.nome}`}
                        >
                          <Trash2 className="h-4 w-4 text-vermelho-600" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover «{e.nome}»?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta equipa tem confrontos no quadro. Se já tiver jogos realizados a
                            remoção é bloqueada; caso contrário os confrontos agendados associados
                            são também removidos.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => remover(e.id)}
                            className="bg-vermelho-600 hover:bg-vermelho-600/90 text-white"
                          >
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remover(e.id)}
                      disabled={pending}
                      aria-label={`Remover ${e.nome}`}
                    >
                      <Trash2 className="h-4 w-4 text-vermelho-600" />
                    </Button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
