"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { confirmarResetPassword } from "@/lib/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ReporPasswordForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [sucesso, setSucesso] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErros({});

    const fd = new FormData(e.currentTarget);
    const novaPassword = String(fd.get("novaPassword") ?? "");
    const confirmar = String(fd.get("confirmar") ?? "");

    // Validação client-side (a action revalida no servidor).
    const errosLocais: Record<string, string> = {};
    if (novaPassword.length < 8) {
      errosLocais.novaPassword = "A password deve ter pelo menos 8 caracteres";
    }
    if (novaPassword !== confirmar) {
      errosLocais.confirmar = "As passwords não coincidem";
    }
    if (Object.keys(errosLocais).length > 0) {
      setErros(errosLocais);
      return;
    }

    startTransition(async () => {
      const res = await confirmarResetPassword(token, novaPassword);
      if (res.sucesso) {
        setSucesso(true);
      } else {
        if (res.camposInvalidos) setErros(res.camposInvalidos);
        toast.error(res.erro);
      }
    });
  }

  if (sucesso) {
    return (
      <div className="space-y-4 text-center">
        <p
          role="status"
          className="rounded-md border border-cinza-200 bg-primary/5 p-3 text-corpo text-cinza-700"
        >
          Password alterada com sucesso. Podes fazer login agora.
        </p>
        <Link
          href="/login"
          className="inline-block font-medium text-laranja-600 underline"
        >
          Ir para o início de sessão
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="novaPassword">Nova password</Label>
        <Input
          id="novaPassword"
          name="novaPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={!!erros.novaPassword}
        />
        {erros.novaPassword && (
          <p className="text-legenda text-vermelho-600">{erros.novaPassword}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmar">Confirmar password</Label>
        <Input
          id="confirmar"
          name="confirmar"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={!!erros.confirmar}
        />
        {erros.confirmar && (
          <p className="text-legenda text-vermelho-600">{erros.confirmar}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "A guardar…" : "Alterar password"}
      </Button>
    </form>
  );
}
