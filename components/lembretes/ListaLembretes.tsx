import { obterLembretes } from "@/lib/actions/lembretes";
import { obterMembroAtual } from "@/lib/permissoes";
import { listarMembrosBasico } from "@/lib/actions/utilizadores";
import { LembretesPainel } from "./LembretesPainel";
import type { MembroBasico } from "./CriarLembreteForm";

/**
 * Secção de lembretes do dashboard (P2.1 — §3.15/§8.19).
 * Server Component: obtém os lembretes pendentes do utilizador, a lista de
 * destinatários possíveis (membros do clube) e se pode gerir, delegando a
 * interatividade ao painel cliente.
 */
export async function ListaLembretes() {
  const [resLembretes, ctx] = await Promise.all([
    obterLembretes(),
    obterMembroAtual(),
  ]);

  if (!resLembretes.sucesso || !ctx) return null;

  // Só mostramos os pendentes (não concluídos).
  const pendentes = resLembretes.dados.filter((l) => !l.concluido);

  const podeGerir = ctx.capacidades.includes("LEMBRETES_EQUIPA_GERIR");

  let membros: MembroBasico[] = [];
  if (podeGerir) {
    const resMembros = await listarMembrosBasico();
    if (resMembros.sucesso) {
      membros = resMembros.dados
        .filter((m) => m.utilizadorId !== ctx.utilizadorId)
        .map((m) => ({ utilizadorId: m.utilizadorId, nome: m.nome }));
    }
  }

  return (
    <LembretesPainel lembretes={pendentes} membros={membros} podeGerir={podeGerir} />
  );
}
