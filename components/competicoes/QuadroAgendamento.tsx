"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Pencil,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  apagarResultadoExterno,
  atualizarAgendamentoJogo,
  atualizarGolosConfronto,
  definirEstadoConfronto,
} from "@/lib/actions/competicoes";
import { LABEL_ESTADO_RESULTADO } from "@/lib/schemas/competicao";
import { formatarData, formatarHora } from "@/lib/comunicacao-utils";
import { cn } from "@/lib/utils";
import type { CasaFora, EstadoResultado, FormatoCompeticao } from "@prisma/client";

export type ResultadoQuadro = {
  id: string;
  equipaCasa: string;
  equipaFora: string;
  golosCasa: number | null;
  golosFora: number | null;
  ronda: number | null;
  data: Date | null;
  dataHora: Date | null;
  estado: EstadoResultado;
  walkoverVencedor: CasaFora | null;
  /** §23.11.3 regra 6: confronto interno (A vs B) com placares divergentes. */
  placarDivergente?: boolean;
};

/** Aviso de placares divergentes num confronto interno (prevalece o último gravado). */
function AvisoDivergencia({ r }: { r: ResultadoQuadro }) {
  if (!r.placarDivergente) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-legenda text-ambar-600">
      <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0" />
      Os jogos das duas equipas têm resultados diferentes — prevalece o último gravado.
    </p>
  );
}

// P1.6 (§23.7): cor do selo de estado — agendado neutro, realizado verde,
// cancelado vermelho, walkover âmbar.
const CLASSE_ESTADO: Record<EstadoResultado, string> = {
  AGENDADO: "bg-cinza-100 text-cinza-600",
  REALIZADO: "bg-verde-600/10 text-verde-600",
  CANCELADO: "bg-vermelho-600/10 text-vermelho-600",
  WALKOVER: "bg-ambar-500/10 text-ambar-600",
};

function SeloEstado({ estado }: { estado: EstadoResultado }) {
  return (
    <Badge className={cn("border-transparent", CLASSE_ESTADO[estado])}>
      {LABEL_ESTADO_RESULTADO[estado]}
    </Badge>
  );
}

