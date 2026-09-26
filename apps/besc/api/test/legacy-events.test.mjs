// ADR-010, hardening P1 — eventos da tese antiga (title.*, token.*, market.*, rental.*) só existem
// para ler a trilha histórica; emitir é recusado antes de tocar o banco. O domínio de recuperação
// usa exclusivamente recovery.* e nunca representa Claim/RecognizedRight/RegisteredAsset como `title`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

delete process.env.DATABASE_URL;
const audit = await import('../src/foundation/audit.js');

test('emitir title.updated (e demais famílias legadas) é recusado', async () => {
  for (const t of ['title.updated', 'title.registered', 'title.legal_status.changed', 'token.issuance.requested', 'market.fee.charged', 'rental.contract.created']) {
    await assert.rejects(() => audit.appendAudit({ eventType: t, entityType: 'x', entityId: 'y' }), { code: 'LEGACY_EVENT_REFUSED' });
    const fakeClient = { query: () => { throw new Error('não deveria chegar ao banco'); } };
    await assert.rejects(() => audit.appendAuditTx(fakeClient, { eventType: t, entityType: 'x', entityId: 'y', source: 'test' }), { code: 'LEGACY_EVENT_REFUSED' });
  }
});

test('nenhum evento não-legado usa "title"; o domínio de recuperação emite só recovery.*', () => {
  for (const t of audit.EVENT_TYPES) {
    if (audit.isLegacyEventType(t)) continue;
    assert.ok(!/title|token|tokeniz/i.test(t), `evento vigente com vocabulário legado: ${t}`);
  }
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/recovery');
  const files = (d) => readdirSync(d).flatMap((n) => { const p = path.join(d, n); return statSync(p).isDirectory() ? files(p) : [p]; });
  for (const f of files(root)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/eventType:\s*'([^']+)'/g)) assert.ok(m[1].startsWith('recovery.'), `${path.basename(f)} emite ${m[1]}`);
    assert.ok(!/['"`]title\./.test(src), `${path.basename(f)} referencia evento title.*`);
  }
});
