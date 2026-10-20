import type { CasaFora, EstadoResultado, Prisma, PrismaClient } from "@prisma/client";
import { modalidadeEfetiva } from "@/lib/modalidade-escalao";
import { ORDEM_EQUIPAS_PROPRIAS } from "@/lib/subequipas";

/**
 * Sincronização bidirecional Jogo ↔ confronto do quadro (§23.6).
 *
 * Um confronto (`ResultadoCompeticao`) que envolve uma equipa própria fica ligado
 * a um `Jogo` por equipa própria (`Jogo.resultadoCompeticaoId`; 1:1 no caso
 * habitual, dois jogos num confronto interno A vs B — §23.11). Os campos comuns —
 * data/hora, adversário, casa/fora e resultado — são mantidos iguais nos dois
 * lados: editar na competição reflete-se em /jogos (lista, agenda, detalhe) e
 * vice-versa.
 *
 * Módulo partilhado (fora de `"use server"`) para não expor estas funções como
 * Server Actions; o cliente Prisma é injetado (pode ser `prisma` ou um `tx`).
 */

type ClienteDb = PrismaClient | Prisma.TransactionClient;

export type ConfrontoEquipas = {
  equipaCasa: string;
  equipaFora: string;
  equipaCasaId: string | null;
  equipaForaId: string | null;
};

export type EquipaPropria = { id: string | null; nome: string };

const norm = (s: string) => s.trim().toLowerCase();

/** Lado de uma equipa própria num confronto e a sua identidade (§23.11.3 regra 8). */
export type LadoProprio = { lado: CasaFora; equipaId: string | null };

/**
 * Lado da equipa própria no confronto (CASA | FORA) com o id do participante, ou
 * `null` se o confronto não a envolve. Identifica pelo participante `PROPRIO` (FK)
 * e, em alternativa, pelo nome da equipa própria — o mesmo critério de
 * `obterClassificacao`.
 */
export function ladoProprio(c: ConfrontoEquipas, propria: EquipaPropria): LadoProprio | null {
  const casa =
    (propria.id !== null && c.equipaCasaId === propria.id) ||
    norm(c.equipaCasa) === norm(propria.nome);
  const fora =
    (propria.id !== null && c.equipaForaId === propria.id) ||
    norm(c.equipaFora) === norm(propria.nome);
  if (casa === fora) return null;
  return { lado: casa ? "CASA" : "FORA", equipaId: propria.id };
}

/**
 * Lados próprios de um confronto, um por equipa própria envolvida (no máximo um
 * por lado). Num confronto interno A vs B os dois lados são próprios.
 */
export function ladosProprios(c: ConfrontoEquipas, proprias: EquipaPropria[]): LadoProprio[] {
  const lados: LadoProprio[] = [];
  for (const p of proprias) {
    const l = ladoProprio(c, p);
    if (l && !lados.some((x) => x.lado === l.lado)) lados.push(l);
  }
  return lados;
}

/**
 * Jogos ligados ao confronto depois de uma edição das equipas (`ladosDepois` =
 * lados próprios do confronto já editado), com o mesmo critério de escolha de
 * `sincronizarJogoDoConfronto`: `saem` deixam o confronto; `ficam` levam o lado
 * próprio que passam a representar.
 * - 0/1 equipa própria: ficam (no lado próprio) enquanto o confronto tiver lado
 *   próprio; senão saem.
 * - ≥2 (subequipas): fica o jogo cuja subequipa esteja em `ladosDepois`. Um jogo
 *   legado sem subequipa é adotado pelo único lado próprio (como na sincronização)
 *   ou, num confronto interno, pela 1.ª equipa própria (§23.11.3 regra 7) — só se
 *   esse lado ainda não tiver jogo; senão sai.
 */
