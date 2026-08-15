/**
 * Máquina de estados do agregado `TransportOperation` (PR-A4, DL-103).
 *
 * Módulo PURO — nenhuma chamada a banco/HTTP/gateway (o repositório aplica compare-and-swap; este
 * módulo só decide se uma transição é PERMITIDA). Declara o grafo COMPLETO das 23 transições do
 * ciclo de vida (13 estados × 13 comandos), incluindo as fases C..F que ainda não têm rota HTTP —
 * o motor de compliance (`requiredGate`, aplicado de verdade) chega no PR-A5. Espelha
 * `docs/04-arquitetura/transporte-sicat.md §3`.
 *
 * Neste PR só a Fase A vira endpoint, e dela só as transições SEM gate: `submit_validation`
 * (draft → validating) e `cancel` (de qualquer estado não-terminal). `approve_validation`/
 * `reject_validation`/`reopen`/`contract` estão declaradas (fazem parte do grafo da Fase A), mas
 * `transport-operation-service.ts` não as expõe — a decisão de aprovar/reprovar depende do motor
 * de compliance que ainda não existe. `listAvailableCommands` por padrão só devolve fase 'A'.
 */

import { AppError } from '../problem.js';
import type { ComplianceGate } from './regulatory-types.js';

/** Os 13 estados do ciclo de vida (mesmo universo do CHECK `chk_trop_status`, migration 024). */
export const TRANSPORT_OPERATION_STATUSES = [
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
] as const;

export type TransportOperationStatus = (typeof TRANSPORT_OPERATION_STATUSES)[number];

/** Os 13 comandos que movem a máquina — nome de ação, não de estado destino. */
export const TRANSPORT_TRANSITION_COMMANDS = [
  'submit_validation',
  'approve_validation',
  'reject_validation',
  'reopen',
  'contract',
  'cancel',
  'request_ciot',
  'confirm_ciot',
  'confirm_fiscal',
  'release',
  'start_transit',
  'request_completion',
  'complete'
] as const;

export type TransportTransitionCommand = (typeof TRANSPORT_TRANSITION_COMMANDS)[number];

/**
 * Fase do programa em que a transição é operável de ponta a ponta (proposta → contrato → CIOT →
 * fiscal → liberação → viagem → conclusão). Só 'A', 'C' e 'E' têm transição declarada até este
 * PR; 'B'/'D'/'F' ficam reservadas para sub-fases futuras do mesmo grafo.
 */
export type TransportPhase = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface TransportTransition {
  readonly from: TransportOperationStatus;
  readonly to: TransportOperationStatus;
  readonly command: TransportTransitionCommand;
  /** Gate que o PR-A5 vai exigir para a transição ser aplicada; `null` = sem gate (aplica direto). */
  readonly requiredGate: ComplianceGate | null;
  readonly phase: TransportPhase;
}

/**
 * Grafo COMPLETO — 23 transições. Ordem: Fase A primeiro (proposta/contrato), depois fases C/E
 * (CIOT em diante), espelhando `docs/04-arquitetura/transporte-sicat.md §3`.
 */
