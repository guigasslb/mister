import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Users,
  ClipboardList,
  LineChart,
  MessageCircle,
  Target,
  FileText,
  ArrowRight,
  Check,
  Mail,
} from "lucide-react";
import { Logo } from "@/components/layout/Logo";

const LARANJA = "#F0531E"; // acento/decorativo (ícones, bordas, texto sobre escuro)
const LARANJA_ACAO = "#C7430F"; // laranja-600: fundos c/ texto branco (AA 4.95:1)
const INK = "#141210";

type Funcionalidade = {
  icon: LucideIcon;
  titulo: string;
  descricao: string;
};

const FUNCIONALIDADES: Funcionalidade[] = [
  {
    icon: Users,
    titulo: "Plantel organizado, em qualquer modalidade",
    descricao:
      "Regista cada atleta uma vez. A app organiza escalões, posições, histórico de época e taxa de presença — para futsal e futebol no mesmo clube.",
  },
  {
    icon: ClipboardList,
    titulo: "Sessões planeadas, campo desenhado em segundos",
    descricao:
      "Cria as tuas sessões e desenha exercícios directamente no campo — quadra de futsal ou relvado de futebol, à escala certa, com animações de movimento.",
  },
  {
    icon: LineChart,
    titulo: "Jogos, estatísticas e analytics",
    descricao:
      "Convocatórias, estatísticas de jogo e gráficos de evolução por atleta — em futsal e em futebol. Os dados entram pelo uso; os relatórios saem sozinhos.",
  },
  {
    icon: MessageCircle,
    titulo: "Comunicação via WhatsApp",
    descricao:
      "Gera convocatórias e resumos prontos a partilhar com pais e equipa técnica num toque.",
  },
  {
    icon: Target,
    titulo: "Modelo de jogo e scouting",
    descricao:
      "Documenta o teu modelo de jogo, bolas paradas e observa o adversário no próprio jogo.",
  },
  {
    icon: FileText,
    titulo: "Relatórios partilháveis",
    descricao:
      "Relatórios de fim de época profissionais em PDF e vista web com link, sem esforço extra.",
  },
];

type Plano = {
  nome: string;
  publico: string;
  preco: string;
  sufixo: string;
  destaque: boolean;
  itens: string[];
  cta: string;
  href: string;
};

const PLANOS: Plano[] = [
  {
    nome: "Individual",
    publico: "Para treinadores — uma modalidade",
    preco: "€4,99",
    sufixo: "/mês",
    destaque: false,
    itens: [
      "Uma modalidade (futsal ou futebol)",
      "Plantel, treinos e jogos",
      "Editor de campo e biblioteca de exercícios",
      "Estatísticas do atleta",
      "Comunicação via WhatsApp",
    ],
    cta: "Começar agora",
    href: "/registar",
  },
  {
    nome: "Clube",
    publico: "Para clubes com múltiplos escalões",
    preco: "a partir de €15",
    sufixo: "/mês",
    destaque: true,
    itens: [
      "Tudo o que tens no plano Individual",
      "Vários escalões e treinadores",
      "Permissões por perfil e branding do clube",
      "Analytics transversais e relatórios de clube",
    ],
    cta: "Falar connosco",
    href: "#contacto",
  },
];

