import { EstadoVazio } from "@/components/layout/EstadosUI";
import {
  BadgeEstadoParticipacao,
  BadgeTipoParticipacao,
} from "@/components/plantel/BadgesParticipacao";
import {
  AssociarEscalaoForm,
  type EscalaoOpcao,
} from "@/components/plantel/AssociarEscalaoForm";
import { TransferirEscalaoForm } from "@/components/plantel/TransferirEscalaoForm";
import { EditarTipoParticipacaoButton } from "@/components/plantel/EditarTipoParticipacaoButton";
import { TerminarParticipacaoButton } from "@/components/plantel/TerminarParticipacaoButton";
import type { ParticipacaoHistorico } from "@/lib/actions/participacoes";

function formatarData(data: Date): string {
  return new Date(data).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatarPeriodo(dataInicio: Date, dataFim: Date | null): string {
  return dataFim
    ? `${formatarData(dataInicio)} – ${formatarData(dataFim)}`
    : `Desde ${formatarData(dataInicio)}`;
}

interface GrupoEpoca {
  epocaId: string;
  epocaNome: string;
  itens: ParticipacaoHistorico[];
}

/** Agrupa por época preservando a ordem de chegada (mais recente primeiro). */
function agruparPorEpoca(participacoes: ParticipacaoHistorico[]): GrupoEpoca[] {
  const grupos: GrupoEpoca[] = [];
  for (const p of participacoes) {
    const grupo = grupos.find((g) => g.epocaId === p.epocaId);
    if (grupo) grupo.itens.push(p);
    else grupos.push({ epocaId: p.epocaId, epocaNome: p.epocaNome, itens: [p] });
  }
  return grupos;
}

/**
 * Histórico de participações do atleta + ações de gestão (secção 8.5).
 * Componente de composição (sem estado) — as ações são Client Components.
 *
 * Gating de UI (secção 6.7): o servidor é a autoridade, mas as ações que o
 * utilizador não pode executar não são renderizadas.
 *  - `podeGerir`    → `PLANTEL_GERIR` (associar / transferir)
 *  - `podeTerminar` → `PROMOVER_ATLETAS` (terminar participação; capacidade de
 *                     clube, distinta de `PLANTEL_GERIR`)
 *  - `escaloesGeriveis` → só os escalões dentro do âmbito do membro, porque
 *                     associar exige capacidade no destino e transferir exige-a
 *                     na origem e no destino.
 */
export function ParticipacoesAtleta({
  atletaId,
  nomeAtleta,
  epocaIdAtual,
  participacoes,
  escaloesGeriveis,
  podeGerir,
  podeTerminar,
}: {
  atletaId: string;
  nomeAtleta: string;
  epocaIdAtual: string;
  participacoes: ParticipacaoHistorico[];
  escaloesGeriveis: EscalaoOpcao[];
  podeGerir: boolean;
  podeTerminar: boolean;
}) {
  const ativasNaEpoca = participacoes.filter(
    (p) => p.estado === "ATIVO" && p.epocaId === epocaIdAtual,
  );
  const escaloesDisponiveis = escaloesGeriveis.filter(
    (e) => !ativasNaEpoca.some((p) => p.escalaoId === e.id),
  );
  // Só se pode transferir a partir de uma participação num escalão gerível.
  const origensPossiveis = ativasNaEpoca.filter((p) =>
    escaloesGeriveis.some((e) => e.id === p.escalaoId),
  );
  const grupos = agruparPorEpoca(participacoes);

  return (
    <div className="space-y-5">
      {podeGerir && (
        <div className="flex flex-wrap gap-2">
          <AssociarEscalaoForm
            atletaId={atletaId}
            nomeAtleta={nomeAtleta}
            escaloesDisponiveis={escaloesDisponiveis}
          />
          <TransferirEscalaoForm
            atletaId={atletaId}
            nomeAtleta={nomeAtleta}
            participacoesAtivas={origensPossiveis.map((p) => ({
              escalaoId: p.escalaoId,
              escalaoNome: p.escalaoNome,
              numero: p.numero,
            }))}
            escaloesPossiveis={escaloesGeriveis}
          />
        </div>
      )}

      {grupos.length === 0 ? (
        <EstadoVazio
          titulo="Sem participações registadas"
          descricao={
            podeGerir
              ? "Associa o atleta a um escalão para o incluir num plantel."
              : "Este atleta ainda não pertence a nenhum plantel."
          }
          className="py-10"
        />
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <section key={g.epocaId} className="space-y-2">
              <h3 className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                {g.epocaNome}
                {g.epocaId === epocaIdAtual ? " · época ativa" : ""}
              </h3>
              <ul className="space-y-2">
                {g.itens.map((p) => {
                  const ativaNaEpoca =
                    p.estado === "ATIVO" && p.epocaId === epocaIdAtual;
                  const mostrarTerminar = ativaNaEpoca && podeTerminar;
                  // Editar o tipo (principal/simultânea/ocasional) usa a mesma
                  // capacidade de clube que terminar (PROMOVER_ATLETAS).
                  const mostrarEditar = ativaNaEpoca && podeTerminar;
                  return (
                    <li
                      key={p.id}
                      className="rounded-md border border-cinza-200 bg-white p-3 shadow-card"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="text-corpo font-semibold text-cinza-900">
                          {p.escalaoNome}
                        </span>
                        {p.numero != null && (
                          <span className="text-corpo-sec text-cinza-500">
                            #{p.numero}
                          </span>
                        )}
                        <BadgeTipoParticipacao tipo={p.tipo} />
                        <BadgeEstadoParticipacao estado={p.estado} />
                        {(mostrarEditar || mostrarTerminar) && (
                          <div className="ms-auto flex items-center gap-1">
                            {mostrarEditar && (
                              <EditarTipoParticipacaoButton
                                atletaId={atletaId}
                                escalaoId={p.escalaoId}
                                escalaoNome={p.escalaoNome}
                                tipoAtual={p.tipo}
                              />
                            )}
                            {mostrarTerminar && (
                              <TerminarParticipacaoButton
                                atletaId={atletaId}
                                nomeAtleta={nomeAtleta}
                                escalaoId={p.escalaoId}
                                escalaoNome={p.escalaoNome}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      <p className="mt-1 text-legenda text-cinza-500">
                        {formatarPeriodo(p.dataInicio, p.dataFim)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
