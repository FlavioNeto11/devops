import DashboardView from './views/DashboardView.vue';
import DashboardClientePfView from './views/DashboardClientePfView.vue';
import DashboardClientePjView from './views/DashboardClientePjView.vue';
import DashboardContadorView from './views/DashboardContadorView.vue';
import DashboardAdminView from './views/DashboardAdminView.vue';
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
export const routes = [
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/dashboard/pf', name: 'dashboard-pf', component: DashboardClientePfView },
  { path: '/dashboard/pj', name: 'dashboard-pj', component: DashboardClientePjView },
  { path: '/dashboard/contador', name: 'dashboard-contador', component: DashboardContadorView },
  { path: '/dashboard/admin', name: 'dashboard-admin', component: DashboardAdminView },
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
