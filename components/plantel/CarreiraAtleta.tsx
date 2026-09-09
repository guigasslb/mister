import { EstadoVazio } from "@/components/layout/EstadosUI";
import { Badge } from "@/components/ui/badge";
import { BadgeEstadoParticipacao } from "@/components/plantel/BadgesParticipacao";
import { obterCarreiraAtleta } from "@/lib/actions/participacoes";
import { formatarDataHoraLisboa } from "@/lib/utils-datas";

function formatarData(data: Date): string {
  return formatarDataHoraLisboa(data, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatarPeriodo(dataIngresso: Date, dataSaida: Date | null): string {
  return dataSaida
    ? `${formatarData(dataIngresso)} – ${formatarData(dataSaida)}`
    : `Desde ${formatarData(dataIngresso)}`;
}

/**
 * Percurso do atleta ao longo das épocas (aba «Carreira» do perfil, secção 8.5).
 * Server Component só-de-leitura: lê o percurso via `obterCarreiraAtleta` (que
 * valida sessão, clube e âmbito de escalões). A época atual (ativa) é assinalada
 * com um distintivo; as ações de gestão vivem na aba «Participações».
 */
export async function CarreiraAtleta({ atletaId }: { atletaId: string }) {
  const res = await obterCarreiraAtleta(atletaId);

  if (!res.sucesso) {
    return <p className="text-corpo-sec text-vermelho-600">{res.erro}</p>;
  }

  if (res.dados.length === 0) {
    return (
      <EstadoVazio
        titulo="Sem historial de épocas anteriores"
        descricao="À medida que o atleta participar em escalões e épocas, o seu percurso aparece aqui."
        className="py-10"
      />
    );
  }

  return (
    <ul className="space-y-2">
      {res.dados.map((etapa) => (
        <li
          key={etapa.id}
          className="rounded-md border border-cinza-200 bg-white p-3 shadow-card"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-corpo font-semibold text-cinza-900">
              {etapa.epocaNome}
            </span>
            {etapa.epocaAtiva && <Badge>Época ativa</Badge>}
            <span aria-hidden className="text-cinza-300">
              ·
            </span>
            <span className="text-corpo text-cinza-700">{etapa.escalaoNome}</span>
            {etapa.numero != null && (
              <span className="text-corpo-sec text-cinza-500">#{etapa.numero}</span>
            )}
            <BadgeEstadoParticipacao estado={etapa.estado} className="ms-auto" />
          </div>
          <p className="mt-1 text-legenda text-cinza-500">
            {formatarPeriodo(etapa.dataIngresso, etapa.dataSaida)}
          </p>
        </li>
      ))}
    </ul>
  );
}
