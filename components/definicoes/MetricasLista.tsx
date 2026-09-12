"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, ChevronUp, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  criarMetrica,
  editarMetrica,
  eliminarMetrica,
  alternarMetrica,
  moverMetrica,
} from "@/lib/actions/metricas";
import { LABEL_TIPO, LABEL_CONTEXTO } from "@/lib/schemas/metrica";
import type { MetricaConfig, TipoMetrica, ContextoMetrica } from "@prisma/client";

/**
 * Diálogo de formulário partilhado por criação e edição. Quando `metrica` é
 * passada, edita-a (reusa `metricaSchema` via `editarMetrica`); caso contrário
 * cria uma nova. O estado de abertura é controlado pelo componente-pai.
 */
function MetricaFormDialog({
  metrica,
  aberto,
  onOpenChange,
}: {
  metrica?: MetricaConfig;
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const editar = Boolean(metrica);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoMetrica>(metrica?.tipo ?? "NUMERO");
  const [contexto, setContexto] = useState<ContextoMetrica>(
    metrica?.contexto ?? "JOGO",
  );
  // §8.24.3: exclusiva de guarda-redes. Só relevante em métricas de treino
  // (contexto TREINO/AMBOS); ao voltar a JOGO o servidor força false.
  const [aplicaSoGuardaRedes, setAplicaSoGuardaRedes] = useState(
    metrica?.aplicaSoGuardaRedes ?? false,
  );
  const mostrarToggleGR = contexto !== "JOGO";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    startTransition(async () => {
      const dados = {
        nome: fd.get("nome"),
        tipo,
        contexto,
        aplicaSoGuardaRedes: mostrarToggleGR ? aplicaSoGuardaRedes : false,
      };
      const res = metrica
        ? await editarMetrica(metrica.id, dados)
        : await criarMetrica(dados);
      if (res.sucesso) {
        toast.success(editar ? "Métrica atualizada" : "Métrica criada");
        onOpenChange(false);
        if (!editar) {
          setTipo("NUMERO");
          setContexto("JOGO");
          setAplicaSoGuardaRedes(false);
        }
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editar ? "Editar métrica" : "Nova métrica"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              name="nome"
              required
              maxLength={60}
              defaultValue={metrica?.nome ?? ""}
              placeholder="ex: Dribles completados"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMetrica)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LABEL_TIPO) as TipoMetrica[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {LABEL_TIPO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Onde se regista</Label>
            <Select value={contexto} onValueChange={(v) => setContexto(v as ContextoMetrica)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LABEL_CONTEXTO) as ContextoMetrica[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {LABEL_CONTEXTO[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* §8.24.3: exclusiva de GR — só em métricas de treino (TREINO/AMBOS). */}
          {mostrarToggleGR && (
            <div className="flex items-start justify-between gap-3 rounded-md border border-cinza-200 bg-cinza-50 p-3">
              <div>
                <Label htmlFor="aplicaSoGuardaRedes" className="cursor-pointer">
                  Aplica só a guarda-redes
                </Label>
                <p className="mt-0.5 text-legenda text-cinza-600">
                  A métrica só aparece na grelha e nas análises dos atletas com a
                  posição de guarda-redes.
                </p>
              </div>
              <Switch
                id="aplicaSoGuardaRedes"
                checked={aplicaSoGuardaRedes}
                onCheckedChange={setAplicaSoGuardaRedes}
                aria-label="Aplica só a guarda-redes"
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={pending}>
              {pending
                ? editar
                  ? "A guardar…"
                  : "A criar…"
                : editar
                  ? "Guardar alterações"
                  : "Criar métrica"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MetricasLista({
  metricas,
  podeGerir = false,
}: {
  metricas: MetricaConfig[];
  podeGerir?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [criarAberto, setCriarAberto] = useState(false);
  const [aEditar, setAEditar] = useState<MetricaConfig | null>(null);
  const [aEliminar, setAEliminar] = useState<MetricaConfig | null>(null);

  function alternar(id: string, ativa: boolean) {
    startTransition(async () => {
      const res = await alternarMetrica(id, ativa);
      if (!res.sucesso) toast.error(res.erro);
    });
  }

  function mover(id: string, direcao: "subir" | "descer") {
    startTransition(async () => {
      const res = await moverMetrica(id, direcao);
      if (!res.sucesso) toast.error(res.erro);
    });
  }

  function eliminar(id: string) {
    startTransition(async () => {
      const res = await eliminarMetrica(id);
      if (res.sucesso) {
        toast.success("Métrica eliminada");
        setAEliminar(null);
      } else {
        toast.error(res.erro);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Métricas</h1>
          <p className="mt-1 text-corpo-sec text-cinza-600">
            As métricas ativas aparecem na grelha de estatísticas dos jogos e/ou
            treinos, conforme o contexto escolhido.
          </p>
        </div>
        {podeGerir && (
          <Button onClick={() => setCriarAberto(true)}>
            <Plus className="h-4 w-4" />
            Nova métrica
          </Button>
        )}
      </div>

      {metricas.length === 0 ? (
        <p className="text-corpo-sec text-cinza-600">
          Nenhuma métrica configurada. Cria a primeira.
        </p>
      ) : (
        <ul className="space-y-2">
          {metricas.map((m, idx) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-3 shadow-card"
            >
              {/* Reordenar */}
              {podeGerir && (
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => mover(m.id, "subir")}
                    disabled={idx === 0 || pending}
                    className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                    aria-label="Subir"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => mover(m.id, "descer")}
                    disabled={idx === metricas.length - 1 || pending}
                    className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                    aria-label="Descer"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Dados */}
              <div className="flex-1">
                <p className="text-corpo font-semibold text-cinza-900">{m.nome}</p>
                <p className="text-legenda text-cinza-600">
                  {LABEL_TIPO[m.tipo]} · {LABEL_CONTEXTO[m.contexto]}
                  {m.aplicaSoGuardaRedes && " · 🧤 Só guarda-redes"}
                </p>
              </div>

              {/* Estado */}
              <Badge
                className={
                  m.ativa
                    ? "bg-verde-600 text-white text-legenda"
                    : "bg-cinza-200 text-cinza-600 text-legenda"
                }
              >
                {m.ativa ? "Ativa" : "Inativa"}
              </Badge>

              {/* Toggle */}
              {podeGerir && (
                <Switch
                  checked={m.ativa}
                  disabled={pending}
                  onCheckedChange={(v) => alternar(m.id, v)}
                  aria-label={m.ativa ? "Desativar métrica" : "Ativar métrica"}
                />
              )}

              {/* Editar / Eliminar */}
              {podeGerir && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setAEditar(m)}
                    disabled={pending}
                    className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-cinza-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                    aria-label={`Editar ${m.nome}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setAEliminar(m)}
                    disabled={pending}
                    className="flex h-8 w-8 items-center justify-center rounded text-cinza-400 hover:text-vermelho-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                    aria-label={`Eliminar ${m.nome}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Criar */}
      {podeGerir && (
        <MetricaFormDialog aberto={criarAberto} onOpenChange={setCriarAberto} />
      )}

      {/* Editar */}
      {podeGerir && aEditar && (
        <MetricaFormDialog
          key={aEditar.id}
          metrica={aEditar}
          aberto={Boolean(aEditar)}
          onOpenChange={(aberto) => {
            if (!aberto) setAEditar(null);
          }}
        />
      )}

      {/* Eliminar */}
      {podeGerir && (
        <AlertDialog
          open={Boolean(aEliminar)}
          onOpenChange={(aberto) => {
            if (!aberto) setAEliminar(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar métrica?</AlertDialogTitle>
              <AlertDialogDescription>
                Vais eliminar a métrica «{aEliminar?.nome}». Esta ação não pode
                ser anulada. Se a métrica já tiver valores registados em jogos ou
                treinos, não é possível apagá-la — desativa-a em vez de a apagar
                para preservar o histórico.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  if (aEliminar) eliminar(aEliminar.id);
                }}
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
