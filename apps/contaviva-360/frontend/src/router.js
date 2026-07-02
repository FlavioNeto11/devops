import DashboardHomeView from './views/DashboardHomeView.vue';
import PfListView from './views/PfListView.vue';
import PfCreateView from './views/PfCreateView.vue';
import PfEditView from './views/PfEditView.vue';
import PfDetailView from './views/PfDetailView.vue';
import PjListView from './views/PjListView.vue';
import PjCreateView from './views/PjCreateView.vue';
import PjEditView from './views/PjEditView.vue';
import PjDetailView from './views/PjDetailView.vue';
import DocumentsListView from './views/DocumentsListView.vue';
import DocumentsCreateView from './views/DocumentsCreateView.vue';
import DocumentsDetailView from './views/DocumentsDetailView.vue';
import FiscalObligationsListView from './views/FiscalObligationsListView.vue';
import FiscalObligationsCreateView from './views/FiscalObligationsCreateView.vue';
import FiscalObligationsEditView from './views/FiscalObligationsEditView.vue';
import FiscalObligationsDetailView from './views/FiscalObligationsDetailView.vue';
import TasksListView from './views/TasksListView.vue';
import TasksCreateView from './views/TasksCreateView.vue';
import TasksEditView from './views/TasksEditView.vue';
import TasksDetailView from './views/TasksDetailView.vue';
import AccountsPayableListView from './views/AccountsPayableListView.vue';
import AccountsPayableCreateView from './views/AccountsPayableCreateView.vue';
import AccountsPayableEditView from './views/AccountsPayableEditView.vue';
import AccountsReceivableListView from './views/AccountsReceivableListView.vue';
import AccountsReceivableCreateView from './views/AccountsReceivableCreateView.vue';
import AccountsReceivableEditView from './views/AccountsReceivableEditView.vue';
import CashFlowView from './views/CashFlowView.vue';
import FinancialReportsView from './views/FinancialReportsView.vue';
import NfClientsListView from './views/NfClientsListView.vue';
import NfClientsCreateView from './views/NfClientsCreateView.vue';
import NfClientsEditView from './views/NfClientsEditView.vue';
import NfClientsDetailView from './views/NfClientsDetailView.vue';
import NfProductsListView from './views/NfProductsListView.vue';
import NfProductsCreateView from './views/NfProductsCreateView.vue';
import NfProductsEditView from './views/NfProductsEditView.vue';
import NfListView from './views/NfListView.vue';
import NfCreateView from './views/NfCreateView.vue';
import NfDetailView from './views/NfDetailView.vue';
import NfReportView from './views/NfReportView.vue';
import AssistantView from './views/AssistantView.vue';
import IncomeExpensesListView from './views/IncomeExpensesListView.vue';
import IncomeExpensesCreateView from './views/IncomeExpensesCreateView.vue';
import IncomeExpensesEditView from './views/IncomeExpensesEditView.vue';
import GatewaysAuditView from './views/GatewaysAuditView.vue';
import AssistantAuditView from './views/AssistantAuditView.vue';
import NotFoundView from './views/NotFoundView.vue';

