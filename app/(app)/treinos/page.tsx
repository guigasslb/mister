import type { Metadata } from "next";
import Link from "next/link";
import {
  Plus,
  Dumbbell,
  MapPin,
  Users,
  List,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  LayoutTemplate,
  ChevronRight,
  CalendarPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { listarSessoes, type SessaoLista } from "@/lib/actions/treinos";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { listarPlaneamentos } from "@/lib/actions/periodizacao";
import { listarReunioes } from "@/lib/actions/reunioes";
import { obterEpocaAtiva } from "@/lib/epoca-context";
import { segundaFeira, domingo, numeroSemana, semanaSobrepoePlaneamento } from "@/lib/semana";
import { LABEL_MOMENTO_SEMANA, type MomentoSemana } from "@/lib/schemas/treino";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";
import { CalendarioTreinos } from "@/components/treinos/CalendarioTreinos";
import { AjudaPlaneamento } from "@/components/treinos/AjudaPlaneamento";

const PRESENTES = new Set(["PRESENTE", "ATRASADO"]);

export const metadata: Metadata = { title: "Treinos" };

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Ter 17 set · 20h00" */
function formatarDiaHora(data: Date): string {
  const d = new Date(data);
  const dia = capitalizar(d.toLocaleDateString("pt-PT", { weekday: "short" }).replace(".", ""));
  const mes = d.toLocaleDateString("pt-PT", { month: "short" }).replace(".", "");
  const hora = d
    .toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
    .replace(":", "h");
  return `${dia} ${d.getDate()} ${mes} · ${hora}`;
}

/** "15–21 set" (mesmo mês) ou "29 set–5 out" (meses diferentes). */
function formatarIntervaloSemana(inicio: Date, fim: Date): string {
  const mesI = inicio.toLocaleDateString("pt-PT", { month: "short" }).replace(".", "");
  const mesF = fim.toLocaleDateString("pt-PT", { month: "short" }).replace(".", "");
  if (inicio.getMonth() === fim.getMonth()) {
    return `${inicio.getDate()}–${fim.getDate()} ${mesF}`;
  }
  return `${inicio.getDate()} ${mesI}–${fim.getDate()} ${mesF}`;
}

/** YYYY-MM-DD (local) da segunda-feira, para pré-preencher «+ Treino». */
function isoData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

type SemanaGrupo = {
  chave: number;
  inicio: Date;
  fim: Date;
  numero: number;
  nome: string | null;
  sessoes: SessaoLista[];
};

export default async function TreinosPage({
  searchParams,
}: {
  searchParams: Promise<{ escalaoId?: string; vista?: string; mes?: string }>;
}) {
  const { escalaoId, vista, mes } = await searchParams;
  const ehCalendario = vista === "calendario";

  const [resEscaloes, resSessoes, resPlan, resReunioes, epoca] = await Promise.all([
    listarEscaloes(),
    listarSessoes(escalaoId),
    listarPlaneamentos(escalaoId),
    listarReunioes(),
    obterEpocaAtiva(),
  ]);

  if (!resEscaloes.sucesso) return <EstadoErro mensagem={resEscaloes.erro} />;
  if (!resSessoes.sucesso) return <EstadoErro mensagem={resSessoes.erro} />;

  const escaloes = resEscaloes.dados;
  const sessoes = resSessoes.dados;
  const planeamentos = resPlan.sucesso ? resPlan.dados : [];

  // Reuniões futuras para o calendário (§8.9.1 — eventos adicionais na vista mensal).
  const agoraReunioes = new Date();
  const reunioesFuturas = (resReunioes.sucesso ? resReunioes.dados : [])
    .filter((r) => new Date(r.data) >= agoraReunioes)
    .map((r) => ({ id: r.id, data: r.data, titulo: r.titulo }));

  // Mês a mostrar no calendário (default: mês atual)
  const agora = new Date();
  let anoCal = agora.getFullYear();
  let mesCal = agora.getMonth();
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [a, m] = mes.split("-").map(Number);
    anoCal = a;
    mesCal = m - 1;
  }
  const qsEscalao = escalaoId ? `escalaoId=${escalaoId}&` : "";
  const hrefLista = `/treinos?${qsEscalao}vista=lista`;
  const hrefCalendario = `/treinos?${qsEscalao}vista=calendario`;

  // ── Agrupamento por semana (§8.9.1): a semana é resultado do agrupamento das
  //    sessões pela data (segunda a domingo), nunca uma pré-condição. Reutiliza os
  //    helpers puros de `lib/semana`, cruzando com os planeamentos para o nome.
  const mapa = new Map<number, { inicio: Date; sessoes: SessaoLista[] }>();
  for (const s of sessoes) {
    const inicio = segundaFeira(s.data);
    const chave = inicio.getTime();
    let grupo = mapa.get(chave);
    if (!grupo) {
      grupo = { inicio, sessoes: [] };
      mapa.set(chave, grupo);
    }
    grupo.sessoes.push(s);
  }

  // Mostrar a semana atual mesmo quando vazia (estado convidativo).
  const inicioAtual = segundaFeira(agora);
  if (!mapa.has(inicioAtual.getTime())) {
    mapa.set(inicioAtual.getTime(), { inicio: inicioAtual, sessoes: [] });
  }

  const nomeSemana = (inicio: Date, fim: Date): string | null => {
    const plan = planeamentos.find(
      (p) =>
        p.nome &&
        semanaSobrepoePlaneamento(inicio, fim, new Date(p.dataInicio), new Date(p.dataFim)),
    );
    return plan?.nome ?? null;
  };

  const grupos: SemanaGrupo[] = [...mapa.values()]
    .map(({ inicio, sessoes: ss }, idx) => {
      const fim = domingo(inicio);
      return {
        chave: inicio.getTime(),
        inicio,
        fim,
        numero: epoca ? numeroSemana(new Date(epoca.dataInicio), inicio) : idx + 1,
        nome: nomeSemana(inicio, fim),
        sessoes: [...ss].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()),
      };
    })
    // Mais recente primeiro.
    .sort((a, b) => b.inicio.getTime() - a.inicio.getTime());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Treinos</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/treinos/templates">
              <LayoutTemplate className="h-4 w-4" />
              Usar template
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/treinos/periodizacao">
              <CalendarRange className="h-4 w-4" />
              Periodização
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/treinos/planos">
              <CalendarClock className="h-4 w-4" />
              Planos semanais
            </Link>
          </Button>
          <AjudaPlaneamento />
          <Button asChild>
            <Link href="/treinos/novo">
              <Plus className="h-4 w-4" />
              Nova sessão
            </Link>
          </Button>
        </div>
      </div>

      {escaloes.length > 0 && (
        <div className="-mb-px flex flex-wrap border-b border-cinza-200">
          <Link
            href="/treinos"
            className={`px-4 py-2.5 text-corpo font-medium border-b-2 transition-colors ${
              !escalaoId
                ? "border-primary text-primary"
                : "border-transparent text-cinza-600 hover:text-cinza-900"
            }`}
          >
            Todos
          </Link>
          {escaloes.map((e) => (
            <Link
              key={e.id}
              href={`/treinos?escalaoId=${e.id}`}
              className={`px-4 py-2.5 text-corpo font-medium border-b-2 transition-colors ${
                escalaoId === e.id
                  ? "border-primary text-primary"
                  : "border-transparent text-cinza-600 hover:text-cinza-900"
              }`}
            >
              {e.nome}
            </Link>
          ))}
        </div>
      )}

      {/* Toggle lista / calendário */}
      <div className="flex gap-1 rounded-md border border-cinza-200 p-1 w-fit">
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
        sessoes.length === 0 && reunioesFuturas.length === 0 ? (
          <EstadoVazio
            titulo="Sem sessões nesta época"
            descricao="Cria a primeira sessão de treino — do zero ou a partir de um template."
            acao={
              <Button asChild>
                <Link href="/treinos/novo">
                  <Plus className="h-4 w-4" />
                  Criar sessão
                </Link>
              </Button>
            }
          />
        ) : (
          <CalendarioTreinos
            sessoes={sessoes.map((s) => ({
              id: s.id,
              data: s.data,
              escalaoNome: s.escalao.nome,
            }))}
            reunioes={reunioesFuturas}
            ano={anoCal}
            mes={mesCal}
            hrefBase={hrefCalendario}
          />
        )
      ) : (
        <div className="space-y-5">
          {grupos.map((g) => {
            const hrefNovo = `/treinos/novo?data=${isoData(g.inicio)}${
              escalaoId ? `&escalaoId=${escalaoId}` : ""
            }`;
            return (
              <section
                key={g.chave}
                className="overflow-hidden rounded-lg border border-cinza-200 bg-white shadow-card"
              >
                {/* Cabeçalho da semana */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cinza-200 bg-cinza-50/70 px-4 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-corpo font-semibold text-cinza-900">
                      Semana {g.numero}
                    </span>
                    <span className="text-corpo-sec text-cinza-500">
                      · {formatarIntervaloSemana(g.inicio, g.fim)}
                    </span>
                    {g.nome && (
                      <span className="text-corpo-sec font-medium text-primary">· {g.nome}</span>
                    )}
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={hrefNovo}>
                      <Plus className="h-4 w-4" />
                      Treino
                    </Link>
                  </Button>
                </div>

                {/* Sessões da semana */}
                {g.sessoes.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                    <CalendarPlus className="h-6 w-6 text-cinza-400" />
                    <p className="text-corpo-sec text-cinza-500">
                      Sem treinos marcados esta semana.
                    </p>
                    <Button asChild size="sm">
                      <Link href={hrefNovo}>
                        <Plus className="h-4 w-4" />
                        Marcar treino
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <ul className="divide-y divide-cinza-100">
                    {g.sessoes.map((s) => {
                      const presentes = s.presencas.filter((p) => PRESENTES.has(p.estado)).length;
                      const momento = s.momentoSemana as MomentoSemana | null;
                      return (
                        <li key={s.id}>
                          <Link
                            href={`/treinos/${s.id}`}
                            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-cinza-50"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-corpo font-medium text-cinza-900">
                                  {formatarDiaHora(s.data)}
                                </span>
                                {momento && (
                                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-legenda font-medium text-primary">
                                    {LABEL_MOMENTO_SEMANA[momento]}
                                  </span>
                                )}
                                {!escalaoId && (
                                  <span className="rounded-full bg-cinza-100 px-2 py-0.5 text-legenda text-cinza-600">
                                    {s.escalao.nome}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-legenda text-cinza-500">
                                {s.local && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {s.local}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Dumbbell className="h-3.5 w-3.5" />
                                  {s._count.exercicios} exercício(s)
                                </span>
                                {s.presencas.length > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3.5 w-3.5" />
                                    {presentes}/{s.presencas.length} presentes
                                  </span>
                                )}
                              </div>
                              {s.objetivo && (
                                <p className="mt-1 line-clamp-1 text-legenda text-cinza-500">
                                  {s.objetivo}
                                </p>
                              )}
                            </div>
                            <ChevronRight className="h-5 w-5 flex-shrink-0 text-cinza-400" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
