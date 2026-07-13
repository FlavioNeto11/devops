// Smoke de resolução de dependências novas (pg + oidc-kit vendorado).
import test from 'node:test';
import assert from 'node:assert/strict';

test('oidc-kit resolve e exporta a superfície esperada', async () => {
  const kit = await import('@flavioneto11/oidc-kit');
  for (const fn of ['createAccessToken', 'verifyAccessToken', 'createRefreshToken', 'hashPassword', 'verifyPassword', 'hashTokenSha256', 'validateKeycloakToken', 'requireSession']) {
    assert.equal(typeof kit[fn], 'function', `export ausente: ${fn}`);
  }
});

test('pg resolve com Pool', async () => {
  const pg = (await import('pg')).default;
  assert.equal(typeof pg.Pool, 'function');
});
