"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { criarJogo, atualizarJogo } from "@/lib/actions/jogos";
import { verificarConflitoAgenda } from "@/lib/actions/agenda";
import type { ConflitoAgenda } from "@/lib/utils/agenda-conflitos";
import { LABEL_CASA_FORA, LABEL_TIPO_JOGO } from "@/lib/schemas/jogo";
import { instantToWallClockLisbon, wallClockLisbonToInstant } from "@/lib/utils-datas";
import type {
  CasaFora,
  Escalao,
  FormatoJogo,
  Jogo,
  Modalidade,
  TipoJogo,
} from "@prisma/client";

/** Valor sentinela do Select para «sem competição associada». */
const SEM_COMPETICAO = "__nenhuma__";

// 🔁 v7 (§3.7/§10.8): formatos de futebol selecionáveis + rótulos PT-PT. O futsal
// tem formato único (FUTSAL_5), derivado no backend, pelo que não aparece na UI.
const FORMATOS_FUTEBOL: FormatoJogo[] = [
  "FUTEBOL_3_3",
  "FUTEBOL_5_5",
  "FUTEBOL_7",
  "FUTEBOL_9",
  "FUTEBOL_11",
];

const LABEL_FORMATO_FUTEBOL: Record<string, string> = {
  FUTEBOL_3_3: "Futebol 3×3",
  FUTEBOL_5_5: "Futebol 5×5",
  FUTEBOL_7: "Futebol 7",
  FUTEBOL_9: "Futebol 9",
  FUTEBOL_11: "Futebol 11",
};

type CompeticaoBasica = { id: string; nome: string; escalaoId: string };

function paraInputDateTime(date: Date | null | undefined): string {
  if (!date) return "";
  return instantToWallClockLisbon(new Date(date));
}

type EscalaoBasico = Pick<Escalao, "id" | "nome"> & {
  modalidade: Modalidade | null;
};
type JogoParaEdicao = Pick<
  Jogo,
  | "id"
  | "data"
  | "adversario"
  | "casaFora"
  | "tipo"
  | "escalaoId"
  | "competicaoId"
  | "formato"
  | "local"
  | "golosMarcados"
  | "golosSofridos"
  | "faltas1aParte"
  | "faltas2aParte"
  | "videoUrl"
>;

