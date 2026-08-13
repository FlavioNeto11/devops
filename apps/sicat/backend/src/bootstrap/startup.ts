import { config } from '../lib/config.js';
import { ensureStorageDirs } from '../lib/files.js';
import { runMigrations } from '../db/migrate.js';
import { ensureBaseData } from './base-data.js';
import { ensureRegulatoryCatalogSeeded } from './regulatory-rules-seed.js';
import { seedAiRuntimeDefaults } from '../services/ai-control/ai-control-bootstrap.js';
import {
  refreshConversationPermissionCatalogSnapshot,
  startConversationPermissionCatalogRefreshLoop
} from '../services/conversation/conversation-permission-catalog-state.js';

let bootstrapped = false;

export async function ensureStartup() {
  if (bootstrapped) return;

  // Lido PRIMEIRO, de propósito: o getter valida e LANÇA em valor desconhecido. Sem este toque
  // explícito a validação seria preguiçosa e um typo (`enfore`) só apareceria no meio de um turno,
  // como 500. Pod que não sobe é visível; gate reaberto por typo não é. O log também é a resposta
  // operacional a "em que modo este pod está?".
  console.log(`[startup] CONVERSATION_PERMISSION_ENFORCEMENT=${config.conversationPermissionEnforcement}`);

  await ensureStorageDirs();
  if (config.autoMigrate) {
    await runMigrations();
  }
  if (config.autoSeed) {
    await ensureBaseData();

    // Catálogo regulatório da vertical Transporte (PR-A1, DL-103) — depois do seed de acesso,
    // sob o mesmo gate AUTO_SEED. Falha NÃO derruba o boot: a vertical ainda não tem superfície
    // HTTP, e derrubar api+worker (MTR/DMR/CETESB, que é o produto) por causa dela seria
    // desproporcional — mesmo racional do seed RBAC em `base-data.ts`. Mas NUNCA silenciosa:
    // erro alto no log, autocura no próximo boot (seed idempotente).
    try {
      const regulatorySeedResult = await ensureRegulatoryCatalogSeeded();
      console.log(`[regulatory-catalog-seed] catalogo reconciliado ${JSON.stringify(regulatorySeedResult)}`);
    } catch (error: unknown) {
      console.error(
        '[regulatory-catalog-seed] FALHA ao reconciliar o catalogo regulatorio Transporte. A vertical '
          + 'segue sem catalogo ate o proximo boot bem-sucedido; o restante do SICAT nao e afetado: '
          + `${error instanceof Error ? error.stack || error.message : String(error)}`
      );
    }
  }
  // Semeia os textos de IA (prompts + agentes) no banco e aquece o runtime (best-effort).
  await seedAiRuntimeDefaults();

  // Integridade do catálogo de permissões: leitura PURA, fora do gate `autoSeed` de propósito. O
  // `sicat-worker-channel` sobe com `AUTO_SEED=false` e nunca semeia, mas avalia a policy dos turnos
  // de WhatsApp — precisa do snapshot igual. Se ele subir antes de a api semear, começa degradado e
  // se cura sozinho no próximo TTL, sem restart.
  await refreshConversationPermissionCatalogSnapshot();
  startConversationPermissionCatalogRefreshLoop();

  bootstrapped = true;
}
