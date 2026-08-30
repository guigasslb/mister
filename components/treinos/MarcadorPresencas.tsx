"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ListChecks, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { marcarPresencas } from "@/lib/actions/treinos";
import { MOTIVOS_FALTA, LABEL_MOTIVO_FALTA } from "@/lib/schemas/treino";
import type { EstadoPresenca, MotivoFalta } from "@prisma/client";

type Atleta = { id: string; nome: string; numero: number | null };

/**
 * Estado de presença + motivo/justificação da falta (F1 — secção 8.5).
 * Usado para os registos que vêm da base de dados — têm sempre um estado real.
 */
export type PresencaInicial = {
  estado: EstadoPresenca;
  motivo: MotivoFalta | null;
  justificacao: string | null;
};

/**
 * Registo em edição no cliente. As presenças são por sessão e começam vazias:
 * um atleta sem registo gravado fica com `estado: null` (por marcar) até o
 * treinador escolher explicitamente um estado. Não confundir com "presente".
 */
type RegistoPresenca = {
  estado: EstadoPresenca | null;
  motivo: MotivoFalta | null;
  justificacao: string | null;
};

const PRESENTES = new Set<EstadoPresenca>(["PRESENTE", "ATRASADO"]);

/** Estados em que faz sentido registar uma justificação livre. */
const COM_JUSTIFICACAO = new Set<EstadoPresenca>(["FALTA", "FALTA_JUSTIFICADA"]);

/**
 * Controlo segmentado de 1 toque (Melhoria 2). Cada segmento fixa o estado
 * diretamente — sem abrir/escolher num Select. Cores garantem contraste AA.
 */
const SEGMENTOS: { estado: EstadoPresenca; label: string; cor: string }[] = [
  { estado: "PRESENTE", label: "Presente", cor: "#1E9E5A" },
  { estado: "FALTA", label: "Falta", cor: "#D33A3A" },
  { estado: "LESIONADO", label: "Lesionado", cor: "#C7430F" },
  { estado: "FALTA_JUSTIFICADA", label: "Just.", cor: "#2C6BB0" },
];

