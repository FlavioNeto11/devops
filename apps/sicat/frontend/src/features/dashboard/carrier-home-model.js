/**
 * Modelo PURO da home do Transportador (REQ-SICAT-0032) — sem Vue, sem stores,
 * importável em node:test (mesmo racional de lib/persona-access.js): a lógica
 * de jornada (checklist de onboarding, "o que precisa da sua atenção" e hub)
 * é decisão de produto testável; o componente só renderiza o resultado.
 *
 * Fontes de dado: o overview do Centro Operacional
 * (GET /v1/transporte/operations/overview — shape consumido também por
 * TransportePendenciasView) e contagens simples das listas da vertical.
 * Tudo defensivo: overview nulo/parcial não pode quebrar a home.
 */

/** Soma o mapa operationsByStatus do overview (mesma conta da tela de Pendências). */
export function countOperations(overview) {
  const map = overview?.operationsByStatus || {};
  return Object.values(map).reduce((sum, count) => sum + Number(count || 0), 0);
}

/**
 * Checklist "Deixe sua transportadora pronta" — passos DERIVADOS DE DADOS, não
 * de localStorage (o armazenamento local só colapsa o card depois de completo).
 * v1 (onda F2) usa apenas fontes que já existem: transportadores, veículos e
 * operações. O passo de SEGUROS entra na onda F7 (quando a visão consolidada
 * de apólices nasce) e o de HABILITAÇÃO aponta para a tela própria na F9 —
 * regra do produto: checklist nunca aponta para tela inexistente.
 */
export function buildCarrierChecklist({ carriersCount = 0, vehiclesCount = 0, operationsCount = 0 } = {}) {
  return [
    {
      key: 'habilitacao',
      label: 'Cadastre sua transportadora',
      description: 'Transportador com RNTRC no cadastro — a base da habilitação.',
      done: Number(carriersCount) > 0,
      to: '/transporte/transportadores'
    },
    {
      key: 'frota',
      label: 'Monte a frota',
      description: 'Cadastre ao menos um veículo usado nas viagens.',
      done: Number(vehiclesCount) > 0,
      to: '/transporte/veiculos'
    },
    {
      key: 'operar',
      label: 'Registre a primeira viagem',
      description: 'Com cadastro e frota em dia, a operação entra no radar da conformidade.',
      done: Number(operationsCount) > 0,
      to: '/transporte/operacoes'
    }
  ];
}

export function isChecklistComplete(steps) {
  return Array.isArray(steps) && steps.length > 0 && steps.every((step) => step.done);
}

const ATTENTION_TONE_ORDER = { error: 0, warning: 1, info: 2 };

/**
 * "O que precisa da sua atenção" — mesma semântica do card do dashboard MTR:
 * cada item é ACIONÁVEL (deep-link) e ordenado por severidade, com teto de
 * exibição (o rodapé aponta para a tela de Pendências, que é a visão completa).
 * Os destinos apontam para telas EXISTENTES nesta onda; F7/F9 re-apontam
 * seguros/habilitação para as telas próprias quando elas nascerem.
 */
