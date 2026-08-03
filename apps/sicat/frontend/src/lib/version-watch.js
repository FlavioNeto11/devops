/**
 * VERIFICAÇÃO DE VERSÃO EM RUNTIME — camada de EFEITO.
 *
 * A decisão está em `version-check.js` (pura, coberta por node:test). Aqui fica
 * só o mundo real: `fetch` do manifesto, os momentos em que vale checar e o
 * aviso ao operador.
 *
 * Por que isto existe (medido em produção): o documento antigo pode continuar
 * sendo servido do cache de disco do navegador mesmo depois do deploy — sem
 * 404, sem erro, sem sintoma. A rede de segurança de chunk removido
 * (`stale-bundle-recovery.js`) continua valendo, mas ela só acorda quando um
 * arquivo SOME; aqui a pergunta é feita de propósito, pela rede, ignorando o
 * cache HTTP.
 *
 * Momentos de checagem (baratos e úteis, sem polling):
 *  - ao montar o app (uma vez);
 *  - quando a aba volta ao foco/visibilidade;
 *  - na troca de rota.
 * Todos passam pelo mesmo piso de intervalo (`shouldCheckNow`).
 */

import { useNotification } from '../composables/useNotification.js';
import {
  NEW_VERSION_ACTION_LABEL,
  NEW_VERSION_DETAIL,
  NEW_VERSION_MESSAGE,
  buildVersionManifestUrl,
  readServedBuildId,
  shouldCheckNow,
  shouldPromptReload
} from './version-check.js';

/**
 * Identificador embutido em build-time. O plugin `sicat-version-manifest`
 * (vite.config.js) define `VITE_BUILD_ID` e emite o `version.json` com o MESMO
 * valor. Em `vite dev` não existe manifesto — a checagem simplesmente cala.
 */
const EMBEDDED_BUILD_ID = String(import.meta.env?.VITE_BUILD_ID || '');

const APP_BASE_URL = String(import.meta.env?.BASE_URL || '/');

/**
 * Guardamos o identificador pelo qual já avisamos. Sobrevive ao reload (mesma
 * aba), que é justamente o caso em que a trava importa: se o recarregamento não
 * resolveu, não avisamos de novo em ciclo.
 */
const HANDLED_STORAGE_KEY = 'sicat:version-prompted-for';

let lastCheckAt = 0;
let inFlight = false;
let started = false;

function readHandledBuildId() {
  try {
    return globalThis.sessionStorage?.getItem(HANDLED_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function rememberHandledBuildId(buildId) {
  try {
    globalThis.sessionStorage?.setItem(HANDLED_STORAGE_KEY, buildId);
  } catch {
    /* sessionStorage indisponível (modo restrito) — segue sem a trava persistida. */
  }
}

async function fetchServedBuildId(now) {
  const url = buildVersionManifestUrl(APP_BASE_URL, now);
  const response = await globalThis.fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  });

  if (!response?.ok) return '';

  return readServedBuildId(await response.json());
}

function announceNewVersion() {
  useNotification().warning(NEW_VERSION_MESSAGE, {
    detail: NEW_VERSION_DETAIL,
    // timeout 0: o aviso fica até o operador decidir. Recarregar por conta
    // própria no meio de um formulário destruiria trabalho dele.
    timeout: 0,
    actionLabel: NEW_VERSION_ACTION_LABEL,
    onAction: () => {
      // `location.reload()` revalida o DOCUMENTO ignorando o cache HTTP — é
      // exatamente o que a cópia presa no cache de disco precisa.
      globalThis.location?.reload();
    }
  });
}

/**
 * Uma checagem. Nunca lança e nunca recarrega sozinha.
 * @returns {Promise<boolean>} true se o operador foi avisado agora.
 */
export async function checkAppVersion({ force = false, now = Date.now() } = {}) {
  // Build sem identificador (dev, ou build antigo) — não há o que comparar.
  if (!EMBEDDED_BUILD_ID) return false;
  if (typeof globalThis.fetch !== 'function') return false;
  if (inFlight) return false;
  if (!force && !shouldCheckNow(lastCheckAt, now)) return false;

  inFlight = true;
  lastCheckAt = now;

  try {
    const served = await fetchServedBuildId(now);
    if (!shouldPromptReload(EMBEDDED_BUILD_ID, served, readHandledBuildId())) {
      return false;
    }

    // Marcamos ANTES de avisar: se o operador ignorar o toast, não voltamos a
    // insistir por este mesmo identificador.
    rememberHandledBuildId(served);
    announceNewVersion();
    return true;
  } catch {
    // Offline, proxy fora do ar, JSON inválido: calar. A verificação de versão
    // jamais pode atrapalhar quem está operando.
    return false;
  } finally {
    inFlight = false;
  }
}

/**
 * Liga a vigilância. Idempotente — chamar duas vezes não duplica listeners.
 * @param {{ router?: { afterEach?: Function } }} options
 */
export function startVersionWatch({ router } = {}) {
  if (started) return;
  started = true;

  void checkAppVersion({ force: true });

  globalThis.document?.addEventListener?.('visibilitychange', () => {
    if (globalThis.document?.visibilityState === 'visible') {
      void checkAppVersion();
    }
  });

  globalThis.addEventListener?.('focus', () => {
    void checkAppVersion();
  });

  router?.afterEach?.(() => {
    void checkAppVersion();
  });
}