// ── Helpers de data/hora para inputs nativos (hora local) ────────────────────
function paraInputData(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function paraInputHora(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function combinarDataHora(data: string, hora: string): Date | null {
  if (data === "") return null;
  const d = new Date(`${data}T${hora || "00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function QuadroAgendamento({
  resultados,
  formato,
}: {
  resultados: ResultadoQuadro[];
  formato: FormatoCompeticao;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState<string | null>(null);
  const [dataEdit, setDataEdit] = useState("");
  const [horaEdit, setHoraEdit] = useState("");
  // Edição inline dos golos de um confronto já realizado.
  const [editandoGolos, setEditandoGolos] = useState<string | null>(null);
  const [golosCasaEdit, setGolosCasaEdit] = useState("");
  const [golosForaEdit, setGolosForaEdit] = useState("");

  const agruparPorRonda = formato !== "LIGA";

  // AGENDADO = por disputar; tudo o resto (REALIZADO/WALKOVER/CANCELADO) = decidido.
  const porDisputar = useMemo(
    () => resultados.filter((r) => r.estado === "AGENDADO"),
    [resultados],
  );
  const decididos = useMemo(
    () => resultados.filter((r) => r.estado !== "AGENDADO"),
    [resultados],
  );

  function iniciarEdicao(r: ResultadoQuadro) {
    const ref = r.dataHora ?? r.data;
    setDataEdit(ref ? paraInputData(ref) : "");
    setHoraEdit(r.dataHora ? paraInputHora(r.dataHora) : "");
    setEditando(r.id);
  }

  function guardarAgendamento(id: string) {
    const dataHora = combinarDataHora(dataEdit, horaEdit);
    startTransition(async () => {
      const res = await atualizarAgendamentoJogo(id, dataHora);
      if (res.sucesso) {
        toast.success("Agendamento atualizado");
        setEditando(null);
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  function iniciarEdicaoGolos(r: ResultadoQuadro) {
    setGolosCasaEdit(String(r.golosCasa ?? 0));
    setGolosForaEdit(String(r.golosFora ?? 0));
    setEditandoGolos(r.id);
  }

  function guardarGolos(id: string) {
    const golosCasa = Number(golosCasaEdit);
    const golosFora = Number(golosForaEdit);
    if (!Number.isInteger(golosCasa) || !Number.isInteger(golosFora)) {
      toast.error("Indica golos válidos (0–99)");
      return;
    }
    startTransition(async () => {
      const res = await atualizarGolosConfronto(id, golosCasa, golosFora);
      if (res.sucesso) {
        toast.success("Resultado atualizado");
        setEditandoGolos(null);
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  function mudarEstado(id: string, estado: EstadoResultado, vencedor?: CasaFora) {
    startTransition(async () => {
      const res = await definirEstadoConfronto(id, estado, vencedor);
      if (res.sucesso) {
        toast.success("Estado atualizado");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  function remover(id: string) {
    startTransition(async () => {
      const res = await apagarResultadoExterno(id);
      if (res.sucesso) {
        toast.success("Jogo removido");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  // Função de render (não componente): o DropdownMenu tem estado interno de
  // aberto/fechado e o foco volta ao trigger ao fechar — como componente
  // aninhado remontava a cada render (ex.: `pending` a mudar), fechando o menu.
  function renderMenuEstado(r: ResultadoQuadro) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            className="gap-1.5"
          >
            Estado
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Alterar estado</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={r.estado === "AGENDADO"}
            onSelect={() => mudarEstado(r.id, "AGENDADO")}
          >
            {LABEL_ESTADO_RESULTADO.AGENDADO}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={r.estado === "REALIZADO"}
            onSelect={() => mudarEstado(r.id, "REALIZADO")}
          >
            {LABEL_ESTADO_RESULTADO.REALIZADO}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={r.estado === "CANCELADO"}
            onSelect={() => mudarEstado(r.id, "CANCELADO")}
          >
            {LABEL_ESTADO_RESULTADO.CANCELADO}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => mudarEstado(r.id, "WALKOVER", "CASA")}>
            Walkover — casa vence
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => mudarEstado(r.id, "WALKOVER", "FORA")}>
            Walkover — fora vence
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Função de render (não componente): se fosse um componente declarado dentro
  // do corpo, teria identidade nova a cada render e cada onChange da data/hora
  // remontava a linha — o seletor nativo de data/hora fechava a meio da escolha.
  function renderLinhaAgendado(r: ResultadoQuadro) {
    const emEdicao = editando === r.id;
    const ref = r.dataHora ?? r.data;
    return (
      <li key={r.id} className="rounded-md border border-cinza-200 bg-white p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-corpo text-cinza-900">
              <span className="font-medium">{r.equipaCasa}</span>
              <span className="px-0.5 text-cinza-400">vs</span>
              <span className="font-medium">{r.equipaFora}</span>
              <SeloEstado estado={r.estado} />
            </p>
            {!emEdicao && (
              <p className="text-legenda text-cinza-500">
                {r.dataHora
                  ? `${formatarData(r.dataHora)} · ${formatarHora(r.dataHora)}`
                  : ref
                    ? formatarData(ref)
                    : "Por definir"}
              </p>
            )}
            <AvisoDivergencia r={r} />
          </div>

          {emEdicao ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={dataEdit}
                onChange={(e) => setDataEdit(e.target.value)}
                className="h-10 w-40"
                aria-label="Data do jogo"
              />
              <Input
                type="time"
                value={horaEdit}
                onChange={(e) => setHoraEdit(e.target.value)}
                disabled={dataEdit === ""}
                className="h-10 w-28"
                aria-label="Hora do jogo"
              />
              <Button
                type="button"
                size="icon"
                onClick={() => guardarAgendamento(r.id)}
                disabled={pending}
                aria-label="Guardar agendamento"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setEditando(null)}
                disabled={pending}
                aria-label="Cancelar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => iniciarEdicao(r)}
                disabled={pending}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                {ref ? "Editar" : "Agendar"}
              </Button>
              {renderMenuEstado(r)}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remover(r.id)}
                disabled={pending}
                aria-label="Remover jogo"
              >
                <Trash2 className="h-4 w-4 text-vermelho-600" />
              </Button>
            </div>
          )}
        </div>
      </li>
    );
  }

  // Função de render (não componente), pelo mesmo motivo de renderLinhaAgendado:
  // como componente aninhado, cada tecla nos golos remontava o <input> (perda de foco).
  function renderLinhaDecidido(r: ResultadoQuadro) {
    const ref = r.dataHora ?? r.data;
    const casaVenceWO = r.estado === "WALKOVER" && r.walkoverVencedor === "CASA";
    const foraVenceWO = r.estado === "WALKOVER" && r.walkoverVencedor === "FORA";
    const emEdicaoGolos = editandoGolos === r.id;
    // Só os confrontos realizados têm golos editáveis (walkover usa resultado
    // regulamentar; cancelado não tem placar).
    const golosEditaveis = r.estado === "REALIZADO";
    return (
      <li
        key={r.id}
        className="flex flex-wrap items-center gap-3 rounded-md border border-cinza-200 bg-white p-3 shadow-card"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-corpo text-cinza-900">
            <span className={cn("font-medium", casaVenceWO && "font-bold")}>{r.equipaCasa}</span>
            {emEdicaoGolos ? (
              <span className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={99}
                  value={golosCasaEdit}
                  onChange={(e) => setGolosCasaEdit(e.target.value)}
                  className="h-9 w-14 text-center"
                  aria-label="Golos da equipa da casa"
                />
                <span className="text-cinza-400">—</span>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  value={golosForaEdit}
                  onChange={(e) => setGolosForaEdit(e.target.value)}
                  className="h-9 w-14 text-center"
                  aria-label="Golos da equipa visitante"
                />
              </span>
            ) : (
              <span className="font-semibold tabular-nums">
                {r.estado === "REALIZADO"
                  ? `${r.golosCasa ?? "—"} — ${r.golosFora ?? "—"}`
                  : r.estado === "WALKOVER"
                    ? "WO"
                    : "—"}
              </span>
            )}
            <span className={cn("font-medium", foraVenceWO && "font-bold")}>{r.equipaFora}</span>
            <SeloEstado estado={r.estado} />
          </p>
          {ref && <p className="text-legenda text-cinza-500">{formatarData(ref)}</p>}
          <AvisoDivergencia r={r} />
        </div>
        <div className="flex items-center gap-2">
          {emEdicaoGolos ? (
            <>
              <Button
                type="button"
                size="icon"
                onClick={() => guardarGolos(r.id)}
                disabled={pending}
                aria-label="Guardar golos"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setEditandoGolos(null)}
                disabled={pending}
                aria-label="Cancelar edição de golos"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              {golosEditaveis && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => iniciarEdicaoGolos(r)}
                  disabled={pending}
                  className="gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Golos
                </Button>
              )}
              {renderMenuEstado(r)}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remover(r.id)}
                disabled={pending}
                aria-label="Remover resultado"
              >
                <Trash2 className="h-4 w-4 text-vermelho-600" />
              </Button>
            </>
          )}
        </div>
      </li>
    );
  }

  function agruparRondas(lista: ResultadoQuadro[]) {
    const mapa = new Map<number, ResultadoQuadro[]>();
    for (const r of lista) {
      const chave = r.ronda ?? 0;
      const g = mapa.get(chave) ?? [];
      g.push(r);
      mapa.set(chave, g);
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
  }

  if (resultados.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
        Sem jogos no quadro. Gera o quadro ao criar a competição ou adiciona confrontos.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Jogos por disputar (agendados) */}
      {porDisputar.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-cinza-900">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="text-corpo font-semibold">Por disputar</h3>
            <Badge variant="secondary">{porDisputar.length}</Badge>
          </div>
          {agruparPorRonda ? (
            agruparRondas(porDisputar).map(([ronda, lista]) => (
              <div key={ronda} className="space-y-2">
                <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                  {ronda === 0 ? "Sem ronda" : `Ronda ${ronda}`}
                </p>
                <ul className="space-y-2">
                  {lista.map(renderLinhaAgendado)}
                </ul>
              </div>
            ))
          ) : (
            <ul className="space-y-2">
              {porDisputar.map(renderLinhaAgendado)}
            </ul>
          )}
        </section>
      )}

      {/* Confrontos decididos (realizados, walkover ou cancelados) */}
      {decididos.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-cinza-900">
            <Check className="h-4 w-4 text-verde-600" />
            <h3 className="text-corpo font-semibold">Resultados</h3>
            <Badge variant="secondary">{decididos.length}</Badge>
          </div>
          {agruparPorRonda ? (
            agruparRondas(decididos).map(([ronda, lista]) => (
              <div key={ronda} className="space-y-2">
                <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                  {ronda === 0 ? "Sem ronda" : `Ronda ${ronda}`}
                </p>
                <ul className="space-y-2">
                  {lista.map(renderLinhaDecidido)}
                </ul>
              </div>
            ))
          ) : (
            <ul className="space-y-2">
              {decididos.map(renderLinhaDecidido)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
