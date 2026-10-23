import type { CasaFora } from "@prisma/client";
import { cn } from "@/lib/utils";
import { nomeClubeSeguro } from "@/lib/jogo-confronto";

/**
 * Título de um jogo ("Nós vs Adversário") com o nome do clube do utilizador
 * SEMPRE a negrito e (por defeito) com a cor do clube (`--cor-primaria`). A ordem
 * casa–fora respeita `casaFora`. Componente sem estado — usável em Server e Client
 * Components. Ver `lib/jogo-confronto.ts` para a variante em string pura.
 *
 * `aplicarCor`: quando o fundo já usa a cor do clube (ex.: cartão-herói, overlay
 * escuro do Modo Jogo ao Vivo), passar `false` para manter apenas o negrito e
 * herdar a cor do texto — evita perda de contraste.
 *
 * `corClube`: valor CSS da cor do nome do clube (por defeito `--cor-primaria`).
 * O calendário público (§8.11.1) passa a variante com contraste AA garantido
 * (`var(--cal-acento-texto)`); os restantes ecrãs não a usam.
 */
export function TituloConfronto({
  clubeNome,
  adversario,
  casaFora,
  aplicarCor = true,
  corClube = "var(--cor-primaria, #F0531E)",
  className,
}: {
  clubeNome: string | null | undefined;
  adversario: string;
  casaFora: CasaFora;
  aplicarCor?: boolean;
  corClube?: string;
  className?: string;
}) {
  const nome = nomeClubeSeguro(clubeNome);
  const casaEhNossa = casaFora === "CASA";

  const nomeNossaEquipa = (
    <span
      className="font-bold"
      style={aplicarCor ? { color: corClube } : undefined}
    >
      {nome}
    </span>
  );
  const nomeAdversario = <span>{adversario}</span>;

  return (
    <span className={cn(className)}>
      {casaEhNossa ? nomeNossaEquipa : nomeAdversario} vs{" "}
      {casaEhNossa ? nomeAdversario : nomeNossaEquipa}
    </span>
  );
}
