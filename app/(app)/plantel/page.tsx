import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import type { Modalidade } from "@prisma/client";
import { Plus, AlertTriangle, FileBarChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listarAtletas } from "@/lib/actions/atletas";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { obterSeccoes } from "@/lib/actions/seccoes";
import { escaloesLegiveis } from "@/lib/permissoes";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";
import { CampoPesquisa } from "@/components/layout/CampoPesquisa";
import { AvatarAtleta } from "@/components/plantel/AvatarAtleta";
import { BadgeTipoParticipacao } from "@/components/plantel/BadgesParticipacao";
import { BadgeModalidade } from "@/components/plantel/BadgeModalidade";
import { FiltroInativos } from "@/components/plantel/FiltroInativos";
import { ABREV_POSICAO } from "@/lib/schemas/atleta";
import { mapaModalidadePorEscalao } from "@/lib/modalidade-escalao";

export const metadata: Metadata = { title: "Plantel" };

const ROTULO_MODALIDADE: Record<Modalidade, string> = {
  FUTSAL: "Futsal",
  FUTEBOL: "Futebol",
};

const CLS_TAB_BASE =
  "px-4 py-2.5 text-corpo font-medium border-b-2 transition-colors";
const CLS_TAB_ATIVO = "border-primary text-primary";
const CLS_TAB_INATIVO =
  "border-transparent text-cinza-600 hover:text-cinza-900";

