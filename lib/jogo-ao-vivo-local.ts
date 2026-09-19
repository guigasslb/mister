/**
 * Persistência local (offline-first) do Modo Jogo ao Vivo — §8.25.4 da bíblia
 * (`docs/Mister_Spec_v7.md`).
 *
 * Guarda o estado completo da sessão de condução no dispositivo, em tempo real,
 * para que a app possa fechar e reabrir (ex.: durante o intervalo) e retomar
 * exatamente onde estava (RN-JV-11). Usa **IndexedDB** quando disponível e cai
 * para **localStorage** como *fallback* simples. Sem bibliotecas externas.
 *
 * Os eventos formam uma **lista imutável (append-only)** com o segundo absoluto
 * do jogo; os que ainda não foram sincronizados ficam marcados `pendente: true`
 * (a *outbox*). Quando a rede volta, o consumidor chama a server action
 * `sincronizarJogoAoVivo` (idempotente por `clientEventoId`) e marca-os como
 * sincronizados.
 *
 * Todos os tipos são definidos aqui (não dependem do Prisma runtime) para poderem
 * ser reutilizados no cliente. Espelham os deltas de schema de §8.25.8.
 */

import type { Posicao } from "@prisma/client";

// ─────────────────────────────────────────────
// Tipos (espelham §8.25.8 — EstadoJogoAoVivo / TipoEventoJogo / SessaoJogoAoVivo)
// ─────────────────────────────────────────────

/** Estados de condução (§8.25.8, enum `EstadoJogoAoVivo`). */
export type EstadoJogoAoVivo =
  | "POR_INICIAR"
  | "EM_CURSO"
  | "INTERVALO"
  | "PAUSADO"
  | "TERMINADO";

/** Primitivas de evento do Modo Jogo ao Vivo (§8.25.8). */
export type TipoEventoAoVivo =
  | "INICIO_PARTE"
  | "FIM_PARTE"
  | "ENTRADA"
  | "SAIDA"
  | "PAUSA"
  | "RETOMA";

/**
 * Evento local (append-only). `segundoJogo` é o segundo absoluto do cronómetro
 * contínuo (0 = apito inicial da Parte 1). `pendente` = ainda por sincronizar
 * com o servidor (*outbox*). `clientEventoId` garante *sync* idempotente.
 */
export interface EventoLocal {
  clientEventoId: string;
  tipo: TipoEventoAoVivo;
  segundoJogo: number;
  atletaId?: string | null;
  posicao?: Posicao | null;
  parte?: number | null;
  criadoEm: number;
  pendente: boolean;
}

/** Jogador atualmente em campo, com a posição e o segundo em que entrou. */
export interface JogadorEmCampo {
  atletaId: string;
  posicao: Posicao | null;
  entradaSegundo: number;
}

/**
 * Estado do cronómetro/condução (espelha `SessaoJogoAoVivo`, §8.25.8). O tempo
 * corrente deriva de `segundosDecorridos + (aCorrerDesde ? agora − aCorrerDesde : 0)`
 * (§8.25.2). `aCorrerDesde` é um *timestamp* local em ms (não persistimos o
 * relógio do servidor no cliente).
 */
export interface SessaoLocal {
  jogoId: string;
  numeroPartes: number;
  duracaoParteMins: number;
  estado: EstadoJogoAoVivo;
  parteAtual: number;
  segundosDecorridos: number;
  aCorrerDesde: number | null;
  emCampo: JogadorEmCampo[];
  /**
   * A sessão já foi criada no servidor (via `iniciarJogoAoVivo`)? Offline-first: o
   * arranque pode ocorrer sem rede; enquanto `false`, a sincronização começa por
   * criar a sessão no servidor a partir dos titulares locais (§8.25.4).
   */
  servidorIniciado: boolean;
  atualizadoEm: number;
}

/** Blob completo persistido por jogo: `{ jogoId, eventos, sessao }`. */
export interface EstadoLocalCompleto {
  jogoId: string;
  sessao: SessaoLocal;
  eventos: EventoLocal[];
}

