// Uso de um exercício na época ativa (bíblia §8.15 / §10.2).
// Server Component: recebe o `exercicioId` e chama `obterUsoExercicio` internamente.
// Presentacional/leitura — a Server Action garante auth + RELATORIOS_VER + scope.
import Link from "next/link";
import type { TipoSessao } from "@prisma/client";
import { obterUsoExercicio } from "@/lib/actions/analise";
import { EstadoVazio } from "@/components/layout/EstadosUI";
import { Badge } from "@/components/ui/badge";
import { SecaoAnalitico, Kpi } from "./Kpi";

const LABEL_TIPO_SESSAO: Record<TipoSessao, string> = {
  NORMAL: "Normal",
  ABERTO: "Aberto",
  CAPTACAO: "Captação",
  EVENTO: "Evento",
};

/** Data PT-PT completa (ex.: "04/09/2026"). */
function formatarData(d: Date): string {
  return new Date(d).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function UsoExercicioCard({ exercicioId }: { exercicioId: string }) {
  const res = await obterUsoExercicio(exercicioId);

  // Sem permissão de relatórios ou dados indisponíveis → não polui a página de
  // detalhe; simplesmente não mostra a secção de uso.
  if (!res.sucesso) return null;

  const uso = res.dados;

  if (uso.totalUsos === 0) {
    return (
      <SecaoAnalitico titulo="Uso na época">
        <div className="rounded-lg border border-cinza-200 bg-white">
          <EstadoVazio titulo="Exercício ainda não usado nesta época." />
        </div>
      </SecaoAnalitico>
    );
  }

  const sessoes = uso.sessoes.slice(0, 10);

  return (
    <SecaoAnalitico titulo="Uso na época">
      {/* KPIs em destaque */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Nº de vezes usado */}
        <Kpi
          valor={uso.totalUsos}
          label={uso.totalUsos === 1 ? "vez usado" : "vezes usado"}
          acento="primary"
        />

        {/* Última utilização */}
        <Kpi
          valor={uso.ultimaVez ? formatarData(uso.ultimaVez) : "—"}
          label="última utilização"
          nota={
            uso.ultimaVez && uso.ultimaSessaoId ? (
              <Link
                href={`/treinos/${uso.ultimaSessaoId}`}
                aria-label={`Ver sessão de treino de ${formatarData(uso.ultimaVez)}`}
                className="rounded underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Ver sessão →
              </Link>
            ) : undefined
          }
        />

        {/* Duração média */}
        <Kpi
          valor={uso.duracaoMedia != null ? `${uso.duracaoMedia} min` : "—"}
          label="duração média"
        />
      </div>

      {/* Escalões que usam */}
      {uso.escaloes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {uso.escaloes.map((e) => (
            <span
              key={e.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-cinza-200 bg-white px-3 py-1 text-legenda text-cinza-700"
            >
              {e.nome}
              <span className="font-semibold text-primary">{e.totalUsos}</span>
            </span>
          ))}
        </div>
      )}

      {/* Lista de sessões (últimas 10) */}
      <div className="overflow-hidden rounded-lg border border-cinza-200 bg-white">
        <ul className="divide-y divide-cinza-100">
          {sessoes.map((s) => (
            <li key={s.id}>
              <Link
                href={`/treinos/${s.id}`}
                className="flex min-h-[44px] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-cinza-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <div className="min-w-0">
                  <p className="truncate text-corpo font-medium text-cinza-900">
                    {s.escalaoNome}
                  </p>
                  <p className="text-legenda text-cinza-500">{formatarData(s.dataHora)}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {s.duracaoMin != null && (
                    <span className="text-legenda tabular-nums text-cinza-500">
                      {s.duracaoMin} min
                    </span>
                  )}
                  <Badge variant="outline">{LABEL_TIPO_SESSAO[s.tipoSessao]}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {uso.totalUsos > 10 && (
        <p className="text-legenda text-cinza-400">
          A mostrar as últimas 10 de {uso.totalUsos}
        </p>
      )}
    </SecaoAnalitico>
  );
}
