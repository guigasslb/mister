import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Trophy, MapPin, CalendarDays } from "lucide-react";
import { obterAgendaClube, type EventoAgenda } from "@/lib/actions/agenda";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { obterEscalaoDoUtilizador, filtrarEscaloesLegiveis } from "@/lib/permissoes";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";
import { FiltroEscalaoAgenda } from "@/components/agenda/FiltroEscalaoAgenda";

export const metadata: Metadata = { title: "Agenda" };

/** Cabeçalho de dia: "seg, 12 ago". */
function formatarDia(data: Date): string {
  return new Date(data).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

/** Hora do evento: "18:30". */
function formatarHora(data: Date): string {
  return new Date(data).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Chave YYYY-MM-DD (hora local) para agrupar eventos por dia. */
function chaveDia(data: Date): string {
  const d = new Date(data);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function agruparPorDia(eventos: EventoAgenda[]): { dia: Date; eventos: EventoAgenda[] }[] {
  const grupos = new Map<string, { dia: Date; eventos: EventoAgenda[] }>();
  for (const ev of eventos) {
    const chave = chaveDia(ev.data);
    const grupo = grupos.get(chave);
    if (grupo) grupo.eventos.push(ev);
    else grupos.set(chave, { dia: new Date(ev.data), eventos: [ev] });
  }
  return [...grupos.values()];
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ escalaoId?: string }>;
}) {
  const { escalaoId: escalaoIdRaw } = await searchParams;
  // Resolução do escalão em contexto (mesmo padrão de Treinos/Plantel). `escalaoIdRaw`:
  //   undefined/"" → primeira visita: usar o escalão do treinador (ou "Todos" se null);
  //   "todos"      → sentinel explícito de «Todos os escalões» (sem filtro);
  //   "<cuid>"     → escalão específico escolhido.
  let escalaoId: string | undefined;
  if (!escalaoIdRaw || escalaoIdRaw === "") {
    const def = await obterEscalaoDoUtilizador();
    escalaoId = def ?? undefined;
  } else if (escalaoIdRaw === "todos") {
    escalaoId = undefined;
  } else {
    escalaoId = escalaoIdRaw;
  }

  const [resEscaloes, resAgenda] = await Promise.all([
    listarEscaloes(),
    obterAgendaClube({ escalaoId }),
  ]);

  if (!resEscaloes.sucesso) return <EstadoErro mensagem={resEscaloes.erro} />;
  if (!resAgenda.sucesso) return <EstadoErro mensagem={resAgenda.erro} />;

  // Filtro de escalão: só os escalões legíveis (§6.4/§6.5), alinhado com o filtro
  // server-side de `obterAgendaClube` — não oferecer escalões alheios a um treinador.
  const escaloes = await filtrarEscaloesLegiveis(resEscaloes.dados);
  const eventos = resAgenda.dados;
  const grupos = agruparPorDia(eventos);

  const escalaoNome = escalaoId
    ? escaloes.find((e) => e.id === escalaoId)?.nome
    : undefined;
  const subtitulo = escalaoNome
    ? `Treinos e jogos do escalão ${escalaoNome} · próximos 30 dias`
    : "Treinos e jogos de todos os escalões · próximos 30 dias";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Agenda</h1>
          <p className="mt-1 text-corpo-sec text-cinza-500">{subtitulo}</p>
        </div>
      </div>

      {escaloes.length > 0 && (
        <FiltroEscalaoAgenda escaloes={escaloes} escalaoId={escalaoId} />
      )}

      {eventos.length === 0 ? (
        <EstadoVazio
          titulo="Sem eventos agendados"
          descricao="Não há treinos nem jogos nos próximos 30 dias para os escalões selecionados."
        />
      ) : (
        <div className="space-y-8">
          {grupos.map(({ dia, eventos: doDia }) => (
            <section key={chaveDia(dia)} className="space-y-3">
              <h2 className="flex items-center gap-2 text-subtitulo text-cinza-900 capitalize">
                <CalendarDays className="h-4 w-4 text-cinza-400" />
                {formatarDia(dia)}
              </h2>
              <ul className="space-y-3">
                {doDia.map((ev) => {
                  const ehJogo = ev.tipo === "JOGO";
                  const href = ehJogo ? `/jogos/${ev.id}` : `/treinos/${ev.id}`;
                  const Icon = ehJogo ? Trophy : CalendarCheck;
                  return (
                    <li key={`${ev.tipo}-${ev.id}`}>
                      <Link
                        href={href}
                        className="flex items-center gap-4 rounded-lg border border-cinza-200 bg-white p-4 shadow-card transition-all hover:border-azul-300 hover:shadow-md"
                      >
                        <div className="flex flex-col items-center">
                          <Icon
                            className={`h-5 w-5 ${ehJogo ? "text-primary" : "text-cinza-400"}`}
                          />
                          <span className="mt-1 text-legenda font-medium text-cinza-500">
                            {formatarHora(ev.data)}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-corpo font-semibold text-cinza-900">
                              {ev.titulo}
                            </p>
                            <span className="rounded-full bg-primary/5 px-2.5 py-0.5 text-legenda text-primary">
                              {ev.escalaoNome}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-3 text-legenda text-cinza-500">
                            <span>{ehJogo ? "Jogo" : "Treino"}</span>
                            {ev.local && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {ev.local}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
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