export function jogosQueSaemDoConfronto(
  jogos: { id: string; equipaCompeticaoId: string | null }[],
  ladosDepois: LadoProprio[],
  proprias: EquipaPropria[],
): { saem: string[]; ficam: { id: string; lado: LadoProprio }[] } {
  if (proprias.length < 2) {
    const lado = ladosDepois[0];
    return lado
      ? { saem: [], ficam: jogos.map((j) => ({ id: j.id, lado })) }
      : { saem: jogos.map((j) => j.id), ficam: [] };
  }
  const saem: string[] = [];
  const ficam: { id: string; lado: LadoProprio }[] = [];
  const ocupados = new Set<string | null>(
    jogos.flatMap((j) =>
      j.equipaCompeticaoId !== null && ladosDepois.some((l) => l.equipaId === j.equipaCompeticaoId)
        ? [j.equipaCompeticaoId]
        : [],
    ),
  );
  for (const j of jogos) {
    if (j.equipaCompeticaoId !== null) {
      const lado = ladosDepois.find((l) => l.equipaId === j.equipaCompeticaoId);
      if (lado) ficam.push({ id: j.id, lado });
      else saem.push(j.id);
      continue;
    }
    const lado =
      ladosDepois.length === 1
        ? ladosDepois[0]
        : ladosDepois.find((l) => l.equipaId === proprias[0].id);
    if (lado && !ocupados.has(lado.equipaId)) {
      ocupados.add(lado.equipaId);
      ficam.push({ id: j.id, lado });
    } else saem.push(j.id);
  }
  return { saem, ficam };
}

/** Lado de um confronto: equipa (FK, ou `null` se desconhecida). */
type EquipasConfronto = { casa: string | null; fora: string | null };

/**
 * Uma equipa atual passa para o outro lado (troca ⇄ total ou parcial): o resultado
 * inverte-se primeiro, para que cada equipa mantenha os seus golos/vitória (D3).
 */
export function ladosInvertidos(atual: EquipasConfronto, nova: { casa: string; fora: string }): boolean {
  return (atual.fora !== null && nova.casa === atual.fora) || (atual.casa !== null && nova.fora === atual.casa);
}

/**
 * Placar do confronto depois da edição das equipas: com `inverte` trocam golos e
 * vencedor de walkover; senão mantêm-se pela posição. `null` se o confronto não
 * tem resultado (só REALIZADO/WALKOVER contam).
 */
export function resultadoAposEdicao(
  c: {
    estado: EstadoResultado;
    golosCasa: number | null;
    golosFora: number | null;
    walkoverVencedor: CasaFora | null;
  },
  inverte: boolean,
): { golosCasa: number | null; golosFora: number | null; walkoverVencedor: CasaFora | null } | null {
  if (c.estado !== "REALIZADO" && c.estado !== "WALKOVER") return null;
  if (!inverte)
    return { golosCasa: c.golosCasa, golosFora: c.golosFora, walkoverVencedor: c.walkoverVencedor };
  return {
    golosCasa: c.golosFora,
    golosFora: c.golosCasa,
    walkoverVencedor:
      c.walkoverVencedor === "CASA" ? "FORA" : c.walkoverVencedor === "FORA" ? "CASA" : null,
  };
}

/** Campos do `Jogo` derivados do confronto (competição → /jogos). */
export function camposJogoDoConfronto(
  c: ConfrontoEquipas & {
    dataHora: Date;
    golosCasa: number | null;
    golosFora: number | null;
    estado: EstadoResultado;
  },
  lado: CasaFora,
): {
  data: Date;
  adversario: string;
  casaFora: CasaFora;
  golosMarcados?: number;
  golosSofridos?: number;
} {
  const base = {
    data: c.dataHora,
    adversario: lado === "CASA" ? c.equipaFora : c.equipaCasa,
    casaFora: lado,
  };
  // Só um confronto REALIZADO com placar completo define o resultado do jogo;
  // nos restantes estados o resultado do jogo não é tocado.
  if (c.estado !== "REALIZADO" || c.golosCasa === null || c.golosFora === null) return base;
  return {
    ...base,
    golosMarcados: lado === "CASA" ? c.golosCasa : c.golosFora,
    golosSofridos: lado === "CASA" ? c.golosFora : c.golosCasa,
  };
}

