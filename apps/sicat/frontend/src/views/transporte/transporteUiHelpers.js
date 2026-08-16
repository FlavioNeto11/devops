/**
 * Helpers de UI para a vertical Transporte (DL-103, programa "SICAT
 * Transporte", Onda 1.5/PR-F1 — frontend mínimo).
 *
 * Módulo PURO (sem Vue, sem store, sem DOM) — testável em
 * `frontend/tests/unit/transporte-ui-helpers.test.js`. Rótulos de status
 * reaproveitam `lib/status-map.js` (domínios `transport-operation` e
 * `compliance`) para não duplicar vocabulário; o que vive aqui é o que o
 * status-map não cobre: opções de filtro, rótulos de gate/domínio regulatório,
 * mapeamento de comando → botão e formatação de moeda/data.
 */

import { resolveStatusLabel } from '../../lib/status-map.js';

// ---------------------------------------------------------------------------
// Status da operação (máquina de estados de TransportOperation — 13 estados).
// ---------------------------------------------------------------------------

const TRANSPORT_OPERATION_STATUSES = Object.freeze([
  'draft',
  'validating',
  'blocked',
  'ready_for_contract',
  'contracted',
  'ciot_pending',
  'ciot_registered',
  'fiscal_pending',
  'ready_for_release',
  'in_transit',
  'completion_pending',
  'completed',
  'cancelled'
]);

export const TRANSPORT_OPERATION_STATUS_OPTIONS = Object.freeze([
  { value: '', label: 'Todos' },
  ...TRANSPORT_OPERATION_STATUSES.map((value) => ({
    value,
    label: resolveStatusLabel('transport-operation', value)
  }))
]);

export function operationStatusLabel(status) {
  return resolveStatusLabel('transport-operation', status);
}

export function complianceStatusLabel(status) {
  return resolveStatusLabel('compliance', status);
}

/**
 * Tom do `SicatInlineAlert` para UM check/avaliação de conformidade.
 * NOT_APPLICABLE vira 'info' aqui (não é um problema, é uma regra que não se
 * aplica) — diferente do tone 'neutral' do badge (`lib/status-map.js`), que é
 * neutro por natureza do componente. Mantido separado de propósito: o
 * status-map decide a cor do BADGE; este helper decide o TOM DO ALERTA.
 */
export function complianceAlertTone(status) {
  const key = String(status || '').trim().toUpperCase();
  if (key === 'PASS') return 'success';
  if (key === 'WARN') return 'warning';
  if (key === 'BLOCK') return 'error';
  return 'info';
}

// ---------------------------------------------------------------------------
// Gates do motor de compliance (8 gates, ordem canônica do programa).
// ---------------------------------------------------------------------------

export const COMPLIANCE_GATES = Object.freeze([
  'GATE_PROPOSAL',
  'GATE_CONTRACT',
  'GATE_CIOT',
  'GATE_FISCAL',
  'GATE_PRE_BOARDING',
  'GATE_RELEASE',
  'GATE_IN_TRANSIT',
  'GATE_COMPLETION'
]);

const GATE_LABELS = Object.freeze({
  GATE_PROPOSAL: 'Proposta',
  GATE_CONTRACT: 'Contratação',
  GATE_CIOT: 'CIOT',
  GATE_FISCAL: 'Fiscal',
  GATE_PRE_BOARDING: 'Pré-embarque',
  GATE_RELEASE: 'Liberação',
  GATE_IN_TRANSIT: 'Em trânsito',
  GATE_COMPLETION: 'Conclusão'
});

export const COMPLIANCE_GATE_OPTIONS = Object.freeze([
  { value: '', label: 'Todos' },
  ...COMPLIANCE_GATES.map((value) => ({ value, label: GATE_LABELS[value] }))
]);

export function gateLabel(gate) {
  const key = String(gate || '').trim();
  return GATE_LABELS[key] || key || '-';
}

// ---------------------------------------------------------------------------
// Domínio regulatório da regra TR-* (catálogo).
// ---------------------------------------------------------------------------

const REGULATORY_DOMAINS = Object.freeze([
  'RNTRC', 'PMF', 'CIOT', 'PAY', 'VPO', 'NFE', 'CTE', 'MDFE', 'SEG', 'PGR', 'COMP'
]);

const REGULATORY_DOMAIN_LABELS = Object.freeze({
  RNTRC: 'RNTRC',
  PMF: 'Piso mínimo de frete',
  CIOT: 'CIOT',
  PAY: 'Pagamento',
  VPO: 'VPO — Vale-Pedágio Obrigatório',
  NFE: 'NF-e',
  CTE: 'CT-e',
  MDFE: 'MDF-e',
  SEG: 'Seguros',
  PGR: 'PGR',
  COMP: 'Conjunto / liberação'
});

export const REGULATORY_DOMAIN_OPTIONS = Object.freeze([
  { value: '', label: 'Todos' },
  ...REGULATORY_DOMAINS.map((value) => ({ value, label: REGULATORY_DOMAIN_LABELS[value] }))
]);