export default async function PlantelPage({
  searchParams,
}: {
  searchParams: Promise<{
    escalaoId?: string;
    seccaoId?: string;
    q?: string;
    incluirInativos?: string;
  }>;
}) {
  const {
    escalaoId: escalaoIdRaw,
    seccaoId: seccaoIdRaw,
    q,
    incluirInativos: incluirInativosRaw,
  } = await searchParams;
  // Query params não confiáveis: valida como CUID; inválido/ausente → sem filtro.
  const escParse = z.string().cuid().safeParse(escalaoIdRaw);
  const escalaoId = escParse.success ? escParse.data : undefined;
  const secParse = z.string().cuid().safeParse(seccaoIdRaw);
  const seccaoIdParam = secParse.success ? secParse.data : undefined;
  // Por defeito o plantel mostra só ativos; `?incluirInativos=1` inclui os que
  // saíram ou estão em período experimental (secção 8 — plantel).
  const incluirInativos = incluirInativosRaw === "1";

  const [resEscaloes, resSeccoes, resAtletas, legiveis] = await Promise.all([
    listarEscaloes(),
    obterSeccoes(),
    listarAtletas(escalaoId, undefined, undefined, incluirInativos),
    escaloesLegiveis(),
  ]);

  if (!resEscaloes.sucesso) return <EstadoErro mensagem={resEscaloes.erro} />;
  if (!resAtletas.sucesso) return <EstadoErro mensagem={resAtletas.erro} />;

  // Tabs de escalão: mostrar só os escalões que o utilizador pode ler (§6.4).
  // Âmbito TODO_CLUBE → "TODOS" (sem filtro); caso contrário, limita à lista
  // legível. Isto filtra também os tabs de secção (derivados dos escalões).
  const escaloes =
    legiveis === "TODOS"
      ? resEscaloes.dados
      : resEscaloes.dados.filter((e) => legiveis.includes(e.id));
  const seccoes = resSeccoes.sucesso ? resSeccoes.dados : [];

  // Escalão selecionado explicitamente mas fora do âmbito de leitura → sem acesso.
  const semAcessoEscalao =
    escalaoId != null && legiveis !== "TODOS" && !legiveis.includes(escalaoId);

  // Mapas de modalidade/secção por escalão (§3.2).
  const modalidadePorEscalao = mapaModalidadePorEscalao(escaloes, seccoes);
  const seccaoPorEscalao = new Map(escaloes.map((e) => [e.id, e.seccaoId]));

  // Multi-secção: há escalões em 2+ secções distintas → tabs de dois níveis.
  const seccoesPresentes = new Set(escaloes.map((e) => e.seccaoId ?? "__sem__"));
  const multiSeccao = seccoesPresentes.size >= 2;

  // Secções que têm pelo menos um escalão (para o 1.º nível de tabs).
  const seccoesComEscaloes = seccoes.filter((s) =>
    escaloes.some((e) => e.seccaoId === s.id),
  );

  // Secção ativa: explícita (seccaoId) ou derivada do escalão em contexto.
  const seccaoAtivaId =
    seccaoIdParam ??
    (escalaoId ? (seccaoPorEscalao.get(escalaoId) ?? undefined) : undefined);

  // Atletas a mostrar. Se estamos numa secção sem escalão específico, filtra pelos
  // atletas com participação num escalão dessa secção.
  let atletasBase = resAtletas.dados;
  if (multiSeccao && seccaoAtivaId && !escalaoId) {
    atletasBase = atletasBase.filter((a) =>
      a.participacoes.some((p) => seccaoPorEscalao.get(p.escalaoId) === seccaoAtivaId),
    );
  }

  const termo = (q ?? "").trim().toLowerCase();
  const atletas = termo
    ? atletasBase.filter((a) => a.nome.toLowerCase().includes(termo))
    : atletasBase;

  const tabTodos = !escalaoId && !seccaoAtivaId;

  // Números duplicados entre participações ativas do mesmo escalão (secção 8.5).
  const contagemNumeros = new Map<string, number>();
  for (const a of atletasBase) {
    for (const p of a.participacoes) {
      if (p.numero == null) continue;
      const chave = `${p.escalaoId}:${p.numero}`;
      contagemNumeros.set(chave, (contagemNumeros.get(chave) ?? 0) + 1);
    }
  }
  const numeroDuplicado = (escalaoIdA: string | undefined, numero: number | null) =>
    escalaoIdA != null &&
    numero != null &&
    (contagemNumeros.get(`${escalaoIdA}:${numero}`) ?? 0) > 1;
  const haDuplicados = [...contagemNumeros.values()].some((n) => n > 1);

  // Escalões do 2.º nível: numa vista multi-secção, só os da secção ativa.
  const escaloesSegundoNivel =
    multiSeccao && seccaoAtivaId
      ? escaloes.filter((e) => e.seccaoId === seccaoAtivaId)
      : escaloes;

  const rotuloSeccao = (id: string): string => {
    const s = seccoes.find((x) => x.id === id);
    if (!s) return "Secção";
    return s.nome ?? ROTULO_MODALIDADE[s.modalidade];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Plantel</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/relatorios">
              <FileBarChart className="h-4 w-4" />
              Relatórios
            </Link>
          </Button>
          <Button asChild>
            <Link href="/plantel/novo">
              <Plus className="h-4 w-4" />
              Novo atleta
            </Link>
          </Button>
        </div>
      </div>

      {/* 1.º nível — secções (só quando o clube tem múltiplas secções) */}
      {multiSeccao && seccoesComEscaloes.length > 0 && (
        <div className="-mb-px flex flex-wrap gap-0 border-b border-cinza-200">
          <Link
            href="/plantel"
            className={`${CLS_TAB_BASE} ${tabTodos ? CLS_TAB_ATIVO : CLS_TAB_INATIVO}`}
          >
            Todas as secções
          </Link>
          {seccoesComEscaloes.map((s) => {
            const ativo = seccaoAtivaId === s.id;
            return (
              <Link
                key={s.id}
                href={`/plantel?seccaoId=${s.id}`}
                className={`${CLS_TAB_BASE} inline-flex items-center gap-2 ${ativo ? CLS_TAB_ATIVO : CLS_TAB_INATIVO}`}
              >
                {s.nome ?? ROTULO_MODALIDADE[s.modalidade]}
                <BadgeModalidade modalidade={s.modalidade} compacto />
              </Link>
            );
          })}
        </div>
      )}

      {/* 2.º nível — escalões (da secção ativa quando multi-secção) */}
      {escaloes.length > 0 && (!multiSeccao || seccaoAtivaId) && (
        <div className="-mb-px flex flex-wrap gap-0 border-b border-cinza-200">
          <Link
            href={
              multiSeccao && seccaoAtivaId
                ? `/plantel?seccaoId=${seccaoAtivaId}`
                : "/plantel"
            }
            className={`${CLS_TAB_BASE} ${!escalaoId ? CLS_TAB_ATIVO : CLS_TAB_INATIVO}`}
          >
            Todos
          </Link>
          {escaloesSegundoNivel.map((e) => {
            const ativo = escalaoId === e.id;
            const mod = modalidadePorEscalao.get(e.id) ?? null;
            const href =
              multiSeccao && seccaoAtivaId
                ? `/plantel?seccaoId=${seccaoAtivaId}&escalaoId=${e.id}`
                : `/plantel?escalaoId=${e.id}`;
            return (
              <Link
                key={e.id}
                href={href}
                className={`${CLS_TAB_BASE} inline-flex items-center gap-2 ${ativo ? CLS_TAB_ATIVO : CLS_TAB_INATIVO}`}
              >
                {e.nome}
                {/* Só faz sentido distinguir modalidade fora de uma secção fixa. */}
                {multiSeccao && !seccaoAtivaId && mod && (
                  <BadgeModalidade modalidade={mod} compacto />
                )}
              </Link>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <CampoPesquisa placeholder="Pesquisar atleta por nome…" />
        <FiltroInativos />
      </div>

      {semAcessoEscalao ? (
        <EstadoVazio
          titulo="Sem acesso a este escalão"
          descricao="Não tens acesso aos atletas deste escalão."
        />
      ) : atletas.length === 0 ? (
        <EstadoVazio
          titulo={
            seccaoAtivaId
              ? `Ainda não há atletas em ${rotuloSeccao(seccaoAtivaId)}`
              : "Ainda não há atletas neste escalão"
          }
          descricao="Adiciona o primeiro atleta ao plantel."
          acao={
            <Button asChild>
              <Link href="/plantel/novo">
                <Plus className="h-4 w-4" />
                Adicionar atleta
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {haDuplicados && (
            <p className="flex items-center gap-1.5 rounded-md bg-ambar-500/10 px-3 py-2 text-corpo-sec text-ambar-600">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Há atletas do mesmo escalão com o mesmo número (assinalados a laranja).
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {atletas.map((a) => {
              const ctx = a.participacaoContexto;
              const numero = ctx?.numero ?? null;
              const dup = numeroDuplicado(ctx?.escalaoId, numero);
              // Atletas em mais do que um escalão: mostrar escalão + tipo de participação.
              const multiEscalao = a.participacoes.length > 1;
              return (
              <Link
                key={a.id}
                href={`/plantel/${a.id}`}
                className={`flex flex-col items-center gap-3 rounded-lg border border-cinza-200 bg-white p-4 text-center shadow-card transition-all hover:border-azul-300 hover:shadow-md ${
                  a.ativo ? "" : "opacity-60"
                }`}
              >
                <AvatarAtleta nome={a.nome} tamanho="lg" fotoUrl={a.fotoUrl} />
                <div className="w-full">
                  <p className="truncate text-corpo font-semibold text-cinza-900">{a.nome}</p>
                  {!a.ativo && (
                    <span className="mt-1 inline-flex items-center rounded-full border border-cinza-300 bg-cinza-100 px-2 py-0.5 text-legenda font-medium text-cinza-600">
                      Inativo
                    </span>
                  )}
                  <p className="text-legenda text-cinza-600">
                    {numero != null && (
                      <span className={dup ? "font-semibold text-ambar-600" : ""}>
                        #{numero}
                      </span>
                    )}
                    {numero != null && a.posicoes.length ? " · " : ""}
                    {a.posicoes.map((p) => ABREV_POSICAO[p]).join(", ")}
                    {numero == null && a.posicoes.length === 0 ? "—" : ""}
                  </p>
                  {multiEscalao ? (
                    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
                      {a.participacoes.map((p) => {
                        const mod = modalidadePorEscalao.get(p.escalaoId) ?? null;
                        return (
                          <span
                            key={p.id}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-cinza-200 bg-cinza-50 py-0.5 pe-1 ps-2 text-legenda text-cinza-600"
                          >
                            {multiSeccao && mod && (
                              <BadgeModalidade modalidade={mod} compacto />
                            )}
                            <span className="truncate">{p.escalaoNome}</span>
                            <BadgeTipoParticipacao tipo={p.tipo} compacto />
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    tabTodos &&
                    a.participacoes.length === 1 && (
                      <p className="mt-0.5 flex items-center justify-center gap-1 truncate text-legenda text-cinza-400">
                        {multiSeccao &&
                          (() => {
                            const mod =
                              modalidadePorEscalao.get(a.participacoes[0].escalaoId) ?? null;
                            return mod ? <BadgeModalidade modalidade={mod} compacto /> : null;
                          })()}
                        {a.participacoes[0].escalaoNome}
                      </p>
                    )
                  )}
                </div>
              </Link>
              );
            })}
          </div>
          <p className="text-corpo-sec text-cinza-600">
            {atletas.length} {atletas.length === 1 ? "atleta" : "atletas"}
          </p>
        </>
      )}
    </div>
  );
}
