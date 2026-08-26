import Link from "next/link";
import type { AtletaComParticipacao } from "@/lib/actions/atletas";
import { BadgeInscricao } from "@/components/plantel/BadgeInscricao";

/**
 * Vista de inscrição do plantel (secção 8 — plantel).
 *
 * Lista focada nos dados relevantes para tratar a inscrição de cada atleta:
 * nome, idade/data de nascimento, encarregado de educação (nome + contacto) e
 * estado de inscrição. Componente puro (Server Component) — cada linha é um
 * `Link` para o perfil, com alvo de toque ≥44px (mobile-first).
 */

function calcularIdade(dataNascimento: Date): number {
  const hoje = new Date();
  const nasc = new Date(dataNascimento);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

function formatarData(date: Date): string {
  return new Date(date).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Grelha partilhada pelo cabeçalho e pelas linhas (md+): mantém as colunas
// alinhadas. Em mobile cada linha empilha os campos verticalmente.
const GRELHA =
  "md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-4";

export function ListaInscricoes({ atletas }: { atletas: AtletaComParticipacao[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-cinza-200 bg-white shadow-card">
      {/* Cabeçalho (só md+) */}
      <div
        className={`${GRELHA} hidden border-b border-cinza-200 bg-cinza-50 px-4 py-2.5 text-legenda font-medium uppercase tracking-wide text-cinza-500`}
      >
        <span>Nome</span>
        <span>Idade / Nascimento</span>
        <span>Encarregado de educação</span>
        <span>Contacto</span>
        <span className="text-right md:text-left">Inscrição</span>
      </div>

      <ul className="divide-y divide-cinza-100">
        {atletas.map((a) => {
          const idade = a.dataNascimento ? calcularIdade(a.dataNascimento) : null;
          return (
            <li key={a.id}>
              <Link
                href={`/plantel/${a.id}`}
                className={`${GRELHA} flex min-h-[44px] flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-cinza-50 focus-visible:bg-cinza-50 focus-visible:outline-none ${
                  a.ativo ? "" : "opacity-60"
                }`}
              >
                {/* Nome */}
                <span className="flex items-center gap-2 truncate text-corpo font-semibold text-cinza-900">
                  {a.nome}
                  {!a.ativo && (
                    <span className="inline-flex items-center rounded-full border border-cinza-300 bg-cinza-100 px-2 py-0.5 text-legenda font-medium text-cinza-600">
                      Inativo
                    </span>
                  )}
                </span>

                {/* Idade / nascimento */}
                <span className="text-corpo-sec text-cinza-600">
                  <span className="text-cinza-400 md:hidden">Idade: </span>
                  {idade != null && a.dataNascimento
                    ? `${idade} anos · ${formatarData(a.dataNascimento)}`
                    : "—"}
                </span>

                {/* Encarregado */}
                <span className="truncate text-corpo-sec text-cinza-600">
                  <span className="text-cinza-400 md:hidden">Encarregado: </span>
                  {a.encarregadoNome ?? "—"}
                </span>

                {/* Contacto */}
                <span className="truncate text-corpo-sec text-cinza-600">
                  <span className="text-cinza-400 md:hidden">Contacto: </span>
                  {a.encarregadoContacto ?? "—"}
                </span>

                {/* Estado de inscrição */}
                <span className="pt-0.5 md:pt-0">
                  <BadgeInscricao inscrito={a.inscrito} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
