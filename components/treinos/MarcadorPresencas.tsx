"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ListChecks, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { marcarPresencas } from "@/lib/actions/treinos";
import {
  TIPOS_AUSENCIA,
  LABEL_TIPO_AUSENCIA,
  LABEL_PRESENCA,
  estadoImplicaAusencia,
} from "@/lib/schemas/treino";
import { presencasAlteradas, type RegistoPresenca } from "@/lib/presencas";
import type { EstadoPresenca, TipoAusencia } from "@prisma/client";

type Atleta = {
  id: string;
  nome: string;
  numero: number | null;
  // §3.2 — atletas de dupla modalidade têm o motivo "Pratica futebol e futsal"
  // destacado (primeira opção) na marcação da ausência.
  praticaDuplaModalidade: boolean;
};

/**
 * Estado de presença + classificação da ausência (§8.8.2).
 * Usado para os registos que vêm da base de dados — têm sempre um estado real.
 */
export type PresencaInicial = {
  estado: EstadoPresenca;
  // §8.8.2 — classificação da ausência (só preenchida em estados de não-comparência).
  tipoAusencia: TipoAusencia | null;
  notaAusencia: string | null;
};

const PRESENTES = new Set<EstadoPresenca>(["PRESENTE", "ATRASADO"]);

/**
 * Comparência num toque: Presente / Atrasado. A ausência não tem botão próprio —
 * escolher diretamente o motivo marca AUSENTE + motivo num só passo (§8.8.2).
 * Cores garantem contraste AA com texto branco.
 */
const COMPARENCIA: { estado: "PRESENTE" | "ATRASADO"; cor: string }[] = [
  { estado: "PRESENTE", cor: "#1E9E5A" },
  { estado: "ATRASADO", cor: "#8A5A06" },
];

/** Cor do motivo de ausência: injustificada a vermelho, lesão a laranja, restantes a azul. */
function corMotivo(tipo: TipoAusencia): string {
  if (tipo === "SEM_MOTIVO") return "#D33A3A";
  if (tipo === "LESAO") return "#C7430F";
  return "#2C6BB0";
}

/** Motivos pela ordem a oferecer ao atleta: "Pratica futebol e futsal" primeiro se dupla modalidade. */
function motivosParaAtleta(praticaDuplaModalidade: boolean): readonly TipoAusencia[] {
  if (!praticaDuplaModalidade) return TIPOS_AUSENCIA;
  return ["FUTEBOL_FUTSAL", ...TIPOS_AUSENCIA.filter((t) => t !== "FUTEBOL_FUTSAL")];
}

/** Badge do estado marcado (só-leitura): "Presente", "Atrasado" ou o motivo da ausência. */
function BadgeEstado({ registo }: { registo: RegistoPresenca }) {
  if (registo.estado == null)
    return <span className="text-legenda text-cinza-400">Por marcar</span>;
  const ausente = estadoImplicaAusencia(registo.estado) && registo.tipoAusencia != null;
  const cor = ausente
    ? corMotivo(registo.tipoAusencia as TipoAusencia)
    : COMPARENCIA.find((c) => c.estado === registo.estado)?.cor ?? "#6B6B6B";
  const texto = ausente
    ? `Ausente · ${LABEL_TIPO_AUSENCIA[registo.tipoAusencia as TipoAusencia]}`
    : LABEL_PRESENCA[registo.estado];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-legenda font-semibold text-white"
      style={{ background: cor }}
    >
      {texto}
    </span>
  );
}

