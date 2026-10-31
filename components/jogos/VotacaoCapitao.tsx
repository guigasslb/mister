"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCircle2, Crown, Lock, RotateCcw, Users, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EstadoVazio } from "@/components/layout/EstadosUI";
import { AvatarAtleta } from "@/components/plantel/AvatarAtleta";
import {
  iniciarVotacaoCapitao,
  registarVotoCapitao,
  fecharVotacaoCapitao,
  escolherVencedorVotacaoCapitao,
  aplicarCapitaoVotacao,
  type VotacaoCapitaoVista,
} from "@/lib/actions/votacao-capitao";
import {
  candidatosVoto,
  linhasResultadoVotacao,
  progressoVotacao,
  votaveis,
} from "@/components/jogos/votacao-capitao-vista";
import type { Resultado } from "@/lib/utils";

/** Passo do modo votação (tablet de mão em mão). */
type Passo =
  | { tipo: "votante" }
  | { tipo: "voto"; votanteId: string; votadoId: string | null }
  | { tipo: "registado" };

/**
 * Votação secreta do capitão. Área do treinador (iniciar/fechar/repetir,
 * progresso, resultado) + modo votação em ecrã inteiro para os convocados. No
 * modo votação nunca se mostram votos nem contagens; sair dele exige confirmação.
 */
