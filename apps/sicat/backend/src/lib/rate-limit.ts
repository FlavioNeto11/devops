/**
 * Rate limit por janela deslizante, em memória.
 *
 * Nasce para o canal conversacional: cada turno custa chamadas de LLM (e, no WhatsApp, o canal é
 * público — qualquer número pode disparar tráfego). Até aqui não havia limite nenhum em nenhuma rota
 * (`grep rate.?limit` no backend só encontrava o retry do gateway CETESB).
 *
 * Em memória é adequado para esta topologia: `sicat-api` roda com **1 réplica** e
 * `strategy: Recreate` (`k8s/backend.yaml`), então não há estado a compartilhar entre processos. Se
 * um dia houver mais de uma réplica, isto vira contagem por réplica e precisa migrar para Postgres
 * ou Redis — está registrado aqui de propósito para que a troca seja consciente.
 */

type Bucket = {
  /** Timestamps (ms) dos hits dentro da janela, em ordem crescente. */
  hits: number[];
};

export type RateLimitDecision = {
  allowed: boolean;
  /** Quantos hits ainda cabem na janela. */
  remaining: number;
  /** Segundos até liberar, quando bloqueado. `0` quando permitido. */
  retryAfterSeconds: number;
};

export type RateLimiter = {
  check(key: string): RateLimitDecision;
  /** Descarta o estado — usado por testes. */
  reset(): void;
};

/**
 * @param limit  máximo de eventos permitidos por janela
 * @param windowMs tamanho da janela em milissegundos
 */
export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, Bucket>();
  // Evita crescimento sem limite se muitas chaves distintas aparecerem (ex.: números aleatórios).
  const MAX_TRACKED_KEYS = 10_000;

  function prune(now: number): void {
    if (buckets.size <= MAX_TRACKED_KEYS) return;
    for (const [key, bucket] of buckets) {
      const newest = bucket.hits.at(-1);
      if (newest === undefined || now - newest > windowMs) {
        buckets.delete(key);
      }
      if (buckets.size <= MAX_TRACKED_KEYS) break;
    }
  }

  return {
    check(key: string): RateLimitDecision {
      const now = Date.now();
      const cutoff = now - windowMs;

      const bucket = buckets.get(key) || { hits: [] };
      // Descarta os hits que saíram da janela.
      const hits = bucket.hits.filter((timestamp) => timestamp > cutoff);

      if (hits.length >= limit) {
        buckets.set(key, { hits });
        // `hits` não é vazio aqui (length >= limit >= 1), mas o tsconfig é estrito com índices.
        const oldest = hits[0] ?? now;
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
        };
      }

      hits.push(now);
      buckets.set(key, { hits });
      prune(now);

      return {
        allowed: true,
        remaining: Math.max(0, limit - hits.length),
        retryAfterSeconds: 0
      };
    },

    reset(): void {
      buckets.clear();
    }
  };
}
