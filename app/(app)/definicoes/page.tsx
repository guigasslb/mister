import type { Metadata } from "next";
import Link from "next/link";
import { Users, CalendarRange, BarChart2, BookOpen, UserCog, ShieldCheck, Palette, Tag, CreditCard, Plug, Layers } from "lucide-react";
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
};

const SECCOES: SeccaoDefinicoes[] = [
  { href: "/definicoes/clube", label: "Clube", descricao: "Nome, cores e logótipo do clube", icon: Palette, caps: ["CLUBE_BRANDING"] },
  { href: "/definicoes/seccoes", label: "Secções", descricao: "Modalidades do clube e coordenadores de secção", icon: Layers, caps: ["CLUBE_ESCALOES", "CLUBE_UTILIZADORES"] },
  { href: "/definicoes/escaloes", label: "Escalões", descricao: "Criar e gerir os escalões do clube", icon: Users, caps: ["CLUBE_ESCALOES", "SECCAO_ESCALOES_GERIR"] },
  { href: "/definicoes/epocas", label: "Épocas", descricao: "Criar épocas e definir a época ativa", icon: CalendarRange, caps: ["CLUBE_EPOCAS"] },
  { href: "/definicoes/metricas", label: "Métricas", descricao: "Configurar métricas de estatísticas de jogo", icon: BarChart2, caps: ["CATALOGO_METRICAS"] },
  { href: "/definicoes/habilidades", label: "Habilidades", descricao: "Catálogo de habilidades para a caderneta", icon: BookOpen, caps: ["CATALOGO_HABILIDADES"] },
  { href: "/definicoes/subcategorias", label: "Subcategorias", descricao: "Classificação de exercícios customizável", icon: Tag, caps: ["EXERCICIOS_GERIR"] },
  { href: "/definicoes/utilizadores", label: "Equipa técnica", descricao: "Treinadores do clube e atribuição a escalões", icon: UserCog, caps: ["CLUBE_UTILIZADORES"] },
  { href: "/definicoes/perfis", label: "Perfis", descricao: "Perfis de permissões (configuráveis)", icon: ShieldCheck, caps: ["CLUBE_PERFIS"] },
  { href: "/definicoes/licenca", label: "Licença", descricao: "Subscrição, carteira e histórico de movimentos", icon: CreditCard },
  { href: "/definicoes/integracao", label: "Integrações", descricao: "Sincronização com o Google Calendar", icon: Plug },
];

export const metadata: Metadata = { title: "Definições" };

export default async function DefinicoesPage() {
  const membro = await obterMembroAtual();
  const capacidades = membro?.capacidades ?? [];
  const visiveis = SECCOES.filter(
    (s) => !s.caps || s.caps.some((c) => capacidades.includes(c)),
  );

  return (
    <div className="space-y-6">
      <h1>Definições</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visiveis.map(({ href, label, descricao, icon: Icon }) => (
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
    </div>
  );
}
