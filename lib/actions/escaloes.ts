"use server";

import { revalidatePath } from "next/cache";
import { Modalidade } from "@prisma/client";
import { prisma } from "@/lib/db";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import {
  exigirCapacidade,
  obterMembroAtual,
  filtrarEscaloesLegiveis,
  type ResultadoPermissao,
} from "@/lib/permissoes";
import { garantirSeccaoParaModalidade } from "@/lib/actions/seccoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { escalaoSchema, criarEscalaoSchema } from "@/lib/schemas/escalao";
import type { Escalao } from "@prisma/client";

const PATH = "/definicoes/escaloes";

/**
 * Autoriza uma mutação sobre um escalão existente (§6.9).
 *
 * Um Coordenador de Secção tem `SECCAO_ESCALOES_GERIR` (âmbito SECCAO) mas não
 * `CLUBE_ESCALOES`. Tenta primeiro a capacidade de secção — resolvida por
 * `exigirCapacidade` contra `escalao.seccaoId ∈ seccoesCoordenadas` — e recai
 * na capacidade de nível clube. Devolve o erro mais informativo quando ambas
 * falham (ex.: "Sem permissão nesta secção" tem prioridade sobre "Sem permissão").
 */
async function exigirGestaoEscalao(escalaoId: string): Promise<ResultadoPermissao> {
  const porSeccao = await exigirCapacidade("SECCAO_ESCALOES_GERIR", escalaoId);
  if (porSeccao.ok) return porSeccao;

  const porClube = await exigirCapacidade("CLUBE_ESCALOES");
  if (porClube.ok) return porClube;

  // Ambas falharam: prefere o erro de âmbito de secção (mais específico) quando o
  // membro tem a capacidade de secção mas não o âmbito sobre este escalão.
  return porSeccao.erro !== "Sem permissão" ? porSeccao : porClube;
}

export async function listarEscaloes(): Promise<Resultado<Escalao[]>> {
  const clubeId = await obterClubeIdAtual();
  if (!clubeId) return erro("Não autenticado");

  const escaloes = await prisma.escalao.findMany({
    where: { clubeId },
    orderBy: { ordem: "asc" },
  });
  return ok(escaloes);
}

/**
 * Como `listarEscaloes`, mas filtrada ao ÂMBITO do utilizador autenticado (§6.4/§6.5):
 * um treinador de âmbito próprio só vê os seus escalões, um coordenador os da(s)
 * sua(s) secção(ões) + visíveis, e um perfil TODO_CLUBE vê todos. Deve ser usada
 * nos formulários de criação/edição (treinos, jogos, atletas, …) para não expor
 * escalões fora do alcance do membro; `listarEscaloes` mantém-se para os fluxos
 * que precisam legitimamente de todos os escalões do clube (ex.: definições).
 */
export async function listarEscaloesLegiveis(): Promise<Resultado<Escalao[]>> {
  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Não autenticado");

  const escaloes = await prisma.escalao.findMany({
    where: { clubeId: ctx.clube.id },
    orderBy: { ordem: "asc" },
  });
  return ok(await filtrarEscaloesLegiveis(escaloes));
}

