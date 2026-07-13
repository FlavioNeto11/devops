// retry.js — retry TRANSITÓRIO para as tools de geração pesada (propose_screens/propose_requirements).
// O LLM barato (gpt-5-nano) às vezes devolve JSON malformado / inventário inválido (LLM_INVALID_JSON);
// re-tentar 2x resolve na maioria. NÃO re-tenta erros determinísticos (auth/input/AI_DISABLED/stack).
// Sem dependências (importável em teste isolado, sem subir o express do routes.js).

export const RETRYABLE_LLM_CODES = new Set(['LLM_INVALID_JSON', 'TOOL_INVALID_OUTPUT']);

// backoff(i) em ms (default 400ms, 1600ms). Injetável p/ teste (backoff: () => 0) — sem timer real que
// dependa de unref (unref faria o event loop drenar antes de disparar e travaria o node:test).
export async function retryLlmTool(label, fn, { attempts = 3, backoff = (i) => 400 * i * i } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); } // sucesso na 1ª (ou n-ésima) tentativa
    catch (err) {
      lastErr = err;
      const code = err && err.code;
      if (!RETRYABLE_LLM_CODES.has(code) || i === attempts) throw err; // não-transitório ou última tentativa
      const sample = (err && err.details && err.details.sample) || (err && err.sample) || '';
      // eslint-disable-next-line no-console
      console.error(`[reqhub-api] ${label} tentativa ${i}/${attempts} falhou (${code}); amostra:`, String(sample).slice(0, 200));
      const ms = backoff(i);
      if (ms > 0) await new Promise((r) => setTimeout(r, ms)); // aguardado dentro da requisição ativa
    }
  }
  throw lastErr;
}
