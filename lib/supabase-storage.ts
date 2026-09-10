import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente do Supabase Storage para ficheiros da app (fotos de atletas, §8.5).
 *
 * SERVER-ONLY: usa a `service_role` key, que ignora as políticas RLS e NUNCA
 * pode chegar ao browser. O `import "server-only"` acima faz o build falhar se
 * este módulo for importado a partir de código de cliente. É consumido apenas
 * por Server Actions (`lib/actions/atletas.ts`).
 *
 * Bucket `atletas` — **público**, com paths não-adivinháveis (UUID por ficheiro):
 * neste contexto (app de treinador com sessão autenticada) as signed URLs
 * expiram e obrigam a refresh em cada carregamento de página, aumentando a
 * complexidade sem benefício real. A não-adivinhabilidade do path (UUID) é
 * proteção suficiente para fotografias de perfil (§5.6 — ficheiros do Supabase
 * Storage com URLs não-adivinháveis).
 */
export const BUCKET_ATLETAS = "atletas";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cliente: SupabaseClient | null = null;

/**
 * Devolve o cliente singleton do Supabase Storage, ou `null` quando as variáveis
 * de ambiente não estão configuradas (o upload de foto desliga-se de forma
 * controlada, sem crash — a action devolve um erro claro).
 */
export function obterSupabaseStorage(): SupabaseClient | null {
  if (!url || !serviceRoleKey) return null;
  if (!cliente) {
    cliente = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}

/**
 * Reference do projeto Supabase (hostname base do Storage), derivado de
 * `NEXT_PUBLIC_SUPABASE_URL`. Usado para distinguir um `fotoUrl` servido pelo
 * NOSSO Storage de um URL externo colado pelo utilizador (só apagamos ficheiros
 * nossos). `null` quando não configurado.
 */
export function obterHostnameStorage(): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Extrai o path dentro do bucket a partir de um URL público do Storage, ou
 * `null` se o URL não pertence ao nosso Storage / bucket. URLs públicos têm a
 * forma `https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>`.
 */
export function extrairPathDoStorage(fotoUrl: string): string | null {
  const hostnameStorage = obterHostnameStorage();
  if (!hostIgual(fotoUrl, hostnameStorage)) return null;

  const marcador = `/storage/v1/object/public/${BUCKET_ATLETAS}/`;
  const idx = fotoUrl.indexOf(marcador);
  if (idx === -1) return null;

  const path = fotoUrl.slice(idx + marcador.length);
  return path.length > 0 ? decodeURIComponent(path) : null;
}

function hostIgual(fotoUrl: string, hostnameStorage: string | null): boolean {
  if (!hostnameStorage) return false;
  try {
    return new URL(fotoUrl).hostname === hostnameStorage;
  } catch {
    return false;
  }
}
