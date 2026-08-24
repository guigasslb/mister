import type { Metadata } from "next";
import type { Modalidade, PapelSeccao, Seccao } from "@prisma/client";
import { obterMembroAtual } from "@/lib/permissoes";
import { obterSeccoes } from "@/lib/actions/seccoes";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { listarMembrosBasico } from "@/lib/actions/utilizadores";
import { EstadoErro } from "@/components/layout/EstadosUI";
import { SeccoesLista } from "@/components/definicoes/SeccoesLista";

export const metadata: Metadata = { title: "Definições · Secções" };

// Forma real devolvida por `obterSeccoes` (inclui os membros coordenadores). O
// tipo exportado da action é `Seccao[]`, pelo que refinamos localmente a forma
// que o `include` garante em runtime (sem tocar na action — outro agente).
type SeccaoComMembros = Seccao & {
  membros: {
    id: string;
    papel: PapelSeccao;
    membroClube: { id: string; utilizador: { nome: string } };
  }[];
};

const TODAS_MODALIDADES: Modalidade[] = ["FUTSAL", "FUTEBOL"];

// Gestão de secções (§8.22). A capacidade dedicada CLUBE_SECCOES ainda não existe
// no catálogo; a criação de secções segue `CLUBE_ESCALOES` (mesma capacidade de
// `adicionarSeccaoAoClube`) e a atribuição de coordenadores segue
// `CLUBE_UTILIZADORES` (§8.2 — "atribuir secções (Coordenador)").
export default async function SeccoesPage() {
  const ctx = await obterMembroAtual();
  if (!ctx) return <EstadoErro mensagem="Sem acesso a este clube" />;

  const podeCriarSeccoes = ctx.capacidades.includes("CLUBE_ESCALOES");
  const podeGerirCoordenadores = ctx.capacidades.includes("CLUBE_UTILIZADORES");

  const [resSeccoes, resEscaloes, resMembros] = await Promise.all([
    obterSeccoes(),
    listarEscaloes(),
    listarMembrosBasico(),
  ]);

  if (!resSeccoes.sucesso) return <EstadoErro mensagem={resSeccoes.erro} />;
  if (!resEscaloes.sucesso) return <EstadoErro mensagem={resEscaloes.erro} />;

  const seccoesRaw = resSeccoes.dados as unknown as SeccaoComMembros[];
  const escaloes = resEscaloes.dados;
  const membros = resMembros.sucesso ? resMembros.dados : [];

  // Nº de escalões por secção (informativo na UI).
  const contagemEscaloes = new Map<string, number>();
  for (const e of escaloes) {
    if (!e.seccaoId) continue;
    contagemEscaloes.set(e.seccaoId, (contagemEscaloes.get(e.seccaoId) ?? 0) + 1);
  }

  const seccoes = seccoesRaw.map((s) => ({
    id: s.id,
    nome: s.nome,
    modalidade: s.modalidade,
    nEscaloes: contagemEscaloes.get(s.id) ?? 0,
    coordenadores: s.membros
      .filter((m) => m.papel === "COORDENADOR")
      .map((m) => ({
        membroClubeId: m.membroClube.id,
        nome: m.membroClube.utilizador.nome,
      })),
  }));

  const modalidadesPresentes = new Set(seccoes.map((s) => s.modalidade));
  const modalidadesDisponiveis = TODAS_MODALIDADES.filter(
    (m) => !modalidadesPresentes.has(m),
  );

  return (
    <SeccoesLista
      seccoes={seccoes}
      modalidadesDisponiveis={modalidadesDisponiveis}
      membros={membros.map((m) => ({ membroClubeId: m.membroId, nome: m.nome }))}
      podeCriarSeccoes={podeCriarSeccoes}
      podeGerirCoordenadores={podeGerirCoordenadores}
    />
  );
}
