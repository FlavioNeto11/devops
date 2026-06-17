/**
 * Fonte declarativa única de navegação principal do SICAT.
 *
 * Consumida por desktop (SicatNavigation) e mobile (SicatMobileDrawer).
 * Organização por grupos de intenção, agrupados por módulo (operacao, sistema,
 * administracao). A separação de audiências é feita por permissão:
 *   - "Operação": sempre visível (operador parceiro).
 *   - "Sistema" e "Administração": só com canAccessAdmin (SRE/admin).
 *
 * Cada grupo: { id, label, icon, kind: 'direct' | 'group', module, items?, to? }
 * Cada item:  { to, label, icon, description?, requiresAdminAccess?, hidden? }
 */

export const NAVIGATION_MODULES = [
  { id: 'operacao', label: 'Operação' },
  { id: 'sistema', label: 'Sistema' },
  { id: 'administracao', label: 'Administração' }
];

export const NAVIGATION_GROUPS = [
  {
    id: 'home',
    label: 'Início',
    icon: 'mdi-home-outline',
    kind: 'direct',
    module: 'operacao',
    to: '/dashboard',
    description: 'Veja o que fazer hoje'
  },
  {
    id: 'mtr',
    label: 'Manifestos (MTR)',
    icon: 'mdi-file-document-multiple-outline',
    kind: 'group',
    module: 'operacao',
    glossaryKey: 'mtr',
    items: [
      {
        to: '/manifestos',
        label: 'Meus manifestos',
        icon: 'mdi-file-document-multiple-outline',
        description: 'Ver e acompanhar os manifestos'
      },
      {
        to: '/manifestos/novo',
        label: 'Criar manifesto',
        icon: 'mdi-file-plus-outline',
        description: 'Criar e enviar um novo manifesto'
      },
      {
        to: '/relatorios/mtrs',
        label: 'Relatórios',
        icon: 'mdi-chart-box-outline',
        description: 'Resumo dos seus manifestos'
      }
    ]
  },
  {
    id: 'mtr-provisorio',
    label: 'Manifesto de emergência',
    icon: 'mdi-file-clock-outline',
    kind: 'direct',
    module: 'operacao',
    to: '/mtr-provisorio',
    glossaryKey: 'mtr_provisorio',
    description: 'Quando precisa sair sem tudo pronto'
  },
  {
    id: 'dmr',
    label: 'Declaração mensal (DMR)',
    icon: 'mdi-file-tree-outline',
    kind: 'group',
    module: 'operacao',
    glossaryKey: 'dmr',
    items: [
      {
        to: '/dmr',
        label: 'Minhas declarações',
        icon: 'mdi-file-tree-outline',
        description: 'Ver as declarações já feitas'
      },
      {
        to: '/dmr/pendentes',
        label: 'Pendentes',
        icon: 'mdi-clock-alert-outline',
        description: 'Declarações que precisam de ação'
      },
      {
        to: '/dmr/novo',
        label: 'Criar declaração',
        icon: 'mdi-file-plus-outline',
        description: 'Fazer uma nova declaração'
      }
    ]
  },
  {
    id: 'cdf',
    label: 'Certificados (CDF)',
    icon: 'mdi-certificate-outline',
    kind: 'group',
    module: 'operacao',
    glossaryKey: 'cdf',
    items: [
      {
        to: '/cdf',
        label: 'Meus certificados',
        icon: 'mdi-file-certificate-outline',
        description: 'Ver e baixar os certificados'
      },
      {
        to: '/cdf/novo',
        label: 'Gerar certificado',
        icon: 'mdi-file-plus-outline',
        description: 'Pedir um novo certificado à CETESB'
      }
    ]
  },
  {
    id: 'conversacional',
    label: 'Tirar dúvidas',
    icon: 'mdi-chat-processing-outline',
    kind: 'direct',
    module: 'operacao',
    to: '/conversacional/chat',
    description: 'Pergunte ao assistente'
  },
  {
    id: 'sistema',
    label: 'Sistema',
    icon: 'mdi-shield-search-outline',
    kind: 'group',
    module: 'sistema',
    requiresAdminAccess: true,
    items: [
      {
        to: '/operacao/dashboard',
        label: 'Visão geral',
        icon: 'mdi-view-grid-outline',
        description: 'Saúde operacional consolidada',
        requiresAdminAccess: true
      },
      {
        to: '/sistema/jobs',
        label: 'Jobs',
        icon: 'mdi-engine-outline',
        description: 'Monitorar, requeue e DLQ',
        requiresAdminAccess: true
      },
      {
        to: '/sistema/ai-control',
        label: 'AI Control Center',
        icon: 'mdi-robot-outline',
        description: 'Governança, observabilidade e runtime da IA',
        requiresAdminAccess: true
      },
      {
        to: '/operacao/auditoria',
        label: 'Auditoria',
        icon: 'mdi-text-search',
        description: 'Trilha de correlação fim-a-fim',
        requiresAdminAccess: true
      },
      {
        to: '/operacao/cetesb-health',
        label: 'Saúde CETESB',
        icon: 'mdi-pulse',
        description: 'Status das contas integradas',
        requiresAdminAccess: true
      },
      {
        to: '/operacao/relatorios/mtr',
        label: 'Relatórios MTR (SRE)',
        icon: 'mdi-file-chart-outline',
        description: 'Relatório técnico de MTRs',
        requiresAdminAccess: true
      },
      {
        to: '/operacao/command-center',
        label: 'Command Center',
        icon: 'mdi-flash-outline',
        description: 'Ações globais e orquestração',
        requiresAdminAccess: true
      }
    ]
  },
  {
    id: 'admin',
    label: 'Administração',
    icon: 'mdi-shield-account-outline',
    kind: 'group',
    module: 'administracao',
    requiresAdminAccess: true,
    items: [
      {
        to: '/admin/acessos',
        label: 'Acessos',
        icon: 'mdi-shield-key-outline',
        description: 'Usuários, perfis, permissões e sessões',
        requiresAdminAccess: true
      }
    ]
  }
];