export function regulatoryDomainLabel(domain) {
  const key = String(domain || '').trim();
  return REGULATORY_DOMAIN_LABELS[key] || key || '-';
}

// ---------------------------------------------------------------------------
// Estado de implementação da VERSÃO da regra (janela de vigência resolvida).
// ---------------------------------------------------------------------------

const IMPLEMENTATION_STATE_LABELS = Object.freeze({
  DRAFT: 'Rascunho',
  UNDER_REVIEW: 'Em revisão',
  ACTIVE: 'Vigente',
  FUTURE: 'Futura',
  SUPERSEDED: 'Substituída',
  REVOKED: 'Revogada',
  AWAITING_REGULATION: 'Aguardando regulamentação'
});

export const IMPLEMENTATION_STATE_OPTIONS = Object.freeze([
  { value: '', label: 'Todos' },
  ...Object.keys(IMPLEMENTATION_STATE_LABELS).map((value) => ({
    value,
    label: IMPLEMENTATION_STATE_LABELS[value]
  }))
]);

export function implementationStateLabel(state) {
  const key = String(state || '').trim();
  return IMPLEMENTATION_STATE_LABELS[key] || key || '-';
}

// ---------------------------------------------------------------------------
// Comandos da máquina de estados com ROTA HTTP nesta Fase A (as demais —
// request_ciot/confirm_ciot/confirm_fiscal/release/start_transit/
// request_completion/complete/approve_validation/reject_validation — seguem
// declaradas em transport-state-machine.ts mas sem rota; approve/reject
// acontecem DENTRO de submeter-validacao, não são comandos standalone).
// ---------------------------------------------------------------------------

const ROUTED_COMMAND_LABELS = Object.freeze({
  submit_validation: 'Submeter validação',
  contract: 'Contratar',
  reopen: 'Reabrir',
  cancel: 'Cancelar'
});

const ROUTED_COMMAND_ICONS = Object.freeze({
  submit_validation: 'mdi-clipboard-check-outline',
  contract: 'mdi-file-sign',
  reopen: 'mdi-lock-open-variant-outline',
  cancel: 'mdi-cancel'
});

export function isRoutedCommand(command) {
  return Object.prototype.hasOwnProperty.call(ROUTED_COMMAND_LABELS, String(command || ''));
}

export function commandLabel(command) {
  const key = String(command || '').trim();
  return ROUTED_COMMAND_LABELS[key] || key || '-';
}

export function commandIcon(command) {
  const key = String(command || '').trim();
  return ROUTED_COMMAND_ICONS[key] || 'mdi-flash-outline';
}

/** Comandos ROTEADOS presentes em `availableCommands`, na ordem de exibição fixa. */
export function routedAvailableCommands(availableCommands) {
  const set = new Set(Array.isArray(availableCommands) ? availableCommands : []);
  return Object.keys(ROUTED_COMMAND_LABELS).filter((command) => set.has(command));
}

// ---------------------------------------------------------------------------
// Regime de carga e frete decomposto.
// ---------------------------------------------------------------------------

const CARGO_REGIME_LABELS = Object.freeze({
  lotacao: 'Lotação',
  fracionada: 'Fracionada',
  unknown: 'Não informado'
});

export function cargoRegimeLabel(regime) {
  const key = String(regime || '').trim();
  return CARGO_REGIME_LABELS[key] || 'Não informado';
}

/** Ordem/rótulos fixos do grid "Frete" — VPO nunca é somado ao frete (DL-103). */
export const FREIGHT_COMPONENTS = Object.freeze([
  { key: 'offeredAmount', label: 'Frete ofertado' },
  { key: 'contractedAmount', label: 'Frete contratado' },
  { key: 'floorAmount', label: 'Piso mínimo' },
  { key: 'tollAmount', label: 'Pedágio' },
  { key: 'vpoAmount', label: 'VPO (Vale-Pedágio Obrigatório)' },
  { key: 'otherComponentsAmount', label: 'Outros componentes' },
  { key: 'totalContractValue', label: 'Valor total do contrato' }
]);

// ---------------------------------------------------------------------------
// Formatação.
// ---------------------------------------------------------------------------

/** `null`/`undefined` vira '-' — nunca "R$ NaN" nem "R$ null" na tela. */
export function formatCurrencyBRL(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numeric);
}

/**
 * Data (sem hora) `YYYY-MM-DD` → `DD/MM/YYYY`. Parse MANUAL (sem `new Date`):
 * `vigenteEm`/`effectiveFrom` são datas puras — `new Date('2026-08-13')` as lê
 * como meia-noite UTC e o `toLocaleString` num fuso negativo (Brasil) devolve
 * o dia ANTERIOR. Regex evita o bug de fuso inteiramente.
 */
