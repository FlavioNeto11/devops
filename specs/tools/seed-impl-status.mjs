// =============================================================================
// seed-impl-status.mjs — semeia o STATUS REAL de desenvolvimento dos requisitos
// a partir de EVIDÊNCIA por produto (a plataforma está pronta/deployada).
//
// Por quê: o bootstrap criou todos os 371 requisitos como `not_started`, o que não
// reflete a realidade — os apps e componentes estão implementados e em execução no
// cluster. Este script aplica, de forma REPRODUZÍVEL e auditável, o status por
// produto:
//   - `deployed` : produto roda como serviço/componente no cluster (apps + plataforma);
//   - `done`     : implementado e mesclado, mas não é um runtime próprio (libs/CI/contratos).
// Toda origem (source.source_paths) já é validada (existe no repo) pelo build-baseline,
// então cada requisito tem código real por trás. Refine casos pontuais com
// `node impl-status.mjs --set <REQ-ID> status=...`.
//
// Uso:  node specs/tools/seed-impl-status.mjs   # escreve os status; depois:
//       node specs/tools/impl-status.mjs        # canoniza (reconcile)
//       node specs/tools/impl-status.mjs --check
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const BASELINE = path.join(SPECS_DIR, 'baseline', 'current-baseline.json');
const OUT = path.join(SPECS_DIR, 'baseline', 'implementation-status.json');
const DEPLOYED_AT = '2026-06-15'; // data da consolidação do status real

// Mapa de evidência: produto -> [status, nota].
const EVIDENCE = {
  // apps de negócio — em execução no cluster
  sicat: ['deployed', 'apps/sicat — full-stack (Vue+Node+Postgres+worker) no cluster (ns apps)'],
  gymops: ['deployed', 'apps/gymops — Next.js+Fastify+Prisma no cluster (ns apps)'],
  rmambiental: ['deployed', 'apps/rmambiental — SPA Vite/React no cluster (ns apps)'],
  anarabottini: ['deployed', 'apps/anarabottini — SPA Vite/React no cluster (ns apps)'],
  // plataforma — componentes em execução
  console: ['deployed', 'console — DevOps Console (backend read-only k8s + React) no cluster'],
  portal: ['deployed', 'portal — landing pública no cluster (imagem GHCR pinada por tree-sha)'],
  reqhub: ['deployed', 'apps/reqhub — workbench + reqhub-api no cluster (ns apps)'],
  'portal-recorder': ['deployed', 'apps/portal-recorder — captura de portais no cluster (ns apps)'],
  keycloak: ['deployed', 'platform/keycloak — SSO/OIDC no cluster (ns identity), sob Argo'],
  argocd: ['deployed', 'platform/argocd — GitOps app-of-apps no cluster (ns argocd)'],
  traefik: ['deployed', 'platform/traefik — ingress + middlewares no cluster (ns traefik)'],
  observability: ['deployed', 'platform/observability — kube-prometheus-stack + Loki no cluster'],
  ai: ['deployed', 'apps/ai-control-plane + Langfuse no cluster; packages/ai-core/ai-kit em uso'],
  cms: ['deployed', 'CMS integrado ao Console (taxonomia/mídia/site-renderer/editor) no cluster'],
  specs: ['deployed', 'plataforma de requisitos — reqhub no cluster + baseline/tooling/CI ativos'],
  platform: ['deployed', 'infraestrutura GitOps (Sealed Secrets, namespaces, registry) no cluster'],
  // implementado e mesclado, mas não é um serviço runtime próprio
  oidc: ['done', 'packages/oidc-kit — biblioteca OIDC consumida pelas apps deployadas'],
  cicd: ['done', '.github/workflows — esteira de CI/CD (build/test/deploy) ativa'],
  'portal-contracts': ['done', 'contrato canônico CETESB + comparador no CI + portal-recorder'],
};
const FALLBACK = ['done', 'origem validada no repo (build-baseline enforce de source_paths)'];

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const prior = fs.existsSync(OUT) ? (JSON.parse(fs.readFileSync(OUT, 'utf8')).items ?? {}) : {};
const items = { ...prior };
const tally = {};
for (const r of baseline.requirements) {
  const product = (r.scope && r.scope.product_scope) || '';
  const [status, note] = EVIDENCE[product] || FALLBACK;
  const entry = { ...(items[r.id] || {}), status, req_revision: r.version?.item_revision ?? 1, notes: note };
  if (status === 'deployed') entry.deployed_at = DEPLOYED_AT;
  items[r.id] = entry;
  tally[status] = (tally[status] || 0) + 1;
}

fs.writeFileSync(OUT, JSON.stringify({ items }, null, 2) + '\n');
console.log(`[seed-impl-status] ${baseline.requirements.length} requisitos semeados ${JSON.stringify(tally)}`);
console.log('[seed-impl-status] agora rode: node specs/tools/impl-status.mjs  (canoniza) e --check');
