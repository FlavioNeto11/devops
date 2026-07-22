import DashboardView from './views/DashboardView.vue';
import ResourceListView from './views/ResourceListView.vue';
import ResourceFormView from './views/ResourceFormView.vue';
import ResourceDetailView from './views/ResourceDetailView.vue';
import AiAssistantView from './views/AiAssistantView.vue';
import NotFoundView from './views/NotFoundView.vue';
import AccountsPayableView from './views/AccountsPayableView.vue';
import AccountsReceivableView from './views/AccountsReceivableView.vue';
import CashFlowView from './views/CashFlowView.vue';
import FinancialDashboardView from './views/FinancialDashboardView.vue';
import FinancialReportsView from './views/FinancialReportsView.vue';

// Painéis por papel (PF/PJ/Contador/Admin) são resolvidos pela raiz '/' (DashboardView) conforme
// o perfil retornado por /me. As rotas diretas /dashboard/<papel> eram becos sem saída: deep-links
// órfãos, fora do nav e sem gating, que trocavam a visão de papel sem contexto nem retorno
// (UX-CV360-002 / UX-CV360-010, Plano Mestre de UX/UI). Enquanto "perfis" não são um recurso de
// produto (decisão D3 adiada), NÃO os expomos como rota navegável: redirecionamos ao painel
// principal, que sempre resolve para uma tela com conteúdo real. As views seguem intactas e são
// montadas pela DashboardView via ROLE_MAP — nada de código de tela foi removido.
const roleDashboardRedirect = { path: '/', query: { painel: 'auto' } };

export const routes = [
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/dashboard/pf', redirect: roleDashboardRedirect },
  { path: '/dashboard/pj', redirect: roleDashboardRedirect },
  { path: '/dashboard/contador', redirect: roleDashboardRedirect },
  { path: '/dashboard/admin', redirect: roleDashboardRedirect },
  { path: '/records', name: 'records', component: ResourceListView },
  { path: '/records/new', name: 'record-new', component: ResourceFormView },
  { path: '/records/:id', name: 'record', component: ResourceDetailView, props: true },
  { path: '/records/:id/edit', name: 'record-edit', component: ResourceFormView, props: true },
  { path: '/assistant', name: 'assistant', component: AiAssistantView },
  { path: '/financial/payable', name: 'accounts-payable', component: AccountsPayableView },
  { path: '/financial/receivable', name: 'accounts-receivable', component: AccountsReceivableView },
  { path: '/financial/cash-flow', name: 'cash-flow', component: CashFlowView },
  { path: '/financial/dashboard', name: 'financial-dashboard', component: FinancialDashboardView },
  { path: '/financial/reports', name: 'financial-reports', component: FinancialReportsView },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];
