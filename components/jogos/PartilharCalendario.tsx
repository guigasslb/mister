"use client";

// Partilha do calendário de jogos do escalão por link público só-de-leitura
// (bíblia §8.11.1). Gerar / copiar / gerar novo (invalida o anterior) / revogar.
// A autorização (`JOGOS_GERIR` no escalão) é verificada no servidor pelas actions.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Link2Off, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  gerarLinkCalendarioPublico,
  revogarLinkCalendarioPublico,
} from "@/lib/actions/calendario-publico";
import { caminhoCalendarioPublico } from "@/lib/schemas/calendario-publico";
import { copiarTexto } from "@/lib/clipboard";

export function PartilharCalendario({
  escalaoId,
  escalaoNome,
  tokenInicial,
}: {
  escalaoId: string;
  escalaoNome: string;
  tokenInicial: string | null;
}) {
  const router = useRouter();
  const [token, setToken] = useState(tokenInicial);
  const [copiado, setCopiado] = useState(false);
  const [pending, startTransition] = useTransition();

  const url =
    token && typeof window !== "undefined"
      ? `${window.location.origin}${caminhoCalendarioPublico(token)}`
      : "";

  async function copiarUrl(alvo: string) {
    const feito = await copiarTexto(alvo);
    if (feito) {
      setCopiado(true);
      toast.success("Link copiado");
      window.setTimeout(() => setCopiado(false), 2000);
    } else {
      toast.error("Não foi possível copiar. Copia o link manualmente.");
    }
  }

  function gerar(novo: boolean) {
    startTransition(async () => {
      const res = await gerarLinkCalendarioPublico({ escalaoId });
      if (!res.sucesso) {
        toast.error(res.erro);
        return;
      }
      setToken(res.dados.token);
      toast.success(novo ? "Novo link gerado. O anterior deixou de funcionar." : "Link gerado");
      await copiarUrl(`${window.location.origin}${caminhoCalendarioPublico(res.dados.token)}`);
      router.refresh();
    });
  }

  function revogar() {
    startTransition(async () => {
      const res = await revogarLinkCalendarioPublico({ escalaoId });
      if (!res.sucesso) {
        toast.error(res.erro);
        return;
      }
      setToken(null);
      toast.success("Link revogado");
      router.refresh();
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share2 className="h-4 w-4" />
          Partilhar calendário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Partilhar calendário — {escalaoNome}</DialogTitle>
          <DialogDescription>
            Quem tiver o link vê apenas os jogos desta equipa na época ativa (data,
            hora, adversário, casa/fora, local, competição e resultado), sem precisar
            de conta e sem acesso a mais nada.
          </DialogDescription>
        </DialogHeader>

        {token ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                readOnly
                value={url}
                aria-label="Link público do calendário"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button onClick={() => startTransition(() => copiarUrl(url))} disabled={pending}>
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiado ? "Copiado" : "Copiar link"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => gerar(true)} disabled={pending}>
                <RefreshCw className="h-4 w-4" />
                Gerar novo link
              </Button>
              <Button
                variant="ghost"
                onClick={revogar}
                disabled={pending}
                className="text-vermelho-600 hover:bg-vermelho-600/5"
              >
                <Link2Off className="h-4 w-4" />
                Revogar link
              </Button>
            </div>
            <p className="text-legenda text-cinza-500">
              Gerar um novo link ou revogar faz o link atual deixar de funcionar.
            </p>
          </div>
        ) : (
          <Button onClick={() => gerar(false)} disabled={pending} className="w-fit">
            <Share2 className="h-4 w-4" />
            Gerar e copiar link
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
