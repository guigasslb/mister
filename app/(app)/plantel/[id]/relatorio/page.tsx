import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { obterAtleta, obterEstatisticasAtleta } from "@/lib/actions/atletas";
import { obterCadernetaAtleta } from "@/lib/actions/caderneta";
import { AvatarAtleta } from "@/components/plantel/AvatarAtleta";
import { BotaoImprimir } from "@/components/relatorios/BotaoImprimir";
import { LABEL_POSICAO } from "@/lib/schemas/atleta";

function Cartao({ valor, label }: { valor: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-cinza-200 bg-white p-3">
      <span className="text-titulo-seccao font-bold text-primary">{valor}</span>
      <span className="text-legenda text-cinza-500">{label}</span>
    </div>
  );
}

export const metadata: Metadata = { title: "Relatório do atleta" };

export default async function RelatorioAtletaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obterAtleta(id);
  if (!res.sucesso) notFound();
  const a = res.dados;
  const eGR = a.posicoes.includes("GUARDA_REDES");

  const [resStats, resCad] = await Promise.all([
    obterEstatisticasAtleta(id),
    obterCadernetaAtleta(id),
  ]);

  const desbloqueadas = resCad.sucesso
    ? resCad.dados.filter((h) => h.estado === "DESBLOQUEADO").length
    : 0;
  const totalHab = resCad.sucesso ? resCad.dados.length : 0;

  const meta: string[] = [];
  if (a.posicoes.length) meta.push(a.posicoes.map((p) => LABEL_POSICAO[p]).join(", "));
  if (a.participacaoContexto?.numero != null)
    meta.push(`#${a.participacaoContexto.numero}`);
  for (const p of a.participacoes) meta.push(p.escalaoNome);
  meta.push(a.epocaNome);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/plantel/${id}`} className="flex items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Perfil
        </Link>
        <BotaoImprimir label="Imprimir / Guardar PDF" />
      </div>

      {/* Cabeçalho do relatório */}
      <div className="flex items-center gap-5 border-b border-cinza-200 pb-5">
        <AvatarAtleta nome={a.nome} tamanho="xl" />
        <div>
          <h1 className="leading-tight">{a.nome}</h1>
          <p className="mt-1 text-corpo-sec text-cinza-600">{meta.join(" · ")}</p>
          <p className="text-legenda text-cinza-400">Relatório de desenvolvimento — {a.epocaNome}</p>
        </div>
      </div>

      {resStats.sucesso && (
        <div>
          <h2 className="mb-3 text-subtitulo text-cinza-900">Estatísticas</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {eGR ? (
              <>
                <Cartao valor={resStats.dados.totalDefesas ?? 0} label="defesas" />
                <Cartao valor={resStats.dados.totalGolosSofridos ?? 0} label="sofridos" />
              </>
            ) : (
              <>
                <Cartao valor={resStats.dados.totalGolos} label="golos" />
                <Cartao valor={resStats.dados.totalAssistencias} label="assist." />
              </>
            )}
            <Cartao valor={resStats.dados.jogosUtilizados} label="jogos" />
            <Cartao valor={resStats.dados.titularidades} label="titular" />
            <Cartao valor={`${Math.round(resStats.dados.taxaPresenca * 100)}%`} label="presenças" />
            {/* Minutos: `totalMinutos` (registo minuto-a-minuto) tem prioridade;
                quando o tempo é registado por blocos, `totalMinutos` é null e o
                valor consolidado está em `tempoJogoAcumulado` (§10.1). Só "—"
                quando nenhuma das duas formas foi registada. */}
            <Cartao
              valor={resStats.dados.totalMinutos ?? (resStats.dados.tempoJogoAcumulado || "—")}
              label="minutos"
            />
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-subtitulo text-cinza-900">Caderneta</h2>
        <p className="text-corpo-sec text-cinza-600">
          {desbloqueadas} de {totalHab} habilidades desbloqueadas.
        </p>
        {resCad.sucesso && desbloqueadas > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {resCad.dados
              .filter((h) => h.estado === "DESBLOQUEADO")
              .map((h) => (
                <li key={h.id} className="rounded-full bg-verde-600/10 px-2.5 py-0.5 text-legenda text-verde-600">
                  {h.nome}
                </li>
              ))}
          </ul>
        )}
      </div>

      {a.observacoes && (
        <div>
          <h2 className="mb-2 text-subtitulo text-cinza-900">Observações do treinador</h2>
          <p className="text-corpo text-cinza-900 whitespace-pre-wrap">{a.observacoes}</p>
        </div>
      )}
    </div>
  );
}
