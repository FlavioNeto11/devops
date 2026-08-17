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
 * A onda F7 acrescentou SEGUROS (a visão consolidada de apólices nasceu com
 * ela); na F9 o passo de HABILITAÇÃO passou a apontar para `/transporte/
 * habilitacao` — a tela que agora existe e diz o que falta para operar (ela
 * mesma leva ao cadastro quando não há transportador). Regra do produto:
 * checklist nunca aponta para tela inexistente.
 *
 * A ordem é a do circuito real do TRC, e seguros vem ANTES de operar de
 * propósito: registrar a viagem sem apólice vigente produz uma operação que
 * trava no pré-embarque (TR-SEG-004/005). O checklist evita esse beco.
 */
export function buildCarrierChecklist({
  carriersCount = 0,
  vehiclesCount = 0,
  activePoliciesCount = 0,
  operationsCount = 0
} = {}) {
  return [
    {
      key: 'habilitacao',
      label: 'Cadastre sua transportadora',
      description: 'Transportador com RNTRC no cadastro — a base da habilitação.',
      done: Number(carriersCount) > 0,
      to: '/transporte/habilitacao'
    },
    {
      key: 'frota',
      label: 'Monte a frota',
      description: 'Cadastre ao menos um veículo usado nas viagens.',
      done: Number(vehiclesCount) > 0,
      to: '/transporte/veiculos'
    },
    {
      key: 'seguros',
      label: 'Garanta a cobertura da carga',
      description: 'Uma apólice vigente com limite por viagem e taxa de averbação cadastrados.',
      done: Number(activePoliciesCount) > 0,
      to: '/transporte/seguros/apolices'
    },
    {
      key: 'operar',
      label: 'Registre a primeira viagem',
      description: 'Com cadastro, frota e seguro em dia, a operação entra no radar da conformidade.',
      done: Number(operationsCount) > 0,
      to: '/transporte/operacoes/nova'
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
 * Os destinos apontam para telas EXISTENTES nesta onda; na F9 o item de RNTRC
 * desatualizado passou a levar a `/transporte/habilitacao`, onde o botão
 * "Verificar agora" resolve o aviso em um clique — antes ele parava na LISTA de
 * transportadores, que só mostra o problema sem oferecer a ação.
 *
 * `pendingDeclarationsCount` vem de FORA do overview: o Centro Operacional não
 * agrega averbações (o endpoint nasceu na I3, depois do overview), então quem
 * renderiza a home conta pelo extrato (`countPendingInsuranceDeclarations`).
 * Mantê-lo como argumento — em vez de ler `overview.averbacoes` que não existe
 * — evita um zero silencioso escondendo viagem descoberta.
 */
export function buildCarrierAttention(overview, { cap = 4, pendingDeclarationsCount = 0 } = {}) {
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
      to: '/transporte/seguros/apolices'
    });
  }
  const pendingDeclarations = Number(pendingDeclarationsCount || 0);
  if (pendingDeclarations > 0) {
    items.push({
      key: 'averbacoes-pendentes',
      tone: 'warning',
      icon: 'mdi-shield-sync-outline',
      title: `${pendingDeclarations} ${pendingDeclarations === 1 ? 'averbação sem confirmação' : 'averbações sem confirmação'}`,
      description: 'A seguradora ainda não confirmou o registro — a carga pode estar sem cobertura efetiva.',
      actionLabel: 'Acompanhar',
      to: '/transporte/seguros/averbacoes'
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
      to: '/transporte/habilitacao'
    });
  }

  items.sort((a, b) => ATTENTION_TONE_ORDER[a.tone] - ATTENTION_TONE_ORDER[b.tone]);
  return { items: items.slice(0, cap), totalCount: items.length };
}

/**
 * Hub "O que você quer fazer?" — a ação primária do Transportador é REGISTRAR
 * a viagem (tela da onda F3); acompanhar vem em seguida com o badge das
 * operações em aberto. A onda F7 acrescentou "Averbar viagens" como quarta
 * ação, posicionada ANTES de "Tirar uma dúvida": ajuda é o balde final do hub
 * em todas as personas, então uma ação de operação nunca entra depois dela.
 * Trava de teste garante que todo destino existe no router.
 */
export function buildCarrierHubActions({ openOperationsCount = 0 } = {}) {
  return [
    {
      key: 'registrar',
      icon: 'mdi-plus-circle-outline',
      tone: 'primary',
      title: 'Registrar uma viagem',
      description: 'Criar a operação de transporte com origem e destino.',
      to: '/transporte/operacoes/nova'
    },
    {
      key: 'operacoes',
      icon: 'mdi-truck-fast-outline',
      tone: 'info',
      title: 'Acompanhar minhas operações',
      description: 'Ver as viagens e a conformidade de cada uma.',
      to: '/transporte/operacoes',
      badge: Number(openOperationsCount) > 0 ? Number(openOperationsCount) : ''
    },
    {
      key: 'averbar',
      icon: 'mdi-shield-check-outline',
      tone: 'success',
      title: 'Averbar viagens',
      description: 'Ver as viagens averbadas e o prêmio de cada uma.',
      to: '/transporte/seguros/averbacoes'
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
