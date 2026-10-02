"use server";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirCapacidade } from "@/lib/permissoes";
import { ok, erro, erroDeValidacao, type Resultado } from "@/lib/utils";
import { brandingSchema, uploadLogoClubeSchema } from "@/lib/schemas/onboarding";
import { detetarMimeImagem } from "@/lib/imagem";
import {
  BUCKET_CLUBES,
  obterSupabaseStorage,
  extrairPathDoStorage,
} from "@/lib/supabase-storage";
import type { Clube } from "@prisma/client";

/**
 * Apaga um logótipo do bucket `clubes` se o URL apontar para o NOSSO Supabase
 * Storage (URLs externos colados pelo utilizador são ignorados). Best-effort:
 * nunca lança — regista o erro e segue.
 */
async function apagarLogoDoStorage(logoUrl: string | null): Promise<void> {
  if (!logoUrl) return;
  const path = extrairPathDoStorage(logoUrl, BUCKET_CLUBES);
  if (!path) return;

  const storage = obterSupabaseStorage();
  if (!storage) return;

  try {
    const { error } = await storage.storage.from(BUCKET_CLUBES).remove([path]);
    if (error) {
      console.error("Falha ao apagar logótipo do Storage:", error.message);
    }
  } catch (e) {
    console.error("Erro ao apagar logótipo do Storage:", e);
  }
}

export async function atualizarBrandingClube(dados: unknown): Promise<Resultado<Clube>> {
  const perm = await exigirCapacidade("CLUBE_BRANDING");
  if (!perm.ok) return erro(perm.erro);

  const parsed = brandingSchema.safeParse(dados);
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const logoAnterior = perm.ctx.clube.logoUrl;
  const clube = await prisma.clube.update({
    where: { id: perm.ctx.clube.id },
    data: {
      nome: parsed.data.nome,
      corPrimaria: parsed.data.corPrimaria,
      corSecundaria: parsed.data.corSecundaria,
      logoUrl: parsed.data.logoUrl ? parsed.data.logoUrl : null,
      morada: parsed.data.morada ?? null,
      email: parsed.data.email ? parsed.data.email : null,
      telefone: parsed.data.telefone ?? null,
    },
  });
  // Logótipo substituído por URL externo ou removido: apaga o ficheiro antigo
  // (se for nosso) só depois de a BD já não o referenciar.
  if (logoAnterior !== clube.logoUrl) await apagarLogoDoStorage(logoAnterior);

  revalidatePath("/", "layout");
  return ok(clube);
}

/**
 * Upload do ficheiro do logótipo do clube (§8.3): valida tipo/tamanho (Zod) e
 * os magic bytes, re-encoda para WebP (máx. 512×512, `inside`, sem upscale,
 * mantém transparência), guarda no bucket público `clubes` com path UUID gerado
 * no servidor, persiste o novo `logoUrl` e apaga o ficheiro anterior (se nosso).
 */
export async function uploadLogoClube(
  formData: FormData,
): Promise<Resultado<{ logoUrl: string }>> {
  const parsed = uploadLogoClubeSchema.safeParse({ logo: formData.get("logo") });
  if (!parsed.success) return erroDeValidacao(parsed.error);

  const perm = await exigirCapacidade("CLUBE_BRANDING");
  if (!perm.ok) return erro(perm.erro);
  const { clube } = perm.ctx;

  const bytes = Buffer.from(await parsed.data.logo.arrayBuffer());
  if (!detetarMimeImagem(bytes)) {
    return erro("Formato de imagem inválido. Usa PNG, JPEG ou WebP.");
  }

  const storage = obterSupabaseStorage();
  if (!storage) return erro("Armazenamento de imagens não configurado");

  let webp: Buffer;
  try {
    webp = await sharp(bytes)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    return erro("Não foi possível processar a imagem. Tenta outro ficheiro.");
  }

  const path = `clubes/${clube.id}/logo-${randomUUID()}.webp`;
  const { error: erroUpload } = await storage.storage
    .from(BUCKET_CLUBES)
    .upload(path, webp, { contentType: "image/webp", upsert: false });
  if (erroUpload) return erro("Não foi possível guardar a imagem. Tenta novamente.");

  const { data: publico } = storage.storage.from(BUCKET_CLUBES).getPublicUrl(path);
  const logoUrl = publico.publicUrl;

  await prisma.clube.update({ where: { id: clube.id }, data: { logoUrl } });
  await apagarLogoDoStorage(clube.logoUrl);

  revalidatePath("/", "layout");
  return ok({ logoUrl });
}
