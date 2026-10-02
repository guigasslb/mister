// Assinaturas de ficheiro (magic bytes) aceites para imagens carregadas. Não
// confiamos na extensão nem no content-type declarado pelo cliente — validamos
// os bytes reais.
const ASSINATURAS_IMAGEM: ReadonlyArray<{ mime: string; bytes: number[] }> = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"
];

// "WEBP" (fourcc no offset 8): o prefixo RIFF é partilhado com WAV/AVI, por isso
// confirmamos o fourcc para não aceitar áudio/vídeo mascarado de imagem.
const FOURCC_WEBP = [0x57, 0x45, 0x42, 0x50];

/** Deteta o mime real da imagem pelos magic bytes, ou `null` se não for JPEG/PNG/WebP. */
export function detetarMimeImagem(buffer: Uint8Array): string | null {
  for (const { mime, bytes } of ASSINATURAS_IMAGEM) {
    if (bytes.every((b, i) => buffer[i] === b)) {
      if (mime === "image/webp" && !FOURCC_WEBP.every((b, i) => buffer[8 + i] === b)) {
        continue;
      }
      return mime;
    }
  }
  return null;
}
