import { vi } from 'vitest';

// Mock external services so tests don't need real credentials
vi.mock('../lib/mailer.js', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
  sendActivityAssigned: vi.fn().mockResolvedValue(undefined),
  sendDueReminder: vi.fn().mockResolvedValue(undefined),
  sendOverdueAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/push.js', () => ({
  getVapidPublicKey: vi.fn().mockReturnValue(null),
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/whatsapp.js', () => ({
  sendWhatsApp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/queues.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/queues.js')>();
  return {
    ...actual,
    enqueueNotification: vi.fn().mockResolvedValue(undefined),
    enqueueImport: vi.fn().mockResolvedValue(undefined),
    getNotificationQueue: vi.fn().mockReturnValue(null),
    getImportQueue: vi.fn().mockReturnValue(null),
    createWorker: vi.fn().mockReturnValue(null),
  };
});
