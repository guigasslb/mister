"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, PauseCircle, PlayCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  listarMembrosClube,
  alterarEstadoMembroAdmin,
  type MembroClubeAdmin,
} from "@/lib/actions/admin-membros";
import { DialogEditarUtilizador } from "@/components/admin/DialogEditarUtilizador";

// Rótulos e estilos de estado da adesão (ATIVO/INATIVO/CONVIDADO).
const LABEL_ESTADO_MEMBRO: Record<string, string> = {
  ATIVO: "Ativo",
  INATIVO: "Suspenso",
  CONVIDADO: "Convidado",
};

const ESTILO_ESTADO_MEMBRO: Record<string, string> = {
  ATIVO: "bg-verde-600/10 text-verde-600 border-verde-600/20",
  INATIVO: "bg-vermelho-600/10 text-vermelho-600 border-vermelho-600/20",
  CONVIDADO: "bg-ambar-500/15 text-ambar-600 border-ambar-500/30",
};

/**
 * Painel de gestão das contas/membros de um clube, embutido na linha expandida
 * da TabelaLicencas. Carrega os membros ao montar (só monta quando expandido),
 * e permite editar dados básicos e suspender/reativar cada conta individual.
 */
export function GestaoMembrosClube({ clubeId }: { clubeId: string }) {
  const [membros, setMembros] = useState<MembroClubeAdmin[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const res = await listarMembrosClube(clubeId);
    if (res.sucesso) {
      setMembros(res.dados);
    } else {
      setErro(res.erro);
      setMembros([]);
    }
    setCarregando(false);
  }, [clubeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function alterarEstado(membroId: string, estado: "ATIVO" | "INATIVO") {
    setPendingId(membroId);
    startTransition(async () => {
      const res = await alterarEstadoMembroAdmin({ membroId, estado });
      if (res.sucesso) {
        toast.success(estado === "INATIVO" ? "Conta suspensa" : "Conta reativada");
        await carregar();
      } else {
        toast.error(res.erro);
      }
      setPendingId(null);
    });
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-corpo-sec text-cinza-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar membros…
      </div>
    );
  }

  if (erro) {
    return (
      <p role="alert" className="px-4 py-6 text-corpo-sec text-vermelho-600">
        {erro}
      </p>
    );
  }

  if (!membros || membros.length === 0) {
    return (
      <p className="px-4 py-6 text-corpo-sec text-cinza-600">
        Este clube ainda não tem contas associadas.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-cinza-200 bg-white">
      <div className="border-b border-cinza-200 bg-cinza-50 px-4 py-2 text-legenda font-semibold uppercase tracking-wide text-cinza-500">
        Contas do clube ({membros.length})
      </div>
      <ul className="divide-y divide-cinza-100">
        {membros.map((m) => {
          const suspenso = m.estado === "INATIVO";
          const emCurso = pendingId === m.membroId;
          return (
            <li
              key={m.membroId}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-cinza-900">{m.nome}</span>
                  {m.eAdminClube && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-cinza-200 bg-cinza-50 px-2 py-0.5 text-legenda font-semibold text-cinza-700"
                      title="Administrador do clube"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      Admin
                    </span>
                  )}
                </div>
                <span className="block truncate text-legenda text-cinza-500">
                  {m.email} · {m.perfilNome}
                </span>
              </div>

              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-legenda font-semibold",
                  ESTILO_ESTADO_MEMBRO[m.estado] ??
                    "bg-cinza-100 text-cinza-600 border-cinza-200",
                )}
              >
                {LABEL_ESTADO_MEMBRO[m.estado] ?? m.estado}
              </span>

              <div className="flex items-center gap-2">
                <DialogEditarUtilizador
                  utilizadorId={m.utilizadorId}
                  nomeInicial={m.nome}
                  emailInicial={m.email}
                  onGuardado={carregar}
                />
                {suspenso ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={emCurso}
                    onClick={() => alterarEstado(m.membroId, "ATIVO")}
                  >
                    {emCurso ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlayCircle className="h-4 w-4" />
                    )}
                    Reativar
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={emCurso || m.estado === "CONVIDADO"}
                    onClick={() => alterarEstado(m.membroId, "INATIVO")}
                  >
                    {emCurso ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PauseCircle className="h-4 w-4" />
                    )}
                    Suspender
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
