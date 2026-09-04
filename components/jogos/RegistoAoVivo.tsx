"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { registarEventoJogo, removerEventoJogo } from "@/lib/actions/jogos";
import { LABEL_BLOCO_TEMPO, LABEL_TIPO_EVENTO } from "@/lib/schemas/jogo";
import { EMOJI_EVENTO } from "@/components/jogos/TimelineEventos";
import type { BlocoTempo, CasaFora, Modalidade, TipoEventoJogo } from "@prisma/client";

type Evento = {
  id: string;
  parte: number;
  minuto: number | null;
  tipo: TipoEventoJogo;
  bloco: BlocoTempo | null;
  atletaId: string | null;
  atletaSecundarioId: string | null;
};
type Atleta = { id: string; nome: string; numero: number | null };

// §10.8: as listas de tipos de evento dependem da modalidade do jogo. O futsal
// tem timeout; o futebol acrescenta o seu núcleo específico (remate, canto,
// fora-de-jogo, desarme) e não tem timeout.

/** Botões de registo rápido (ordem à beira-campo) — futsal. */
const RAPIDOS_FUTSAL: TipoEventoJogo[] = [
  "GOLO",
  "CARTAO_AMARELO",
  "CARTAO_VERMELHO",
  "SUBSTITUICAO",
  "TIMEOUT",
];

/** Botões de registo rápido (ordem à beira-campo) — futebol (sem timeout). */
const RAPIDOS_FUTEBOL: TipoEventoJogo[] = [
  "GOLO",
  "CARTAO_AMARELO",
  "CARTAO_VERMELHO",
  "SUBSTITUICAO",
];

/** Tipos adicionais disponíveis no seletor completo — futsal. */
const OUTROS_FUTSAL: TipoEventoJogo[] = [
  "ASSISTENCIA",
  "DEFESA",
  "FALTA",
  "GOLO_SOFRIDO",
];

/** Tipos adicionais disponíveis no seletor completo — futebol (§3.7/§10.8). */
const OUTROS_FUTEBOL: TipoEventoJogo[] = [
  "ASSISTENCIA",
  "DEFESA",
  "FALTA",
  "GOLO_SOFRIDO",
  "REMATE",
  "CANTO",
  "FORA_DE_JOGO",
  "DESARME",
];

const BLOCOS: BlocoTempo[] = [
  "JOGO_COMPLETO",
  "MEIA_PARTE",
  "BLOCO_10MIN",
  "BLOCO_5MIN",
  "NAO_JOGOU",
];

