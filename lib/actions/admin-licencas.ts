"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirAdminPlataforma } from "@/lib/admin-guard";
import {
  AlterarEstadoLicencaSchema,
  AtivarLicencaSchema,
  EditarDataFimLicencaSchema,
} from "@/lib/schemas/admin";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { capacidadesEfetivas } from "@/lib/permissoes-catalogo";
import { enviarEmail } from "@/lib/email/resend";
import { emailContaAtivada } from "@/lib/email/templates/conta-ativada";
import { Prisma, type CicloFaturacao } from "@prisma/client";
import { z } from "zod";

// Fase 2 — Backoffice interno: Server Actions CROSS-TENANT de gestão de licenças.
//
// ATENÇÃO: ao contrário de `lib/actions/licenciamento.ts` (club-scoped, usa
// `obterMembroAtual()`), estas actions operam sobre TODAS as licenças da
// plataforma. O único gate de acesso é `exigirAdminPlataforma()`, chamado no
// início de cada action. NUNCA usar `obterMembroAtual()` aqui.

const PATH = "/admin";

// Campos selecionados para a listagem cross-tenant, incluindo o titular resolvido
// (utilizador OU clube — exatamente um dos dois preenchido no modelo).
//
// Para licenças de Clube, carregamos os membros ATIVOS com as capacidades do
// perfil e os overrides (extra/revogadas) + o email do utilizador, para resolver
// o email do administrador do clube on-read (ver `resolverAdminTitular`). O modelo
// Clube não tem um dono explícito: o admin é derivado das capacidades efetivas
// (CLUBE_UTILIZADORES + CLUBE_PERFIS), a mesma definição usada em membros/utilizadores.
const selecaoLicencaAdmin = {
  id: true,
  tipo: true,
  tier: true,
  estado: true,
  ciclo: true,
  dataInicio: true,
  dataFim: true,
  precoCentimos: true,
  modalidade: true,
  numSeccoes: true,
  criadoEm: true,
  utilizador: { select: { id: true, nome: true, email: true } },
  clube: {
    select: {
      id: true,
      nome: true,
      membros: {
        where: { estado: "ATIVO" },
        select: {
          capacidadesExtra: true,
          capacidadesRevogadas: true,
          perfil: { select: { capacidades: true } },
          utilizador: { select: { nome: true, email: true } },
        },
      },
    },
  },
} as const;

/** Resultado cru da query (com os membros do clube por resolver). */
type LicencaCrua = Prisma.LicencaGetPayload<{ select: typeof selecaoLicencaAdmin }>;

/** Membros ATIVOS de um clube, tal como selecionados acima. */
type MembroClubeCru = NonNullable<LicencaCrua["clube"]>["membros"];

/** Titular de uma licença (nome + email) — Individual ou admin do clube. */
interface TitularLicenca {
  nome: string;
  email: string;
}

/**
 * Resolve o TITULAR (nome + email) de uma licença de clube: o primeiro membro
 * ATIVO cujas capacidades EFETIVAS (perfil + extra − revogadas) incluam
 * CLUBE_UTILIZADORES e CLUBE_PERFIS. `null` se o clube não tiver administrador
 * identificável. É a fonte única para o email do backoffice e para o email de
 * ativação.
 */
function resolverAdminTitular(membros: MembroClubeCru): TitularLicenca | null {
  const admin = membros.find((m) => {
    const efetivas = capacidadesEfetivas(
      m.perfil.capacidades,
      m.capacidadesExtra,
      m.capacidadesRevogadas,
    );
    return efetivas.has("CLUBE_UTILIZADORES") && efetivas.has("CLUBE_PERFIS");
  });
  return admin
    ? { nome: admin.utilizador.nome, email: admin.utilizador.email }
    : null;
}

/**
 * Resolve o titular de uma licença qualquer, cobrindo os dois ramos do modelo
 * polimórfico (§3.11): Individual (titular `utilizadorId`) ou Clube (admin do
 * clube). `null` se não houver titular identificável.
 */
function resolverTitular(l: LicencaCrua): TitularLicenca | null {
  if (l.utilizador) {
    return { nome: l.utilizador.nome, email: l.utilizador.email };
  }
  if (l.clube) return resolverAdminTitular(l.clube.membros);
  return null;
}

/**
 * Mapeia o resultado cru para a forma exibida no backoffice: o clube passa a
 * expor `adminEmail` (resolvido) em vez da lista de membros.
 */
function mapearLicenca(l: LicencaCrua) {
  const { clube, ...resto } = l;
  return {
    ...resto,
    clube: clube
      ? {
          id: clube.id,
          nome: clube.nome,
          adminEmail: resolverAdminTitular(clube.membros)?.email ?? null,
        }
      : null,
  };
}

/** Licença enriquecida com o titular resolvido, tal como exibida no backoffice. */
export type LicencaAdmin = ReturnType<typeof mapearLicenca>;

/**
 * `dataFim` a atribuir na ativação quando a licença ainda não tem uma: alinhada
 * ao ciclo de faturação — MENSAL → +1 mês; ANUAL → +1 ano, a contar de `desde`.
 * No fluxo interino por transferência (§17.5) o titular paga um ciclo; a licença
 * fica válida (§3.11 `licencaValida`) até ao fim desse ciclo. Função pura.
 */
