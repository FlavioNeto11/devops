export const CONVERSATIONAL_CHAT_QUICK_ACTIONS = [
  {
    id: 'chat-dashboard-overview',
    title: 'Resumo operacional',
    description: 'Consultar uma leitura objetiva do dashboard operacional da conta ativa.',
    prompt: 'Quero um resumo operacional do dashboard atual.',
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
    title: 'Status de job',
    description: 'Consultar o andamento de um job especifico para troubleshooting operacional.',
    prompt: 'Quero o status do job em foco.',
    icon: 'mdi-cog-outline',
    requires: ['jobId']
  }
];
