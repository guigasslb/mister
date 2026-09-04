import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatarDataHoraLisboa } from "@/lib/utils-datas";

type SessaoCalendario = {
  id: string;
  data: Date;
  escalaoNome: string;
  /** Sessão realizada sem exercícios registados — mostra indicador de aviso. */
  precisaAtencao?: boolean;
};

type ReuniaoCalendario = {
  id: string;
  data: Date;
  titulo: string;
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

function chaveMes(ano: number, mes: number): string {
  return `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

// Índice segunda=0 ... domingo=6
function indiceSemana(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function CalendarioTreinos({
  sessoes,
  reunioes = [],
  ano,
  mes,
  hrefBase,
}: {
  sessoes: SessaoCalendario[];
  reunioes?: ReuniaoCalendario[];
  ano: number;
  mes: number; // 0-11
  hrefBase: string; // ex: "/treinos?vista=calendario"
}) {
  const primeiroDia = new Date(ano, mes, 1);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const offsetInicial = indiceSemana(primeiroDia);

  // Agrupa sessões por dia do mês corrente
  const porDia = new Map<number, SessaoCalendario[]>();
  for (const s of sessoes) {
    const d = new Date(s.data);
    if (d.getFullYear() === ano && d.getMonth() === mes) {
      const dia = d.getDate();
      const lista = porDia.get(dia) ?? [];
      lista.push(s);
      porDia.set(dia, lista);
    }
  }

  // Agrupa reuniões por dia do mês corrente
  const reunioesPorDia = new Map<number, ReuniaoCalendario[]>();
  for (const r of reunioes) {
    const d = new Date(r.data);
    if (d.getFullYear() === ano && d.getMonth() === mes) {
      const dia = d.getDate();
      const lista = reunioesPorDia.get(dia) ?? [];
      lista.push(r);
      reunioesPorDia.set(dia, lista);
    }
  }

  const mesAnterior = mes === 0 ? chaveMes(ano - 1, 11) : chaveMes(ano, mes - 1);
  const mesSeguinte = mes === 11 ? chaveMes(ano + 1, 0) : chaveMes(ano, mes + 1);

  const hoje = new Date();
  const ehHoje = (dia: number) =>
    hoje.getFullYear() === ano && hoje.getMonth() === mes && hoje.getDate() === dia;

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
          className="flex h-9 w-9 items-center justify-center rounded-md border border-cinza-200 text-cinza-600 hover:bg-cinza-50"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <p className="text-corpo font-semibold text-cinza-900 capitalize">
          {MESES[mes]} {ano}
        </p>
        <Link
          href={`${hrefBase}&mes=${mesSeguinte}`}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-cinza-200 text-cinza-600 hover:bg-cinza-50"
          aria-label="Mês seguinte"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="p-1 text-center text-legenda font-medium text-cinza-500">
            {d}
          </div>
        ))}
        {celulas.map((dia, i) => {
          if (dia === null) return <div key={`v-${i}`} />;
          const doDia = porDia.get(dia) ?? [];
          const reunioesDoDia = reunioesPorDia.get(dia) ?? [];
          return (
            <div
              key={dia}
              className={`min-h-[72px] rounded-md border p-1 ${
                ehHoje(dia) ? "border-primary bg-primary/5" : "border-cinza-200 bg-white"
              }`}
            >
              <span className="text-legenda text-cinza-500">{dia}</span>
              <div className="mt-0.5 space-y-0.5">
                {doDia.map((s) => (
                  <Link
                    key={s.id}
                    href={`/treinos/${s.id}`}
                    className="flex items-center gap-1 truncate rounded bg-primary px-1 py-0.5 text-legenda text-white hover:bg-azul-900"
                    title={
                      s.precisaAtencao
                        ? `${s.escalaoNome} · sessão sem exercícios`
                        : s.escalaoNome
                    }
                  >
                    {s.precisaAtencao && (
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full bg-ambar-500 ring-1 ring-white"
                        aria-label="Sessão sem exercícios"
                      />
                    )}
                    <span className="truncate">
                      {formatarDataHoraLisboa(s.data, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      {s.escalaoNome}
                    </span>
                  </Link>
                ))}
                {reunioesDoDia.map((r) => (
                  <Link
                    key={r.id}
                    href="/reunioes"
                    className="block truncate rounded bg-verde-600 px-1 py-0.5 text-legenda text-white hover:opacity-90"
                    title={`Reunião · ${r.titulo}`}
                  >
                    {formatarDataHoraLisboa(r.data, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    Reunião
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
