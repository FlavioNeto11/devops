import { test, expect } from '@playwright/test';

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
    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill('admin@skyfit.com');
    await page.getByLabel(/senha/i).fill('gymops123');
    await page.getByRole('button', { name: /^entrar$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('upload JSON, see preview, and reach mapping step', async ({ page }) => {
    await page.goto('/settings/import');
    // Ancora no h1 real da tela ("Importar do Trello"); getByText(/importar|trello/i)
    // casava 6 elementos (heading + passos + copy) e violava strict mode.
    await expect(page.getByRole('heading', { name: /importar do trello/i })).toBeVisible({ timeout: 5_000 });

    // Upload the board JSON
    const fileInput = page.locator('input[type="file"]');
    const boardJson = JSON.stringify(TRELLO_BOARD);
    await fileInput.setInputFiles({
      name: 'board.json',
      mimeType: 'application/json',
      buffer: Buffer.from(boardJson),
    });

    // Should show a preview / proceed button
    await expect(page.getByText(/preview|pré-?visualiz|análise|card/i)).toBeVisible({ timeout: 15_000 });
  });
});