/**
 * Filtra grupos e itens por permissões do usuário.
 *
 * @param {object} options
 * @param {boolean} options.canAccessAdmin
 * @returns {Array} grupos visíveis, com itens filtrados.
 */
export function filterNavigationGroups({ canAccessAdmin = false } = {}) {
  return NAVIGATION_GROUPS
    .map((group) => {
      // Admin/SRE é persona de sistema: não enxerga o módulo "Operação" (telas de operador).
      if (canAccessAdmin && group.module === 'operacao') {
        return null;
      }
      if (group.requiresAdminAccess && !canAccessAdmin) {
        return null;
      }

      if (group.kind === 'direct') {
        return group;
      }

      const items = (group.items || []).filter((item) => {
        if (item.hidden) return false;
        if (item.requiresAdminAccess && !canAccessAdmin) return false;
        return true;
      });

      if (!items.length) return null;
      return { ...group, items };
    })
    .filter(Boolean);
}

/**
 * Achata todos os itens visíveis (útil para matching de rota ativa
 * e para o drawer mobile).
 *
 * @param {Array} groups
 * @returns {Array<{ to: string, label: string, icon: string, groupId: string, groupLabel: string }>}
 */
export function flattenNavigation(groups) {
  const flat = [];
  for (const group of groups) {
    if (group.kind === 'direct') {
      flat.push({
        to: group.to,
        label: group.label,
        icon: group.icon,
        groupId: group.id,
        groupLabel: group.label
      });
      continue;
    }

    for (const item of group.items) {
      flat.push({
        to: item.to,
        label: item.label,
        icon: item.icon,
        groupId: group.id,
        groupLabel: group.label
      });
    }
  }
  return flat;
}

/**
 * Rotas que correspondem a si mesmas e às suas subrotas (ex: detalhe).
 */
const PREFIX_MATCH_PATHS = ['/manifestos', '/dmr', '/mtr-provisorio', '/operacao/auditoria'];

/**
 * Subrotas que possuem item de navegação próprio e, portanto, NÃO devem
 * ativar o item-pai por correspondência de prefixo.
 */
const EXACT_CHILD_OVERRIDES = {
  '/manifestos': ['/manifestos/novo'],
  '/dmr': ['/dmr/novo', '/dmr/pendentes']
};

/**
 * Verifica se uma rota corresponde ao item de navegação. Itens com subrotas
 * próprias (ex: "Emitir MTR" em /manifestos/novo) recebem match exato e não
 * acendem o item-pai.
 */
export function isNavigationItemActive(currentPath, itemPath) {
  if (!currentPath || !itemPath) return false;

  if (currentPath === itemPath) return true;

  if (PREFIX_MATCH_PATHS.includes(itemPath)) {
    if (!currentPath.startsWith(`${itemPath}/`)) return false;
    const overrides = EXACT_CHILD_OVERRIDES[itemPath] || [];
    if (overrides.includes(currentPath)) return false;
    return true;
  }

  return false;
}

/**
 * Retorna o grupo ativo dado o path atual, útil para destacar o dropdown
 * correspondente no topbar desktop.
 */
export function findActiveGroup(groups, currentPath) {
  for (const group of groups) {
    if (group.kind === 'direct' && isNavigationItemActive(currentPath, group.to)) {
      return group;
    }
    if (group.kind === 'group') {
      const match = group.items.find((item) => isNavigationItemActive(currentPath, item.to));
      if (match) return group;
    }
  }
  return null;
}

/**
 * Agrupa os grupos de navegação visíveis por módulo, preservando a ordem
 * declarativa de NAVIGATION_MODULES. Grupos sem `module` recaem em
 * `operacao` para manter compatibilidade.
 *
 * @param {Array} groups grupos já filtrados por permissão
 * @returns {Array<{ moduleId: string, moduleLabel: string, groups: Array }>}
 */
export function groupNavigationByModule(groups) {
  const buckets = new Map(NAVIGATION_MODULES.map((mod) => [mod.id, { ...mod, groups: [] }]));

  for (const group of groups) {
    const moduleId = group.module || 'operacao';
    const bucket = buckets.get(moduleId) || buckets.get('operacao');
    if (bucket) {
      bucket.groups.push(group);
    }
  }

  return Array.from(buckets.values())
    .map(({ id, label, groups: groupItems }) => ({
      moduleId: id,
      moduleLabel: label,
      groups: groupItems
    }))
    .filter((bucket) => bucket.groups.length > 0);
}
