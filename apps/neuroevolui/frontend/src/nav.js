// Navegação da sidebar — itens de DOMÍNIO do NeuroEvolui. Cada `to` aponta para uma
// rota registrada em router.js (apenas rotas reais do domínio clínico).
export const nav = [
  { group: '', items: [
    { label: 'Painel', to: '/', icon: '◧' },
  ] },
  { group: 'Clínica', items: [
    { label: 'Pacientes', to: '/patients', icon: '☺' },
    { label: 'Profissionais', to: '/professionals', icon: '☷' },
    { label: 'Consultas', to: '/consultations', icon: '◷' },
    { label: 'Evoluções', to: '/evolution-notes', icon: '✎' },
    { label: 'Relatórios', to: '/reports', icon: '▤' },
  ] },
  { group: 'Financeiro', items: [
    { label: 'Receita', to: '/revenue', icon: '◭' },
    { label: 'Transações', to: '/transactions', icon: '$' },
    { label: 'Auditoria', to: '/audit-logs', icon: '⚖' },
  ] },
  { group: 'Inteligência', items: [
    { label: 'Assistente', to: '/assistant', icon: '✨' },
    { label: 'Base de conhecimento', to: '/knowledge-sources', icon: '◫' },
  ] },
  { group: 'Operação', items: [
    { label: 'Notificações', to: '/notifications', icon: '◐' },
    { label: 'Filas e jobs', to: '/jobs', icon: '⟳' },
    { label: 'Saúde do sistema', to: '/system-health', icon: '♥' },
    { label: 'Documentação da API', to: '/api-docs', icon: '◰' },
  ] },
];
