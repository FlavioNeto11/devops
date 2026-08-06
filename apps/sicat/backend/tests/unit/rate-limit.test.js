import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../../src/lib/rate-limit.js';

/**
 * Rate limit por janela deslizante — introduzido na fase 0 da cadeia `whatsapp-channel-sicat`, porque
 * até então NENHUMA rota do backend tinha limite e cada turno conversacional custa chamada de LLM.
 */
describe('rate-limit', () => {
  it('permite até o limite e bloqueia o excedente', () => {
    const limiter = createRateLimiter(3, 60_000);

    assert.equal(limiter.check('a').allowed, true);
    assert.equal(limiter.check('a').allowed, true);
    assert.equal(limiter.check('a').allowed, true);

    const blocked = limiter.check('a');
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSeconds >= 1, 'deve informar quando tentar de novo');
  });

  it('conta por chave — um principal não consome a cota de outro', () => {
    const limiter = createRateLimiter(1, 60_000);

    assert.equal(limiter.check('usuario-a').allowed, true);
    assert.equal(limiter.check('usuario-b').allowed, true, 'chave distinta tem cota própria');
    assert.equal(limiter.check('usuario-a').allowed, false);
  });

  it('decrementa `remaining` a cada hit', () => {
    const limiter = createRateLimiter(3, 60_000);

    assert.equal(limiter.check('a').remaining, 2);
    assert.equal(limiter.check('a').remaining, 1);
    assert.equal(limiter.check('a').remaining, 0);
  });

  it('libera quando a janela expira', async () => {
    // Janela curta para não deixar o teste lento.
    const limiter = createRateLimiter(1, 40);

    assert.equal(limiter.check('a').allowed, true);
    assert.equal(limiter.check('a').allowed, false);

    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(limiter.check('a').allowed, true, 'hit antigo saiu da janela');
  });

  it('reset limpa o estado', () => {
    const limiter = createRateLimiter(1, 60_000);

    assert.equal(limiter.check('a').allowed, true);
    assert.equal(limiter.check('a').allowed, false);

    limiter.reset();

    assert.equal(limiter.check('a').allowed, true);
  });
});
