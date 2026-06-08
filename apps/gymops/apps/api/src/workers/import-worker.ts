import type { Job } from 'bullmq';
import { createWorker } from '../lib/queues.js';
import { db } from '../lib/prisma.js';
import { generatePreview, commitImport, fetchTrelloBoard } from '../imports/trello/processor.js';
import { decrypt } from '../lib/crypto.js';
import { Prisma } from '@gymops/db';
import type { TrelloBoard, ImportMapping } from '../imports/trello/processor.js';
import type { ImportJob } from '../lib/queues.js';

async function processImportJob(job: Job): Promise<void> {
  const data = job.data as ImportJob;

  const importJob = await db.importJob.findUnique({ where: { id: data.importJobId } });
  if (!importJob) return;

  if (data.type === 'dry_run') {
    try {
      const source = importJob.source as unknown as { mode: string; boards?: TrelloBoard[]; boardIds?: string[] };
      let boards: TrelloBoard[] = [];

      if (source.mode === 'json' && source.boards) {
        boards = source.boards;
      } else if ((source.mode === 'api' || source.mode === 'trello_api') && importJob.integrationAccountId) {
        const account = await db.integrationAccount.findUnique({ where: { id: importJob.integrationAccountId } });
        if (!account) throw new Error('Integration account not found');
        const { apiKey, token } = JSON.parse(decrypt(account.auth as string)) as { apiKey: string; token: string };
        boards = await Promise.all((source.boardIds ?? []).map((id) => fetchTrelloBoard(id, apiKey, token)));
        // Save fetched boards back to source for commit step
        await db.importJob.update({
          where: { id: importJob.id },
          data: { source: { ...source, boards } as unknown as Prisma.InputJsonValue },
        });
      }

      const preview = generatePreview(boards);
      await db.importJob.update({
        where: { id: importJob.id },
        data: { status: 'awaiting_review', summary: { phase: 'preview', ...preview } as unknown as Prisma.InputJsonValue },
      });
    } catch (e) {
      await db.importJob.update({
        where: { id: importJob.id },
        data: { status: 'failed', summary: { phase: 'error', message: String(e) } as unknown as Prisma.InputJsonValue },
      });
    }
    return;
  }

  if (data.type === 'commit') {
    try {
      const source = importJob.source as unknown as { mode: string; boards?: TrelloBoard[]; boardIds?: string[] };
      const mapping = importJob.mapping as unknown as ImportMapping;
      let boards: TrelloBoard[] = source.boards ?? [];

      if (!boards.length && importJob.integrationAccountId) {
        const account = await db.integrationAccount.findUnique({ where: { id: importJob.integrationAccountId } });
        if (account) {
          const { apiKey, token } = JSON.parse(decrypt(account.auth as string)) as { apiKey: string; token: string };
          boards = await Promise.all((source.boardIds ?? []).map((id) => fetchTrelloBoard(id, apiKey, token)));
        }
      }

      const result = await commitImport(boards, mapping, importJob.id, importJob.organizationId, importJob.createdBy);
      await db.importJob.update({
        where: { id: importJob.id },
        data: { status: 'committed', summary: { phase: 'result', ...result } as unknown as Prisma.InputJsonValue },
      });
    } catch (e) {
      await db.importJob.update({
        where: { id: importJob.id },
        data: { status: 'failed', summary: { phase: 'error', message: String(e) } as unknown as Prisma.InputJsonValue },
      });
    }
  }
}

export function startImportWorker(): void {
  const worker = createWorker('imports', processImportJob);
  if (!worker) {
    console.info('[imports] Redis not configured — import jobs run inline');
    return;
  }
  worker.on('failed', (job, err) => {
    console.error(`[imports] Job ${job?.id} failed:`, err.message);
  });
  console.info('[imports] Worker started');
}
