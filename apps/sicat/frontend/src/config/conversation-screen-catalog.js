const DEFAULT_SCREEN_META = {
  title: 'SICAT',
  description: 'Contexto autenticado do SICAT, com orientação operacional e navegação assistida.',
  purpose: 'Apoiar a leitura da tela atual sem sair da área autenticada.',
  fieldHints: [
    {
      label: 'Conta ativa',
      description: 'Toda orientação deve respeitar a conta CETESB selecionada e o contexto operacional em sessão.'
    },
    {
      label: 'Rota atual',
      description: 'Use a rota e a trilha de navegação para localizar o módulo certo antes de orientar uma ação.'
    }
  ],
  quickActions: [
    {
      id: 'screen-overview',
      label: 'Explique esta tela',
      kind: 'local',
      intent: 'screen_overview',
      icon: 'mdi-compass-outline'
    },
    {
      id: 'navigation-help',
      label: 'Para onde ir agora?',
      kind: 'local',
      intent: 'navigation_help',
      icon: 'mdi-map-marker-path'
    }
  ],
  relatedRoutes: [
    {
      label: 'Dashboard',
      to: '/dashboard',
      description: 'Voltar para a leitura operacional principal.'
    },
    {
      label: 'Manifestos',
      to: '/manifestos',
      description: 'Abrir a fila operacional de MTRs.'
    }
  ]
};