export const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard-home', component: DashboardHomeView },

  // Clientes PF
  { path: '/pf', name: 'pf-list', component: PfListView },
  { path: '/pf/new', name: 'pf-new', component: PfCreateView },
  { path: '/pf/:id/edit', name: 'pf-edit', component: PfEditView, props: true },
  { path: '/pf/:id', name: 'pf-detail', component: PfDetailView, props: true },

  // Clientes PJ
  { path: '/pj', name: 'pj-list', component: PjListView },
  { path: '/pj/new', name: 'pj-new', component: PjCreateView },
  { path: '/pj/:id/edit', name: 'pj-edit', component: PjEditView, props: true },
  { path: '/dashboard/pj/:id', name: 'pj-detail', component: PjDetailView, props: true },

  // Documentos
  { path: '/documents', name: 'documents-list', component: DocumentsListView },
  { path: '/documents/create', name: 'documents-create', component: DocumentsCreateView },
  { path: '/documents/:id', name: 'documents-detail', component: DocumentsDetailView, props: true },

  // Obrigações Fiscais
  { path: '/fiscal-obligations', name: 'fiscal-obligations-list', component: FiscalObligationsListView },
  { path: '/fiscal-obligations/new', name: 'fiscal-obligations-new', component: FiscalObligationsCreateView },
  { path: '/fiscal-obligations/:id/edit', name: 'fiscal-obligations-edit', component: FiscalObligationsEditView, props: true },
  { path: '/fiscal-obligations/:id', name: 'fiscal-obligations-detail', component: FiscalObligationsDetailView, props: true },

  // Tarefas
  { path: '/tasks', name: 'tasks-list', component: TasksListView },
  { path: '/tasks/new', name: 'tasks-new', component: TasksCreateView },
  { path: '/tasks/:id/edit', name: 'tasks-edit', component: TasksEditView, props: true },
  { path: '/tasks/:id', name: 'tasks-detail', component: TasksDetailView, props: true },

  // Contas a Pagar
  { path: '/accounts-payable', name: 'accounts-payable-list', component: AccountsPayableListView },
  { path: '/accounts-payable/create', name: 'accounts-payable-create', component: AccountsPayableCreateView },
  { path: '/accounts-payable/:id/edit', name: 'accounts-payable-edit', component: AccountsPayableEditView, props: true },

  // Contas a Receber
  { path: '/accounts-receivable', name: 'accounts-receivable-list', component: AccountsReceivableListView },
  { path: '/accounts-receivable/new', name: 'accounts-receivable-new', component: AccountsReceivableCreateView },
  { path: '/accounts-receivable/:id/edit', name: 'accounts-receivable-edit', component: AccountsReceivableEditView, props: true },

  // Financeiro
  { path: '/cash-flow', name: 'cash-flow', component: CashFlowView },
  { path: '/relatorios-financeiros', name: 'financial-reports', component: FinancialReportsView },

  // Receitas e Despesas
  { path: '/income-expenses', name: 'income-expenses-list', component: IncomeExpensesListView },
  { path: '/income-expenses/new', name: 'income-expenses-new', component: IncomeExpensesCreateView },
  { path: '/income-expenses/:id/edit', name: 'income-expenses-edit', component: IncomeExpensesEditView, props: true },

  // Clientes NF
  { path: '/nf-clients', name: 'nf-clients-list', component: NfClientsListView },
  { path: '/nf-clients/new', name: 'nf-clients-new', component: NfClientsCreateView },
  { path: '/nf-clients/:id/edit', name: 'nf-clients-edit', component: NfClientsEditView, props: true },
  { path: '/nf-clients/:id', name: 'nf-clients-detail', component: NfClientsDetailView, props: true },

  // Produtos NF
  { path: '/nf-products', name: 'nf-products-list', component: NfProductsListView },
  { path: '/nf-products/new', name: 'nf-products-new', component: NfProductsCreateView },
  { path: '/nf-products/:id/edit', name: 'nf-products-edit', component: NfProductsEditView, props: true },

  // Notas Fiscais
  { path: '/nf', name: 'nf-list', component: NfListView },
  { path: '/nf/create', name: 'nf-create', component: NfCreateView },
  { path: '/nf/:id', name: 'nf-detail', component: NfDetailView, props: true },
  { path: '/contaviva-360/nf/report', name: 'nf-report', component: NfReportView },

  // Assistente IA
  { path: '/contaviva-360/assistant', name: 'assistant', component: AssistantView },

  // Administracao
  { path: '/contaviva-360/gateways/audit', name: 'gateways-audit', component: GatewaysAuditView },
  { path: '/admin/assistant-audit', name: 'assistant-audit', component: AssistantAuditView },

  // 404 catch-all (deve ser o ultimo)
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];
