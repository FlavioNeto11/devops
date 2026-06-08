import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccessToken, verifyAccessToken, createRefreshToken,
  hashPassword, verifyPassword, hashTokenSha256, encryptSecret, decryptSecret,
  validateKeycloakToken, claimsToProfile,
} from '../src/index.js';

const SECRET = 'unit-test-secret';

test('access token: round-trip valido', () => {
  const tok = createAccessToken({ sub: 'u1', email: 'a@b.c' }, { secret: SECRET, ttlSeconds: 60 });
  const r = verifyAccessToken(tok, { secret: SECRET });
  assert.equal(r.valid, true);
  assert.equal(r.payload.sub, 'u1');
  assert.ok(r.payload.iat && r.payload.exp && r.payload.jti);
});

test('access token: prefixo SICAT byte-compativel', () => {
  const tok = createAccessToken({ sub: 'u1' }, { secret: SECRET, prefix: 'sicat_access' });
  assert.ok(tok.startsWith('sicat_access.'));
  assert.equal(verifyAccessToken(tok, { secret: SECRET, prefix: 'sicat_access' }).valid, true);
  // prefixo errado -> formato invalido
  assert.equal(verifyAccessToken(tok, { secret: SECRET }).valid, false);
});

test('access token: assinatura adulterada e segredo errado falham', () => {
  const tok = createAccessToken({ sub: 'u1' }, { secret: SECRET });
  assert.equal(verifyAccessToken(tok + 'x', { secret: SECRET }).valid, false);
  assert.equal(verifyAccessToken(tok, { secret: 'outro' }).valid, false);
});

test('access token: expirado falha', () => {
  const tok = createAccessToken({ sub: 'u1' }, { secret: SECRET, ttlSeconds: -10 });
  const r = verifyAccessToken(tok, { secret: SECRET });
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'TOKEN_EXPIRED');
});

test('refresh token + hash', () => {
  const rt = createRefreshToken({ prefix: 'sicat_refresh' });
  assert.ok(rt.startsWith('sicat_refresh.'));
  assert.equal(hashTokenSha256('x').length, 64);
});

test('password: hash/verify (scrypt_v1)', () => {
  const h = hashPassword('s3nha');
  assert.ok(h.startsWith('scrypt_v1$'));
  assert.equal(verifyPassword('s3nha', h), true);
  assert.equal(verifyPassword('errada', h), false);
});

test('encrypt/decrypt (AES-256-GCM) round-trip', () => {
  const enc = encryptSecret('segredo-cetesb', { secret: SECRET });
  assert.ok(enc.ciphertext && enc.iv && enc.tag);
  assert.equal(decryptSecret(enc, { secret: SECRET }), 'segredo-cetesb');
});

test('validateKeycloakToken: ok com fetch mock', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ email: 'A@B.C ', name: 'Fulano' }) });
  const r = await validateKeycloakToken('tok', { userinfoUrl: 'http://kc/userinfo', fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(claimsToProfile(r.claims).email, 'a@b.c');
  assert.equal(claimsToProfile(r.claims).name, 'Fulano');
});

test('validateKeycloakToken: token vazio e resp nao-ok', async () => {
  assert.equal((await validateKeycloakToken('', { userinfoUrl: 'http://kc' })).code, 'MISSING_TOKEN');
  const bad = async () => ({ ok: false });
  assert.equal((await validateKeycloakToken('t', { userinfoUrl: 'http://kc', fetchImpl: bad })).code, 'INVALID_TOKEN');
});
