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
    key: 'besc',
    name: 'BESC Tokenização',
    type: 'product_software',
    role: 'Ativos Tokenizados',
    path: '/besc',
    desc: 'Portal de conhecimento e marketplace de títulos tokenizados do caso BESC — investidores, advogados e gestores em portais por perfil.',
    tags: ['tokenização', 'marketplace', 'blockchain'],
    cta: 'Acessar BESC',
    requiresLogin: false,
  },
  {
    key: 'zapbridge',
    name: 'ZapBridge',
    type: 'product_software',
    role: 'Mensageria WhatsApp',
    path: '/zapbridge',
    desc: 'Central de atendimento WhatsApp no navegador: conversas em tempo real, respostas inteligentes, resumos e assistente de IA.',
    tags: ['whatsapp', 'IA', 'PWA'],
    cta: 'Acessar ZapBridge',
    requiresLogin: true,
  },
  {
    key: 'contaviva-360',
    name: 'ContaViva 360',
    type: 'product_software',
    role: 'Gestão Contábil',
    path: '/contaviva-360',
    desc: 'Plataforma de gestão contábil para pessoas e empresas: lançamentos, contas a pagar e receber, documentos e visão fiscal num só lugar.',
    tags: ['contábil', 'financeiro', 'IA'],
    cta: 'Acessar ContaViva 360',
    requiresLogin: true,
  },
  {
    key: 'contaviva-pro',
    name: 'ContaViva Pro',
    type: 'product_software',
    role: 'ERP Contábil',
    path: '/contaviva-pro',
    desc: 'ERP contábil e fiscal com contas e perfis próprios (admin, contador, membro): controle de acesso por perfil e assistente de IA integrado.',
    tags: ['contábil', 'ERP', 'IA'],
    cta: 'Acessar ContaViva Pro',
    requiresLogin: true,
  },
  {
    key: 'imobia',
    name: 'Imobia',
    type: 'product_software',
    role: 'Imobiliário & Fintech',
    path: '/imobia',
    desc: 'Ecossistema imobiliário com IAs especializadas — triagem, negociação, redação e documentos — do lead ao contrato.',
    tags: ['imobiliário', 'fintech', 'IA'],
    cta: 'Acessar Imobia',
    requiresLogin: true,
  },
  {
    key: 'neuroevolui',
    name: 'NeuroEvolui',
    type: 'product_software',
    role: 'Saúde & Clínicas',
    path: '/neuroevolui',
    desc: 'Gestão para clínicas de neuropsicopedagogia: pacientes, evoluções clínicas, agenda, financeiro e pagamentos integrados.',
    tags: ['clínicas', 'agenda', 'pagamentos'],
    cta: 'Acessar NeuroEvolui',
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
    key: 'reqhub',
    name: 'Reqhub',
    type: 'platform_tool',
    path: '/reqs',
    desc: 'Requisitos como fonte da verdade: workbench de specs, mapa de impacto e a Forja de produtos.',
    cta: 'Abrir Reqhub',
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
