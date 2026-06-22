// Navegação lateral (sidebar) do ShopDesk — consumida por AppShell.vue, que repassa para
// <UiAppShell :nav="nav" />. Cada grupo é { group, items: [{ to, label, icon }] }, o formato
// esperado pelo UiAppShell (packages/ui-vue/src/components/UiAppShell.vue).
//
// Os títulos (label) espelham o `title` de cada UiPageLayout das views; as rotas (to) espelham o
// router.js. Ícones são unicode simples (sem dependência de fonte de ícones).
export const nav = [
  {
    group: 'Operação',
    items: [
      { to: '/', label: 'Visão geral', icon: '◰' },
      { to: '/orders', label: 'Pedidos', icon: '🧾' },
      { to: '/loja', label: 'Loja', icon: '🛒' },
      { to: '/carts', label: 'Carrinhos', icon: '🛍' },
    ],
  },
  {
    group: 'Catálogo e Estoque',
    items: [
      { to: '/products', label: 'Produtos', icon: '📦' },
      { to: '/inventory', label: 'Estoque', icon: '🏬' },
      { to: '/reorders', label: 'Ordens de reposição', icon: '🔁' },
    ],
  },
  {
    group: 'Financeiro e Fiscal',
    items: [
      { to: '/transactions', label: 'Transações de pagamento', icon: '💳' },
      { to: '/invoices', label: 'Notas fiscais', icon: '📄' },
    ],
  },
  {
    group: 'Engajamento',
    items: [
      { to: '/ai', label: 'Assistente da loja', icon: '✦' },
      { to: '/notifications', label: 'Notificações', icon: '🔔' },
    ],
  },
  {
    group: 'Configurações',
    items: [
      { to: '/settings', label: 'Configurações da loja', icon: '⚙' },
      { to: '/settings/users', label: 'Usuários', icon: '👥' },
      { to: '/auditoria', label: 'Auditoria', icon: '🗒' },
      { to: '/health', label: 'Saúde do sistema', icon: '❤' },
      { to: '/settings/api-docs', label: 'Documentação da API', icon: '⟨⟩' },
    ],
  },
];

export default nav;
