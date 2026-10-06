// Blocos presentacionais das AUSÊNCIAS com motivo (§8.8.2 — "perceber o porquê").
// Consomem o `ResumoAusencias` já calculado no servidor (perfil do atleta,
// tabela do escalão e total da equipa). Presentacional puro (server-safe, sem
// hooks): reutilizável na app autenticada e na vista pública de relatórios.
// Tolerante a `undefined` para não quebrar em snapshots antigos sem o campo.

import type { ResumoAusencias } from "@/lib/estatisticas";
import {
  LABEL_TIPO_AUSENCIA,
  TIPOS_AUSENCIA,
  tipoAusenciaJustificado,
} from "@/lib/schemas/treino";

interface MotivoLinha {
  tipo: (typeof TIPOS_AUSENCIA)[number];
  label: string;
  valor: number;
  /** Falso só para `SEM_MOTIVO` (falta injustificada) — destaque a vermelho. */
  justificado: boolean;
}

/** Motivos com valor > 0, pela ordem canónica da taxonomia (`TIPOS_AUSENCIA`). */
export function motivosComValor(ausencias?: ResumoAusencias): MotivoLinha[] {
  if (!ausencias?.porMotivo) return [];
  return TIPOS_AUSENCIA.filter((t) => (ausencias.porMotivo[t] ?? 0) > 0).map((t) => ({
    tipo: t,
    label: LABEL_TIPO_AUSENCIA[t],
    valor: ausencias.porMotivo[t],
    justificado: tipoAusenciaJustificado(t),
  }));
}

/** Texto plano do breakdown (ex.: "Lesão: 2 · Sem justificação: 1") para title/aria. */
export function textoAusencias(ausencias?: ResumoAusencias): string {
  const motivos = motivosComValor(ausencias);
  if (motivos.length === 0) return "Sem ausências registadas";
  return motivos.map((m) => `${m.label}: ${m.valor}`).join(" · ");
}

/** Chips de motivos (só os com valor > 0). Injustificadas destacadas a vermelho. */
export function AusenciasMotivos({ ausencias }: { ausencias?: ResumoAusencias }) {
  const motivos = motivosComValor(ausencias);
  if (motivos.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {motivos.map((m) => (
        <li
          key={m.tipo}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-legenda ${
            m.justificado
              ? "border-cinza-200 bg-cinza-50 text-cinza-700"
              : "border-vermelho-600/30 bg-vermelho-600/10 text-vermelho-600"
          }`}
        >
          {m.label}
          <span className="font-semibold tabular-nums">{m.valor}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Cartão compacto de ausências do atleta (perfil) — total + justificadas vs.
 * injustificadas e o breakdown por motivo. Legível num relance.
 */
export function ResumoAusenciasAtleta({ ausencias }: { ausencias?: ResumoAusencias }) {
  const total = ausencias?.total ?? 0;
  return (
    <div className="space-y-3 rounded-lg border border-cinza-200 bg-white p-4 shadow-card">
      <p className="text-legenda font-medium uppercase tracking-wide text-cinza-400">
        Ausências
      </p>
      {total === 0 ? (
        <p className="text-corpo-sec text-cinza-500">
          Sem ausências registadas nesta época.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="text-corpo-sec text-cinza-600">
              <span className="text-xl font-bold tabular-nums text-cinza-900">
                {total}
              </span>{" "}
              no total
            </span>
            <span className="text-corpo-sec text-cinza-600">
              <span className="text-base font-semibold tabular-nums text-verde-600">
                {ausencias!.justificadas}
              </span>{" "}
              justificadas
            </span>
            <span className="text-corpo-sec text-cinza-600">
              <span className="text-base font-semibold tabular-nums text-vermelho-600">
                {ausencias!.injustificadas}
              </span>{" "}
              injustificadas
            </span>
          </div>
          <AusenciasMotivos ausencias={ausencias} />
        </>
      )}
    </div>
  );
}

/**
 * Célula compacta de ausências para a tabela do escalão: total + badge das
 * injustificadas (quando > 0). O detalhe por motivo fica acessível via `title`
 * (hover) e `aria-label` (leitores de ecrã) — não sobrecarrega a tabela.
 */
export function AusenciasCelula({ ausencias }: { ausencias?: ResumoAusencias }) {
  const total = ausencias?.total ?? 0;
  if (total === 0) {
    return (
      <span className="text-cinza-300" aria-label="Sem ausências">
        —
      </span>
    );
  }
  const injustificadas = ausencias!.injustificadas;
  const detalhe = textoAusencias(ausencias);
  return (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums"
      title={detalhe}
      aria-label={`${total} ausência${total === 1 ? "" : "s"}: ${detalhe}`}
    >
      <span className="font-medium text-cinza-700">{total}</span>
      {injustificadas > 0 && (
        <span className="inline-flex items-center rounded-full bg-vermelho-600/10 px-1.5 text-legenda font-semibold text-vermelho-600">
          {injustificadas}
        </span>
      )}
    </span>
  );
}
