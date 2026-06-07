const DEFAULT_SCREEN_META = {
  title: 'SICAT',
  description: 'Contexto autenticado do SICAT com orientacao operacional e navegacao assistida.',
  purpose: 'Apoiar a leitura da tela atual sem sair do shell autenticado.',
  fieldHints: [
    {
      label: 'Conta ativa',
      description: 'Toda orientacao deve respeitar a conta CETESB selecionada e o contexto operacional em sessao.'
    },
    {
      label: 'Rota atual',
      description: 'Use a rota e o breadcrumb para localizar o modulo certo antes de orientar uma acao.'
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
    description: 'Saude operacional, capacidade e leitura rapida do ecossistema de jobs e manifestos.',
    purpose: 'Ler sinais do ambiente e localizar gargalos antes de agir.',
    fieldHints: [
      {
        label: 'KPIs operacionais',
        description: 'Os cards superiores mostram backlog, taxa de sucesso, workers ativos e risco operacional.'
      },
      {
        label: 'Series temporais',
        description: 'Use os graficos para correlacionar latencia, sucesso e volume em 24h ou 7 dias.'
      },
      {
        label: 'Top operacoes',
        description: 'Ajuda a localizar endpoints ou jobs que concentram custo e falha.'
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
        description: 'Detalhar fila, execucao e DLQ.'
      },
      {
        label: 'Manifestos',
        to: '/manifestos',
        description: 'Ir para a operacao direta de MTRs.'
      }
    ]
  },
  Manifestos: {
    title: 'Manifestos',
    description: 'Operacao ampla da fila de MTRs, com filtros, acoes em lote e acompanhamento CETESB.',
    purpose: 'Filtrar, localizar e acompanhar manifestos da conta ativa.',
    fieldHints: [
      {
        label: 'Filtros',
        description: 'Data, status e contexto operacional definem a amostra que vai para a listagem.'
      },
      {
        label: 'Selecao em lote',
        description: 'Use com cuidado para revisar o conjunto antes de qualquer fluxo operacional.'
      },
      {
        label: 'Menu de acoes',
        description: 'Centraliza consulta de detalhes, replicacao e fluxos suportados pelo backend principal.'
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
        description: 'Abrir o fluxo guiado de criacao.'
      },
      {
        label: 'Jobs',
        to: '/sistema/jobs',
        description: 'Checar filas e processamentos relacionados.'
      }
    ]
  },
  RelatorioMtrs: {
    title: 'Relatorio dos MTRs',
    description: 'Consulta consolidada de MTRs com recorte temporal e leitura orientada a auditoria.',
    purpose: 'Auditar e consolidar historico operacional sem sair do portal.',
    fieldHints: [
      {
        label: 'Janela temporal',
        description: 'Ajuste o periodo para equilibrar volume, latencia e utilidade do resultado.'
      },
      {
        label: 'Leitura para auditoria',
        description: 'Concentre a analise em status, recortes e inconsistencias observadas.'
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
        description: 'Consultar um panorama rapido antes da auditoria.'
      }
    ]
  },
  ManifestoNovo: {
    title: 'Novo manifesto',
    description: 'Fluxo guiado para montar e submeter manifestos sem alterar regras operacionais existentes.',
    purpose: 'Preencher o manifesto com contexto da conta ativa e validacoes do fluxo.',
    fieldHints: [
      {
        label: 'Participantes',
        description: 'Gerador, transportador e destinador precisam estar coerentes com a conta e o contexto atual.'
      },
      {
        label: 'Dados operacionais',
        description: 'Tipo, data de expedicao e responsavel influenciam validacao e submissao.'
      },
      {
        label: 'Residuos',
        description: 'Descricao, classe, unidade e quantidade sao pontos frequentes de revisao.'
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
        description: 'Revisar fila e rascunhos existentes.'
      }
    ]
  },
  ManifestoDetalhe: {
    title: 'Detalhe do manifesto',
    description: 'Dados operacionais, participantes, residuos e acompanhamento do manifesto selecionado.',
    purpose: 'Entender o estado do manifesto atual e orientar a leitura dos dados exibidos.',
    fieldHints: [
      {
        label: 'Identificacao do manifesto',
        description: 'ID interno, numero externo e codigo CETESB ajudam a cruzar auditoria e fila.'
      },
      {
        label: 'Status e participantes',
        description: 'Leia status, gerador, transportador e destinador antes de orientar proximo passo.'
      },
      {
        label: 'Dados operacionais',
        description: 'Responsavel, expedicao, hash externo e residuos explicam o estado exibido.'
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
        description: 'Consultar processamento relacionado quando houver job.'
      }
    ]
  },
  SistemaJobs: {
    title: 'Jobs',
    description: 'Fila, auditoria, DLQ e sinais operacionais para suportar troubleshooting em tempo real.',
    purpose: 'Entender execucao, falhas e backlog da fila assincrona.',
    fieldHints: [
      {
        label: 'Status do job',
        description: 'Priorize status, tentativas, erro atual e timestamps para orientar a leitura.'
      },
      {
        label: 'Fila e DLQ',
        description: 'Separe gargalo de fila de falha terminal antes de sugerir uma acao.'
      },
      {
        label: 'Correlacao',
        description: 'Job, correlationId e auditoria devem ser analisados em conjunto.'
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
    title: 'Sessao e conta CETESB',
    description: 'Contexto autenticado, sessao ativa e troca rapida de conta CETESB.',
    purpose: 'Validar o contexto autenticado antes de orientar operacoes no portal.',
    fieldHints: [
      {
        label: 'Conta ativa',
        description: 'Confira partnerCode, tipo de conta e dados da conta CETESB selecionada.'
      },
      {
        label: 'Session context',
        description: 'SessionContextId e integrationAccountId explicam qual identidade operacional esta valendo.'
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
        description: 'Retomar a operacao principal.'
      }
    ]
  },
  AdminAcessos: {
    title: 'Perfis e acessos',
    description: 'Visao administrativa de usuarios, perfis, permissoes e sessoes recentes.',
    purpose: 'Orientar leitura administrativa sem expandir privilegios no copiloto.',
    fieldHints: [
      {
        label: 'Perfis e permissoes',
        description: 'Leia o escopo concedido antes de sugerir qualquer acao administrativa.'
      },
      {
        label: 'Sessoes',
        description: 'Use a trilha de acessos para diagnosticar governanca e suporte.'
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
        label: 'Sessao',
        to: '/sessao',
        description: 'Confirmar contexto ativo antes de qualquer leitura administrativa.'
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
    return 'Conta CETESB nao selecionada';
  }

  const partnerName = toTrimmedString(activeAccount.partnerName);
  const partnerCode = toTrimmedString(activeAccount.partnerCode);

  if (partnerName && partnerCode) {
    return `${partnerName} (cod. ${partnerCode})`;
  }

  if (partnerName) {
    return partnerName;
  }

  if (partnerCode) {
    return `Codigo ${partnerCode}`;
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
