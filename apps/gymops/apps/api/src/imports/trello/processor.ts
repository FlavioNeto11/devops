import { Prisma } from '@gymops/db';
import { matchAreaByListName } from './area-matcher.js';
import { db } from '../../lib/prisma.js';

// ── Trello types ──────────────────────────────────────────────────────────────

export interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  lists: TrelloList[];
  cards: TrelloCard[];
  members: TrelloMember[];
  checklists: TrelloChecklist[];
  actions: TrelloAction[];
}

export interface TrelloList { id: string; name: string; closed: boolean; pos: number }

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  closed: boolean;
  idList: string;
  due: string | null;
  dueComplete: boolean;
  idMembers: string[];
  labels: Array<{ id: string; name: string; color: string }>;
}

export interface TrelloMember {
  id: string;
  username: string;
  fullName: string;
  email?: string;
}

export interface TrelloChecklist {
  id: string;
  name: string;
  idCard: string;
  checkItems: Array<{ id: string; name: string; state: 'complete' | 'incomplete'; pos: number }>;
}

export interface TrelloAction {
  id: string;
  type: string;
  date: string;
  data: { text?: string; card?: { id: string } };
  memberCreator: { id: string; fullName: string; email?: string };
}

// ── Preview types ─────────────────────────────────────────────────────────────

export interface ListPreview {
  trelloListId: string;
  trelloListName: string;
  suggestedType: 'area' | 'ignore';
  suggestedValue: string | null;
  confidence: 'high' | 'low';
  cardCount: number;
}

export interface BoardPreview {
  trelloBoardId: string;
  trelloBoardName: string;
  suggestedUnitName: string;
  lists: ListPreview[];
  stats: { cards: number; lists: number; members: number; checklists: number; comments: number };
}

export interface ImportPreview { boards: BoardPreview[] }

// ── Mapping types (user wizard decisions) ────────────────────────────────────

export interface ListMapping {
  trelloListId: string;
  type: 'area' | 'ignore';
  value: string | null; // area key when type = 'area'
}

export interface BoardMapping {
  trelloBoardId: string;
  targetUnitId: string | null;  // null → create new unit
  targetUnitName: string;
  lists: ListMapping[];
}

export interface ImportMapping { boards: BoardMapping[] }

// ── Commit result ─────────────────────────────────────────────────────────────

export interface CommitResult {
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
}

// ── Dry-run ───────────────────────────────────────────────────────────────────

export function generatePreview(boards: TrelloBoard[]): ImportPreview {
  return {
    boards: boards.map((board) => {
      const actions = board.actions ?? [];
      const cards = board.cards ?? [];
      const lists_raw = board.lists ?? [];
      const commentActions = actions.filter((a) => a.type === 'commentCard');
      const activeLists = lists_raw.filter((l) => !l.closed);

      const lists: ListPreview[] = activeLists.map((list) => {
        const cardCount = cards.filter((c) => c.idList === list.id && !c.closed).length;
        const matched = matchAreaByListName(list.name);
        return {
          trelloListId: list.id,
          trelloListName: list.name,
          suggestedType: 'area',
          suggestedValue: matched,
          confidence: matched ? 'high' : 'low',
          cardCount,
        };
      });

      // Add closed lists as 'ignore' suggestion
      lists_raw.filter((l) => l.closed).forEach((list) => {
        lists.push({
          trelloListId: list.id,
          trelloListName: list.name,
          suggestedType: 'ignore',
          suggestedValue: null,
          confidence: 'high',
          cardCount: cards.filter((c) => c.idList === list.id).length,
        });
      });

      return {
        trelloBoardId: board.id,
        trelloBoardName: board.name,
        suggestedUnitName: board.name,
        lists,
        stats: {
          cards: cards.length,
          lists: lists_raw.length,
          members: (board.members ?? []).length,
          checklists: (board.checklists ?? []).length,
          comments: commentActions.length,
        },
      };
    }),
  };
}

// ── Trello API fetcher ────────────────────────────────────────────────────────

