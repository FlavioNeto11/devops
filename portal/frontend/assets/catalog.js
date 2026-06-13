/* =============================================================================
 * NovaIT — Catálogo de aplicações e ferramentas do portal
 * -----------------------------------------------------------------------------
 * Fonte única, declarativa, da lista curada que aparece no portal. Antes os
 * cards eram HTML hardcoded; agora os metadados vivem aqui (config-driven), o
 * HTML estático os espelha (bom para SEO/no-JS) e o portal.js usa este catálogo
 * para (a) deduplicar apps descobertos dinamicamente no cluster e (b) enriquecer
 * cada card com status ao vivo (no ar / exige login) lido da API do Console.
 *
 * ESM puro: sem dependência de DOM. Importável por portal.js (browser) e pelos
 * testes (node:test). Para adicionar um app novo ao portal basta acrescentar uma
 * entrada aqui e o card estático correspondente em index.html.
 * ========================================================================== */

/** Tipos de aplicação (espelha a taxonomia do Console em lib/appTypes.js). */
export const APP_TYPES = {
  product_software: { label: 'Produto', short: 'Produto' },
  cms_portal: { label: 'Portal CMS', short: 'CMS' },
  platform_tool: { label: 'Ferramenta', short: 'Interno' },
};

/**
 * Produtos e portais curados (cards principais). `path` é o base path que o
 * Traefik roteia; usado para casar com as IngressRoutes vivas do cluster.
 * `requiresLogin` controla o selo "exige login".
 */
export const PRODUCTS = [
  {
    key: 'sicat',
    name: 'SICAT',
    type: 'product_software',
    role: 'Gestão Ambiental',
    path: '/sicat',
    desc: 'Licenciamento ambiental, MTR e conformidade regulatória (CETESB) com assistente conversacional de IA que orienta o operador.',
    tags: ['ambiental', 'IA', 'CETESB·MTR'],
    cta: 'Acessar SICAT',
    requiresLogin: true,
  },
  {
    key: 'gymops',
    name: 'GymOps',
    type: 'product_software',
    role: 'Gestão Operacional',
    path: '/gymops',
    desc: 'Gestão operacional multiunidade para academias: atividades, checklists inteligentes e uma IA assistiva que cria e acompanha tudo.',
    tags: ['multiunidade', 'IA', 'PWA·Next.js'],
    cta: 'Acessar GymOps',
    requiresLogin: true,
  },
  {
    key: 'rmambiental',
    name: 'RM Ambiental',
    type: 'cms_portal',
    role: 'Portal Institucional',
    path: '/rmambiental',
    desc: 'Portal institucional premium da RM Ambiental Brasil — soluções ambientais, georreferenciamento, galeria de projetos e contato.',
    tags: ['institucional', 'CMS', 'SPA React'],
    cta: 'Acessar portal RM Ambiental',
    requiresLogin: false,
  },
  {
    key: 'anarabottini',
    name: 'Ana Rabottini',
    type: 'cms_portal',
    role: 'Saúde Mental Corporativa',
    path: '/anarabottini',
    desc: 'Palestras, materiais e consultoria educativa em saúde mental no trabalho, neurodiversidade e adequação à NR-1 — para RH, SESMT e lideranças.',
    tags: ['saúde mental', 'CMS', 'SPA React'],
    cta: 'Acessar portal Ana Rabottini',
    requiresLogin: false,
  },
];

/** Ferramentas internas da plataforma. `external: false` = mesmo domínio/subpath. */
export const TOOLS = [
  {
    key: 'devops',
    name: 'DevOps Console',
    type: 'platform_tool',
    path: '/devops',
    desc: 'Pods, deployments, rotas e logs do cluster em tempo real.',
    cta: 'Abrir DevOps Console',
    requiresLogin: true,
    scope: 'internal',
  },
  {
    key: 'grafana',
    name: 'Grafana',
    type: 'platform_tool',
    path: '/grafana',
    desc: 'Métricas e observabilidade: CPU, memória, pods e serviços.',
    cta: 'Abrir Grafana',
    requiresLogin: true,
    scope: 'internal',
  },
  {
    key: 'argocd',
    name: 'Argo CD',
    type: 'platform_tool',
    path: '/argocd',
    desc: 'Entrega contínua GitOps: sync e histórico de implantações.',
    cta: 'Abrir Argo CD',
    requiresLogin: true,
    scope: 'internal',
  },
  {
    key: 'keycloak',
    name: 'Keycloak',
    type: 'platform_tool',
    path: '/auth',
    desc: 'Identidade e Single Sign-On (OIDC) unificado.',
    cta: 'Abrir Keycloak',
    requiresLogin: true,
    scope: 'internal',
  },
  {
    key: 'portal-rec',
    name: 'Portal Recorder',
    type: 'platform_tool',
    path: '/portal-rec',
    desc: 'Captura portais externos num browser remoto e gera contratos de API para automação.',
    cta: 'Abrir Portal Recorder',
    requiresLogin: true,
    scope: 'internal',
  },
];

/** Todos os base paths curados (produtos + ferramentas). Usado para dedupe. */
export function curatedPaths() {
  return [...PRODUCTS, ...TOOLS].map((a) => a.path);
}

/** Lookup path -> entrada do catálogo (produto ou ferramenta). */
export function catalogByPath() {
  const map = {};
  for (const a of [...PRODUCTS, ...TOOLS]) map[a.path] = a;
  return map;
}
