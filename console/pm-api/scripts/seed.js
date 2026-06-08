import { query } from '../src/db/pool.js';

// Projetos atuais da plataforma. Fonte: docs/standards/fr/<app>.md (estado pronto/falta).
const PROJECTS = [
  { key: 'sicat', name: 'SICAT', stack: 'Vue 3 / Node+Express / PostgreSQL', repo_url: 'apps/sicat', route: '/sicat', k8s_label_selector: 'sicat', status: 'active', description: 'Gestao ambiental e conformidade (CETESB/MTR/DMR) com IA conversacional.' },
  { key: 'gymops', name: 'GymOps', stack: 'Next.js 14 / Fastify / Postgres+pgvector / Redis', repo_url: 'apps/gymops', route: '/gymops', k8s_label_selector: 'gymops', status: 'active', description: 'Gestao operacional multiunidade com IA assistiva.' },
  { key: 'rmambiental', name: 'RM Ambiental', stack: 'React + Vite (estatico)', repo_url: 'apps/rmambiental', route: '/rmambiental', k8s_label_selector: 'rmambiental', status: 'active', description: 'Portal institucional premium.' },
];

// [type, title, status, priority]
const ITEMS = {
  sicat: [
    ['feature', 'Autenticacao propria + OIDC Keycloak', 'done', 'P1'],
    ['feature', 'MTR provisorio (criar/listar/cancelar/imprimir)', 'done', 'P1'],
    ['feature', 'DMR declaratorio (CRUD + consolidar + submeter)', 'done', 'P1'],
    ['feature', 'IA conversacional (gpt-5-nano) + RAG', 'done', 'P2'],
    ['evolution', 'Centro Operacional SICAT (observabilidade/diagnostico)', 'todo', 'P1'],
    ['feature', 'Gateway HAR real da CETESB para DMR (hoje stub 503)', 'todo', 'P1'],
    ['feature', 'Chat orquestrador (Command Center)', 'backlog', 'P2'],
  ],
  gymops: [
    ['feature', 'IA assistiva (criar atividade/checklist + chat)', 'done', 'P1'],
    ['bug', 'Checklist sugerido pela IA nao vinculava a atividade', 'done', 'P1'],
    ['feature', 'Import Trello (dedupe) + WhatsApp', 'done', 'P2'],
    ['feature', 'Consome @flavioneto11/ai-kit (contrato gpt-5 compartilhado)', 'done', 'P2'],
    ['bug', 'CORS com localhost hardcoded como fallback (BUG-010)', 'todo', 'P1'],
    ['evolution', 'Arquivo .env.docker.public.example separado (OPS-005)', 'todo', 'P1'],
    ['evolution', 'Integrar Sentry (OPS-006)', 'backlog', 'P2'],
    ['evolution', 'Indices Postgres de performance (OPS-007)', 'backlog', 'P2'],
    ['feature', 'Endpoint /admin/queues/stats (OPS-008)', 'backlog', 'P2'],
    ['evolution', 'Documentacao OpenAPI (OPS-009)', 'backlog', 'P2'],
  ],
  rmambiental: [
    ['feature', 'Portal institucional completo (hero/servicos/galeria/contato)', 'done', 'P2'],
    ['feature', 'Tema claro/escuro (claro por padrao)', 'done', 'P3'],
  ],
};

/** Idempotente: upsert de projetos por `key`; itens inseridos por (project, title) se ausentes. */
export async function seed() {
  let projects = 0;
  let itemsInserted = 0;
  for (const p of PROJECTS) {
    const { rows } = await query(
      `INSERT INTO projects (key,name,stack,repo_url,route,k8s_label_selector,status,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (key) DO UPDATE SET
         name=EXCLUDED.name, stack=EXCLUDED.stack, repo_url=EXCLUDED.repo_url, route=EXCLUDED.route,
         k8s_label_selector=EXCLUDED.k8s_label_selector, status=EXCLUDED.status,
         description=EXCLUDED.description, updated_at=now()
       RETURNING id`,
      [p.key, p.name, p.stack, p.repo_url, p.route, p.k8s_label_selector, p.status, p.description],
    );
    const projectId = rows[0].id;
    projects += 1;
    for (const [type, title, status, priority] of ITEMS[p.key] || []) {
      const ins = await query(
        `INSERT INTO items (project_id,type,title,status,priority)
         SELECT $1,$2,$3,$4,$5
         WHERE NOT EXISTS (SELECT 1 FROM items WHERE project_id=$1 AND title=$3)
         RETURNING id`,
        [projectId, type, title, status, priority],
      );
      if (ins.rowCount) itemsInserted += 1;
    }
  }
  const out = { projects, itemsInserted };
  console.info('[seed]', JSON.stringify(out));
  return out;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  seed().then(() => process.exit(0)).catch((e) => {
    console.error('[seed] falhou:', e);
    process.exit(1);
  });
}
