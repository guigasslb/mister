"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  PauseCircle,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { alterarEstadoLicenca } from "@/lib/actions/admin-licencas";
import type { LicencaAdmin } from "@/lib/actions/admin-licencas";
import {
  LABEL_CICLO,
  LABEL_ESTADO_LICENCA,
  LABEL_TIER,
  LABEL_TIPO_LICENCA,
  formatarEuros,
} from "@/lib/schemas/licenciamento";
import { DialogEditarDataFim } from "@/components/admin/DialogEditarDataFim";
import { GestaoMembrosClube } from "@/components/admin/GestaoMembrosClube";
import type { EstadoLicenca } from "@prisma/client";

// Nº de colunas da tabela — usado no colSpan da linha de drill-down de membros.
const NUM_COLUNAS = 8;

// Classes de badge por estado (fundo suave + texto com contraste AA).
const ESTILO_ESTADO: Record<EstadoLicenca, string> = {
  ATIVA: "bg-verde-600/10 text-verde-600 border-verde-600/20",
  SUSPENSA: "bg-ambar-500/15 text-ambar-600 border-ambar-500/30",
  PENDENTE: "bg-ambar-500/15 text-ambar-600 border-ambar-500/30",
  CANCELADA: "bg-vermelho-600/10 text-vermelho-600 border-vermelho-600/20",
  EXPIRADA: "bg-cinza-100 text-cinza-600 border-cinza-200",
};

/** Resolve o nome do titular: clube (Clube) ou email do utilizador (Individual). */
function titularDe(l: LicencaAdmin): string {
  if (l.tipo === "CLUBE") return l.clube?.nome ?? "Clube sem nome";
  return l.utilizador?.email ?? "Utilizador sem email";
}

/** Formata a data de fim em PT-PT, ou "Sem expiração" quando null. */
function formatarDataFim(d: Date | null): string {
  if (!d) return "Sem expiração";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(d));
}

export function TabelaLicencas({ licencas }: { licencas: LicencaAdmin[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Id da licença cujo drill-down de membros está expandido (só uma de cada vez).
  const [expandida, setExpandida] = useState<string | null>(null);

  function alterarEstado(licencaId: string, estado: EstadoLicenca) {
    startTransition(async () => {
      const res = await alterarEstadoLicenca({ licencaId, estado });
      if (res.sucesso) {
        toast.success(`Licença ${LABEL_ESTADO_LICENCA[estado].toLowerCase()}`);
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  if (licencas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-cinza-200 bg-cinza-50 px-4 py-8 text-center text-corpo-sec text-cinza-600">
        Ainda não existem licenças na plataforma.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-cinza-200 bg-white">
      <table className="w-full border-collapse text-corpo">
        <thead>
          <tr className="border-b border-cinza-200 bg-cinza-50 text-left text-legenda uppercase tracking-wide text-cinza-500">
            <th className="px-4 py-3 font-semibold">Titular</th>
            <th className="px-4 py-3 font-semibold">Tipo</th>
            <th className="px-4 py-3 font-semibold">Tier</th>
            <th className="px-4 py-3 font-semibold">Estado</th>
            <th className="px-4 py-3 font-semibold">Ciclo</th>
            <th className="px-4 py-3 font-semibold">Data fim</th>
            <th className="px-4 py-3 font-semibold">Preço</th>
            <th className="px-4 py-3 text-right font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody>
          {licencas.map((l) => {
            const estado = l.estado;
            const podeAtivar = estado !== "ATIVA";
            const podeSuspender = estado === "ATIVA";
            const podeCancelar =
              estado === "ATIVA" || estado === "SUSPENSA" || estado === "PENDENTE";
            // Só licenças de Clube com clube resolvido têm gestão de membros.
            const clubeId = l.tipo === "CLUBE" ? l.clube?.id ?? null : null;
            const estaExpandida = expandida === l.id;

            return (
              <Fragment key={l.id}>
              <tr className="border-b border-cinza-100 last:border-0 align-middle">
                <td className="px-4 py-3">
                  {l.tipo === "CLUBE" ? (
                    <div className="flex items-start gap-2">
                      {clubeId && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandida(estaExpandida ? null : l.id)
                          }
                          className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded text-cinza-500 transition-colors hover:bg-cinza-100 hover:text-cinza-900"
                          aria-expanded={estaExpandida}
                          aria-label={
                            estaExpandida
                              ? "Ocultar contas do clube"
                              : "Ver contas do clube"
                          }
                        >
                          {estaExpandida ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      <div className="flex flex-col">
                        <span className="font-medium text-cinza-900">
                          {l.clube?.nome ?? "Clube sem nome"}
                        </span>
                        <span className="text-legenda text-cinza-500">
                          {l.clube?.adminEmail ?? "Sem administrador"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span className="font-medium text-cinza-900">
                      {l.utilizador?.email ?? "Utilizador sem email"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full border border-cinza-200 bg-cinza-50 px-2.5 py-0.5 text-legenda font-semibold text-cinza-700">
                    {LABEL_TIPO_LICENCA[l.tipo]}
                  </span>
                </td>
                <td className="px-4 py-3 text-cinza-600">
                  {l.tier ? LABEL_TIER[l.tier] : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-legenda font-semibold",
                      ESTILO_ESTADO[estado],
                    )}
                  >
                    {LABEL_ESTADO_LICENCA[estado]}
                  </span>
                </td>
                <td className="px-4 py-3 text-cinza-600">{LABEL_CICLO[l.ciclo]}</td>
                <td className="px-4 py-3 text-cinza-600">
                  {formatarDataFim(l.dataFim)}
                </td>
                <td className="px-4 py-3 text-cinza-600">
                  {l.precoCentimos != null ? formatarEuros(l.precoCentimos) : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {podeAtivar && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => alterarEstado(l.id, "ATIVA")}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Ativar
                      </Button>
                    )}
                    {podeSuspender && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => alterarEstado(l.id, "SUSPENSA")}
                      >
                        <PauseCircle className="h-4 w-4" />
                        Suspender
                      </Button>
                    )}
                    {podeCancelar && (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={pending}
                        onClick={() => alterarEstado(l.id, "CANCELADA")}
                      >
                        <XCircle className="h-4 w-4" />
                        Cancelar
                      </Button>
                    )}
                    <DialogEditarDataFim
                      licencaId={l.id}
                      titular={titularDe(l)}
                      dataFimInicial={l.dataFim}
                    />
                    {clubeId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setExpandida(estaExpandida ? null : l.id)
                        }
                        aria-expanded={estaExpandida}
                      >
                        <Users className="h-4 w-4" />
                        {estaExpandida ? "Ocultar contas" : "Contas"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
              {estaExpandida && clubeId && (
                <tr className="border-b border-cinza-100 bg-cinza-50/50">
                  <td colSpan={NUM_COLUNAS} className="px-4 py-3">
                    <GestaoMembrosClube clubeId={clubeId} />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
