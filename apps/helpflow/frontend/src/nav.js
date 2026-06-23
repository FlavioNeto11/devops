// Navegação da sidebar — itens de DOMÍNIO do HelpFlow (sem placeholders do scaffold).
// Cada destino resolve para uma rota real registrada em router.js. Grupos:
// (sem título) Painel · Atendimento · Conhecimento e IA · Operação · Administração.
// `roles` espelha o meta.roles das rotas: o UiAppShell esconde itens fora do papel
// do usuário (defesa em profundidade na borda; o backend é a fonte de verdade do RBAC).
export const nav = [
  { group: '', items: [
    { label: 'Painel', to: '/', icon: '◧' },
  ] },
  { group: 'Atendimento', items: [
    { label: 'Chamados', to: '/tickets', icon: '▤' },
    { label: 'Solicitantes', to: '/customers', icon: '☺' },
  ] },
  { group: 'Conhecimento e IA', items: [
    { label: 'Base de conhecimento', to: '/kb-articles', icon: '▦' },
    { label: 'Buscar na base', to: '/kb-search', icon: '⌕' },
    { label: 'Assistente IA', to: '/assistant', icon: '◇' },
  ] },
  { group: 'Operação', items: [
    { label: 'Jobs', to: '/jobs', icon: '◴', roles: ['admin', 'supervisor'] },
    { label: 'Integrações', to: '/integrations', icon: '⛢', roles: ['admin', 'supervisor'] },
    { label: 'Observabilidade', to: '/observability', icon: '◰', roles: ['admin', 'supervisor'] },
  ] },
  { group: 'Administração', items: [
    { label: 'Agentes', to: '/agents', icon: '◍', roles: ['admin', 'supervisor'] },
    { label: 'Equipes', to: '/teams', icon: '◫', roles: ['admin', 'supervisor'] },
    { label: 'Políticas de SLA', to: '/sla-policies', icon: '◔' },
    { label: 'Controle da IA', to: '/ai-control', icon: '◆', roles: ['admin', 'supervisor'] },
    { label: 'Configurações', to: '/settings', icon: '⚙', roles: ['admin'] },
  ] },
];

export default nav;
