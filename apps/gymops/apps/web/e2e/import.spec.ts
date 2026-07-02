import { test, expect } from '@playwright/test';
import { PROFILES, loginAs } from './smoke/fixtures';

// BUG-014: do NOT use `fileURLToPath(import.meta.url)` here — @gymops/web is CJS
// and the @playwright/test transpiler emits incompatible code, aborting the whole
// test collection (0 tests run). The derived `__dirname` was dead code anyway
// (the fixture is inline and uploaded via Buffer, no filesystem access needed).

// Minimal Trello board fixture for E2E
const TRELLO_BOARD = {
  id: 'e2e-board-1',
  name: 'E2E Test Board',
  lists: [
    { id: 'list-1', name: 'A Fazer', closed: false },
    { id: 'list-2', name: 'Concluído', closed: false },
  ],
  cards: [
    { id: 'card-1', name: 'Tarefa E2E 1', desc: '', idList: 'list-1', closed: false, due: null, labels: [], checklists: [], attachments: [], members: [] },
    { id: 'card-2', name: 'Tarefa E2E 2', desc: 'Descrição', idList: 'list-2', closed: false, due: null, labels: [], checklists: [], attachments: [], members: [] },
  ],
  labels: [],
  members: [],
};

test.describe('Trello Import', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, PROFILES.owner);
  });

  test('upload JSON, see preview, and reach mapping step', async ({ page }) => {
    await page.goto('/settings/import');
    // Page heading is "Importar do Trello" (settings/import/page.tsx) — a broad
    // getByText(/importar|trello/i) is strict-unsafe (matches 6+ elements).
    await expect(page.getByRole('heading', { name: /importar do trello/i })).toBeVisible({ timeout: 5_000 });

    // Upload the board JSON (source step defaults to "Arquivo JSON" mode)
    const fileInput = page.locator('input[type="file"]');
    const boardJson = JSON.stringify(TRELLO_BOARD);
    await fileInput.setInputFiles({
      name: 'board.json',
      mimeType: 'application/json',
      buffer: Buffer.from(boardJson),
    });

    // Dry-run runs and the wizard reaches the MAPPING step — its unique copy is
    // "Revise o mapeamento..." (the stepper labels like "3. Análise" are always
    // in the DOM, so they cannot prove progress).
    await expect(page.getByText(/revise o mapeamento/i)).toBeVisible({ timeout: 15_000 });
  });
});
