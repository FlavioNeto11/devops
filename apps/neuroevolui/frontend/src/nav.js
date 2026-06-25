// Navegação da sidebar — grupos de domínio do NeuroEvolui.
// Cada `to` aponta para uma rota registrada em router.js.
export const nav = [
  {
    group: 'Principal',
    items: [
      { label: 'Painel', to: '/', icon: '◧' },
      { label: 'Pacientes', to: '/patients', icon: '☺' },
      { label: 'Consultas', to: '/consultations', icon: '◷' },
      { label: 'Evoluções', to: '/evolution-notes', icon: '✎' },
    ],
  },
  {
    group: 'Clínica',
    items: [
      { label: 'Relatórios de pacientes', to: '/patient-reports', icon: '▤' },
      { label: 'Profissionais', to: '/professionals', icon: '☷' },
    ],
  },
  {
    group: 'Financeiro',
    items: [
      { label: 'Visão financeira', to: '/financial', icon: '◭' },
      { label: 'Transações', to: '/payment-transactions', icon: '$' },
      { label: 'Auditoria', to: '/audit-logs', icon: '⚖' },
    ],
  },
  {
    group: 'IA e Conhecimento',
    items: [
      { label: 'Assistente IA', to: '/assistant', icon: '✨' },
      { label: 'Base de conhecimento', to: '/knowledge-sources', icon: '◫' },
    ],
  },
  {
    group: 'Operações',
    items: [
      { label: 'Jobs assíncronos', to: '/async-jobs', icon: '⟳' },
      { label: 'Notificações', to: '/notification-preferences', icon: '◐' },
      { label: 'Configurações', to: '/settings', icon: '⚙' },
    ],
  },
];
