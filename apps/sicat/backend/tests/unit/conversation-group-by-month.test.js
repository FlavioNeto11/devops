import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupedManifestStats } from '../../src/services/conversation/conversation-tool-dispatcher.js';
import {
  MANIFEST_GROUP_DIMENSIONS,
  validateConversationToolInput
} from '../../src/services/conversation/tools/tool-schemas.js';

// Agrupamento temporal de manifestos (capability declarada da tool
// orchestrate_manifest_operation): o LLM decide dimensão e ordenação via
// schema; o código só computa buckets canônicos e rejeita o resto com erro
// estruturado (nunca fallback silencioso).

function manifest(id, expeditionDate, status = 'cancelled') {
  return { id, status, externalStatus: status, expeditionDate, lastSyncAt: null };
}

describe('agrupamento de manifestos por dimensao temporal', () => {
  const items = [
    manifest('m1', '2026-01-15'),
    manifest('m2', '2026-01-20'),
    manifest('m3', '2026-03-02'),
    manifest('m4', '2026-03-10'),
    manifest('m5', '2026-03-28'),
    manifest('m6', '2026-11-05')
  ];

  it('groupBy=month gera buckets YYYY-MM com totais corretos em ordem cronologica (key_asc)', () => {
    const grouped = buildGroupedManifestStats(items, 'month', 'key_asc');

    assert.deepEqual(
      grouped.map((entry) => ({ group: entry.group, total: entry.total })),
      [
        { group: '2026-01', total: 2 },
        { group: '2026-03', total: 3 },
        { group: '2026-11', total: 1 }
      ]
    );
    assert.deepEqual(grouped.map((entry) => entry.rank), [1, 2, 3]);
    assert.deepEqual(grouped[1].manifestIds, ['m3', 'm4', 'm5']);
  });

  it('groupBy=month com count_desc ordena por volume (ranking)', () => {
    const grouped = buildGroupedManifestStats(items, 'month', 'count_desc');

    assert.deepEqual(
      grouped.map((entry) => entry.group),
      ['2026-03', '2026-01', '2026-11']
    );
  });

  it('groupBy=year gera buckets YYYY', () => {
    const grouped = buildGroupedManifestStats(
      items.concat(manifest('m7', '2025-12-31')),
      'year',
      'key_asc'
    );

    assert.deepEqual(
      grouped.map((entry) => ({ group: entry.group, total: entry.total })),
      [
        { group: '2025', total: 1 },
        { group: '2026', total: 6 }
      ]
    );
  });

  it('item sem data cai no bucket data_nao_informada (mesmo padrao do groupBy=date)', () => {
    const grouped = buildGroupedManifestStats(
      [manifest('m1', '2026-02-01'), manifest('m2', null)],
      'month',
      'key_asc'
    );

    assert.deepEqual(
      grouped.map((entry) => entry.group).sort(),
      ['2026-02', 'data_nao_informada']
    );
  });

  it('groupBy=status continua com ranking por volume por padrao (regressao)', () => {
    const mixed = [
      manifest('m1', '2026-01-01', 'cancelled'),
      manifest('m2', '2026-01-02', 'cancelled'),
      manifest('m3', '2026-01-03', 'received')
    ];
    const grouped = buildGroupedManifestStats(mixed, 'status');

    assert.deepEqual(
      grouped.map((entry) => ({ group: entry.group, total: entry.total })),
      [
        { group: 'cancelled', total: 2 },
        { group: 'received', total: 1 }
      ]
    );
  });

  it('dimensao desconhecida NAO cai em fallback: lanca erro estruturado com as dimensoes validas', () => {
    assert.throws(
      () => buildGroupedManifestStats(items, 'fase_da_lua'),
      (error) => {
        assert.match(error.message, /fase_da_lua/);
        assert.match(error.message, /month/);
        return true;
      }
    );
  });
});

describe('validacao Zod de selection.groupBy/groupOrder (erro estruturado para o LLM)', () => {
  it('aceita valores canonicos e normaliza case (sintatico, nao semantico)', () => {
    const parsed = validateConversationToolInput('orchestrate_manifest_operation', {
      intent: 'manifest.group_recent_top',
      selection: { groupBy: 'Month', groupOrder: 'KEY_ASC' }
    });

    assert.equal(parsed.selection.groupBy, 'month');
    assert.equal(parsed.selection.groupOrder, 'key_asc');
  });

  it('rejeita sinonimo nao canonico ("mes") com mensagem que lista as dimensoes para o LLM re-planejar', () => {
    assert.throws(
      () => validateConversationToolInput('orchestrate_manifest_operation', {
        intent: 'manifest.group_recent_top',
        selection: { groupBy: 'mes' }
      }),
      (error) => {
        assert.match(String(error.message), /groupBy/);
        return true;
      }
    );
  });

  it('argumentos dos demais intents continuam passthrough (sem regressao)', () => {
    const parsed = validateConversationToolInput('orchestrate_manifest_operation', {
      intent: 'manifest.list_recent_top',
      selection: { top: 3, dateFrom: '2026-01-01' },
      confirmed: false
    });

    assert.equal(parsed.selection.top, 3);
    assert.equal(parsed.confirmed, false);
  });

  it('o contrato exposto ao LLM cobre month e year', () => {
    assert.ok(MANIFEST_GROUP_DIMENSIONS.includes('month'));
    assert.ok(MANIFEST_GROUP_DIMENSIONS.includes('year'));
  });
});