export default function RootPage() {
  return (
    <main
      className="landing-root min-h-screen"
      style={{ backgroundColor: "#ffffff", color: "#141210" }}
    >
      {/* ── Hero (fundo escuro / preto quente) ─────────────────────────── */}
      <section
        className="relative overflow-hidden text-white"
        style={{
          backgroundColor: "#0F0E13",
          backgroundImage:
            "radial-gradient(120% 70% at 100% -10%, rgba(240,83,30,0.28) 0%, transparent 55%)",
        }}
      >
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <Logo size={24} variant="dark" />
          <nav className="flex items-center gap-2 sm:gap-3">
            <a
              href="#contacto"
              className="hidden rounded-lg px-4 py-2 text-corpo font-semibold text-white/90 transition-colors hover:text-white sm:inline-block"
            >
              Contacto
            </a>
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-corpo font-semibold text-white/90 transition-colors hover:text-white"
            >
              Entrar
            </Link>
            <Link
              href="/registar"
              className="rounded-lg px-4 py-2 text-corpo font-semibold text-white transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: LARANJA_ACAO }}
            >
              Começar agora
            </Link>
          </nav>
        </header>

        <div className="mx-auto max-w-6xl px-6 pb-20 pt-10 sm:pt-16">
          <div className="max-w-3xl">
            <h1
              className="font-display text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              Gere o teu clube.{" "}
              <span style={{ color: LARANJA }}>Futsal e futebol.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white/75 sm:text-xl">
              O Mister junta tudo o que o treinador precisa: plantel, treinos,
              jogos, estatísticas e comunicação. Numa app feita para a
              beira-campo — em futsal e em futebol.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/registar"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-base font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5"
                style={{ backgroundColor: LARANJA_ACAO }}
              >
                Começar agora
                <ArrowRight size={18} aria-hidden />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
              >
                Entrar
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Funcionalidades ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-cinza-900 sm:text-4xl">
            Tudo o que o treinador precisa
          </h2>
          <p className="mt-4 text-lg text-cinza-600">
            Futsal a sério. Futebol a sério. Feito para a beira-campo.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FUNCIONALIDADES.map(({ icon: Icon, titulo, descricao }) => (
            <article
              key={titulo}
              className="rounded-2xl border border-cinza-200 bg-cinza-50 p-6 transition-shadow hover:shadow-md"
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: "rgba(240,83,30,0.12)", color: LARANJA }}
              >
                <Icon size={24} aria-hidden />
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold text-cinza-900">
                {titulo}
              </h3>
              <p className="mt-2 text-corpo leading-relaxed text-cinza-600">
                {descricao}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Planos / comparação ─────────────────────────────────────────── */}
      <section className="bg-cinza-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-cinza-900 sm:text-4xl">
              Um preço simples, dois modos
            </h2>
            <p className="mt-4 text-lg text-cinza-600">
              Começa sozinho como treinador ou traz o clube inteiro.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
            {PLANOS.map((plano) => (
              <article
                key={plano.nome}
                className="flex flex-col rounded-2xl border bg-white p-8"
                style={{
                  borderColor: plano.destaque ? LARANJA : "#E4E1DB",
                  borderWidth: plano.destaque ? 2 : 1,
                }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl font-bold text-cinza-900">
                    {plano.nome}
                  </h3>
                  {plano.destaque && (
                    <span
                      className="rounded-full px-3 py-1 text-legenda font-semibold text-white"
                      style={{ backgroundColor: LARANJA_ACAO }}
                    >
                      Recomendado
                    </span>
                  )}
                </div>
                <p className="mt-1 text-corpo text-cinza-600">{plano.publico}</p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-extrabold text-cinza-900">
                    {plano.preco}
                  </span>
                  <span className="text-corpo text-cinza-500">{plano.sufixo}</span>
                </div>

                <ul className="mt-6 flex-1 space-y-3">
                  {plano.itens.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <Check
                        size={18}
                        className="mt-0.5 shrink-0"
                        style={{ color: LARANJA }}
                        aria-hidden
                      />
                      <span className="text-corpo text-cinza-700">{item}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plano.href}
                  className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold transition-transform hover:-translate-y-0.5"
                  style={
                    plano.destaque
                      ? { backgroundColor: LARANJA_ACAO, color: "#FFFFFF" }
                      : { backgroundColor: INK, color: "#FFFFFF" }
                  }
                >
                  {plano.cta}
                  <ArrowRight size={18} aria-hidden />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contacto ────────────────────────────────────────────────────── */}
      <section
        id="contacto"
        className="scroll-mt-20 text-white"
        style={{
          backgroundColor: "#0F0E13",
          backgroundImage:
            "radial-gradient(120% 70% at 0% 110%, rgba(240,83,30,0.28) 0%, transparent 55%)",
        }}
      >
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(240,83,30,0.15)", color: LARANJA }}
          >
            <Mail size={24} aria-hidden />
          </div>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Fala connosco
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/75">
            Tens dúvidas, sugestões ou queres saber mais sobre o Mister?
            Envia-nos um email.
          </p>
          <a
            href="mailto:goncalo.pereira.1992@gmail.com?subject=Contacto%20Mister"
            className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-base font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: LARANJA_ACAO }}
          >
            <Mail size={18} aria-hidden />
            goncalo.pereira.1992@gmail.com
          </a>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: "#0F0E13" }} className="text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
          <Logo size={20} variant="dark" />
          <p className="text-corpo-sec text-white/60">
            © 2026 Mister · Feito em Portugal
          </p>
        </div>
      </footer>
    </main>
  );
}
