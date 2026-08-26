import Image from "next/image";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listarEpocas } from "@/lib/actions/epocas";
import { obterSeccoes } from "@/lib/actions/seccoes";
import { obterEpocaAtiva } from "@/lib/epoca-context";
import { obterMembroAtual } from "@/lib/permissoes";
import { eAdminPlataforma } from "@/lib/admin-guard";
import { temLicencaValida } from "@/lib/licenca";
import { BarraTopo } from "@/components/layout/BarraTopo";
import { Navegacao } from "@/components/layout/Navegacao";
import { ScrollTopo } from "@/components/layout/ScrollTopo";
import { ServicoIndisponivel } from "@/components/layout/ServicoIndisponivel";
import { GuardaLicenca } from "@/components/layout/GuardaLicenca";

/** Converte um hex (#rrggbb) para "H S% L%" (formato das CSS vars do shadcn). */
function hexParaHslVar(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Degradação graciosa: qualquer falha de BD (Supabase P1001 / pool esgotado
  // P2024) nas queries abaixo renderiza um ecrã amigável em vez de HTTP 500.
  // `unstable_rethrow` garante que os redirects de auth/onboarding (NEXT_REDIRECT)
  // continuam a propagar-se normalmente — o fluxo de autenticação fica intocado.
  try {
    // Sessão obsoleta (JWT válido mas utilizador já não existe — ex.: BD reseeded):
    // enviar para /login (e não forçar /criar-clube).
    const utilizadorExiste = await prisma.utilizador.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
    if (!utilizadorExiste) redirect("/login");

    // Admin de plataforma (`Utilizador.isAdmin` na BD) — operador do produto,
    // independente de qualquer papel de clube. Avaliado UMA vez e reutilizado
    // para: (a) o redirect de onboarding abaixo; (b) o atalho "Backoffice" na
    // navegação. Routing puro — a autenticação fica intocada.
    const eAdmin = await eAdminPlataforma(session.user.email);

    // Sem clube ativo → onboarding (criar clube ou aceitar convite).
    // Exceção: um admin de plataforma não tem MembroClube; sem esta exceção
    // cairia no onboarding (/criar-clube). Enviá-lo antes para o backoffice
    // interno (/admin). Um admin COM clube (conta híbrida) não é redirecionado —
    // fica no dashboard e acede ao backoffice pelo atalho da navegação.
    const membro = await obterMembroAtual();
    if (!membro) {
      if (eAdmin) redirect("/admin");
      redirect("/criar-clube");
    }

    // Guarda de licença (§3.11) — SEPARADA da autenticação: só entra na área da
    // app quem tem subscrição válida (licença do clube OU Individual). Sem
    // licença válida → paywall (/sem-licenca), que vive fora deste grupo de
    // rotas (sem ciclo de redirect).
    //
    // A validade é avaliada AQUI (server-side), mas a DECISÃO de bloquear é
    // aplicada no cliente por <GuardaLicenca> (abaixo), porque depende da rota
    // atual: o fluxo de /onboarding fica acessível sem licença para o utilizador
    // concluir o setup antes do paywall. O pathname não está disponível de forma
    // limpa num layout server-side sem alterar o middleware (intocável).
    const [licencaOk, epocasResult, epocaAtiva, seccoesResult] = await Promise.all([
      temLicencaValida(membro.clube.id, membro.utilizadorId),
      listarEpocas(),
      obterEpocaAtiva(),
      obterSeccoes(),
    ]);
    const epocas = epocasResult.sucesso ? epocasResult.dados : [];
    const clube = membro.clube;

    // Secções do clube (§8.1.1): alimentam o seletor transversal, que só aparece
    // com 2+ secções. A secção ativa vive num cookie de UI (nunca é autorização).
    const seccoes = seccoesResult.sucesso
      ? seccoesResult.dados.map((s) => ({
          id: s.id,
          nome: s.nome,
          modalidade: s.modalidade,
        }))
      : [];
    const cookieSeccao = (await cookies()).get("seccaoAtiva")?.value ?? null;
    const seccaoAtivaId = seccoes.some((s) => s.id === cookieSeccao)
      ? cookieSeccao
      : null;

    // Indicador de "evento hoje" no cabeçalho (F14 / §8.16) — treino ou jogo do
    // clube na época ativa, no dia de hoje. Usa os dados existentes.
    let eventoHoje = false;
    // Plantel vazio → mostra o atalho "Começar" (vitória rápida) na navegação (F10 / §8.1).
    let plantelVazio = false;
    if (epocaAtiva) {
      const inicioDia = new Date();
      inicioDia.setHours(0, 0, 0, 0);
      const fimDia = new Date();
      fimDia.setHours(23, 59, 59, 999);
      const janela = { gte: inicioDia, lte: fimDia };
      const [nSessoesHoje, nJogosHoje, nAtletas] = await Promise.all([
        prisma.sessao.count({
          where: { epocaId: epocaAtiva.id, escalao: { clubeId: clube.id }, data: janela },
        }),
        prisma.jogo.count({
          where: { epocaId: epocaAtiva.id, escalao: { clubeId: clube.id }, data: janela },
        }),
        prisma.atleta.count({
          where: {
            clubeId: clube.id,
            ativo: true,
            participacoes: { some: { epocaId: epocaAtiva.id, estado: "ATIVO" } },
          },
        }),
      ]);
      eventoHoje = nSessoesHoje + nJogosHoje > 0;
      plantelVazio = nAtletas === 0;
    }

    // A cor do clube alimenta os acentos (via --cor-primaria) e a primária do
    // shadcn/ui (via --primary/--ring), para os botões seguirem o clube.
    const hslClube = hexParaHslVar(clube.corPrimaria);
    const estiloClube = {
      "--cor-primaria": clube.corPrimaria,
      "--cor-secundaria": clube.corSecundaria,
      ...(hslClube ? { "--primary": hslClube, "--ring": hslClube } : {}),
    } as React.CSSProperties;

    return (
      <GuardaLicenca licencaOk={licencaOk}>
        <div className="flex min-h-screen flex-col" style={estiloClube}>
          <BarraTopo
            nomeUtilizador={session.user.name ?? "Utilizador"}
            nomeClube={clube.nome}
            logoClube={clube.logoUrl}
            epocas={epocas}
            epocaAtivaId={epocaAtiva?.id ?? null}
            seccoes={seccoes}
            seccaoAtivaId={seccaoAtivaId}
            eventoHoje={eventoHoje}
          />

          <div className="flex flex-1 overflow-hidden">
            <Navegacao
              mostrarComecar={plantelVazio}
              // Agenda visível a todos os treinadores autenticados: obterAgendaClube
              // já faz o scoping pelos escalões legíveis de cada membro (§6.4).
              mostrarAgenda={true}
              // Atalho "Backoffice" (/admin) só para admins de plataforma. O acesso
              // é sempre re-validado server-side por exigirAdminPlataforma no grupo
              // (admin); a prop só controla a visibilidade do item de navegação.
              mostrarAdmin={eAdmin}
            />

            <ScrollTopo />
            <main className="app-surface flex-1 overflow-y-auto p-4 pb-20 md:pb-8 md:p-8">
              {/* Marca de água do clube (logótipo), visível em todos os tamanhos */}
              {clube.logoUrl && (
                <Image
                  src={clube.logoUrl}
                  alt=""
                  aria-hidden={true}
                  fill
                  sizes="100vw"
                  className="club-watermark"
                />
              )}
              <div className="app-content animar-entrada mx-auto max-w-[1200px]">
                {!epocaAtiva && (
                  <div className="mb-4 rounded-md border border-ambar-500/30 bg-ambar-500/10 px-4 py-3 text-corpo text-cinza-900">
                    Nenhuma época ativa —{" "}
                    <a href="/definicoes/epocas" className="font-medium underline">
                      define uma nas Definições
                    </a>
                    .
                  </div>
                )}
                {children}
              </div>
            </main>
          </div>
        </div>
      </GuardaLicenca>
    );
  } catch (err) {
    // Re-lança erros de controlo do Next (redirect/notFound) — mantém o fluxo
    // de auth e onboarding. Só erros genuínos (ex.: BD indisponível) chegam aqui.
    unstable_rethrow(err);
    return <ServicoIndisponivel />;
  }
}
