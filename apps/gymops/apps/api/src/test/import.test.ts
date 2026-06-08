import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { TrelloBoard } from '../imports/trello/processor.js';
import {
  getApp, closeApp, resetDb, initApp,
  createUser, createOrg, createMembership, createArea,
  loginUser, authHeader, testDb,
} from './helpers.js';

// Override global mock so enqueueImport rejects → inline fallback processing runs
vi.mock('../lib/queues.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/queues.js')>();
  return {
    ...actual,
    enqueueNotification: vi.fn().mockResolvedValue(undefined),
    enqueueImport: vi.fn().mockRejectedValue(new Error('Queue not available in tests')),
    getNotificationQueue: vi.fn().mockReturnValue(null),
    getImportQueue: vi.fn().mockReturnValue(null),
    createWorker: vi.fn().mockReturnValue(null),
  };
});

function makeTrelloBoard(opts: {
  boardId?: string;
  boardName?: string;
  cardCount?: number;
  listName?: string;
  memberEmail?: string;
}): TrelloBoard {
  const boardId = opts.boardId ?? 'board-1';
  const listId = 'list-1';
  const cards = Array.from({ length: opts.cardCount ?? 5 }, (_, i) => ({
    id: `card-${i}`,
    name: `Card ${i + 1}`,
    desc: `Description ${i + 1}`,
    closed: false,
    idList: listId,
    due: null,
    dueComplete: false,
    idMembers: [],
    labels: [],
  }));

  return {
    id: boardId,
    name: opts.boardName ?? 'Test Board',
    desc: '',
    lists: [{ id: listId, name: opts.listName ?? 'Manutenção', closed: false, pos: 0 }],
    cards,
    members: opts.memberEmail
      ? [{ id: 'member-1', username: 'testmember', fullName: 'Test Member', email: opts.memberEmail }]
      : [],
    checklists: [],
    actions: [],
  };
}

