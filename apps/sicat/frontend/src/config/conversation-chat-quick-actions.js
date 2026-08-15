export const CONVERSATIONAL_CHAT_QUICK_ACTIONS = [
  {
    id: 'chat-dashboard-overview',
    title: 'Resumo operacional',
    description: 'Consultar uma leitura objetiva do painel operacional da conta ativa.',
    prompt: 'Quero um resumo operacional do painel atual.',
    icon: 'mdi-view-dashboard-outline',
    requires: []
  },
  {
    id: 'chat-list-manifests',
    title: 'Listar manifestos',
    description: 'Retornar os manifestos recentes no contexto autenticado da conta CETESB ativa.',
    prompt: 'Liste os manifestos da conta ativa.',
    icon: 'mdi-file-document-multiple-outline',
    requires: []
  },
  {
    id: 'chat-manifest-details',
    title: 'Detalhe de manifesto',
    description: 'Consultar status e dados operacionais do manifesto atualmente em foco.',
    prompt: 'Quero o detalhe operacional deste manifesto.',
    icon: 'mdi-file-search-outline',
    requires: ['manifestId']
  },
  {
    id: 'chat-job-status',
    title: 'Andamento do processamento',
    description: 'Consultar o andamento de um processamento específico para acompanhar a operação.',
    prompt: 'Quero o status do processamento em foco.',
    icon: 'mdi-cog-outline',
    requires: ['jobId']
  }
];