export function MarcadorPresencas({
  sessaoId,
  atletas,
  presencasIniciais,
}: {
  sessaoId: string;
  atletas: Atleta[];
  presencasIniciais: Record<string, PresencaInicial>;
}) {
  const [pending, startTransition] = useTransition();

  // Estado original (o que veio da base de dados). Atletas sem registo gravado
  // ficam por marcar (estado null) — uma sessão sem presenças começa vazia.
  const construirInicial = useCallback((): Record<string, RegistoPresenca> => {
    const inicial: Record<string, RegistoPresenca> = {};
    for (const a of atletas) {
      const existente = presencasIniciais[a.id];
      if (existente) {
        // Registos antigos guardavam só texto livre (motivo a null). Mostram-se
        // como "Outro" para o texto continuar visível e editável (UX-P3-02).
        const motivo =
          existente.motivo ?? (existente.justificacao?.trim() ? "OUTRO" : null);
        inicial[a.id] = { ...existente, motivo };
      } else {
        inicial[a.id] = { estado: null, motivo: null, justificacao: null };
      }
    }
    return inicial;
  }, [atletas, presencasIniciais]);

  const [registos, setRegistos] = useState<Record<string, RegistoPresenca>>(construirInicial);

  // Só contam atletas efetivamente marcados: os que estão por marcar (null) não
  // entram em "presentes" nem em "faltas".
  const valores = Object.values(registos);
  const presentes = valores.filter((r) => r.estado != null && PRESENTES.has(r.estado)).length;
  const faltas = valores.filter((r) => r.estado != null && !PRESENTES.has(r.estado)).length;

  function mudarEstado(atletaId: string, estado: EstadoPresenca) {
    setRegistos((prev) => ({
      ...prev,
      [atletaId]: {
        estado,
        // Motivo/justificação só se aplicam a ausências — limpam quando presente.
        motivo: COM_JUSTIFICACAO.has(estado) ? prev[atletaId].motivo : null,
        justificacao: COM_JUSTIFICACAO.has(estado) ? prev[atletaId].justificacao : null,
      },
    }));
  }

  function mudarJustificacao(atletaId: string, valor: string) {
    setRegistos((prev) => ({
      ...prev,
      [atletaId]: { ...prev[atletaId], justificacao: valor },
    }));
  }

  /**
   * Seleciona (ou alterna) o motivo da falta a partir dos botões rápidos.
   * O texto livre só faz sentido em "Outro" — noutros motivos limpa-se (UX-P3-02).
   */
  function mudarMotivo(atletaId: string, motivo: MotivoFalta) {
    setRegistos((prev) => {
      const atual = prev[atletaId];
      const novoMotivo = atual.motivo === motivo ? null : motivo;
      return {
        ...prev,
        [atletaId]: {
          ...atual,
          motivo: novoMotivo,
          justificacao: novoMotivo === "OUTRO" ? atual.justificacao : null,
        },
      };
    });
  }

  /** Marca todos os atletas como PRESENTE (limpa motivos/justificações). */
  function marcarTodosPresentes() {
    setRegistos((prev) => {
      const proximo: Record<string, RegistoPresenca> = {};
      for (const id of Object.keys(prev))
        proximo[id] = { estado: "PRESENTE", motivo: null, justificacao: null };
      return proximo;
    });
  }

  /** Repõe o estado tal como estava guardado (descarta alterações não guardadas). */
  function repor() {
    setRegistos(construirInicial());
  }

  function guardar() {
    // Atletas por marcar (estado null) são ignorados: se o treinador não marcou,
    // não se grava nada para esse atleta.
    const payload = atletas
      .filter((a) => registos[a.id].estado != null)
      .map((a) => {
        const r = registos[a.id];
        return {
          atletaId: a.id,
          estado: r.estado as EstadoPresenca,
          motivo: r.motivo,
          justificacao: r.justificacao?.trim() ? r.justificacao : undefined,
        };
      });
    startTransition(async () => {
      const res = await marcarPresencas(sessaoId, payload);
      if (res.sucesso) toast.success("Presenças guardadas");
      else toast.error(res.erro);
    });
  }

  if (atletas.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-subtitulo text-cinza-900">Presenças</h2>
        <p className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
          Não há atletas neste escalão nesta época.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-subtitulo text-cinza-900">Presenças</h2>

      {/* Controlo rápido (P4.1) — atalhos client-side, não submetem o formulário. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={marcarTodosPresentes}>
          <ListChecks className="h-4 w-4" />
          Marcar todos presentes
        </Button>
        <Button type="button" variant="ghost" onClick={repor}>
          <RotateCcw className="h-4 w-4" />
          Repor
        </Button>
      </div>

      <ul className="space-y-2">
        {atletas.map((a) => {
          const registo = registos[a.id];
          const comJustificacao = registo.estado != null && COM_JUSTIFICACAO.has(registo.estado);
          return (
            <li
              key={a.id}
              className="rounded-md border border-cinza-200 bg-white p-2.5 shadow-card"
            >
              <div className="min-h-[44px] items-center gap-2 sm:flex">
                <span className="mb-2 block min-w-0 flex-1 truncate text-corpo font-medium text-cinza-900 sm:mb-0">
                  {a.numero != null && (
                    <span className="mr-1 text-cinza-400">#{a.numero}</span>
                  )}
                  {a.nome}
                </span>
                <div
                  role="group"
                  aria-label={`Estado de presença de ${a.nome}`}
                  className="grid grid-cols-4 gap-1 sm:w-auto sm:flex-shrink-0"
                >
                  {SEGMENTOS.map((seg) => {
                    const ativo = registo.estado === seg.estado;
                    return (
                      <button
                        key={seg.estado}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => mudarEstado(a.id, seg.estado)}
                        className="flex h-11 items-center justify-center rounded-md border px-1 text-legenda font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 sm:w-20"
                        style={
                          ativo
                            ? { background: seg.cor, borderColor: seg.cor, color: "#fff" }
                            : { borderColor: "#E4E1DB", color: "#6B6B6B" }
                        }
                      >
                        {seg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {comJustificacao && (
                <div className="mt-2 space-y-2 border-t border-cinza-100 pt-2">
                  <span className="block text-legenda text-cinza-500">
                    Motivo (opcional)
                  </span>
                  {/* Botões rápidos — mais fáceis de usar no telemóvel que texto livre. */}
                  <div
                    role="group"
                    aria-label={`Motivo da falta de ${a.nome}`}
                    className="flex flex-wrap gap-1.5"
                  >
                    {MOTIVOS_FALTA.map((m) => {
                      const ativo = registo.motivo === m;
                      return (
                        <Button
                          key={m}
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-pressed={ativo}
                          onClick={() => mudarMotivo(a.id, m)}
                          className={
                            ativo ? "border-primary bg-primary/5 text-primary" : ""
                          }
                        >
                          {LABEL_MOTIVO_FALTA[m]}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Texto livre apenas em "Outro". */}
                  {registo.motivo === "OUTRO" && (
                    <div>
                      <label
                        htmlFor={`motivo-${a.id}`}
                        className="mb-1 block text-legenda text-cinza-500"
                      >
                        Descreve o motivo
                      </label>
                      <Input
                        id={`motivo-${a.id}`}
                        value={registo.justificacao ?? ""}
                        onChange={(ev) => mudarJustificacao(a.id, ev.target.value)}
                        maxLength={300}
                        placeholder="Ex.: consulta médica, viagem…"
                        className="h-11"
                      />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {/* Barra de guardar fixa (P4.2) — sempre visível ao percorrer a lista. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 border-t border-cinza-200 bg-white px-1 py-3">
        <p className="text-corpo-sec text-cinza-600">
          {presentes} presentes · {faltas} faltas
        </p>
        <Button
          onClick={guardar}
          disabled={pending}
          className="min-h-[44px] w-full sm:w-auto"
        >
          <Check className="h-4 w-4" />
          {pending ? "A guardar…" : "Guardar presenças"}
        </Button>
      </div>
    </section>
  );
}
