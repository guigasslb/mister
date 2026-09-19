"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowLeftRight, Goal, SlashSquare, Square } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ABREV_POSICAO } from "@/lib/schemas/atleta";
import type { AtletaAoVivo } from "@/components/jogos/ao-vivo/CampoAoVivo";

/**
 * Ações rápidas sobre um jogador em campo no Modo Jogo ao Vivo (Fase B). Abre por
 * toque no cartão do atleta e oferece, num só *bottom sheet*: **Golo** (com escolha
 * opcional de assistente entre os outros jogadores em campo), **Cartão** (amarelo/
 * vermelho) e **Substituir** (delega no fluxo de substituição existente). Todos os
 * alvos de toque têm ≥44px. O segundo/parte do evento são automáticos (definidos
 * pelo cronómetro no orquestrador), pelo que não há seleção manual aqui.
 */
export function ModalAcoesJogador({
  jogador,
  outrosEmCampo,
  onGolo,
  onCartao,
  onSubstituir,
  onFechar,
}: {
  /** Jogador tocado; null → modal fechado. */
  jogador: AtletaAoVivo | null;
  /** Restantes jogadores em campo (candidatos a assistente do golo). */
  outrosEmCampo: AtletaAoVivo[];
  onGolo: (atletaId: string, assistenteId: string | null) => void;
  onCartao: (atletaId: string, tipo: "CARTAO_AMARELO" | "CARTAO_VERMELHO") => void;
  onSubstituir: (atletaId: string) => void;
  onFechar: () => void;
}) {
  const aberto = jogador !== null;
  // "menu" = ações principais; "assistente" = escolher quem assistiu o golo.
  const [modo, setModo] = useState<"menu" | "assistente">("menu");

  // Sempre que abre (ou muda de jogador), volta ao menu principal.
  useEffect(() => {
    if (aberto) setModo("menu");
  }, [aberto, jogador?.id]);

  function registarGolo(assistenteId: string | null) {
    if (!jogador) return;
    onGolo(jogador.id, assistenteId);
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md">
        {jogador && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {modo === "assistente" && (
                  <button
                    type="button"
                    onClick={() => setModo("menu")}
                    aria-label="Voltar às ações"
                    className="-ml-1 flex h-8 w-8 items-center justify-center rounded-md text-cinza-500 hover:bg-cinza-100"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <span>
                  {jogador.numero != null && (
                    <span className="text-cinza-400">#{jogador.numero} </span>
                  )}
                  {jogador.nome}
                  {jogador.posicao && (
                    <span className="ml-1 text-legenda text-cinza-500">
                      ({ABREV_POSICAO[jogador.posicao]})
                    </span>
                  )}
                </span>
              </DialogTitle>
              <DialogDescription>
                {modo === "menu"
                  ? "Escolhe a ação a registar."
                  : "Quem deu a assistência? (opcional)"}
              </DialogDescription>
            </DialogHeader>

            {modo === "menu" ? (
              <div className="grid grid-cols-1 gap-2">
                <Button
                  onClick={() =>
                    outrosEmCampo.length > 0 ? setModo("assistente") : registarGolo(null)
                  }
                  className="min-h-[52px] justify-start text-corpo"
                >
                  <Goal className="h-5 w-5" />
                  Golo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onCartao(jogador.id, "CARTAO_AMARELO")}
                  className="min-h-[52px] justify-start border-ambar-500/40 text-corpo text-cinza-900 hover:bg-ambar-500/10"
                >
                  <Square className="h-5 w-5 fill-ambar-500 text-ambar-500" aria-hidden />
                  Cartão amarelo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onCartao(jogador.id, "CARTAO_VERMELHO")}
                  className="min-h-[52px] justify-start border-vermelho-600/40 text-corpo text-cinza-900 hover:bg-vermelho-600/10"
                >
                  <Square className="h-5 w-5 fill-vermelho-600 text-vermelho-600" aria-hidden />
                  Cartão vermelho
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onSubstituir(jogador.id)}
                  className="min-h-[52px] justify-start text-corpo"
                >
                  <ArrowLeftRight className="h-5 w-5" />
                  Substituir
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => registarGolo(null)}
                  className="flex min-h-[48px] w-full items-center gap-2 rounded-lg border border-dashed border-cinza-300 p-2.5 text-left text-corpo-sec font-medium text-cinza-600 transition hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <SlashSquare className="h-4 w-4 text-cinza-400" aria-hidden />
                  Sem assistência
                </button>
                <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto pr-1">
                  {outrosEmCampo.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => registarGolo(a.id)}
                        className="flex min-h-[52px] w-full items-center gap-3 rounded-lg border border-cinza-200 bg-white p-2.5 text-left transition hover:border-primary hover:bg-primary/5 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-cinza-100 text-corpo-sec font-bold text-cinza-700 tabular-nums">
                          {a.numero ?? "–"}
                        </span>
                        <span className="flex-1 truncate text-corpo font-medium text-cinza-900">
                          {a.nome}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={onFechar}>
                Cancelar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