export function JogoForm({
  escaloes,
  competicoes = [],
  jogo,
}: {
  escaloes: EscalaoBasico[];
  competicoes?: CompeticaoBasica[];
  jogo?: JogoParaEdicao;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [escalaoId, setEscalaoId] = useState<string>(jogo?.escalaoId ?? "");
  const [casaFora, setCasaFora] = useState<CasaFora>(jogo?.casaFora ?? "CASA");
  const [tipo, setTipo] = useState<TipoJogo>(jogo?.tipo ?? "OFICIAL");
  const [competicaoId, setCompeticaoId] = useState<string>(
    jogo?.competicaoId ?? SEM_COMPETICAO,
  );
  // 🔁 v7 (§3.7): formato de jogo. Só relevante/visível quando o escalão é de
  // futebol; em futsal é derivado (FUTSAL_5) pelo backend. "" = por escolher.
  const [formato, setFormato] = useState<FormatoJogo | "">(jogo?.formato ?? "");
  const [dataValor, setDataValor] = useState<string>(paraInputDateTime(jogo?.data));

  // Modalidade do escalão selecionado (§3.2): decide se o seletor de formato
  // aparece. Sem escalão/sem secção (backfill pendente) → tratado como futsal.
  const modalidadeEscalao =
    escaloes.find((e) => e.id === escalaoId)?.modalidade ?? null;
  const eFutebol = modalidadeEscalao === "FUTEBOL";

  // Aviso não-bloqueante de conflito de pavilhão (F3.3 — §8.16).
  const [conflitos, setConflitos] = useState<ConflitoAgenda[]>([]);
  const [localValor, setLocalValor] = useState<string>(jogo?.local ?? "");

  // Verificação após-debounce (~800ms). Sem local ou escalão → não verifica.
  // Jogos não têm duração → o backend assume a duração padrão. Falha de rede →
  // silêncio total (funcionalidade secundária, não bloqueante).
  useEffect(() => {
    const local = localValor.trim();
    if (!local || !dataValor || !escalaoId) {
      setConflitos([]);
      return;
    }
    let cancelado = false;
    const timer = setTimeout(async () => {
      try {
        const res = await verificarConflitoAgenda({
          data: new Date(dataValor),
          local,
          duracaoMin: undefined,
          excluirId: jogo?.id,
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
  }, [dataValor, localValor, escalaoId, jogo?.id]);

  // O grupo "Resultado" só faz sentido depois do jogo. Mostra-se quando: o jogo
  // já aconteceu (data no passado), já tem resultado registado, ou o treinador
  // pede explicitamente para o registar (ex.: adicionar um jogo histórico).
  const jaTemResultado =
    jogo != null &&
    (jogo.golosMarcados != null ||
      jogo.golosSofridos != null ||
      jogo.faltas1aParte != null ||
      jogo.faltas2aParte != null ||
      (jogo.videoUrl != null && jogo.videoUrl !== ""));
  const dataNoPassado = dataValor !== "" && new Date(dataValor) < new Date();
  const [resultadoManual, setResultadoManual] = useState(false);
  const mostrarResultado = dataNoPassado || jaTemResultado || resultadoManual;

  // Só as competições do escalão selecionado podem ser associadas ao jogo.
  const competicoesDoEscalao = competicoes.filter((c) => c.escalaoId === escalaoId);

  function mudarEscalao(novo: string) {
    setEscalaoId(novo);
    // Se a competição atual não pertence ao novo escalão, limpa a seleção.
    if (
      competicaoId !== SEM_COMPETICAO &&
      !competicoes.some((c) => c.id === competicaoId && c.escalaoId === novo)
    ) {
      setCompeticaoId(SEM_COMPETICAO);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErros({});
    setErroGeral(null);

    // Campos de resultado só são lidos quando o respetivo grupo está visível;
    // caso contrário mantêm-se nulos (agendar um jogo futuro não pede resultado).
    const gm = String(fd.get("golosMarcados") ?? "").trim();
    const gs = String(fd.get("golosSofridos") ?? "").trim();
    const f1 = String(fd.get("faltas1aParte") ?? "").trim();
    const f2 = String(fd.get("faltas2aParte") ?? "").trim();

    // Futebol exige formato (não há default entre os 5 formatos — §3.7/§10.8).
    if (eFutebol && !formato) {
      setErros({ formato: "Indica o formato de jogo" });
      return;
    }

    const dados = {
      data: fd.get("data")
        ? wallClockLisbonToInstant(String(fd.get("data"))).toISOString()
        : "",
      adversario: String(fd.get("adversario")),
      casaFora,
      tipo,
      escalaoId: escalaoId || undefined,
      competicaoId: competicaoId === SEM_COMPETICAO ? null : competicaoId,
      // Só se envia o formato em futebol; em futsal o backend deriva FUTSAL_5.
      formato: eFutebol && formato ? formato : undefined,
      local: String(fd.get("local") ?? "").trim() || undefined,
      golosMarcados: gm !== "" ? Number(gm) : null,
      golosSofridos: gs !== "" ? Number(gs) : null,
      faltas1aParte: f1 !== "" ? Number(f1) : null,
      faltas2aParte: f2 !== "" ? Number(f2) : null,
      videoUrl: String(fd.get("videoUrl") ?? "").trim(),
    };

    startTransition(async () => {
      const res = jogo ? await atualizarJogo(jogo.id, dados) : await criarJogo(dados);
      if (res.sucesso) {
        toast.success(jogo ? "Jogo atualizado" : "Jogo criado");
        router.push(`/jogos/${res.dados.id}`);
        router.refresh();
      } else {
        setErroGeral(res.erro);
        if (res.camposInvalidos) setErros(res.camposInvalidos);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      {erroGeral && !Object.keys(erros).length && (
        <p className="text-corpo-sec text-vermelho-600">{erroGeral}</p>
      )}

      {/* ─── Agendar ─────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="data">Data e hora *</Label>
        <Input
          id="data"
          name="data"
          type="datetime-local"
          required
          value={dataValor}
          onChange={(e) => setDataValor(e.target.value)}
        />
        {erros.data && <p className="text-legenda text-vermelho-600">{erros.data}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="adversario">Adversário *</Label>
        <Input
          id="adversario"
          name="adversario"
          required
          maxLength={100}
          defaultValue={jogo?.adversario ?? ""}
          placeholder="ex: CD Aves"
        />
        {erros.adversario && (
          <p className="text-legenda text-vermelho-600">{erros.adversario}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Local do jogo *</Label>
          <Select value={casaFora} onValueChange={(v) => setCasaFora(v as CasaFora)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASA">{LABEL_CASA_FORA.CASA}</SelectItem>
              <SelectItem value="FORA">{LABEL_CASA_FORA.FORA}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoJogo)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OFICIAL">{LABEL_TIPO_JOGO.OFICIAL}</SelectItem>
              <SelectItem value="AMIGAVEL">{LABEL_TIPO_JOGO.AMIGAVEL}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Escalão *</Label>
          <Select value={escalaoId} onValueChange={mudarEscalao}>
            <SelectTrigger>
              <SelectValue placeholder="Seleciona" />
            </SelectTrigger>
            <SelectContent>
              {escaloes.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {erros.escalaoId && (
            <p className="text-legenda text-vermelho-600">{erros.escalaoId}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Competição</Label>
          <Select
            value={competicaoId}
            onValueChange={setCompeticaoId}
            disabled={!escalaoId}
          >
            <SelectTrigger>
              <SelectValue placeholder={escalaoId ? "Sem competição" : "Escolhe o escalão"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_COMPETICAO}>Sem competição</SelectItem>
              {competicoesDoEscalao.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {escalaoId && competicoesDoEscalao.length === 0 && (
            <p className="text-legenda text-cinza-500">Sem competições neste escalão.</p>
          )}
        </div>
      </div>

      {/* Formato de jogo — só futebol (futsal usa FUTSAL_5 derivado). §3.7/§10.8 */}
      {eFutebol && (
        <div className="space-y-1.5">
          <Label>Formato de jogo *</Label>
          <Select
            value={formato}
            onValueChange={(v) => {
              setFormato(v as FormatoJogo);
              setErros((prev) => {
                const { formato: _omit, ...resto } = prev;
                return resto;
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolhe o formato" />
            </SelectTrigger>
            <SelectContent>
              {FORMATOS_FUTEBOL.map((f) => (
                <SelectItem key={f} value={f}>
                  {LABEL_FORMATO_FUTEBOL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {erros.formato && (
            <p className="text-legenda text-vermelho-600">{erros.formato}</p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="local">Recinto</Label>
        <Input
          id="local"
          name="local"
          maxLength={100}
          defaultValue={jogo?.local ?? ""}
          placeholder="ex: Pavilhão"
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

      {/* ─── Resultado (só após o jogo) ──────────────────────────────────── */}
      {mostrarResultado ? (
        <div className="space-y-5 border-t border-cinza-100 pt-5">
          <h2 className="text-corpo font-semibold text-cinza-700">Resultado (opcional)</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="golosMarcados">Golos marcados</Label>
              <Input
                id="golosMarcados"
                name="golosMarcados"
                type="number"
                min={0}
                max={99}
                defaultValue={jogo?.golosMarcados ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="golosSofridos">Golos sofridos</Label>
              <Input
                id="golosSofridos"
                name="golosSofridos"
                type="number"
                min={0}
                max={99}
                defaultValue={jogo?.golosSofridos ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="faltas1aParte">Faltas 1ª parte</Label>
              <Input
                id="faltas1aParte"
                name="faltas1aParte"
                type="number"
                min={0}
                max={50}
                defaultValue={jogo?.faltas1aParte ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="faltas2aParte">Faltas 2ª parte</Label>
              <Input
                id="faltas2aParte"
                name="faltas2aParte"
                type="number"
                min={0}
                max={50}
                defaultValue={jogo?.faltas2aParte ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="videoUrl">Vídeo (link YouTube)</Label>
            <Input
              id="videoUrl"
              name="videoUrl"
              defaultValue={jogo?.videoUrl ?? ""}
              placeholder="https://youtube.com/…"
            />
            {erros.videoUrl && (
              <p className="text-legenda text-vermelho-600">{erros.videoUrl}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="border-t border-cinza-100 pt-5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setResultadoManual(true)}
          >
            Registar resultado
          </Button>
          <p className="mt-1.5 text-legenda text-cinza-500">
            O resultado é normalmente registado depois do jogo.
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending || !escalaoId}>
          {pending ? "A guardar…" : jogo ? "Guardar alterações" : "Criar jogo"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
