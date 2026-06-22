import DashboardView from './views/DashboardView.vue';

import ProductListView from './views/ProductListView.vue';
import ProductCreateView from './views/ProductCreateView.vue';
import ProductDetailView from './views/ProductDetailView.vue';
import ProductEditView from './views/ProductEditView.vue';

import OrderListView from './views/OrderListView.vue';
import OrderDetailView from './views/OrderDetailView.vue';

import AlertListView from './views/AlertListView.vue';

import NotificationListView from './views/NotificationListView.vue';
import NotificationDetailView from './views/NotificationDetailView.vue';

import ChannelListView from './views/ChannelListView.vue';
import ChannelCreateView from './views/ChannelCreateView.vue';
import ChannelEditView from './views/ChannelEditView.vue';

import SupplierListView from './views/SupplierListView.vue';
import SupplierCreateView from './views/SupplierCreateView.vue';
import SupplierDetailView from './views/SupplierDetailView.vue';
import SupplierEditView from './views/SupplierEditView.vue';

import AuditListView from './views/AuditListView.vue';
import AuditDetailView from './views/AuditDetailView.vue';

import QueueHealthView from './views/QueueHealthView.vue';
import AiAssistantView from './views/AiAssistantView.vue';

import NotFoundView from './views/NotFoundView.vue';

// Rotas de DOMÍNIO do StockPilot (sem placeholders do scaffold). Todas as telas reais do
// app são registradas aqui para serem alcançáveis: os links que cada tela emite
// (/products, /products/:id, /orders, /alerts, /notifications, /channels, /suppliers,
// /audit) resolvem para a view real — nada cai mais no catch-all (NotFoundView).
// Sem rota placeholder do scaffold: o router referencia SÓ views de domínio + dashboard + 404.
export const routes = [
  { path: '/', name: 'dashboard', component: DashboardView },

  // Produtos (catálogo + ciclo CRUD)
  { path: '/products', name: 'products', component: ProductListView },
  { path: '/products/new', name: 'product-new', component: ProductCreateView },
  { path: '/products/:id', name: 'product', component: ProductDetailView, props: true },
  { path: '/products/:id/edit', name: 'product-edit', component: ProductEditView, props: true },

  // Pedidos de reposição (fila assíncrona + detalhe/DLQ)
  { path: '/orders', name: 'orders', component: OrderListView },
  { path: '/orders/:id', name: 'order', component: OrderDetailView, props: true },

  // Alertas de estoque
  { path: '/alerts', name: 'alerts', component: AlertListView },

  // Notificações multicanal (histórico + detalhe do fan-out)
  { path: '/notifications', name: 'notifications', component: NotificationListView },
  { path: '/notifications/:id', name: 'notification', component: NotificationDetailView, props: true },

  // Canais de notificação (CRUD)
  { path: '/channels', name: 'channels', component: ChannelListView },
  { path: '/channels/new', name: 'channel-new', component: ChannelCreateView },
  { path: '/channels/:id/edit', name: 'channel-edit', component: ChannelEditView, props: true },

  // Fornecedores (CRUD)
  { path: '/suppliers', name: 'suppliers', component: SupplierListView },
  { path: '/suppliers/new', name: 'supplier-new', component: SupplierCreateView },
  { path: '/suppliers/:id', name: 'supplier', component: SupplierDetailView, props: true },
  { path: '/suppliers/:id/edit', name: 'supplier-edit', component: SupplierEditView, props: true },

  // Trilha de auditoria (lista + detalhe)
  { path: '/audit', name: 'audit', component: AuditListView },
  { path: '/audit/:id', name: 'audit-entry', component: AuditDetailView, props: true },

  // Saúde da fila e assistente de IA
  { path: '/queue', name: 'queue', component: QueueHealthView },
  { path: '/ai', name: 'ai', component: AiAssistantView },

  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];