export function MarcadorPresencas({
  sessaoId,
  atletas,
  presencasIniciais,
  fechado = false,
}: {
  sessaoId: string;
  atletas: Atleta[];
  presencasIniciais: Record<string, PresencaInicial>;
  /**
   * Sessão fechada pelo treinador (`Sessao.fechado`). Quando true, a marcação de
   * presenças fica em modo só-leitura: inputs e botões desativados. Reabrir a
   * sessão (botão dedicado no topo) volta a permitir editar.
   */
  fechado?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  // Estado original (o que veio da base de dados). Atletas sem registo gravado
  // ficam por marcar (estado null) — uma sessão sem presenças começa vazia.
  const construirInicial = useCallback((): Record<string, RegistoPresenca> => {
    const inicial: Record<string, RegistoPresenca> = {};
    for (const a of atletas) {
      const existente = presencasIniciais[a.id];
      if (existente) {
        inicial[a.id] = { ...existente };
      } else {
        inicial[a.id] = {
          estado: null,
          tipoAusencia: null,
          notaAusencia: null,
        };
      }
    }
    return inicial;
  }, [atletas, presencasIniciais]);

  // Estado inicial (referência) para detetar alterações pendentes. Recalcula só
  // quando os dados do servidor mudam (ex.: após guardar + revalidate).
  const inicial = useMemo(construirInicial, [construirInicial]);

  const [registos, setRegistos] = useState<Record<string, RegistoPresenca>>(construirInicial);

  // Há alterações por guardar? Compara o estado atual com o inicial do servidor.
  const alterado = presencasAlteradas(inicial, registos);

  // Modo só-leitura: sessão fechada não permite alterar presenças.
  const soLeitura = fechado;

  // Aviso ao sair/recarregar com presenças por guardar (beforeunload). Só ativo
  // enquanto houver alterações pendentes e a sessão não estiver em só-leitura.
  useEffect(() => {
    if (!alterado || soLeitura) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [alterado, soLeitura]);

  // Só contam atletas efetivamente marcados: os que estão por marcar (null) não
  // entram em "presentes" nem em "faltas".
  const valores = Object.values(registos);
  const presentes = valores.filter((r) => r.estado != null && PRESENTES.has(r.estado)).length;
  const nPresente = valores.filter((r) => r.estado === "PRESENTE").length;
  const nAtrasado = valores.filter((r) => r.estado === "ATRASADO").length;
  const ausentes = valores.filter((r) => r.estado != null && estadoImplicaAusencia(r.estado));
  // Resumo dos ausentes por motivo, pela ordem canónica da taxonomia.
  const ausentesPorMotivo = TIPOS_AUSENCIA.map((t) => ({
    tipo: t,
    n: ausentes.filter((r) => r.tipoAusencia === t).length,
  })).filter((m) => m.n > 0);

  // Há alguma presença marcada? Base para habilitar "Repor" (limpar tudo): só faz
  // sentido quando existe pelo menos um atleta marcado — inclui presenças já
  // guardadas, permitindo limpar marcações feitas por engano após guardar.
  const haMarcacoes = valores.some((r) => r.estado != null);

  /** Presente/Atrasado: limpa motivo e nota de ausência. */
  function marcarComparencia(atletaId: string, estado: "PRESENTE" | "ATRASADO") {
    if (soLeitura) return;
    setRegistos((prev) => ({
      ...prev,
      [atletaId]: { estado, tipoAusencia: null, notaAusencia: null },
    }));
  }

  /**
   * Um toque no motivo marca AUSENTE + motivo (§8.8.2). Mantém a nota se o
   * atleta já estava ausente (só muda o motivo).
   */
  function marcarAusencia(atletaId: string, tipo: TipoAusencia) {
    if (soLeitura) return;
    setRegistos((prev) => {
      const atual = prev[atletaId];
      const jaAusente = atual.estado != null && estadoImplicaAusencia(atual.estado);
      return {
        ...prev,
        [atletaId]: {
          estado: "AUSENTE",
          tipoAusencia: tipo,
          notaAusencia: jaAusente ? (atual.notaAusencia ?? null) : null,
        },
      };
    });
  }

  function mudarNotaAusencia(atletaId: string, valor: string) {
    if (soLeitura) return;
    setRegistos((prev) => ({
      ...prev,
      [atletaId]: { ...prev[atletaId], notaAusencia: valor },
    }));
  }

  /** Marca todos os atletas como PRESENTE (limpa a classificação de ausência). */
  function marcarTodosPresentes() {
    if (soLeitura) return;
    setRegistos((prev) => {
      const proximo: Record<string, RegistoPresenca> = {};
      for (const id of Object.keys(prev))
        proximo[id] = {
          estado: "PRESENTE",
          tipoAusencia: null,
          notaAusencia: null,
        };
      return proximo;
    });
  }

  /**
   * Limpa todas as presenças, repondo cada atleta a "por marcar" (estado null).
   * Quando havia presenças guardadas, o estado passa a diferir do servidor
   * (`alterado` fica true) e o botão "Guardar presenças" persiste a limpeza —
   * `marcarPresencas` remove os registos correspondentes. Serve para desfazer
   * marcações feitas por engano (§8.5).
   */
  function repor() {
    if (soLeitura) return;
    setRegistos((prev) => {
      const proximo: Record<string, RegistoPresenca> = {};
      for (const id of Object.keys(prev))
        proximo[id] = {
          estado: null,
          tipoAusencia: null,
          notaAusencia: null,
        };
      return proximo;
    });
  }

  function guardar() {
    // Guardas defensivas: nada a fazer se a sessão está fechada ou sem alterações.
    if (soLeitura || !alterado) return;
    // Envia-se um registo por atleta quando:
    //  - está marcado (estado != null) → upsert no servidor; ou
    //  - foi limpo mas tinha presença guardada (existe em `presencasIniciais`)
    //    → estado null sinaliza a remoção do registo (Repor).
    // Atletas por marcar que nunca tiveram registo são ignorados (nada a fazer).
    const payload = atletas
      .filter((a) => registos[a.id].estado != null || presencasIniciais[a.id] != null)
      .map((a) => {
        const r = registos[a.id];
        return {
          atletaId: a.id,
          estado: r.estado, // null → limpar (remover) no servidor
          // §8.8.2 — tipo/nota de ausência (o servidor limpa-os se o estado não for ausência).
          tipoAusencia: r.tipoAusencia ?? null,
          notaAusencia: r.notaAusencia?.trim() ? r.notaAusencia : undefined,
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
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-subtitulo text-cinza-900">Presenças</h2>
        {soLeitura && (
          <span className="inline-flex items-center gap-1 rounded-full bg-cinza-100 px-2.5 py-0.5 text-legenda font-medium text-cinza-600">
            <Lock className="h-3.5 w-3.5" />
            Sessão concluída · só leitura
          </span>
        )}
      </div>

      {soLeitura && (
        <p className="text-corpo-sec text-cinza-500">
          Esta sessão está fechada. Reabre a sessão para alterar as presenças.
        </p>
      )}

      {/* Controlo rápido (P4.1) — atalhos client-side, não submetem o formulário.
          Ocultos em modo só-leitura (sessão fechada). */}
      {!soLeitura && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={marcarTodosPresentes}>
            <ListChecks className="h-4 w-4" />
            Marcar todos presentes
          </Button>
          <Button type="button" variant="ghost" onClick={repor} disabled={!haMarcacoes}>
            <RotateCcw className="h-4 w-4" />
            Repor
          </Button>
        </div>
      )}

      {/* Resumo da sessão (§8.8.2) — presentes/atrasados e ausentes por motivo.
          Sempre visível (inclui modo só-leitura) para leitura rápida. */}
      <div className="flex flex-wrap items-center gap-1.5 text-legenda">
        <span className="inline-flex items-center rounded-full bg-verde-600/10 px-2.5 py-0.5 font-semibold text-verde-600">
          {nPresente} presentes
        </span>
        <span className="inline-flex items-center rounded-full bg-ambar-600/10 px-2.5 py-0.5 font-semibold text-ambar-600">
          {nAtrasado} atrasados
        </span>
        {ausentesPorMotivo.length === 0 ? (
          <span className="inline-flex items-center rounded-full bg-cinza-100 px-2.5 py-0.5 font-semibold text-cinza-500">
            0 ausentes
          </span>
        ) : (
          ausentesPorMotivo.map((m) => (
            <span
              key={m.tipo}
              className="inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold text-white"
              style={{ background: corMotivo(m.tipo) }}
            >
              {m.n} {LABEL_TIPO_AUSENCIA[m.tipo].toLowerCase()}
            </span>
          ))
        )}
      </div>

      <ul className="space-y-2">
        {atletas.map((a) => {
          const registo = registos[a.id];
          const eAusencia = registo.estado != null && estadoImplicaAusencia(registo.estado);
          const motivos = motivosParaAtleta(a.praticaDuplaModalidade);
          return (
            <li
              key={a.id}
              className="rounded-md border border-cinza-200 bg-white p-2.5 shadow-card"
            >
              <div className="mb-2 flex min-h-[28px] items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-corpo font-medium text-cinza-900">
                  {a.numero != null && (
                    <span className="mr-1 text-cinza-400">#{a.numero}</span>
                  )}
                  {a.nome}
                </span>
                <BadgeEstado registo={registo} />
              </div>

              {/* Marcação num só passo (§8.8.2): Presente/Atrasado ou, diretamente,
                  o motivo da ausência — que fixa AUSENTE + motivo de uma vez. */}
              <div
                role="group"
                aria-label={`Marcar presença de ${a.nome}`}
                className="flex flex-wrap gap-1.5"
              >
                {COMPARENCIA.map((seg) => {
                  const ativo = registo.estado === seg.estado;
                  return (
                    <button
                      key={seg.estado}
                      type="button"
                      aria-pressed={ativo}
                      disabled={soLeitura}
                      onClick={() => marcarComparencia(a.id, seg.estado)}
                      className="flex h-11 items-center justify-center rounded-md border px-3 text-legenda font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                      style={
                        ativo
                          ? { background: seg.cor, borderColor: seg.cor, color: "#fff" }
                          : { borderColor: "#E4E1DB", color: "#6B6B6B" }
                      }
                    >
                      {LABEL_PRESENCA[seg.estado]}
                    </button>
                  );
                })}
                <span className="mx-0.5 hidden self-stretch border-l border-cinza-200 sm:block" />
                {motivos.map((t) => {
                  const ativo = eAusencia && registo.tipoAusencia === t;
                  const cor = corMotivo(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={ativo}
                      disabled={soLeitura}
                      onClick={() => marcarAusencia(a.id, t)}
                      className="flex h-11 items-center justify-center rounded-md border px-3 text-legenda font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                      style={
                        ativo
                          ? { background: cor, borderColor: cor, color: "#fff" }
                          : { borderColor: "#E4E1DB", color: "#6B6B6B" }
                      }
                    >
                      {LABEL_TIPO_AUSENCIA[t]}
                    </button>
                  );
                })}
              </div>

              {/* Nota livre opcional — visível quando o atleta está ausente. */}
              {eAusencia && (
                <div className="mt-2">
                  <label
                    htmlFor={`nota-ausencia-${a.id}`}
                    className="mb-1 block text-legenda text-cinza-500"
                  >
                    Nota da ausência (opcional)
                  </label>
                  <Input
                    id={`nota-ausencia-${a.id}`}
                    value={registo.notaAusencia ?? ""}
                    onChange={(ev) => mudarNotaAusencia(a.id, ev.target.value)}
                    disabled={soLeitura}
                    maxLength={200}
                    placeholder="Ex.: entorse no tornozelo, viagem de trabalho…"
                    className="h-11"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {/* Barra de guardar fixa (P4.2) — sempre visível ao percorrer a lista.
          Oculta em modo só-leitura (sessão fechada): não há nada a guardar. */}
      {!soLeitura && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 border-t border-cinza-200 bg-white px-1 py-3">
          <p className="text-corpo-sec text-cinza-600">
            {presentes} presentes · {ausentes.length} ausentes
          </p>
          <Button
            onClick={guardar}
            disabled={pending || !alterado}
            className="min-h-[44px] w-full sm:w-auto"
          >
            <Check className="h-4 w-4" />
            {pending
              ? "A guardar…"
              : alterado
                ? "Guardar presenças"
                : "Sem alterações"}
          </Button>
        </div>
      )}
    </section>
  );
}