const SHELL_SCREEN_CATALOG = {
  Dashboard: {
    title: 'Dashboard',
    description: 'Saúde operacional, capacidade e leitura rápida dos manifestos e processamentos.',
    purpose: 'Ler sinais do ambiente e localizar gargalos antes de agir.',
    fieldHints: [
      {
        label: 'Indicadores operacionais',
        description: 'Os cartões superiores resumem fila acumulada, taxa de sucesso, processamento ativo e risco operacional.'
      },
      {
        label: 'Séries temporais',
        description: 'Use os gráficos para correlacionar tempo de resposta, sucesso e volume em 24h ou 7 dias.'
      },
      {
        label: 'Principais operações',
        description: 'Ajuda a localizar as operações e os processamentos que concentram custo e falha.'
      }
    ],
    quickActions: [
      {
        id: 'dashboard-summary',
        label: 'Resumo operacional',
        kind: 'backend',
        prompt: 'Quero um resumo operacional do dashboard atual.',
        icon: 'mdi-view-dashboard-outline'
      },
      {
        id: 'dashboard-screen-overview',
        label: 'Explique esta tela',
        kind: 'local',
        intent: 'screen_overview',
        icon: 'mdi-compass-outline'
      },
      {
        id: 'dashboard-go-jobs',
        label: 'Abrir Jobs',
        kind: 'navigate',
        to: '/sistema/jobs',
        icon: 'mdi-cog-outline'
      }
    ],
    relatedRoutes: [
      {
        label: 'Jobs',
        to: '/sistema/jobs',
        description: 'Detalhar fila, execução e falhas terminais.'
      },
      {
        label: 'Manifestos',
        to: '/manifestos',
        description: 'Ir para a operação direta de MTRs.'
      }
    ]
  },
  Manifestos: {
    title: 'Manifestos',
    description: 'Operação ampla da fila de MTRs, com filtros, ações em lote e acompanhamento CETESB.',
    purpose: 'Filtrar, localizar e acompanhar manifestos da conta ativa.',
    fieldHints: [
      {
        label: 'Filtros',
        description: 'Data, situação e contexto operacional definem a amostra que vai para a listagem.'
      },
      {
        label: 'Seleção em lote',
        description: 'Use com cuidado para revisar o conjunto antes de qualquer fluxo operacional.'
      },
      {
        label: 'Menu de ações',
        description: 'Centraliza consulta de detalhes, replicação e os demais fluxos disponíveis para o manifesto.'
      }
    ],
    quickActions: [
      {
        id: 'manifest-list',
        label: 'Liste os manifestos',
        kind: 'backend',
        prompt: 'Liste os manifestos da conta ativa.',
        icon: 'mdi-file-document-multiple-outline'
      },
      {
        id: 'manifest-screen-overview',
        label: 'Explique esta tela',
        kind: 'local',
        intent: 'screen_overview',
        icon: 'mdi-compass-outline'
      },
      {
        id: 'manifest-go-new',
        label: 'Novo manifesto',
        kind: 'navigate',
        to: '/manifestos/novo',
        icon: 'mdi-file-plus-outline'
      }
    ],
    relatedRoutes: [
      {
        label: 'Novo manifesto',
        to: '/manifestos/novo',
        description: 'Abrir o fluxo guiado de criação.'
      },
      {
        label: 'Jobs',
        to: '/sistema/jobs',
        description: 'Checar filas e processamentos relacionados.'
      }
    ]
  },
  RelatorioMtrs: {
    title: 'Relatório dos MTRs',
    description: 'Consulta consolidada de MTRs com recorte temporal e leitura voltada à auditoria.',
    purpose: 'Auditar e consolidar o histórico operacional sem sair do portal.',
    fieldHints: [
      {
        label: 'Janela temporal',
        description: 'Ajuste o período para equilibrar volume, tempo de resposta e utilidade do resultado.'
      },
      {
        label: 'Leitura para auditoria',
        description: 'Concentre a análise em situação, recortes e inconsistências observadas.'
      }
    ],
    quickActions: [
      {
        id: 'report-screen-overview',
        label: 'Explique esta tela',
        kind: 'local',
        intent: 'screen_overview',
        icon: 'mdi-compass-outline'
      },
      {
        id: 'report-go-manifests',
        label: 'Abrir Manifestos',
        kind: 'navigate',
        to: '/manifestos',
        icon: 'mdi-file-document-multiple-outline'
      }
    ],
    relatedRoutes: [
      {
        label: 'Manifestos',
        to: '/manifestos',
        description: 'Voltar para a fila operacional.'
      },
      {
        label: 'Dashboard',
        to: '/dashboard',
        description: 'Consultar um panorama rápido antes da auditoria.'
      }
    ]
  },
  ManifestoNovo: {
    title: 'Novo manifesto',
    description: 'Fluxo guiado para montar e enviar manifestos com o contexto da conta ativa.',
    purpose: 'Preencher o manifesto com o contexto da conta ativa e as validações do fluxo.',
    fieldHints: [
      {
        label: 'Participantes',
        description: 'Gerador, transportador e destinador precisam estar coerentes com a conta e o contexto atual.'
      },
      {
        label: 'Dados operacionais',
        description: 'Tipo, data de expedição e responsável influenciam a validação e o envio.'
      },
      {
        label: 'Resíduos',
        description: 'Descrição, classe, unidade e quantidade são pontos frequentes de revisão.'
      }
    ],
    quickActions: [
      {
        id: 'new-manifest-screen-overview',
        label: 'Explique esta tela',
        kind: 'local',
        intent: 'screen_overview',
        icon: 'mdi-compass-outline'
      },
      {
        id: 'new-manifest-field-help',
        label: 'Campos-chave',
        kind: 'local',
        intent: 'field_help',
        icon: 'mdi-form-textbox'
      },
      {
        id: 'new-manifest-go-list',
        label: 'Voltar para Manifestos',
        kind: 'navigate',
        to: '/manifestos',
        icon: 'mdi-arrow-left'
      }
    ],
    relatedRoutes: [
      {
        label: 'Manifestos',
        to: '/manifestos',
        description: 'Revisar a fila e os rascunhos existentes.'
      }
    ]
  },
  ManifestoDetalhe: {
    title: 'Detalhe do manifesto',
    description: 'Dados operacionais, participantes, resíduos e acompanhamento do manifesto selecionado.',
    purpose: 'Entender o estado do manifesto atual e orientar a leitura dos dados exibidos.',
    fieldHints: [
      {
        label: 'Identificação do manifesto',
        description: 'O número do manifesto e o código CETESB ajudam a cruzar auditoria e fila.'
      },
      {
        label: 'Situação e participantes',
        description: 'Leia a situação, o gerador, o transportador e o destinador antes de orientar o próximo passo.'
      },
      {
        label: 'Dados operacionais',
        description: 'Responsável, expedição, identificação na CETESB e resíduos explicam o estado exibido.'
      }
    ],
    quickActions: [
      {
        id: 'detail-fetch-backend',
        label: 'Consultar este manifesto',
        kind: 'backend',
        prompt: 'Quero o detalhe operacional deste manifesto.',
        icon: 'mdi-file-search-outline'
      },
      {
        id: 'detail-screen-overview',
        label: 'Explique esta tela',
        kind: 'local',
        intent: 'screen_overview',
        icon: 'mdi-compass-outline'
      },
      {
        id: 'detail-go-list',
        label: 'Voltar para Manifestos',
        kind: 'navigate',
        to: '/manifestos',
        icon: 'mdi-arrow-left'
      }
    ],
    relatedRoutes: [
      {
        label: 'Manifestos',
        to: '/manifestos',
        description: 'Abrir a fila completa da conta ativa.'
      },
      {
        label: 'Jobs',
        to: '/sistema/jobs',
        description: 'Consultar o processamento relacionado, quando houver.'
      }
    ]
  },
  SistemaJobs: {
    title: 'Jobs',
    description: 'Fila, auditoria, falhas terminais e sinais operacionais para apoiar o diagnóstico em tempo real.',
    purpose: 'Entender execução, falhas e acúmulo da fila de processamentos.',
    fieldHints: [
      {
        label: 'Situação do processamento',
        description: 'Priorize situação, tentativas, erro atual e horários para orientar a leitura.'
      },
      {
        label: 'Fila e falhas terminais',
        description: 'Separe gargalo de fila de falha terminal antes de sugerir uma ação.'
      },
      {
        label: 'Correlação',
        description: 'Processamento, identificador de correlação e auditoria devem ser analisados em conjunto.'
      }
    ],
    quickActions: [
      {
        id: 'jobs-screen-overview',
        label: 'Explique esta tela',
        kind: 'local',
        intent: 'screen_overview',
        icon: 'mdi-compass-outline'
      },
      {
        id: 'jobs-go-dashboard',
        label: 'Abrir Dashboard',
        kind: 'navigate',
        to: '/dashboard',
        icon: 'mdi-view-dashboard-outline'
      }
    ],
    relatedRoutes: [
      {
        label: 'Dashboard',
        to: '/dashboard',
        description: 'Voltar para o panorama consolidado.'
      },
      {
        label: 'Manifestos',
        to: '/manifestos',
        description: 'Ir da fila para os itens operacionais.'
      }
    ]
  },
  SessaoConta: {
    title: 'Sessão e conta CETESB',
    description: 'Contexto autenticado, sessão ativa e troca rápida de conta CETESB.',
    purpose: 'Validar o contexto autenticado antes de orientar operações no portal.',
    fieldHints: [
      {
        label: 'Conta ativa',
        description: 'Confira o código do parceiro, o tipo de conta e os dados da conta CETESB selecionada.'
      },
      {
        label: 'Contexto da sessão',
        description: 'Os identificadores da sessão e da conta de integração mostram qual identidade operacional está valendo.'
      }
    ],
    quickActions: [
      {
        id: 'session-screen-overview',
        label: 'Explique esta tela',
        kind: 'local',
        intent: 'screen_overview',
        icon: 'mdi-compass-outline'
      },
      {
        id: 'session-go-dashboard',
        label: 'Voltar ao Dashboard',
        kind: 'navigate',
        to: '/dashboard',
        icon: 'mdi-view-dashboard-outline'
      }
    ],
    relatedRoutes: [
      {
        label: 'Dashboard',
        to: '/dashboard',
        description: 'Retomar a operação principal.'
      }
    ]
  },
  AdminAcessos: {
    title: 'Perfis e acessos',
    description: 'Visão administrativa de usuários, perfis, permissões e sessões recentes.',
    purpose: 'Orientar a leitura administrativa sem ampliar privilégios pelo assistente.',
    fieldHints: [
      {
        label: 'Perfis e permissões',
        description: 'Leia o escopo concedido antes de sugerir qualquer ação administrativa.'
      },
      {
        label: 'Sessões',
        description: 'Use a trilha de acessos para diagnosticar governança e apoiar o suporte.'
      }
    ],
    quickActions: [
      {
        id: 'admin-screen-overview',
        label: 'Explique esta tela',
        kind: 'local',
        intent: 'screen_overview',
        icon: 'mdi-compass-outline'
      },
      {
        id: 'admin-go-dashboard',
        label: 'Voltar ao Dashboard',
        kind: 'navigate',
        to: '/dashboard',
        icon: 'mdi-view-dashboard-outline'
      }
    ],
    relatedRoutes: [
      {
        label: 'Sessão',
        to: '/sessao',
        description: 'Confirmar o contexto ativo antes de qualquer leitura administrativa.'
      }
    ]
  }
};

