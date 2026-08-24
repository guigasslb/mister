import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, MapPin, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { obterSessao } from "@/lib/actions/treinos";
import { listarExercicios } from "@/lib/actions/exercicios";
import { listarAtletas } from "@/lib/actions/atletas";
import { obterEpocaAtiva } from "@/lib/epoca-context";
import { GestorExercicios } from "@/components/treinos/GestorExercicios";
import { resolverExercicioSessao } from "@/lib/snapshot-exercicio";
import { mostrarCargaTreino } from "@/lib/utils";
import {
  MarcadorPresencas,
  type PresencaInicial,
} from "@/components/treinos/MarcadorPresencas";
import { RegistoRpeSessao } from "@/components/treinos/RegistoRpeSessao";
import { IniciarTreinoBotao } from "@/components/treinos/IniciarTreinoBotao";
import { NotasSessao } from "@/components/treinos/NotasSessao";

function formatarDataHora(data: Date): string {
  return new Date(data).toLocaleString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const metadata: Metadata = { title: "Detalhe do treino" };

export default async function DetalheSessaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obterSessao(id);
  if (!res.sucesso) notFound();

  const s = res.dados;

  const [resExercicios, resAtletas, epoca] = await Promise.all([
    listarExercicios(),
    listarAtletas(s.escalaoId),
    obterEpocaAtiva(),
  ]);

  const biblioteca = resExercicios.sucesso ? resExercicios.dados : [];
  const atletas = resAtletas.sucesso ? resAtletas.dados : [];

  const presencasIniciais: Record<string, PresencaInicial> = {};
  for (const p of s.presencas)
    presencasIniciais[p.atletaId] = {
      estado: p.estado,
      motivo: p.motivo,
      justificacao: p.justificacao,
    };

  const foraDaEpoca =
    epoca && (new Date(s.data) < epoca.dataInicio || new Date(s.data) > epoca.dataFim);

  // §4.2.1: fallback ao snapshot quando o exercício original já não é visível (o
  // treinador saiu com o master editável) — sem "buracos". Resolvido uma vez e
  // partilhado entre o gestor de exercícios e o modo treino.
  const exerciciosResolvidos = s.exercicios.map((se) => {
    const r = resolverExercicioSessao(se);
    return {
      id: se.id,
      ordem: se.ordem,
      duracaoMin: se.duracaoMin,
      nome: r.nome,
      exercicioId: r.id ?? "",
      categoriaPrincipal: r.categoriaPrincipal,
      descricao: r.descricao,
      objetivo: r.objetivo,
      diagrama: r.diagrama,
      // Overrides por sessão (Fase 2) — lidos diretamente da linha SessaoExercicio.
      notas: se.notas ?? null,
      series: se.series ?? null,
      descricaoOverride: se.descricaoOverride ?? null,
    };
  });

  return (
    <div className="space-y-6">
      {/* Navegação */}
      <div className="flex items-center justify-between">
        <Breadcrumbs
          items={[
            { label: "Treinos", href: "/treinos" },
            { label: s.escalao.nome },
          ]}
        />
        <Button asChild variant="outline">
          <Link href={`/treinos/${s.id}/editar`}>
            <Pencil className="h-4 w-4" />
            Editar
          </Link>
        </Button>
      </div>

      {/* Cabeçalho */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="capitalize">{formatarDataHora(s.data)}</h1>
          <span className="rounded-full bg-primary/5 px-2.5 py-0.5 text-legenda text-primary">
            {s.escalao.nome}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-corpo-sec text-cinza-600">
          {s.duracaoMin && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {s.duracaoMin} min
            </span>
          )}
          {s.local && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {s.local}
            </span>
          )}
        </div>
        {s.objetivo && <p className="text-corpo text-cinza-900">Objetivo: {s.objetivo}</p>}
        {foraDaEpoca && (
          <p className="flex items-center gap-1.5 text-legenda text-ambar-600">
            <AlertTriangle className="h-4 w-4" />
            A data está fora do intervalo da época ativa.
          </p>
        )}
      </div>

      {/* Melhoria 3/4.2 — arranque do modo treino (condução em campo). */}
      <IniciarTreinoBotao
        sessaoId={s.id}
        exercicios={exerciciosResolvidos.map((e) => ({
          id: e.id,
          nome: e.nome,
          categoriaPrincipal: e.categoriaPrincipal,
          objetivo: e.objetivo,
          descricao: e.descricao,
          duracaoMin: e.duracaoMin,
          diagrama: e.diagrama,
          series: e.series,
          descricaoOverride: e.descricaoOverride,
          notas: e.notas,
        }))}
      />

      {/* Melhoria 4.3 — presenças primeiro (primeira ação antes do treino). */}
      <MarcadorPresencas
        sessaoId={s.id}
        atletas={atletas.map((a) => ({
          id: a.id,
          nome: a.nome,
          // Número da participação neste escalão (F1).
          numero: a.participacaoContexto?.numero ?? s.numeroPorAtleta[a.id] ?? null,
        }))}
        presencasIniciais={presencasIniciais}
      />

      {/* Melhoria 1/4.4 — plano de exercícios com conteúdo (diagrama, objetivo, descrição). */}
      <GestorExercicios
        sessaoId={s.id}
        exercicios={exerciciosResolvidos.map((e) => ({
          id: e.id,
          ordem: e.ordem,
          duracaoMin: e.duracaoMin,
          series: e.series,
          descricaoOverride: e.descricaoOverride,
          notas: e.notas,
          exercicio: {
            id: e.exercicioId,
            nome: e.nome,
            categoriaPrincipal: e.categoriaPrincipal,
            descricao: e.descricao,
            objetivo: e.objetivo,
            diagrama: e.diagrama,
          },
        }))}
        biblioteca={biblioteca.map((b) => ({
          id: b.id,
          nome: b.nome,
          categoriaPrincipal: b.categoriaPrincipal,
          duracaoMin: b.duracaoMin,
        }))}
      />

      {/* P4.8 (§8.20): RPE da sessão — alimenta a análise de carga/ACWR do escalão.
          `id` serve de âncora ao foco automático após terminar o modo treino.
          UX-P3-01: RPE/ACWR só em escalões de competição; oculto na formação jovem. */}
      {mostrarCargaTreino(s.escalao.nome) && (
        <div id="carga-sessao">
          <RegistoRpeSessao sessaoId={s.id} rpeInicial={s.rpeSessao} />
        </div>
      )}

      {/* Melhoria 4.6 — notas sempre visíveis e editáveis inline. */}
      <NotasSessao sessaoId={s.id} notasIniciais={s.notas} />
    </div>
  );
}