export function RegistoAoVivo({
  jogoId,
  eventos,
  atletas,
  casaFora,
  adversario,
  modalidade,
}: {
  jogoId: string;
  eventos: Evento[];
  atletas: Atleta[];
  casaFora: CasaFora;
  adversario: string;
  // §10.8: modalidade efetiva do jogo → decide os tipos de evento disponíveis.
  modalidade: Modalidade;
}) {
  const eFutebol = modalidade === "FUTEBOL";
  const RAPIDOS = eFutebol ? RAPIDOS_FUTEBOL : RAPIDOS_FUTSAL;
  const OUTROS = eFutebol ? OUTROS_FUTEBOL : OUTROS_FUTSAL;

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [parte, setParte] = useState("1");
  const [tipo, setTipo] = useState<TipoEventoJogo>("GOLO");
  const [atletaId, setAtletaId] = useState<string>("");
  const [atletaSecId, setAtletaSecId] = useState<string>("");
  const [minuto, setMinuto] = useState<string>("");
  const [bloco, setBloco] = useState<string>("none");

  const eSubstituicao = tipo === "SUBSTITUICAO";

  // Marcador ao vivo derivado dos eventos (§10.4).
  const golosNos = eventos.filter((e) => e.tipo === "GOLO").length;
  const golosAdv = eventos.filter((e) => e.tipo === "GOLO_SOFRIDO").length;
  const casaEhNossa = casaFora === "CASA";
  const esquerda = {
    nome: casaEhNossa ? "Nós" : adversario,
    golos: casaEhNossa ? golosNos : golosAdv,
  };
  const direita = {
    nome: casaEhNossa ? adversario : "Nós",
    golos: casaEhNossa ? golosAdv : golosNos,
  };

  const nomeAtleta = (id: string | null): string | null => {
    if (!id) return null;
    const a = atletas.find((x) => x.id === id);
    return a ? `${a.numero != null ? `#${a.numero} ` : ""}${a.nome}` : null;
  };

  function adicionar() {
    startTransition(async () => {
      const res = await registarEventoJogo({
        jogoId,
        parte: Number(parte),
        tipo,
        atletaId: atletaId || null,
        atletaSecundarioId: eSubstituicao ? atletaSecId || null : null,
        minuto: minuto.trim() !== "" ? Number(minuto) : null,
        bloco: bloco === "none" ? null : (bloco as BlocoTempo),
      });
      if (res.sucesso) {
        toast.success(`${LABEL_TIPO_EVENTO[tipo]} registado`);
        setMinuto("");
        setAtletaSecId("");
        router.refresh();
      } else toast.error(res.erro);
    });
  }

  function remover(id: string) {
    startTransition(async () => {
      const res = await removerEventoJogo(id);
      if (res.sucesso) router.refresh();
      else toast.error(res.erro);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-cinza-200 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-vermelho-600" />
        <h2 className="text-subtitulo text-cinza-900">Registo ao vivo</h2>
      </div>

      {/* Marcador ao vivo */}
      <div className="flex items-center justify-center gap-4 rounded-lg bg-cinza-50 px-4 py-3">
        <span className="flex-1 truncate text-right text-corpo font-medium text-cinza-700">
          {esquerda.nome}
        </span>
        <span className="text-titulo-pagina font-bold tabular-nums text-cinza-900">
          {esquerda.golos} – {direita.golos}
        </span>
        <span className="flex-1 truncate text-corpo font-medium text-cinza-700">
          {direita.nome}
        </span>
      </div>

      {/* Botões de registo rápido */}
      <div className="flex flex-wrap gap-2">
        {RAPIDOS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            aria-pressed={tipo === t}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-3 py-2 text-corpo-sec font-medium transition-colors ${
              tipo === t
                ? "border-primary bg-primary text-primary-foreground"
                : "border-cinza-200 bg-white text-cinza-700 hover:bg-cinza-50"
            }`}
          >
            <span aria-hidden>{EMOJI_EVENTO[t]}</span>
            {LABEL_TIPO_EVENTO[t]}
          </button>
        ))}
      </div>

      {/* Detalhes do evento */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Select value={parte} onValueChange={setParte}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1ª parte</SelectItem>
            <SelectItem value="2">2ª parte</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tipo} onValueChange={(v) => setTipo(v as TipoEventoJogo)}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...RAPIDOS, ...OUTROS].map((t) => (
              <SelectItem key={t} value={t}>
                {LABEL_TIPO_EVENTO[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          min={0}
          max={120}
          value={minuto}
          onChange={(e) => setMinuto(e.target.value)}
          placeholder="minuto"
          className="h-11"
        />

        <Select
          value={atletaId || "none"}
          onValueChange={(v) => setAtletaId(v === "none" ? "" : v)}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Atleta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— sem atleta —</SelectItem>
            {atletas.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.numero != null ? `#${a.numero} ` : ""}
                {a.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {eSubstituicao && (
          <Select
            value={atletaSecId || "none"}
            onValueChange={(v) => setAtletaSecId(v === "none" ? "" : v)}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Sai (substituído)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— quem sai —</SelectItem>
              {atletas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.numero != null ? `#${a.numero} ` : ""}
                  {a.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={bloco} onValueChange={setBloco}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Bloco de tempo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— sem bloco —</SelectItem>
            {BLOCOS.map((b) => (
              <SelectItem key={b} value={b}>
                {LABEL_BLOCO_TEMPO[b]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end">
        <Button onClick={adicionar} disabled={pending} className="min-h-[44px]">
          <Plus className="h-4 w-4" />
          {pending ? "A registar…" : `Registar ${LABEL_TIPO_EVENTO[tipo].toLowerCase()}`}
        </Button>
      </div>

      {/* Log de eventos (ordenados por minuto pelo servidor) */}
      {eventos.length === 0 ? (
        <p className="text-corpo-sec text-cinza-500">Ainda não há eventos registados.</p>
      ) : (
        <ul className="space-y-1.5">
          {eventos.map((e) => {
            const principal = nomeAtleta(e.atletaId);
            const secundario = nomeAtleta(e.atletaSecundarioId);
            return (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-md border border-cinza-100 px-3 py-1.5 text-corpo-sec"
              >
                <span className="w-16 flex-shrink-0 text-cinza-500">
                  {e.parte}ª{e.minuto != null ? ` · ${e.minuto}'` : ""}
                </span>
                <span aria-hidden>{EMOJI_EVENTO[e.tipo]}</span>
                <span className="font-medium text-cinza-900">
                  {LABEL_TIPO_EVENTO[e.tipo]}
                </span>
                {principal && <span className="text-cinza-600">— {principal}</span>}
                {e.tipo === "SUBSTITUICAO" && secundario && (
                  <span className="text-cinza-500">(sai {secundario})</span>
                )}
                {e.bloco && (
                  <span className="text-legenda text-cinza-400">
                    · {LABEL_BLOCO_TEMPO[e.bloco]}
                  </span>
                )}
                <button
                  onClick={() => remover(e.id)}
                  disabled={pending}
                  className="ml-auto rounded p-2 text-vermelho-600 hover:bg-vermelho-600/10"
                  aria-label="Apagar evento"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
