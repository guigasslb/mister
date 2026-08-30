"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
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
import { criarSessao, atualizarSessao } from "@/lib/actions/treinos";
import { verificarConflitoAgenda } from "@/lib/actions/agenda";
import { DialogoAlcance } from "@/components/treinos/DialogoAlcance";
import type { Alcance } from "@/lib/schemas/planoSemanal";
import type { ConflitoAgenda } from "@/lib/utils/agenda-conflitos";
import {
  TIPOS_SESSAO,
  LABEL_TIPO_SESSAO,
  MOMENTOS_SEMANA,
  LABEL_MOMENTO_SEMANA,
  type MomentoSemana,
} from "@/lib/schemas/treino";
import { instantToWallClockLisbon, wallClockLisbonToInstant } from "@/lib/utils-datas";
import type { Escalao, Sessao, TipoSessao } from "@prisma/client";

const SENTINEL_NONE = "__none__";

function paraInputDateTime(date: Date | null | undefined): string {
  if (!date) return "";
  return instantToWallClockLisbon(new Date(date));
}

type EscalaoBasico = Pick<Escalao, "id" | "nome">;
type SessaoParaEdicao = Pick<
  Sessao,
  | "id"
  | "data"
  | "escalaoId"
  | "tipoSessao"
  | "planeamentoId"
  | "momentoSemana"
  | "duracaoMin"
  | "objetivo"
  | "local"
  | "notas"
  | "planoSemanalId"
>;

/** Payload de agendamento/conteúdo enviado a criar/atualizar sessão. */
type DadosSessao = {
  data: string;
  escalaoId: string | undefined;
  tipoSessao: TipoSessao;
  momentoSemana: MomentoSemana | undefined;
  duracaoMin: number | undefined;
  objetivo: string | undefined;
  local: string | undefined;
  notas: string | undefined;
};