function calcularDataFimAtivacao(ciclo: CicloFaturacao, desde: Date): Date {
  const dataFim = new Date(desde);
  if (ciclo === "ANUAL") {
    dataFim.setFullYear(dataFim.getFullYear() + 1);
  } else {
    dataFim.setMonth(dataFim.getMonth() + 1);
  }
  return dataFim;
}

/** Query interna partilhada (não exportada; não é Server Action). */
async function consultarLicencasAdmin(): Promise<LicencaAdmin[]> {
  const licencas = await prisma.licenca.findMany({
    select: selecaoLicencaAdmin,
    orderBy: { criadoEm: "desc" },
  });
  return licencas.map(mapearLicenca);
}

/**
 * Lista TODAS as licenças da plataforma (cross-tenant), com o titular resolvido
 * (utilizador ou clube). Ordena por data de criação desc. Só admins de plataforma.
 */
export async function listarTodasLicencas(): Promise<Resultado<LicencaAdmin[]>> {
  await exigirAdminPlataforma();

  try {
    const licencas = await consultarLicencasAdmin();
    return ok(licencas);
  } catch {
    return erro("Não foi possível listar as licenças");
  }
}

/**
 * Altera o estado de uma licença para ATIVA, SUSPENSA ou CANCELADA.
 * EXPIRADA não é permitida (estado derivado de `dataFim`). Só admins de plataforma.
 */
export async function alterarEstadoLicenca(
  dados: unknown,
): Promise<Resultado<LicencaAdmin>> {
  await exigirAdminPlataforma();

  const parsed = AlterarEstadoLicencaSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  try {
    const licenca = await prisma.licenca.update({
      where: { id: parsed.data.licencaId },
      data: { estado: parsed.data.estado },
      select: selecaoLicencaAdmin,
    });

    revalidatePath(PATH);
    return ok(mapearLicenca(licenca));
  } catch (e) {
    if (e instanceof z.ZodError) return erroDeValidacao(e);
    return erro("Não foi possível alterar o estado da licença");
  }
}

/**
 * Ativa uma licença após confirmação de pagamento (`PENDENTE → ATIVA`, §17.5 /
 * §21.2). Ação dedicada — distinta de `alterarEstadoLicenca` — que, além de mudar
 * o estado:
 *   1. Define `dataFim` alinhada ao ciclo, se ainda não estiver definida.
 *   2. Notifica o TITULAR por email ("A tua conta Mister está pronta"), resolvendo
 *      o destinatário nos dois ramos do modelo (§3.11): Individual (titular
 *      `utilizadorId`) e Clube (admin do clube).
 *
 * O email é **best-effort** (§17.5): uma falha de envio NUNCA desfaz a ativação
 * (a licença já está persistida como ATIVA). Só admins de plataforma.
 */
export async function ativarLicenca(
  dados: unknown,
): Promise<Resultado<LicencaAdmin>> {
  await exigirAdminPlataforma();

  const parsed = AtivarLicencaSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  // Lê o estado atual para: (a) preservar `dataFim` se já existir; (b) conhecer o
  // ciclo para calcular a validade quando não há `dataFim`.
  const atual = await prisma.licenca.findUnique({
    where: { id: parsed.data.licencaId },
    select: { dataFim: true, ciclo: true },
  });
  if (!atual) return erro("Licença não encontrada");

  const dataFim = atual.dataFim ?? calcularDataFimAtivacao(atual.ciclo, new Date());

  let licenca: LicencaCrua;
  try {
    licenca = await prisma.licenca.update({
      where: { id: parsed.data.licencaId },
      data: { estado: "ATIVA", dataFim },
      select: selecaoLicencaAdmin,
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return erro("Licença não encontrada");
    }
    return erro("Não foi possível ativar a licença");
  }

  revalidatePath(PATH);

  // Notificação ao titular (§17.5). Best-effort: `enviarEmail` já degrada
  // graciosamente; o try/catch é um cinto adicional para nunca partir a ação.
  const titular = resolverTitular(licenca);
  if (titular) {
    try {
      const conteudo = emailContaAtivada({
        nome: titular.nome,
        email: titular.email,
      });
      await enviarEmail({
        para: titular.email,
        assunto: conteudo.assunto,
        html: conteudo.html,
        texto: conteudo.texto,
      });
    } catch (e) {
      console.error("ativarLicenca: falha ao notificar o titular da ativação", e);
    }
  }

  return ok(mapearLicenca(licenca));
}

/**
 * Edita a data de fim de uma licença (`null` = sem expiração).
 * Só admins de plataforma.
 */
export async function editarDataFimLicenca(
  dados: unknown,
): Promise<Resultado<LicencaAdmin>> {
  await exigirAdminPlataforma();

  const parsed = EditarDataFimLicencaSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  try {
    const licenca = await prisma.licenca.update({
      where: { id: parsed.data.licencaId },
      data: { dataFim: parsed.data.dataFim },
      select: selecaoLicencaAdmin,
    });

    revalidatePath(PATH);
    return ok(mapearLicenca(licenca));
  } catch (e) {
    if (e instanceof z.ZodError) return erroDeValidacao(e);
    return erro("Não foi possível editar a data de fim da licença");
  }
}
