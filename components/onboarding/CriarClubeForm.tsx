"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarClube } from "@/lib/actions/onboarding";
import { cn } from "@/lib/utils";

// Tiers comerciais escolhidos na criação do clube. O valor é enviado como `tier`
// a `criarClube()`, que cria uma Licenca pendente com este tier (§3.11 / §17.1).
// Valores alinhados com o enum TierClube (PEQUENO/MEDIO/GRANDE) + o produto
// Individual (licença de treinador, uma modalidade — §17.1).
type Tier = "INDIVIDUAL" | "PEQUENO" | "MEDIO" | "GRANDE";

// Preços conforme a bíblia (§17.1). Individual €4,99/mês·€49/ano; Clube por nº
// de escalões: Pequeno €15/€149, Médio €19/€190, Grande €34/€340.
const PLANOS: {
  tier: Tier;
  nome: string;
  limite: string;
  mensal: string;
  anual: string;
  descricao: string;
  popular?: boolean;
}[] = [
  {
    tier: "INDIVIDUAL",
    nome: "Individual",
    limite: "Uma modalidade",
    mensal: "€4,99",
    anual: "€49",
    descricao: "Uma modalidade. Para treinadores independentes.",
  },
  {
    tier: "PEQUENO",
    nome: "Clube Pequeno",
    limite: "até 2 escalões",
    mensal: "€15",
    anual: "€149",
    descricao: "Para clubes a começar, com um ou dois escalões.",
    popular: true,
  },
  {
    tier: "MEDIO",
    nome: "Clube Médio",
    limite: "até 4 escalões",
    mensal: "€19",
    anual: "€190",
    descricao: "Para clubes em crescimento, até quatro escalões.",
  },
  {
    tier: "GRANDE",
    nome: "Clube Grande",
    limite: "até 8 escalões",
    mensal: "€34",
    anual: "€340",
    descricao: "Para clubes estabelecidos, até oito escalões.",
  },
];

export function CriarClubeForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [passo, setPasso] = useState<0 | 1>(0);
  const [nome, setNome] = useState("");
  const [corPrimaria, setCorPrimaria] = useState("#1A2FD4");
  const [corSecundaria, setCorSecundaria] = useState("#FFD700");
  const [tier, setTier] = useState<Tier>("INDIVIDUAL");

  function irParaPlano() {
    if (nome.trim().length < 2) {
      setErro("Nome do clube obrigatório (mínimo 2 caracteres).");
      return;
    }
    setErro(null);
    setPasso(1);
  }

  function submeter() {
    setErro(null);
    startTransition(async () => {
      const res = await criarClube({
        nome: nome.trim(),
        corPrimaria,
        corSecundaria,
        tier,
      });
      if (res.sucesso) {
        toast.success("Clube criado");
        router.push("/onboarding");
        router.refresh();
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <div className="space-y-5">
      {erro && <p className="text-corpo-sec text-vermelho-600">{erro}</p>}

      {passo === 0 ? (
        // ─── Passo 1: Identidade ────────────────────────────────────────────
        <form
          onSubmit={(e) => {
            e.preventDefault();
            irParaPlano();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome do clube *</Label>
            <Input
              id="nome"
              name="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder="ex: Juventude Sport Clube"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Cor primária</Label>
              <input
                type="color"
                value={corPrimaria}
                onChange={(e) => setCorPrimaria(e.target.value)}
                className="h-9 w-full cursor-pointer rounded border border-cinza-200"
                aria-label="Cor primária"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cor secundária</Label>
              <input
                type="color"
                value={corSecundaria}
                onChange={(e) => setCorSecundaria(e.target.value)}
                className="h-9 w-full cursor-pointer rounded border border-cinza-200"
                aria-label="Cor secundária"
              />
            </div>
          </div>
          <Button type="submit" className="w-full">
            Continuar
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          </Button>
        </form>
      ) : (
        // ─── Passo 2: Escolha de plano ──────────────────────────────────────
        <div className="space-y-5">
          <div>
            <h2 className="text-[18px] font-bold text-cinza-900">Escolhe o teu plano</h2>
            <p className="mt-1 text-corpo-sec text-cinza-600">
              Ativas a subscrição por transferência bancária depois de criar o clube.
              Podes mudar de plano mais tarde.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="sr-only">Planos disponíveis</legend>
            {PLANOS.map((p) => {
              const ativo = tier === p.tier;
              return (
                <label
                  key={p.tier}
                  className={cn(
                    "relative flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                    ativo
                      ? "border-primary bg-primary/5"
                      : "border-cinza-200 hover:bg-cinza-50",
                  )}
                >
                  <input
                    type="radio"
                    name="tier"
                    value={p.tier}
                    checked={ativo}
                    onChange={() => setTier(p.tier)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      ativo
                        ? "border-primary bg-primary text-white"
                        : "border-cinza-300",
                    )}
                  >
                    {ativo && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-corpo font-semibold text-cinza-900">
                        {p.nome}
                        <span className="ml-1.5 text-corpo-sec font-normal text-cinza-500">
                          ({p.limite})
                        </span>
                      </span>
                      <span className="shrink-0 text-cinza-900">
                        <span className="text-subtitulo font-bold">{p.mensal}</span>
                        <span className="text-corpo-sec text-cinza-500">/mês</span>
                      </span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-corpo-sec text-cinza-600">{p.descricao}</span>
                      <span className="shrink-0 text-legenda text-cinza-500">
                        {p.anual}/ano
                      </span>
                    </span>
                  </span>
                  {p.popular && (
                    <span className="absolute -top-2 right-4 rounded-full bg-primary px-2 py-0.5 text-legenda font-semibold text-white">
                      Mais popular
                    </span>
                  )}
                </label>
              );
            })}
          </fieldset>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setErro(null);
                setPasso(0);
              }}
              disabled={pending}
            >
              <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
              Voltar
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={submeter}
              disabled={pending}
            >
              {pending ? "A criar…" : "Criar clube"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
