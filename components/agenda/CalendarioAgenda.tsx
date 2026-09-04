import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CasaFora, TipoJogo, TipoSessao } from "@prisma/client";
import { formatarDataHoraLisboa } from "@/lib/utils-datas";

// Forma completa do evento da agenda unificada (treinos + jogos + reuniões).
// Definida localmente (e não importada de `lib/actions/agenda`) para que o
// componente fique desacoplado do estado exato dessa action durante a
// evolução em paralelo: qualquer `EventoAgenda` (com discriminador mais
// estreito ou já alargado a "REUNIAO") é estruturalmente compatível com este
// contrato — um `tipo` mais estreito é atribuível a este mais largo e os
// campos específicos por tipo são opcionais.
type EventoAgenda = {
  id: string;
  tipo: "TREINO" | "JOGO" | "REUNIAO";
  data: Date;
  titulo: string;
  escalaoNome: string;
  local?: string | null;
  tipoSessao?: TipoSessao; // só para TREINO
  tipoJogo?: TipoJogo; // só para JOGO
  casaFora?: CasaFora; // só para JOGO
  descricao?: string; // só para REUNIAO
  /** Só para TREINO: sessão realizada sem exercícios → indicador âmbar na pill. */
  precisaAtencao?: boolean;
};

type Props = {
  eventos: EventoAgenda[];
  ano: number;
  mes: number; // 1-12
  /** URL base preservando os restantes params (ex.: "/agenda?escalaoId=xxx&tipo=todos"). */
  hrefBase: string;
};

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

// Rótulo pt-PT por tipo, usado no title (tooltip) das pills.
const ROTULO_TIPO: Record<EventoAgenda["tipo"], string> = {
  TREINO: "Treino",
  JOGO: "Jogo",
  REUNIAO: "Reunião",
};

// Estilo da pill por tipo (spec da agenda unificada).
const PILL_CLS: Record<EventoAgenda["tipo"], string> = {
  TREINO: "bg-primary text-primary-foreground hover:bg-primary/90",
  JOGO: "bg-amber-500 text-white hover:bg-amber-600",
  REUNIAO: "bg-emerald-600 text-white hover:bg-emerald-700",
};

/** Destino de cada evento por tipo. Reunião não tem rota de detalhe → lista. */
function hrefEvento(ev: EventoAgenda): string {
  switch (ev.tipo) {
    case "TREINO":
      return `/treinos/${ev.id}`;
    case "JOGO":
      return `/jogos/${ev.id}`;
    case "REUNIAO":
      return "/reunioes";
  }
}

/** Chave YYYY-MM (mês em base 1) para a navegação de mês na URL. */
function chaveMes(ano: number, mes1: number): string {
  return `${ano}-${String(mes1).padStart(2, "0")}`;
}

// Índice segunda=0 ... domingo=6
function indiceSemana(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function formatarHora(data: Date): string {
  return formatarDataHoraLisboa(data, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Calendário mensal multi-tipo da agenda unificada (treinos + jogos + reuniões).
 * Fork de `CalendarioTreinos`, com pills e destinos por tipo. `mes` é 1-12; a
 * navegação de mês acrescenta `&mes=YYYY-MM` ao `hrefBase`, preservando os
 * restantes filtros (escalaoId, tipo, vista) já presentes nesse `hrefBase`.
 */
export function CalendarioAgenda({ eventos, ano, mes, hrefBase }: Props) {
  const mesIdx = mes - 1; // 0-11 para a aritmética de Date
  const primeiroDia = new Date(ano, mesIdx, 1);
  const diasNoMes = new Date(ano, mesIdx + 1, 0).getDate();
  const offsetInicial = indiceSemana(primeiroDia);

  // Agrupa eventos por dia do mês corrente, mantendo a ordem cronológica recebida.
  const porDia = new Map<number, EventoAgenda[]>();
  for (const ev of eventos) {
    const d = new Date(ev.data);
    if (d.getFullYear() === ano && d.getMonth() === mesIdx) {
      const dia = d.getDate();
      const lista = porDia.get(dia) ?? [];
      lista.push(ev);
      porDia.set(dia, lista);
    }
  }

  const mesAnterior =
    mes === 1 ? chaveMes(ano - 1, 12) : chaveMes(ano, mes - 1);
  const mesSeguinte =
    mes === 12 ? chaveMes(ano + 1, 1) : chaveMes(ano, mes + 1);

  const hoje = new Date();
  const ehHoje = (dia: number) =>
    hoje.getFullYear() === ano &&
    hoje.getMonth() === mesIdx &&
    hoje.getDate() === dia;

  // Células: espaços vazios iniciais + dias do mês
  const celulas: (number | null)[] = [
    ...Array.from({ length: offsetInicial }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link
          href={`${hrefBase}&mes=${mesAnterior}`}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-cinza-200 text-cinza-600 hover:bg-cinza-50"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <p className="text-corpo font-semibold text-cinza-900 capitalize">
          {MESES[mesIdx]} {ano}
        </p>
        <Link
          href={`${hrefBase}&mes=${mesSeguinte}`}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-cinza-200 text-cinza-600 hover:bg-cinza-50"
          aria-label="Mês seguinte"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DIAS_SEMANA.map((d) => (
          <div
            key={d}
            className="p-1 text-center text-legenda font-medium text-cinza-500"
          >
            {d}
          </div>
        ))}
        {celulas.map((dia, i) => {
          if (dia === null) return <div key={`v-${i}`} />;
          const doDia = porDia.get(dia) ?? [];
          return (
            <div
              key={dia}
              className={`min-h-[72px] rounded-md border p-1 ${
                ehHoje(dia)
                  ? "border-primary bg-primary/5"
                  : "border-cinza-200 bg-white"
              }`}
            >
              <span className="text-legenda text-cinza-500">{dia}</span>
              <div className="mt-0.5 space-y-0.5">
                {doDia.map((ev) => (
                  <Link
                    key={`${ev.tipo}-${ev.id}`}
                    href={hrefEvento(ev)}
                    className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-legenda ${PILL_CLS[ev.tipo]}`}
                    title={
                      ev.precisaAtencao
                        ? `${ROTULO_TIPO[ev.tipo]} · ${ev.titulo} · ${ev.escalaoNome} · sessão sem exercícios`
                        : `${ROTULO_TIPO[ev.tipo]} · ${ev.titulo} · ${ev.escalaoNome}`
                    }
                  >
                    {ev.precisaAtencao && (
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full bg-ambar-500 ring-1 ring-white"
                        aria-label="Sessão sem exercícios"
                      />
                    )}
                    <span className="truncate">
                      {formatarHora(ev.data)} {ev.titulo}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