/** Campos do confronto derivados do `Jogo` (/jogos → competição). */
export function camposConfrontoDoJogo(
  j: { data: Date; golosMarcados: number | null; golosSofridos: number | null },
  lado: CasaFora,
): {
  dataHora: Date;
  golosCasa?: number;
  golosFora?: number;
  estado?: "REALIZADO";
  walkoverVencedor?: null;
} {
  if (j.golosMarcados === null || j.golosSofridos === null) return { dataHora: j.data };
  // Resultado completo no jogo ⇒ confronto REALIZADO com esse placar (§23.6).
  return {
    dataHora: j.data,
    golosCasa: lado === "CASA" ? j.golosMarcados : j.golosSofridos,
    golosFora: lado === "CASA" ? j.golosSofridos : j.golosMarcados,
    estado: "REALIZADO",
    walkoverVencedor: null,
  };
}

/**
 * Equipas próprias (`PROPRIO`) da competição, pela ordem estável de
 * `ORDEM_EQUIPAS_PROPRIAS` (a primeira é a implícita dos jogos sem subequipa).
 * Sem nenhuma, a equipa própria é o escalão (por nome — comportamento de §10.9).
 */
export async function obterEquipasProprias(
  db: ClienteDb,
  competicaoId: string,
  nomeEscalao: string,
): Promise<EquipaPropria[]> {
  const proprias = await db.equipaCompeticao.findMany({
    where: { competicaoId, tipo: "PROPRIO" },
    select: { id: true, nome: true },
    orderBy: ORDEM_EQUIPAS_PROPRIAS,
  });
  return proprias.length > 0 ? proprias : [{ id: null, nome: nomeEscalao }];
}

/**
 * Competição → /jogos. Reflete o confronto no `Jogo` ligado de cada equipa própria
 * envolvida. Se ainda não houver jogo ligado e o confronto já tiver data/hora,
 * adota um jogo existente da mesma competição contra o mesmo adversário e não
 * ligado (evita duplicar jogos criados à mão em /jogos) ou cria um novo. Devolve
 * os ids dos jogos sincronizados (vazio se o confronto não envolve equipas
 * próprias / não tem data). Num confronto interno A vs B sincroniza os dois jogos.
 *
 * Com ≥2 equipas próprias (subequipas — §23.11.3 regra 8) cada jogo fica com
 * `equipaCompeticaoId` e a adoção filtra também pela subequipa; com 0/1 o
 * comportamento é o anterior (um jogo por confronto, sem `equipaCompeticaoId`).
 */
