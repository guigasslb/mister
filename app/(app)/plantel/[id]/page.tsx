import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { obterAtleta, obterEstatisticasAtleta } from "@/lib/actions/atletas";
import { obterCadernetaAtleta } from "@/lib/actions/caderneta";
import {
  obterEvolucaoAtleta,
  obterPresencasMensal,
  obterAnaliticoAtleta,
  obterEvolucaoMultiEpoca,
  exportarAnaliticoAtletaCsv,
} from "@/lib/actions/analise";
import { prisma } from "@/lib/db";
import { listarParticipacoes } from "@/lib/actions/participacoes";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { obterSeccoes } from "@/lib/actions/seccoes";
import { obterMembroAtual } from "@/lib/permissoes";
import { mapaModalidadePorEscalao } from "@/lib/modalidade-escalao";
import { escolherEscalaoContextoAnalitico } from "@/lib/analitico-atleta-escalao";
import type { Modalidade } from "@prisma/client";
import { AvatarAtleta } from "@/components/plantel/AvatarAtleta";
import { EstatisticasAtleta } from "@/components/plantel/EstatisticasAtleta";
import { CadernetaAtleta } from "@/components/plantel/CadernetaAtleta";
import { ParticipacoesAtleta } from "@/components/plantel/ParticipacoesAtleta";
import { CarreiraAtleta } from "@/components/plantel/CarreiraAtleta";
import { PainelAtleta } from "@/components/analiticos/PainelAtleta";
import { ExportarCsvBotao } from "@/components/analiticos/ExportarCsvBotao";
import { GerarRelatorioBotao } from "@/components/relatorios/GerarRelatorioBotao";
import { EstadoVazio } from "@/components/layout/EstadosUI";
import { BadgeInscricao } from "@/components/plantel/BadgeInscricao";
import { LABEL_POSICAO } from "@/lib/schemas/atleta";

