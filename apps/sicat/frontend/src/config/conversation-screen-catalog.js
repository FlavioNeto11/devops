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
      label: 'Tela atual',
      description: 'Use a tela e a trilha de navegação para localizar o módulo certo antes de orientar uma ação.'
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
        prompt: 'Quero um resumo operacional do painel atual.',
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
  PerfilCanais: {
    title: 'WhatsApp do assistente',
    description: 'Vinculação do número de WhatsApp que pode conversar com o assistente do SICAT.',
    purpose: 'Explicar a verificação por código e a revogação de um número, sem nunca pedir ou repetir o código.',
    fieldHints: [
      {
        label: 'Número do WhatsApp',
        description: 'Informe com DDD. O código de 6 dígitos chega no WhatsApp desse número e vale por 10 minutos.'
      },
      {
        label: 'Números vinculados',
        description: 'Cada número vinculado fala com o SICAT em nome do usuário — remover o vínculo corta esse acesso na hora.'
      }
    ],
    quickActions: [
      {
        id: 'channel-links-screen-overview',
        label: 'Explique esta tela',
        kind: 'local',
        intent: 'screen_overview',
        icon: 'mdi-compass-outline'
      },
      {
        id: 'channel-links-go-chat',
        label: 'Abrir o assistente',
        kind: 'navigate',
        to: '/conversacional/chat',
        icon: 'mdi-chat-processing-outline'
      }
    ],
    relatedRoutes: [
      {
        label: 'Assistente',
        to: '/conversacional/chat',
        description: 'Conversar pelo navegador, sem depender do WhatsApp.'
      },
      {
        label: 'Minha sessão',
        to: '/sessao',
        description: 'Conferir a sessão e a conta CETESB ativa.'
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
  },

  // ---- Módulo do Transportador (REQ-SICAT-0032, onda F5) -------------------
  // Só quickActions `local`/`navigate`: o conversation-tool-dispatcher do
  // backend ainda NÃO tem tools de transporte — um prompt `backend` sem tool
  // induziria resposta sem dado (follow-up registrado no plano do módulo).
  TransporteOperacaoList: {
    title: 'Minhas operações',
    description: 'As viagens da transportadora com situação e conformidade de cada uma.',
    purpose: 'Localizar uma viagem e abrir o detalhe para agir.',
    fieldHints: [
      { label: 'Situação', description: 'A máquina de estados da viagem: rascunho → validação → contratada → em trânsito → concluída.' },
      { label: 'Filtros', description: 'Status e regime da carga recortam a lista da conta ativa.' }
    ],
    quickActions: [
      { id: 'transp-list-overview', label: 'Explique esta tela', kind: 'local', intent: 'screen_overview', icon: 'mdi-compass-outline' },
      { id: 'transp-list-nova', label: 'Registrar viagem', kind: 'navigate', to: '/transporte/operacoes/nova', icon: 'mdi-plus-circle-outline' }
    ],
    relatedRoutes: [
      { label: 'Pendências', to: '/transporte/pendencias', description: 'O que precisa de ação em todas as viagens.' }
    ]
  },
  TransporteOperacaoNova: {
    title: 'Registrar viagem',
    description: 'Criação do rascunho da operação: rota obrigatória; carga e frete opcionais.',
    purpose: 'Nascer a viagem com o mínimo e completar no detalhe.',
    fieldHints: [
      { label: 'Rota', description: 'Origem e destino (município + UF) são o mínimo para o rascunho existir.' },
      { label: 'Valor da carga', description: 'Base da averbação no seguro e do limite de garantia por viagem.' }
    ],
    quickActions: [
      { id: 'transp-nova-overview', label: 'Explique esta tela', kind: 'local', intent: 'screen_overview', icon: 'mdi-compass-outline' },
      { id: 'transp-nova-list', label: 'Minhas operações', kind: 'navigate', to: '/transporte/operacoes', icon: 'mdi-truck-fast-outline' }
    ],
    relatedRoutes: [
      { label: 'Veículos', to: '/transporte/veiculos', description: 'Cadastrar a frota antes de vincular à viagem.' }
    ]
  },
  TransporteOperacaoDetalhe: {
    title: 'Detalhe da operação',
    description: 'O dossiê da viagem: partes, veículos, carga, CIOT, VPO, documentos fiscais e o painel de conformidade.',
    purpose: 'Completar a viagem e destravar os gates até o trânsito.',
    fieldHints: [
      { label: 'Painel de conformidade', description: 'Cada regra TR-* avaliada: PASS, WARN ou BLOCK — com evidência e ação corretiva.' },
      { label: 'CIOT e VPO', description: 'Registros do frete e do vale-pedágio; estados *_unconfirmed aguardam reconciliação.' }
    ],
    quickActions: [
      { id: 'transp-det-overview', label: 'Explique esta tela', kind: 'local', intent: 'screen_overview', icon: 'mdi-compass-outline' },
      { id: 'transp-det-pend', label: 'Ver pendências', kind: 'navigate', to: '/transporte/pendencias', icon: 'mdi-clipboard-alert-outline' }
    ],
    relatedRoutes: [
      { label: 'Regras regulatórias', to: '/transporte/regras', description: 'Entender a regra que bloqueou ou avisou.' }
    ]
  },
  TransportePendencias: {
    title: 'Pendências',
    description: 'Centro Operacional do módulo: bloqueios, CIOT sem confirmação, fiscal inválido, seguros vencendo e RNTRC.',
    purpose: 'Priorizar o que precisa de ação, do mais grave para o menos.',
    fieldHints: [
      { label: 'Métricas', description: 'Cada cartão é uma fila de trabalho; os clicáveis levam à origem do problema.' }
    ],
    quickActions: [
      { id: 'transp-pend-overview', label: 'Explique esta tela', kind: 'local', intent: 'screen_overview', icon: 'mdi-compass-outline' },
      { id: 'transp-pend-ops', label: 'Minhas operações', kind: 'navigate', to: '/transporte/operacoes', icon: 'mdi-truck-fast-outline' }
    ],
    relatedRoutes: [
      { label: 'Watch regulatório', to: '/transporte/watch', description: 'Mudanças normativas detectadas aguardando revisão.' }
    ]
  },
  TransporteTransportadorList: {
    title: 'Transportadores',
    description: 'Cadastro de transportadores próprios e terceiros/agregados, com RNTRC, seguros e PGR.',
    purpose: 'Manter habilitação e seguros de quem executa as viagens.',
    fieldHints: [
      { label: 'RNTRC', description: 'Registro na ANTT: categoria (TAC até 3 veículos; ETC 4+) e verificação por dados abertos.' }
    ],
    quickActions: [
      { id: 'transp-carr-overview', label: 'Explique esta tela', kind: 'local', intent: 'screen_overview', icon: 'mdi-compass-outline' },
      { id: 'transp-carr-veic', label: 'Veículos', kind: 'navigate', to: '/transporte/veiculos', icon: 'mdi-truck-outline' }
    ],
    relatedRoutes: [
      { label: 'Pendências', to: '/transporte/pendencias', description: 'Seguros vencendo e RNTRC desatualizado aparecem lá.' }
    ]
  },
  TransporteTransportadorDetalhe: {
    title: 'Detalhe do transportador',
    description: 'RNTRC com verificação, vínculos de veículos, apólices de seguro e PGR do transportador.',
    purpose: 'Manter a habilitação e as coberturas deste transportador em dia.',
    fieldHints: [
      { label: 'Apólices', description: 'RCTR-C (carga), RC-DC (roubo) e RC-V (terceiros) — vigência é o que o gate confere.' }
    ],
    quickActions: [
      { id: 'transp-carrdet-overview', label: 'Explique esta tela', kind: 'local', intent: 'screen_overview', icon: 'mdi-compass-outline' }
    ],
    relatedRoutes: [
      { label: 'Transportadores', to: '/transporte/transportadores', description: 'Voltar à lista.' }
    ]
  },
  TransporteVeiculoList: {
    title: 'Veículos',
    description: 'A frota usada nas operações: placa, RENAVAM, tipo e vínculos (próprio, arrendado, agregado).',
    purpose: 'Cadastrar e vincular os veículos que rodam as viagens.',
    fieldHints: [
      { label: 'Vínculo', description: 'owned/leased contam para a tipologia (TAC×ETC); agregado é veículo de terceiro a serviço.' }
    ],
    quickActions: [
      { id: 'transp-veic-overview', label: 'Explique esta tela', kind: 'local', intent: 'screen_overview', icon: 'mdi-compass-outline' },
      { id: 'transp-veic-carr', label: 'Transportadores', kind: 'navigate', to: '/transporte/transportadores', icon: 'mdi-account-hard-hat-outline' }
    ],
    relatedRoutes: [
      { label: 'Registrar viagem', to: '/transporte/operacoes/nova', description: 'Com a frota em dia, registre a operação.' }
    ]
  },
  TransporteRegras: {
    title: 'Regras regulatórias',
    description: 'O catálogo TR-* que o motor de conformidade avalia, com vigências e domínios.',
    purpose: 'Entender o porquê de cada PASS/WARN/BLOCK do painel.',
    fieldHints: [
      { label: 'Vigência', description: 'Regras têm versões temporais; o motor usa a vigente na data da operação.' }
    ],
    quickActions: [
      { id: 'transp-regras-overview', label: 'Explique esta tela', kind: 'local', intent: 'screen_overview', icon: 'mdi-compass-outline' }
    ],
    relatedRoutes: [
      { label: 'Watch regulatório', to: '/transporte/watch', description: 'De onde vêm as propostas de mudança de regra.' }
    ]
  },
  TransporteWatchList: {
    title: 'Watch regulatório',
    description: 'Mudanças normativas detectadas nas fontes oficiais, aguardando revisão humana.',
    purpose: 'Revisar e aprovar mudanças antes de valerem no motor.',
    fieldHints: [
      { label: 'Fila', description: 'detected → ingested → analisado pela IA → revisão humana → aprovado → ativo.' }
    ],
    quickActions: [
      { id: 'transp-watch-overview', label: 'Explique esta tela', kind: 'local', intent: 'screen_overview', icon: 'mdi-compass-outline' }
    ],
    relatedRoutes: [
      { label: 'Regras regulatórias', to: '/transporte/regras', description: 'O catálogo que o Watch alimenta.' }
    ]
  },
  TransporteWatchDetalhe: {
    title: 'Detalhe do item de Watch',
    description: 'Uma mudança normativa detectada: fonte, análise da IA e a decisão humana de aplicar ou descartar.',
    purpose: 'Decidir com contexto — a IA sugere, o humano aprova.',
    fieldHints: [
      { label: 'Análise', description: 'AI_ANALYZED traz o resumo da mudança; AI_SKIPPED significa análise indisponível (sem chave de IA).' }
    ],
    quickActions: [
      { id: 'transp-watchdet-overview', label: 'Explique esta tela', kind: 'local', intent: 'screen_overview', icon: 'mdi-compass-outline' }
    ],
    relatedRoutes: [
      { label: 'Watch regulatório', to: '/transporte/watch', description: 'Voltar à fila.' }
    ]
  },
  TransportePisoTabelas: {
    title: 'Tabelas de piso',
    description: 'As versões da tabela de piso mínimo de frete (Res. ANTT) carregadas no sistema.',
    purpose: 'Consultar o piso vigente que o motor usa nos cálculos.',
    fieldHints: [
      { label: 'Revisão', description: 'Tabelas em pending_review mantêm o motor em modo aviso (shadow) até a revisão jurídica.' }
    ],
    quickActions: [
      { id: 'transp-piso-overview', label: 'Explique esta tela', kind: 'local', intent: 'screen_overview', icon: 'mdi-compass-outline' }
    ],
    relatedRoutes: [
      { label: 'Minhas operações', to: '/transporte/operacoes', description: 'O piso aparece na conformidade de cada viagem.' }
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
