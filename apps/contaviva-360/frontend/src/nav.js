// Navegacao da sidebar — gerado pela Forge (grupos de dominio).
export const nav = [
  { group: 'Inicio', items: [
    { label: 'Dashboard', to: '/dashboard', name: 'dashboard-home', icon: '◧' },
  ] },
  { group: 'Clientes', items: [
    { label: 'Pessoas Fisicas', to: '/pf', name: 'pf-list', icon: '👤' },
    { label: 'Pessoas Juridicas', to: '/pj', name: 'pj-list', icon: '🏢' },
  ] },
  { group: 'Documentos e Obrigacoes', items: [
    { label: 'Documentos', to: '/documents', name: 'documents-list', icon: '📄' },
    { label: 'Obrigacoes Fiscais', to: '/fiscal-obligations', name: 'fiscal-obligations-list', icon: '📋' },
  ] },
  { group: 'Tarefas', items: [
    { label: 'Tarefas', to: '/tasks', name: 'tasks-list', icon: '✓' },
  ] },
  { group: 'Financeiro', items: [
    { label: 'Contas a Pagar', to: '/accounts-payable', name: 'accounts-payable-list', icon: '↑' },
    { label: 'Contas a Receber', to: '/accounts-receivable', name: 'accounts-receivable-list', icon: '↓' },
    { label: 'Receitas e Despesas', to: '/income-expenses', name: 'income-expenses-list', icon: '≋' },
    { label: 'Fluxo de Caixa', to: '/cash-flow', name: 'cash-flow', icon: '◈' },
    { label: 'Relatorios Financeiros', to: '/relatorios-financeiros', name: 'financial-reports', icon: '▦' },
  ] },
  { group: 'Notas Fiscais', items: [
    { label: 'Notas Fiscais', to: '/nf', name: 'nf-list', icon: '🧾' },
    { label: 'Clientes NF', to: '/nf-clients', name: 'nf-clients-list', icon: '▤' },
    { label: 'Produtos NF', to: '/nf-products', name: 'nf-products-list', icon: '📦' },
    { label: 'Relatorio NF', to: '/contaviva-360/nf/report', name: 'nf-report', icon: '▦' },
  ] },
  { group: 'Assistente IA', items: [
    { label: 'Assistente', to: '/contaviva-360/assistant', name: 'assistant', icon: '✨' },
  ] },
  { group: 'Administracao', items: [
    { label: 'Auditoria Gateways', to: '/contaviva-360/gateways/audit', name: 'gateways-audit', icon: '🔍' },
    { label: 'Auditoria Assistente', to: '/admin/assistant-audit', name: 'assistant-audit', icon: '🛡' },
  ] },
];
