"use client";

import { useRouter, usePathname } from "next/navigation";
import type { Modalidade } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Seletor de secção transversal (§8.1.1 / §8.2). Só aparece quando o clube tem
// 2+ secções; com uma só secção a experiência é idêntica à v6 (nada é mostrado).
// A secção selecionada persiste num cookie de UI (memória de contexto — §8.1.1)
// e reflete-se no parâmetro `seccaoId` da rota, que as páginas de plantel/treinos/
// jogos já sabem filtrar (Fases 27/28). Nunca é fonte de autorização (§5.4).

const VALOR_TODAS = "__todas__";
const COOKIE_SECCAO = "seccaoAtiva";
const UM_ANO = 60 * 60 * 24 * 365;

const ROTULO_MODALIDADE: Record<Modalidade, string> = {
  FUTSAL: "Futsal",
  FUTEBOL: "Futebol",
};

export interface SeccaoOpcao {
  id: string;
  nome: string | null;
  modalidade: Modalidade;
}

interface Props {
  seccoes: SeccaoOpcao[];
  seccaoAtivaId: string | null;
}

export function SeletorSeccao({ seccoes, seccaoAtivaId }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  // Regra §8.1.1: com menos de 2 secções, o seletor não aparece.
  if (seccoes.length < 2) return null;

  const rotulo = (s: SeccaoOpcao) => s.nome ?? ROTULO_MODALIDADE[s.modalidade];

  function selecionar(valor: string) {
    const id = valor === VALOR_TODAS ? "" : valor;
    const seccao = seccoes.find((s) => s.id === id) ?? null;
    // Cookie de UI (não-auth): memória de contexto entre navegações.
    try {
      document.cookie = `${COOKIE_SECCAO}=${id}; path=/; max-age=${id ? UM_ANO : 0}; samesite=lax`;
    } catch {
      /* cookies indisponíveis — segue na mesma. */
    }
    // Reflete no URL para as páginas section-aware reagirem de imediato. Passa
    // `seccaoId` (plantel) e `modalidade` (jogos) — cada página usa o que entende.
    // Ao trocar de secção, o escalão em contexto deixa de ser válido, é omitido.
    let destino = pathname;
    if (id && seccao) {
      destino = `${pathname}?seccaoId=${id}&modalidade=${seccao.modalidade}`;
    }
    router.push(destino);
    router.refresh();
  }

  return (
    <Select value={seccaoAtivaId ?? VALOR_TODAS} onValueChange={selecionar}>
      <SelectTrigger
        className="h-9 w-auto gap-1 border-border bg-background text-corpo text-foreground focus:ring-primary"
        aria-label="Secção ativa"
      >
        <span className="mr-1 text-legenda text-cinza-400">Secção</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={VALOR_TODAS}>Todas as secções</SelectItem>
        {seccoes.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {rotulo(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
