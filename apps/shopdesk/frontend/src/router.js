// Tabela de rotas do ShopDesk — TODAS as telas de domínio construídas registradas aqui.
// O catch-all 404 (NotFoundView) fica SEMPRE por último. Base path /shopdesk/ é aplicado no main.js.
import DashboardView from './views/DashboardView.vue';
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
import InvoiceListView from './views/InvoiceListView.vue';
import InvoiceDetailView from './views/InvoiceDetailView.vue';
import InvoiceEmitView from './views/InvoiceEmitView.vue';
import AiAssistantView from './views/AiAssistantView.vue';
import NotificationListView from './views/NotificationListView.vue';
import UserListView from './views/UserListView.vue';
import UserCreateView from './views/UserCreateView.vue';
import UserEditView from './views/UserEditView.vue';
import StoreSettingsView from './views/StoreSettingsView.vue';
import AuditLogView from './views/AuditLogView.vue';
import TransactionListView from './views/TransactionListView.vue';
import SystemHealthView from './views/SystemHealthView.vue';
import ApiDocsView from './views/ApiDocsView.vue';
import NotFoundView from './views/NotFoundView.vue';
export const routes = [
  // visão geral da loja.
  { path: '/', name: 'dashboard', component: DashboardView },
  // catálogo de produtos — CRUD real api.products (/v1/products).
  { path: '/products', name: 'product-list', component: ProductListView },
  { path: '/products/new', name: 'product-create', component: ProductCreateView },
  { path: '/products/:id', name: 'product-detail', component: ProductDetailView, props: true },
  { path: '/products/:id/edit', name: 'product-edit', component: ProductEditView, props: true },
  // domínio de pedidos (orders) — recurso real api.orders (/v1/orders).
  { path: '/orders', name: 'order-list', component: OrderListView },
  { path: '/orders/new', name: 'order-create', component: OrderCreateView },
  { path: '/orders/:id', name: 'order-detail', component: OrderDetailView, props: true },
  { path: '/orders/:id/edit', name: 'order-edit', component: OrderEditView, props: true },
  // checkout tokenizado/idempotente de um carrinho — :cartId é lido por CheckoutView.
  { path: '/checkout/:cartId', name: 'checkout', component: CheckoutView, props: true },
  // carrinhos — lista (/carts) e detalhe (/carrinhos/:id; CartDetailView lê route.params.id).
  { path: '/carts', name: 'cart-list', component: CartListView },
  { path: '/carrinhos/:id', name: 'cart-detail', component: CartDetailView, props: true },
  // domínio de estoque (inventory) — recurso real api.inventory (/v1/inventory).
  { path: '/inventory', name: 'inventory-list', component: InventoryListView },
  { path: '/inventory/:id', name: 'inventory-detail', component: InventoryDetailView, props: true },
  { path: '/inventory/:id/adjust', name: 'inventory-adjust', component: InventoryAdjustView, props: true },
  // domínio de reposição (reorders) — recurso real api.reorders (/v1/reorders).
  { path: '/reorders', name: 'reorder-list', component: ReorderListView },
  { path: '/reorders/new', name: 'reorder-create', component: ReorderCreateView },
  { path: '/reorders/:id', name: 'reorder-detail', component: ReorderDetailView, props: true },
  // domínio fiscal (NF-e) — lista/detalhe degradam honestamente quando o GET não existir;
  // a emissão usa POST /v1/invoices (api.store.emitInvoice).
  { path: '/invoices', name: 'invoice-list', component: InvoiceListView },
  { path: '/invoices/new', name: 'invoice-emit', component: InvoiceEmitView },
  { path: '/invoices/:id', name: 'invoice-detail', component: InvoiceDetailView, props: true },
  // assistente de IA da loja.
  { path: '/ai', name: 'ai-assistant', component: AiAssistantView },
  // engajamento — notificações multicanal.
  { path: '/notifications', name: 'notification-list', component: NotificationListView },
  // configurações · usuários/equipe — recurso real api.users (/v1/users).
  { path: '/settings/users', name: 'user-list', component: UserListView },
  { path: '/settings/users/new', name: 'user-create', component: UserCreateView },
  { path: '/settings/users/:id/edit', name: 'user-edit', component: UserEditView, props: true },
  // configurações da loja — pagamento/fiscal/notificações/IA (estado de integrações).
  { path: '/settings', name: 'store-settings', component: StoreSettingsView },
  // trilha de auditoria — somente leitura (api.auditLogs, /v1/audit-logs).
  { path: '/audit-logs', name: 'audit-log', component: AuditLogView },
  // transações de pagamento — leitura via api.transactions (defensiva na view).
  { path: '/transactions', name: 'transaction-list', component: TransactionListView },
  // observabilidade — painel de saúde (banco/workers/fila + SLOs).
  { path: '/health', name: 'system-health', component: SystemHealthView },
  // configurações · documentação da API — explorador do contrato OpenAPI (GET /v1/openapi.json).
  { path: '/settings/api-docs', name: 'api-docs', component: ApiDocsView },
  // catch-all 404 — SEMPRE por último.
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];
