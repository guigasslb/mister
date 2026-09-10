import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
// A validação de magic bytes e de tamanho é exercitada com CÓDIGO REAL (nunca
// mocada). Só se mocam as dependências externas: contexto/permissões/BD e o
// cliente do Supabase Storage.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/epoca-context", () => ({
  obterClubeIdAtual: vi.fn(),
  obterEpocaAtiva: vi.fn(),
  COOKIE_EPOCA: "epoca_ativa",
}));
vi.mock("@/lib/permissoes", () => ({
  exigirCapacidade: vi.fn(),
  exigirCapacidadeEmAlgumEscalao: vi.fn(),
  podeLerEscalao: vi.fn(),
  podeLerAlgumEscalao: vi.fn(),
  escaloesLegiveis: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    atleta: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    atletaEscalao: { findMany: vi.fn() },
    convocatoria: { count: vi.fn() },
    estatisticaAtleta: { findMany: vi.fn() },
    sessao: { count: vi.fn() },
    presenca: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/supabase-storage", () => ({
  BUCKET_ATLETAS: "atletas",
  obterSupabaseStorage: vi.fn(),
  extrairPathDoStorage: vi.fn(),
}));

import { uploadFotoAtleta, apagarAtletaDefinitivamente } from "@/lib/actions/atletas";
import { obterClubeIdAtual } from "@/lib/epoca-context";
import { exigirCapacidadeEmAlgumEscalao } from "@/lib/permissoes";
import { prisma } from "@/lib/db";
import { obterSupabaseStorage, extrairPathDoStorage } from "@/lib/supabase-storage";

const CUID = "ckv9v0z1w0000abcd1234efgh";
const ESC_ID = "ckv9v0z1w0000abcd1234efgi";
const STORAGE_URL =
  "https://ref.supabase.co/storage/v1/object/public/atletas/atletas/clube1/foto.webp";

const mocked = <T,>(fn: T) =>
  fn as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockReturnValue: (v: unknown) => void;
    mockImplementation: (f: (...a: unknown[]) => unknown) => void;
  };

const calls = (fn: unknown) => (fn as { mock: { calls: unknown[][] } }).mock.calls;

const PERM_OK = { ok: true, ctx: { clube: { id: "clube1" } } };

/** Fake do cliente do Supabase Storage com espias na cadeia `.from().*`. */
function fakeStorage() {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const getPublicUrl = vi
    .fn()
    .mockReturnValue({ data: { publicUrl: STORAGE_URL } });
  const from = vi.fn().mockReturnValue({ upload, remove, getPublicUrl });
  return { cliente: { storage: { from } }, upload, remove, getPublicUrl, from };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(obterClubeIdAtual).mockResolvedValue("clube1");
  mocked(exigirCapacidadeEmAlgumEscalao).mockResolvedValue(PERM_OK);
  mocked(prisma.atleta.findFirst).mockResolvedValue({
    id: CUID,
    fotoUrl: null,
    participacoes: [{ escalaoId: ESC_ID }],
    _count: { estatisticas: 0 },
  });
  mocked(prisma.atleta.update).mockResolvedValue({ id: CUID });
  mocked(prisma.atleta.delete).mockResolvedValue({ id: CUID });
  mocked(extrairPathDoStorage).mockReturnValue(null);
});

// ─── uploadFotoAtleta — validação de mime (magic bytes) ──────────────────────

describe("uploadFotoAtleta — validação de magic bytes (código real)", () => {
  it("rejeita um ficheiro cujos magic bytes não são JPEG/PNG/WebP", async () => {
    const storage = fakeStorage();
    mocked(obterSupabaseStorage).mockReturnValue(storage.cliente);

    // Bytes arbitrários (não correspondem a nenhuma assinatura de imagem).
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const foto = new File([bytes], "malicioso.jpg", { type: "image/jpeg" });

    const formData = new FormData();
    formData.set("foto", foto);

    const r = await uploadFotoAtleta(CUID, formData);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/formato de imagem inválido/i);
    // Não chega a tocar no Storage.
    expect(storage.upload).not.toHaveBeenCalled();
    expect(prisma.atleta.update).not.toHaveBeenCalled();
  });

  it("aceita os magic bytes de um WebP válido (RIFF + fourcc WEBP)", async () => {
    const storage = fakeStorage();
    mocked(obterSupabaseStorage).mockReturnValue(storage.cliente);

    // Cabeçalho WebP mínimo: "RIFF" .... "WEBP". O sharp real re-encoda; se os
    // bytes não formarem uma imagem descodificável, a action devolve o erro de
    // processamento (não o de formato) — o que confirma que a deteção de mime
    // passou. Mantemos a asserção no ramo de mime, que é o objeto do teste.
    const header = [
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ];
    const bytes = new Uint8Array([...header, 0x00, 0x00, 0x00, 0x00]);
    const foto = new File([bytes], "foto.webp", { type: "image/webp" });

    const formData = new FormData();
    formData.set("foto", foto);

    const r = await uploadFotoAtleta(CUID, formData);
    // Não deve falhar por FORMATO — os magic bytes de WebP foram aceites.
    if (!r.sucesso) expect(r.erro).not.toMatch(/formato de imagem inválido/i);
  });
});