function toTrimmedString(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).trim();
  }

  return '';
}

function toNullableString(value) {
  const normalized = toTrimmedString(value);
  return normalized || null;
}

function toRouteParamString(value) {
  if (Array.isArray(value)) {
    return toNullableString(value[0]);
  }

  return toNullableString(value);
}

function normalizeAccountType(accountType) {
  const normalized = toTrimmedString(accountType).toLowerCase();
  if (normalized === 'generator') return 'Gerador';
  if (normalized === 'carrier') return 'Transportador';
  if (normalized === 'receiver') return 'Destinador';
  return 'Conta operacional';
}

function buildActiveAccountLabel(activeAccount) {
  if (!activeAccount || typeof activeAccount !== 'object') {
    return 'Conta CETESB não selecionada';
  }

  const partnerName = toTrimmedString(activeAccount.partnerName);
  const partnerCode = toTrimmedString(activeAccount.partnerCode);

  if (partnerName && partnerCode) {
    return `${partnerName} (cód. ${partnerCode})`;
  }

  if (partnerName) {
    return partnerName;
  }

  if (partnerCode) {
    return `Código ${partnerCode}`;
  }

  return toTrimmedString(activeAccount.accountId) || 'Conta ativa';
}

function normalizeBreadcrumbs(route, fallbackTitle) {
  const rawBreadcrumbs = Array.isArray(route?.meta?.breadcrumb) ? route.meta.breadcrumb : [];
  if (rawBreadcrumbs.length > 0) {
    return rawBreadcrumbs.map((item) => toTrimmedString(item)).filter(Boolean);
  }

  return [fallbackTitle || 'SICAT'];
}

