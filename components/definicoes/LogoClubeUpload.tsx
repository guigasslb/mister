"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { uploadLogoClube } from "@/lib/actions/clubes";
import { TIPOS_LOGO_CLUBE, uploadLogoClubeSchema } from "@/lib/schemas/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERRO_ID = "logo-clube-erro";

/**
 * Logótipo do clube (§8.3): upload de ficheiro (PNG/JPEG/WebP até 2 MB) OU URL
 * de uma imagem, com pré-visualização. O upload é aplicado de imediato
 * (`uploadLogoClube` persiste o novo `logoUrl`); o URL resultante passa a ser o
 * valor do campo `logoUrl`, guardado pelo formulário que o envolve.
 */
export function LogoClubeUpload({
  valor,
  onAlterar,
  nomeClube,
  disabled = false,
}: {
  valor: string;
  onAlterar: (logoUrl: string) => void;
  nomeClube: string;
  disabled?: boolean;
}) {
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [imagemFalhou, setImagemFalhou] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function alterar(url: string) {
    setImagemFalhou(false);
    onAlterar(url);
  }

  async function aoSelecionar(e: React.ChangeEvent<HTMLInputElement>) {
    const ficheiro = e.target.files?.[0];
    // Permite reselecionar o mesmo ficheiro depois de um erro.
    e.target.value = "";
    if (!ficheiro) return;

    setErro(null);
    const validacao = uploadLogoClubeSchema.safeParse({ logo: ficheiro });
    if (!validacao.success) {
      setErro(validacao.error.issues[0]?.message ?? "Ficheiro inválido.");
      return;
    }

    setACarregar(true);
    try {
      const fd = new FormData();
      fd.append("logo", ficheiro);
      const res = await uploadLogoClube(fd);
      if (res.sucesso) {
        alterar(res.dados.logoUrl);
      } else {
        setErro(res.camposInvalidos?.logo ?? res.erro);
      }
    } catch {
      setErro("Não foi possível carregar o logótipo. Tenta de novo.");
    } finally {
      setACarregar(false);
    }
  }

  const url = valor.trim();
  const mostrarImagem = /^https?:\/\//i.test(url) && !imagemFalhou;
  const bloqueado = disabled || aCarregar;

  return (
    <div className="space-y-2">
      <Label htmlFor="logoUrl">Logótipo</Label>

      <input
        ref={inputRef}
        id="logo-clube-ficheiro"
        type="file"
        accept={TIPOS_LOGO_CLUBE.join(",")}
        onChange={aoSelecionar}
        disabled={bloqueado}
        className="sr-only"
        aria-label="Ficheiro do logótipo do clube"
        aria-describedby={erro ? ERRO_ID : undefined}
      />

      <div className="flex items-center gap-4">
        <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-cinza-200 bg-white">
          {mostrarImagem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="Pré-visualização do logótipo"
              className="h-full w-full object-contain"
              onError={() => setImagemFalhou(true)}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-primary text-xl font-semibold text-white select-none">
              {nomeClube.trim().charAt(0).toUpperCase() || "?"}
            </span>
          )}
          {aCarregar && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-6 w-6 animate-spin text-white" aria-hidden />
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={bloqueado}
          >
            <ImageUp aria-hidden />
            {aCarregar ? "A carregar…" : url ? "Substituir ficheiro" : "Carregar ficheiro"}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setErro(null);
                alterar("");
              }}
              disabled={bloqueado}
              className="text-vermelho-600 hover:bg-vermelho-600/5"
            >
              <Trash2 aria-hidden />
              Remover logótipo
            </Button>
          )}
        </div>
      </div>

      <Input
        id="logoUrl"
        name="logoUrl"
        value={valor}
        onChange={(e) => alterar(e.target.value)}
        placeholder="https://…"
        disabled={bloqueado}
      />
      <p className="text-legenda text-cinza-400">
        PNG, JPEG ou WebP até 2 MB. Em alternativa, indica o URL de uma imagem.
      </p>

      {erro && (
        <p id={ERRO_ID} role="alert" className="text-legenda text-vermelho-600">
          {erro}
        </p>
      )}
    </div>
  );
}
