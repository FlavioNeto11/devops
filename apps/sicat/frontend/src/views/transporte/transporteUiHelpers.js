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