export async function sincronizarJogoDoConfronto(
  db: ClienteDb,
  resultadoId: string,
  criadorId: string,
): Promise<string[]> {
  const c = await db.resultadoCompeticao.findUnique({
    where: { id: resultadoId },
    select: {
      id: true,
      competicaoId: true,
      equipaCasa: true,
      equipaFora: true,
      equipaCasaId: true,
      equipaForaId: true,
      golosCasa: true,
      golosFora: true,
      estado: true,
      dataHora: true,
      // Ordem determinística (o mais antigo primeiro) para a escolha do jogo ligado.
      jogosDetalhados: {
        select: { id: true, equipaCompeticaoId: true },
        orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
      },
      competicao: {
        select: {
          escalaoId: true,
          epocaId: true,
          tipo: true,
          formatoJogo: true,
          escalao: {
            select: { nome: true, seccao: { select: { modalidade: true } } },
          },
        },
      },
    },
  });
  if (!c) return [];

  const proprias = await obterEquipasProprias(db, c.competicaoId, c.competicao.escalao.nome);
  const lados = ladosProprios(c, proprias);
  const dataHora = c.dataHora;
  if (lados.length === 0 || !dataHora) return [];

  const comSubequipas = proprias.length >= 2;
  // Confronto interno A vs B: os golos nunca são propagados da competição para os
  // jogos — cada jogo mantém o seu placar (divergência ⇒ aviso, §23.11.3 regra 6).
  const interno = lados.length === 2;
  const confronto = interno
    ? { ...c, dataHora, golosCasa: null, golosFora: null }
    : { ...c, dataHora };
  const ids: string[] = [];
  for (const l of lados) {
    const campos = camposJogoDoConfronto(confronto, l.lado);
    // Subequipas: o jogo fica associado à equipa própria deste lado.
    const subequipa = comSubequipas ? { equipaCompeticaoId: l.equipaId } : {};

    // Jogo ligado deste lado: o da mesma equipa; senão um sem equipa (ligado antes
    // de haver subequipas) quando só um lado é próprio; sem subequipas, o primeiro.
    const jogoDetalhado =
      c.jogosDetalhados.find((j) => j.equipaCompeticaoId === l.equipaId) ??
      (lados.length === 1
        ? c.jogosDetalhados.find((j) => j.equipaCompeticaoId === null)
        : undefined) ??
      (comSubequipas ? undefined : c.jogosDetalhados[0]);
    if (jogoDetalhado) {
      await db.jogo.update({ where: { id: jogoDetalhado.id }, data: { ...campos, ...subequipa } });
      ids.push(jogoDetalhado.id);
      continue;
    }

    const candidatos = await db.jogo.findMany({
      where: {
        competicaoId: c.competicaoId,
        resultadoCompeticaoId: null,
        adversario: { equals: campos.adversario.trim(), mode: "insensitive" },
        ...subequipa,
      },
      select: { id: true, casaFora: true },
    });
    const mesmoLado = candidatos.filter((j) => j.casaFora === l.lado);
    const adotar =
      candidatos.length === 1 ? candidatos[0] : mesmoLado.length === 1 ? mesmoLado[0] : null;

    if (adotar) {
      await db.jogo.update({
        where: { id: adotar.id },
        data: { ...campos, resultadoCompeticaoId: c.id },
      });
      ids.push(adotar.id);
      continue;
    }

    const modalidade = modalidadeEfetiva(null, c.competicao.escalao.seccao?.modalidade);
    const criado = await db.jogo.create({
      data: {
        ...campos,
        tipo: c.competicao.tipo,
        formato: c.competicao.formatoJogo ?? (modalidade === "FUTSAL" ? "FUTSAL_5" : null),
        competicaoId: c.competicaoId,
        resultadoCompeticaoId: c.id,
        escalaoId: c.competicao.escalaoId,
        epocaId: c.competicao.epocaId,
        criadorId,
        ...subequipa,
      },
      select: { id: true },
    });
    ids.push(criado.id);
  }
  return ids;
}

/**
 * /jogos → competição. Reflete data/hora e resultado do `Jogo` no confronto
 * ligado, orientados pelo lado da equipa própria do jogo (a sua subequipa, ou a
 * equipa própria implícita quando o jogo não tem subequipa). Só sincroniza se o
 * jogo continuar na mesma competição, escalão e época do confronto. Num confronto
 * interno A vs B o outro jogo não é tocado: prevalece no confronto o último
 * gravado (§23.11.3 regra 6). Devolve o `competicaoId` sincronizado (para
 * revalidação) ou `null`.
 */
