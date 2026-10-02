import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

// ─── Mocks ───────────────────────────────────────────────────────────────────
// Schema Zod, magic bytes e re-encode com `sharp` correm com CÓDIGO REAL. Só se
// mocam as dependências externas: permissões/BD e o cliente do Supabase Storage.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({ exigirCapacidade: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { clube: { update: vi.fn() } } }));
vi.mock("@/lib/supabase-storage", () => ({
  BUCKET_CLUBES: "clubes",
  obterSupabaseStorage: vi.fn(),
  extrairPathDoStorage: vi.fn(),
}));

import { uploadLogoClube, atualizarBrandingClube } from "@/lib/actions/clubes";
import {
  uploadLogoClubeSchema,
  MAX_BYTES_LOGO_CLUBE,
} from "@/lib/schemas/onboarding";
import { exigirCapacidade } from "@/lib/permissoes";
import { prisma } from "@/lib/db";
import { obterSupabaseStorage, extrairPathDoStorage } from "@/lib/supabase-storage";

const NOVO_URL =
  "https://ref.supabase.co/storage/v1/object/public/clubes/clubes/clube1/logo-novo.webp";
const ANTIGO_URL =
  "https://ref.supabase.co/storage/v1/object/public/clubes/clubes/clube1/logo-antigo.webp";

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockReturnValue: (v: unknown) => void;
    mockImplementation: (f: (...a: unknown[]) => unknown) => void;
  };
const calls = (fn: unknown) => (fn as { mock: { calls: unknown[][] } }).mock.calls;

function permOk(logoUrl: string | null = null) {
  return { ok: true, ctx: { clube: { id: "clube1", logoUrl } } };
}

function fakeStorage() {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: NOVO_URL } });
  const from = vi.fn().mockReturnValue({ upload, remove, getPublicUrl });
  return { cliente: { storage: { from } }, upload, remove, from };
}

async function pngReal(): Promise<Uint8Array<ArrayBuffer>> {
  const buf = await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 240, g: 83, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
}

function formCom(ficheiro: File): FormData {
  const fd = new FormData();
  fd.set("logo", ficheiro);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(exigirCapacidade).mockResolvedValue(permOk());
  mocked(prisma.clube.update).mockImplementation(async (...a: unknown[]) => {
    const arg = a[0] as { data: { logoUrl?: string | null } };
    return { id: "clube1", logoUrl: arg.data.logoUrl ?? null };
  });
  mocked(extrairPathDoStorage).mockReturnValue(null);
});

// ─── Schema Zod ──────────────────────────────────────────────────────────────

describe("uploadLogoClubeSchema", () => {
  it("aceita PNG, JPEG e WebP até 2 MB", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      const f = new File([new Uint8Array(10)], "logo", { type });
      expect(uploadLogoClubeSchema.safeParse({ logo: f }).success).toBe(true);
    }
  });

  it("rejeita SVG e outros tipos", () => {
    for (const type of ["image/svg+xml", "image/gif", "application/pdf", ""]) {
      const f = new File([new Uint8Array(10)], "logo", { type });
      const r = uploadLogoClubeSchema.safeParse({ logo: f });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toMatch(/formato inválido/i);
    }
  });

  it("rejeita ficheiros acima de 2 MB e vazios", () => {
    const grande = new File([new Uint8Array(MAX_BYTES_LOGO_CLUBE + 1)], "l.png", {
      type: "image/png",
    });
    const r = uploadLogoClubeSchema.safeParse({ logo: grande });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/2 MB/);

    const vazio = new File([], "l.png", { type: "image/png" });
    expect(uploadLogoClubeSchema.safeParse({ logo: vazio }).success).toBe(false);
  });

  it("rejeita valores que não são ficheiros", () => {
    expect(uploadLogoClubeSchema.safeParse({ logo: null }).success).toBe(false);
    expect(uploadLogoClubeSchema.safeParse({ logo: "https://x.pt/l.png" }).success).toBe(false);
  });
});

// ─── uploadLogoClube ─────────────────────────────────────────────────────────