export function formatDateBR(value) {
  const raw = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return raw || '-';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** Timestamp ISO completo (`createdAt`/`evaluatedAt`) → data+hora pt-BR local. */
export function formatDateTimeBR(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

// ---------------------------------------------------------------------------
// PR-H2 (frontend completo) — helpers dos cadastros/CIOT/VPO/fiscal/piso/
// seguros/emissão/Regulatory Watch. Rótulos de STATUS continuam vindo do
// status-map.js (badge); o que vive aqui é vocabulário auxiliar que o
// status-map não cobre: enums de cadastro, mapeamento de evento → texto de
// timeline e regras de exibição de ação por estado (o que cada tela usa para
// decidir QUAL botão mostrar).
// ---------------------------------------------------------------------------

export function rntrcStatusLabel(status) {
  return resolveStatusLabel('rntrc-status', status);
}

export function rntrcVerificationRequestedStatusLabel(status) {
  return resolveStatusLabel('rntrc-verification', status);
}

const RNTRC_STRATEGY_LABELS = Object.freeze({
  open_data: 'Dados abertos (ANTT)',
  manual: 'Declaração manual',
  antt: 'Consulta credenciada (ANTT)'
});

export function rntrcStrategyLabel(strategy) {
  const key = String(strategy || '').trim();
  return RNTRC_STRATEGY_LABELS[key] || key || '-';
}

const RNTRC_CATEGORY_LABELS = Object.freeze({ TAC: 'TAC', ETC: 'ETC', CTC: 'CTC' });

export function rntrcCategoryLabel(category) {
  const key = String(category || '').trim();
  return RNTRC_CATEGORY_LABELS[key] || '-';
}

const RNTRC_RESULT_STATUS_LABELS = Object.freeze({
  active: 'Ativo',
  suspended: 'Suspenso',
  cancelled: 'Cancelado',
  expired: 'Vencido',
  not_found: 'Não encontrado',
  unknown: 'Desconhecido'
});

export function rntrcResultStatusLabel(status) {
  const key = String(status || '').trim();
  return RNTRC_RESULT_STATUS_LABELS[key] || '-';
}

// ---------------------------------------------------------------------------
// Cadastros — transportador/veículo (papéis, tipos, vínculos).
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPE_OPTIONS = Object.freeze([
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'CPF', label: 'CPF' }
]);

const PARTY_ROLE_LABELS = Object.freeze({
  contractor: 'Contratante',
  shipper: 'Embarcador',
  carrier: 'Transportador',
  subcontractor: 'Subcontratado',
  consignee: 'Destinatário',
  driver: 'Motorista'
});

export const PARTY_ROLE_OPTIONS = Object.freeze([
  { value: '', label: 'Todos' },
  ...Object.keys(PARTY_ROLE_LABELS).map((value) => ({ value, label: PARTY_ROLE_LABELS[value] }))
]);

export function partyRoleLabel(role) {
  const key = String(role || '').trim();
  return PARTY_ROLE_LABELS[key] || key || '-';
}

const VEHICLE_TYPE_LABELS = Object.freeze({
  tractor: 'Cavalo mecânico',
  truck: 'Caminhão',
  semi_trailer: 'Semirreboque',
  trailer: 'Reboque',
  other: 'Outro'
});

export const VEHICLE_TYPE_OPTIONS = Object.freeze([
  { value: '', label: 'Todos' },
  ...Object.keys(VEHICLE_TYPE_LABELS).map((value) => ({ value, label: VEHICLE_TYPE_LABELS[value] }))
]);

export function vehicleTypeLabel(type) {
  const key = String(type || '').trim();
  return VEHICLE_TYPE_LABELS[key] || key || '-';
}

const VEHICLE_LINK_TYPE_LABELS = Object.freeze({
  owned: 'Próprio',
  leased: 'Locado',
  aggregated: 'Agregado',
  rntrc_fleet: 'Frota RNTRC declarada'
});

export const VEHICLE_LINK_TYPE_OPTIONS = Object.freeze(
  Object.keys(VEHICLE_LINK_TYPE_LABELS).map((value) => ({ value, label: VEHICLE_LINK_TYPE_LABELS[value] }))
);

export function vehicleLinkTypeLabel(type) {
  const key = String(type || '').trim();
  return VEHICLE_LINK_TYPE_LABELS[key] || key || '-';
}

const VEHICLE_POSITION_LABELS = Object.freeze({
  traction: 'Tração',
  towed_1: 'Reboque 1',
  towed_2: 'Reboque 2'
});

export function vehiclePositionLabel(position) {
  const key = String(position || '').trim();
  return VEHICLE_POSITION_LABELS[key] || key || '-';
}

// ---------------------------------------------------------------------------
// CIOT — status/eventos/papel responsável.
// ---------------------------------------------------------------------------

export function ciotStatusLabel(status) {
  return resolveStatusLabel('ciot', status);
}

const CIOT_RESPONSIBLE_PARTY_LABELS = Object.freeze({
  contractor: 'Contratante',
  subcontractor: 'Subcontratado'
});

export function ciotResponsiblePartyLabel(role) {
  const key = String(role || '').trim();
  return CIOT_RESPONSIBLE_PARTY_LABELS[key] || key || '-';
}

const CIOT_EVENT_LABELS = Object.freeze({
  pre_validated: 'Pré-validado',
  request_dispatched: 'Solicitação enviada ao provedor',
  request_confirmed: 'Solicitação confirmada',
  request_unconfirmed: 'Solicitação sem confirmação',
  registered: 'CIOT registrado',
  rectify_requested: 'Retificação solicitada',
  rectified: 'CIOT retificado',
  cancel_requested: 'Cancelamento solicitado',
  cancelled: 'CIOT cancelado',
  close_requested: 'Encerramento solicitado',
  closed: 'CIOT encerrado',
  rejected: 'Rejeitado pelo provedor',
  blocked: 'Bloqueado',
  reconciled: 'Reconciliado'
});

export function ciotEventLabel(eventType) {
  const key = String(eventType || '').trim();
  return CIOT_EVENT_LABELS[key] || humanizeUnknown(eventType);
}

/**
 * Qual botão do ciclo do CIOT mostrar a partir do status ATUAL — a máquina
 * "de fato" vive no backend (transport-state-machine + ciot_operations); esta
 * função só traduz o status corrente na AÇÃO seguinte válida na UI, para não
 * duplicar a regra em cada tela que precisa decidir o botão.
 */
export function ciotAvailableAction(ciotStatus) {
  const key = String(ciotStatus || '').trim();
  if (!key) return 'solicitar';
  if (key === 'registered' || key === 'rectified') return 'gerenciar'; // retificar/cancelar/encerrar
  if (key === 'rejected' || key === 'cancelled' || key === 'blocked') return 'solicitar'; // nova tentativa
  return null; // requested/request_unconfirmed/closed: aguardando ou terminal
}

// ---------------------------------------------------------------------------
// VPO — status/eventos/aplicabilidade/evidência.
// ---------------------------------------------------------------------------

export function vpoAllocationStatusLabel(status) {
  return resolveStatusLabel('vpo-allocation', status);
}

/** `applicable` é tri-state: true/false/null (indeterminado — exige análise humana). */
export function vpoApplicableLabel(applicable) {
  if (applicable === true) return 'Devido';
  if (applicable === false) return 'Dispensado';
  return 'Indeterminado';
}

export function vpoApplicableTone(applicable) {
  if (applicable === true) return 'warning';
  if (applicable === false) return 'neutral';
  return 'neutral';
}

const VPO_EVENT_LABELS = Object.freeze({
  applicability_evaluated: 'Aplicabilidade avaliada',
  acquisition_requested: 'Aquisição solicitada',
  acquisition_unconfirmed: 'Aquisição sem confirmação',
  reconciled: 'Reconciliado',
  acquired: 'VPO adquirido',
  acquisition_failed: 'Falha na aquisição',
  cancelled: 'Cancelado',
  evidence_attached: 'Evidência anexada'
});

export function vpoEventLabel(eventType) {
  const key = String(eventType || '').trim();
  return VPO_EVENT_LABELS[key] || humanizeUnknown(eventType);
}

const VPO_EVIDENCE_SOURCE_LABELS = Object.freeze({
  manual: 'Declaração manual',
  provider: 'Fornecedora (provedor)',
  mock: 'Simulado (sandbox)'
});

export function vpoEvidenceSourceLabel(source) {
  const key = String(source || '').trim();
  return VPO_EVIDENCE_SOURCE_LABELS[key] || '-';
}

/** Qual ação do VPO mostrar a partir do status ATUAL da alocação. */
export function vpoAvailableAction(allocationStatus) {
  const key = String(allocationStatus || '').trim();
  if (!key || key === 'pending') return 'avaliar';
  if (key === 'applicable') return 'adquirir';
  return null; // not_applicable/acquisition_requested/acquisition_unconfirmed/acquired/cancelled
}

// ---------------------------------------------------------------------------
// Documentos fiscais (DF-e) — tipo, validação, autorização, issues.
// ---------------------------------------------------------------------------

const FISCAL_DOCUMENT_TYPE_LABELS = Object.freeze({ NFE: 'NF-e', CTE: 'CT-e', MDFE: 'MDF-e' });

export const FISCAL_DOCUMENT_TYPE_OPTIONS = Object.freeze(
  Object.keys(FISCAL_DOCUMENT_TYPE_LABELS).map((value) => ({ value, label: FISCAL_DOCUMENT_TYPE_LABELS[value] }))
);

export function fiscalDocumentTypeLabel(type) {
  const key = String(type || '').trim();
  return FISCAL_DOCUMENT_TYPE_LABELS[key] || key || '-';
}

export function fiscalValidationStatusLabel(status) {
  return resolveStatusLabel('fiscal-validation', status);
}

export function fiscalAuthorizationStatusLabel(status) {
  return resolveStatusLabel('fiscal-authorization', status);
}

export function fiscalIssueTone(severity) {
  return String(severity || '').trim().toLowerCase() === 'error' ? 'error' : 'warning';
}

// ---------------------------------------------------------------------------
// Emissão de DF-e (sandbox-ready) — status/eventos.
// ---------------------------------------------------------------------------

export function dfeIssuanceStatusLabel(status) {
  return resolveStatusLabel('dfe-issuance', status);
}

const DFE_ISSUANCE_EVENT_LABELS = Object.freeze({
  created: 'Emissão criada',
  built: 'Documento construído',
  signed: 'Documento assinado',
  submitted: 'Enviado à SEFAZ (sandbox)',
  submit_unconfirmed: 'Envio sem confirmação',
  authorized: 'Autorizado',
  rejected: 'Rejeitado',
  failed: 'Falhou',
  cancelled: 'Cancelado',
  reconciled: 'Reconciliado',
  imported_to_registry: 'Importado ao acervo fiscal'
});

export function dfeIssuanceEventLabel(eventType) {
  const key = String(eventType || '').trim();
  return DFE_ISSUANCE_EVENT_LABELS[key] || humanizeUnknown(eventType);
}

/** Terminal = não aceita mais `cancelar`/reprocessamento nesta emissão. */
const DFE_ISSUANCE_TERMINAL_STATUSES = Object.freeze(['authorized', 'rejected', 'failed_validation', 'cancelled']);

export function isDfeIssuanceTerminal(status) {
  return DFE_ISSUANCE_TERMINAL_STATUSES.includes(String(status || '').trim());
}

/** Código do problema 409 quando `DFE_ISSUANCE_MODE=off` (default) — mensagem fixa e clara. */
export const DFE_ISSUANCE_FEATURE_DISABLED_CODE = 'DFE_ISSUANCE_FEATURE_DISABLED';

export const DFE_ISSUANCE_FEATURE_DISABLED_MESSAGE =
  'Emissão de DF-e está desligada nesta instalação (DFE_ISSUANCE_MODE=off) — pendência conhecida do programa, sem previsão de habilitação nesta fase.';

// ---------------------------------------------------------------------------
// Piso mínimo de frete — outcome do cálculo (MODO SHADOW).
// ---------------------------------------------------------------------------

const PISO_OUTCOME_LABELS = Object.freeze({
  calculated: 'Calculado',
  not_applicable: 'Não aplicável (regime não exige piso)',
  missing_coefficients: 'Sem tabela vigente para os insumos informados',
  missing_inputs: 'Insumos insuficientes para o cálculo'
});

export function pisoOutcomeLabel(outcome) {
  const key = String(outcome || '').trim();
  return PISO_OUTCOME_LABELS[key] || key || '-';
}

/** Badge de conformidade do piso — `compliant` é tri-state (true/false/null). */
export function pisoComplianceBadge(compliant) {
  if (compliant === true) return { label: 'Conforme com o piso', tone: 'success' };
  if (compliant === false) return { label: 'Abaixo do piso', tone: 'error' };
  return { label: 'Não avaliável', tone: 'neutral' };
}

export function pisoTabelaReviewStatusLabel(status) {
  return resolveStatusLabel('piso-tabela-review', status);
}

const PISO_TABLE_CODE_LABELS = Object.freeze({ A: 'Tabela A', B: 'Tabela B', C: 'Tabela C', D: 'Tabela D' });

export function pisoTableCodeLabel(code) {
  const key = String(code || '').trim();
  return PISO_TABLE_CODE_LABELS[key] || key || '-';
}

// ---------------------------------------------------------------------------
// Seguros (apólices/PGR) — tipo de apólice, vigência derivada.
// ---------------------------------------------------------------------------

const POLICY_TYPE_LABELS = Object.freeze({ RCTR_C: 'RCTR-C', RC_DC: 'RC-DC', RC_V: 'RC-V' });

export const POLICY_TYPE_OPTIONS = Object.freeze([
  { value: '', label: 'Todos' },
  ...Object.keys(POLICY_TYPE_LABELS).map((value) => ({ value, label: POLICY_TYPE_LABELS[value] }))
]);

export function policyTypeLabel(type) {
  const key = String(type || '').trim();
  return POLICY_TYPE_LABELS[key] || key || '-';
}

export function policyStatusLabel(status) {
  return resolveStatusLabel('insurance-policy', status);
}

export function pgrStatusLabel(status) {
  return resolveStatusLabel('pgr-status', status);
}

/**
 * Vigência DERIVADA da apólice contra `daysToExpiry` (campo já calculado pelo
 * backend contra HOJE) — dimensão INDEPENDENTE do status administrativo
 * (`insurance-policy` no status-map): uma apólice `active` pode estar
 * `expired` na prática se ninguém a marcou `expired_marked`. Módulo PURO —
 * só olha os números, nunca chama `new Date()`.
 *
 * @param {{ status?: string, daysToExpiry?: number }} policy
 * @param {number} warningWindowDays janela de "vencendo" (default 30, espelha windowDays da API)
 */
export function resolveInsuranceExpiryState(policy, warningWindowDays = 30) {
  const status = String(policy?.status || '').trim();
  const days = Number(policy?.daysToExpiry);

  if (status === 'cancelled') return { state: 'cancelled', tone: 'neutral', label: 'Cancelada' };
  if (status === 'expired_marked') return { state: 'expired', tone: 'error', label: 'Vencida' };
  if (!Number.isFinite(days)) return { state: 'unknown', tone: 'neutral', label: 'Vigência desconhecida' };
  if (days < 0) return { state: 'expired', tone: 'error', label: `Vencida há ${Math.abs(days)} dia(s)` };
  if (days <= warningWindowDays) return { state: 'expiring', tone: 'warning', label: `Vence em ${days} dia(s)` };
  return { state: 'valid', tone: 'success', label: `Vence em ${days} dia(s)` };
}

/**
 * Situação da apólice para o BADGE da visão consolidada (onda F7,
 * REQ-SICAT-0037): `{status, label, detail, tone}` com `status` no vocabulário
 * do domínio `insurance-policy` do status-map (vigente/vencendo/vencida).
 *
 * DELEGA a `resolveInsuranceExpiryState` de propósito — a decisão da janela de
 * 30 dias tem de existir UMA vez só; o que muda aqui é a APRESENTAÇÃO: o
 * detalhe do transportador mostra a contagem regressiva ("Vence em 12 dia(s)"),
 * a tabela consolidada mostra o rótulo curto no badge e guarda a contagem em
 * `detail` (tooltip/coluna de vigência). PURO: nunca chama `new Date()` — usa
 * o `daysToExpiry` que o backend já calculou contra HOJE.
 *
 * @param {{ status?: string, daysToExpiry?: number }} policy
 * @param {number} [warningWindowDays] janela de "vencendo" (default 30, espelha `windowDays` da API)
 */
export function resolveInsurancePolicyStatus(policy, warningWindowDays = 30) {
  const { state, tone, label } = resolveInsuranceExpiryState(policy, warningWindowDays);
  return {
    status: state,
    label: resolveStatusLabel('insurance-policy', state),
    detail: label,
    tone
  };
}

// ---------------------------------------------------------------------------
// Averbação eletrônica (onda F7, REQ-SICAT-0034) e apuração mensal (onda F8,
// REQ-SICAT-0035). Os rótulos de STATUS vêm dos domínios `averbacao` e
// `apuracao-periodo` do status-map; o que vive aqui é o vocabulário auxiliar
// (eventos da trilha, base de cobrança) e a ARITMÉTICA de estimativa do prêmio.
// ---------------------------------------------------------------------------

export function averbacaoStatusLabel(status) {
  return resolveStatusLabel('averbacao', status);
}

/**
 * Averbações que ainda pedem acompanhamento: em voo (`declaring`) ou com
 * desfecho DESCONHECIDO (`*_unconfirmed`). É o recorte que a home do
 * Transportador usa no card "o que precisa da sua atenção" — `rectifying`/
 * `cancelling` ficam de fora porque são mutações de uma averbação que JÁ está
 * registrada (não há viagem descoberta enquanto elas rodam).
 */
export const AVERBACAO_PENDING_STATUSES = Object.freeze([
  'declaring',
  'declare_unconfirmed',
  'rectify_unconfirmed',
  'cancel_unconfirmed'
]);

/** Terminal = a declaração não aceita mais retificar/cancelar. */
const AVERBACAO_TERMINAL_STATUSES = Object.freeze(['cancelled', 'rejected']);

export function isAverbacaoTerminal(status) {
  return AVERBACAO_TERMINAL_STATUSES.includes(String(status || '').trim());
}

/**
 * Só averbação em `declared` aceita retificar/cancelar (o contrato responde
 * `409 TRANSPORTE_AVERBACAO_MUTATION_NOT_ALLOWED` fora disso) — a UI esconde o
 * botão em vez de deixar o operador colecionar 409.
 */
export function averbacaoAcceptsMutation(status) {
  return String(status || '').trim() === 'declared';
}

/** Averbação "viva" ocupa a chave operação×apólice — nova averbação só depois do terminal. */
export function isAverbacaoLive(status) {
  const key = String(status || '').trim();
  return Boolean(key) && !isAverbacaoTerminal(key);
}

export const AVERBACAO_STATUS_OPTIONS = Object.freeze([
  { value: '', label: 'Todos' },
  ...[
    'declaring',
    'declared',
    'declare_unconfirmed',
    'rectifying',
    'rectify_unconfirmed',
    'cancelling',
    'cancel_unconfirmed',
    'cancelled',
    'rejected'
  ].map((value) => ({ value, label: resolveStatusLabel('averbacao', value) }))
]);

const AVERBACAO_EVENT_LABELS = Object.freeze({
  declare_requested: 'Averbação solicitada',
  declared: 'Averbada na seguradora',
  declare_unconfirmed: 'Averbação sem confirmação',
  rectify_requested: 'Retificação solicitada',
  rectified: 'Averbação retificada',
  cancel_requested: 'Cancelamento solicitado',
  cancelled: 'Averbação cancelada',
  rejected: 'Rejeitada pela seguradora',
  reconciled: 'Reconciliada'
});

export function averbacaoEventLabel(eventType) {
  const key = String(eventType || '').trim();
  return AVERBACAO_EVENT_LABELS[key] || humanizeUnknown(eventType);
}

/**
 * Prêmio ESTIMADO de uma averbação — `valor da carga × taxa% ÷ 100`, arredondado
 * a centavos em half-up. Caso de ouro do circuito: R$ 25.000,00 × 0,097% =
 * R$ 24,25.
 *
 * É ESTIMATIVA de UI, para o operador ver quanto vai custar ANTES de confirmar
 * o "Averbar": o valor que vale é o que o motor `insurance-premium-engine.ts`
 * CONGELA no ato (mesma aritmética, mas em centavos inteiros no backend). Por
 * isso a função devolve `null` — nunca 0 nem NaN — quando falta insumo: um
 * "R$ 0,00" na confirmação seria lido como "averbar é de graça".
 *
 * `ratePercent` é o PERCENTUAL LITERAL do contrato (0,097% chega como `0.097`);
 * dividir por 100 é responsabilidade desta função, não de quem chama.
 *
 * @param {number} cargoAmount valor declarado da carga em reais
 * @param {number} ratePercent taxa percentual literal
 * @returns {number|null} prêmio em reais com 2 casas, ou null sem insumo válido
 */
export function estimateDeclarationPremium(cargoAmount, ratePercent) {
  // `null`/`undefined`/'' são AUSÊNCIA de insumo, não zero — e `Number(null)`
  // é 0, então sem esta guarda "carga não informada" viraria "prêmio R$ 0,00".
  if (cargoAmount === null || cargoAmount === undefined || cargoAmount === '') return null;
  if (ratePercent === null || ratePercent === undefined || ratePercent === '') return null;
  const amount = Number(cargoAmount);
  const rate = Number(ratePercent);
  if (!Number.isFinite(amount) || !Number.isFinite(rate)) return null;
  if (amount < 0 || rate < 0) return null;
  // O `Number.EPSILON` corrige o caso clássico do binário (ex.: 1.005 guardado
  // como 1.00499...) para o half-up não virar half-down por um bit.
  const raw = (amount * rate) / 100;
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

const BILLING_BASIS_LABELS = Object.freeze({
  premium: 'Soma dos prêmios averbados',
  minimum: 'Custo mínimo mensal da apólice'
});

export function billingBasisLabel(basis) {
  const key = String(basis || '').trim();
  return BILLING_BASIS_LABELS[key] || '-';
}

export function apuracaoPeriodoStatusLabel(status) {
  return resolveStatusLabel('apuracao-periodo', status);
}

const APURACAO_RUN_TRIGGER_LABELS = Object.freeze({
  sweep: 'Varredura automática (fechamento do mês)',
  manual: 'Ação manual do operador',
  recompute: 'Recálculo'
});

export function apuracaoRunTriggerLabel(trigger) {
  const key = String(trigger || '').trim();
  return APURACAO_RUN_TRIGGER_LABELS[key] || humanizeUnknown(trigger);
}

/**
 * Taxa percentual para leitura humana: `0.097` → `0,097%`. Sem casas fixas —
 * a taxa do circuito tem 3 decimais (0,097%) mas o contrato aceita mais, e
 * cortar dígitos aqui esconderia a taxa realmente aplicada.
 */
export function formatRatePercent(value) {
  // Mesma guarda do `formatCurrencyBRL`: apólice SEM taxa cadastrada tem
  // `ratePercent` nulo, e `Number(null)` é 0 — sem isto a tela mostraria uma
  // taxa de "0%" onde não existe taxa nenhuma.
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${numeric.toLocaleString('pt-BR', { maximumFractionDigits: 6 })}%`;
}

/**
 * Mês `YYYY-MM` → `mm/yyyy`. Parse MANUAL (sem `new Date`) pelo mesmo racional
 * anti-fuso do `formatDateBR`: `new Date('2026-08')` é meia-noite UTC e num
 * fuso negativo cairia em julho.
 */
export function formatPeriodMonthBR(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return String(value || '-');
  return `${match[2]}/${match[1]}`;
}

/**
 * Últimos `count` meses (mais recente primeiro) a partir de um `YYYY-MM` de
 * referência — o seletor da tela de Apuração. PURO: a referência é sempre
 * passada por quem chama (a tela resolve "hoje" uma vez, no `onMounted`).
 */
export function buildRecentPeriodOptions(referenceMonth, count = 12) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(referenceMonth || '').trim());
  if (!match) return [];
  let year = Number(match[1]);
  let month = Number(match[2]);
  const options = [];
  for (let index = 0; index < count; index += 1) {
    const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
    options.push({ value, label: formatPeriodMonthBR(value) });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// Motoristas (onda F6, REQ-SICAT-0033/0037) — CNH declarada e vínculo
// frota/agregado. Rótulos de vigência da CNH vivem no domínio `driver-cnh`
// do status-map; o que vive aqui é o vocabulário do cadastro e o helper PURO
// que DECIDE a vigência (a decisão é do frontend: o contrato só dá a data).
// ---------------------------------------------------------------------------

/** Enum `cnhCategory` do contrato (TransporteMotoristaResource) — nunca inventar categoria. */
export const CNH_CATEGORY_OPTIONS = Object.freeze(
  ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'].map((value) => ({ value, label: value }))
);

const DRIVER_STATUS_LABELS = Object.freeze({
  active: 'Ativo',
  inactive: 'Inativo'
});

export const DRIVER_STATUS_OPTIONS = Object.freeze([
  { value: '', label: 'Todos' },
  ...Object.keys(DRIVER_STATUS_LABELS).map((value) => ({ value, label: DRIVER_STATUS_LABELS[value] }))
]);

export function driverStatusLabel(status) {
  const key = String(status || '').trim();
  return DRIVER_STATUS_LABELS[key] || key || '-';
}

// `linkType` do vínculo motorista↔transportador — enum PRÓPRIO do contrato
// (`fleet`/`aggregated`), NÃO reaproveitar VEHICLE_LINK_TYPE_LABELS (domínio
// diferente: lá o vínculo é do veículo, com owned/leased/rntrc_fleet).
const DRIVER_LINK_TYPE_LABELS = Object.freeze({
  fleet: 'Frota',
  aggregated: 'Agregado'
});

export const DRIVER_LINK_TYPE_OPTIONS = Object.freeze(
  Object.keys(DRIVER_LINK_TYPE_LABELS).map((value) => ({ value, label: DRIVER_LINK_TYPE_LABELS[value] }))
);

export function driverLinkTypeLabel(type) {
  const key = String(type || '').trim();
  return DRIVER_LINK_TYPE_LABELS[key] || key || '-';
}

const DRIVER_LINK_STATUS_LABELS = Object.freeze({
  active: 'Vigente',
  ended: 'Encerrado'
});

export function driverLinkStatusLabel(status) {
  const key = String(status || '').trim();
  return DRIVER_LINK_STATUS_LABELS[key] || key || '-';
}

/** Parse MANUAL de data pura `YYYY-MM-DD` → epoch UTC (mesmo racional anti-fuso do formatDateBR). */
function parseIsoDateOnlyUtc(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim());
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Vigência DERIVADA da CNH do motorista — decisão do FRONTEND (o contrato só
 * entrega `cnhValidUntil`; CNH vencida é aceita no cadastro e alimenta
 * alertas/GR). Devolve `{status, label}` para o badge com domain `driver-cnh`
 * (lib/status-map.js): `valid` → success, `expiring` (≤ 30 dias) → warning,
 * `expired` → error, `unknown` (sem data) → neutral.
 *
 * PURO quando `referenceDate` é passada (testes); sem ela usa a data LOCAL de
 * hoje — datas comparadas sempre como dia-calendário em UTC para o fuso nunca
 * mudar o dia (mesmo bug que o formatDateBR evita).
 *
 * @param {string|null|undefined} cnhValidUntil data `YYYY-MM-DD` do contrato
 * @param {string} [referenceDate] data `YYYY-MM-DD` de referência (default: hoje)
 * @param {number} [warningWindowDays] janela de "vencendo" (default 30)
 */
export function resolveDriverCnhStatus(cnhValidUntil, referenceDate, warningWindowDays = 30) {
  const target = parseIsoDateOnlyUtc(cnhValidUntil);
  if (target === null) return { status: 'unknown', label: 'Sem validade informada' };

  let reference = parseIsoDateOnlyUtc(referenceDate);
  if (reference === null) {
    const now = new Date();
    reference = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const days = Math.round((target - reference) / 86400000);
  if (days < 0) return { status: 'expired', label: `Vencida há ${Math.abs(days)} dia(s)` };
  if (days === 0) return { status: 'expiring', label: 'Vence hoje' };
  if (days <= warningWindowDays) return { status: 'expiring', label: `Vence em ${days} dia(s)` };
  return { status: 'valid', label: 'Válida' };
}

// ---------------------------------------------------------------------------
// Regulatory Watch — status/eventos/decisão de revisão.
// ---------------------------------------------------------------------------

export function watchItemStatusLabel(status) {
  return resolveStatusLabel('watch-item', status);
}

const WATCH_EVENT_LABELS = Object.freeze({
  detected: 'Mudança detectada',
  ingested: 'Conteúdo capturado',
  ai_analyzed: 'Analisado por IA',
  ai_skipped: 'Análise de IA pulada',
  human_review: 'Enviado para revisão humana',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  tested: 'Testado',
  scheduled: 'Agendado',
  active_applied: 'Aplicado ao catálogo',
  check_run_no_change: 'Varredura sem mudança'
});

export function watchEventLabel(eventType) {
  const key = String(eventType || '').trim();
  return WATCH_EVENT_LABELS[key] || humanizeUnknown(eventType);
}

/** Só itens em `human_review` aceitam a ação "revisar" (aprovar/rejeitar). */
export function watchItemIsReviewable(status) {
  return String(status || '').trim() === 'human_review';
}

/** Só itens `approved` aceitam a ação "aplicar" (cria versão de regra). */
export function watchItemIsApplicable(status) {
  return String(status || '').trim() === 'approved';
}

// ---------------------------------------------------------------------------
// Fallback humanizador local (mesmo espírito de `humanizeFallback` do
// status-map.js, mas para vocabulário que não é "status de domínio" — ex.:
// tipo de evento de uma trilha append-only).
// ---------------------------------------------------------------------------

function humanizeUnknown(value) {
  const key = String(value || '').trim();
  if (!key) return '-';
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)([a-zà-ÿ])/g, (_, prefix, char) => `${prefix}${char.toUpperCase()}`);
}