export function buildCarrierAttention(overview, { cap = 4 } = {}) {
  const items = [];
  const blockedOperations = Number(overview?.operationsByStatus?.blocked || 0);
  const invalidFiscal = Number(overview?.fiscalDocuments?.invalid || 0);
  const jobsStuck = Number(overview?.jobs?.retryWait || 0) + Number(overview?.jobs?.dlq || 0);
  const ciotPending = Number(overview?.ciot?.unconfirmedPending || 0);
  const insuranceExpiring = Number(overview?.insurance?.expiringOrExpiredCount || 0);
  const rntrcStale = Number(overview?.rntrc?.staleCarriers || 0);

  if (blockedOperations > 0) {
    items.push({
      key: 'blocked-operations',
      tone: 'error',
      icon: 'mdi-truck-alert-outline',
      title: `${blockedOperations} ${blockedOperations === 1 ? 'operação bloqueada' : 'operações bloqueadas'}`,
      description: 'Alguma regra impediu a liberação. Veja o motivo e corrija.',
      actionLabel: 'Resolver',
      to: '/transporte/pendencias'
    });
  }
  if (invalidFiscal > 0) {
    items.push({
      key: 'fiscal-invalid',
      tone: 'error',
      icon: 'mdi-file-alert-outline',
      title: `${invalidFiscal} ${invalidFiscal === 1 ? 'documento fiscal inválido' : 'documentos fiscais inválidos'}`,
      description: 'NF-e/CT-e/MDF-e com problema de validação na importação.',
      actionLabel: 'Revisar',
      to: '/transporte/pendencias'
    });
  }
  if (jobsStuck > 0) {
    items.push({
      key: 'jobs-stuck',
      tone: 'error',
      icon: 'mdi-tray-alert',
      title: `${jobsStuck} ${jobsStuck === 1 ? 'processamento parado' : 'processamentos parados'}`,
      description: 'Jobs em retry ou na fila de erros aguardando ação.',
      actionLabel: 'Ver fila',
      to: '/transporte/pendencias'
    });
  }
  if (ciotPending > 0) {
    items.push({
      key: 'ciot-pending',
      tone: 'warning',
      icon: 'mdi-file-question-outline',
      title: `${ciotPending} CIOT sem confirmação`,
      description: 'A resposta do provedor não chegou — acompanhe a reconciliação.',
      actionLabel: 'Acompanhar',
      to: '/transporte/pendencias'
    });
  }
  if (insuranceExpiring > 0) {
    items.push({
      key: 'insurance-expiring',
      tone: 'warning',
      icon: 'mdi-shield-alert-outline',
      title: `${insuranceExpiring} ${insuranceExpiring === 1 ? 'apólice vencendo ou vencida' : 'apólices vencendo ou vencidas'}`,
      description: 'Sem apólice vigente a viagem fica descoberta.',
      actionLabel: 'Ver seguros',
      to: '/transporte/transportadores'
    });
  }
  if (rntrcStale > 0) {
    items.push({
      key: 'rntrc-stale',
      tone: 'warning',
      icon: 'mdi-shield-search-outline',
      title: `${rntrcStale} ${rntrcStale === 1 ? 'RNTRC desatualizado' : 'RNTRCs desatualizados'}`,
      description: 'Verificação antiga — confirme se o registro segue regular.',
      actionLabel: 'Verificar',
      to: '/transporte/transportadores'
    });
  }

  items.sort((a, b) => ATTENTION_TONE_ORDER[a.tone] - ATTENTION_TONE_ORDER[b.tone]);
  return { items: items.slice(0, cap), totalCount: items.length };
}

/**
 * Hub "O que você quer fazer?" — v1 sem "Registrar viagem": a tela de criação
 * nasce na onda F3, e o hub NUNCA aponta para rota inexistente. F3 promove a
 * criação a ação primária e rebaixa "Acompanhar" para segunda posição.
 */
export function buildCarrierHubActions({ openOperationsCount = 0 } = {}) {
  return [
    {
      key: 'operacoes',
      icon: 'mdi-truck-fast-outline',
      tone: 'primary',
      title: 'Acompanhar minhas operações',
      description: 'Ver as viagens e a conformidade de cada uma.',
      to: '/transporte/operacoes',
      badge: Number(openOperationsCount) > 0 ? Number(openOperationsCount) : ''
    },
    {
      key: 'pendencias',
      icon: 'mdi-clipboard-alert-outline',
      tone: 'info',
      title: 'Ver pendências',
      description: 'Tudo que precisa da sua ação, num só lugar.',
      to: '/transporte/pendencias'
    },
    {
      key: 'ajuda',
      icon: 'mdi-chat-processing-outline',
      tone: 'warning',
      title: 'Tirar uma dúvida',
      description: 'Perguntar ao assistente.',
      to: '/conversacional/chat'
    }
  ];
}

/** Operações "em aberto" = tudo que não é terminal (concluída/cancelada). */
export function countOpenOperations(overview) {
  const map = overview?.operationsByStatus || {};
  return Object.entries(map).reduce((sum, [status, count]) => {
    if (status === 'completed' || status === 'cancelled') return sum;
    return sum + Number(count || 0);
  }, 0);
}
