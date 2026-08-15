/**
 * Snapshot de INTEGRIDADE do catálogo de permissões (fase 4.5).
 *
 * O gate conversacional precisa saber, de forma SÍNCRONA, se uma chave exigida é ao menos
 * SATISFAZÍVEL — isto é, se existe em `access_permissions` e está ativa. Chave ausente ou inativa não
 * pode ser tida por ninguém (`listPermissionKeysByUserId` filtra `ap.is_active = true`), então exigi-la
 * seria negar para TODO MUNDO, inclusive os administradores.
 *
 * A integridade é MEDIDA, nunca pressuposta, e nunca vem de flag de processo. Um marcador do tipo "o
 * seed rodou aqui" bloquearia por engano o `sicat-worker-channel` (que sobe com `AUTO_SEED=false` e
 * mesmo assim avalia a policy dos turnos de WhatsApp) e reintroduziria fail-open dependente de
 * runtime. O catálogo é estado do BANCO.
 *
 * Semântica do snapshot:
 *  - antes do primeiro refresh o estado é DESCONHECIDO e trata-se como degradado (leitura passa,
 *    ação nega) — nunca como "tudo satisfazível";
 *  - depois do TTL o snapshot fica STALE: continua valendo enquanto um refresh roda em segundo plano
 *    (stale-while-revalidate). Cair para degradado a cada expiração transformaria um blip de banco em
 *    negação de ação;
 *  - falha de refresh preserva o snapshot anterior e só registra WARN.
 *
 * O primeiro refresh é AWAITED em `ensureStartup` (leitura pura, roda mesmo com `autoSeed = false`).
 */

import { query } from '../../db/pool.js';
import { listCatalogPermissionKeys } from '../../lib/conversation-permission-catalog.js';

const SNAPSHOT_TTL_MS = 60_000;

type CatalogSnapshot = {
  satisfiable: Set<string>;
  loadedAtMs: number;
};

let snapshot: CatalogSnapshot | null = null;
let inflightRefresh: Promise<void> | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

async function loadSatisfiableKeys(): Promise<Set<string>> {
  const result = await query<{ permission_key: string }>(
    `select permission_key
       from access_permissions
      where permission_key = any($1::text[])
        and is_active = true`,
    [listCatalogPermissionKeys()]
  );

  return new Set(
    result.rows
      .map((row) => String(row.permission_key || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Recarrega o snapshot. Erro NÃO propaga: o chamador de boot não pode derrubar o processo por causa
 * de uma leitura de catálogo, e o modo degradado já é a resposta segura para "não sei".
 */
export async function refreshConversationPermissionCatalogSnapshot(): Promise<void> {
  if (inflightRefresh) return inflightRefresh;

  inflightRefresh = (async () => {
    try {
      const satisfiable = await loadSatisfiableKeys();
      snapshot = { satisfiable, loadedAtMs: Date.now() };
    } catch (error: unknown) {
      console.warn(
        '[conversation-permission-catalog] falha ao ler access_permissions; mantendo snapshot anterior: '
          + `${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      inflightRefresh = null;
    }
  })();

  return inflightRefresh;
}

/** Loop de atualização. `unref` para não segurar o processo (worker de teste, CLI). */
export function startConversationPermissionCatalogRefreshLoop(): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    void refreshConversationPermissionCatalogSnapshot();
  }, SNAPSHOT_TTL_MS);
  refreshTimer.unref?.();
}

export function stopConversationPermissionCatalogRefreshLoop(): void {
  if (!refreshTimer) return;
  clearInterval(refreshTimer);
  refreshTimer = null;
}

/**
 * `true` só quando o snapshot conhecido diz que a chave existe e está ativa.
 * Estado desconhecido → `false` (degradado), que é a resposta segura.
 */
export function isConversationPermissionSatisfiable(permissionKey: string): boolean {
  const normalized = String(permissionKey || '').trim().toLowerCase();
  if (!normalized) return false;

  if (!snapshot) {
    void refreshConversationPermissionCatalogSnapshot();
    return false;
  }

  if (Date.now() - snapshot.loadedAtMs > SNAPSHOT_TTL_MS) {
    // Stale-while-revalidate: responde com o último snapshot conhecido e recarrega em segundo plano.
    void refreshConversationPermissionCatalogSnapshot();
  }

  return snapshot.satisfiable.has(normalized);
}

export function getConversationPermissionCatalogSnapshotForTests(): { keys: string[]; loadedAtMs: number } | null {
  if (!snapshot) return null;
  return { keys: [...snapshot.satisfiable].sort(), loadedAtMs: snapshot.loadedAtMs };
}

/**
 * Injeção do snapshot para teste. `null` volta ao estado DESCONHECIDO (degradado), que é o estado de
 * um processo que ainda não conseguiu ler o banco.
 */
export function setConversationPermissionCatalogSnapshotForTests(keys: readonly string[] | null): void {
  if (keys === null) {
    snapshot = null;
    return;
  }
  snapshot = {
    satisfiable: new Set(keys.map((key) => String(key).trim().toLowerCase()).filter(Boolean)),
    loadedAtMs: Date.now()
  };
}