describe("uploadLogoClube — validação no servidor", () => {
  it("rejeita ficheiro acima de 2 MB sem verificar permissões nem tocar no Storage", async () => {
    const storage = fakeStorage();
    mocked(obterSupabaseStorage).mockReturnValue(storage.cliente);
    const f = new File([new Uint8Array(MAX_BYTES_LOGO_CLUBE + 1)], "l.png", {
      type: "image/png",
    });
    const r = await uploadLogoClube(formCom(f));
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.logo).toMatch(/2 MB/);
    expect(exigirCapacidade).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejeita SVG declarado", async () => {
    const f = new File(["<svg/>"], "l.svg", { type: "image/svg+xml" });
    const r = await uploadLogoClube(formCom(f));
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.logo).toMatch(/formato inválido/i);
  });

  it("rejeita magic bytes que não são imagem, mesmo com tipo declarado válido", async () => {
    const storage = fakeStorage();
    mocked(obterSupabaseStorage).mockReturnValue(storage.cliente);
    const f = new File(["<svg onload=alert(1)>"], "l.png", { type: "image/png" });
    const r = await uploadLogoClube(formCom(f));
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/formato de imagem inválido/i);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(prisma.clube.update).not.toHaveBeenCalled();
  });

  it("falha sem a capacidade CLUBE_BRANDING", async () => {
    mocked(exigirCapacidade).mockResolvedValue({ ok: false, erro: "Sem permissão" });
    const f = new File([await pngReal()], "l.png", { type: "image/png" });
    const r = await uploadLogoClube(formCom(f));
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toBe("Sem permissão");
    expect(calls(exigirCapacidade)[0][0]).toBe("CLUBE_BRANDING");
    expect(prisma.clube.update).not.toHaveBeenCalled();
  });

  it("devolve erro claro quando o Storage não está configurado", async () => {
    mocked(obterSupabaseStorage).mockReturnValue(null);
    const f = new File([await pngReal()], "l.png", { type: "image/png" });
    const r = await uploadLogoClube(formCom(f));
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não configurado/i);
  });
});

describe("uploadLogoClube — sucesso", () => {
  it("re-encoda para WebP, usa path gerado no servidor, persiste e apaga o anterior", async () => {
    mocked(exigirCapacidade).mockResolvedValue(permOk(ANTIGO_URL));
    mocked(extrairPathDoStorage).mockReturnValue("clubes/clube1/logo-antigo.webp");
    const storage = fakeStorage();
    mocked(obterSupabaseStorage).mockReturnValue(storage.cliente);

    const f = new File([await pngReal()], "../../evil name.png", { type: "image/png" });
    const r = await uploadLogoClube(formCom(f));

    expect(r).toEqual({ sucesso: true, dados: { logoUrl: NOVO_URL } });
    expect(storage.from).toHaveBeenCalledWith("clubes");

    const [path, corpo, opcoes] = calls(storage.upload)[0] as [string, Buffer, object];
    expect(path).toMatch(/^clubes\/clube1\/logo-[0-9a-f-]{36}\.webp$/);
    expect(path).not.toContain("evil");
    expect(opcoes).toEqual({ contentType: "image/webp", upsert: false });
    expect((await sharp(corpo).metadata()).format).toBe("webp");

    expect(calls(prisma.clube.update)[0][0]).toEqual({
      where: { id: "clube1" },
      data: { logoUrl: NOVO_URL },
    });
    expect(calls(extrairPathDoStorage)[0]).toEqual([ANTIGO_URL, "clubes"]);
    expect(calls(storage.remove)[0][0]).toEqual(["clubes/clube1/logo-antigo.webp"]);
  });

  it("não apaga nada quando o logótipo anterior é um URL externo", async () => {
    mocked(exigirCapacidade).mockResolvedValue(permOk("https://exemplo.pt/logo.png"));
    const storage = fakeStorage();
    mocked(obterSupabaseStorage).mockReturnValue(storage.cliente);

    const f = new File([await pngReal()], "l.png", { type: "image/png" });
    const r = await uploadLogoClube(formCom(f));
    expect(r.sucesso).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

// ─── atualizarBrandingClube — ciclo de vida do ficheiro ──────────────────────

describe("atualizarBrandingClube — ficheiro antigo do logótipo", () => {
  const base = {
    nome: "Clube Teste",
    corPrimaria: "#F0531E",
    corSecundaria: "#FFFFFF",
    email: "",
  };

  it("apaga o ficheiro nosso quando o logótipo é removido", async () => {
    mocked(exigirCapacidade).mockResolvedValue(permOk(ANTIGO_URL));
    mocked(extrairPathDoStorage).mockReturnValue("clubes/clube1/logo-antigo.webp");
    const storage = fakeStorage();
    mocked(obterSupabaseStorage).mockReturnValue(storage.cliente);

    const r = await atualizarBrandingClube({ ...base, logoUrl: "" });
    expect(r.sucesso).toBe(true);
    expect(calls(storage.remove)[0][0]).toEqual(["clubes/clube1/logo-antigo.webp"]);
  });

  it("não toca no Storage quando o logótipo não muda", async () => {
    mocked(exigirCapacidade).mockResolvedValue(permOk(ANTIGO_URL));
    const storage = fakeStorage();
    mocked(obterSupabaseStorage).mockReturnValue(storage.cliente);

    const r = await atualizarBrandingClube({ ...base, logoUrl: ANTIGO_URL });
    expect(r.sucesso).toBe(true);
    expect(extrairPathDoStorage).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
