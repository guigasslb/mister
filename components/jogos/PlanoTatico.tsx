"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { definirPlanoTatico } from "@/lib/actions/jogos";
import { maxTitulares } from "@/lib/modalidade-escalao";
import { construirDiagramaFormacao } from "@/lib/formacao";
import { LABEL_POSICAO, posicoesPorModalidade } from "@/lib/schemas/atleta";
import { QuadroTaticoJogo } from "@/components/jogos/QuadroTaticoJogo";
import type { DiagramaCampo } from "@/lib/schemas/exercicio";
import type { FormatoJogo, Modalidade, Posicao } from "@prisma/client";

type Convocado = {
  id: string;
  nome: string;
  numero: number | null;
  posicoes: Posicao[];
};

type LinhaPlano = { posicaoPrevista: Posicao | null; titularPrevisto: boolean };

export function PlanoTatico({
  jogoId,
  convocados,
  planoInicial,
  modalidade,
  formato,
  quadroInicial,
  podeGerirQuadro,
}: {
  jogoId: string;
  convocados: Convocado[];
  planoInicial: Record<string, LinhaPlano>;
  // 🔁 v7 (§11.5): modalidade → posições/linhas; formato → fundo de campo.
  modalidade: Modalidade;
  formato: FormatoJogo | null;
  // §8.10: quadro tático interativo do plano de jogo (persistido em
  // QuadroTatico.diagrama) + gating por MODELO_JOGO_GERIR.
  quadroInicial: { id: string; diagrama: DiagramaCampo | null } | null;
  podeGerirQuadro: boolean;
}) {
  const POSICOES = posicoesPorModalidade(modalidade);
  // Nº de jogadores em campo (futsal = 5) → limite de titulares previstos.
  const MAX_TITULARES = maxTitulares(formato, modalidade);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [plano, setPlano] = useState<Record<string, LinhaPlano>>(() => {
    const inicial: Record<string, LinhaPlano> = {};
    for (const c of convocados) {
      inicial[c.id] = planoInicial[c.id] ?? {
        posicaoPrevista: c.posicoes[0] ?? null,
        titularPrevisto: false,
      };
    }
    return inicial;
  });

  const linhaDe = (id: string): LinhaPlano =>
    plano[id] ?? { posicaoPrevista: null, titularPrevisto: false };

  const titulares = convocados.filter((c) => linhaDe(c.id).titularPrevisto);
  // Limite de titulares atingido → bloqueia marcar mais (feature futsal = 5).
  const noLimiteTitulares = titulares.length >= MAX_TITULARES;

  function definirPosicao(id: string, posicao: Posicao | null) {
    setPlano((prev) => ({ ...prev, [id]: { ...linhaDe(id), posicaoPrevista: posicao } }));
  }

  function definirTitular(id: string, titular: boolean) {
    // Futsal: no máximo 5 titulares em campo (deriva do formato do jogo). Impede
    // marcar mais titulares do que os lugares disponíveis.
    if (titular && !linhaDe(id).titularPrevisto) {
      if (titulares.length >= MAX_TITULARES) {
        toast.error(`Já tens ${MAX_TITULARES} titulares selecionados`);
        return;
      }
    }
    setPlano((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { posicaoPrevista: null, titularPrevisto: false }), titularPrevisto: titular },
    }));
  }

  function guardar() {
    const payload = convocados.map((c) => {
      const l = linhaDe(c.id);
      return {
        convocadoId: c.id,
        posicaoPrevista: l.posicaoPrevista,
        titularPrevisto: l.titularPrevisto,
      };
    });
    startTransition(async () => {
      const res = await definirPlanoTatico(jogoId, payload);
      if (res.sucesso) {
        toast.success("Plano tático guardado");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  if (convocados.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
        Define a convocatória primeiro para preparar o plano de dia de jogo.
      </p>
    );
  }

  // 🔁 v7 (§11.5): constrói o diagrama de campo com TODOS os titulares. Os que não
  // têm posição prevista são colocados em posições padrão distribuídas no campo
  // (nunca ficam de fora), para render no CampoDesenho (fundo = formato do jogo).
  const diagrama: DiagramaCampo = construirDiagramaFormacao(
    titulares.map((c) => ({
      id: c.id,
      numero: c.numero,
      posicao: linhaDe(c.id).posicaoPrevista,
    })),
    modalidade,
    formato,
  );

  return (
    <div className="space-y-5">
      {/* Quadro tático interativo: formação dos titulares + adversários +
          jogadas (setas). Persistido em QuadroTatico.diagrama — §8.10/§11.3. */}
      <div className="rounded-lg border border-cinza-200 bg-cinza-50 p-4">
        <p className="mb-3 text-legenda font-medium uppercase tracking-wide text-cinza-500">
          Quadro tático ({titulares.length}/{MAX_TITULARES} titular
          {titulares.length === 1 ? "" : "es"})
        </p>
        <div className="space-y-3">
          <QuadroTaticoJogo
            jogoId={jogoId}
            formato={formato}
            quadroInicial={quadroInicial}
            diagramaFormacao={diagrama}
            podeGerir={podeGerirQuadro}
          />
        </div>
      </div>

      {/* Editor por convocado */}
      <ul className="space-y-2">
        {convocados.map((c) => {
          const l = linhaDe(c.id);
          return (
            <li
              key={c.id}
              className="flex flex-col gap-2 rounded-md border border-cinza-200 bg-white p-3 shadow-card sm:flex-row sm:items-center"
            >
              <span className="flex-1 text-corpo text-cinza-900">
                {c.numero != null && <span className="mr-1 text-cinza-400">#{c.numero}</span>}
                {c.nome}
              </span>
              <div className="flex items-center gap-2">
                <Select
                  value={l.posicaoPrevista ?? "none"}
                  onValueChange={(v) =>
                    definirPosicao(c.id, v === "none" ? null : (v as Posicao))
                  }
                >
                  <SelectTrigger className="h-11 w-40">
                    <SelectValue placeholder="Posição" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— sem posição —</SelectItem>
                    {POSICOES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {LABEL_POSICAO[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div
                  role="group"
                  aria-label="Titular ou suplente"
                  className="flex overflow-hidden rounded-md border border-cinza-200"
                >
                  <button
                    type="button"
                    onClick={() => definirTitular(c.id, true)}
                    aria-pressed={l.titularPrevisto}
                    disabled={!l.titularPrevisto && noLimiteTitulares}
                    title={
                      !l.titularPrevisto && noLimiteTitulares
                        ? `Já tens ${MAX_TITULARES} titulares selecionados`
                        : undefined
                    }
                    className={`h-11 min-w-[68px] px-3 text-corpo-sec transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      l.titularPrevisto
                        ? "bg-primary text-primary-foreground"
                        : "bg-white text-cinza-600 hover:bg-cinza-50"
                    }`}
                  >
                    Titular
                  </button>
                  <button
                    type="button"
                    onClick={() => definirTitular(c.id, false)}
                    aria-pressed={!l.titularPrevisto}
                    className={`h-11 min-w-[68px] border-l border-cinza-200 px-3 text-corpo-sec transition-colors ${
                      !l.titularPrevisto
                        ? "bg-cinza-700 text-white"
                        : "bg-white text-cinza-600 hover:bg-cinza-50"
                    }`}
                  >
                    Suplente
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end">
        <Button onClick={guardar} disabled={pending}>
          <Check className="h-4 w-4" />
          {pending ? "A guardar…" : "Guardar plano"}
        </Button>
      </div>
    </div>
  );
}
