// Boot da fundacao (Fase 0): Postgres -> migrations -> seeds RBAC -> bootstrap user.
// Fail-soft: sem DATABASE_URL/SESSION_SECRET (ou com o banco fora) o portal publico
// continua no ar; rotas gated respondem 503 e NUNCA abrem por falha de infra.
import { config, foundationEnabled } from '../config.js';
import { waitDbReady, startDbWatch, isDbReady } from '../db.js';
import { runMigrations } from '../db/migrate.js';
import { seedRbac, attachIdentity } from './rbac.js';
import { ensureBootstrapUser, installAuthRoutes } from './auth.js';
import { installAdminRoutes } from './admin.js';
import { legacyAuditMiddleware, listAuditEvents } from './audit.js';
import { authorize } from './rbac.js';

export { authorize } from './rbac.js';

export async function bootFoundation() {
  if (!foundationEnabled()) {
    console.warn('[foundation] DESLIGADA (defina DATABASE_URL e SESSION_SECRET) — portal público segue; rotas gated respondem 503');
    return false;
  }
  const ok = await waitDbReady();
  if (!ok) {
    console.error('[foundation] postgres não respondeu no boot — seguindo fail-soft (vigia religa quando voltar)');
    startDbWatch();
    return false;
  }
  if (config.autoMigrate) {
    const { applied } = await runMigrations();
    if (applied.length) console.log(`[foundation] migrations aplicadas: ${applied.join(', ')}`);
  }
  await seedRbac();
  await ensureBootstrapUser();
  startDbWatch();
  console.log('[foundation] identidade/RBAC/auditoria prontos');
  return true;
}

// Middlewares/rotas da fundacao no app Express (ANTES das rotas de negocio).
export function installFoundation(app) {
  app.use(attachIdentity());
  app.use(legacyAuditMiddleware());
  installAuthRoutes(app);
  installAdminRoutes(app);

  // Consulta da trilha p/ o Gestor (export pericial completo chega na Fase 2)
  app.get('/audit/events', authorize('audit:read'), async (req, res) => {
    if (!isDbReady()) return res.status(503).json({ error: 'trilha indisponível no momento' });
    const rows = await listAuditEvents({
      entityType: req.query.entityType, entityId: req.query.entityId,
      eventType: req.query.eventType, limit: req.query.limit, before: req.query.before,
    });
    res.json(rows);
  });
}
