import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlannerToolCallForRecency } from '../../src/services/conversation/llm-provider.js';
import {
  filterManifestsByDateRange,
  selectRecentManifests
} from '../../src/services/conversation/conversation-tool-dispatcher.js';

describe('conversation recency direction normalization', () => {
  it('normaliza pedido de mais antigos para recency_asc sem skip implicito', () => {
    const normalized = normalizePlannerToolCallForRecency({
      toolCall: {
        name: 'orchestrate_manifest_operation',
        arguments: {
          intent: 'manifest.list_recent_top',
          selection: {
            top: 2,
            skipMostRecent: 1
          }
        }
      },
      classifier: {
        entities: {
          top: 2,
          recencyDirection: 'oldest'
        }
      }
    });

    assert.equal(normalized?.arguments?.selection?.orderBy, 'recency_asc');
    assert.equal(normalized?.arguments?.selection?.top, 2);
    assert.equal(normalized?.arguments?.selection?.skipMostRecent, 0);
  });

  it('mantem comportamento padrao para mais recentes quando orderBy nao vier preenchido', () => {
    const normalized = normalizePlannerToolCallForRecency({
      toolCall: {
        name: 'orchestrate_manifest_operation',
        arguments: {
          intent: 'manifest.list_recent_top',
          selection: {
            top: 2
          }
        }
      },
      classifier: {
        entities: {
          top: 2,
          recencyDirection: 'recent'
        }
      }
    });

    assert.equal(normalized?.arguments?.selection?.orderBy, 'recency_desc');
    assert.equal(normalized?.arguments?.selection?.skipMostRecent, 0);
  });

  it('normaliza intervalo temporal para dateFrom/dateTo no intent de listagem', () => {
    const normalized = normalizePlannerToolCallForRecency({
      toolCall: {
        name: 'orchestrate_manifest_operation',
        arguments: {
          intent: 'manifest.list_recent_top',
          selection: {
            top: 4,
            from: '17/04/2026',
            to: '20/04/2026'
          }
        }
      },
      classifier: {
        entities: {
          recencyDirection: 'recent'
        }
      }
    });

    assert.equal(normalized?.arguments?.selection?.dateFrom, '2026-04-17');
    assert.equal(normalized?.arguments?.selection?.dateTo, '2026-04-20');
    assert.equal(normalized?.arguments?.selection?.from, undefined);
    assert.equal(normalized?.arguments?.selection?.to, undefined);
  });

  it('preserva intervalo invertido vindo do classifier/planner para validacao explicita posterior', () => {
    const normalized = normalizePlannerToolCallForRecency({
      toolCall: {
        name: 'orchestrate_manifest_operation',
        arguments: {
          intent: 'manifest.list_recent_top',
          selection: {
            top: 3,
            dateFrom: '2026-04-20',
            dateTo: '2026-04-17'
          }
        }
      },
      classifier: {
        entities: {
          recencyDirection: 'oldest'
        }
      }
    });

    assert.equal(normalized?.arguments?.selection?.dateFrom, '2026-04-20');
    assert.equal(normalized?.arguments?.selection?.dateTo, '2026-04-17');
    assert.equal(normalized?.arguments?.selection?.orderBy, 'recency_asc');
  });
});

describe('manifest dispatcher recency ordering', () => {
  const fixtures = [
    { id: 'man_1', expeditionDate: '2026-04-10', lastSyncAt: null },
    { id: 'man_2', expeditionDate: '2026-04-11', lastSyncAt: null },
    { id: 'man_3', expeditionDate: '2026-04-12', lastSyncAt: null },
    { id: 'man_4', expeditionDate: '2026-04-13', lastSyncAt: null }
  ];

  it('retorna os mais antigos com recency_asc', () => {
    const selected = selectRecentManifests(fixtures, 2, 0, 'recency_asc');
    assert.deepEqual(selected.map((item) => item.id), ['man_1', 'man_2']);
  });

  it('retorna os mais recentes por padrao desc', () => {
    const selected = selectRecentManifests(fixtures, 2, 0, 'recency_desc');
    assert.deepEqual(selected.map((item) => item.id), ['man_4', 'man_3']);
  });

  it('filtra por intervalo explicito 17-20 abril 2026 e aplica orderBy/top', () => {
    const withRange = [
      { id: 'man_5', expeditionDate: '2026-04-17', lastSyncAt: null },
      { id: 'man_6', expeditionDate: '2026-04-18', lastSyncAt: null },
      { id: 'man_7', expeditionDate: '2026-04-19', lastSyncAt: null },
      { id: 'man_8', expeditionDate: '2026-04-20', lastSyncAt: null },
      { id: 'man_9', expeditionDate: '2026-04-21', lastSyncAt: null }
    ];

    const filtered = filterManifestsByDateRange(withRange, '2026-04-17', '2026-04-20');
    const selectedAscTop2 = selectRecentManifests(filtered, 2, 0, 'recency_asc');
    const selectedDescTop2 = selectRecentManifests(filtered, 2, 0, 'recency_desc');

    assert.deepEqual(filtered.map((item) => item.id), ['man_5', 'man_6', 'man_7', 'man_8']);
    assert.deepEqual(selectedAscTop2.map((item) => item.id), ['man_5', 'man_6']);
    assert.deepEqual(selectedDescTop2.map((item) => item.id), ['man_8', 'man_7']);
  });
});
