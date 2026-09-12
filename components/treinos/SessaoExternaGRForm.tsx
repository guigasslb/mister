// §8.24.6 — Formulário de registo de sessão externa de guarda-redes (estágio,
// clínica, outro treinador). Client Component: recolhe metadados, participantes
// GR e (opcionalmente) métricas técnicas de GR, e chama `criarSessaoExternaGR`.
// O servidor é a autoridade (permissão, isolamento multi-clube e RN-GR-2/5).
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Hand } from "lucide-react";
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
import { criarSessaoExternaGR } from "@/lib/actions/treino-gr";
import type { TipoMetrica } from "@prisma/client";

type Escalao = { id: string; nome: string };
type GuardaRedes = { id: string; nome: string; numero: number | null };
type MetricaGR = { id: string; nome: string; tipo: TipoMetrica };

export function SessaoExternaGRForm({
  escaloes,
  atletasPorEscalao,
  metricas,
}: {
  escaloes: Escalao[];
  /** Guarda-redes (posição GR) por escalão gerível. */
  atletasPorEscalao: Record<string, GuardaRedes[]>;
  /** Métricas técnicas de GR (aplicaSoGuardaRedes, contexto TREINO/AMBOS). */
  metricas: MetricaGR[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [escalaoId, setEscalaoId] = useState<string>(escaloes[0]?.id ?? "");
  const [data, setData] = useState("");
  const [duracaoMin, setDuracaoMin] = useState("");
  const [local, setLocal] = useState("");
  const [entidadeExterna, setEntidadeExterna] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [notas, setNotas] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [valores, setValores] = useState<
    Record<string, Record<string, number>>
  >({});

  const guardaRedes = useMemo(
    () => atletasPorEscalao[escalaoId] ?? [],
    [atletasPorEscalao, escalaoId],
  );
  const selecionadosLista = guardaRedes.filter((gr) => selecionados.has(gr.id));

  function mudarEscalao(novo: string) {
    setEscalaoId(novo);
    // GRs e métricas dependem do escalão — limpa seleção/valores ao trocar.
    setSelecionados(new Set());
    setValores({});
  }

  function alternarGR(atletaId: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(atletaId)) novo.delete(atletaId);
      else novo.add(atletaId);
      return novo;
    });
  }

  function definirValor(
    atletaId: string,
    metricaId: string,
    valor: number | null,
  ) {
    setValores((prev) => {
      const doAtleta = { ...(prev[atletaId] ?? {}) };
      if (valor == null) delete doAtleta[metricaId];
      else doAtleta[metricaId] = valor;
      return { ...prev, [atletaId]: doAtleta };
    });
  }

  function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);

    if (!escalaoId) {
      setErro("Escolhe um escalão.");
      return;
    }
    if (!data) {
      setErro("A data é obrigatória.");
      return;
    }
    const participantes = [...selecionados].filter((id) =>
      guardaRedes.some((gr) => gr.id === id),
    );
    if (participantes.length === 0) {
      setErro("Seleciona pelo menos um guarda-redes participante.");
      return;
    }

    // Só métricas dos participantes selecionados são enviadas.
    const metricasFlat = participantes.flatMap((atletaId) =>
      Object.entries(valores[atletaId] ?? {}).map(([metricaId, valor]) => ({
        atletaId,
        metricaId,
        valor,
      })),
    );

    const dados = {
      escalaoId,
      // <input type="date"> devolve "YYYY-MM-DD"; a action tipa `data: Date`.
      data: new Date(data),
      duracaoMin: duracaoMin.trim() === "" ? undefined : Number(duracaoMin),
      local: local.trim() || undefined,
      entidadeExterna: entidadeExterna.trim() || undefined,
      objetivo: objetivo.trim() || undefined,
      notas: notas.trim() || undefined,
      atletasIds: participantes,
      metricas: metricasFlat,
    };

    startTransition(async () => {
      const res = await criarSessaoExternaGR(dados);
      if (res.sucesso) {
        toast.success("Sessão externa de GR registada");
        router.push("/treinos");
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <form onSubmit={submeter} className="space-y-6">
      {erro && (
        <p className="rounded-md border border-vermelho-600/30 bg-vermelho-600/5 p-3 text-corpo-sec text-vermelho-600">
          {erro}
        </p>
      )}

      {/* Metadados */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="escalao">Escalão *</Label>
          <Select value={escalaoId} onValueChange={mudarEscalao}>
            <SelectTrigger id="escalao">
              <SelectValue placeholder="Escolher escalão" />
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
          <Label htmlFor="data">Data *</Label>
          <Input
            id="data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="duracao">Duração (min)</Label>
          <Input
            id="duracao"
            type="number"
            min={1}
            max={300}
            value={duracaoMin}
            onChange={(e) => setDuracaoMin(e.target.value)}
            placeholder="Ex: 60"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="local">Local</Label>
          <Input
            id="local"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            maxLength={100}
            placeholder="Pavilhão / morada"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="entidade">Entidade / organizador</Label>
          <Input
            id="entidade"
            value={entidadeExterna}
            onChange={(e) => setEntidadeExterna(e.target.value)}
            maxLength={100}
            placeholder="Ex: Estágio FPF, Clínica GR João Silva"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="objetivo">Objetivo</Label>
          <Textarea
            id="objetivo"
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            maxLength={500}
            rows={2}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notas">Notas</Label>
          <Textarea
            id="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
      </div>

      {/* Participantes GR */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Hand className="h-4 w-4 text-primary" />
          <h2 className="text-corpo font-semibold text-cinza-900">
            Guarda-redes participantes *
          </h2>
        </div>
        {guardaRedes.length === 0 ? (
          <p className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
            Este escalão não tem guarda-redes no plantel.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {guardaRedes.map((gr) => {
              const marcado = selecionados.has(gr.id);
              return (
                <li key={gr.id}>
                  <label
                    className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${
                      marcado
                        ? "border-primary bg-primary/5"
                        : "border-cinza-200 bg-white hover:border-primary/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternarGR(gr.id)}
                      className="h-5 w-5 rounded border-cinza-300 text-primary focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <span className="text-corpo text-cinza-900">
                      {gr.numero != null && (
                        <span className="mr-1.5 text-cinza-400">
                          #{gr.numero}
                        </span>
                      )}
                      {gr.nome}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Métricas técnicas de GR (opcionais) */}
      {metricas.length > 0 && selecionadosLista.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-corpo font-semibold text-cinza-900">
            Métricas técnicas (opcional)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-corpo-sec">
              <thead>
                <tr className="border-b border-cinza-200 text-left">
                  <th className="sticky left-0 bg-white py-2 pr-3 font-medium text-cinza-500">
                    Guarda-redes
                  </th>
                  {metricas.map((m) => (
                    <th key={m.id} className="px-2 py-2 font-medium text-cinza-500">
                      {m.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selecionadosLista.map((gr) => (
                  <tr key={gr.id} className="border-b border-cinza-100">
                    <td className="sticky left-0 bg-white py-2 pr-3 text-cinza-900">
                      {gr.numero != null && (
                        <span className="mr-1.5 text-cinza-400">
                          #{gr.numero}
                        </span>
                      )}
                      {gr.nome}
                    </td>
                    {metricas.map((m) => (
                      <td key={m.id} className="px-2 py-1.5">
                        <CampoMetrica
                          tipo={m.tipo}
                          valor={valores[gr.id]?.[m.id] ?? null}
                          onChange={(v) => definirValor(gr.id, m.id, v)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-cinza-100 pt-4">
        <Button type="button" variant="outline" onClick={() => router.push("/treinos")}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "A registar…" : "Registar sessão externa"}
        </Button>
      </div>
    </form>
  );
}

function CampoMetrica({
  tipo,
  valor,
  onChange,
}: {
  tipo: TipoMetrica;
  valor: number | null;
  onChange: (v: number | null) => void;
}) {
  if (tipo === "BOOLEANO") {
    return (
      <Select
        value={valor == null ? "" : String(valor)}
        onValueChange={(v) => onChange(v === "" ? null : Number(v))}
      >
        <SelectTrigger className="h-9 w-24">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Sim</SelectItem>
          <SelectItem value="0">Não</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (tipo === "ESCALA") {
    return (
      <Select
        value={valor == null ? "" : String(valor)}
        onValueChange={(v) => onChange(v === "" ? null : Number(v))}
      >
        <SelectTrigger className="h-9 w-20">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4, 5].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      type="number"
      min={0}
      value={valor ?? ""}
      onChange={(e) => {
        const v = e.target.value.trim();
        onChange(v === "" ? null : Number(v));
      }}
      className="h-9 w-24"
    />
  );
}
