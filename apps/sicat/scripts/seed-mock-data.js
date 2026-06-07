import { runMigrations } from '../src/db/migrate.ts';
import { ensureBaseData } from '../src/bootstrap/base-data.ts';

await runMigrations();
await ensureBaseData();
console.log('[seed] dados mock garantidos');
process.exit(0);
