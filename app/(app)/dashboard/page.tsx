import type { Metadata } from "next";
import Link from "next/link";
import {
  Plus,
  Calendar,
  Trophy,
  Users,
  ClipboardCheck,
  UserPlus,
  CalendarPlus,
  ChevronRight,
  MapPin,
  ArrowRight,
  CalendarClock,
  Sparkles,
  Users2,
  Pin,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { obterEpocaAtiva, obterClubeIdAtual } from "@/lib/epoca-context";
import {
  obterClubeAtivo,
  obterMembroAtual,
  escaloesLegiveis,
  type ContextoMembro,
} from "@/lib/permissoes";
import { obterSeccoes } from "@/lib/actions/seccoes";
import { obterReunioesParaDashboard } from "@/lib/actions/reunioes";
import {
  obterAnaliticoClubeEpoca,
  obterEvolucaoMultiepocaClube,
  type AnaliticoClubeEpoca,
  type LinhaEvolucaoEpoca,
} from "@/lib/actions/analise";
import { WidgetAtividadeEquipa } from "@/components/dashboard/WidgetAtividadeEquipa";
import { TabelaEvolucaoEpocas } from "@/components/analiticos/TabelaEvolucaoEpocas";
import { Kpi } from "@/components/analiticos/Kpi";
import { pct } from "@/components/analiticos/Cartao";
import { EstadoVazio } from "@/components/layout/EstadosUI";
import { BadgeModalidade } from "@/components/plantel/BadgeModalidade";
import { AniversariosWidget } from "@/components/plantel/AniversariosWidget";
import {
  construirLembretesHoje,
  type EventoLite,
  type Lembrete,
} from "@/lib/dashboard-lembretes";
import { ListaLembretes } from "@/components/lembretes/ListaLembretes";
import type { Reuniao } from "@prisma/client";
import { formatarDataHoraLisboa } from "@/lib/utils-datas";

function dataLonga(data: Date): string {
  return formatarDataHoraLisboa(data, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dataCurta(data: Date): string {
  return formatarDataHoraLisboa(data, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function diasAte(data: Date): string {
  const ms = new Date(data).getTime() - Date.now();
  const dias = Math.ceil(ms / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `faltam ${dias} dias`;
}

/** Motivo subtil de campo de futsal para o cartão-herói. */
function MotivoCampo() {
  return (
    <svg
      viewBox="0 0 400 200"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.13]"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <g fill="none" stroke="#fff" strokeWidth="2">
        <rect x="8" y="8" width="384" height="184" rx="6" />
        <line x1="200" y1="8" x2="200" y2="192" />
        <circle cx="200" cy="100" r="34" />
        <circle cx="200" cy="100" r="3" fill="#fff" />
        <path d="M8 62 A60 60 0 0 1 8 138" />
        <path d="M392 62 A60 60 0 0 0 392 138" />
      </g>
    </svg>
  );
}

type PapelDashboard = "DT_ADMIN" | "PRESIDENTE" | "TREINADOR";

/**
 * Deriva o "papel" do dashboard a partir do contexto do membro (§10 — dashboards
 * por papel). Âmbito TODO_CLUBE sem capacidades de escrita de dados de equipa →
 * Presidente (direção, só leitura); com capacidades de escrita → DT/Admin.
 * Qualquer outro âmbito → Treinador (comportamento clássico do MVP).
 */
function derivarPapelDashboard(ctx: ContextoMembro | null): PapelDashboard {
  if (!ctx) return "TREINADOR";
  if (ctx.ambito === "TODO_CLUBE") {
    const capacidadesEscrita = ctx.capacidades.filter((c) =>
      ["ATLETAS_GERIR", "TREINOS_GERIR", "JOGOS_GERIR", "ESTATISTICAS_GERIR"].some(
        (e) => c.startsWith(e),
      ),
    );
    return capacidadesEscrita.length === 0 ? "PRESIDENTE" : "DT_ADMIN";
  }
  return "TREINADOR";
}

export const metadata: Metadata = { title: "Início" };

export default async function DashboardPage() {
  const session = await auth();
  const clubeId = await obterClubeIdAtual();
  const epoca = await obterEpocaAtiva();

  if (!clubeId || !epoca) {
    return (
      <div className="space-y-6">
        <h1>Início</h1>
        <EstadoVazio
          titulo="Nenhuma época ativa"
          descricao="Define uma época ativa em Definições → Épocas para começar."
          acao={
            <Button asChild>
              <Link href="/definicoes/epocas">Ir para Épocas</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const agora = new Date();

  // Janela do dia de hoje (para os lembretes in-app — F14 / §8.16).
  const inicioDia = new Date(agora);
  inicioDia.setHours(0, 0, 0, 0);
  const fimDia = new Date(agora);
  fimDia.setHours(23, 59, 59, 999);
  const janelaHoje = { gte: inicioDia, lte: fimDia };

  // §6.4/§6.5: o dashboard mostra apenas dados dos escalões que o utilizador pode
  // ler. Âmbito TODO_CLUBE (admin, DT) → "TODOS" (sem filtro); caso contrário,
  // restringe sessões/jogos/atletas/contadores aos escalões legíveis. Lista vazia
  // (treinador sem escalões atribuídos) → não mostra dados de nenhum escalão.
  const legiveis = await escaloesLegiveis();
  const filtroEscalaoId =
    legiveis === "TODOS" ? {} : { escalaoId: { in: legiveis } };
  const filtroEscalaoPorId =
    legiveis === "TODOS" ? {} : { id: { in: legiveis } };

  const [
    clube,
    proximaSessao,
    proximosJogos,
    nAtletas,
    nSessoes,
    nJogos,
    sessoesHoje,
    jogosHoje,
    escaloesContagem,
    nSessoesPorFechar,
  ] = await Promise.all([
    obterClubeAtivo(),
    prisma.sessao.findFirst({
      where: { epocaId: epoca.id, escalao: { clubeId }, data: { gte: agora }, ...filtroEscalaoId },
      include: { escalao: { select: { nome: true } } },
      orderBy: { data: "asc" },
    }),
    // Próximos jogos futuros (até 3) ordenados por data asc — para o dashboard.
    prisma.jogo.findMany({
      where: { epocaId: epoca.id, escalao: { clubeId }, data: { gte: agora }, ...filtroEscalaoId },
      include: { escalao: { select: { nome: true } } },
      orderBy: { data: "asc" },
      take: 3,
    }),
    // F1: atletas do clube com participação ativa na época (nos escalões legíveis).
    prisma.atleta.count({
      where: {
        clubeId,
        ativo: true,
        participacoes: { some: { epocaId: epoca.id, estado: "ATIVO", ...filtroEscalaoId } },
      },
    }),
    // Mini-resumo da época: apenas sessões/jogos JÁ REALIZADOS (data <= agora);
    // eventos futuros/previstos não contam para o "resumo da época".
    prisma.sessao.count({
      where: { epocaId: epoca.id, escalao: { clubeId }, data: { lte: agora }, ...filtroEscalaoId },
    }),
    prisma.jogo.count({
      where: { epocaId: epoca.id, escalao: { clubeId }, data: { lte: agora }, ...filtroEscalaoId },
    }),
    // Eventos de HOJE (para os lembretes) — sessões e jogos do clube na época.
    prisma.sessao.findMany({
      where: { epocaId: epoca.id, escalao: { clubeId }, data: janelaHoje, ...filtroEscalaoId },
      select: { id: true, data: true, local: true, escalao: { select: { nome: true } } },
      orderBy: { data: "asc" },
    }),
    prisma.jogo.findMany({
      where: { epocaId: epoca.id, escalao: { clubeId }, data: janelaHoje, ...filtroEscalaoId },
      select: {
        id: true,
        data: true,
        local: true,
        adversario: true,
        escalao: { select: { nome: true } },
      },
      orderBy: { data: "asc" },
    }),
    // Atletas ativos por escalão (contador — F14 / §8.16), restringido aos legíveis.
    prisma.escalao.findMany({
      where: { clubeId, ...filtroEscalaoPorId },
      select: {
        id: true,
        nome: true,
        seccaoId: true,
        _count: {
          select: {
            participacoes: { where: { epocaId: epoca.id, estado: "ATIVO" } },
          },
        },
      },
      orderBy: { ordem: "asc" },
    }),
    // Sessões passadas ainda por fechar (data < hoje e `fechado = false`), para
    // o aviso que incentiva o treinador a concluí-las antes de acumular (§8).
    prisma.sessao.count({
      where: {
        epocaId: epoca.id,
        escalao: { clubeId },
        data: { lt: inicioDia },
        fechado: false,
        ...filtroEscalaoId,
      },
    }),
  ]);

  // Jogo mais próximo (1.º da lista) — mantém o herói/secundário inalterados.
  // `proximosJogos` (até 3) fica disponível para a UI listar os próximos jogos.
  const proximoJogo = proximosJogos[0] ?? null;

  // Secções do clube (§8.16 v7): quando há >1 secção, os "atletas por escalão"
  // são agrupados por secção/modalidade para futsal e futebol não se confundirem.
  const resSeccoes = await obterSeccoes();
  const seccoes = resSeccoes.sucesso ? resSeccoes.dados : [];
  const multiSeccao = seccoes.length > 1;
  const seccaoPorId = new Map(seccoes.map((s) => [s.id, s]));

  // Reuniões para o dashboard, separadas em próximas (futuras) e anteriores
  // (afixadas já passadas) — §reuniões.
  const resReunioes = await obterReunioesParaDashboard();
  const reunioesProximas = resReunioes.sucesso ? resReunioes.dados.proximas : [];
  const reunioesAnteriores = resReunioes.sucesso ? resReunioes.dados.anteriores : [];
  const nomePorEscalao = new Map(escaloesContagem.map((e) => [e.id, e.nome]));

  // Lembretes in-app: treino/jogo hoje (usa os dados existentes; sem push).
  const sessoesHojeLite: EventoLite[] = sessoesHoje.map((s) => ({
    id: s.id,
    data: s.data,
    escalaoNome: s.escalao.nome,
    local: s.local,
  }));
  const jogosHojeLite: EventoLite[] = jogosHoje.map((j) => ({
    id: j.id,
    data: j.data,
    escalaoNome: j.escalao.nome,
    local: j.local,
    adversario: j.adversario,
  }));
  const lembretes = construirLembretesHoje(sessoesHojeLite, jogosHojeLite, agora);

  // Época "nova" (sem qualquer dado) → empty state motivacional.
  // `nSessoes`/`nJogos` contam só eventos JÁ REALIZADOS; para não tratar como
  // vazia uma época que só tem eventos futuros agendados, considera-se também
  // a existência de sessão/jogos futuros.
  const epocaVazia =
    nAtletas === 0 &&
    nSessoes === 0 &&
    nJogos === 0 &&
    !proximaSessao &&
    proximosJogos.length === 0;

  // Escalões com atletas (para o contador por escalão).
  const escaloesComAtletas = escaloesContagem.filter((e) => e._count.participacoes > 0);

  // Agrupamento por secção (só quando o clube tem >1 secção — §8.16 v7).
  const gruposSeccao = multiSeccao
    ? seccoes
        .map((s) => ({
          seccao: s,
          escaloes: escaloesComAtletas.filter((e) => e.seccaoId === s.id),
        }))
        .filter((g) => g.escaloes.length > 0)
    : [];

  // Qual evento é o mais próximo → vai para o herói; o outro fica como secundário.
  const sessaoT = proximaSessao ? new Date(proximaSessao.data).getTime() : Infinity;
  const jogoT = proximoJogo ? new Date(proximoJogo.data).getTime() : Infinity;
  const heroiEhJogo = jogoT < sessaoT;

  // Identidade: nome + papel (perfil) / clube · escalões · época.
  const membro = await obterMembroAtual();

  // Papel do dashboard (§10): DT/Admin, Presidente (direção, só leitura) ou
  // Treinador (comportamento clássico). Só o Presidente troca as ações rápidas
  // de escrita por KPIs de clube + mini-evolução multi-época.
  const papel = derivarPapelDashboard(membro);
  let clubeKpis: AnaliticoClubeEpoca | null = null;
  let ultimas3Epocas: LinhaEvolucaoEpoca[] = [];
  if (papel === "PRESIDENTE") {
    const [resKpis, resEvolucao] = await Promise.all([
      obterAnaliticoClubeEpoca(),
      obterEvolucaoMultiepocaClube(),
    ]);
    clubeKpis = resKpis.sucesso ? resKpis.dados : null;
    ultimas3Epocas = resEvolucao.sucesso ? resEvolucao.dados.slice(-3) : [];
  }

  const perfilNome = membro?.perfil.nome ?? "Treinador";
  const escaloesAtribuidos = membro?.escaloesAtribuidos ?? [];
  const escaloesNomes = escaloesAtribuidos.length
    ? (
        await prisma.escalao.findMany({
          where: { id: { in: escaloesAtribuidos } },
          select: { nome: true },
          orderBy: { ordem: "asc" },
        })
      ).map((e) => e.nome)
    : [];

  return (
    <div className="space-y-8">
      {/* Lembretes / tarefas persistidos — P2.1 / §3.15/§8.19.
          Movidos para o topo (antes de qualquer outro conteúdo) e com cor de
          destaque da marca (laranja) para máxima visibilidade. */}
      <ListaLembretes />

      {/* Identidade (compacto — pensado para tablet) */}
      <div>
        <p className="font-display text-[18px] font-bold leading-tight tracking-[-0.01em] text-cinza-900">
          {session?.user?.name ?? "Treinador"}{" "}
          <span className="font-medium text-cinza-500">· {perfilNome}</span>
        </p>
        <p className="mt-0.5 text-corpo-sec text-cinza-500">
          <span className="font-semibold text-cinza-900">{clube?.nome ?? "Clube"}</span>
          {escaloesNomes.length > 0 && ` · ${escaloesNomes.join(" · ")}`}
          {` · Época ${epoca.nome}`}
        </p>
      </div>

      {/* Lembretes de hoje (treino/jogo) — F14 / §8.16 */}
      {lembretes.length > 0 && <LembretesBanner lembretes={lembretes} />}

      {/* Sessões passadas por fechar — incentiva a concluir antes de acumular (§8) */}
      {nSessoesPorFechar > 0 && <BannerSessoesPorFechar n={nSessoesPorFechar} />}

      {/* Plantel vazio → atalho para a vitória rápida (F10 / §8.1) */}
      {nAtletas === 0 && <BannerVitoriaRapida />}

      {epocaVazia ? (
        <EstadoVazioEpoca />
      ) : (
        <>
      {/* Herói + secundário */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Cartão-herói: próximo evento mais próximo */}
        <div className="lg:col-span-2">
          {heroiEhJogo && proximoJogo ? (
            <div className="hero-card court-motif p-6 sm:p-7">
              <MotivoCampo />
              <div className="relative">
                <div className="flex items-center gap-2 text-corpo-sec font-semibold uppercase tracking-wide text-white/80">
                  <Trophy className="h-4 w-4" /> Próximo jogo · {diasAte(proximoJogo.data)}
                </div>
                <p className="mt-3 text-[26px] font-bold leading-tight">
                  vs {proximoJogo.adversario}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-corpo text-white/85">
                  <span className="capitalize">{dataLonga(proximoJogo.data)}</span>
                  <span>{proximoJogo.escalao.nome}</span>
                  <span>{proximoJogo.casaFora === "CASA" ? "Casa" : "Fora"}</span>
                  {proximoJogo.local && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {proximoJogo.local}
                    </span>
                  )}
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Link href={`/jogos/${proximoJogo.id}`} className="hero-btn-solid">
                    <Users className="h-4 w-4" /> Convocatória
                  </Link>
                  <Link href={`/jogos/${proximoJogo.id}`} className="hero-btn">
                    Ver jogo <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                {proximosJogos.length > 1 && (
                  <ul className="mt-3 space-y-1 border-t border-white/20 pt-3">
                    {proximosJogos.slice(1).map((j) => (
                      <li key={j.id}>
                        <Link
                          href={`/jogos/${j.id}`}
                          className="group flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-white/85 transition-colors hover:bg-white/10"
                        >
                          <Trophy className="h-3.5 w-3.5 flex-shrink-0 text-white/60" />
                          <span className="truncate">
                            vs {j.adversario}
                            <span className="text-white/60">
                              {" · "}
                              <span className="capitalize">{dataCurta(j.data)}</span>
                              {" · "}
                              {j.escalao.nome}
                            </span>
                          </span>
                          <ChevronRight className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-white/50 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : proximaSessao ? (
            <div className="hero-card court-motif p-6 sm:p-7">
              <MotivoCampo />
              <div className="relative">
                <div className="flex items-center gap-2 text-corpo-sec font-semibold uppercase tracking-wide text-white/80">
                  <Calendar className="h-4 w-4" /> Próximo treino · {diasAte(proximaSessao.data)}
                </div>
                <p className="mt-3 text-[26px] font-bold capitalize leading-tight">
                  {dataLonga(proximaSessao.data)}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-corpo text-white/85">
                  <span>{proximaSessao.escalao.nome}</span>
                  {proximaSessao.local && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {proximaSessao.local}
                    </span>
                  )}
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Link href={`/treinos/${proximaSessao.id}`} className="hero-btn-solid">
                    <ClipboardCheck className="h-4 w-4" /> Marcar presenças
                  </Link>
                  <Link href={`/treinos/${proximaSessao.id}`} className="hero-btn">
                    Ver sessão <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            /* Sem eventos futuros */
            <div className="hero-card court-motif p-6 sm:p-7">
              <MotivoCampo />
              <div className="relative">
                <p className="text-corpo-sec font-semibold uppercase tracking-wide text-white/80">
                  Agenda
                </p>
                <p className="mt-3 text-[22px] font-bold leading-tight">
                  Sem treinos ou jogos agendados
                </p>
                <p className="mt-1 text-corpo text-white/85">
                  Planeia o próximo passo da época.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Link href="/treinos/novo" className="hero-btn-solid">
                    <Plus className="h-4 w-4" /> Agendar treino
                  </Link>
                  <Link href="/jogos/novo" className="hero-btn">
                    Registar jogo <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Coluna secundária: o outro evento */}
        <div className="space-y-4">
          {heroiEhJogo ? (
            <EventoSecundario
              tipo="treino"
              titulo={proximaSessao ? dataCurta(proximaSessao.data) : null}
              sub={proximaSessao ? proximaSessao.escalao.nome : null}
              href={proximaSessao ? `/treinos/${proximaSessao.id}` : "/treinos/novo"}
              vazio="Sem treinos agendados"
            />
          ) : proximosJogos.length > 0 ? (
            <ProximosJogosSecundario jogos={proximosJogos} />
          ) : (
            <EventoSecundario
              tipo="jogo"
              titulo={null}
              sub={null}
              href="/jogos/novo"
              vazio="Sem jogos agendados"
            />
          )}

          {/* Mini-resumo */}
          <div className="card-base p-4">
            <p className="text-legenda font-semibold uppercase tracking-wide text-cinza-400">
              Época {epoca.nome}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <MiniStat valor={nAtletas} label="atletas" />
              <MiniStat valor={nSessoes} label="sessões" />
              <MiniStat valor={nJogos} label="jogos" />
            </div>
          </div>
        </div>
      </div>

      {/* Atletas por escalão (contador) — F14 / §8.16 · agrupado por secção (v7) */}
      {escaloesComAtletas.length > 0 &&
        (multiSeccao && gruposSeccao.length > 0 ? (
          <div className="space-y-5">
            <p className="text-legenda font-semibold uppercase tracking-wide text-cinza-400">
              Atletas por escalão
            </p>
            {gruposSeccao.map((g) => (
              <div key={g.seccao.id} className="space-y-3">
                <p className="flex items-center gap-2 text-corpo-sec font-semibold text-cinza-700">
                  {g.seccao.nome ?? g.seccao.modalidade}
                  <BadgeModalidade modalidade={g.seccao.modalidade} compacto />
                </p>
                <div className="animar-cascata grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {g.escaloes.map((e) => (
                    <CartaoEscalaoDashboard
                      key={e.id}
                      nome={e.nome}
                      n={e._count.participacoes}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-legenda font-semibold uppercase tracking-wide text-cinza-400">
              Atletas por escalão
            </p>
            <div className="animar-cascata grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {escaloesComAtletas.map((e) => (
                <CartaoEscalaoDashboard
                  key={e.id}
                  nome={e.nome}
                  n={e._count.participacoes}
                />
              ))}
            </div>
          </div>
        ))}

      {/* Aniversários de atletas (hoje + próximos 7 dias) */}
      <AniversariosWidget />
        </>
      )}

      {/* Próximas reuniões (futuras — afixadas ou não) */}
      {reunioesProximas.length > 0 && (
        <div className="space-y-3">
          <p className="text-legenda font-semibold uppercase tracking-wide text-cinza-400">
            Próximas reuniões
          </p>
          <div className="animar-cascata grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reunioesProximas.map((r) => (
              <CartaoReuniao key={r.id} reuniao={r} nomePorEscalao={nomePorEscalao} />
            ))}
          </div>
        </div>
      )}

      {/* Reuniões anteriores (afixadas, já passadas) */}
      {reunioesAnteriores.length > 0 && (
        <div className="space-y-3">
          <p className="text-legenda font-semibold uppercase tracking-wide text-cinza-400">
            Reuniões anteriores
          </p>
          <div className="animar-cascata grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reunioesAnteriores.map((r) => (
              <CartaoReuniao key={r.id} reuniao={r} nomePorEscalao={nomePorEscalao} />
            ))}
          </div>
        </div>
      )}

      {/* Atividade da equipa (DT2 — §10): cronologia recente, só para DT/Admin. */}
      {papel === "DT_ADMIN" && <WidgetAtividadeEquipa />}

      {/* Ações rápidas (DT/Treinador) OU resumo de direção (Presidente — §10).
          O Presidente não tem ações de escrita: em vez delas vê os grandes
          números do clube e a evolução multi-época. */}
      {papel === "PRESIDENTE" ? (
        <ResumoPresidente clubeKpis={clubeKpis} ultimas3Epocas={ultimas3Epocas} />
      ) : (
        <div className="space-y-3">
          <p className="text-legenda font-semibold uppercase tracking-wide text-cinza-400">
            Ações rápidas
          </p>
          <div className="animar-cascata grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AcaoRapida href="/treinos/novo" icon={CalendarPlus} titulo="Nova sessão" desc="Planear um treino" />
            <AcaoRapida href="/jogos/novo" icon={Trophy} titulo="Novo jogo" desc="Registar um jogo" />
            <AcaoRapida href="/plantel/novo" icon={UserPlus} titulo="Novo atleta" desc="Adicionar ao plantel" />
            <AcaoRapida href="/plantel" icon={Users} titulo="Ver plantel" desc="Consultar atletas" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Resumo de direção (Presidente — §10): KPIs de clube + evolução multi-época. */
function ResumoPresidente({
  clubeKpis,
  ultimas3Epocas,
}: {
  clubeKpis: AnaliticoClubeEpoca | null;
  ultimas3Epocas: LinhaEvolucaoEpoca[];
}) {
  return (
    <>
      {clubeKpis && (
        <div className="space-y-3">
          <p className="text-legenda font-semibold uppercase tracking-wide text-cinza-400">
            Clube · {clubeKpis.epoca.nome}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi valor={clubeKpis.totais.nAtletas} label="atletas" acento="primary" />
            <Kpi valor={clubeKpis.totais.jogos} label="jogos" />
            <Kpi
              valor={clubeKpis.totais.golosMarcados}
              label="golos marcados"
              acento="verde"
            />
            <Kpi
              valor={pct(clubeKpis.totais.taxaPresencaMediaGlobal)}
              label="presença méd."
              acento="primary"
            />
          </div>
        </div>
      )}

      {ultimas3Epocas.length >= 2 && (
        <div className="space-y-3">
          <p className="text-legenda font-semibold uppercase tracking-wide text-cinza-400">
            Evolução do clube
          </p>
          <TabelaEvolucaoEpocas linhas={ultimas3Epocas} />
        </div>
      )}
    </>
  );
}

function EventoSecundario({
  tipo,
  titulo,
  sub,
  href,
  vazio,
}: {
  tipo: "treino" | "jogo";
  titulo: string | null;
  sub: string | null;
  href: string;
  vazio: string;
}) {
  const Icon = tipo === "jogo" ? Trophy : Calendar;
  const label = tipo === "jogo" ? "Próximo jogo" : "Próximo treino";
  return (
    <Link href={href} className="card-base card-hover group block p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="chip-clube flex h-8 w-8 items-center justify-center rounded-lg">
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-legenda font-semibold uppercase tracking-wide text-cinza-400">{label}</p>
        <ChevronRight className="ml-auto h-4 w-4 text-cinza-300 transition-transform group-hover:translate-x-0.5" />
      </div>
      {titulo ? (
        <>
          <p className="text-corpo font-semibold capitalize text-cinza-900">{titulo}</p>
          {sub && <p className="text-legenda text-cinza-500">{sub}</p>}
        </>
      ) : (
        <p className="text-corpo-sec text-cinza-500">{vazio}</p>
      )}
    </Link>
  );
}

/** Cartão de reunião no dashboard (partilhado por "Próximas" e "Anteriores"). */
function CartaoReuniao({
  reuniao: r,
  nomePorEscalao,
}: {
  reuniao: Reuniao;
  nomePorEscalao: Map<string, string>;
}) {
  return (
    <Link
      href="/reunioes"
      className="card-base card-hover group flex items-center gap-3 p-4"
    >
      <span className="chip-clube flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl">
        <Users2 className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-corpo font-semibold text-cinza-900">
          {r.afixada && (
            <Pin className="h-3.5 w-3.5 flex-shrink-0 fill-primary text-primary" />
          )}
          <span className="truncate">{r.titulo}</span>
        </p>
        <p className="text-legenda text-cinza-500">
          {formatarDataHoraLisboa(r.data, {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {" · "}
          {r.ambito === "CLUBE"
            ? "Clube"
            : nomePorEscalao.get(r.escalaoId ?? "") ?? "Escalão"}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-cinza-300 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Lista dos próximos jogos na coluna secundária — 1.º em destaque, seguintes menores. */
function ProximosJogosSecundario({
  jogos,
}: {
  jogos: {
    id: string;
    data: Date;
    adversario: string;
    escalao: { nome: string };
  }[];
}) {
  const [primeiro, ...restantes] = jogos;
  return (
    <div className="card-base p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="chip-clube flex h-8 w-8 items-center justify-center rounded-lg">
          <Trophy className="h-4 w-4" />
        </span>
        <p className="text-legenda font-semibold uppercase tracking-wide text-cinza-400">
          {jogos.length === 1 ? "Próximo jogo" : "Próximos jogos"}
        </p>
      </div>

      <Link
        href={`/jogos/${primeiro.id}`}
        className="group -mx-1 block rounded-lg px-1 py-1 transition-colors hover:bg-cinza-50"
      >
        <p className="flex items-center gap-1 text-corpo font-semibold text-cinza-900">
          <span className="truncate">vs {primeiro.adversario}</span>
          <ChevronRight className="ml-auto h-4 w-4 flex-shrink-0 text-cinza-300 transition-transform group-hover:translate-x-0.5" />
        </p>
        <p className="text-legenda text-cinza-500">
          <span className="capitalize">{dataCurta(primeiro.data)}</span> ·{" "}
          {primeiro.escalao.nome}
        </p>
      </Link>

      {restantes.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-cinza-100 pt-2">
          {restantes.map((j) => (
            <li key={j.id}>
              <Link
                href={`/jogos/${j.id}`}
                className="group -mx-1 flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm text-cinza-700 transition-colors hover:bg-cinza-50"
              >
                <span className="truncate">
                  vs {j.adversario}
                  <span className="text-cinza-400">
                    {" · "}
                    <span className="capitalize">{dataCurta(j.data)}</span>
                    {" · "}
                    {j.escalao.nome}
                  </span>
                </span>
                <ChevronRight className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-cinza-300 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MiniStat({ valor, label }: { valor: number; label: string }) {
  return (
    <div>
      <p className="text-[22px] font-bold leading-none tabular-nums text-cinza-900">{valor}</p>
      <p className="mt-1 text-legenda text-cinza-500">{label}</p>
    </div>
  );
}

/** Banner de lembretes de hoje (treino/jogo) — F14 / §8.16. */
function LembretesBanner({ lembretes }: { lembretes: Lembrete[] }) {
  return (
    <div
      className="animar-entrada rounded-xl border border-ambar-500/40 bg-ambar-500/10 p-4"
      role="status"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ambar-500/20 text-ambar-600">
          <CalendarClock className="h-4 w-4" />
        </span>
        <p className="text-corpo-sec font-semibold text-cinza-900">
          {lembretes.length === 1 ? "Tens 1 evento hoje" : `Tens ${lembretes.length} eventos hoje`}
        </p>
      </div>
      <ul className="animar-cascata space-y-1.5">
        {lembretes.map((l) => (
          <li key={`${l.tipo}-${l.id}`}>
            <Link
              href={l.href}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-ambar-500/10"
            >
              {l.tipo === "jogo" ? (
                <Trophy className="h-4 w-4 flex-shrink-0 text-cinza-500" />
              ) : (
                <Calendar className="h-4 w-4 flex-shrink-0 text-cinza-500" />
              )}
              <span
                className={
                  l.passou
                    ? "text-corpo-sec text-cinza-500 line-through"
                    : "text-corpo-sec font-medium text-cinza-900"
                }
              >
                {l.titulo}
              </span>
              <span className="truncate text-legenda text-cinza-500">· {l.detalhe}</span>
              <ChevronRight className="ml-auto h-4 w-4 flex-shrink-0 text-cinza-300 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Aviso de sessões passadas por fechar (§8). Liga à lista de treinos já filtrada
 * por "Por fechar" para o treinador as concluir de uma vez.
 */
function BannerSessoesPorFechar({ n }: { n: number }) {
  return (
    <Link
      href="/treinos?vista=lista&estado=aberto"
      className="animar-entrada group flex items-center gap-3 rounded-xl border border-ambar-500/40 bg-ambar-500/10 p-4 transition-colors hover:bg-ambar-500/15"
      role="status"
    >
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-ambar-500/20 text-ambar-600">
        <CircleAlert className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-corpo font-semibold text-cinza-900">
          {n === 1
            ? "Tens 1 sessão passada por fechar"
            : `Tens ${n} sessões passadas por fechar`}
        </p>
        <p className="text-legenda text-cinza-500">
          Fecha as sessões já realizadas para manteres os registos em dia.
        </p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-cinza-400 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Atalho para o percurso de vitória rápida quando o plantel está vazio — F10 / §8.1. */
function BannerVitoriaRapida() {
  return (
    <div
      className="animar-entrada flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center"
      role="status"
    >
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-corpo font-semibold text-cinza-900">Começa em 10 minutos</p>
        <p className="text-legenda text-cinza-500">
          Monta o plantel em massa, agenda o primeiro treino e gera a primeira
          convocatória — tudo num só sítio.
        </p>
      </div>
      <Button asChild className="sm:flex-shrink-0">
        <Link href="/vitoria-rapida">
          Começar <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

/** Estado vazio motivacional para época sem qualquer dado — F14 / §12.0/13.1. */
function EstadoVazioEpoca() {
  return (
    <div className="hero-card flex flex-col items-center p-8 text-center sm:p-10">
      <MotivoCampo />
      <div className="relative flex flex-col items-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
          <Sparkles className="h-7 w-7" />
        </span>
        <p className="text-[22px] font-bold leading-tight">A época está pronta a arrancar</p>
        <p className="mt-1 max-w-md text-corpo text-white/85">
          Ainda não há atletas, treinos ou jogos. Começa por montar o plantel e agendar o
          primeiro treino — o resto do dashboard preenche-se sozinho com o uso.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/plantel/novo" className="hero-btn-solid">
            <UserPlus className="h-4 w-4" /> Adicionar atleta
          </Link>
          <Link href="/treinos/novo" className="hero-btn">
            Agendar treino <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Cartão de contador de atletas por escalão (dashboard — §8.16). */
function CartaoEscalaoDashboard({ nome, n }: { nome: string; n: number }) {
  return (
    <Link href="/plantel" className="card-base card-hover group flex items-center gap-3 p-4">
      <span className="chip-clube flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl">
        <Users className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-corpo font-semibold text-cinza-900">{nome}</p>
        <p className="text-legenda text-cinza-500">
          <span className="tabular-nums font-semibold text-cinza-700">{n}</span>{" "}
          {n === 1 ? "atleta" : "atletas"}
        </p>
      </div>
    </Link>
  );
}

function AcaoRapida({
  href,
  icon: Icon,
  titulo,
  desc,
}: {
  href: string;
  icon: typeof Plus;
  titulo: string;
  desc: string;
}) {
  return (
    <Link href={href} className="card-base card-hover group flex items-center gap-3 p-4">
      <span className="chip-clube flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex-1">
        <p className="text-corpo font-semibold text-cinza-900">{titulo}</p>
        <p className="text-legenda text-cinza-500">{desc}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-cinza-300 transition-transform group-hover:translate-x-0.5 group-hover:text-cinza-400" />
    </Link>
  );
}