export async function fetchTrelloBoards(apiKey: string, token: string): Promise<Array<{ id: string; name: string }>> {
  const url = `https://api.trello.com/1/members/me/boards?key=${apiKey}&token=${token}&fields=id,name&filter=open`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Trello API error: ${res.status}`);
  return res.json() as Promise<Array<{ id: string; name: string }>>;
}

export async function fetchTrelloBoard(boardId: string, apiKey: string, token: string): Promise<TrelloBoard> {
  const params = [
    `key=${apiKey}`,
    `token=${token}`,
    'lists=all',
    'cards=all',
    'members=all',
    'checklists=all',
    'actions=commentCard',
    'fields=id,name,desc',
  ].join('&');
  const res = await fetch(`https://api.trello.com/1/boards/${boardId}?${params}`);
  if (!res.ok) throw new Error(`Trello API error fetching board ${boardId}: ${res.status}`);
  const board = await res.json() as TrelloBoard;
  // Trello includes checklists at board level but cards reference them by id
  return board;
}

// ── Commit ────────────────────────────────────────────────────────────────────

export async function commitImport(
  boards: TrelloBoard[],
  mapping: ImportMapping,
  importJobId: string,
  organizationId: string,
  createdBy: string,
): Promise<CommitResult> {
  return db.$transaction(async (tx) => {
    const result: CommitResult = { created: 0, skipped: 0, failed: 0, errors: [] };
    const orgAreas = await tx.area.findMany({ where: { organizationId } });

    for (const boardMapping of mapping.boards) {
      const board = boards.find((b) => b.id === boardMapping.trelloBoardId);
      if (!board) continue;

      // Build trelloMemberId → gymops userId map
      const memberIdToUserId = new Map<string, string>();
      for (const member of (board.members ?? [])) {
        if (member.email) {
          const user = await tx.user.findUnique({ where: { email: member.email }, select: { id: true } });
          if (user) memberIdToUserId.set(member.id, user.id);
        }
      }

      // Find or create unit
      let unitId: string;
      if (boardMapping.targetUnitId) {
        unitId = boardMapping.targetUnitId;
      } else {
        const existing = await tx.unit.findFirst({
          where: { organizationId, name: boardMapping.targetUnitName, deletedAt: null },
        });
        if (existing) {
          unitId = existing.id;
        } else {
          const newUnit = await tx.unit.create({
            data: { organizationId, name: boardMapping.targetUnitName, status: 'active' },
          });
          unitId = newUnit.id;
          await tx.importItem.create({
            data: { importJobId, sourceType: 'board', sourceId: board.id, targetType: 'unit', targetId: newUnit.id, status: 'mapped' },
          });
        }
      }

      // Track linked areas
      const linkedAreas = new Set(
        (await tx.unitArea.findMany({ where: { unitId }, select: { areaId: true } })).map((ua) => ua.areaId),
      );

      // Process each list mapping
      for (const listMapping of boardMapping.lists) {
        const listCards = (board.cards ?? []).filter((c) => c.idList === listMapping.trelloListId);

        if (listMapping.type === 'ignore' || !listMapping.value) {
          result.skipped += listCards.length;
          continue;
        }

        const area = orgAreas.find((a) => a.key === listMapping.value);
        if (!area) {
          result.skipped += listCards.length;
          result.errors.push(`Area key '${listMapping.value}' not found in org`);
          continue;
        }

        // Ensure unit-area link
        if (!linkedAreas.has(area.id)) {
          await tx.unitArea.upsert({
            where: { unitId_areaId: { unitId, areaId: area.id } },
            create: { unitId, areaId: area.id, enabled: true },
            update: {},
          });
          linkedAreas.add(area.id);
        }

        // Process cards in chunks of 50
        for (let i = 0; i < listCards.length; i += 50) {
          const chunk = listCards.slice(i, i + 50);
          for (const card of chunk) {
            const outcome = await importCard({ tx, card, board, areaId: area.id, unitId, organizationId, createdBy, importJobId, memberIdToUserId });
            if (outcome === 'created') result.created++;
            else result.skipped++;
          }
        }
      }
    }

    return result;
  }, { maxWait: 30_000, timeout: 120_000 });
}

