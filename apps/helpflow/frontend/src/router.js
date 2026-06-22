// Malha de rotas de DOMÍNIO do HelpFlow. Cada entidade que o backend expõe em
// /v1/<recurso> (apps/helpflow/api/src/server.js) tem seu quarteto de telas:
// lista, criação, detalhe e edição. As Views genéricas Resource* do scaffold
// (placeholder de demo) foram REMOVIDAS — o router referencia apenas telas de
// domínio + dashboard + 404. O catch-all 404 fica SEMPRE por último.
import DashboardView from './views/DashboardView.vue';
import NotFoundView from './views/NotFoundView.vue';
import ForbiddenView from './views/ForbiddenView.vue';

// Chamados (tickets)
import TicketListView from './views/TicketListView.vue';
import TicketCreateView from './views/TicketCreateView.vue';
import TicketDetailView from './views/TicketDetailView.vue';
import TicketEditView from './views/TicketEditView.vue';

// Solicitantes (customers)
import CustomerListView from './views/CustomerListView.vue';
import CustomerCreateView from './views/CustomerCreateView.vue';
import CustomerDetailView from './views/CustomerDetailView.vue';
import CustomerEditView from './views/CustomerEditView.vue';

// Agentes (agents)
import AgentListView from './views/AgentListView.vue';
import AgentCreateView from './views/AgentCreateView.vue';
import AgentDetailView from './views/AgentDetailView.vue';
import AgentEditView from './views/AgentEditView.vue';

// Times (teams)
import TeamListView from './views/TeamListView.vue';
import TeamCreateView from './views/TeamCreateView.vue';
import TeamDetailView from './views/TeamDetailView.vue';
import TeamEditView from './views/TeamEditView.vue';

// Políticas de SLA (sla-policies)
import SlaPolicyListView from './views/SlaPolicyListView.vue';
import SlaPolicyCreateView from './views/SlaPolicyCreateView.vue';
import SlaPolicyDetailView from './views/SlaPolicyDetailView.vue';
import SlaPolicyEditView from './views/SlaPolicyEditView.vue';

// Base de conhecimento (kb-articles)
import KbArticleListView from './views/KbArticleListView.vue';
import KbArticleCreateView from './views/KbArticleCreateView.vue';
import KbArticleDetailView from './views/KbArticleDetailView.vue';
import KbArticleEditView from './views/KbArticleEditView.vue';
import KbSearchView from './views/KbSearchView.vue';

// IA (assistente + plano de controle)
import AiAssistantView from './views/AiAssistantView.vue';
import AiControlView from './views/AiControlView.vue';

// Integrações (integrations)
import IntegrationListView from './views/IntegrationListView.vue';
import IntegrationCreateView from './views/IntegrationCreateView.vue';
import IntegrationDetailView from './views/IntegrationDetailView.vue';
import IntegrationEditView from './views/IntegrationEditView.vue';

// Operação / plataforma
import JobsMonitorView from './views/JobsMonitorView.vue';
import JobDetailView from './views/JobDetailView.vue';
import ObservabilityView from './views/ObservabilityView.vue';
import SettingsView from './views/SettingsView.vue';

export const routes = [
  { path: '/', name: 'dashboard', component: DashboardView },

  { path: '/tickets', name: 'tickets', component: TicketListView },
  { path: '/tickets/new', name: 'ticket-new', component: TicketCreateView },
  { path: '/tickets/:id', name: 'ticket', component: TicketDetailView, props: true },
  { path: '/tickets/:id/edit', name: 'ticket-edit', component: TicketEditView, props: true },

  { path: '/customers', name: 'customers', component: CustomerListView },
  { path: '/customers/new', name: 'customer-new', component: CustomerCreateView },
  { path: '/customers/:id', name: 'customer', component: CustomerDetailView, props: true },
  { path: '/customers/:id/edit', name: 'customer-edit', component: CustomerEditView, props: true },

  // Agentes & RBAC — apenas admin/supervisor (proposta da tela). O backend é a
  // fonte de verdade do RBAC; meta.roles é defesa em profundidade na borda da UI.
  { path: '/agents', name: 'agents', component: AgentListView, meta: { roles: ['admin', 'supervisor'] } },
  { path: '/agents/new', name: 'agent-new', component: AgentCreateView, meta: { roles: ['admin', 'supervisor'] } },
  { path: '/agents/:id', name: 'agent', component: AgentDetailView, props: true, meta: { roles: ['admin', 'supervisor'] } },
  { path: '/agents/:id/edit', name: 'agent-edit', component: AgentEditView, props: true, meta: { roles: ['admin', 'supervisor'] } },

  { path: '/teams', name: 'teams', component: TeamListView, meta: { roles: ['admin', 'supervisor'] } },
  { path: '/teams/new', name: 'team-new', component: TeamCreateView, meta: { roles: ['admin', 'supervisor'] } },
  { path: '/teams/:id', name: 'team', component: TeamDetailView, props: true, meta: { roles: ['admin', 'supervisor'] } },
  { path: '/teams/:id/edit', name: 'team-edit', component: TeamEditView, props: true, meta: { roles: ['admin', 'supervisor'] } },

  { path: '/sla-policies', name: 'sla-policies', component: SlaPolicyListView },
  { path: '/sla-policies/new', name: 'sla-policy-new', component: SlaPolicyCreateView },
  { path: '/sla-policies/:id', name: 'sla-policy', component: SlaPolicyDetailView, props: true },
  { path: '/sla-policies/:id/edit', name: 'sla-policy-edit', component: SlaPolicyEditView, props: true },

  { path: '/kb-articles', name: 'kb-articles', component: KbArticleListView },
  { path: '/kb-articles/new', name: 'kb-article-new', component: KbArticleCreateView },
  { path: '/kb-articles/search', name: 'kb-search', component: KbSearchView },
  { path: '/kb-articles/:id', name: 'kb-article', component: KbArticleDetailView, props: true },
  { path: '/kb-articles/:id/edit', name: 'kb-article-edit', component: KbArticleEditView, props: true },

  { path: '/assistant', name: 'ai-assistant', component: AiAssistantView },
  { path: '/ai-control', name: 'ai-control', component: AiControlView, meta: { roles: ['admin', 'supervisor'] } },

  { path: '/integrations', name: 'integrations', component: IntegrationListView, meta: { roles: ['admin', 'supervisor'] } },
  { path: '/integrations/new', name: 'integration-new', component: IntegrationCreateView, meta: { roles: ['admin', 'supervisor'] } },
  { path: '/integrations/:id', name: 'integration', component: IntegrationDetailView, props: true, meta: { roles: ['admin', 'supervisor'] } },
  { path: '/integrations/:id/edit', name: 'integration-edit', component: IntegrationEditView, props: true, meta: { roles: ['admin', 'supervisor'] } },

  { path: '/jobs', name: 'jobs', component: JobsMonitorView, meta: { roles: ['admin', 'supervisor'] } },
  { path: '/jobs/:id', name: 'job', component: JobDetailView, props: true, meta: { roles: ['admin', 'supervisor'] } },
  { path: '/observability', name: 'observability', component: ObservabilityView, meta: { roles: ['admin', 'supervisor'] } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { roles: ['admin'] } },

  { path: '/403', name: 'forbidden', component: ForbiddenView },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];