export function getShellScreenMeta(routeName) {
  return SHELL_SCREEN_CATALOG[toTrimmedString(routeName)] || DEFAULT_SCREEN_META;
}

export function getShellScreenDescription(routeName) {
  return getShellScreenMeta(routeName).description;
}

export function buildConversationScreenContext({ route, activeAccount, sessionContext, integrationAccountId, operationalContext = null }) {
  const meta = getShellScreenMeta(route?.name);
  const breadcrumbs = normalizeBreadcrumbs(route, meta.title);
  const manifestId = toRouteParamString(route?.params?.id);
  const queryJobId = toRouteParamString(route?.query?.jobId);
  const queryCorrelationId = toRouteParamString(route?.query?.correlationId);
  const normalizedSessionContextId = toNullableString(sessionContext?.id || sessionContext?.sessionContextId);
  const normalizedIntegrationAccountId = toNullableString(integrationAccountId || sessionContext?.integrationAccountId);

  // Enriquecer contexto com dados operacionais quando disponível (ex: detalhe de manifesto)
  const enrichedContext = operationalContext && typeof operationalContext === 'object'
    ? {
      manifestStatus: toNullableString(operationalContext.manifestStatus || operationalContext.status),
      externalStatus: toNullableString(operationalContext.externalStatus),
      lastAction: toNullableString(operationalContext.lastAction),
      relatedJobs: Array.isArray(operationalContext.relatedJobs) ? operationalContext.relatedJobs.map(j => ({
        jobId: toNullableString(j.jobId || j.id),
        jobType: toNullableString(j.jobType || j.type),
        status: toNullableString(j.status)
      })) : [],
      availableDocuments: Array.isArray(operationalContext.availableDocuments) ? operationalContext.availableDocuments.map(d => ({
        name: toNullableString(d.name),
        type: toNullableString(d.type)
      })) : []
    }
    : null;

  return {
    screenKey: toTrimmedString(route?.name) || toTrimmedString(route?.path) || 'SICAT',
    routeName: toTrimmedString(route?.name) || 'SICAT',
    routePath: toTrimmedString(route?.fullPath || route?.path) || '/',
    breadcrumbs,
    pageTitle: breadcrumbs[breadcrumbs.length - 1] || meta.title,
    pageDescription: meta.description,
    purpose: meta.purpose,
    fieldHints: Array.isArray(meta.fieldHints) ? meta.fieldHints : DEFAULT_SCREEN_META.fieldHints,
    quickActions: Array.isArray(meta.quickActions) ? meta.quickActions : DEFAULT_SCREEN_META.quickActions,
    relatedRoutes: Array.isArray(meta.relatedRoutes) ? meta.relatedRoutes : DEFAULT_SCREEN_META.relatedRoutes,
    manifestId,
    jobId: queryJobId,
    auditCorrelationId: queryCorrelationId,
    accountId: toNullableString(activeAccount?.accountId),
    activeAccountLabel: buildActiveAccountLabel(activeAccount),
    activeAccountType: normalizeAccountType(activeAccount?.accountType),
    sessionContextId: normalizedSessionContextId,
    integrationAccountId: normalizedIntegrationAccountId,
    partnerCode: toNullableString(activeAccount?.partnerCode),
    ...enrichedContext
  };
}
