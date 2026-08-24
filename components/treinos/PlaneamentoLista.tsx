"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CalendarRange, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  criarPlaneamento,
  atualizarPlaneamento,
  apagarPlaneamento,
  sugerirPlaneamento,
  type PlaneamentoComRelacoes,
} from "@/lib/actions/periodizacao";
import {
  LABEL_TIPO_PLANEAMENTO,
  LABEL_PERIODO,
  MODOS_SEMANA,
  LABEL_MODO_SEMANA,
  type ModoSemana,
} from "@/lib/schemas/planeamento";

type EscalaoBasico = { id: string; nome: string };

function dataInput(d: Date | null | undefined): string {
  if (!d) return "";
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function PlaneamentoForm({
  escaloes,
  planeamento,
  onDone,
}: {
  escaloes: EscalaoBasico[];
  planeamento?: PlaneamentoComRelacoes;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [escalaoId, setEscalaoId] = useState(planeamento?.escalaoId ?? escaloes[0]?.id ?? "");
  const [tipo, setTipo] = useState<"SEMANAL" | "MENSAL">(planeamento?.tipo ?? "SEMANAL");
  const [periodo, setPeriodo] = useState<string>(planeamento?.periodo ?? "");
  const [dataInicio, setDataInicio] = useState(planeamento ? dataInput(planeamento.dataInicio) : "");
  const [dataFim, setDataFim] = useState(planeamento ? dataInput(planeamento.dataFim) : "");
  const [microciclo, setMicrociclo] = useState(planeamento?.microciclo?.toString() ?? "");
  const [mesociclo, setMesociclo] = useState(planeamento?.mesociclo?.toString() ?? "");
  // §8.9.1 — formalização opcional da semana.
  const [nome, setNome] = useState(planeamento?.nome ?? "");
  const [modoSemana, setModoSemana] = useState<ModoSemana>(
    (planeamento?.modoSemana as ModoSemana | null) ?? "ESTRUTURADO",
  );
  const [notaSemana, setNotaSemana] = useState(planeamento?.notaSemana ?? "");
  const [avancado, setAvancado] = useState(false);
  const isCreate = !planeamento;

  // Pré-preenchimento inteligente ao criar: actualiza ao mudar escalão ou tipo
  useEffect(() => {
    if (!isCreate || !escalaoId) return;
    sugerirPlaneamento(escalaoId, tipo).then((res) => {
      if (!res.sucesso) return;
      const s = res.dados;
      setDataInicio(s.dataInicio);
      setDataFim(s.dataFim);
      if (s.microciclo != null) setMicrociclo(String(s.microciclo));
      if (s.mesociclo != null) setMesociclo(String(s.mesociclo));
      if (s.periodo) setPeriodo(s.periodo);
    });
  }, [escalaoId, tipo, isCreate]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    const dados = {
      escalaoId,
      tipo,
      nome: nome.trim() || undefined,
      // §8.9.1: o modo só é relevante para semanas (SEMANAL).
      modoSemana: tipo === "SEMANAL" ? modoSemana : "TEXTO_LIVRE",
      notaSemana:
        tipo === "SEMANAL" && modoSemana === "TEXTO_LIVRE"
          ? notaSemana.trim() || undefined
          : undefined,
      periodo: periodo || undefined,
      mesociclo: mesociclo ? Number(mesociclo) : undefined,
      microciclo: microciclo ? Number(microciclo) : undefined,
      dataInicio,
      dataFim,
      objetivos: String(fd.get("objetivos") ?? "").trim() || undefined,
    };
    startTransition(async () => {
      const res = planeamento
        ? await atualizarPlaneamento(planeamento.id, dados)
        : await criarPlaneamento(dados);
      if (res.sucesso) {
        toast.success(planeamento ? "Planeamento atualizado" : "Planeamento criado");
        onDone();
      } else setErro(res.erro);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

      {isCreate && (
        <p className="flex items-center gap-1.5 rounded-md bg-primary/5 px-3 py-2 text-legenda text-primary">
          <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
          Datas e ciclos preenchidos automaticamente com base no último planeamento.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="nomeSemana">Nome da semana (opcional)</Label>
        <Input
          id="nomeSemana"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={100}
          placeholder="ex: Pré-jogo Benfica, Semana de carga"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Escalão *</Label>
          <Select value={escalaoId} onValueChange={setEscalaoId}>
            <SelectTrigger><SelectValue placeholder="Seleciona" /></SelectTrigger>
            <SelectContent>
              {escaloes.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as "SEMANAL" | "MENSAL")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SEMANAL">Semanal</SelectItem>
              <SelectItem value="MENSAL">Mensal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="dataInicio">Início *</Label>
          <Input
            id="dataInicio"
            type="date"
            required
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dataFim">Fim *</Label>
          <Input
            id="dataFim"
            type="date"
            required
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
          />
        </div>
      </div>

      {/* §8.9.1 — modo de detalhe da semana (só SEMANAL) */}
      {tipo === "SEMANAL" && (
        <div className="space-y-1.5">
          <Label>Modo da semana</Label>
          <div className="grid grid-cols-2 gap-1 rounded-md border border-cinza-200 p-1">
            {MODOS_SEMANA.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModoSemana(m)}
                className={`rounded px-3 py-1.5 text-corpo-sec font-medium transition-colors ${
                  modoSemana === m
                    ? "bg-primary text-white"
                    : "text-cinza-600 hover:bg-cinza-50"
                }`}
              >
                {LABEL_MODO_SEMANA[m]}
              </button>
            ))}
          </div>
          {modoSemana === "ESTRUTURADO" ? (
            <p className="text-legenda text-cinza-500">
              Marca cada treino com o seu momento (MD-1, MD-2, …) ao criar ou editar a sessão.
            </p>
          ) : (
            <Textarea
              value={notaSemana}
              onChange={(e) => setNotaSemana(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Nota livre da semana (ex: foco em transições, gestão de carga)"
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Período</Label>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PREPARATORIO">Preparatório</SelectItem>
              <SelectItem value="COMPETITIVO">Competitivo</SelectItem>
              <SelectItem value="TRANSICAO">Transição</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="microciclo">Semana (nº)</Label>
          <Input
            id="microciclo"
            type="number"
            min={1}
            max={99}
            value={microciclo}
            onChange={(e) => setMicrociclo(e.target.value)}
          />
        </div>
      </div>

      {/* Mesociclo — campo interno/avançado, escondido por defeito (§8.9.1) */}
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setAvancado((v) => !v)}
          className="flex items-center gap-1 text-legenda font-medium text-cinza-500 hover:text-cinza-700"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${avancado ? "rotate-180" : ""}`}
          />
          Avançado
        </button>
        {avancado && (
          <div className="space-y-1.5">
            <Label htmlFor="mesociclo">Mesociclo</Label>
            <Input
              id="mesociclo"
              type="number"
              min={1}
              max={99}
              value={mesociclo}
              onChange={(e) => setMesociclo(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="objetivos">Objetivos</Label>
        <Textarea
          id="objetivos"
          name="objetivos"
          rows={3}
          maxLength={2000}
          defaultValue={planeamento?.objetivos ?? ""}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={pending || !escalaoId || !dataInicio || !dataFim}>
          {pending ? "A guardar…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

function CriarDialog({ escaloes }: { escaloes: EscalaoBasico[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" />Novo planeamento</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo planeamento</DialogTitle></DialogHeader>
        {aberto && (
          <PlaneamentoForm escaloes={escaloes} onDone={() => setAberto(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditarDialog({ escaloes, planeamento }: { escaloes: EscalaoBasico[]; planeamento: PlaneamentoComRelacoes }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar planeamento</DialogTitle></DialogHeader>
        <PlaneamentoForm escaloes={escaloes} planeamento={planeamento} onDone={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}

function formatarIntervalo(a: Date, b: Date): string {
  const opt: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  return `${new Date(a).toLocaleDateString("pt-PT", opt)} – ${new Date(b).toLocaleDateString("pt-PT", opt)}`;
}

export function PlaneamentoLista({
  planeamentos,
  escaloes,
}: {
  planeamentos: PlaneamentoComRelacoes[];
  escaloes: EscalaoBasico[];
}) {
  const [pending, startTransition] = useTransition();

  function apagar(id: string) {
    startTransition(async () => {
      const res = await apagarPlaneamento(id);
      if (res.sucesso) toast.success("Planeamento apagado");
      else toast.error(res.erro);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Periodização</h1>
          <p className="mt-1 text-corpo-sec text-cinza-600">
            Organiza a época em mesociclos e microciclos de treino.
          </p>
        </div>
        <CriarDialog escaloes={escaloes} />
      </div>

      {planeamentos.length === 0 ? (
        <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
          Ainda não planeaste esta época. Formaliza a primeira semana.
        </p>
      ) : (
        <ul className="space-y-2">
          {planeamentos.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-4 shadow-card">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/5">
                <CalendarRange className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-corpo font-semibold text-cinza-900">
                  {p.nome ?? (p.microciclo != null ? `Semana ${p.microciclo}` : LABEL_TIPO_PLANEAMENTO[p.tipo])}
                  {" · "}
                  {formatarIntervalo(p.dataInicio, p.dataFim)}
                </p>
                <p className="text-legenda text-cinza-500">
                  {p.escalao.nome}
                  {p.periodo ? ` · ${LABEL_PERIODO[p.periodo]}` : ""}
                  {` · ${p._count.sessoes} sessão(ões)`}
                </p>
              </div>
              <EditarDialog escaloes={escaloes} planeamento={p} />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Apagar" disabled={pending}>
                    <Trash2 className="h-4 w-4 text-vermelho-600" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apagar este planeamento?</AlertDialogTitle>
                    <AlertDialogDescription>
                      As sessões associadas mantêm-se, apenas deixam de estar ligadas a este planeamento.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => apagar(p.id)} className="bg-vermelho-600 hover:bg-vermelho-600/90 text-white">
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
