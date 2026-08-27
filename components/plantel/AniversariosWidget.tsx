import Link from "next/link";
import { Cake, PartyPopper, ChevronRight } from "lucide-react";
import { obterAniversariosProximos } from "@/lib/actions/atletas";
import { AvatarAtleta } from "@/components/plantel/AvatarAtleta";

/** Legenda de quando faz anos: "hoje", "amanhã", "em N dias". */
function legendaDias(diasAte: number): string {
  if (diasAte <= 0) return "faz anos hoje";
  if (diasAte === 1) return "faz anos amanhã";
  return `faz anos em ${diasAte} dias`;
}

/**
 * Widget de aniversários de atletas (dashboard/plantel).
 * Server Component: lê os próximos aniversários e destaca os de hoje.
 * Retorna `null` quando não há aniversários ou em caso de erro.
 */
export async function AniversariosWidget() {
  const res = await obterAniversariosProximos();
  if (!res.sucesso || res.dados.length === 0) return null;

  const hoje = res.dados.filter((a) => a.eHoje);
  const proximos = res.dados.filter((a) => !a.eHoje);

  if (hoje.length === 0 && proximos.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-legenda font-semibold uppercase tracking-wide text-cinza-400 mb-3 flex items-center gap-2">
        <Cake className="h-4 w-4" /> Aniversários
      </h2>

      {/* Aniversários de hoje — destaque com a cor do clube */}
      {hoje.length > 0 && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mb-4">
          <p className="mb-3 flex items-center gap-2 text-corpo-sec font-bold text-cinza-900">
            <PartyPopper className="h-4 w-4 text-primary" /> Hoje
          </p>
          <ul className="space-y-2">
            {hoje.map((atleta) => (
              <li key={atleta.id}>
                <Link
                  href={`/plantel/${atleta.id}`}
                  className="group flex items-center gap-3 rounded-lg px-1.5 py-1 transition-colors hover:bg-primary/10"
                >
                  <AvatarAtleta nome={atleta.nome} fotoUrl={atleta.fotoUrl} tamanho="sm" />
                  <span className="min-w-0 flex-1 truncate text-corpo font-semibold text-cinza-900">
                    {atleta.nome}
                    <span className="ml-1 font-medium text-primary">
                      faz {atleta.idadeCompleta} anos
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-primary/50 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Próximos 7 dias */}
      {proximos.length > 0 && (
        <div className="animar-cascata grid gap-2">
          {proximos.map((atleta) => (
            <Link
              key={atleta.id}
              href={`/plantel/${atleta.id}`}
              className="card-base card-hover group flex items-center gap-3 p-3"
            >
              <span className="chip-clube flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg">
                <Cake className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-corpo font-semibold text-cinza-900">
                  {atleta.nome}
                </p>
                <p className="text-legenda text-cinza-500">
                  {legendaDias(atleta.diasAte)} ·{" "}
                  <span className="tabular-nums">{atleta.idadeCompleta}</span> anos
                </p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-cinza-300 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
