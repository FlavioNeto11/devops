import 'dotenv/config';
import { startRecurrenceWorker } from './workers/recurrence-worker.js';
import { startNotificationWorker } from './workers/notification-worker.js';
import { startImportWorker } from './workers/import-worker.js';
import { startAiSummaryWorker } from './workers/ai-summary-worker.js';
import { startDelayScanWorker } from './workers/delay-scan-worker.js';

console.log('🔧 Worker process starting...');

startRecurrenceWorker();
startNotificationWorker();
startImportWorker();
startAiSummaryWorker();
startDelayScanWorker();

console.log('✅ All workers started');
