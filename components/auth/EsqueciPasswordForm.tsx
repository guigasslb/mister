"use client";

import { useState, useTransition } from "react";
import { pedirResetPassword } from "@/lib/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EsqueciPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [enviado, setEnviado] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");

    startTransition(async () => {
      // Chamamos a action mas ignoramos o resultado de propósito: a mensagem
      // é sempre genérica para não revelar se o email existe (secção 5.1).
      await pedirResetPassword(email);
      setEnviado(true);
    });
  }

  if (enviado) {
    return (
      <p
        role="status"
        className="rounded-md border border-cinza-200 bg-primary/5 p-3 text-center text-corpo text-cinza-700"
      >
        Se o email existir na nossa base de dados, receberás um link de
        recuperação em breve.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="treinador@clube.pt"
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "A enviar…" : "Enviar link de recuperação"}
      </Button>
    </form>
  );
}
