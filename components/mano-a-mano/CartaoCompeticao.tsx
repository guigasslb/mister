import Link from "next/link";
import { ChevronRight, Swords, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  LABEL_TIPO_MANO_MANO,
  LABEL_FORMATO_TORNEIO_MANO_MANO,
  LABEL_ESTADO_MANO_MANO,
} from "@/lib/schemas/mano-a-mano";
import type { CompeticaoManoManoResumo } from "@/lib/actions/mano-a-mano";
import type { EstadoManoMano } from "@prisma/client";

/** Variante do badge de estado — coerente com o ciclo de vida da competição. */
const VARIANTE_ESTADO: Record<
  EstadoManoMano,
  "default" | "secondary" | "outline"
> = {
  ATIVA: "default",
  CONCLUIDA: "secondary",
  ARQUIVADA: "outline",
};

/**
 * Cartão de uma competição Mano-a-Mano na listagem. Presentacional — liga ao
 * detalhe. Mostra o tipo, escalão, estado e um resumo de participantes/duelos.
 * `duelosRealizados` é opcional: no resumo da listagem só temos o total de
 * duelos, por isso quando não é fornecido mostramos apenas o total.
 */
export function CartaoCompeticao({
  competicao,
  duelosRealizados,
}: {
  competicao: CompeticaoManoManoResumo;
  duelosRealizados?: number;
}) {
  const c = competicao;
  const estado = c.estado as EstadoManoMano;
  const totalDuelos = c._count.matches;
  const subtitulo =
    c.tipo === "TORNEIO" && c.formatoTorneio
      ? `${LABEL_TIPO_MANO_MANO[c.tipo]} · ${LABEL_FORMATO_TORNEIO_MANO_MANO[c.formatoTorneio]}`
      : LABEL_TIPO_MANO_MANO[c.tipo];

  return (
    <Link
      href={`/mano-a-mano/${c.id}`}
      className="flex items-center gap-3 rounded-md border border-cinza-200 bg-white p-4 shadow-card transition-colors hover:bg-cinza-50"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/5">
        <Swords className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-corpo font-semibold text-cinza-900">{c.nome}</p>
          <Badge variant={VARIANTE_ESTADO[estado]}>{LABEL_ESTADO_MANO_MANO[estado]}</Badge>
        </div>
        <p className="mt-0.5 text-legenda text-cinza-500">
          {subtitulo}
          {c.escalao ? ` · ${c.escalao.nome}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-legenda text-cinza-500">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {c._count.participantes} participante(s)
          </span>
          <span className="flex items-center gap-1">
            <Swords className="h-3.5 w-3.5" />
            {duelosRealizados != null
              ? `${duelosRealizados}/${totalDuelos} duelo(s)`
              : `${totalDuelos} duelo(s)`}
          </span>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-cinza-400" />
    </Link>
  );
}