// ─────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────

/** Gera um id de evento estável no cliente (para *sync* idempotente). */
export function gerarClientEventoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Segundo corrente do cronómetro contínuo a partir do estado da sessão (§8.25.2). */
export function segundoCorrente(sessao: SessaoLocal, agora: number = Date.now()): number {
  const extra = sessao.aCorrerDesde
    ? Math.max(0, Math.floor((agora - sessao.aCorrerDesde) / 1000))
    : 0;
  return sessao.segundosDecorridos + extra;
}

/** Eventos ainda por sincronizar (a *outbox*). */
export function eventosPendentes(estado: EstadoLocalCompleto): EventoLocal[] {
  return estado.eventos.filter((e) => e.pendente);
}

/**
 * Reconstrói a lista de jogadores em campo a partir dos eventos ao vivo (para
 * hidratar a partir do servidor após reabrir a app noutro dispositivo). Um
 * atleta está em campo se tem uma `ENTRADA` sem `SAIDA` posterior.
 */
export function reconstruirEmCampo(eventos: readonly EventoLocal[]): JogadorEmCampo[] {
  const ordenados = [...eventos].sort((a, b) => a.segundoJogo - b.segundoJogo);
  const abertos = new Map<string, JogadorEmCampo>();
  for (const e of ordenados) {
    if (!e.atletaId) continue;
    if (e.tipo === "ENTRADA") {
      abertos.set(e.atletaId, {
        atletaId: e.atletaId,
        posicao: e.posicao ?? null,
        entradaSegundo: e.segundoJogo,
      });
    } else if (e.tipo === "SAIDA") {
      abertos.delete(e.atletaId);
    }
  }
  return [...abertos.values()];
}

// ─────────────────────────────────────────────
// Persistência: IndexedDB com fallback a localStorage
// ─────────────────────────────────────────────

const DB_NOME = "mister-jogo-ao-vivo";
const STORE = "sessoes";
const DB_VERSAO = 1;
const chaveLS = (jogoId: string) => `jogo-ao-vivo:${jogoId}`;

function temIndexedDB(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "jogoId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Guarda (upsert) o estado local completo do jogo, em tempo real. */
export async function guardarEstadoLocal(
  jogoId: string,
  estado: EstadoLocalCompleto,
): Promise<void> {
  const registo: EstadoLocalCompleto = { ...estado, jogoId };
  if (temIndexedDB()) {
    try {
      const db = await abrirDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(registo);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return;
    } catch {
      // Cai para localStorage.
    }
  }
  try {
    localStorage.setItem(chaveLS(jogoId), JSON.stringify(registo));
  } catch {
    // Persistência indisponível (modo privado, quota) — ignora silenciosamente;
    // o estado em memória continua a funcionar durante a sessão.
  }
}

/** Obtém o estado local completo do jogo, ou `null` se não existir. */
export async function obterEstadoLocal(
  jogoId: string,
): Promise<EstadoLocalCompleto | null> {
  if (temIndexedDB()) {
    try {
      const db = await abrirDB();
      const resultado = await new Promise<EstadoLocalCompleto | null>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(jogoId);
        req.onsuccess = () => resolve((req.result as EstadoLocalCompleto) ?? null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (resultado) return resultado;
    } catch {
      // Cai para localStorage.
    }
  }
  try {
    const raw = localStorage.getItem(chaveLS(jogoId));
    return raw ? (JSON.parse(raw) as EstadoLocalCompleto) : null;
  } catch {
    return null;
  }
}

/** Remove o estado local do jogo (ex.: após terminar e sincronizar tudo). */
export async function limparEstadoLocal(jogoId: string): Promise<void> {
  if (temIndexedDB()) {
    try {
      const db = await abrirDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(jogoId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Ignora — tenta na mesma o localStorage.
    }
  }
  try {
    localStorage.removeItem(chaveLS(jogoId));
  } catch {
    // Ignora.
  }
}