interface ImportCardParams {
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0];
  card: TrelloCard;
  board: TrelloBoard;
  areaId: string;
  unitId: string;
  organizationId: string;
  createdBy: string;
  importJobId: string;
  memberIdToUserId: Map<string, string>;
}

async function importCard({
  tx, card, board, areaId, unitId, organizationId, createdBy, importJobId, memberIdToUserId,
}: ImportCardParams): Promise<'created' | 'skipped'> {
  // Per-job idempotency check
  const existingItem = await tx.importItem.findFirst({
    where: { importJobId, sourceType: 'card', sourceId: card.id },
  });
  if (existingItem) return 'skipped';

  // Cross-job deduplication via import_sources
  const existingSource = await tx.importSource.findFirst({
    where: { organizationId, sourceType: 'trello_card', sourceId: card.id },
  });
  if (existingSource) {
    await tx.importItem.create({
      data: { importJobId, sourceType: 'card', sourceId: card.id, targetType: 'activity', targetId: existingSource.targetId, status: 'skipped' },
    });
    return 'skipped';
  }

  const status = card.closed ? 'cancelado' : (card.dueComplete ?? false) ? 'concluido' : 'novo';

  const activity = await tx.activity.create({
    data: {
      organizationId,
      unitId,
      areaId,
      title: card.name.slice(0, 300),
      description: card.desc || null,
      status: status as never,
      priority: 'media',
      dueAt: card.due ? new Date(card.due) : null,
      visibilityMode: 'inherited',
      metadata: {
        tags: (card.labels ?? []).map((l) => l.name).filter(Boolean),
        importedFrom: 'trello',
      } as Prisma.InputJsonValue,
      createdBy,
    },
  });

  await tx.importItem.create({
    data: { importJobId, sourceType: 'card', sourceId: card.id, targetType: 'activity', targetId: activity.id, status: 'mapped' },
  });

  // Record in import_sources for cross-job deduplication
  await tx.importSource.create({
    data: { organizationId, sourceType: 'trello_card', sourceId: card.id, targetType: 'activity', targetId: activity.id, importJobId },
  });

  // Assignees
  const gymopsUserIds = (card.idMembers ?? [])
    .map((mid) => memberIdToUserId.get(mid))
    .filter((id): id is string => !!id);

  if (gymopsUserIds.length > 0) {
    await tx.activityAssignee.createMany({
      data: gymopsUserIds.map((userId, idx) => ({
        activityId: activity.id,
        userId,
        kind: idx === 0 ? 'responsible' : 'participant',
      })),
      skipDuplicates: true,
    });
  }

  // Checklists
  const cardChecklists = (board.checklists ?? []).filter((cl) => cl.idCard === card.id);
  for (let ci = 0; ci < cardChecklists.length; ci++) {
    const cl = cardChecklists[ci];
    if (!cl) continue;
    const checklist = await tx.activityChecklist.create({
      data: { activityId: activity.id, title: cl.name, order: ci },
    });
    const items = [...cl.checkItems].sort((a, b) => a.pos - b.pos);
    if (items.length > 0) {
      await tx.activityChecklistItem.createMany({
        data: items.map((item, idx) => ({
          checklistId: checklist.id,
          text: item.name.slice(0, 1000),
          done: item.state === 'complete',
          order: idx,
        })),
      });
    }
  }

  // Comments (from Trello actions)
  const comments = (board.actions ?? []).filter(
    (a) => a.type === 'commentCard' && a.data.card?.id === card.id && a.data.text,
  );
  for (const action of comments) {
    const commentUserId = action.memberCreator.email
      ? ((await tx.user.findUnique({ where: { email: action.memberCreator.email }, select: { id: true } }))?.id ?? createdBy)
      : createdBy;

    await tx.activityComment.create({
      data: {
        activityId: activity.id,
        userId: commentUserId,
        body: `[Trello — ${action.memberCreator.fullName}]\n${action.data.text}`,
        createdAt: new Date(action.date),
      },
    });
  }

  // Imported event
  await tx.activityEvent.create({
    data: {
      activityId: activity.id,
      eventType: 'imported',
      payload: { source: 'trello', trelloCardId: card.id } as Prisma.InputJsonValue,
    },
  });

  return 'created';
}
