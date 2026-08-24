// ─────────────────────────────────────────────
// Guarda de plataforma — acesso ao backoffice interno (/admin).
//
// SEPARADA da autenticação e da guarda de licença (segue o padrão de
// `lib/guarda-licenca.ts` / `lib/permissoes.ts`): a auth continua intocável.
// Um admin de plataforma é um operador do produto Mister (não um papel de
// clube) — identificado pelo campo persistente `Utilizador.isAdmin` na BD
// (fonte de verdade), NÃO por uma variável de ambiente. Ver bíblia §21.1.
// ─────────────────────────────────────────────

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Verdadeiro quando existe um `Utilizador` com este `email` e `isAdmin = true`.
 * A identificação de admin é persistida na BD (não depende de env vars). A
 * comparação de email é case-insensitive (o email da sessão vem do próprio
 * registo, mas a insensibilidade evita divergências por capitalização).
 * Sem email, ou sem correspondência, ninguém é admin.
 */
export async function eAdminPlataforma(
  email: string | null | undefined,
): Promise<boolean> {
  if (!email || !email.trim()) return false;
  const utilizador = await prisma.utilizador.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
    select: { isAdmin: true },
  });
  return utilizador?.isAdmin ?? false;
}

/**
 * Guarda para Server Components / layouts do grupo (admin): redireciona para
 * /dashboard quem não seja admin de plataforma (sessão em falta ou utilizador
 * sem `isAdmin`). Não expõe a existência do backoffice a não-admins.
 */
export async function exigirAdminPlataforma(): Promise<void> {
  const sessao = await auth();
  if (!(await eAdminPlataforma(sessao?.user?.email))) {
    redirect("/dashboard");
  }
}
