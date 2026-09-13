import type { Metadata } from "next";
import Link from "next/link";
import { Users, CalendarRange, BarChart2, UserCog, ShieldCheck, Palette, Tag, CreditCard, Plug, Layers } from "lucide-react";
import { obterMembroAtual } from "@/lib/permissoes";
import type { Capacidade } from "@/lib/permissoes-catalogo";

// Cada card só aparece se o utilizador tiver PELO MENOS UMA das capacidades
// indicadas (§6.7 — gating de UI). `caps` ausente/vazio → visível a todos
// (informação relevante para qualquer membro, ex.: Licença, Integrações).
type SeccaoDefinicoes = {
  href: string;
  label: string;
  descricao: string;
  icon: typeof Palette;
  caps?: Capacidade[];
  // §8.1 — módulo de gestão de clube (branding, secções, equipa técnica,
  // perfis). No modo Individual (clube técnico, §3.1) não existe estrutura de
  // clube a gerir, pelo que estas entradas ficam ocultas.
  ocultarIndividual?: boolean;
};

// §8.4 — o painel de Definições organiza-se em 4 grupos rotulados. Um grupo só
// é renderizado se tiver pelo menos um cartão visível (o gating por cartão
// mantém-se: `caps` + `ocultarIndividual`).
type GrupoDefinicoes = {
  titulo: string;
  seccoes: SeccaoDefinicoes[];
};

const GRUPOS: GrupoDefinicoes[] = [
  {
    titulo: "Clube",
    seccoes: [
      { href: "/definicoes/clube", label: "Marca", descricao: "Nome, cores e logótipo do clube", icon: Palette, caps: ["CLUBE_BRANDING"], ocultarIndividual: true },
      { href: "/definicoes/seccoes", label: "Secções", descricao: "Modalidades do clube e coordenadores de secção", icon: Layers, caps: ["CLUBE_ESCALOES", "CLUBE_UTILIZADORES"], ocultarIndividual: true },
      { href: "/definicoes/escaloes", label: "Escalões", descricao: "Criar e gerir os escalões do clube", icon: Users, caps: ["CLUBE_ESCALOES", "SECCAO_ESCALOES_GERIR"] },
      { href: "/definicoes/epocas", label: "Épocas", descricao: "Criar épocas e definir a época ativa", icon: CalendarRange, caps: ["CLUBE_EPOCAS"] },
    ],
  },
  {
    titulo: "Catálogos",
    seccoes: [
      { href: "/definicoes/metricas", label: "Métricas", descricao: "Configurar métricas de estatísticas de jogo", icon: BarChart2, caps: ["CATALOGO_METRICAS"] },
      { href: "/definicoes/subcategorias", label: "Tipos de exercício", descricao: "Classificação personalizada de exercícios", icon: Tag, caps: ["EXERCICIOS_GERIR"] },
    ],
  },
  {
    titulo: "Pessoas e acessos",
    seccoes: [
      { href: "/definicoes/utilizadores", label: "Equipa técnica", descricao: "Treinadores do clube e atribuição a escalões", icon: UserCog, caps: ["CLUBE_UTILIZADORES"], ocultarIndividual: true },
      { href: "/definicoes/perfis", label: "Perfis e permissões", descricao: "Papéis e acessos por membro", icon: ShieldCheck, caps: ["CLUBE_PERFIS"], ocultarIndividual: true },
    ],
  },
  {
    titulo: "Conta e sistema",
    seccoes: [
      { href: "/definicoes/licenca", label: "Licença", descricao: "Subscrição, carteira e histórico de movimentos", icon: CreditCard },
      { href: "/definicoes/integracao", label: "Integrações", descricao: "Sincronização com o Google Calendar", icon: Plug },
    ],
  },
];

export const metadata: Metadata = { title: "Definições" };

export default async function DefinicoesPage() {
  const membro = await obterMembroAtual();
  const capacidades = membro?.capacidades ?? [];
  // Modo Individual = clube técnico invisível (§3.1). A gestão de clube não é
  // apenas bloqueada, é OCULTA (§8.1): filtramos as entradas `ocultarIndividual`.
  const individual = membro?.clube.clubeTecnico ?? false;
  const eVisivel = (s: SeccaoDefinicoes) =>
    (!s.caps || s.caps.some((c) => capacidades.includes(c))) &&
    !(individual && s.ocultarIndividual);

  // Aplica o gating por cartão e descarta grupos que fiquem sem cartões — sem
  // cabeçalhos de grupo vazios.
  const grupos = GRUPOS.map((g) => ({
    ...g,
    seccoes: g.seccoes.filter(eVisivel),
  })).filter((g) => g.seccoes.length > 0);

  return (
    <div className="space-y-8">
      <h1>Definições</h1>
      {grupos.map((grupo) => (
        <section key={grupo.titulo} className="space-y-3">
          <h2 className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
            {grupo.titulo}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {grupo.seccoes.map(({ href, label, descricao, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-[44px] items-center gap-4 rounded-md border border-cinza-200 bg-white p-4 shadow-card hover:border-primary/25 hover:bg-primary/5 transition-colors"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-primary/5">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-corpo font-semibold text-cinza-900">{label}</p>
                  <p className="text-corpo-sec text-cinza-600">{descricao}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