export function VotacaoCapitao({
  jogoId,
  vista,
  fotos,
  capitaoAtualId,
}: {
  jogoId: string;
  vista: VotacaoCapitaoVista;
  /** fotoUrl por atletaId (null/ausente → iniciais). */
  fotos: Record<string, string | null>;
  capitaoAtualId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modoVotacao, setModoVotacao] = useState(false);
  const [passo, setPasso] = useState<Passo>({ tipo: "votante" });
  const [desempateId, setDesempateId] = useState<string | null>(null);

  const { convocados } = vista;
  const progresso = progressoVotacao(convocados);
  const titulares = votaveis(convocados);
  const nomeDe = (id: string) => convocados.find((c) => c.atletaId === id)?.nome ?? "Atleta";

  function executar(
    acao: () => Promise<Resultado<unknown>>,
    sucesso: string | null,
    depois?: () => void,
  ) {
    startTransition(async () => {
      const res = await acao();
      if (res.sucesso) {
        if (sucesso) toast.success(sucesso);
        depois?.();
      } else {
        toast.error(res.erro);
      }
      router.refresh();
    });
  }

  function iniciar() {
    executar(() => iniciarVotacaoCapitao(jogoId), "Votação iniciada", () => {
      setDesempateId(null);
      setModoVotacao(false);
      setPasso({ tipo: "votante" });
    });
  }

  function fechar() {
    executar(() => fecharVotacaoCapitao(jogoId), "Votação fechada");
  }

  function confirmarVoto(votanteId: string, votadoId: string) {
    startTransition(async () => {
      const res = await registarVotoCapitao(jogoId, { votanteId, votadoId });
      // Sem toast de sucesso: o ecrã neutro confirma (e não revela o voto).
      if (res.sucesso) setPasso({ tipo: "registado" });
      else {
        toast.error(res.erro);
        setPasso({ tipo: "votante" });
      }
      router.refresh();
    });
  }

  // ─── Modo votação (ecrã inteiro, só com a votação aberta) ───
  if (modoVotacao && vista.estado === "ABERTA") {
    return (
      <div className="fixed inset-0 z-[45] flex flex-col bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-cinza-200 px-4 py-2">
          <p className="flex items-center gap-2 font-display text-titulo-seccao text-cinza-900">
            <Vote className="h-5 w-5 text-primary" />
            Votação do capitão
          </p>
          {progresso.emFalta.length === 0 && passo.tipo !== "voto" ? (
            <Button variant="outline" onClick={() => setModoVotacao(false)}>
              <Lock className="h-4 w-4" />
              Área do treinador
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-cinza-500">
                  <Lock className="h-4 w-4" />
                  Área do treinador
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Voltar à área do treinador?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Só para o treinador. A votação continua aberta e os votos já
                    registados mantêm-se.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Continuar a votar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setPasso({ tipo: "votante" });
                      setModoVotacao(false);
                    }}
                  >
                    Sou o treinador
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </header>

        <main className="flex flex-1 flex-col overflow-y-auto p-4 sm:p-6">
          {passo.tipo === "registado" ? (
            <div className="m-auto flex max-w-md flex-col items-center text-center">
              <CheckCircle2 className="h-20 w-20 text-verde-600" />
              <h2 className="mt-4 font-display text-titulo-pagina text-cinza-900">
                Voto registado!
              </h2>
              <p className="mt-2 text-titulo-seccao font-normal text-cinza-600">
                Passa o tablet ao próximo colega.
              </p>
              <Button size="lg" className="mt-8 min-h-[56px] px-10" onClick={() => setPasso({ tipo: "votante" })}>
                Continuar
              </Button>
            </div>
          ) : passo.tipo === "voto" ? (
            <>
              <h2 className="text-center font-display text-titulo-pagina text-cinza-900">
                Olá, {nomeDe(passo.votanteId).split(" ")[0]}! Em quem votas para capitão?
              </h2>
              <p className="mt-1 text-center text-corpo text-cinza-600">
                O teu voto é secreto. Só podes votar num colega titular.
              </p>
              {candidatosVoto(convocados, passo.votanteId).length === 0 && (
                <p className="mt-6 text-center text-corpo text-cinza-600">
                  Não há colegas titulares em quem votar. Entrega o tablet ao treinador.
                </p>
              )}
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {candidatosVoto(convocados, passo.votanteId).map((c) => {
                  const escolhido = passo.votadoId === c.atletaId;
                  return (
                    <li key={c.atletaId}>
                      <button
                        type="button"
                        aria-pressed={escolhido}
                        disabled={pending}
                        onClick={() => setPasso({ ...passo, votadoId: c.atletaId })}
                        className={`flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 p-3 text-center text-subtitulo text-cinza-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 ${
                          escolhido
                            ? "border-primary bg-primary/10"
                            : "border-cinza-200 bg-white hover:bg-cinza-50"
                        }`}
                      >
                        <AvatarAtleta nome={c.nome} fotoUrl={fotos[c.atletaId]} tamanho="lg" />
                        {c.nome}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="sticky bottom-0 mt-6 flex flex-col-reverse gap-3 border-t border-cinza-200 bg-white pt-4 sm:flex-row sm:justify-between">
                <Button
                  variant="outline"
                  size="lg"
                  disabled={pending}
                  onClick={() => setPasso({ tipo: "votante" })}
                >
                  Não és {nomeDe(passo.votanteId).split(" ")[0]}? Voltar
                </Button>
                <Button
                  size="lg"
                  className="min-h-[56px] px-10"
                  disabled={pending || !passo.votadoId}
                  onClick={() =>
                    passo.votadoId && confirmarVoto(passo.votanteId, passo.votadoId)
                  }
                >
                  <Check className="h-4 w-4" />
                  {pending ? "A registar…" : "Confirmar voto"}
                </Button>
              </div>
            </>
          ) : progresso.emFalta.length === 0 ? (
            <div className="m-auto flex max-w-md flex-col items-center text-center">
              <Users className="h-16 w-16 text-cinza-400" />
              <h2 className="mt-4 font-display text-titulo-pagina text-cinza-900">
                Já todos votaram!
              </h2>
              <p className="mt-2 text-corpo text-cinza-600">Entrega o tablet ao treinador.</p>
            </div>
          ) : (
            <>
              <h2 className="text-center font-display text-titulo-pagina text-cinza-900">
                Quem és tu?
              </h2>
              <p className="mt-1 text-center text-corpo text-cinza-600">
                Toca no teu nome para votar.
              </p>
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {progresso.emFalta.map((c) => (
                  <li key={c.atletaId}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        setPasso({ tipo: "voto", votanteId: c.atletaId, votadoId: null })
                      }
                      className="flex min-h-[96px] w-full items-center justify-center rounded-lg border-2 border-cinza-200 bg-white p-3 text-center text-titulo-seccao text-cinza-900 transition-colors hover:bg-cinza-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      {c.nome}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </main>
      </div>
    );
  }

  // ─── Área do treinador ───
  const botaoRepetir = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending}>
          <RotateCcw className="h-4 w-4" />
          Repetir votação
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Repetir a votação?</AlertDialogTitle>
          <AlertDialogDescription>
            Todos os votos registados são apagados e a votação recomeça do zero.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={iniciar}>Repetir votação</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (vista.estado === "SEM_VOTACAO") {
    return convocados.length < 2 ? (
      <EstadoVazio
        titulo="Convocatória insuficiente"
        descricao="São precisos pelo menos 2 convocados para votar o capitão. Guarda a convocatória do jogo primeiro."
      />
    ) : (
      <EstadoVazio
        titulo="Ainda não há votação"
        descricao={`Os ${convocados.length} convocados votam no tablet, um a um, em segredo, mas só os titulares do plano de jogo (equipa inicial) podem ser votados${titulares.length > 0 ? ` — ${titulares.length} ${titulares.length === 1 ? "titular definido" : "titulares definidos"}` : " — ainda sem titulares definidos"}. Ninguém vota em si próprio nem vê os votos até fechares a votação.`}
        acao={
          <Button size="lg" onClick={iniciar} disabled={pending}>
            <Vote className="h-4 w-4" />
            {pending ? "A iniciar…" : "Iniciar votação"}
          </Button>
        }
      />
    );
  }

  if (vista.estado === "ABERTA") {
    const percentagem = progresso.total ? (progresso.votaram / progresso.total) * 100 : 0;
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-cinza-200 bg-white p-4 shadow-card">
          <p className="text-subtitulo text-cinza-900" aria-live="polite">
            {progresso.votaram} de {progresso.total} já votaram
          </p>
          <p className="mt-1 text-corpo-sec text-cinza-600">
            Podem ser votados (titulares): {titulares.map((c) => c.nome).join(", ") || "nenhum"}
          </p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-cinza-100"
            role="progressbar"
            aria-label="Progresso da votação"
            aria-valuemin={0}
            aria-valuemax={progresso.total}
            aria-valuenow={progresso.votaram}
          >
            <div className="h-full bg-primary" style={{ width: `${percentagem}%` }} />
          </div>
          {progresso.emFalta.length > 0 ? (
            <div className="mt-4">
              <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
                Falta votar
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {progresso.emFalta.map((c) => (
                  <li
                    key={c.atletaId}
                    className="rounded-full bg-cinza-50 px-3 py-1 text-corpo-sec text-cinza-700"
                  >
                    {c.nome}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-corpo-sec text-cinza-600">
              <CheckCircle2 className="h-4 w-4 text-verde-600" />
              Todos os convocados já votaram. Podes fechar a votação.
            </p>
          )}
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {progresso.emFalta.length > 0 && (
            <Button
              size="lg"
              onClick={() => {
                setPasso({ tipo: "votante" });
                setModoVotacao(true);
              }}
              disabled={pending}
            >
              <Users className="h-4 w-4" />
              Passar o tablet aos atletas
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="lg" disabled={pending}>
                <Lock className="h-4 w-4" />
                Fechar votação
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Fechar a votação?</AlertDialogTitle>
                <AlertDialogDescription>
                  {progresso.emFalta.length > 0
                    ? `Ainda ${progresso.emFalta.length === 1 ? "falta 1 atleta" : `faltam ${progresso.emFalta.length} atletas`} votar. Depois de fechar, ninguém mais pode votar e o resultado fica visível.`
                    : "Depois de fechar, ninguém mais pode votar e o resultado fica visível."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={fechar}>Fechar votação</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {botaoRepetir}
        </div>
      </div>
    );
  }

  // ─── FECHADA: resultado (só para o treinador) ───
  const { apuramento, vencedorAtletaId } = vista;
  if (apuramento.tipo === "SEM_VOTOS") {
    return (
      <EstadoVazio
        titulo="Ninguém votou"
        descricao="A votação foi fechada sem votos. Repete a votação para eleger o capitão."
        acao={botaoRepetir}
      />
    );
  }

  const linhas = linhasResultadoVotacao(apuramento, convocados);
  const maxVotos = Math.max(...linhas.map((l) => l.votos));
  const votosDe = (id: string) => linhas.find((l) => l.atletaId === id)?.votos ?? 0;
  const textoVotos = (n: number) => (n === 1 ? "1 voto" : `${n} votos`);

  return (
    <div className="space-y-4">
      {vencedorAtletaId ? (
        <section className="flex flex-col items-center gap-3 rounded-lg border border-ambar-500/40 bg-ambar-500/10 p-6 text-center">
          <AvatarAtleta nome={nomeDe(vencedorAtletaId)} fotoUrl={fotos[vencedorAtletaId]} tamanho="xl" />
          <div>
            <p className="flex items-center justify-center gap-1.5 text-legenda font-medium uppercase tracking-wide text-ambar-600">
              <Crown className="h-4 w-4" />
              Capitão eleito
            </p>
            <p className="font-display text-titulo-pagina text-cinza-900">
              {nomeDe(vencedorAtletaId)}
            </p>
            <p className="text-corpo-sec text-cinza-600">
              {textoVotos(votosDe(vencedorAtletaId))}
              {apuramento.tipo === "EMPATE" ? " · escolhido pelo treinador no desempate" : ""}
            </p>
          </div>
          {capitaoAtualId === vencedorAtletaId ? (
            <p className="flex items-center gap-1.5 text-corpo-sec font-medium text-cinza-900">
              <Check className="h-4 w-4 text-verde-600" />
              Já é o capitão deste jogo
            </p>
          ) : (
            <Button
              size="lg"
              disabled={pending}
              onClick={() =>
                executar(() => aplicarCapitaoVotacao(jogoId), "Capitão do jogo definido")
              }
            >
              <Crown className="h-4 w-4" />
              {pending ? "A definir…" : "Definir como capitão do jogo"}
            </Button>
          )}
        </section>
      ) : (
        apuramento.tipo === "EMPATE" && (
          <section className="rounded-lg border border-ambar-500/40 bg-ambar-500/10 p-4">
            <p className="text-subtitulo text-cinza-900">
              Empate com {textoVotos(maxVotos)} — escolhe o capitão
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {apuramento.empatados.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={desempateId === id}
                    disabled={pending}
                    onClick={() => setDesempateId(id)}
                    className={`flex min-h-[96px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 p-3 text-center text-subtitulo text-cinza-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 ${
                      desempateId === id
                        ? "border-primary bg-primary/10"
                        : "border-cinza-200 bg-white hover:bg-cinza-50"
                    }`}
                  >
                    <AvatarAtleta nome={nomeDe(id)} fotoUrl={fotos[id]} tamanho="lg" />
                    {nomeDe(id)}
                  </button>
                </li>
              ))}
            </ul>
            <Button
              className="mt-4"
              disabled={pending || !desempateId}
              onClick={() =>
                desempateId &&
                executar(
                  () => escolherVencedorVotacaoCapitao(jogoId, { atletaId: desempateId }),
                  "Capitão escolhido",
                )
              }
            >
              <Check className="h-4 w-4" />
              {pending ? "A guardar…" : "Confirmar escolha"}
            </Button>
          </section>
        )
      )}

      <section className="rounded-lg border border-cinza-200 bg-white p-4 shadow-card">
        <p className="text-legenda font-medium uppercase tracking-wide text-cinza-500">
          Contagem de votos
        </p>
        <ul className="mt-3 space-y-3">
          {linhas.map((l) => (
            <li key={l.atletaId}>
              <div className="flex items-center justify-between gap-3 text-corpo text-cinza-900">
                <span>{l.nome}</span>
                <span className="font-semibold">{textoVotos(l.votos)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-cinza-100">
                <div
                  className={`h-full ${l.atletaId === vencedorAtletaId ? "bg-ambar-500" : "bg-primary/60"}`}
                  style={{ width: `${(l.votos / maxVotos) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-legenda text-cinza-500">
          {progresso.votaram} de {progresso.total} convocados votaram.
        </p>
      </section>

      <div>{botaoRepetir}</div>
    </div>
  );
}