function calcularIdade(dataNascimento: Date): number {
  const hoje = new Date();
  const nasc = new Date(dataNascimento);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

export const metadata: Metadata = { title: "Perfil do atleta" };

export default async function PerfilAtletaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obterAtleta(id);
  if (!res.sucesso) notFound();

  const a = res.dados;
  const eGR = a.posicoes.includes("GUARDA_REDES");

  // Contexto de escalão/época para a comparação directa (M4). Só há colegas a
  // comparar dentro de um escalão concreto da época atual do atleta.
  const escalaoContextoId = a.participacaoContexto?.escalaoId;

  const [
    resStats,
    resCaderneta,
    resEvolucao,
    resPresencas,
    resParticipacoes,
    resEscaloes,
    resSeccoes,
    membro,
    colegasEscalao,
    resEvolucaoEpocas,
  ] = await Promise.all([
    obterEstatisticasAtleta(id),
    obterCadernetaAtleta(id),
    obterEvolucaoAtleta(id),
    obterPresencasMensal(id),
    listarParticipacoes(id),
    listarEscaloes(),
    obterSeccoes(),
    obterMembroAtual(),
    // M4 — colegas do mesmo escalão/época (para o seletor de comparação).
    escalaoContextoId
      ? prisma.atletaEscalao.findMany({
          where: {
            escalaoId: escalaoContextoId,
            epocaId: a.epocaId,
            estado: "ATIVO",
          },
          select: { atletaId: true, atleta: { select: { nome: true } } },
          orderBy: { atleta: { nome: "asc" } },
        })
      : Promise.resolve(
          [] as { atletaId: string; atleta: { nome: string } }[],
        ),
    // M5 — evolução do atleta ao longo das épocas.
    obterEvolucaoMultiEpoca(id),
  ]);

  // Exclui o próprio atleta da lista de comparação (M4).
  const atletasEscalao = colegasEscalao
    .filter((c) => c.atletaId !== a.id)
    .map((c) => ({ id: c.atletaId, nome: c.atleta.nome }));
  const evolucaoEpocas = resEvolucaoEpocas.sucesso
    ? resEvolucaoEpocas.dados
    : undefined;

  // Modalidades em que o atleta participa (§3.2/§9): derivadas das secções dos
  // escalões das suas participações. Usadas para segmentar a caderneta por
  // modalidade quando o atleta é multi-desporto.
  const modalidadePorEscalao = mapaModalidadePorEscalao(
    resEscaloes.sucesso ? resEscaloes.dados : [],
    resSeccoes.sucesso ? resSeccoes.dados : [],
  );

  // Escalão de contexto do analítico (§10.1 — histórico persistente). Quando o
  // atleta mudou de escalão a meio da época, a participação de origem passa a
  // INATIVO/TRANSICAO mas não é apagada; limitar o analítico ao escalão ativo
  // atual esconderia os treinos/jogos do escalão de onde saiu. Nesse caso pede-se
  // a vista CONJUNTA da modalidade (escalaoId = undefined). Para quem nunca mudou
  // de escalão mantém-se o contexto do escalão ativo (comparação com a equipa).
  const escalaoAnalitico = escolherEscalaoContextoAnalitico({
    escalaoContextoAtivoId: a.participacaoContexto?.escalaoId,
    escaloesAtivos: a.participacoes.map((p) => p.escalaoId),
    participacoes: resParticipacoes.sucesso ? resParticipacoes.dados : [],
    epocaId: a.epocaId,
    modalidadeCtx: a.participacaoContexto?.modalidade ?? null,
    modalidadePorEscalao,
  });
  const resAnalitico = await obterAnaliticoAtleta(
    id,
    escalaoAnalitico,
    undefined,
    // Na vista conjunta segmenta-se pela modalidade do contexto, para não
    // misturar escalões de modalidades diferentes (futsal vs futebol).
    escalaoAnalitico ? undefined : a.participacaoContexto?.modalidade ?? undefined,
  );

  const modalidadesAtleta = [
    ...new Set(
      a.participacoes
        .map((p) => modalidadePorEscalao.get(p.escalaoId))
        .filter((m): m is Modalidade => m != null),
    ),
  ];

  // Gating de UI das ações de participação (secção 6.7). O servidor continua a
  // ser a autoridade — isto apenas evita oferecer ações que iriam falhar.
  const capacidades = new Set(membro?.capacidades ?? []);
  const podeGerirPlantel = capacidades.has("PLANTEL_GERIR");
  const podeTerminarParticipacao = capacidades.has("PROMOVER_ATLETAS");
  const podeVerRelatorios = capacidades.has("RELATORIOS_VER");
  const todosEscaloes = resEscaloes.sucesso
    ? resEscaloes.dados.map((e) => ({ id: e.id, nome: e.nome }))
    : [];
  // Âmbito PROPRIOS_ESCALOES limita as ações aos escalões atribuídos: associar
  // exige capacidade no destino e transferir exige-a na origem e no destino.
  const escaloesGeriveis =
    membro?.ambito === "TODO_CLUBE"
      ? todosEscaloes
      : todosEscaloes.filter((e) => membro?.escaloesAtribuidos.includes(e.id));

  const ctx = a.participacaoContexto;
  // Escalão de contexto para o export CSV do histórico do atleta (F1.3).
  const escalaoCtxId = ctx?.escalaoId;
  // Contexto das estatísticas: escalão da participação em contexto + número desse escalão.
  const erroParticipacoes = !resParticipacoes.sucesso
    ? resParticipacoes.erro
    : !resEscaloes.sucesso
      ? resEscaloes.erro
      : null;
  const contextoStats = [
    a.epocaNome,
    ctx?.escalaoNome,
    ctx?.numero != null ? `#${ctx.numero}` : null,
  ].filter((v): v is string => v != null);
  const metaPartes: string[] = [];
  if (a.posicoes.length) metaPartes.push(a.posicoes.map((p) => LABEL_POSICAO[p]).join(", "));
  if (ctx?.numero != null) metaPartes.push(`#${ctx.numero}`);
  for (const p of a.participacoes) {
    metaPartes.push(p.tipo === "PRINCIPAL" ? p.escalaoNome : `+ ${p.escalaoNome}`);
  }
  metaPartes.push(a.epocaNome);
  if (a.dataNascimento) metaPartes.push(`${calcularIdade(a.dataNascimento)} anos`);

  return (
    <div className="space-y-8">
      {/* Navegação */}
      <div className="flex items-center justify-between">
        <Breadcrumbs
          items={[{ label: "Plantel", href: "/plantel" }, { label: a.nome }]}
        />
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/plantel/${a.id}/relatorio`}>
              <FileText className="h-4 w-4" />
              Relatório
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/plantel/${a.id}/editar`}>
              <Pencil className="h-4 w-4" />
              Editar
            </Link>
          </Button>
        </div>
      </div>

      {/* Cabeçalho de identidade */}
      <div className="flex items-center gap-5">
        <AvatarAtleta nome={a.nome} tamanho="xl" fotoUrl={a.fotoUrl} />
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="leading-tight">{a.nome}</h1>
            <BadgeInscricao inscrito={a.inscrito} />
            {a.praticaDuplaModalidade && (
              <span className="inline-flex items-center rounded-full border border-azul-300/50 bg-azul-50 px-2.5 py-0.5 text-legenda font-medium text-azul-700">
                Futebol + Futsal
              </span>
            )}
          </div>
          <p className="mt-1 text-corpo-sec text-cinza-600">{metaPartes.join(" · ")}</p>
        </div>
      </div>

      {/* Abas */}
      <Tabs defaultValue="estatisticas">
        <TabsList>
          <TabsTrigger value="estatisticas">Estatísticas</TabsTrigger>
          <TabsTrigger value="analiticos">Analytics</TabsTrigger>
          <TabsTrigger value="caderneta">Caderneta</TabsTrigger>
          <TabsTrigger value="participacoes">Participações</TabsTrigger>
          <TabsTrigger value="carreira">Carreira</TabsTrigger>
        </TabsList>

        <TabsContent value="estatisticas" className="space-y-3">
          <p className="text-corpo-sec text-cinza-500">
            Estatísticas de {contextoStats.join(" · ")}
          </p>
          {resStats.sucesso ? (
            <EstatisticasAtleta
              stats={resStats.dados}
              eGR={eGR}
              evolucao={resEvolucao.sucesso ? resEvolucao.dados : undefined}
              presencas={resPresencas.sucesso ? resPresencas.dados : undefined}
            />
          ) : (
            <p className="text-corpo-sec text-vermelho-600">{resStats.erro}</p>
          )}
        </TabsContent>

        <TabsContent value="analiticos" className="space-y-4">
          {resAnalitico.sucesso ? (
            <>
              {podeVerRelatorios && (
                <div className="flex justify-end gap-2 print:hidden">
                  {escalaoCtxId && (
                    <ExportarCsvBotao
                      acao={exportarAnaliticoAtletaCsv.bind(null, {
                        atletaId: a.id,
                        escalaoId: escalaoCtxId,
                      })}
                      rotulo="Exportar histórico"
                    />
                  )}
                  <GerarRelatorioBotao
                    tipo="EPOCA_ATLETA"
                    atletaId={a.id}
                    escalaoId={a.participacaoContexto?.escalaoId}
                  />
                </div>
              )}
              <PainelAtleta
                dados={resAnalitico.dados}
                atletasEscalao={atletasEscalao}
                evolucaoEpocas={evolucaoEpocas}
              />
            </>
          ) : resAnalitico.erro === "Sem permissão" ? (
            <EstadoVazio
              titulo="Sem acesso aos analytics"
              descricao="Os analytics e relatórios exigem a permissão «Ver relatórios». Pede ao administrador do clube para a atribuir."
            />
          ) : (
            <EstadoVazio titulo="Analytics indisponíveis" descricao={resAnalitico.erro} />
          )}
        </TabsContent>

        <TabsContent value="caderneta">
          {resCaderneta.sucesso ? (
            <CadernetaAtleta
              atletaId={a.id}
              habilidades={resCaderneta.dados}
              modalidades={modalidadesAtleta}
            />
          ) : (
            <p className="text-corpo-sec text-vermelho-600">{resCaderneta.erro}</p>
          )}
        </TabsContent>

        <TabsContent value="participacoes">
          {resParticipacoes.sucesso && resEscaloes.sucesso ? (
            <ParticipacoesAtleta
              atletaId={a.id}
              nomeAtleta={a.nome}
              epocaIdAtual={a.epocaId}
              participacoes={resParticipacoes.dados}
              escaloesGeriveis={escaloesGeriveis}
              podeGerir={podeGerirPlantel}
              podeTerminar={podeTerminarParticipacao}
            />
          ) : (
            <p className="text-corpo-sec text-vermelho-600">{erroParticipacoes}</p>
          )}
        </TabsContent>

        <TabsContent value="carreira">
          <CarreiraAtleta atletaId={a.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
