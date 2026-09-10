"use client";

import { useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { uploadFotoAtleta } from "@/lib/actions/atletas";
import { iniciaisNome } from "@/components/plantel/AvatarAtleta";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const TIPOS_ACEITES = ["image/jpeg", "image/png", "image/webp"];
// Limite de entrada (antes da compressão no browser). O servidor faz o re-encode
// final para 256×256 WebP; aqui só evitamos processar ficheiros absurdamente
// grandes.
const TAMANHO_MAX_MB = 8;

const ERRO_ID = "foto-atleta-erro";

/**
 * Picker de fotografia do atleta com pré-visualização e compressão no browser.
 *
 * O upload acontece imediatamente ao selecionar o ficheiro (não espera pelo
 * submit do formulário): comprime → envia para `uploadFotoAtleta` (Server Action)
 * → recebe o `fotoUrl` já persistido na BD. O campo `fotoUrl` do formulário é
 * mantido num input escondido, para que o save do formulário preserve a foto
 * (ou a remova, quando o utilizador carrega em «Remover foto»).
 */
export function FotoUpload({
  atletaId,
  fotoUrlInicial,
  nome,
}: {
  atletaId: string;
  fotoUrlInicial: string | null;
  nome: string;
}) {
  const [fotoUrl, setFotoUrl] = useState<string | null>(fotoUrlInicial);
  const [preview, setPreview] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function limparPreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreview(null);
  }

  async function aoSelecionar(e: React.ChangeEvent<HTMLInputElement>) {
    const ficheiro = e.target.files?.[0];
    // Permite reselecionar o mesmo ficheiro depois de um erro.
    e.target.value = "";
    if (!ficheiro) return;

    setErro(null);

    if (!TIPOS_ACEITES.includes(ficheiro.type)) {
      setErro("Formato inválido. Usa uma imagem JPEG, PNG ou WebP.");
      return;
    }
    if (ficheiro.size > TAMANHO_MAX_MB * 1024 * 1024) {
      setErro(`A imagem é demasiado grande (máximo ${TAMANHO_MAX_MB} MB).`);
      return;
    }

    setACarregar(true);
    try {
      const comprimido = await imageCompression(ficheiro, {
        maxWidthOrHeight: 512,
        maxSizeMB: 2,
        useWebWorker: true,
      });

      limparPreview();
      const urlPreview = URL.createObjectURL(comprimido);
      objectUrlRef.current = urlPreview;
      setPreview(urlPreview);

      const fd = new FormData();
      fd.append("foto", comprimido, ficheiro.name);

      const res = await uploadFotoAtleta(atletaId, fd);
      if (res.sucesso) {
        setFotoUrl(res.dados.fotoUrl);
        limparPreview();
      } else {
        setErro(res.erro || "Não foi possível carregar a foto. Tenta de novo.");
        limparPreview();
      }
    } catch {
      setErro("Não foi possível processar a imagem. Tenta outra.");
      limparPreview();
    } finally {
      setACarregar(false);
    }
  }

  function removerFoto() {
    limparPreview();
    setFotoUrl(null);
    setErro(null);
  }

  const imagem = preview ?? fotoUrl;
  const temImagem = imagem !== null;

  return (
    <div className="space-y-2">
      <Label htmlFor="foto-atleta">Fotografia</Label>

      <input
        ref={inputRef}
        id="foto-atleta"
        type="file"
        accept={TIPOS_ACEITES.join(",")}
        onChange={aoSelecionar}
        disabled={aCarregar}
        className="sr-only"
        aria-describedby={erro ? ERRO_ID : undefined}
      />

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={aCarregar}
          aria-label={
            temImagem
              ? "Alterar fotografia do atleta"
              : "Adicionar fotografia do atleta"
          }
          className="group relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full border border-cinza-200 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
        >
          {temImagem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagem}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-primary text-2xl font-semibold text-white select-none">
              {iniciaisNome(nome)}
            </span>
          )}

          {!aCarregar && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera className="h-6 w-6 text-white" aria-hidden />
            </span>
          )}

          {aCarregar && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-6 w-6 animate-spin text-white" aria-hidden />
            </span>
          )}
        </button>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={aCarregar}
            >
              {temImagem ? "Alterar foto" : "Adicionar foto"}
            </Button>
            {temImagem && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={removerFoto}
                disabled={aCarregar}
                className="text-vermelho-600 hover:bg-vermelho-600/5"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Remover foto
              </Button>
            )}
          </div>
          <p className="text-legenda text-cinza-400">
            JPEG, PNG ou WebP. A imagem é comprimida automaticamente antes do envio.
          </p>
        </div>
      </div>

      <input type="hidden" name="fotoUrl" value={fotoUrl ?? ""} />

      {erro && (
        <p id={ERRO_ID} role="alert" className="text-legenda text-vermelho-600">
          {erro}
        </p>
      )}
    </div>
  );
}
