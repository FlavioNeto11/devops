// Tabela de rotas do ShopDesk — TODAS as telas construídas registradas aqui.
// O catch-all 404 (NotFoundView) fica SEMPRE por último. Base path /shopdesk/ é aplicado no main.js.
import DashboardView from './views/DashboardView.vue';
import RecordListView from './views/RecordListView.vue';
import RecordDetailView from './views/RecordDetailView.vue';
import LojaView from './views/LojaView.vue';
import ProductListView from './views/ProductListView.vue';
import ProductCreateView from './views/ProductCreateView.vue';
import ProductDetailView from './views/ProductDetailView.vue';
import ProductEditView from './views/ProductEditView.vue';
import OrderListView from './views/OrderListView.vue';
import OrderCreateView from './views/OrderCreateView.vue';
import OrderDetailView from './views/OrderDetailView.vue';
import OrderEditView from './views/OrderEditView.vue';
import CheckoutView from './views/CheckoutView.vue';
import CartListView from './views/CartListView.vue';
import CartDetailView from './views/CartDetailView.vue';
import InventoryListView from './views/InventoryListView.vue';
import InventoryDetailView from './views/InventoryDetailView.vue';
import InventoryAdjustView from './views/InventoryAdjustView.vue';
import ReorderListView from './views/ReorderListView.vue';
import ReorderCreateView from './views/ReorderCreateView.vue';
import ReorderDetailView from './views/ReorderDetailView.vue';
import TransactionListView from './views/TransactionListView.vue';
import InvoiceListView from './views/InvoiceListView.vue';
import InvoiceEmitView from './views/InvoiceEmitView.vue';
import InvoiceDetailView from './views/InvoiceDetailView.vue';
import InvoiceEditView from './views/InvoiceEditView.vue';
import AiAssistantView from './views/AiAssistantView.vue';
import NotificationListView from './views/NotificationListView.vue';
import SystemHealthView from './views/SystemHealthView.vue';
import StoreSettingsView from './views/StoreSettingsView.vue';
import UserListView from './views/UserListView.vue';
import UserCreateView from './views/UserCreateView.vue';
import UserEditView from './views/UserEditView.vue';
import AuditLogView from './views/AuditLogView.vue';
import ApiDocsView from './views/ApiDocsView.vue';
import NotFoundView from './views/NotFoundView.vue';
export const routes = [
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/loja', name: 'loja', component: LojaView },
  // assistente de IA da loja — rota /ai (link da sidebar). /assistant fica como alias histórico.
  { path: '/ai', name: 'ai-assistant', component: AiAssistantView },
  { path: '/assistant', name: 'assistant', component: AiAssistantView },
  // recurso genérico de registros (gerado pela Forge) — mantido para compatibilidade.
  { path: '/records', name: 'records', component: RecordListView },
  { path: '/records/:id', name: 'record', component: RecordDetailView, props: true },
  // catálogo de produtos — CRUD real api.products (/v1/products).
  { path: '/products', name: 'products', component: ProductListView },
  { path: '/products/new', name: 'product-new', component: ProductCreateView },
  { path: '/products/:id', name: 'product', component: ProductDetailView, props: true },
  { path: '/products/:id/edit', name: 'product-edit', component: ProductEditView, props: true },
  // domínio de pedidos (orders) — recurso real api.orders (/v1/orders).
  { path: '/orders', name: 'orders', component: OrderListView },
  { path: '/orders/new', name: 'order-new', component: OrderCreateView },
  { path: '/orders/:id', name: 'order', component: OrderDetailView, props: true },
  { path: '/orders/:id/edit', name: 'order-edit', component: OrderEditView, props: true },
  // checkout tokenizado/idempotente de um carrinho — :cartId é lido por CheckoutView.
  { path: '/checkout/:cartId', name: 'checkout', component: CheckoutView, props: true },
  // carrinhos — lista (/carts) e detalhe (/carrinhos/:id; CartDetailView lê route.params.id).
  { path: '/carts', name: 'carts', component: CartListView },
  { path: '/carrinhos/:id', name: 'cart', component: CartDetailView, props: true },
  // domínio de estoque (inventory) — recurso real api.inventory (/v1/inventory).
  { path: '/inventory', name: 'inventory', component: InventoryListView },
  { path: '/inventory/:id', name: 'inventory-item', component: InventoryDetailView, props: true },
  { path: '/inventory/:id/adjust', name: 'inventory-adjust', component: InventoryAdjustView, props: true },
  // domínio de reposição (reorders) — recurso real api.reorders (/v1/reorders).
  { path: '/reorders', name: 'reorders', component: ReorderListView },
  { path: '/reorders/new', name: 'reorder-new', component: ReorderCreateView },
  { path: '/reorders/:id', name: 'reorder', component: ReorderDetailView, props: true },
  // transações de pagamento — leitura via api.transactions (defensiva na view).
  { path: '/transactions', name: 'transactions', component: TransactionListView },
  // domínio fiscal (NF-e) — backend REAL expõe só POST /v1/invoices (emissão/reemissão via
  // api.store.emitInvoice). Lista/detalhe degradam honestamente quando GET não existir.
  { path: '/invoices', name: 'invoices', component: InvoiceListView },
  { path: '/invoices/new', name: 'invoice-new', component: InvoiceEmitView },
  { path: '/invoices/:id', name: 'invoice', component: InvoiceDetailView, props: true },
  { path: '/invoices/:id/edit', name: 'invoice-edit', component: InvoiceEditView, props: true },
  // engajamento — notificações multicanal (api.notifications ou api.store.notifications()).
  { path: '/notifications', name: 'notifications', component: NotificationListView },
  // observabilidade — painel de saúde (banco/workers/fila + SLOs). Lê SÓ /health e /v1/health/jobs.
  { path: '/health', name: 'system-health', component: SystemHealthView },
  // configurações da loja — pagamento/fiscal/notificações/IA (estado de integrações).
  { path: '/settings', name: 'store-settings', component: StoreSettingsView },
  // configurações · usuários/equipe — recurso real api.users (/v1/users).
  { path: '/settings/users', name: 'users', component: UserListView },
  { path: '/settings/users/new', name: 'user-create', component: UserCreateView },
  { path: '/settings/users/:id', name: 'user-edit', component: UserEditView, props: true },
  // configurações · documentação da API — explorador do contrato OpenAPI (GET /v1/openapi.json).
  { path: '/settings/api-docs', name: 'api-docs', component: ApiDocsView },
  // trilha de auditoria — somente leitura (api.auditLogs, /v1/audit-logs).
  { path: '/auditoria', name: 'audit-log', component: AuditLogView },
  // catch-all 404 — SEMPRE por último.
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];
