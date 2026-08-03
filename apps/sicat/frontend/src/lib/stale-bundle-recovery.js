/**
 * RECUPERAÇÃO DE SESSÃO PRESA EM BUNDLE ANTIGO — módulo PURO.
 *
 * O problema medido: uma aba aberta há horas continua rodando o bundle da
 * publicação anterior. Quando ela tenta buscar um chunk sob demanda
 * (`import()` de rota lazy, CSS de chunk), o arquivo com aquele hash NÃO EXISTE
 * MAIS no servidor — a resposta é 404 e a SPA fica travada, sem nenhuma saída
 * visível para o operador. Foi essa classe de problema que gerou 14 falsos
 * alarmes numa varredura: telas "quebradas" que eram só a sessão presa.
 *
 * A defesa tem duas metades:
 *  1. `nginx.conf` serve o `index.html` com `Cache-Control: no-store` (o ETag é
 *     REMOVIDO pelo proxy no host público, então não dá para depender de
 *     revalidação por validador).
 *  2. este módulo: quando o carregamento de um chunk falha, a SPA reconhece o
 *     sintoma e RECARREGA, avisando o motivo. Com trava de repetição
 *     (`cooldownMs`) para nunca entrar em laço de reload — se já recarregamos
 *     há pouco, cai para um aviso com ação manual.
 *
 * Aqui fica só a DECISÃO (pura, testável). O efeito (sessionStorage, toast,
 * `location`) vive no `router.js`.
 */

export const STALE_BUNDLE_RELOAD_COOLDOWN_MS = 60000;

export const STALE_BUNDLE_RELOAD_MESSAGE = 'Uma nova versão foi publicada — recarregando a tela.';
export const STALE_BUNDLE_RELOAD_DETAIL =
  'Os arquivos desta sessão saíram do ar com a publicação. Recarregamos automaticamente para você continuar.';

export const STALE_BUNDLE_MANUAL_MESSAGE = 'Não foi possível carregar parte do SICAT.';
export const STALE_BUNDLE_MANUAL_DETAIL =
  'Já tentamos recarregar automaticamente há pouco. Recarregue a página; se continuar, feche e abra o SICAT de novo.';
export const STALE_BUNDLE_ACTION_LABEL = 'Recarregar agora';

/**
 * Assinaturas de "o arquivo pedido não está mais lá" nos navegadores atuais.
 * Chrome/Edge, Firefox e Safari usam textos diferentes para a MESMA falha, e o
 * Vite ainda tem os seus (`preload`, `dynamically imported module`).
 */
const STALE_BUNDLE_PATTERNS = Object.freeze([
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /dynamically imported module/i,
  /importing a module script failed/i,
  /failed to load module script/i,
  /unable to preload css/i,
  /loading (?:css )?chunk \S+ failed/i,
  /chunkloaderror/i,
  /is not a valid javascript mime type/i,
  /expected a javascript(?:-or-wasm)? module script/i
]);

function errorText(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;

  return [error.name, error.code, error.message, error.reason?.message, error.payload?.message]
    .filter((part) => typeof part === 'string' && part)
    .join(' | ');
}

/** O erro é "meu bundle ficou velho e o chunk sumiu"? */
export function isStaleBundleError(error) {
  const text = errorText(error);
  if (!text) return false;
  return STALE_BUNDLE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Decide o que fazer com um erro de navegação/carregamento.
 *
 * @returns {{ action: 'ignore'|'reload'|'prompt', message?: string, detail?: string, actionLabel?: string }}
 */
export function decideStaleBundleRecovery({
  error,
  lastReloadAt = 0,
  now = Date.now(),
  cooldownMs = STALE_BUNDLE_RELOAD_COOLDOWN_MS
} = {}) {
  if (!isStaleBundleError(error)) {
    return { action: 'ignore' };
  }

  const previous = Number(lastReloadAt) || 0;
  const elapsed = now - previous;
  const reloadedRecently = previous > 0 && elapsed >= 0 && elapsed < cooldownMs;

  if (reloadedRecently) {
    // Recarregar de novo agora seria laço: o chunk continuaria faltando.
    return {
      action: 'prompt',
      message: STALE_BUNDLE_MANUAL_MESSAGE,
      detail: STALE_BUNDLE_MANUAL_DETAIL,
      actionLabel: STALE_BUNDLE_ACTION_LABEL
    };
  }

  return {
    action: 'reload',
    message: STALE_BUNDLE_RELOAD_MESSAGE,
    detail: STALE_BUNDLE_RELOAD_DETAIL
  };
}
