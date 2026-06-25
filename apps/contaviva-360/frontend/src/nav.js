// Navegação da sidebar. O motor (generate-ui) anexa grupos de domínio.
export const nav = [
  { group: '', items: [
    { label: 'Painel', to: '/', icon: '◧' },
    { label: 'Registros', to: '/records', icon: '▤' },
    { label: 'Assistente', to: '/assistant', icon: '✨' },
  ] },
  { group: 'Controle Financeiro', items: [
    { label: 'Dashboard Financeiro', to: '/financial/dashboard', icon: '◈' },
    { label: 'Contas a Pagar', to: '/financial/payable', icon: '↑' },
    { label: 'Contas a Receber', to: '/financial/receivable', icon: '↓' },
    { label: 'Fluxo de Caixa', to: '/financial/cash-flow', icon: '≋' },
    { label: 'Relatórios', to: '/financial/reports', icon: '▦' },
  ] },
];
