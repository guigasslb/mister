"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { registar } from "@/lib/actions/onboarding";
import { registarSchema } from "@/lib/schemas/onboarding";
import { PRECO_BASE_CENTIMOS, PRECO_INDIVIDUAL_CENTIMOS } from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Tier = "INDIVIDUAL" | "PEQUENO" | "MEDIO" | "GRANDE";
type Modalidade = "FUTSAL" | "FUTEBOL";

// Metadados de apresentação dos planos (rótulos/descrições). Os PREÇOS não vivem
// aqui — leem-se de `lib/billing.ts` (fonte única, §17.1) para não divergirem do
// cálculo do paywall.
const PLANOS: {
  tier: Tier;
  nome: string;
  limite: string;
  descricao: string;
  popular?: boolean;
}[] = [
  {
    tier: "INDIVIDUAL",
    nome: "Individual",
    limite: "uma modalidade",
    descricao: "Para treinadores independentes.",
  },
  {
    tier: "PEQUENO",
    nome: "Clube Pequeno",
    limite: "até 2 escalões",
    descricao: "Para clubes a começar.",
    popular: true,
  },
  {
    tier: "MEDIO",
    nome: "Clube Médio",
    limite: "até 4 escalões",
    descricao: "Para clubes em crescimento.",
  },
  {
    tier: "GRANDE",
    nome: "Clube Grande",
    limite: "até 8 escalões",
    descricao: "Para clubes estabelecidos.",
  },
];

const MODALIDADES: { valor: Modalidade; nome: string }[] = [
  { valor: "FUTSAL", nome: "Futsal" },
  { valor: "FUTEBOL", nome: "Futebol" },
];

const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

/** Preços do tier, em cêntimos, lidos de `lib/billing.ts` (§17.1). */
function precosDoTier(tier: Tier): { mensal: number; anual: number } {
  if (tier === "INDIVIDUAL") {
    return { mensal: PRECO_INDIVIDUAL_CENTIMOS.MENSAL, anual: PRECO_INDIVIDUAL_CENTIMOS.ANUAL };
  }
  return { mensal: PRECO_BASE_CENTIMOS[tier].MENSAL, anual: PRECO_BASE_CENTIMOS[tier].ANUAL };
}

export function RegistarForm() {
  const [pending, startTransition] = useTransition();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [tier, setTier] = useState<Tier>("INDIVIDUAL");
  const [modalidade, setModalidade] = useState<Modalidade | "">("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErros({});
    const fd = new FormData(e.currentTarget);
    const dados = {
      nome: fd.get("nome"),
      email: fd.get("email"),
      password: fd.get("password"),
      nomeClube: fd.get("nomeClube"),
      tier,
      modalidade,
    };

    // Validação com o schema partilhado (fonte única). Dá feedback imediato dos
    // campos obrigatórios (incl. modalidade sem default) antes de ir ao servidor.
    const parsed = registarSchema.safeParse(dados);
    if (!parsed.success) {
      setErros(
        Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
      );
      return;
    }

    const { email, password } = parsed.data;
    startTransition(async () => {
      const res = await registar(parsed.data);
      if (res.sucesso) {
        toast.success("Conta criada. A entrar…");
        await signIn("credentials", { email, password, callbackUrl: "/sem-licenca" });
      } else {
        if (res.camposInvalidos) setErros(res.camposInvalidos);
        toast.error(res.erro);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" required minLength={2} placeholder="O teu nome" />
        {erros.nome && <p className="text-legenda text-vermelho-600">{erros.nome}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required placeholder="treinador@clube.pt" />
        {erros.email && <p className="text-legenda text-vermelho-600">{erros.email}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required minLength={8} placeholder="••••••••" />
        {erros.password && <p className="text-legenda text-vermelho-600">{erros.password}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nomeClube">Nome do clube</Label>
        <Input id="nomeClube" name="nomeClube" required minLength={2} maxLength={100} placeholder="ex: Juventude Sport Clube" />
        {erros.nomeClube && <p className="text-legenda text-vermelho-600">{erros.nomeClube}</p>}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-corpo-sec font-medium text-cinza-900">Modalidade</legend>
        <div className="grid grid-cols-2 gap-2">
          {MODALIDADES.map((m) => {
            const ativo = modalidade === m.valor;
            return (
              <label
                key={m.valor}
                className={cn(
                  "flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border px-4 text-corpo font-medium transition-colors",
                  ativo
                    ? "border-primary bg-primary/5 text-cinza-900"
                    : "border-cinza-200 text-cinza-700 hover:bg-cinza-50",
                )}
              >
                <input
                  type="radio"
                  name="modalidade"
                  value={m.valor}
                  checked={ativo}
                  onChange={() => setModalidade(m.valor)}
                  className="sr-only"
                />
                {m.nome}
              </label>
            );
          })}
        </div>
        {erros.modalidade && <p className="text-legenda text-vermelho-600">{erros.modalidade}</p>}
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="text-corpo-sec font-medium text-cinza-900">Plano</legend>
        <div className="space-y-2">
          {PLANOS.map((p) => {
            const ativo = tier === p.tier;
            const { mensal, anual } = precosDoTier(p.tier);
            return (
              <label
                key={p.tier}
                className={cn(
                  "relative flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                  ativo ? "border-primary bg-primary/5" : "border-cinza-200 hover:bg-cinza-50",
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
                    ativo ? "border-primary bg-primary text-white" : "border-cinza-300",
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
                      <span className="text-subtitulo font-bold">{eur.format(mensal / 100)}</span>
                      <span className="text-corpo-sec text-cinza-500">/mês</span>
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-corpo-sec text-cinza-600">{p.descricao}</span>
                    <span className="shrink-0 text-legenda text-cinza-500">
                      {eur.format(anual / 100)}/ano
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
        </div>
        {erros.tier && <p className="text-legenda text-vermelho-600">{erros.tier}</p>}
      </fieldset>

      <p className="text-legenda text-cinza-500">
        Ativas a subscrição por transferência bancária depois de criar a conta.
      </p>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "A criar…" : "Criar conta"}
      </Button>
    </form>
  );
}