export async function sincronizarConfrontoDoJogo(
  db: ClienteDb,
  jogoId: string,
): Promise<string | null> {
  const j = await db.jogo.findUnique({
    where: { id: jogoId },
    select: {
      data: true,
      golosMarcados: true,
      golosSofridos: true,
      competicaoId: true,
      escalaoId: true,
      epocaId: true,
      equipaCompeticaoId: true,
      resultadoCompeticao: {
        select: {
          id: true,
          competicaoId: true,
          equipaCasa: true,
          equipaFora: true,
          equipaCasaId: true,
          equipaForaId: true,
          competicao: {
            select: {
              escalaoId: true,
              epocaId: true,
              escalao: { select: { nome: true } },
            },
          },
        },
      },
    },
  });
  const c = j?.resultadoCompeticao;
  if (!j || !c) return null;
  if (
    j.competicaoId !== c.competicaoId ||
    j.escalaoId !== c.competicao.escalaoId ||
    j.epocaId !== c.competicao.epocaId
  )
    return null;

  const proprias = await obterEquipasProprias(db, c.competicaoId, c.competicao.escalao.nome);
  const propria = j.equipaCompeticaoId
    ? proprias.find((p) => p.id === j.equipaCompeticaoId)
    : proprias[0];
  const l = propria ? ladoProprio(c, propria) : null;
  if (!l) return null;

  await db.resultadoCompeticao.update({
    where: { id: c.id },
    data: camposConfrontoDoJogo(j, l.lado),
  });
  // Confronto interno A vs B (§23.11.3 regra 6): a data/hora passa também para o
  // jogo da outra subequipa; os golos dele nunca são tocados.
  if (j.equipaCompeticaoId && ladosProprios(c, proprias).length === 2) {
    await db.jogo.updateMany({
      where: {
        resultadoCompeticaoId: c.id,
        AND: [
          { equipaCompeticaoId: { not: null } },
          { equipaCompeticaoId: { not: j.equipaCompeticaoId } },
        ],
      },
      data: { data: j.data },
    });
  }
  return c.competicaoId;
}

/**
 * Valida a ligação de um jogo a um confronto (§23.11.3 regras 1, 5 e 8) — usada ao
 * ligar manualmente e ao editar um jogo já ligado. Com ≥2 equipas próprias o jogo
 * tem de ter subequipa e ela tem de jogar o confronto, sem outro jogo da mesma
 * subequipa nesse confronto. Em qualquer caso, um confronto que não é interno tem
 * no máximo um jogo ligado. Devolve a mensagem de erro, ou `null` se válido (ou se o
 * confronto não for da competição indicada — a sincronização ignora-o).
 */
export async function validarLigacaoJogoConfronto(
  db: ClienteDb,
  ligacao: {
    jogoId: string;
    resultadoId: string;
    competicaoId: string | null;
    equipaCompeticaoId: string | null;
  },
): Promise<string | null> {
  const c = await db.resultadoCompeticao.findUnique({
    where: { id: ligacao.resultadoId },
    select: {
      competicaoId: true,
      equipaCasa: true,
      equipaFora: true,
      equipaCasaId: true,
      equipaForaId: true,
      jogosDetalhados: { select: { id: true, equipaCompeticaoId: true } },
      competicao: { select: { escalao: { select: { nome: true } } } },
    },
  });
  if (!c || c.competicaoId !== ligacao.competicaoId) return null;

  const proprias = await obterEquipasProprias(db, c.competicaoId, c.competicao.escalao.nome);
  const lados = ladosProprios(c, proprias);
  const outros = c.jogosDetalhados.filter((o) => o.id !== ligacao.jogoId);

  if (proprias.length >= 2) {
    if (!ligacao.equipaCompeticaoId)
      return "Indica a equipa do jogo: esta competição tem várias equipas próprias";
    if (!lados.some((l) => l.equipaId === ligacao.equipaCompeticaoId))
      return "A equipa do jogo não participa neste confronto";
    if (outros.some((o) => o.equipaCompeticaoId === ligacao.equipaCompeticaoId))
      return "Esta equipa já tem um jogo ligado a este confronto";
  }
  if (lados.length < 2 && outros.length > 0) return "Este confronto já tem um jogo ligado";
  return null;
}