export const TRANSPORT_TRANSITIONS: readonly TransportTransition[] = [
  // ---------------------------------------------------------------------------------------------
  // Fase A — proposta e contrato. SÓ `submit_validation`/`cancel` têm rota neste PR.
  // ---------------------------------------------------------------------------------------------
  { from: 'draft', to: 'validating', command: 'submit_validation', requiredGate: null, phase: 'A' },
  { from: 'validating', to: 'ready_for_contract', command: 'approve_validation', requiredGate: 'GATE_PROPOSAL', phase: 'A' },
  { from: 'validating', to: 'blocked', command: 'reject_validation', requiredGate: null, phase: 'A' },
  { from: 'blocked', to: 'draft', command: 'reopen', requiredGate: null, phase: 'A' },
  { from: 'ready_for_contract', to: 'contracted', command: 'contract', requiredGate: 'GATE_CONTRACT', phase: 'A' },
  { from: 'draft', to: 'cancelled', command: 'cancel', requiredGate: null, phase: 'A' },
  { from: 'validating', to: 'cancelled', command: 'cancel', requiredGate: null, phase: 'A' },
  { from: 'blocked', to: 'cancelled', command: 'cancel', requiredGate: null, phase: 'A' },
  { from: 'ready_for_contract', to: 'cancelled', command: 'cancel', requiredGate: null, phase: 'A' },
  { from: 'contracted', to: 'cancelled', command: 'cancel', requiredGate: null, phase: 'A' },

  // ---------------------------------------------------------------------------------------------
  // Fases C/E — CIOT, fiscal, liberação, viagem, conclusão. NENHUMA tem rota neste PR.
  // ---------------------------------------------------------------------------------------------
  { from: 'contracted', to: 'ciot_pending', command: 'request_ciot', requiredGate: 'GATE_CIOT', phase: 'C' },
  { from: 'ciot_pending', to: 'ciot_registered', command: 'confirm_ciot', requiredGate: null, phase: 'C' },
  { from: 'ciot_registered', to: 'fiscal_pending', command: 'confirm_fiscal', requiredGate: 'GATE_FISCAL', phase: 'E' },
  { from: 'fiscal_pending', to: 'ready_for_release', command: 'release', requiredGate: 'GATE_RELEASE', phase: 'C' },
  { from: 'ready_for_release', to: 'in_transit', command: 'start_transit', requiredGate: 'GATE_PRE_BOARDING', phase: 'C' },
  { from: 'in_transit', to: 'completion_pending', command: 'request_completion', requiredGate: 'GATE_IN_TRANSIT', phase: 'C' },
  { from: 'completion_pending', to: 'completed', command: 'complete', requiredGate: 'GATE_COMPLETION', phase: 'C' },
  { from: 'ciot_pending', to: 'cancelled', command: 'cancel', requiredGate: null, phase: 'C' },
  { from: 'ciot_registered', to: 'cancelled', command: 'cancel', requiredGate: null, phase: 'C' },
  { from: 'fiscal_pending', to: 'cancelled', command: 'cancel', requiredGate: null, phase: 'C' },
  { from: 'ready_for_release', to: 'cancelled', command: 'cancel', requiredGate: null, phase: 'C' },
  { from: 'in_transit', to: 'cancelled', command: 'cancel', requiredGate: null, phase: 'C' },
  { from: 'completion_pending', to: 'cancelled', command: 'cancel', requiredGate: null, phase: 'C' }
];

/** Devolve a transição (from, command) → to, ou `null` se o comando não é permitido dali. */
export function getTransition(
  from: TransportOperationStatus,
  command: TransportTransitionCommand
): TransportTransition | null {
  return TRANSPORT_TRANSITIONS.find((transition) => transition.from === from && transition.command === command) ?? null;
}

/**
 * Garante que a transição é permitida no grafo; lança 409 `TRANSPORT_INVALID_TRANSITION` quando
 * não é (comando errado para o estado, ou estado terminal). NÃO aplica gate — isso é o PR-A5.
 */
export function assertTransition(
  from: TransportOperationStatus,
  command: TransportTransitionCommand
): TransportTransition {
  const transition = getTransition(from, command);
  if (!transition) {
    throw new AppError(
      409,
      'Conflict',
      `Transição inválida: o comando "${command}" não é permitido a partir do status "${from}".`,
      { code: 'TRANSPORT_INVALID_TRANSITION', context: { from, command } }
    );
  }
  return transition;
}

/**
 * Comandos disponíveis a partir de um status, restritos às fases informadas (default: só `['A']`
 * — a única fase com rota HTTP neste PR). Usado por `getTransportOperationById`/
 * `listTransportOperations` para popular `availableCommands[]` no contrato.
 */
export function listAvailableCommands(
  from: TransportOperationStatus,
  opts: { phases?: readonly TransportPhase[] } = {}
): TransportTransitionCommand[] {
  const phases = opts.phases ?? (['A'] as const);
  return TRANSPORT_TRANSITIONS
    .filter((transition) => transition.from === from && phases.includes(transition.phase))
    .map((transition) => transition.command);
}

/** `true` quando nenhuma transição do grafo (nenhuma fase) parte deste status. */
export function isTerminalStatus(status: TransportOperationStatus): boolean {
  return !TRANSPORT_TRANSITIONS.some((transition) => transition.from === status);
}
