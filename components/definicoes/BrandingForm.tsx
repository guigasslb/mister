"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { atualizarBrandingClube } from "@/lib/actions/clubes";
import type { Clube } from "@prisma/client";

export function BrandingForm({
  clube,
  podeEditar = false,
}: {
  clube: Clube;
  podeEditar?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [corPrimaria, setCorPrimaria] = useState(clube.corPrimaria);
  const [corSecundaria, setCorSecundaria] = useState(clube.corSecundaria);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErros({});
    setErroGeral(null);
    const dados = {
      nome: String(fd.get("nome")),
      corPrimaria,
      corSecundaria,
      logoUrl: String(fd.get("logoUrl") ?? "").trim(),
      morada: String(fd.get("morada") ?? "").trim() || undefined,
      email: String(fd.get("email") ?? "").trim(),
      telefone: String(fd.get("telefone") ?? "").trim() || undefined,
    };
    startTransition(async () => {
      const res = await atualizarBrandingClube(dados);
      if (res.sucesso) {
        toast.success("Clube atualizado");
        router.refresh();
      } else {
        setErroGeral(res.erro);
        if (res.camposInvalidos) setErros(res.camposInvalidos);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      {erroGeral && !Object.keys(erros).length && (
        <p className="text-corpo-sec text-vermelho-600">{erroGeral}</p>
      )}

      {/* Modo leitura (§6.7): sem CLUBE_BRANDING, os campos ficam desativados e
          o botão de guardar não aparece. `fieldset[disabled]` desativa todos os
          controlos descendentes nativamente. */}
      <fieldset disabled={!podeEditar} className="space-y-5 disabled:opacity-70">
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome do clube *</Label>
        <Input id="nome" name="nome" defaultValue={clube.nome} required minLength={2} maxLength={100} />
        {erros.nome && <p className="text-legenda text-vermelho-600">{erros.nome}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="corPrimaria">Cor primária</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={corPrimaria}
              onChange={(e) => setCorPrimaria(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-cinza-200"
              aria-label="Cor primária"
            />
            <Input value={corPrimaria} onChange={(e) => setCorPrimaria(e.target.value)} className="font-mono" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="corSecundaria">Cor secundária</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={corSecundaria}
              onChange={(e) => setCorSecundaria(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-cinza-200"
              aria-label="Cor secundária"
            />
            <Input value={corSecundaria} onChange={(e) => setCorSecundaria(e.target.value)} className="font-mono" />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="logoUrl">Logótipo (URL)</Label>
        <Input id="logoUrl" name="logoUrl" defaultValue={clube.logoUrl ?? ""} placeholder="https://…" />
        <p className="text-legenda text-cinza-400">
          Por agora, indica o URL de uma imagem. O upload de ficheiro chega em breve.
        </p>
        {erros.logoUrl && <p className="text-legenda text-vermelho-600">{erros.logoUrl}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email do clube</Label>
          <Input id="email" name="email" type="email" defaultValue={clube.email ?? ""} />
          {erros.email && <p className="text-legenda text-vermelho-600">{erros.email}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" name="telefone" defaultValue={clube.telefone ?? ""} maxLength={30} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="morada">Morada</Label>
        <Input id="morada" name="morada" defaultValue={clube.morada ?? ""} maxLength={200} />
      </div>

      {/* Pré-visualização */}
      <div className="rounded-md border border-cinza-200 p-4">
        <p className="mb-2 text-legenda uppercase tracking-wide text-cinza-500">Pré-visualização</p>
        <div className="flex items-center gap-2">
          <span className="rounded px-3 py-1.5 text-white text-corpo-sec" style={{ backgroundColor: corPrimaria }}>
            Cor primária
          </span>
          <span className="rounded px-3 py-1.5 text-cinza-900 text-corpo-sec" style={{ backgroundColor: corSecundaria }}>
            Cor secundária
          </span>
        </div>
      </div>

      </fieldset>

      {podeEditar && (
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? "A guardar…" : "Guardar alterações"}
          </Button>
        </div>
      )}
    </form>
  );
}
