"use client";

// Impacto em /jogos de editar/apagar um confronto (§23.6 regra R3 + D1).
// Componente de módulo partilhado por EditarConfrontoDialog e ApagarConfrontoDialog.

import { cn } from "@/lib/utils";
import { formatarDataCurta } from "@/lib/comunicacao-utils";
import {
  jogosQueSobram,
  listarMotivos,
  pedeDecisaoConvocatoria,
  pedeDecisaoDados,
  rotuloJogo,
  type DecisaoConvocatoria,
  type DecisaoJogosComDados,
} from "@/lib/confronto-dialogos-ui";
import type { ImpactoRemocaoJogos } from "@/lib/remocao-jogos-competicao";

type Opcao<T extends string> = { valor: T; titulo: string; legenda?: string };

function GrupoOpcoes<T extends string>({
  rotulo,
  opcoes,
  valor,
  onChange,
  disabled,
}: {
  rotulo: string;
  opcoes: Opcao<T>[];
  valor: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="grid grid-cols-1 gap-2">
      {opcoes.map((o) => {
        const ativo = valor === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            disabled={disabled}
            onClick={() => onChange(o.valor)}
            className={cn(
              "flex min-h-[44px] flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50",
              ativo ? "border-primary bg-primary/5" : "border-cinza-200 hover:bg-cinza-50",
            )}
          >
            <span className="text-corpo-sec font-medium text-cinza-900">{o.titulo}</span>
            {o.legenda && <span className="text-legenda text-cinza-500">{o.legenda}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ImpactoJogosConfronto({
  impacto,
  competicaoNome,
  convocatoria,
  onConvocatoria,
  dados,
  onDados,
  disabled,
}: {
  impacto: ImpactoRemocaoJogos;
  competicaoNome: string;
  convocatoria: DecisaoConvocatoria | null;
  onConvocatoria: (v: DecisaoConvocatoria) => void;
  dados: DecisaoJogosComDados | null;
  onDados: (v: DecisaoJogosComDados) => void;
  disabled?: boolean;
}) {
  const sobram = jogosQueSobram(impacto, convocatoria);
  return (
    <div className="space-y-3">
      {impacto.vazios.length > 0 && (
        <ul className="space-y-1">
          {impacto.vazios.map((j) => (
            <li key={j.id} className="text-corpo-sec text-cinza-700">
              O jogo {rotuloJogo(j)} ({formatarDataCurta(j.data)}) é apagado — ainda não tem
              convocatória nem dados.
            </li>
          ))}
        </ul>
      )}

      {pedeDecisaoConvocatoria(impacto) && (
        <div className="space-y-2">
          <ul className="space-y-1">
            {impacto.comConvocatoria.map((j) => (
              <li key={j.id} className="text-corpo-sec text-cinza-700">
                O jogo {rotuloJogo(j)} ({formatarDataCurta(j.data)}) já tem convocatória.
              </li>
            ))}
          </ul>
          <GrupoOpcoes<DecisaoConvocatoria>
            rotulo="Jogos com convocatória"
            valor={convocatoria}
            onChange={onConvocatoria}
            disabled={disabled}
            opcoes={[
              { valor: "APAGAR", titulo: "Apagar o jogo e a convocatória" },
              {
                valor: "MANTER",
                titulo: "Manter o jogo em /jogos, sem ligação a este confronto",
              },
            ]}
          />
        </div>
      )}

      {impacto.comDados.length > 0 && (
        <ul className="space-y-1">
          {impacto.comDados.map((j) => (
            <li key={j.id} className="text-corpo-sec text-cinza-700">
              O jogo {rotuloJogo(j)} ({formatarDataCurta(j.data)}) tem {listarMotivos(j.motivos)} —
              não é apagado e deixa de estar ligado a este confronto.
            </li>
          ))}
        </ul>
      )}

      {pedeDecisaoDados(impacto, convocatoria) && (
        <div className="space-y-2">
          <p className="text-corpo-sec font-medium text-cinza-900">
            O que fazemos com {sobram === 1 ? "o jogo que fica" : `os ${sobram} jogos que ficam`} em
            /jogos?
          </p>
          <GrupoOpcoes<DecisaoJogosComDados>
            rotulo="Jogos que ficam em /jogos"
            valor={dados}
            onChange={onDados}
            disabled={disabled}
            opcoes={[
              {
                valor: "MANTER",
                titulo: "Manter na competição",
                legenda: `Continua associado a «${competicaoNome}»; se tiver resultado, conta para a classificação.`,
              },
              {
                valor: "DESASSOCIAR",
                titulo: "Retirar da competição",
                legenda: "Fica solto em /jogos, sem competição.",
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