// ─── uploadFotoAtleta — validação de tamanho ─────────────────────────────────

describe("uploadFotoAtleta — validação de tamanho (código real)", () => {
  it("rejeita um ficheiro acima de 10 MB (com magic bytes válidos)", async () => {
    const storage = fakeStorage();
    mocked(obterSupabaseStorage).mockReturnValue(storage.cliente);

    // 10 MB + 1 byte, com cabeçalho JPEG válido para passar a deteção de mime e
    // chegar à validação de tamanho.
    const grande = new Uint8Array(10 * 1024 * 1024 + 1);
    grande[0] = 0xff;
    grande[1] = 0xd8;
    grande[2] = 0xff;
    const foto = new File([grande], "enorme.jpg", { type: "image/jpeg" });

    const formData = new FormData();
    formData.set("foto", foto);

    const r = await uploadFotoAtleta(CUID, formData);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/10 MB|excede/i);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(prisma.atleta.update).not.toHaveBeenCalled();
  });
});

// ─── uploadFotoAtleta — guardas de acesso ────────────────────────────────────

describe("uploadFotoAtleta — acesso", () => {
  it("falha sem clube ativo (não autenticado)", async () => {
    mocked(obterClubeIdAtual).mockResolvedValue(null);
    const formData = new FormData();
    formData.set("foto", new File([new Uint8Array([0xff, 0xd8, 0xff])], "f.jpg"));
    const r = await uploadFotoAtleta(CUID, formData);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/não autenticado/i);
  });

  it("falha com atletaId inválido (não é cuid) sem tocar na BD", async () => {
    const formData = new FormData();
    formData.set("foto", new File([new Uint8Array([0xff, 0xd8, 0xff])], "f.jpg"));
    const r = await uploadFotoAtleta("nao-e-cuid", formData);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.camposInvalidos?.atletaId).toBeTruthy();
    expect(prisma.atleta.findFirst).not.toHaveBeenCalled();
  });

  it("falha sem permissão de gestão de plantel", async () => {
    mocked(exigirCapacidadeEmAlgumEscalao).mockResolvedValue({
      ok: false,
      erro: "Sem permissão",
    });
    const formData = new FormData();
    formData.set("foto", new File([new Uint8Array([0xff, 0xd8, 0xff])], "f.jpg"));
    const r = await uploadFotoAtleta(CUID, formData);
    expect(r.sucesso).toBe(false);
    if (!r.sucesso) expect(r.erro).toMatch(/sem permissão/i);
  });
});

// ─── Ciclo de vida no hard-delete ────────────────────────────────────────────

describe("apagarAtletaDefinitivamente — apaga a foto do Storage", () => {
  it("tenta apagar o ficheiro do Storage quando o fotoUrl é nosso", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue({
      id: CUID,
      fotoUrl: STORAGE_URL,
      participacoes: [{ escalaoId: ESC_ID }],
      _count: { estatisticas: 0 },
    });
    mocked(extrairPathDoStorage).mockReturnValue("atletas/clube1/foto.webp");
    const storage = fakeStorage();
    mocked(obterSupabaseStorage).mockReturnValue(storage.cliente);

    const r = await apagarAtletaDefinitivamente(CUID);
    expect(r.sucesso).toBe(true);

    expect(storage.from).toHaveBeenCalledWith("atletas");
    expect(storage.remove).toHaveBeenCalledOnce();
    expect(calls(storage.remove)[0][0]).toEqual(["atletas/clube1/foto.webp"]);
    expect(prisma.atleta.delete).toHaveBeenCalledOnce();
  });

  it("não toca no Storage quando o fotoUrl é externo (não nosso)", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue({
      id: CUID,
      fotoUrl: "https://exemplo.com/foto.jpg",
      participacoes: [{ escalaoId: ESC_ID }],
      _count: { estatisticas: 0 },
    });
    mocked(extrairPathDoStorage).mockReturnValue(null); // URL externo → sem path
    const storage = fakeStorage();
    mocked(obterSupabaseStorage).mockReturnValue(storage.cliente);

    const r = await apagarAtletaDefinitivamente(CUID);
    expect(r.sucesso).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(prisma.atleta.delete).toHaveBeenCalledOnce();
  });

  it("uma falha ao apagar a foto NÃO bloqueia o hard-delete do atleta", async () => {
    mocked(prisma.atleta.findFirst).mockResolvedValue({
      id: CUID,
      fotoUrl: STORAGE_URL,
      participacoes: [{ escalaoId: ESC_ID }],
      _count: { estatisticas: 0 },
    });
    mocked(extrairPathDoStorage).mockReturnValue("atletas/clube1/foto.webp");
    const storage = fakeStorage();
    storage.remove.mockRejectedValue(new Error("Storage indisponível"));
    mocked(obterSupabaseStorage).mockReturnValue(storage.cliente);

    const r = await apagarAtletaDefinitivamente(CUID);
    expect(r.sucesso).toBe(true);
    expect(prisma.atleta.delete).toHaveBeenCalledOnce();
  });
});