export function SessaoForm({
  escaloes,
  sessao,
  escalaoIdInicial,
  dataInicial,
}: {
  escaloes: EscalaoBasico[];
  sessao?: SessaoParaEdicao;
  escalaoIdInicial?: string;
  /** Data pré-preenchida ao criar a partir do cabeçalho de uma semana (§8.9.1). */
  dataInicial?: Date;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [escalaoId, setEscalaoId] = useState<string>(
    sessao?.escalaoId ?? escalaoIdInicial ?? "",
  );
  const [tipoSessao, setTipoSessao] = useState<TipoSessao>(sessao?.tipoSessao ?? "NORMAL");
  const [momentoSemana, setMomentoSemana] = useState<string>(
    sessao?.momentoSemana ?? SENTINEL_NONE,
  );

  const dataDefault = paraInputDateTime(sessao?.data ?? dataInicial);

  // Aviso não-bloqueante de conflito de pavilhão (F3.3 — §8.16).
  const [conflitos, setConflitos] = useState<ConflitoAgenda[]>([]);
  const [dataValor, setDataValor] = useState<string>(dataDefault);
  const [localValor, setLocalValor] = useState<string>(sessao?.local ?? "");
  const [duracaoValor, setDuracaoValor] = useState<string>(
    sessao?.duracaoMin != null ? String(sessao.duracaoMin) : "",
  );

  // Verificação após-debounce (~800ms). Sem local ou escalão → não verifica.
  // Falha de rede → silêncio total (funcionalidade secundária, não bloqueante).
  useEffect(() => {
    const local = localValor.trim();
    if (!local || !dataValor || !escalaoId) {
      setConflitos([]);
      return;
    }
    let cancelado = false;
    const timer = setTimeout(async () => {
      try {
        const n = Number(duracaoValor);
        const duracaoMin =
          duracaoValor.trim() !== "" && Number.isFinite(n) ? n : undefined;
        const res = await verificarConflitoAgenda({
          data: new Date(dataValor),
          local,
          duracaoMin,
          excluirId: sessao?.id,
        });
        if (cancelado) return;
        setConflitos(
          res.sucesso && res.dados.conflitos.length > 0 ? res.dados.conflitos : [],
        );
      } catch {
        if (!cancelado) setConflitos([]);
      }
    }, 800);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [dataValor, localValor, duracaoValor, escalaoId, sessao?.id]);

  // §8.8.1: ao editar uma sessão ligada a um plano, escolher o alcance da alteração.
  const ligadaAoPlano = !!sessao && sessao.planoSemanalId !== null;
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [dadosPendentes, setDadosPendentes] = useState<DadosSessao | null>(null);

  function submeter(dados: DadosSessao, alcance?: Alcance) {
    startTransition(async () => {
      if (sessao) {
        const res = await atualizarSessao(sessao.id, dados, alcance);
        if (res.sucesso) {
          const prop = res.dados.propagacao;
          if (prop) {
            toast.success(
              `${prop.atualizadas} sessão(ões) atualizada(s)` +
                (prop.personalizadasMantidas > 0
                  ? ` · ${prop.personalizadasMantidas} personalizada(s) mantida(s)`
                  : ""),
            );
          } else {
            toast.success("Sessão atualizada");
          }
          setDialogoAberto(false);
          router.push(`/treinos/${res.dados.id}`);
          router.refresh();
        } else {
          setDialogoAberto(false);
          setErroGeral(res.erro);
          if (res.camposInvalidos) setErros(res.camposInvalidos);
        }
        return;
      }

      const res = await criarSessao(dados);
      if (res.sucesso) {
        toast.success("Sessão criada");
        router.push(`/treinos/${res.dados.id}`);
        router.refresh();
      } else {
        setErroGeral(res.erro);
        if (res.camposInvalidos) setErros(res.camposInvalidos);
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErros({});
    setErroGeral(null);

    const duracaoRaw = String(fd.get("duracaoMin") ?? "").trim();

    const dados: DadosSessao = {
      data: wallClockLisbonToInstant(String(fd.get("data"))).toISOString(),
      escalaoId: escalaoId || undefined,
      tipoSessao,
      // §8.9.1: a ligação à semana (planeamento) é automática pela data no backend.
      // O momento na semana (MD-X) é escolhido aqui e aplica-se a qualquer tipo de sessão.
      momentoSemana:
        momentoSemana !== SENTINEL_NONE
          ? (momentoSemana as MomentoSemana)
          : undefined,
      duracaoMin: duracaoRaw !== "" ? Number(duracaoRaw) : undefined,
      objetivo: String(fd.get("objetivo") ?? "").trim() || undefined,
      local: String(fd.get("local") ?? "").trim() || undefined,
      notas: String(fd.get("notas") ?? "").trim() || undefined,
    };

    // §8.8.1: sessão ligada a um plano → perguntar o alcance antes de guardar.
    if (ligadaAoPlano) {
      setDadosPendentes(dados);
      setDialogoAberto(true);
      return;
    }

    submeter(dados);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      {erroGeral && !Object.keys(erros).length && (
        <p className="text-corpo-sec text-vermelho-600">{erroGeral}</p>
      )}

      {/* Data e duração */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="data">Data e hora *</Label>
          <Input
            id="data"
            name="data"
            type="datetime-local"
            required
            defaultValue={dataDefault}
            onChange={(e) => setDataValor(e.target.value)}
          />
          {erros.data && <p className="text-legenda text-vermelho-600">{erros.data}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="duracaoMin">Duração (min)</Label>
          <Input
            id="duracaoMin"
            name="duracaoMin"
            type="number"
            min={1}
            max={300}
            defaultValue={sessao?.duracaoMin ?? ""}
            placeholder="ex: 80"
            onChange={(e) => setDuracaoValor(e.target.value)}
          />
        </div>
      </div>

      {/* Escalão */}
      <div className="space-y-1.5">
        <Label>Escalão *</Label>
        <Select value={escalaoId} onValueChange={setEscalaoId}>
          <SelectTrigger>
            <SelectValue placeholder="Seleciona um escalão" />
          </SelectTrigger>
          <SelectContent>
            {escaloes.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {erros.escalaoId && <p className="text-legenda text-vermelho-600">{erros.escalaoId}</p>}
      </div>

      {/* Local */}
      <div className="space-y-1.5">
        <Label htmlFor="local">Local</Label>
        <Input
          id="local"
          name="local"
          defaultValue={sessao?.local ?? ""}
          maxLength={100}
          placeholder="ex: Pavilhão Municipal"
          onChange={(e) => setLocalValor(e.target.value)}
        />
      </div>

      {conflitos.length > 0 && (
        <div role="alert" className="rounded-md border border-ambar-500/40 bg-ambar-500/10 p-3 text-corpo-sec text-ambar-600">
          <p className="font-medium">Possível conflito de pavilhão</p>
          <ul className="mt-1 list-disc pl-4">
            {conflitos.map((c) => (
              <li key={`${c.tipo}-${c.escalaoNome}-${c.data.toString()}`}>
                {c.tipo === "TREINO" ? "Treino" : "Jogo"} do {c.escalaoNome} — {format(c.data, "EEE dd/MM, HH:mm", { locale: pt })}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-legenda">Podes guardar à mesma.</p>
        </div>
      )}

      {/* Momento na semana (MD-X) — disponível para qualquer tipo de sessão (§8.9.1) */}
      <div className="space-y-1.5">
        <Label>Momento na semana</Label>
        <Select value={momentoSemana} onValueChange={setMomentoSemana}>
          <SelectTrigger>
            <SelectValue placeholder="Opcional (MD-1, MD-2, …)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SENTINEL_NONE}>— Sem momento —</SelectItem>
            {MOMENTOS_SEMANA.map((m) => (
              <SelectItem key={m} value={m}>
                {LABEL_MOMENTO_SEMANA[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-legenda text-cinza-500">
          Marca o dia por relação com o jogo. A semana forma-se automaticamente pela data.
        </p>
      </div>

      {/* Objetivo */}
      <div className="space-y-1.5">
        <Label htmlFor="objetivo">Objetivo</Label>
        <Input
          id="objetivo"
          name="objetivo"
          defaultValue={sessao?.objetivo ?? ""}
          maxLength={500}
          placeholder="ex: 1x1 ofensivo e finalização"
        />
      </div>

      {/* Notas */}
      <div className="space-y-1.5">
        <Label htmlFor="notas">Notas</Label>
        <Textarea
          id="notas"
          name="notas"
          defaultValue={sessao?.notas ?? ""}
          maxLength={2000}
          rows={3}
        />
      </div>

      {/* Tipo de sessão — campo secundário (NORMAL por defeito) */}
      <div className="space-y-1.5 rounded-md border border-cinza-200 bg-cinza-50/60 p-3">
        <Label className="text-cinza-600">Tipo de sessão</Label>
        <Select value={tipoSessao} onValueChange={(v) => setTipoSessao(v as TipoSessao)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPOS_SESSAO.map((t) => (
              <SelectItem key={t} value={t}>{LABEL_TIPO_SESSAO[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-legenda text-cinza-500">
          Mantém «Treino normal» para a esmagadora maioria das sessões.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending || !escalaoId}>
          {pending ? "A guardar…" : sessao ? "Guardar alterações" : "Criar sessão"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>

      {ligadaAoPlano && (
        <DialogoAlcance
          aberto={dialogoAberto}
          onOpenChange={(v) => {
            if (!pending) setDialogoAberto(v);
          }}
          pendente={pending}
          onConfirmar={(alcance) => {
            if (dadosPendentes) submeter(dadosPendentes, alcance);
          }}
        />
      )}
    </form>
  );
}
