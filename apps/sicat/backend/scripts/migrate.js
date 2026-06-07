import { runMigrations } from '../src/db/migrate.ts';

await runMigrations();
console.log('[migrate] concluído');
process.exit(0);
