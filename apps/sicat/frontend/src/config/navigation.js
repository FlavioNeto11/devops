/**
 * Fonte declarativa única de navegação principal do SICAT.
 *
 * Consumida por desktop (SicatNavigation) e mobile (SicatMobileDrawer).
 * Organização por grupos de intenção, agrupados por módulo (operacao, sistema,
 * administracao). A separação de audiências é feita por permissão:
 *   - "Operação": sempre visível (operador parceiro).
 *   - "Sistema" e "Administração": só com canAccessAdmin (SRE/admin).
 *
 * Cada grupo: { id, label, icon, kind: 'direct' | 'group', module, items?, to?, hidden? }
 * Cada item:  { to, label, icon, description?, requiresAdminAccess?, hidden? }
 *
 * `hidden` no GRUPO (não só no item) existe por causa da vertical Transporte
 * (DL-103, Onda 1.5/PR-F1): o grupo inteiro precisa sumir do menu quando
 * `VITE_FEATURE_TRANSPORTE` está desligada — não faz sentido esconder item a
 * item um grupo que só tem itens atrás da mesma flag.
 */

import { TRANSPORTE_FEATURE_FLAG } from '../lib/feature-flags.js';

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
    labelByPersona: { receiver: 'Receber manifestos', carrier: 'Manifestos das viagens' },
    items: [
      {
        to: '/manifestos',
        label: 'Meus manifestos',
        icon: 'mdi-file-document-multiple-outline',
        description: 'Ver e acompanhar os manifestos',
        labelByPersona: { receiver: 'Receber / dar baixa' },
        descriptionByPersona: {
          receiver: 'Confirmar o recebimento dos manifestos',
          carrier: 'Acompanhar os MTRs que viajam com a sua carga'
        }
      },
      {
        to: '/manifestos/novo',
        label: 'Criar manifesto',
        icon: 'mdi-file-plus-outline',
        description: 'Criar e enviar um novo manifesto',
        personas: ['generator']
      },
      {
        // Nomenclatura única do conceito (menu, breadcrumb, aba do navegador):
        // "Relatórios de MTR".
        to: '/relatorios/mtrs',
        label: 'Relatórios de MTR',
        icon: 'mdi-chart-box-outline',
        description: 'Resumo dos seus manifestos'
      }
    ]
  },
  {
    // Nomenclatura única do conceito (menu, breadcrumb, título e botão da tela):
    // "MTR provisório" — é como a CETESB o chama e como o glossário registra.
    id: 'mtr-provisorio',
    label: 'MTR provisório',
    icon: 'mdi-file-clock-outline',
    kind: 'direct',
    module: 'operacao',
    to: '/mtr-provisorio',
    glossaryKey: 'mtr_provisorio',
    description: 'Quando precisa sair sem tudo pronto',
    personas: ['generator']
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
    personas: ['receiver'],
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
    // MÓDULO do Transportador (REQ-SICAT-0032, plano 2026-08-15): a vertical
    // Transporte (DL-103) deixou de ser um grupo plano de operador genérico e
    // virou o módulo da persona `carrier` — mesmo mecanismo que faz Gerador e
    // Destinador serem "módulos" (recorte de persona + home + didática). Os
    // grupos abaixo ganham itens conforme as telas nascem (regra do produto:
    // menu NUNCA aponta para tela inexistente): "Registrar viagem" entra com a
    // tela de criação; Motoristas/Seguros/Habilitação entram nas ondas F6-F9.
    // Atrás de VITE_FEATURE_TRANSPORTE (default desligada) — `hidden` some com
    // os grupos até a flag ligar; persona vazia mantém fail-open e vê tudo.
    id: 'transporte-operacoes',
    label: 'Operações',
    icon: 'mdi-truck-fast-outline',
    kind: 'group',
    module: 'operacao',
    hidden: !TRANSPORTE_FEATURE_FLAG,
    personas: ['carrier'],
    glossaryKey: 'operacao_transporte',
    items: [
      {
        to: '/transporte/operacoes/nova',
        label: 'Registrar viagem',
        icon: 'mdi-plus-circle-outline',
        description: 'Criar uma operação de transporte'
      },
      {
        to: '/transporte/operacoes',
        label: 'Minhas operações',
        icon: 'mdi-truck-fast-outline',
        description: 'Acompanhar as viagens e a conformidade regulatória'
      },
      {
        to: '/transporte/pendencias',
        label: 'Pendências',
        icon: 'mdi-clipboard-alert-outline',
        description: 'Tudo que precisa da sua ação, num só lugar'
      }
    ]
  },
  {
    id: 'transporte-frota',
    label: 'Frota',
    icon: 'mdi-truck-outline',
    kind: 'group',
    module: 'operacao',
    hidden: !TRANSPORTE_FEATURE_FLAG,
    personas: ['carrier'],
    glossaryKey: 'frota',
    items: [
      {
        to: '/transporte/veiculos',
        label: 'Veículos',
        icon: 'mdi-truck-outline',
        description: 'Cadastro de veículos usados nas operações'
      },
      {
        // Onda F6 (REQ-SICAT-0033/0037): entra ENTRE Veículos e
        // Transportadores — a ordem conta a história da frota (o quê → quem
        // dirige → para quem dirige).
        to: '/transporte/motoristas',
        label: 'Motoristas',
        icon: 'mdi-card-account-details-outline',
        description: 'CNH, vínculo (frota/agregado) e situação do motorista'
      },
      {
        to: '/transporte/transportadores',
        label: 'Transportadores',
        icon: 'mdi-account-hard-hat-outline',
        description: 'Terceiros e agregados: RNTRC, seguros e PGR'
      }
    ]
  },
  {
    // Seguros (ondas F7/F8 — REQ-SICAT-0034/0035/0037). Entra ENTRE Frota e
    // Habilitação porque essa é a ordem do circuito real do TRC: monta a frota
    // → cobre a carga → prova a habilitação. "Averbações" vem PRIMEIRO por ser
    // o que se faz toda viagem; apólices e apuração são cadastro e fechamento,
    // olhados de vez em quando.
    id: 'transporte-seguros',
    label: 'Seguros',
    icon: 'mdi-shield-check-outline',
    kind: 'group',
    module: 'operacao',
    hidden: !TRANSPORTE_FEATURE_FLAG,
    personas: ['carrier'],
    glossaryKey: 'averbacao',
    items: [
      {
        to: '/transporte/seguros/averbacoes',
        label: 'Averbações',
        icon: 'mdi-shield-check-outline',
        description: 'As viagens averbadas, com taxa aplicada e prêmio devido'
      },
      {
        to: '/transporte/seguros/apolices',
        label: 'Apólices',
        icon: 'mdi-file-document-check-outline',
        description: 'Vigência, limite por viagem, taxa e custo mínimo mensal'
      },
      {
        to: '/transporte/seguros/apuracao',
        label: 'Apuração mensal',
        icon: 'mdi-calendar-month-outline',
        description: 'A conta do mês: soma dos prêmios contra o custo mínimo'
      }
    ]
  },
  {
    id: 'transporte-regulatorio',
    label: 'Habilitação e regras',
    icon: 'mdi-gavel',
    kind: 'group',
    module: 'operacao',
    hidden: !TRANSPORTE_FEATURE_FLAG,
    personas: ['carrier'],
    glossaryKey: 'rntrc',
    items: [
      {
        to: '/transporte/regras',
        label: 'Regras regulatórias',
        icon: 'mdi-gavel',
        description: 'Consultar o catálogo de regras TR-* e sua vigência'
      },
      {
        to: '/transporte/watch',
        label: 'Watch regulatório',
        icon: 'mdi-radar',
        description: 'Fila de mudanças normativas detectadas em fontes monitoradas'
      },
      {
        to: '/transporte/piso/tabelas',
        label: 'Tabelas de piso',
        icon: 'mdi-table',
        description: 'Versões de tabela de piso mínimo de frete carregadas'
      }
    ]
  },
  {
    // Nomenclatura única do conceito: "Assistente" (menu, aba do chat e o botão
    // flutuante). O que ele faz fica na descrição, não em um segundo nome.
    // Virou grupo na fase 02 de whatsapp-channel-sicat: o assistente passou a ter
    // dois lugares — a conversa e o canal por onde ela chega.
    id: 'conversacional',
    label: 'Assistente',
    icon: 'mdi-chat-processing-outline',
    kind: 'group',
    module: 'operacao',
    items: [
      {
        to: '/conversacional/chat',
        label: 'Conversar',
        icon: 'mdi-chat-processing-outline',
        description: 'Tire dúvidas e peça ajuda com a operação'
      },
      {
        to: '/perfil/canais',
        label: 'WhatsApp',
        icon: 'mdi-whatsapp',
        description: 'Vincule seu número para falar pelo WhatsApp'
      }
    ]
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
        label: 'Relatórios de MTR (SRE)',
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
const PERSONA_TYPES = ['generator', 'carrier', 'receiver'];

// Um nó (grupo/item) é permitido se não declara `personas`, ou se o tipo da conta
// está na lista. Tipo não resolvido (vazio/desconhecido) NÃO restringe nada.
function personaAllows(node, accountType) {
  if (!node.personas || !node.personas.length) return true;
  if (!PERSONA_TYPES.includes(accountType)) return true;
  return node.personas.includes(accountType);
}

// Aplica rótulo/descrição específicos do perfil, se houver (ex.: "Receber manifestos"
// para o destinador). Retorna o mesmo nó quando não há override.
function applyPersonaLabel(node, accountType) {
  const label = node.labelByPersona && node.labelByPersona[accountType];
  const description = node.descriptionByPersona && node.descriptionByPersona[accountType];
  if (!label && !description) return node;
  return { ...node, ...(label ? { label } : {}), ...(description ? { description } : {}) };
}

export function filterNavigationGroups({ canAccessAdmin = false, accountType = '' } = {}) {
  const type = String(accountType || '').toLowerCase();
  return NAVIGATION_GROUPS
    .map((group) => {
      // Grupo inteiro atrás de feature flag (ex.: "Transporte" — DL-103/PR-F1).
      if (group.hidden) {
        return null;
      }
      // Admin/SRE é persona de sistema: não enxerga o módulo "Operação" (telas de operador).
      if (canAccessAdmin && group.module === 'operacao') {
        return null;
      }
      if (group.requiresAdminAccess && !canAccessAdmin) {
        return null;
      }
      if (!personaAllows(group, type)) {
        return null;
      }

      if (group.kind === 'direct') {
        return applyPersonaLabel(group, type);
      }

      const items = (group.items || [])
        .filter((item) => {
          if (item.hidden) return false;
          if (item.requiresAdminAccess && !canAccessAdmin) return false;
          if (!personaAllows(item, type)) return false;
          return true;
        })
        .map((item) => applyPersonaLabel(item, type));

      if (!items.length) return null;
      return applyPersonaLabel({ ...group, items }, type);
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
const PREFIX_MATCH_PATHS = [
  '/manifestos', '/dmr', '/mtr-provisorio', '/operacao/auditoria',
  '/transporte/operacoes', '/transporte/transportadores', '/transporte/motoristas', '/transporte/watch',
  // Prefixo do grupo Seguros (ondas F7/F8): reservado para as subrotas que
  // nasçam sob `/transporte/seguros/*` (ex.: um extrato de período com rota
  // própria) sem quebrar o destaque do item-pai no menu.
  '/transporte/seguros'
];

/**
 * Subrotas que possuem item de navegação próprio e, portanto, NÃO devem
 * ativar o item-pai por correspondência de prefixo.
 */
const EXACT_CHILD_OVERRIDES = {
  '/manifestos': ['/manifestos/novo'],
  '/dmr': ['/dmr/novo', '/dmr/pendentes'],
  '/transporte/operacoes': ['/transporte/operacoes/nova']
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