describe('Trello Import', () => {
  beforeAll(initApp);
  afterAll(closeApp);
  beforeEach(resetDb);

  async function setup() {
    const app = await getApp();
    const org = await createOrg();
    const owner = await createUser({ email: 'owner@test.com', password: 'pass123' });
    await createMembership(owner.id, org.id, 'organization', org.id, 'owner');
    await createArea(org.id, 'manutencao', 'Estrutura/Manutenção');
    const token = await loginUser(app, 'owner@test.com', 'pass123');
    return { app, org, owner, token };
  }

  async function createJob(
    app: Awaited<ReturnType<typeof getApp>>,
    orgId: string,
    token: string,
    board: TrelloBoard,
  ): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/imports/json',
      headers: authHeader(token),
      payload: { organizationId: orgId, boardData: board },
    });
    expect(res.statusCode).toBe(202);
    return (JSON.parse(res.body) as { data: { id: string } }).data.id;
  }

  // ── Create + dry-run ───────────────────────────────────────────────────────

  it('creates import job and returns 202 for JSON upload', async () => {
    const { app, org, token } = await setup();
    const board = makeTrelloBoard({ cardCount: 5 });
    const jobId = await createJob(app, org.id, token, board);
    expect(jobId).toBeTruthy();
  });

  it('dry-run preview lists boards and card counts', async () => {
    const { app, org, token } = await setup();
    const board = makeTrelloBoard({ cardCount: 10, listName: 'Manutenção' });
    const jobId = await createJob(app, org.id, token, board);

    await new Promise((r) => setTimeout(r, 500));

    const previewRes = await app.inject({
      method: 'GET',
      url: `/imports/${jobId}/preview`,
      headers: authHeader(token),
    });

    expect(previewRes.statusCode).toBe(200);
    const body = JSON.parse(previewRes.body) as {
      data: { preview: { boards: Array<{ stats: { cards: number } }> } };
    };
    expect(body.data.preview.boards[0]?.stats.cards).toBe(10);
  });

  // ── Commit ─────────────────────────────────────────────────────────────────

  it('commit creates activities for all cards', async () => {
    const { app, org, token } = await setup();
    const board = makeTrelloBoard({ cardCount: 50, listName: 'Manutenção' });
    const jobId = await createJob(app, org.id, token, board);

    await new Promise((r) => setTimeout(r, 500));

    const previewRes = await app.inject({
      method: 'GET',
      url: `/imports/${jobId}/preview`,
      headers: authHeader(token),
    });

    const preview = JSON.parse(previewRes.body) as {
      data: {
        preview: {
          boards: Array<{
            trelloBoardId: string;
            lists: Array<{ trelloListId: string; suggestedValue: string }>;
          }>;
        };
      };
    };

    const board0 = preview.data.preview.boards[0]!;
    const mapping = {
      boards: [{
        trelloBoardId: board0.trelloBoardId,
        targetUnitId: null,
        targetUnitName: 'Unidade Importada',
        lists: board0.lists.map((l) => ({
          trelloListId: l.trelloListId,
          type: 'area' as const,
          value: l.suggestedValue ?? 'manutencao',
        })),
      }],
    };

    await app.inject({
      method: 'PATCH',
      url: `/imports/${jobId}/mapping`,
      headers: authHeader(token),
      payload: mapping,
    });

    const commitRes = await app.inject({
      method: 'POST',
      url: `/imports/${jobId}/commit`,
      headers: authHeader(token),
    });
    expect(commitRes.statusCode).toBe(202);

    await new Promise((r) => setTimeout(r, 1000));

    const activities = await testDb.activity.findMany({ where: { organizationId: org.id } });
    expect(activities.length).toBe(50);
  });

  it('wizard remaps list to ignore → cards not imported', async () => {
    const { app, org, token } = await setup();
    const board = makeTrelloBoard({ cardCount: 5, listName: 'Arquivo Janeiro' });
    const jobId = await createJob(app, org.id, token, board);

    await new Promise((r) => setTimeout(r, 500));

    await app.inject({
      method: 'PATCH',
      url: `/imports/${jobId}/mapping`,
      headers: authHeader(token),
      payload: {
        boards: [{
          trelloBoardId: 'board-1',
          targetUnitId: null,
          targetUnitName: 'Unit',
          lists: [{ trelloListId: 'list-1', type: 'ignore', value: null }],
        }],
      },
    });

    await app.inject({
      method: 'POST',
      url: `/imports/${jobId}/commit`,
      headers: authHeader(token),
    });

    await new Promise((r) => setTimeout(r, 1000));

    const activities = await testDb.activity.findMany({ where: { organizationId: org.id } });
    expect(activities.length).toBe(0);
  });

  it('card with checklist preserves checklist items', async () => {
    const { app, org, token } = await setup();
    const board: TrelloBoard = {
      id: 'board-1',
      name: 'Board',
      desc: '',
      lists: [{ id: 'list-1', name: 'Manutenção', closed: false, pos: 0 }],
      cards: [{
        id: 'card-1',
        name: 'Card with checklist',
        desc: '',
        closed: false,
        idList: 'list-1',
        due: null,
        dueComplete: false,
        idMembers: [],
        labels: [],
      }],
      members: [],
      checklists: [{
        id: 'cl-1',
        name: 'Etapas',
        idCard: 'card-1',
        checkItems: [
          { id: 'ci-1', name: 'Step 1', state: 'complete', pos: 0 },
          { id: 'ci-2', name: 'Step 2', state: 'incomplete', pos: 1 },
        ],
      }],
      actions: [],
    };

    const jobId = await createJob(app, org.id, token, board);
    await new Promise((r) => setTimeout(r, 500));

    await app.inject({
      method: 'PATCH',
      url: `/imports/${jobId}/mapping`,
      headers: authHeader(token),
      payload: {
        boards: [{
          trelloBoardId: 'board-1',
          targetUnitId: null,
          targetUnitName: 'Unit',
          lists: [{ trelloListId: 'list-1', type: 'area', value: 'manutencao' }],
        }],
      },
    });

    await app.inject({ method: 'POST', url: `/imports/${jobId}/commit`, headers: authHeader(token) });
    await new Promise((r) => setTimeout(r, 1000));

    const activity = await testDb.activity.findFirst({
      where: { organizationId: org.id },
      include: { checklists: { include: { items: true } } },
    });

    expect(activity?.checklists.length).toBe(1);
    expect(activity?.checklists[0]?.items.length).toBe(2);
    const doneItem = activity?.checklists[0]?.items.find((i) => i.text === 'Step 1');
    expect(doneItem?.done).toBe(true);
  });

  // ── Rollback ───────────────────────────────────────────────────────────────

  it('rollback on failure — zero activities created if commit throws midway', async () => {
    const { app, org, token } = await setup();

    // Board with 2 lists: list-valid (25 cards) processed first, then list-fail (25 cards)
    // whose mapping points to a non-existent unitId → FK violation → full rollback
    const board: TrelloBoard = {
      id: 'board-rollback',
      name: 'Rollback Test',
      desc: '',
      lists: [
        { id: 'list-valid', name: 'Manutenção', closed: false, pos: 0 },
        { id: 'list-fail', name: 'Manutenção 2', closed: false, pos: 1 },
      ],
      cards: [
        ...Array.from({ length: 25 }, (_, i) => ({
          id: `card-valid-${i}`,
          name: `Valid Card ${i + 1}`,
          desc: '',
          closed: false,
          idList: 'list-valid',
          due: null,
          dueComplete: false,
          idMembers: [],
          labels: [],
        })),
        ...Array.from({ length: 25 }, (_, i) => ({
          id: `card-fail-${i}`,
          name: `Fail Card ${i + 1}`,
          desc: '',
          closed: false,
          idList: 'list-fail',
          due: null,
          dueComplete: false,
          idMembers: [],
          labels: [],
        })),
      ],
      members: [],
      checklists: [],
      actions: [],
    };

    const jobId = await createJob(app, org.id, token, board);
    await new Promise((r) => setTimeout(r, 500));

    // Two boardMapping entries for the same board:
    // 1. valid targetUnitId → creates unit, imports 25 cards into tx
    // 2. non-existent targetUnitId → FK violation on unit_areas or activity → throws → tx rolls back all
    await app.inject({
      method: 'PATCH',
      url: `/imports/${jobId}/mapping`,
      headers: authHeader(token),
      payload: {
        boards: [
          {
            trelloBoardId: 'board-rollback',
            targetUnitId: null,
            targetUnitName: 'Valid Unit',
            lists: [{ trelloListId: 'list-valid', type: 'area', value: 'manutencao' }],
          },
          {
            trelloBoardId: 'board-rollback',
            targetUnitId: '00000000-0000-0000-0000-000000000001',
            targetUnitName: 'Invalid Unit',
            lists: [{ trelloListId: 'list-fail', type: 'area', value: 'manutencao' }],
          },
        ],
      },
    });

    await app.inject({
      method: 'POST',
      url: `/imports/${jobId}/commit`,
      headers: authHeader(token),
    });

    // Allow inline setImmediate commit to complete
    await new Promise((r) => setTimeout(r, 1500));

    // Transaction must have rolled back entirely — no activities persisted
    const activities = await testDb.activity.findMany({ where: { organizationId: org.id } });
    expect(activities.length).toBe(0);

    const job = await testDb.importJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('failed');
  });
});
