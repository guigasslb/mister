// Widget do feed de atividade da equipa (DT2 — §10 · gestão do Diretor Técnico).
// Cronologia unificada das ações recentes do clube (sessões e jogos criados,
// presenças marcadas, reuniões criadas) nos últimos 3 dias. Server component:
// faz o fetch internamente via `obterFeedAtividadeEquipa` (que já exige
// RELATORIOS_VER + âmbito TODO_CLUBE). Cada item liga ao respetivo recurso.

import Link from "next/link";
import {
  Calendar,
  Trophy,
  Users,
  MessageSquare,
  ChevronRight,
  Activity,
} from "lucide-react";
import {
  obterFeedAtividadeEquipa,
  type EventoAtividade,
  type TipoAtividade,
} from "@/lib/actions/analise";

const ICONE_POR_TIPO: Record<TipoAtividade, typeof Calendar> = {
  SESSAO_CRIADA: Calendar,
  JOGO_CRIADO: Trophy,
  PRESENCAS_MARCADAS: Users,
  REUNIAO_CRIADA: MessageSquare,
};

const ACAO_POR_TIPO: Record<TipoAtividade, string> = {
  SESSAO_CRIADA: "criou uma sessão",
  JOGO_CRIADO: "registou um jogo",
  PRESENCAS_MARCADAS: "marcou presenças",
  REUNIAO_CRIADA: "criou uma reunião",
};

/** Tempo relativo curto em pt-PT (ex.: "agora", "há 2h", "ontem às 18h"). */
function tempoRelativo(data: Date, agora: Date): string {
  const d = new Date(data);
  const diffMs = agora.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;

  const diffH = Math.floor(diffMin / 60);
  const hoje = new Date(agora);
  hoje.setHours(0, 0, 0, 0);
  const inicioDiaEvento = new Date(d);
  inicioDiaEvento.setHours(0, 0, 0, 0);
  const diffDias = Math.round(
    (hoje.getTime() - inicioDiaEvento.getTime()) / 86_400_000,
  );

  const horas = d.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffDias === 0) return `há ${diffH}h`;
  if (diffDias === 1) return `ontem às ${horas}`;

  return `${d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
  })} às ${horas}`;
}

export async function WidgetAtividadeEquipa() {
  const res = await obterFeedAtividadeEquipa();

  // Falha de permissão/época → não renderiza (não polui o dashboard de quem
  // não deve ver a vista de gestão de pessoas).
  if (!res.sucesso) return null;

  const eventos = res.dados;
  const agora = new Date();

  return (
    <div className="space-y-3">
      <p className="text-legenda font-semibold uppercase tracking-wide text-cinza-400">
        Atividade da equipa
      </p>

      {eventos.length === 0 ? (
        <div className="card-base flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-cinza-100 text-cinza-400">
            <Activity className="h-5 w-5" />
          </span>
          <p className="text-corpo-sec text-cinza-500">Sem atividade recente</p>
        </div>
      ) : (
        <ul className="animar-cascata space-y-2">
          {eventos.map((e) => (
            <li key={`${e.tipo}-${e.id}`}>
              <ItemAtividade evento={e} agora={agora} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemAtividade({
  evento: e,
  agora,
}: {
  evento: EventoAtividade;
  agora: Date;
}) {
  const Icon = ICONE_POR_TIPO[e.tipo];
  return (
    <Link
      href={e.href}
      className="card-base card-hover group flex items-center gap-3 p-3.5"
    >
      <span className="chip-clube flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-corpo-sec text-cinza-900">
          <span className="font-semibold">{e.autorNome}</span>{" "}
          <span className="text-cinza-600">{ACAO_POR_TIPO[e.tipo]}</span>
        </p>
        <p className="truncate text-legenda text-cinza-500">
          {e.detalhe}
          {e.escalaoNome && ` · ${e.escalaoNome}`}
        </p>
      </div>
      <span className="flex flex-shrink-0 items-center gap-1 text-legenda text-cinza-400">
        {tempoRelativo(e.quando, agora)}
        <ChevronRight className="h-4 w-4 text-cinza-300 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
