import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck,
  Trophy,
  Users,
  MapPin,
  CalendarDays,
  List,
  Plus,
} from "lucide-react";
import { obterAgendaClube, type EventoAgenda } from "@/lib/actions/agenda";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { obterEscalaoDoUtilizador, filtrarEscaloesLegiveis } from "@/lib/permissoes";
import { Button } from "@/components/ui/button";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";
import { FiltroEscalaoAgenda } from "@/components/agenda/FiltroEscalaoAgenda";
import { FiltroTipoAgenda } from "@/components/agenda/FiltroTipoAgenda";
import { CalendarioAgenda } from "@/components/agenda/CalendarioAgenda";
import { formatarDataHoraLisboa, partesDataLisboa } from "@/lib/utils-datas";

export const metadata: Metadata = { title: "Agenda" };

/** Tipos de evento aceites na URL (`?tipo=`). `todos` é o sentinel de «sem filtro». */
type TipoEvento = "TREINO" | "JOGO" | "REUNIAO";

/** Cabeçalho de dia: "seg, 12 ago". */
function formatarDia(data: Date): string {
  return formatarDataHoraLisboa(data, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

/** Hora do evento: "18:30". */
function formatarHora(data: Date): string {
  return formatarDataHoraLisboa(data, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Chave YYYY-MM-DD (fuso de Lisboa) para agrupar eventos por dia. */
function chaveDia(data: Date): string {
  const { ano, mes, dia } = partesDataLisboa(data);
  return `${ano}-${mes}-${dia}`;
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

/** Ícone, href de detalhe e rótulo pt-PT por tipo de evento. */
function apresentacao(ev: EventoAgenda): {
  Icon: typeof CalendarCheck;
  href: string;
  rotulo: string;
  destaque: boolean;
} {
  switch (ev.tipo) {
    case "JOGO":
      return { Icon: Trophy, href: `/jogos/${ev.id}`, rotulo: "Jogo", destaque: true };
    case "REUNIAO":
      return { Icon: Users, href: "/reunioes", rotulo: "Reunião", destaque: false };
    default:
      return { Icon: CalendarCheck, href: `/treinos/${ev.id}`, rotulo: "Treino", destaque: false };
  }
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    escalaoId?: string;
    tipo?: string;
    vista?: string;
    mes?: string;
  }>;
}) {
  const {
    escalaoId: escalaoIdRaw,
    tipo: tipoRaw,
    vista,
    mes,
  } = await searchParams;

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

  // Filtro por tipo: `todos`/ausente/valor inválido → sem filtro (undefined);
  // caso contrário passa o tipo diretamente à action.
  const tipoFiltro: TipoEvento | undefined =
    tipoRaw === "TREINO" || tipoRaw === "JOGO" || tipoRaw === "REUNIAO"
      ? tipoRaw
      : undefined;

  // Vista padrão: calendário. A lista só aparece com `vista=lista` explícito.
  const ehCalendario = vista !== "lista";

  // Mês a focar no calendário (default: mês atual). Guardado como 1–12 para a action
  // e para o componente de calendário, conforme o seu contrato.
  const agora = new Date();
  let anoCal = agora.getFullYear();
  let mesCal = agora.getMonth() + 1; // 1–12
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [a, m] = mes.split("-").map(Number);
    anoCal = a;
    mesCal = m;
  }

  const [resEscaloes, resAgenda] = await Promise.all([
    listarEscaloes(),
    // Vista lista → janela «próximos 30 dias» (defeito da action, sem mes/ano).
    // Vista calendário → mês focado (mes/ano 1–12).
    obterAgendaClube({
      escalaoId,
      tipo: tipoFiltro,
      ...(ehCalendario ? { mes: mesCal, ano: anoCal } : {}),
    }),
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
  const ambitoTexto = escalaoNome
    ? `do escalão ${escalaoNome}`
    : "de todos os escalões";
  const janelaTexto = ehCalendario ? "vista mensal" : "próximos 30 dias";
  const subtitulo = `Treinos, jogos e reuniões ${ambitoTexto} · ${janelaTexto}`;

  // Preserva escalão + tipo ao alternar de vista e ao navegar entre meses.
  const paramsBase = new URLSearchParams();
  if (escalaoId) paramsBase.set("escalaoId", escalaoId);
  if (tipoFiltro) paramsBase.set("tipo", tipoFiltro);
  const qs = paramsBase.toString();
  const prefixo = qs ? `${qs}&` : "";
  const hrefLista = `/agenda?${prefixo}vista=lista`;
  const hrefCalendario = `/agenda?${prefixo}vista=calendario`;
  // Base do calendário: preserva os filtros fixos (escalaoId, tipo) e a vista, SEM
  // `mes` — o componente `CalendarioAgenda` adiciona `&mes=YYYY-MM` internamente.
  const hrefBaseCalendario = hrefCalendario;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Agenda</h1>
          <p className="mt-1 text-corpo-sec text-cinza-500">{subtitulo}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/treinos/novo">
              <Plus className="h-4 w-4" />
              Nova sessão
            </Link>
          </Button>
          <Button asChild>
            <Link href="/jogos/novo">
              <Plus className="h-4 w-4" />
              Novo jogo
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/reunioes">
              <Plus className="h-4 w-4" />
              Nova reunião
            </Link>
          </Button>
        </div>
      </div>

      {/* Filtros: escalão + tipo de evento */}
      <div className="flex flex-wrap items-end gap-3">
        {escaloes.length > 0 && (
          <FiltroEscalaoAgenda escaloes={escaloes} escalaoId={escalaoId} />
        )}
        <FiltroTipoAgenda tipo={tipoFiltro} />
      </div>

      {/* Toggle lista / calendário */}
      <div className="flex w-fit gap-1 rounded-md border border-cinza-200 p-1 print:hidden">
        <Link
          href={hrefLista}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-corpo-sec font-medium transition-colors ${
            !ehCalendario ? "bg-primary text-white" : "text-cinza-600 hover:bg-cinza-50"
          }`}
        >
          <List className="h-4 w-4" />
          Lista
        </Link>
        <Link
          href={hrefCalendario}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-corpo-sec font-medium transition-colors ${
            ehCalendario ? "bg-primary text-white" : "text-cinza-600 hover:bg-cinza-50"
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          Calendário
        </Link>
      </div>

      {ehCalendario ? (
        // No calendário mostramos sempre a grelha do mês (mesmo vazia), para permitir
        // navegar entre meses — a janela da query é o mês focado.
        <CalendarioAgenda
          eventos={eventos}
          ano={anoCal}
          mes={mesCal}
          hrefBase={hrefBaseCalendario}
        />
      ) : eventos.length === 0 ? (
        <EstadoVazio
          titulo="Sem eventos agendados"
          descricao="Não há treinos, jogos nem reuniões nos próximos 30 dias para os filtros selecionados."
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
                  const { Icon, href, rotulo, destaque } = apresentacao(ev);
                  const ehJogo = ev.tipo === "JOGO";
                  return (
                    <li key={`${ev.tipo}-${ev.id}`}>
                      <Link
                        href={href}
                        className="flex items-center gap-4 rounded-lg border border-cinza-200 bg-white p-4 shadow-card transition-all hover:border-azul-300 hover:shadow-md"
                      >
                        <div className="flex flex-col items-center">
                          <Icon
                            className={`h-5 w-5 ${
                              destaque ? "text-primary" : "text-cinza-400"
                            }`}
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
                            {ehJogo && ev.casaFora && (
                              <span className="rounded-full bg-cinza-100 px-2.5 py-0.5 text-legenda text-cinza-600">
                                {ev.casaFora === "CASA" ? "Casa" : "Fora"}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-3 text-legenda text-cinza-500">
                            <span>{rotulo}</span>
                            {ev.local && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {ev.local}
                              </span>
                            )}
                          </div>
                          {ev.descricao && (
                            <p className="mt-1 line-clamp-1 text-legenda text-cinza-500">
                              {ev.descricao}
                            </p>
                          )}
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
