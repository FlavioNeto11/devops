// Navegação da sidebar — itens de DOMÍNIO do StockPilot (sem placeholders do scaffold).
// Cada destino resolve para uma rota real registrada em router.js. Grupos:
// Operação (rotina diária), Inteligência (IA + saúde) e Integrações (cadastros externos).
export const nav = [
  { group: 'Operação', items: [
    { label: 'Painel', to: '/', icon: '◧' },
    { label: 'Produtos', to: '/products', icon: '▦' },
    { label: 'Pedidos', to: '/orders', icon: '▤' },
    { label: 'Alertas', to: '/alerts', icon: '◔' },
  ] },
  { group: 'Inteligência', items: [
    { label: 'Assistente IA', to: '/ai', icon: '◇' },
    { label: 'Notificações', to: '/notifications', icon: '◴' },
    { label: 'Saúde da fila', to: '/queue', icon: '◫' },
  ] },
  { group: 'Integrações', items: [
    { label: 'Fornecedores', to: '/suppliers', icon: '⛢' },
    { label: 'Canais', to: '/channels', icon: '◵' },
    { label: 'Auditoria', to: '/audit', icon: '◰' },
  ] },
];