export async function criarEscalao(dados: unknown): Promise<Resultado<Escalao>> {
  // A criação não tem `escalaoId` (ainda não existe): a autorização de âmbito
  // SECCAO valida-se contra a `seccaoId` alvo do payload (ver abaixo).
  const ctx = await obterMembroAtual();
  if (!ctx) return erro("Sem acesso a este clube");

  const temClube = ctx.capacidades.includes("CLUBE_ESCALOES");
  const temSeccao = ctx.capacidades.includes("SECCAO_ESCALOES_GERIR");
  if (!temClube && !temSeccao) return erro("Sem permissão");

  const parsed = criarEscalaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const clubeId = ctx.clube.id;
  const { seccaoId: seccaoIdInput, ...dadosEscalao } = parsed.data;

  // Resolver a secção alvo: fornecida pelo cliente (multidesporto) ou, por
  // omissão, a secção FUTSAL do clube (garantida/criada on-demand — §8.1.1).
  let seccaoId: string;
  if (seccaoIdInput) {
    const seccao = await prisma.seccao.findFirst({
      where: { id: seccaoIdInput, clubeId },
      select: { id: true },
    });
    if (!seccao) return erro("Secção não encontrada");
    seccaoId = seccao.id;
  } else {
    const res = await garantirSeccaoParaModalidade(Modalidade.FUTSAL);
    if (!res.sucesso) return erro(res.erro);
    seccaoId = res.dados.seccaoId;
  }

  // Âmbito SECCAO: um Coordenador sem `CLUBE_ESCALOES` só cria escalões nas
  // secções que coordena. Com `CLUBE_ESCALOES` (nível clube) não há restrição.
  if (!temClube && temSeccao && !ctx.seccoesCoordenadas.includes(seccaoId)) {
    return erro("Sem permissão nesta secção");
  }

  const ultimo = await prisma.escalao.findFirst({
    where: { clubeId },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  const ordem = (ultimo?.ordem ?? -1) + 1;

  const escalao = await prisma.escalao.create({
    data: { ...dadosEscalao, ordem, clubeId, seccaoId },
  });
  revalidatePath(PATH);
  return ok(escalao);
}

export async function atualizarEscalao(id: string, dados: unknown): Promise<Resultado<Escalao>> {
  const perm = await exigirGestaoEscalao(id);
  if (!perm.ok) return erro(perm.erro);

  const parsed = escalaoSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const existe = await prisma.escalao.findFirst({ where: { id, clubeId: perm.ctx.clube.id } });
  if (!existe) return erro("Escalão não encontrado");

  const escalao = await prisma.escalao.update({ where: { id }, data: parsed.data });
  revalidatePath(PATH);
  return ok(escalao);
}

export async function definirVisibilidadeEscalao(
  id: string,
  visivel: boolean,
): Promise<Resultado<void>> {
  const perm = await exigirGestaoEscalao(id);
  if (!perm.ok) return erro(perm.erro);

  const existe = await prisma.escalao.findFirst({ where: { id, clubeId: perm.ctx.clube.id } });
  if (!existe) return erro("Escalão não encontrado");

  await prisma.escalao.update({
    where: { id },
    data: { visivelOutrosTreinadores: visivel },
  });
  revalidatePath(PATH);
  return ok(undefined);
}

export async function apagarEscalao(id: string): Promise<Resultado<void>> {
  const perm = await exigirGestaoEscalao(id);
  if (!perm.ok) return erro(perm.erro);

  const existe = await prisma.escalao.findFirst({ where: { id, clubeId: perm.ctx.clube.id } });
  if (!existe) return erro("Escalão não encontrado");

  // Guardas de integridade: as relações Sessao/Jogo/Planeamento/Competicao são
  // Restrict — apagar com dependentes lançaria P2003 (500). Bloquear com mensagem.
  const [totalAtletas, totalSessoes, totalJogos, totalPlaneamentos, totalCompeticoes] =
    await Promise.all([
      // F1: as participações (AtletaEscalao) são Restrict sobre o escalão.
      prisma.atletaEscalao.count({ where: { escalaoId: id } }),
      prisma.sessao.count({ where: { escalaoId: id } }),
      prisma.jogo.count({ where: { escalaoId: id } }),
      prisma.planeamento.count({ where: { escalaoId: id } }),
      prisma.competicao.count({ where: { escalaoId: id } }),
    ]);
  if (totalAtletas > 0)
    return erro(
      `Não é possível apagar: este escalão tem ${totalAtletas} participação(ões) de atleta(s) associada(s).`,
    );
  if (totalSessoes > 0)
    return erro(`Não é possível apagar: este escalão tem ${totalSessoes} sessão(ões) associada(s).`);
  if (totalJogos > 0)
    return erro(`Não é possível apagar: este escalão tem ${totalJogos} jogo(s) associado(s).`);
  if (totalPlaneamentos > 0)
    return erro(`Não é possível apagar: este escalão tem ${totalPlaneamentos} planeamento(s) associado(s).`);
  if (totalCompeticoes > 0)
    return erro(`Não é possível apagar: este escalão tem ${totalCompeticoes} competição(ões) associada(s).`);

  await prisma.escalao.delete({ where: { id } });
  revalidatePath(PATH);
  return ok(undefined);
}

export async function moverEscalao(
  id: string,
  direcao: "subir" | "descer",
): Promise<Resultado<void>> {
  const perm = await exigirGestaoEscalao(id);
  if (!perm.ok) return erro(perm.erro);

  const todos = await prisma.escalao.findMany({
    where: { clubeId: perm.ctx.clube.id },
    orderBy: { ordem: "asc" },
  });
  const idx = todos.findIndex((e) => e.id === id);
  if (idx === -1) return erro("Escalão não encontrado");

  const idxAdj = direcao === "subir" ? idx - 1 : idx + 1;
  if (idxAdj < 0 || idxAdj >= todos.length) return ok(undefined);

  const atual = todos[idx];
  const adjacente = todos[idxAdj];

  await prisma.$transaction([
    prisma.escalao.update({ where: { id: atual.id }, data: { ordem: adjacente.ordem } }),
    prisma.escalao.update({ where: { id: adjacente.id }, data: { ordem: atual.ordem } }),
  ]);
  revalidatePath(PATH);
  return ok(undefined);
}
